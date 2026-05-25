// src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import Slideshow from './Slideshow';
import ErrorScreen from './ErrorScreen';

function buildSequence(photos, videos) {
  const result = [];
  let pi = 0;
  for (let i = 0; pi < photos.length; i++) {
    if (i % 3 === 2 && videos.length > 0) {
      result.push({ type: 'video', url: videos[Math.floor(Math.random() * videos.length)] });
    } else {
      result.push({ type: 'photo', url: photos[pi++] });
    }
  }
  return result;
}

export default function App() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [photosRes, videosRes] = await Promise.all([
        fetch('/api/photos'),
        fetch('/api/videos').catch(() => null),
      ]);

      if (!photosRes.ok) {
        const data = await photosRes.json().catch(() => ({}));
        setError(data.error || 'Failed to load photos.');
        return;
      }
      const photosData = await photosRes.json();
      if (!Array.isArray(photosData) || photosData.length === 0) {
        setError('No photos found in album.');
        return;
      }

      let videosData = [];
      if (videosRes?.ok) {
        const vd = await videosRes.json().catch(() => []);
        if (Array.isArray(vd)) videosData = vd;
      }

      const shuffledPhotos = [...photosData].sort(() => Math.random() - 0.5);
      setItems(buildSequence(shuffledPhotos, videosData));
      setError(null);
    } catch {
      setError('Unable to reach the server. Check your connection.');
    }
  }, []);

  // Initial fetch + refresh every 30 minutes to pick up new photos/videos
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Retry every 60 seconds while in error state
  useEffect(() => {
    if (!error) return;
    const retry = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(retry);
  }, [error, fetchData]);

  if (error) return <ErrorScreen message={error} />;
  if (!items) return null;
  return <Slideshow items={items} />;
}
