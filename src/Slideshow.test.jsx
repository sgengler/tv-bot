// src/Slideshow.test.jsx
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Slideshow from './Slideshow';

const items = [
  { type: 'photo', url: 'https://example.com/photo1.jpg' },
  { type: 'photo', url: 'https://example.com/photo2.jpg' },
  { type: 'photo', url: 'https://example.com/photo3.jpg' },
];

beforeEach(() => {
  vi.useFakeTimers();
  // Fix Math.random so slide duration is always the minimum (7000ms)
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Slideshow', () => {
  test('renders the first photo initially', () => {
    render(<Slideshow items={items} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', items[0].url);
  });

  test('advances to the next photo after the slide interval', async () => {
    render(<Slideshow items={items} />);

    await act(async () => {
      vi.advanceTimersByTime(7000);
    });

    expect(screen.getByRole('img')).toHaveAttribute('src', items[1].url);
  });

  test('wraps around to first photo after the last', async () => {
    render(<Slideshow items={items} />);

    for (let i = 0; i < items.length; i++) {
      await act(async () => {
        vi.advanceTimersByTime(7000);
      });
    }

    expect(screen.getByRole('img')).toHaveAttribute('src', items[0].url);
  });

  test('renders video element for video items', () => {
    const videoItems = [
      { type: 'video', url: 'https://example.com/video1.mp4' },
      { type: 'photo', url: 'https://example.com/photo1.jpg' },
    ];
    render(<Slideshow items={videoItems} />);
    expect(document.querySelector('video')).toHaveAttribute('src', 'https://example.com/video1.mp4');
  });
});
