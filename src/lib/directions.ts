export function hasUsableCoords(lat?: number | null, lng?: number | null): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  if (la < 35 || la > 48 || ln < 6 || ln > 19) return false;
  return true;
}

/** Rimuove suffissi PagineGialle tipo "Bologna - 770m". */
export function normalizePharmacyCity(city?: string | null): string {
  if (!city) return '';
  return city
    .replace(/\s*-\s*\d+\s*m\s*$/iu, '')
    .replace(/\s*-\s*\d+\s*km\s*$/iu, '')
    .trim();
}

export function buildLocationQuery(params: {
  address?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
}): string {
  const city = normalizePharmacyCity(params.city);
  return [params.name, params.address, city, params.province, 'Italia'].filter(Boolean).join(', ');
}

export function buildDirectionsHref(params: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
}): string {
  const { lat, lng } = params;
  if (hasUsableCoords(lat, lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const query = buildLocationQuery(params);
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : '';
}

export function buildMapEmbedUrl(params: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
}): string {
  const { lat, lng } = params;
  const query = hasUsableCoords(lat, lng)
    ? `${lat},${lng}`
    : buildLocationQuery(params);
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : '';
}
