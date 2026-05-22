import { useState, useEffect, useRef, useCallback } from 'react';

const SLIDE_INTERVAL = 10000;
const STATIC_DURATION = 600;
const STATIC_COLS = 320;
const STATIC_ROWS = 240;

export default function Slideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const [showStatic, setShowStatic] = useState(false);
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
    const advance = () => {
      setIndex(i => (i + 1) % photos.length);
      setShowStatic(true);
      drawStatic();

      let frames = 0;
      const totalFrames = Math.ceil(STATIC_DURATION / 50);
      staticTimerRef.current = setInterval(() => {
        drawStatic();
        frames++;
        if (frames >= totalFrames) {
          clearInterval(staticTimerRef.current);
          setShowStatic(false);
        }
      }, 50);
    };

    const timer = setInterval(advance, SLIDE_INTERVAL);
    return () => {
      clearInterval(timer);
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
        style={{ opacity: showStatic ? 1 : 0 }}
      />
    </div>
  );
}
