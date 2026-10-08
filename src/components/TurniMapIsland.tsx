import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { buildDirectionsHref } from '@/lib/directions';
import { compactPharmacyMarkerIcon, pharmacyMarkerIcon, searchCenterMarkerIcon } from '@/lib/leafletMapIcons';

export interface PharmacyMapPoint {
  lat: number;
  lng: number;
  name: string;
  address: string;
  slug: string;
  statusLabel: string;
  statusDetail: string;
}

export interface MapUserLocation {
  lat: number;
  lng: number;
}

interface Props {
  points: PharmacyMapPoint[];
  /** Pin rosso: posizione utente (geo) o centro comune (ricerca vicinanze). */
  userLocation?: MapUserLocation | null;
  defaultCenter?: MapUserLocation | null;
  searchCenterLabel?: string;
  /** Cap zoom fitBounds (province ~11, città default 15). */
  fitMaxZoom?: number;
}

type LeafletModule = typeof import('leaflet');

function makeIcons(L: LeafletModule['default'], pointCount: number) {
  const denseCityMap = pointCount >= 24;
  return {
    pharmacyIcon: denseCityMap ? compactPharmacyMarkerIcon(L) : pharmacyMarkerIcon(L),
    userIcon: searchCenterMarkerIcon(L),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spreadOverlappingPoints(points: PharmacyMapPoint[]) {
  const grouped = new Map<string, PharmacyMapPoint[]>();
  for (const point of points) {
    const key = `${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(point);
    else grouped.set(key, [point]);
  }

  const positioned = new Map<
    string,
    {
      lat: number;
      lng: number;
    }
  >();

  for (const bucket of grouped.values()) {
    if (bucket.length === 1) {
      const point = bucket[0];
      positioned.set(point.slug || `${point.lat}|${point.lng}|${point.name}`, {
        lat: point.lat,
        lng: point.lng,
      });
      continue;
    }

    const radiusLat = 0.00045;
    const radiusLngBase = radiusLat / Math.max(Math.cos((bucket[0].lat * Math.PI) / 180), 0.35);

    bucket.forEach((point, index) => {
      const angle = (2 * Math.PI * index) / bucket.length;
      positioned.set(point.slug || `${point.lat}|${point.lng}|${point.name}`, {
        lat: point.lat + Math.sin(angle) * radiusLat,
        lng: point.lng + Math.cos(angle) * radiusLngBase,
      });
    });
  }

  return positioned;
}

function renderMapMarkers(
  L: LeafletModule['default'],
  layer: import('leaflet').FeatureGroup,
  icons: ReturnType<typeof makeIcons>,
  points: PharmacyMapPoint[],
  userLocation?: MapUserLocation | null,
  searchCenterLabel = 'La tua posizione',
) {
  layer.clearLayers();
  const displayPositions = spreadOverlappingPoints(points);

  points.forEach((p) => {
    const displayKey = p.slug || `${p.lat}|${p.lng}|${p.name}`;
    const displayPos = displayPositions.get(displayKey) || { lat: p.lat, lng: p.lng };
    const directionsHref = buildDirectionsHref({ lat: p.lat, lng: p.lng, address: p.address, name: p.name });
    const detailHref = p.slug ? `/farmacia/${p.slug}/` : '';
    const actions = [
      detailHref
        ? `<a href="${escapeHtml(detailHref)}" data-ga-event="cta_pharmacy_detail" data-ga-label="vedi_scheda_mappa" data-ga-pharmacy="${escapeHtml(p.slug || '')}" style="font-weight:600;color:#047857">Vedi scheda</a>`
        : '',
      directionsHref
        ? `<a href="${escapeHtml(directionsHref)}" target="_blank" rel="noopener noreferrer" data-ga-event="cta_directions" data-ga-label="direzioni_mappa" data-ga-pharmacy="${escapeHtml(p.slug || '')}" style="font-weight:600;color:#047857">Direzioni</a>`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const actionsHtml = actions ? `<br>${actions}` : '';
    L.marker([displayPos.lat, displayPos.lng], { icon: icons.pharmacyIcon })
      .bindPopup(
        `<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.address || '')}${actionsHtml}`,
      )
      .addTo(layer);
  });

  if (userLocation) {
    L.marker([userLocation.lat, userLocation.lng], { icon: icons.userIcon, zIndexOffset: 1000 })
      .bindPopup(`<strong>Punto di ricerca</strong><br>${escapeHtml(searchCenterLabel)}`)
      .addTo(layer);
  }
}

function fitMapToMarkers(
  map: import('leaflet').Map,
  L: LeafletModule['default'],
  points: PharmacyMapPoint[],
  userLocation?: MapUserLocation | null,
  defaultCenter?: MapUserLocation | null,
  fitMaxZoom = 15,
) {
  const bounds: [number, number][] = points.map((p) => [p.lat, p.lng]);
  if (userLocation) bounds.push([userLocation.lat, userLocation.lng]);

  if (bounds.length === 1) {
    map.setView(bounds[0], Math.min(14, fitMaxZoom));
    return;
  }
  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: fitMaxZoom });
    return;
  }
  if (defaultCenter) {
    map.setView([defaultCenter.lat, defaultCenter.lng], Math.min(13, fitMaxZoom));
    return;
  }
  map.setView([42.5, 12.5], 6);
}

function scheduleMapResize(map: import('leaflet').Map) {
  map.invalidateSize();
  window.setTimeout(() => map.invalidateSize(), 100);
  window.setTimeout(() => map.invalidateSize(), 400);
}

export default function TurniMapIsland({
  points,
  userLocation = null,
  defaultCenter = null,
  searchCenterLabel = 'La tua posizione',
  fitMaxZoom = 15,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').FeatureGroup | null>(null);
  const iconsRef = useRef<ReturnType<typeof makeIcons> | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    void import('leaflet').then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      iconsRef.current = makeIcons(L, points.length);
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      layerRef.current = L.featureGroup().addTo(map);
      mapRef.current = map;

      renderMapMarkers(L, layerRef.current, iconsRef.current, points, userLocation, searchCenterLabel);
      fitMapToMarkers(map, L, points, userLocation, defaultCenter, fitMaxZoom);
      scheduleMapResize(map);

      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      iconsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    void import('leaflet').then(({ default: L }) => {
      const icons = makeIcons(L, points.length);
      iconsRef.current = icons;
      renderMapMarkers(L, layer, icons, points, userLocation, searchCenterLabel);
      fitMapToMarkers(map, L, points, userLocation, defaultCenter, fitMaxZoom);
      scheduleMapResize(map);
    });
  }, [points, userLocation, defaultCenter, searchCenterLabel, fitMaxZoom]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ points: PharmacyMapPoint[]; user?: MapUserLocation }>).detail;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      void import('leaflet').then(({ default: L }) => {
        const icons = makeIcons(L, detail.points.length);
        iconsRef.current = icons;
        renderMapMarkers(L, layer, icons, detail.points, detail.user ?? null, searchCenterLabel);
        fitMapToMarkers(map, L, detail.points, detail.user ?? null, defaultCenter, fitMaxZoom);
        scheduleMapResize(map);
      });
    };
    window.addEventListener('turni-map-update', handler);
    return () => window.removeEventListener('turni-map-update', handler);
  }, [defaultCenter, searchCenterLabel, fitMaxZoom]);

  return <div ref={containerRef} className="absolute inset-0 z-0 min-h-[400px] w-full" />;
}
