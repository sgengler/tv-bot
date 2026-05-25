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

export default function Slideshow({ items }) {
  const [index, setIndex] = useState(0);
  const canvasRef = useRef(null);
  const staticTimerRef = useRef(null);
  const segmentTimerRef = useRef(null);
  const segmentDurationRef = useRef(null);

  const currentItem = items[index];

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

  const runStaticTransition = useCallback(() => {
    drawStatic();
    const staticDuration = randomStaticDuration();
    let elapsed = 0;
    clearInterval(staticTimerRef.current);
    staticTimerRef.current = setInterval(() => {
      drawStatic();
      elapsed += 50;
      if (elapsed >= staticDuration) {
        clearInterval(staticTimerRef.current);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, STATIC_COLS, STATIC_ROWS);
      }
    }, 50);
  }, [drawStatic]);

  const advance = useCallback(() => {
    setIndex(i => (i + 1) % items.length);
    runStaticTransition();
  }, [items.length, runStaticTransition]);

  // Timer-based advancement for photos; videos use onLoadedMetadata + segmentTimer
  useEffect(() => {
    if (currentItem?.type === 'video') {
      segmentDurationRef.current = randomSlideDuration();
      return () => clearTimeout(segmentTimerRef.current);
    }
    const timer = setTimeout(advance, randomSlideDuration());
    return () => clearTimeout(timer);
  }, [index, currentItem?.type, advance]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(staticTimerRef.current);
      clearTimeout(segmentTimerRef.current);
    };
  }, []);

  // Preload next photo
  useEffect(() => {
    const next = items[(index + 1) % items.length];
    if (next?.type === 'photo') {
      const img = new Image();
      img.src = next.url;
    }
  }, [index, items]);

  const handleVideoMetadata = useCallback((e) => {
    const video = e.currentTarget;
    const segmentMs = segmentDurationRef.current;
    const durationMs = video.duration * 1000;
    if (durationMs > segmentMs) {
      video.currentTime = Math.random() * ((durationMs - segmentMs) / 1000);
      segmentTimerRef.current = setTimeout(advance, segmentMs);
    }
    // video shorter than segment: play from 0, onEnded will advance
  }, [advance]);

  return (
    <div className="slideshow">
      {currentItem?.type === 'video' ? (
        <video
          key={index}
          src={currentItem.url}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={handleVideoMetadata}
          onEnded={advance}
        />
      ) : (
        <img src={currentItem?.url} alt="slideshow" />
      )}
      <canvas
        ref={canvasRef}
        className="static-overlay"
        width={STATIC_COLS}
        height={STATIC_ROWS}
      />
    </div>
  );
}
