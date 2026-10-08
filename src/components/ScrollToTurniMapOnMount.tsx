import { useEffect } from 'react';
import { scrollToTurniMap } from '@/lib/scrollToTurniMap';

/** Dopo redirect con lat/lng, porta la vista sulla mappa risultati. */
export default function ScrollToTurniMapOnMount() {
  useEffect(() => {
    const timer = window.setTimeout(() => scrollToTurniMap(), 120);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
