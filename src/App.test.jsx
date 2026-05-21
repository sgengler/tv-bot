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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

    vi.useRealTimers();
  });
});
