# TV Bot Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React + Vite / Express app that displays a fullscreen Google Photos slideshow on a Raspberry Pi TV, auto-starting on boot in kiosk mode.

**Architecture:** An Express server (port 3002) handles Google OAuth, token management, and photo fetching from the Google Photos Library REST API. It also serves the Vite-built React app as static files. On the Pi, two systemd services manage the server and Chromium kiosk independently.

**Tech Stack:** Node.js 18+, Express 4, googleapis (for OAuth2 client), React 18, Vite 5, Vitest 2, React Testing Library, supertest

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Scripts, deps |
| `vite.config.js` | Vite + Vitest config, dev proxy to Express |
| `src/test-setup.js` | jest-dom matchers for Vitest |
| `server/app.js` | Express app (exported for testing) — all routes |
| `server/index.js` | Entry point — calls `app.listen()` |
| `server/app.test.js` | Backend route tests (node environment) |
| `src/main.jsx` | React entry point |
| `src/index.css` | Global styles — fullscreen, dark bg, transitions |
| `src/ErrorScreen.jsx` | Centered error message component |
| `src/ErrorScreen.test.jsx` | ErrorScreen unit tests |
| `src/Slideshow.jsx` | Auto-advancing image slideshow with crossfade |
| `src/Slideshow.test.jsx` | Slideshow unit tests |
| `src/App.jsx` | Fetches photos, renders Slideshow or ErrorScreen, retry logic |
| `src/App.test.jsx` | App integration tests (mocked fetch) |
| `.env.example` | Template for required env vars |
| `.gitignore` | Excludes dist/, .env, tokens.json, node_modules/ |
| `docs/deployment.md` | Pi setup: OAuth, build, systemd units |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vite.config.js`
- Create: `src/test-setup.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tv-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"node server/index.js\" \"vite\"",
    "build": "vite build",
    "start": "node server/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^140.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "concurrently": "^8.2.2",
    "jsdom": "^24.1.1",
    "supertest": "^7.0.0",
    "vite": "^5.3.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
tokens.json
```

- [ ] **Step 3: Create .env.example**

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3002/auth/callback
ALBUM_NAME=My TV Album
PORT=3002
# Override for testing (set to a temp path so tests don't touch real tokens)
# TOKENS_PATH=/tmp/tv-bot-tokens.json
```

- [ ] **Step 4: Create vite.config.js**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/auth': 'http://localhost:3002',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
});
```

- [ ] **Step 5: Create src/test-setup.js**

```javascript
import '@testing-library/jest-dom';
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore .env.example vite.config.js src/test-setup.js
git commit -m "feat: project scaffold — package.json, vite config, gitignore"
```

---

## Task 2: Express App — All Backend Routes

**Files:**
- Create: `server/app.js`
- Create: `server/index.js`

- [ ] **Step 1: Create server/app.js**

```javascript
import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist');

function tokensPath() {
  return process.env.TOKENS_PATH || join(__dirname, '..', 'tokens.json');
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

function loadTokens(client) {
  const path = tokensPath();
  if (!existsSync(path)) return false;
  client.setCredentials(JSON.parse(readFileSync(path, 'utf8')));
  return true;
}

function saveTokens(tokens) {
  writeFileSync(tokensPath(), JSON.stringify(tokens, null, 2));
}

const app = express();

// Initiate OAuth flow — open this in a browser once during setup
app.get('/auth', (req, res) => {
  const client = createOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
    prompt: 'consent',
  });
  res.redirect(url);
});

// OAuth callback — Google redirects here after user grants access
app.get('/auth/callback', async (req, res) => {
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(req.query.code);
    saveTokens(tokens);
    res.send('Authentication complete. You can close this tab and restart the server.');
  } catch (err) {
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

// Return photo URLs from the configured Google Photos album
app.get('/api/photos', async (req, res) => {
  const client = createOAuthClient();
  if (!loadTokens(client)) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth to set up credentials.' });
  }

  // Persist refreshed tokens automatically
  client.on('tokens', (newTokens) => {
    const existing = existsSync(tokensPath())
      ? JSON.parse(readFileSync(tokensPath(), 'utf8'))
      : {};
    saveTokens({ ...existing, ...newTokens });
  });

  let token;
  try {
    const result = await client.getAccessToken();
    token = result.token;
  } catch {
    return res.status(401).json({ error: 'Failed to refresh access token. Re-run /auth.' });
  }

  const albumName = process.env.ALBUM_NAME;

  // Find album by name (paginated)
  let albumId = null;
  let pageToken = undefined;
  try {
    do {
      const url = new URL('https://photoslibrary.googleapis.com/v1/albums');
      url.searchParams.set('pageSize', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const albumsRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!albumsRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch albums from Google Photos.' });
      }

      const data = await albumsRes.json();
      const match = (data.albums || []).find((a) => a.title === albumName);
      if (match) { albumId = match.id; break; }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch {
    return res.status(502).json({ error: 'Network error while contacting Google Photos.' });
  }

  if (!albumId) {
    return res.json([]);
  }

  // Fetch media items from the album
  let mediaData;
  try {
    const mediaRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ albumId, pageSize: 100 }),
    });

    if (!mediaRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch photos from Google Photos.' });
    }

    mediaData = await mediaRes.json();
  } catch {
    return res.status(502).json({ error: 'Network error while fetching photos.' });
  }

  const photos = (mediaData.mediaItems || [])
    .filter((item) => item.mimeType?.startsWith('image/'))
    .map((item) => `${item.baseUrl}=w1920-h1080`);

  res.json(photos);
});

// Serve built React app; only active after `npm run build`
app.use(express.static(DIST_PATH));
app.get('*', (req, res) => {
  res.sendFile(join(DIST_PATH, 'index.html'));
});

export default app;
```

- [ ] **Step 2: Create server/index.js**

```javascript
import app from './app.js';

const port = process.env.PORT || 3002;

app.listen(port, () => {
  console.log(`TV Bot running on http://localhost:${port}`);
});
```

- [ ] **Step 3: Commit**

```bash
git add server/
git commit -m "feat: express server with Google Photos OAuth and photo endpoint"
```

---

## Task 3: Backend Tests

**Files:**
- Create: `server/app.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import app from './app.js';

const TEST_TOKENS_PATH = join(process.cwd(), 'tokens.test.json');

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3002/auth/callback';
  process.env.ALBUM_NAME = 'Test Album';
  process.env.TOKENS_PATH = TEST_TOKENS_PATH;
});

afterEach(() => {
  if (existsSync(TEST_TOKENS_PATH)) unlinkSync(TEST_TOKENS_PATH);
  vi.restoreAllMocks();
});

describe('GET /auth', () => {
  test('redirects to Google OAuth consent screen', async () => {
    const res = await request(app).get('/auth');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(res.headers.location).toContain('photoslibrary.readonly');
  });
});

describe('GET /api/photos', () => {
  test('returns 401 when tokens.json does not exist', async () => {
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Not authenticated/);
  });

  test('returns empty array when album is not found', async () => {
    writeFileSync(TEST_TOKENS_PATH, JSON.stringify({
      access_token: 'fake-token',
      refresh_token: 'fake-refresh',
      expiry_date: Date.now() + 3600000,
    }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ albums: [] }),
    }));

    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    vi.unstubAllGlobals();
  });

  test('returns photo URLs when album is found', async () => {
    writeFileSync(TEST_TOKENS_PATH, JSON.stringify({
      access_token: 'fake-token',
      refresh_token: 'fake-refresh',
      expiry_date: Date.now() + 3600000,
    }));

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          albums: [{ id: 'album-123', title: 'Test Album' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          mediaItems: [
            { baseUrl: 'https://photos.google.com/img1', mimeType: 'image/jpeg' },
            { baseUrl: 'https://photos.google.com/img2', mimeType: 'image/jpeg' },
            { baseUrl: 'https://photos.google.com/vid1', mimeType: 'video/mp4' },
          ],
        }),
      }),
    );

    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      'https://photos.google.com/img1=w1920-h1080',
      'https://photos.google.com/img2=w1920-h1080',
    ]);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (no test runner configured for node yet)**

```bash
npm test
```

Expected: tests in `server/app.test.js` run with node environment (via `// @vitest-environment node` comment), likely failing or passing partially.

- [ ] **Step 3: Fix any failures**

Common issues:
- `googleapis` trying to make real network calls during token refresh — the fake token with a future `expiry_date` should avoid this, but if `getAccessToken()` still calls out, stub it: `vi.spyOn(client, 'getAccessToken').mockResolvedValue({ token: 'fake-token' })`. Since `client` is created inside the route handler, you may need to stub `google.auth.OAuth2` instead. If tests still fail due to real network calls, add this to `beforeEach`:

```javascript
vi.spyOn(google.auth.OAuth2.prototype, 'getAccessToken')
  .mockResolvedValue({ token: 'fake-token' });
```

Import `google` at the top: `import { google } from 'googleapis';`

- [ ] **Step 4: Run tests — all should pass**

```bash
npm test
```

Expected output:
```
✓ server/app.test.js (4 tests)
  ✓ GET /auth > redirects to Google OAuth consent screen
  ✓ GET /api/photos > returns 401 when tokens.json does not exist
  ✓ GET /api/photos > returns empty array when album is not found
  ✓ GET /api/photos > returns photo URLs when album is found
```

- [ ] **Step 5: Commit**

```bash
git add server/app.test.js
git commit -m "test: backend route tests for OAuth and photo endpoint"
```

---

## Task 4: ErrorScreen Component

**Files:**
- Create: `src/ErrorScreen.jsx`
- Create: `src/ErrorScreen.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/ErrorScreen.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import ErrorScreen from './ErrorScreen';

describe('ErrorScreen', () => {
  test('renders the error message', () => {
    render(<ErrorScreen message="Network unavailable" />);
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
  });

  test('renders a different message', () => {
    render(<ErrorScreen message="No photos found in album" />);
    expect(screen.getByText('No photos found in album')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (component not yet created)**

```bash
npm test
```

Expected: `Cannot find module './ErrorScreen'`

- [ ] **Step 3: Implement ErrorScreen**

```jsx
// src/ErrorScreen.jsx
export default function ErrorScreen({ message }) {
  return (
    <div className="error-screen">
      <p>{message}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected:
```
✓ src/ErrorScreen.test.jsx (2 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/ErrorScreen.jsx src/ErrorScreen.test.jsx
git commit -m "feat: ErrorScreen component"
```

---

## Task 5: Slideshow Component

**Files:**
- Create: `src/Slideshow.jsx`
- Create: `src/Slideshow.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// src/Slideshow.test.jsx
import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Slideshow from './Slideshow';

const photos = [
  'https://example.com/photo1.jpg',
  'https://example.com/photo2.jpg',
  'https://example.com/photo3.jpg',
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Slideshow', () => {
  test('renders the first photo initially', () => {
    render(<Slideshow photos={photos} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photos[0]);
  });

  test('advances to the next photo after 10 seconds + 1s fade', async () => {
    render(<Slideshow photos={photos} />);

    await act(async () => {
      vi.advanceTimersByTime(10000); // triggers interval
      vi.advanceTimersByTime(1000);  // completes fade-out timeout
    });

    expect(screen.getByRole('img')).toHaveAttribute('src', photos[1]);
  });

  test('wraps around to first photo after the last', async () => {
    render(<Slideshow photos={photos} />);

    // Advance through all photos
    for (let i = 0; i < photos.length; i++) {
      await act(async () => {
        vi.advanceTimersByTime(10000);
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByRole('img')).toHaveAttribute('src', photos[0]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: `Cannot find module './Slideshow'`

- [ ] **Step 3: Implement Slideshow**

```jsx
// src/Slideshow.jsx
import { useState, useEffect } from 'react';

export default function Slideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  // Advance slide every 10 seconds with a 1s crossfade
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % photos.length);
        setFading(false);
      }, 1000);
    }, 10000);
    return () => clearInterval(timer);
  }, [photos.length]);

  // Preload the next image to avoid blank flashes
  useEffect(() => {
    const nextIndex = (index + 1) % photos.length;
    const img = new Image();
    img.src = photos[nextIndex];
  }, [index, photos]);

  return (
    <div className="slideshow">
      <img
        src={photos[index]}
        alt=""
        style={{ opacity: fading ? 0 : 1 }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected:
```
✓ src/Slideshow.test.jsx (3 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/Slideshow.jsx src/Slideshow.test.jsx
git commit -m "feat: Slideshow component with 10s rotation and crossfade"
```

---

## Task 6: App Component

**Files:**
- Create: `src/App.jsx`
- Create: `src/App.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// src/App.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  test('renders ErrorScreen when API returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Not authenticated. Visit /auth to set up credentials.' }),
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Not authenticated. Visit /auth to set up credentials.')).toBeInTheDocument();
    });
  });

  test('renders ErrorScreen when fetch throws (network down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Unable to reach the server. Check your connection.')).toBeInTheDocument();
    });
  });

  test('renders ErrorScreen when album has no photos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('No photos found in album')).toBeInTheDocument();
    });
  });

  test('renders Slideshow when photos are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ]),
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo1.jpg');
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: `Cannot find module './App'`

- [ ] **Step 3: Implement App**

```jsx
// src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import Slideshow from './Slideshow';
import ErrorScreen from './ErrorScreen';

export default function App() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load photos.');
        return;
      }
      const data = await res.json();
      if (data.length === 0) {
        setError('No photos found in album');
        return;
      }
      setPhotos(data);
      setError(null);
    } catch {
      setError('Unable to reach the server. Check your connection.');
    }
  }, []);

  // Initial fetch + refresh every 30 minutes to pick up new photos
  useEffect(() => {
    fetchPhotos();
    const interval = setInterval(fetchPhotos, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPhotos]);

  // Retry every 60 seconds while in error state
  useEffect(() => {
    if (!error) return;
    const retry = setInterval(fetchPhotos, 60 * 1000);
    return () => clearInterval(retry);
  }, [error, fetchPhotos]);

  if (error) return <ErrorScreen message={error} />;
  if (!photos) return null;
  return <Slideshow photos={photos} />;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected:
```
✓ src/App.test.jsx (4 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "feat: App component with photo fetching, error state, and retry logic"
```

---

## Task 7: Entry Point and Global Styles

**Files:**
- Create: `src/main.jsx`
- Create: `src/index.css`
- Create: `index.html` (Vite root)

- [ ] **Step 1: Create index.html (Vite requires this at project root)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TV Bot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create src/index.css**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: #000;
  color: #fff;
  font-family: sans-serif;
  overflow: hidden;
}

.slideshow {
  width: 100vw;
  height: 100vh;
}

.slideshow img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 1s ease-in-out;
}

.error-screen {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}

.error-screen p {
  font-size: 1.5rem;
  color: #ccc;
  max-width: 600px;
}
```

- [ ] **Step 3: Create src/main.jsx**

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Run all tests to confirm nothing broken**

```bash
npm test
```

Expected: all tests still passing.

- [ ] **Step 5: Smoke test in dev mode**

Copy `.env.example` to `.env` and fill in real values, then:

```bash
npm run dev
```

Expected: Vite dev server at `http://localhost:5173`, Express at `http://localhost:3002`. Open `http://localhost:5173` — should show blank screen (no tokens yet) or trigger an error screen.

Visit `http://localhost:5173/auth` to complete Google OAuth. After auth, reload — slideshow should appear with photos from your album.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.jsx src/index.css
git commit -m "feat: entry point, global styles, and Vite HTML shell"
```

---

## Task 8: Deployment Docs

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Create docs/deployment.md**

```markdown
# Deploying TV Bot to Raspberry Pi

## Prerequisites

- Raspberry Pi OS (desktop, not lite — needs graphical session for Chromium kiosk)
- Node.js 18+ installed on the Pi (`node --version` to check)
- Git installed on the Pi

## 1. Google Cloud Setup (one-time, from any browser)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., "TV Bot")
3. Enable **Photos Library API** (APIs & Services → Library → search "Photos Library API")
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3002/auth/callback`
5. Download the credentials JSON or copy the Client ID and Client Secret

## 2. Deploy to the Pi

```bash
# On the Pi (via SSH or directly)
git clone <your-repo-url> ~/tv-bot
cd ~/tv-bot
npm install
npm run build
cp .env.example .env
```

Edit `.env` with real values:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3002/auth/callback
ALBUM_NAME=Your Exact Album Name
PORT=3002
```

## 3. One-Time OAuth (from a browser on the Pi or via SSH tunnel)

Start the server temporarily:
```bash
node server/index.js
```

Open a browser to `http://localhost:3002/auth` (or `http://<pi-ip>:3002/auth` from another device on the same network), complete the Google sign-in flow.

You should see: "Authentication complete. You can close this tab and restart the server."

Stop the server (Ctrl+C). `tokens.json` is now saved. The server can run headlessly from here.

## 4. systemd — Express Server

Create `/etc/systemd/system/tv-bot.service`:

```ini
[Unit]
Description=TV Bot Express Server
After=network.target

[Service]
WorkingDirectory=/home/pi/tv-bot
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
User=pi
EnvironmentFile=/home/pi/tv-bot/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tv-bot
sudo systemctl start tv-bot
sudo systemctl status tv-bot
```

## 5. systemd — Chromium Kiosk

Create `/etc/systemd/system/tv-bot-kiosk.service`:

```ini
[Unit]
Description=TV Bot Chromium Kiosk
After=tv-bot.service graphical.target
Requires=tv-bot.service

[Service]
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
ExecStart=/usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --incognito \
  --no-first-run \
  http://localhost:3002
Restart=on-failure
RestartSec=5

[Install]
WantedBy=graphical.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tv-bot-kiosk
sudo systemctl start tv-bot-kiosk
```

## 6. Verify on Boot

Reboot the Pi:
```bash
sudo reboot
```

The TV should show the slideshow within ~15 seconds of boot.

## Updating

```bash
cd ~/tv-bot
git pull
npm install
npm run build
sudo systemctl restart tv-bot
```

## Troubleshooting

| Problem | Command |
|---|---|
| Server not starting | `sudo journalctl -u tv-bot -f` |
| Kiosk not launching | `sudo journalctl -u tv-bot-kiosk -f` |
| Photos not loading | Check `tokens.json` exists, re-run `/auth` if needed |
| Album not found | Verify `ALBUM_NAME` in `.env` exactly matches the album title in Google Photos |
```

- [ ] **Step 2: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: Pi deployment guide with systemd units and OAuth setup"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Express on port 3002 ✓
  - OAuth `/auth` + `/auth/callback` routes ✓
  - `/api/photos` returns photo URLs ✓
  - Token auto-refresh ✓
  - 10-second slide rotation ✓
  - CSS crossfade ✓
  - Image preloading ✓
  - `ErrorScreen` on API failure ✓
  - `ErrorScreen` when album empty ✓
  - 30-minute photo refresh ✓
  - 60-second error retry ✓
  - Static serving of `dist/` ✓
  - systemd units ✓
  - Chromium kiosk flags ✓
  - Vite dev proxy ✓
  - `concurrently` dev script ✓
  - `.gitignore` for tokens, .env, dist ✓

- [x] **No placeholders** — all steps have real code
- [x] **Type consistency** — `photos` is always `string[]`, `error` is always `string | null`
- [x] **Port** — 3002 used throughout (not 3001 or 3000)
