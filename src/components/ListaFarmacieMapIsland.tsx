import { useEffect, useRef } from 'react';
import { pharmacyMarkerIcon } from '@/lib/leafletMapIcons';

export interface MapPoint {
  lat: number;
  lng: number;
  name: string;
  address?: string;
}

interface Props {
  points: MapPoint[];
  center?: { lat: number; lng: number } | null;
}

export default function ListaFarmacieMapIsland({ points, center }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;

    void import('leaflet').then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      void import('leaflet/dist/leaflet.css');
      const defaultCenter = center || (points[0] ? { lat: points[0].lat, lng: points[0].lng } : { lat: 41.9, lng: 12.5 });
      map = L.map(containerRef.current!, { scrollWheelZoom: false }).setView(
        [defaultCenter.lat, defaultCenter.lng],
        12,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const layer = L.featureGroup();
      for (const p of points) {
        L.marker([p.lat, p.lng], { icon: pharmacyMarkerIcon(L) })
          .bindPopup(`<strong>${p.name}</strong>${p.address ? `<br>${p.address}` : ''}`)
          .addTo(layer);
      }
      layer.addTo(map);
      if (points.length > 1) {
        map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 14 });
      }
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [points, center]);

  return <div ref={containerRef} className="h-full min-h-[288px] w-full" />;
}
