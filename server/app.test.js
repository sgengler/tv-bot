// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { google } from 'googleapis';
import app from './app.js';

const TEST_TOKENS_PATH = join(process.cwd(), 'tokens.test.json');

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3002/auth/callback';
  process.env.ALBUM_NAME = 'Test Album';
  process.env.TOKENS_PATH = TEST_TOKENS_PATH;
  // Prevent real Google API token refresh calls
  vi.spyOn(google.auth.OAuth2.prototype, 'getAccessToken')
    .mockResolvedValue({ token: 'fake-token' });
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
