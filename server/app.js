import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function fetchLightroomPhotos(shareUrl) {
  // Extract share token from URL
  const shareToken = shareUrl.match(/shares\/([a-z0-9]+)/)?.[1];
  if (!shareToken) throw new Error('Invalid LIGHTROOM_SHARE_URL');

  // Parse the share page to find the space ID and album ID
  const pageRes = await fetch(shareUrl, { headers: { 'User-Agent': UA } });
  if (!pageRes.ok) throw new Error(`Share page returned ${pageRes.status}`);
  const html = await pageRes.text();

  const match = html.match(/spaces\/([a-z0-9]+)\/albums\/([a-z0-9]+)/);
  if (!match) throw new Error('Could not find album path in share page');
  const [, spaceId, albumId] = match;

  // Fetch assets from the album
  const assetsUrl = `https://lightroom.adobe.com/v2/spaces/${spaceId}/albums/${albumId}/assets?embed=asset&subtype=image&limit=500`;
  const assetsRes = await fetch(assetsUrl, {
    headers: { 'User-Agent': UA, Referer: shareUrl },
  });
  if (!assetsRes.ok) throw new Error(`Assets API returned ${assetsRes.status}`);

  // Response is prepended with `while (1) {}` — strip it
  const raw = await assetsRes.text();
  const json = raw.replace(/^while \(1\) \{\}/, '').trim();
  const data = JSON.parse(json);

  return (data.resources || [])
    .map((r) => r.asset?.links?.['/rels/rendition_type/2048']?.href)
    .filter(Boolean)
    .map((href) => `https://lightroom.adobe.com/v2c/spaces/${spaceId}/${href}`);
}

const app = express();

app.get('/api/photos', async (req, res) => {
  const shareUrl = process.env.LIGHTROOM_SHARE_URL;
  if (!shareUrl) {
    return res.status(500).json({ error: 'LIGHTROOM_SHARE_URL not configured.' });
  }

  try {
    const photos = await fetchLightroomPhotos(shareUrl);
    if (photos.length === 0) {
      return res.json({ error: 'No photos found in Lightroom album.' });
    }
    res.json(photos);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch photos: ${err.message}` });
  }
});

// Serve built React app; only active after `npm run build`
app.use(express.static(DIST_PATH));
app.get('*', (req, res) => {
  res.sendFile(join(DIST_PATH, 'index.html'), (err) => {
    if (err) res.status(404).send('App not built. Run npm run build.');
  });
});

export default app;
