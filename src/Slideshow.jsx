import { useState, useEffect, useRef, useCallback } from 'react';

const SLIDE_INTERVAL = 10000;
const W = 320;
const H = 240;

function drawNoise(ctx, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, x, y);
}

// Full-screen static noise
const fullStatic = {
  duration: 600,
  draw(ctx) {
    drawNoise(ctx, 0, 0, W, H);
  },
};

// Bright scan line sweeps top-to-bottom, revealing new photo above it
const scanReveal = {
  duration: 750,
  draw(ctx, progress) {
    const scanY = Math.floor(progress * H);
    drawNoise(ctx, 0, scanY, W, H - scanY);
    if (scanY > 0 && scanY < H) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, Math.max(0, scanY - 4), W, 4);
    }
  },
};

// Static curtain wipes left to right, revealing photo behind
const curtainWipe = {
  duration: 700,
  draw(ctx, progress) {
    const x = Math.floor(progress * W);
    drawNoise(ctx, x, 0, W - x, H);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x, 0, 2, H);
  },
};

// Overexposed white flash, like a blown-out film frame
const whiteFlash = {
  duration: 450,
  draw(ctx, progress) {
    const alpha = Math.sin(progress * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  },
};

// Venetian blinds: 8 horizontal strips of static clear left-to-right at staggered times
const venetianBlinds = {
  duration: 900,
  draw(ctx, progress) {
    const NUM = 8;
    const stripH = Math.floor(H / NUM);
    for (let i = 0; i < NUM; i++) {
      const p = Math.max(0, Math.min(1, (progress - i * 0.08) / 0.5));
      const clearedW = Math.floor(p * W);
      if (clearedW < W) {
        drawNoise(ctx, clearedW, i * stripH, W - clearedW, stripH);
      }
    }
  },
};

// Signal loss: static builds up in diagonal bands then clears
const diagonalStatic = {
  duration: 700,
  draw(ctx, progress) {
    // First half: fill with noise in diagonal bands; second half: clear diagonally
    const phase = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const imageData = ctx.createImageData(W, H);
    const data = imageData.data;
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const diag = (row + col) / (W + H);
        const active = progress < 0.5 ? diag < phase : diag > 1 - phase;
        const v = active ? (Math.random() > 0.5 ? 255 : 0) : 0;
        const idx = (row * W + col) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
        data[idx + 3] = active ? 255 : 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  },
};

const TRANSITIONS = [fullStatic, scanReveal, curtainWipe, whiteFlash, venetianBlinds, diagonalStatic];

export default function Slideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  const runTransition = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      elapsed += 50;
      const progress = Math.min(elapsed / transition.duration, 1);
      ctx.clearRect(0, 0, W, H);
      transition.draw(ctx, progress);

      if (elapsed >= transition.duration) {
        clearInterval(timerRef.current);
        ctx.clearRect(0, 0, W, H);
      }
    }, 50);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % photos.length);
      runTransition();
    }, SLIDE_INTERVAL);

    return () => {
      clearInterval(timer);
      clearInterval(timerRef.current);
    };
  }, [photos.length, runTransition]);

  // Preload next image
  useEffect(() => {
    const nextIndex = (index + 1) % photos.length;
    const img = new Image();
    img.src = photos[nextIndex];
  }, [index, photos]);

  return (
    <div className="slideshow">
      <img src={photos[index]} alt="slideshow" />
      <canvas
        ref={canvasRef}
        className="static-overlay"
        width={W}
        height={H}
      />
    </div>
  );
}
