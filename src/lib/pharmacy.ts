import { getSupabase } from '@/lib/supabase';
import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { buildLocationQuery, hasUsableCoords, normalizePharmacyCity } from '@/lib/directions';
import { geocodeCity, geocodeQuery, type GeoPoint } from '@/lib/geocode';
import { rankNearbyPharmacies } from '@/lib/pharmacyNearbySeo';
import type { DailyShift } from '@/lib/turniStatus';

export interface PharmacyRecord {
  id: string;
  name: string;
  address?: string | null;
  gaddress?: string | null;
  city?: string | null;
  province?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  opening_hours?: unknown;
  images?: unknown;
  services?: unknown;
  latitude?: number | null;
  longitude?: number | null;
  prontofarmacie_slug?: string | null;
  rating_avg_cached?: number | null;
  rating_count_cached?: number | null;
  turni_updated_at?: string | null;
  hours_updated_at?: string | null;
  [key: string]: unknown;
}

export interface PharmacyReview {
  review_id?: string;
  reviewer_name?: string | null;
  reviewer_photo?: string | null;
  reviewer_url?: string | null;
  star_rating?: number | null;
  comment?: string | null;
  created_at_g?: string | null;
}

export type DescriptionBlock = { html: string } | { text: string };

/** Rimuove note spider Federfarma/PharmAround dalla descrizione scheda (restano in turni_updated_at). */
export function stripTurniSourceNotes(value: string): string {
  return value
    .split(/\n+/)
    .map((ln) => ln.trim())
    .filter((ln) => {
      if (!ln) return false;
      const lower = ln.toLowerCase();
      if (lower.includes('federfarma lombardia')) return false;
      if (lower.includes('farmacia-aperta.eu')) return false;
      if (lower.includes('dati degli orari di turno sono forniti')) return false;
      if (lower.includes('web.pharmaround.it')) return false;
      if (/aggiornati alla data:\s*\d{4}-\d{2}-\d{2}/i.test(ln)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/** Allinea a PharmacyDetailPage React: HTML DeepSeek vs testo plain. */
export function formatPharmacyDescription(value: unknown): DescriptionBlock[] {
  if (!value) return [];
  if (typeof value !== 'string') return [{ text: String(value) }];
  const trimmed = stripTurniSourceNotes(value.trim());
  if (!trimmed) return [];
  if (/[<>]/.test(trimmed)) return [{ html: trimmed }];
  return trimmed
    .split(/\n{2,}/g)
    .map((block) => block.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

export function formatTurniUpdatedLabel(value: string | null | undefined, now = new Date()): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ageMs = now.getTime() - d.getTime();
  if (ageMs < 0 || ageMs > 7 * 86400000) return null;
  const datePart = d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
  const timePart = d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
  if (ageMs <= 36 * 3600000) {
    return `Turni aggiornati oggi alle ${timePart}`;
  }
  return `Turni aggiornati il ${datePart} alle ${timePart}`;
}

export function formatReviewDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
}

export interface NearbyPharmacy {
  id: string;
  name: string;
  prontofarmacie_slug: string;
  city?: string | null;
  province?: string | null;
  rating_avg_cached?: number | null;
  rating_count_cached?: number | null;
}

function countMeaningfulFields(record: PharmacyRecord): number {
  return Object.entries(record).reduce((score, [key, value]) => {
    if (['id', 'prontofarmacie_slug', 'created_at', 'updated_at'].includes(key)) return score;
    if (value == null) return score;
    if (typeof value === 'string') return value.trim() ? score + 1 : score;
    if (Array.isArray(value)) return value.length ? score + 1 : score;
    if (typeof value === 'object') return Object.keys(value).length ? score + 1 : score;
    return score + 1;
  }, 0);
}

export function pickMostCompletePharmacy(rows: PharmacyRecord[]): PharmacyRecord | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  return [...rows].sort((a, b) => {
    const diff = countMeaningfulFields(b) - countMeaningfulFields(a);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

export function isDisplayablePharmacyImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith('http')) return Boolean(u);
  // Street View Static: chiave nel browser → 403 (progetto Google eliminato / API disabilitate).
  if (u.includes('maps.googleapis.com/maps/api/streetview')) return false;
  // Storage cloud legacy non più servito dopo migrazione locale.
  if (u.includes('supabase.co/storage/')) return false;
  return true;
}

export function normalizeImages(images: unknown): string[] {
  if (!images) return [];
  let list: string[] = [];
  if (Array.isArray(images)) list = images.filter(Boolean).map(String);
  else if (typeof images === 'string') list = images.trim() ? [images] : [];
  else if (typeof images === 'object') {
    list = Object.values(images as Record<string, unknown>).filter(Boolean).map(String);
  }
  return list.filter(isDisplayablePharmacyImageUrl);
}

export function toTitleCase(value: string): string {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function fetchPharmacyBySlug(slug: string): Promise<PharmacyRecord | null> {
  const normalized = slug.replace(/\/$/, '').trim();
  if (!normalized) return null;

  return cached(`pharmacy:${normalized}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select('*')
      .eq('prontofarmacie_slug', normalized)
      .limit(20);
    if (error) throw new Error(error.message);
    return pickMostCompletePharmacy((data ?? []) as PharmacyRecord[]);
  });
}

/** Coordinate per mappa: DB → geocoding indirizzo → centro città. */
export async function resolvePharmacyMapCoords(pharmacy: PharmacyRecord): Promise<GeoPoint | null> {
  const dbLat = pharmacy.latitude != null ? Number(pharmacy.latitude) : null;
  const dbLng = pharmacy.longitude != null ? Number(pharmacy.longitude) : null;
  if (hasUsableCoords(dbLat, dbLng)) {
    return { lat: dbLat!, lng: dbLng! };
  }

  const addressQuery = buildLocationQuery({
    name: pharmacy.name,
    address: pharmacy.address,
    city: pharmacy.city,
    province: pharmacy.province,
  });
  if (addressQuery) {
    const fromAddress = await geocodeQuery(addressQuery);
    if (fromAddress) return fromAddress;
  }

  const city = normalizePharmacyCity(pharmacy.city);
  if (city) {
    const fromCity = await geocodeCity(city);
    if (fromCity) return fromCity;
  }

  return null;
}

export async function fetchPharmacyShifts(pharmacyId: string): Promise<DailyShift[]> {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 1);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const supabase = getSupabase(import.meta.env);
  const { data, error } = await supabase
    .from('pharmacy_daily_shifts')
    .select('pharmacy_id, shift_date, shift_type, start_at, end_at, is_h24')
    .eq('pharmacy_id', pharmacyId)
    .gte('shift_date', fromIso)
    .lte('shift_date', toIso);
  if (error) return [];
  return (data ?? []) as DailyShift[];
}

export async function fetchPharmacyReviews(pharmacyId: string): Promise<PharmacyReview[]> {
  const supabase = getSupabase(import.meta.env);
  const { data, error } = await supabase
    .from('google_reviews_pg')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .order('created_at_g', { ascending: false })
    .limit(8);
  if (error) return [];
  return (data ?? []) as PharmacyReview[];
}

export async function fetchNearbyPharmacies(pharmacy: PharmacyRecord): Promise<NearbyPharmacy[]> {
  if (!pharmacy.id) return [];
  const supabase = getSupabase(import.meta.env);
  const select =
    'id,name,prontofarmacie_slug,city,province,rating_avg_cached,rating_count_cached,latitude,longitude';

  let cityRows: NearbyPharmacy[] = [];
  let geoRows: NearbyPharmacy[] = [];

  if (pharmacy.city && pharmacy.province) {
    const { data } = await supabase
      .from('paginegialle_pharmacies')
      .select(select)
      .neq('id', pharmacy.id)
      .eq('city', pharmacy.city)
      .eq('province', pharmacy.province)
      .not('prontofarmacie_slug', 'is', null)
      .limit(40);
    cityRows = (data ?? []) as NearbyPharmacy[];
  }

  const lat0 = pharmacy.latitude != null ? Number(pharmacy.latitude) : null;
  const lng0 = pharmacy.longitude != null ? Number(pharmacy.longitude) : null;
  const hasCoords =
    lat0 != null && lng0 != null && !Number.isNaN(lat0) && !Number.isNaN(lng0);

  if (hasCoords && pharmacy.province) {
    const { data } = await supabase
      .from('paginegialle_pharmacies')
      .select(select)
      .neq('id', pharmacy.id)
      .eq('province', pharmacy.province)
      .not('prontofarmacie_slug', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(80);
    geoRows = (data ?? []) as NearbyPharmacy[];
  }

  const merged = [...cityRows, ...geoRows].reduce<NearbyPharmacy[]>((acc, row) => {
    if (!acc.find((r) => r.id === row.id)) acc.push(row);
    return acc;
  }, []);

  return rankNearbyPharmacies(pharmacy, merged, { maxItems: 4, maxKm: 20 });
}

export function formatWebsite(url: string | null | undefined): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

export function ensureAbsoluteUrl(url: string, origin: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = origin.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
