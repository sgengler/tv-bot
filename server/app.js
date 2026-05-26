import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = join(__dirname, '..', 'dist');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function fetchLightroomAssets(shareUrl, subtype, renditionKey) {
  const pageRes = await fetch(shareUrl, { headers: { 'User-Agent': UA } });
  if (!pageRes.ok) throw new Error(`Share page returned ${pageRes.status}`);
  const html = await pageRes.text();

  const match = html.match(/spaces\/([a-z0-9]+)\/albums\/([a-z0-9]+)/);
  if (!match) throw new Error('Could not find album path in share page');
  const [, spaceId, albumId] = match;

  const assetsUrl = `https://lightroom.adobe.com/v2/spaces/${spaceId}/albums/${albumId}/assets?embed=asset&subtype=${subtype}&limit=500`;
  const assetsRes = await fetch(assetsUrl, {
    headers: { 'User-Agent': UA, Referer: shareUrl },
  });
  if (!assetsRes.ok) throw new Error(`Assets API returned ${assetsRes.status}`);

  // Response is prepended with `while (1) {}` — strip it
  const raw = await assetsRes.text();
  const json = raw.replace(/^while \(1\) \{\}/, '').trim();
  const data = JSON.parse(json);

  return (data.resources || [])
    .map((r) => r.asset?.links?.[renditionKey]?.href)
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
    const photos = await fetchLightroomAssets(shareUrl, 'image', '/rels/rendition_type/720');
    if (photos.length === 0) {
      return res.json({ error: 'No photos found in Lightroom album.' });
    }
    res.json(photos);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch photos: ${err.message}` });
  }
});

app.get('/api/videos', async (req, res) => {
  const shareUrl = process.env.LIGHTROOM_VIDEO_URL;
  if (!shareUrl) {
    return res.status(500).json({ error: 'LIGHTROOM_VIDEO_URL not configured.' });
  }

  try {
    const videos = await fetchLightroomAssets(shareUrl, 'video', '/rels/rendition_type/360p');
    if (videos.length === 0) {
      return res.json({ error: 'No videos found in Lightroom album.' });
    }
    res.json(videos);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch videos: ${err.message}` });
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
