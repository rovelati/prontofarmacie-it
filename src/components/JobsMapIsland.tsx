import { useEffect, useRef } from 'react';
import { jobHighlightMarkerIcon, jobMarkerIcon, searchCenterMarkerIcon } from '@/lib/leafletMapIcons';

export interface JobMapPoint {
  lat: number;
  lng: number;
  id: string;
  title: string;
  city: string;
  pharmacyName?: string;
  detailLink: string;
}

export interface MapUserLocation {
  lat: number;
  lng: number;
}

interface Props {
  points: JobMapPoint[];
  userLocation?: MapUserLocation | null;
  /** Evidenzia una sede (es. dettaglio offerta). */
  highlightId?: string | null;
  /** Apre il popup di un pin al caricamento. */
  openPopupId?: string | null;
  /** Mostra legenda sotto la mappa. */
  showLegend?: boolean;
}

type LeafletModule = typeof import('leaflet');

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeIcons(L: LeafletModule['default']) {
  return {
    jobIcon: jobMarkerIcon(L),
    highlightIcon: jobHighlightMarkerIcon(L),
    userIcon: searchCenterMarkerIcon(L),
  };
}

function renderMapMarkers(
  L: LeafletModule['default'],
  layer: import('leaflet').FeatureGroup,
  icons: ReturnType<typeof makeIcons>,
  points: JobMapPoint[],
  userLocation?: MapUserLocation | null,
  highlightId?: string | null,
  openPopupId?: string | null,
) {
  layer.clearLayers();
  let openMarker: import('leaflet').Marker | null = null;

  points.forEach((p, index) => {
    const isHighlight = Boolean(highlightId && p.id === highlightId);
    const numberLabel = String(index + 1);
    const icon = isHighlight
      ? icons.highlightIcon
      : points.length > 1
        ? jobMarkerIcon(L, numberLabel)
        : icons.jobIcon;

    const pharmacy = p.pharmacyName ? `<br><span style="color:#065f46;font-weight:600">${escapeHtml(p.pharmacyName)}</span>` : '';
    const badge = isHighlight
      ? '<div style="display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:#00ab46;color:#fff;font-size:11px;font-weight:700">Sede dell\'offerta</div><br>'
      : points.length > 1
        ? `<div style="display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:#4f46e5;color:#fff;font-size:11px;font-weight:700">Offerta ${numberLabel}</div><br>`
        : '';

    const marker = L.marker([p.lat, p.lng], {
      icon,
      zIndexOffset: isHighlight ? 800 : 0,
    })
      .bindPopup(
        `${badge}<strong>${escapeHtml(p.title)}</strong>${pharmacy}<br>${escapeHtml(p.city || '')}<br><a href="${escapeHtml(p.detailLink)}">Apri annuncio</a>`,
      )
      .addTo(layer);

    if (openPopupId && p.id === openPopupId) openMarker = marker;
    if (!openPopupId && isHighlight) openMarker = marker;
    if (!openPopupId && !highlightId && points.length === 1) openMarker = marker;
  });

  if (userLocation) {
    L.marker([userLocation.lat, userLocation.lng], { icon: icons.userIcon, zIndexOffset: 1000 })
      .bindPopup('<strong>La tua posizione</strong><br>Punto di ricerca')
      .addTo(layer);
  }

  if (openMarker) {
    openMarker.openPopup();
  }
}

function fitMapToMarkers(
  map: import('leaflet').Map,
  L: LeafletModule['default'],
  points: JobMapPoint[],
  userLocation?: MapUserLocation | null,
) {
  const bounds: [number, number][] = points.map((p) => [p.lat, p.lng]);
  if (userLocation) bounds.push([userLocation.lat, userLocation.lng]);

  if (bounds.length === 1) {
    map.setView(bounds[0], 15);
    return;
  }
  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 15 });
  }
}

export default function JobsMapIsland({
  points,
  userLocation = null,
  highlightId = null,
  openPopupId = null,
  showLegend = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').FeatureGroup | null>(null);
  const iconsRef = useRef<ReturnType<typeof makeIcons> | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    void import('leaflet').then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      void import('leaflet/dist/leaflet.css');
      iconsRef.current = makeIcons(L);
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      layerRef.current = L.featureGroup().addTo(map);
      mapRef.current = map;

      renderMapMarkers(L, layerRef.current, iconsRef.current, points, userLocation, highlightId, openPopupId);
      fitMapToMarkers(map, L, points, userLocation);
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      iconsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const icons = iconsRef.current;
    if (!map || !layer || !icons) return;
    void import('leaflet').then(({ default: L }) => {
      renderMapMarkers(L, layer, icons, points, userLocation, highlightId, openPopupId);
      fitMapToMarkers(map, L, points, userLocation);
    });
  }, [points, userLocation, highlightId, openPopupId]);

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={containerRef} className="min-h-0 flex-1 w-full" />
      {showLegend && (
        <div className="flex flex-wrap gap-3 border-t border-gray-100 bg-white px-3 py-2 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
            Sede dell&apos;offerta
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-indigo-600" />
            Altre offerte in elenco
          </span>
          {userLocation && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
              La tua posizione
            </span>
          )}
        </div>
      )}
    </div>
  );
}
