// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from './app.js';

const SHARE_URL = 'https://lightroom.adobe.com/shares/abc123';
const VIDEO_URL = 'https://lightroom.adobe.com/shares/videoabc123';
const SPACE_ID = 'space456';
const ALBUM_ID = 'album789';
const HTML_WITH_IDS = `<html><body>spaces/${SPACE_ID}/albums/${ALBUM_ID}</body></html>`;

const ASSETS_RESPONSE = JSON.stringify({
  resources: [
    {
      asset: {
        links: {
          '/rels/rendition_type/2048': {
            href: `v2/spaces/${SPACE_ID}/assets/img1/renditions/2048`,
          },
        },
      },
    },
    {
      asset: {
        links: {
          '/rels/rendition_type/2048': {
            href: `v2/spaces/${SPACE_ID}/assets/img2/renditions/2048`,
          },
        },
      },
    },
  ],
});

const VIDEO_ASSETS_RESPONSE = JSON.stringify({
  resources: [
    {
      asset: {
        links: {
          '/rels/rendition_type/720p': {
            href: `v2/spaces/${SPACE_ID}/assets/vid1/renditions/720p`,
          },
        },
      },
    },
  ],
});

beforeEach(() => {
  process.env.LIGHTROOM_SHARE_URL = SHARE_URL;
  process.env.LIGHTROOM_VIDEO_URL = VIDEO_URL;
});

afterEach(() => {
  delete process.env.LIGHTROOM_SHARE_URL;
  delete process.env.LIGHTROOM_VIDEO_URL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GET /api/photos', () => {
  test('returns 500 when LIGHTROOM_SHARE_URL is not set', async () => {
    delete process.env.LIGHTROOM_SHARE_URL;
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/LIGHTROOM_SHARE_URL/);
  });

  test('returns 502 when share page fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Share page returned 404/);
  });

  test('returns 502 when album IDs cannot be found in share page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>no ids here</html>'),
    }));
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Could not find album path/);
  });

  test('returns 502 when assets API fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(HTML_WITH_IDS) })
      .mockResolvedValueOnce({ ok: false, status: 403 }),
    );
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Assets API returned 403/);
  });

  test('returns photo URLs when album has images', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(HTML_WITH_IDS) })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`while (1) {}\n${ASSETS_RESPONSE}`),
      }),
    );

    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      `https://lightroom.adobe.com/v2c/spaces/${SPACE_ID}/v2/spaces/${SPACE_ID}/assets/img1/renditions/2048`,
      `https://lightroom.adobe.com/v2c/spaces/${SPACE_ID}/v2/spaces/${SPACE_ID}/assets/img2/renditions/2048`,
    ]);
  });

  test('strips while(1){} prefix from assets response', async () => {
    const withPrefix = `while (1) {}\n${ASSETS_RESPONSE}`;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(HTML_WITH_IDS) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(withPrefix) }),
    );

    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  test('filters out assets without 2048 rendition', async () => {
    const assetsWithMissing = JSON.stringify({
      resources: [
        { asset: { links: { '/rels/rendition_type/2048': { href: 'v2/spaces/s/assets/img1/renditions/2048' } } } },
        { asset: { links: {} } },
        { asset: {} },
      ],
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(HTML_WITH_IDS) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(assetsWithMissing) }),
    );

    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('GET /api/videos', () => {
  test('returns 500 when LIGHTROOM_VIDEO_URL is not set', async () => {
    delete process.env.LIGHTROOM_VIDEO_URL;
    const res = await request(app).get('/api/videos');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/LIGHTROOM_VIDEO_URL/);
  });

  test('returns 502 when share page fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const res = await request(app).get('/api/videos');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Share page returned 404/);
  });

  test('returns video URLs when album has videos', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(HTML_WITH_IDS) })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`while (1) {}\n${VIDEO_ASSETS_RESPONSE}`),
      }),
    );

    const res = await request(app).get('/api/videos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      `https://lightroom.adobe.com/v2c/spaces/${SPACE_ID}/v2/spaces/${SPACE_ID}/assets/vid1/renditions/720p`,
    ]);
  });
});
