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
