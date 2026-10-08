import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';

export interface GeoPoint {
  lat: number;
  lng: number;
}

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'it',
  'User-Agent': 'ProntoFarmacie/1.0 (https://www.prontofarmacie.it)',
};

function parseNominatimResult(data: unknown): GeoPoint | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const cityResult =
    data.find((r) => r && typeof r === 'object' && (r as { addresstype?: string }).addresstype === 'city') ||
    data[0];
  const lat = Number((cityResult as { lat?: string }).lat);
  const lng = Number((cityResult as { lon?: string }).lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

class NominatimRateLimitError extends Error {
  constructor() {
    super('Nominatim rate limit');
    this.name = 'NominatimRateLimitError';
  }
}

async function nominatimSearch(params: URLSearchParams): Promise<GeoPoint | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: NOMINATIM_HEADERS,
  });
  if (res.status === 429) throw new NominatimRateLimitError();
  if (!res.ok) return null;
  const data = await res.json();
  return parseNominatimResult(data);
}

async function cachedGeocode<T>(key: string, fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await cached(key, CACHE_TTL_TURNI_MS * 24, async () => {
      const value = await fn();
      if (value == null) throw new Error('geocode miss');
      return value;
    });
  } catch {
    return null;
  }
}

/** Geocodifica un comune italiano (centroide preferendo addresstype=city). */
export async function geocodeCity(cityName: string): Promise<GeoPoint | null> {
  const trimmed = cityName?.trim();
  if (!trimmed) return null;

  return cachedGeocode(`geocode:city:${trimmed.toLowerCase()}`, async () => {
    const structured = new URLSearchParams({
      format: 'json',
      limit: '5',
      city: trimmed,
      country: 'Italy',
      countrycodes: 'it',
    });
    const structuredResult = await nominatimSearch(structured);
    if (structuredResult) return structuredResult;

    const fallback = new URLSearchParams({
      format: 'json',
      limit: '5',
      q: `${trimmed}, Italia`,
      countrycodes: 'it',
    });
    return nominatimSearch(fallback);
  });
}

/** Geocodifica un indirizzo libero (es. via + città + provincia). */
export async function geocodeQuery(query: string): Promise<GeoPoint | null> {
  const trimmed = query?.trim();
  if (!trimmed) return null;

  return cachedGeocode(`geocode:q:${trimmed.toLowerCase()}`, async () => {
    const params = new URLSearchParams({
      format: 'json',
      limit: '3',
      q: trimmed,
      countrycodes: 'it',
    });
    return nominatimSearch(params);
  });
}
