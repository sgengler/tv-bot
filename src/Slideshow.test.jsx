// src/Slideshow.test.jsx
import { render, screen, act, cleanup } from '@testing-library/react';
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
  cleanup();
  vi.useRealTimers();
});

describe('Slideshow', () => {
  test('renders the first photo initially', () => {
    render(<Slideshow photos={photos} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', photos[0]);
  });

  test('advances to the next photo after the slide interval', async () => {
    render(<Slideshow photos={photos} />);

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByRole('img')).toHaveAttribute('src', photos[1]);
  });

  test('wraps around to first photo after the last', async () => {
    render(<Slideshow photos={photos} />);

    for (let i = 0; i < photos.length; i++) {
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
    }

    expect(screen.getByRole('img')).toHaveAttribute('src', photos[0]);
  });
});
