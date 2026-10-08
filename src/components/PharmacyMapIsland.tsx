import { useEffect, useRef } from 'react';
import { pharmacyMarkerIcon } from '@/lib/leafletMapIcons';

interface Props {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

export default function PharmacyMapIsland({ lat, lng, name, address }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;

    void import('leaflet').then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      void import('leaflet/dist/leaflet.css');

      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      L.marker([lat, lng], { icon: pharmacyMarkerIcon(L) })
        .bindPopup(`<strong>${name}</strong><br>${address}`)
        .addTo(map);

      window.setTimeout(() => map?.invalidateSize(), 100);
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [lat, lng, name, address]);

  return <div ref={containerRef} className="h-full w-full min-h-[280px]" />;
}
