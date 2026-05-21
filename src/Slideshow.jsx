// src/Slideshow.jsx
import { useState, useEffect } from 'react';

export default function Slideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  // Advance slide every 10 seconds with a 1s crossfade
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % photos.length);
        setFading(false);
      }, 1000);
    }, 10000);
    return () => clearInterval(timer);
  }, [photos.length]);

  // Preload the next image to avoid blank flashes
  useEffect(() => {
    const nextIndex = (index + 1) % photos.length;
    const img = new Image();
    img.src = photos[nextIndex];
  }, [index, photos]);

  return (
    <div className="slideshow">
      <img
        src={photos[index]}
        alt="slideshow"
        style={{ opacity: fading ? 0 : 1 }}
      />
    </div>
  );
}
