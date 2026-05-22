import { useState, useEffect, useRef, useCallback } from 'react';

const STATIC_COLS = 320;
const STATIC_ROWS = 240;

function randomSlideDuration() {
  // Mostly 7–15s, occasionally up to 30s
  return Math.random() < 0.8
    ? 7000 + Math.random() * 8000
    : 15000 + Math.random() * 15000;
}

function randomStaticDuration() {
  // Weighted: mostly brief (150–500ms), occasionally long (500–2500ms)
  return Math.random() < 0.75
    ? 150 + Math.random() * 350
    : 500 + Math.random() * 2000;
}

export default function Slideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const canvasRef = useRef(null);
  const staticTimerRef = useRef(null);

  const drawStatic = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(STATIC_COLS, STATIC_ROWS);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  useEffect(() => {
    let slideTimer = null;

    const advance = () => {
      setIndex(i => (i + 1) % photos.length);
      drawStatic();

      const staticDuration = randomStaticDuration();
      let elapsed = 0;
      staticTimerRef.current = setInterval(() => {
        drawStatic();
        elapsed += 50;
        if (elapsed >= staticDuration) {
          clearInterval(staticTimerRef.current);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, STATIC_COLS, STATIC_ROWS);
        }
      }, 50);

      slideTimer = setTimeout(advance, randomSlideDuration());
    };

    slideTimer = setTimeout(advance, randomSlideDuration());
    return () => {
      clearTimeout(slideTimer);
      clearInterval(staticTimerRef.current);
    };
  }, [photos.length, drawStatic]);

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
        width={STATIC_COLS}
        height={STATIC_ROWS}
      />
    </div>
  );
}
