// src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import Slideshow from './Slideshow';
import ErrorScreen from './ErrorScreen';

export default function App() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load photos.');
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError('No photos found in album.');
        return;
      }
      setPhotos(data);
      setError(null);
    } catch {
      setError('Unable to reach the server. Check your connection.');
    }
  }, []);

  // Initial fetch + refresh every 30 minutes to pick up new photos
  useEffect(() => {
    fetchPhotos();
    const interval = setInterval(fetchPhotos, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPhotos]);

  // Retry every 60 seconds while in error state
  useEffect(() => {
    if (!error) return;
    const retry = setInterval(fetchPhotos, 60 * 1000);
    return () => clearInterval(retry);
  }, [error, fetchPhotos]);

  if (error) return <ErrorScreen message={error} />;
  if (!photos) return null;
  return <Slideshow photos={photos} />;
}
