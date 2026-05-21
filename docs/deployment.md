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
