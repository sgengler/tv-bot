# TV Bot — Google Photos Slideshow Design

**Date:** 2026-05-21
**Status:** Approved

## Overview

A Raspberry Pi app that displays a fullscreen, auto-advancing slideshow of images from a specific Google Photos album on a connected TV. The Pi boots directly into kiosk mode, no interaction required. Built with React + Vite (frontend) and Node.js/Express (backend).

The existing project on port 3000 is unaffected; this app runs on port 3001.

---

## Architecture

Two processes run on the Pi, managed by systemd:

1. **Express server (port 3001)** — handles Google Photos OAuth, token management, and serves the built React app as static files
2. **Chromium kiosk** — launches on boot, opens `http://localhost:3001`, fullscreen with no chrome/UI

In development (Mac), Vite's dev server runs alongside Express, proxying `/api` requests to Express. In production (Pi), `dist/` is built once and served by Express.

```
[Chromium kiosk]
      |
      v
[Express :3001]
  ├── GET /           → serves dist/ (React app)
  ├── GET /api/photos → proxies to Google Photos API
  └── GET /auth/callback → one-time OAuth setup
      |
      v
[Google Photos Library API]
```

---

## Backend

**Stack:** Node.js, Express, `googleapis` npm package

**Routes:**
- `GET /api/photos` — fetches photo base URLs from the configured album, returns JSON array to frontend. Handles token refresh before every request.
- `GET /auth/callback` — receives OAuth authorization code during one-time setup, exchanges for access/refresh tokens, writes `tokens.json`
- `GET /*` — serves `dist/index.html` for all other routes (SPA fallback)

**Token storage:** `tokens.json` at project root on the Pi (gitignored). Contains access token, refresh token, and expiry. Auto-refreshed by the googleapis client.

**Configuration (`.env`, gitignored):**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
ALBUM_NAME=My TV Album
PORT=3001
```

---

## Frontend

**Stack:** React, Vite, plain CSS

**Components:**

- `App` — mounts, fetches `/api/photos`, stores photo list in state. Re-fetches every 30 minutes to pick up newly added photos. Renders `Slideshow` on success or `ErrorScreen` on failure.
- `Slideshow` — receives array of photo URLs. Cycles through them, showing each for 10 seconds. CSS crossfade transition between slides. Preloads the next image in the background to prevent blank flashes.
- `ErrorScreen` — receives an error message string, displays it centered on screen. App retries `/api/photos` every 60 seconds while in error state.

**Fullscreen behavior:** Chromium is launched in `--kiosk` mode so no browser chrome is visible. The React app uses `height: 100vh; width: 100vw` with `object-fit: cover` on images to fill the TV.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Network down / API unreachable | `ErrorScreen` shown, retry every 60s |
| OAuth token expired | Express auto-refreshes; if refresh fails, `/api/photos` returns 401, `ErrorScreen` shown |
| No photos in album | `/api/photos` returns empty array, `ErrorScreen` shows "No photos found in album" |
| Chromium crashes | systemd restarts it automatically (Restart=on-failure) |
| Express crashes | systemd restarts it automatically (Restart=on-failure) |

---

## Initial Setup (One-Time)

1. Create a Google Cloud project at console.cloud.google.com
2. Enable the **Photos Library API**
3. Create OAuth 2.0 credentials (type: Web application), add `http://localhost:3001/auth/callback` as an authorized redirect URI
4. Copy client ID and secret into `.env` on the Pi
5. Set `ALBUM_NAME` in `.env` to the exact name of your Google Photos album
6. SSH into the Pi, run `npm start`, then open `http://<pi-ip>:3001/auth` from a browser to complete the OAuth flow
7. `tokens.json` is written — setup complete, server can now run headlessly

---

## Deployment (Pi)

**Build:**
```bash
npm run build   # outputs dist/
```

**systemd unit — Express server (`/etc/systemd/system/tv-bot.service`):**
```ini
[Unit]
Description=TV Bot Express Server
After=network.target

[Service]
WorkingDirectory=/home/pi/tv-bot
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
User=pi
EnvironmentFile=/home/pi/tv-bot/.env

[Install]
WantedBy=multi-user.target
```

**systemd unit — Chromium kiosk (`/etc/systemd/system/tv-bot-kiosk.service`):**
```ini
[Unit]
Description=TV Bot Chromium Kiosk
After=tv-bot.service graphical.target
Requires=tv-bot.service

[Service]
User=pi
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --incognito \
  http://localhost:3001
Restart=on-failure

[Install]
WantedBy=graphical.target
```

---

## Development Workflow (Mac)

```bash
npm run dev   # starts Express + Vite dev server concurrently
```

Vite proxies `/api/*` to `http://localhost:3001` so the frontend talks to the real Express backend during development.

**Scripts (package.json):**
- `dev` — `concurrently "node server/index.js" "vite"`
- `build` — `vite build`
- `start` — `node server/index.js` (serves dist/)

---

## Project Structure

```
tv-bot/
├── server/
│   └── index.js          # Express server, all backend logic
├── src/
│   ├── App.jsx
│   ├── Slideshow.jsx
│   ├── ErrorScreen.jsx
│   └── main.jsx
├── dist/                 # built by vite, gitignored
├── .env                  # gitignored
├── tokens.json           # gitignored, written after OAuth
├── vite.config.js
└── package.json
```

---

## Out of Scope (Future)

- Multiple album support / runtime album switching
- Ken Burns / pan-zoom effects
- Remote control UI
- Video playback
- Other display modes (weather, clock, etc.)
