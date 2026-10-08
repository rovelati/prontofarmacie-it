import { BRAND_CROSS_MARKUP, BRAND_GREEN } from '@/lib/brand';

type LeafletModule = typeof import('leaflet')['default'];

/** Pin farmacia — croce verde su cerchio (brand), bordo chiaro + alone scuro per leggibilità su tessera. */
export function pharmacyMarkerIcon(L: LeafletModule) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="${BRAND_GREEN}" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="14" fill="none" stroke="rgba(15,23,42,.45)" stroke-width="1.25"/>${BRAND_CROSS_MARKUP}</svg>`;
  return L.divIcon({
    className: 'pf-pharmacy-marker',
    html: `<div style="width:32px;height:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))">${svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

/** Dot compatto (mappe dense): anello bianco + bordo scuro per contrasto su tessera verde OSM. */
export function compactPharmacyMarkerIcon(L: LeafletModule) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="9.5" fill="${BRAND_GREEN}" stroke="#fff" stroke-width="3"/><circle cx="11" cy="11" r="9.5" fill="none" stroke="rgba(15,23,42,.55)" stroke-width="1.5"/></svg>`;
  return L.divIcon({
    className: 'pf-pharmacy-marker-compact',
    html: `<div style="width:22px;height:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">${svg}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Pin per sedi con annuncio di lavoro (elenco). */
export function jobMarkerIcon(L: LeafletModule, label = 'L') {
  const safe = String(label || 'L').slice(0, 2);
  return L.divIcon({
    className: 'pf-job-marker',
    html: `<div style="background:#4f46e5;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 8px rgba(79,70,229,.35)"><span style="transform:rotate(45deg);color:white;font-weight:700;font-size:12px;line-height:1">${safe}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });
}

/** Pin evidenziato per la sede dell'offerta (dettaglio / highlight). */
export function jobHighlightMarkerIcon(L: LeafletModule) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48"><path d="M20 0C9 0 0 9 0 20c0 14 20 28 20 28s20-14 20-28C40 9 31 0 20 0z" fill="${BRAND_GREEN}" stroke="#fff" stroke-width="3"/><circle cx="20" cy="18" r="8" fill="#fff"/><text x="20" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="${BRAND_GREEN}" font-family="system-ui,sans-serif">L</text></svg>`;
  return L.divIcon({
    className: 'pf-job-highlight-marker',
    html: `<div style="width:40px;height:48px;filter:drop-shadow(0 6px 12px rgba(0,171,70,.45))">${svg}</div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -46],
  });
}

/** Pin rosso per il punto da cui parte la ricerca “vicino a me”. */
export function searchCenterMarkerIcon(L: LeafletModule) {
  return L.divIcon({
    className: 'pf-search-center-marker',
    html: '<div style="background:#dc2626;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(220,38,38,.45)"><span style="transform:rotate(45deg);width:8px;height:8px;border-radius:50%;background:white;display:block"></span></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}
