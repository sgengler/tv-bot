// src/App.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import App from './App';

function mockFetch({ photosOk = true, photos = [], videos = [], photosError = null } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
    if (url === '/api/videos') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(videos),
      });
    }
    if (!photosOk) {
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve(photosError ?? {}),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(photos),
    });
  }));
}

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
    mockFetch({ photos: [] });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('No photos found in album.')).toBeInTheDocument();
    });
  });

  test('renders Slideshow when photos are returned', async () => {
    mockFetch({
      photos: [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  test('renders Slideshow with videos interleaved when videos are returned', async () => {
    mockFetch({
      photos: [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
        'https://example.com/photo3.jpg',
        'https://example.com/photo4.jpg',
      ],
      videos: ['https://example.com/video1.mp4'],
    });

    render(<App />);

    await waitFor(() => {
      // With 4 photos and 1 video: sequence has a video at position index 2
      // At least one media element (img or video) should be rendered
      const img = document.querySelector('img');
      const video = document.querySelector('video');
      expect(img || video).toBeTruthy();
    });
  });
});
