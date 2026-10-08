import type { PharmacyMapPoint } from '@/components/TurniMapIsland';
import { cached, CACHE_TTL_TURNI_MS, invalidateCacheByPrefix } from '@/lib/cache';
import {
  cityMatchesSlugExactly,
  filterCityPharmaciesByProvince,
} from '@/lib/cityProvinceDisambiguation';
import {
  bboxForRadiusKm,
  haversineKm,
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_MAX_RESULTS,
  NEAR_ME_PREFERRED_KM,
  rankPointsWithExtendedSearch,
} from '@/lib/geoTurni';
import { geocodeCity, geocodeQuery, type GeoPoint } from '@/lib/geocode';
import { syncPharmAroundCityOnDemand } from '@/lib/pharmaroundOnDemand';
import { localDb, query } from '@/lib/local-db';
import { getSupabase } from '@/lib/supabase';
import {
  FRAZIONE_TO_PARENT_CITY,
  citySlugLookupCandidates,
  pharmacyBelongsToProvince,
} from '@/lib/turni';
import {
  getPharmacyStatus,
  groupDailyShifts,
  type DailyShift,
  type PharmacyStatus,
} from '@/lib/turniStatus';
import { getTurniQueryMode, type TurniQueryMode } from '@/lib/turniQueryMode';

export type { PharmacyStatus, TurniQueryMode };
export { getTurniQueryMode };

export interface PharmacyRow {
  id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  opening_hours?: unknown;
  prontofarmacie_slug?: string | null;
  turni_updated_at?: string | null;
  status: PharmacyStatus;
}

const SELECT_COLS =
  'id,name,address,phone,city,city_slug,province,latitude,longitude,opening_hours,prontofarmacie_slug,turni_updated_at';

/** Max farmacie nel bbox nearby: le più vicine, non un campione arbitrario. */
const BBOX_NEAREST_LIMIT = 250;

type RawPharmacy = Omit<PharmacyRow, 'status'> & { city_slug?: string | null };

function romeNow(): Date {
  return new Date();
}

function shiftDateRange(now: Date): { from: string; to: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { from: fmt(yesterday), to: fmt(tomorrow) };
}

function turniSourcePrioritySql(alias = 'ts'): string {
  return `CASE
    WHEN ${alias}.slug = 'federfarma-lombardia' THEN 0
    WHEN ${alias}.slug LIKE 'ordine-farmacisti%' THEN 1
    WHEN ${alias}.slug LIKE 'aulss%' THEN 1
    WHEN ${alias}.slug LIKE 'pharmaround%' THEN 90
    ELSE 40
  END`;
}

async function fetchDailyShifts(pharmacyIds: string[], fromDate: string): Promise<DailyShift[]> {
  if (!pharmacyIds.length) return [];
  const idsKey = [...pharmacyIds].sort().join(',');

  // DB locale: top fonti per farmacia (Federfarma/Ordini prima dei sync secondari).
  if (localDb) {
    const cacheKey = `shifts:local:${fromDate}:${idsKey}`;
    return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
      const { rows } = await query<{
        pharmacy_id: string;
        shift_date: string;
        shift_type: string | null;
        start_at: Date | string;
        end_at: Date | string;
        is_h24: boolean | null;
        source_priority: number;
      }>(
        `WITH ranked AS (
           SELECT
             s.pharmacy_id::text AS pharmacy_id,
             s.shift_date::text AS shift_date,
             s.shift_type,
             s.start_at,
             s.end_at,
             s.is_h24,
             ${turniSourcePrioritySql('ts')} AS source_priority,
             ROW_NUMBER() OVER (
               PARTITION BY s.pharmacy_id
               ORDER BY
                 ${turniSourcePrioritySql('ts')} ASC,
                 s.updated_at DESC NULLS LAST,
                 s.start_at ASC
             ) AS rn
           FROM pharmacy_daily_shifts s
           LEFT JOIN turni_sources ts ON ts.id = s.turni_source_id
           WHERE s.pharmacy_id = ANY($1::uuid[])
             AND s.shift_date >= $2::date
             AND s.end_at >= NOW() - INTERVAL '1 hour'
         )
         SELECT pharmacy_id, shift_date, shift_type, start_at, end_at, is_h24, source_priority
         FROM ranked
         WHERE rn <= 3`,
        [pharmacyIds, fromDate],
      );
      return rows.map((r) => ({
        pharmacy_id: r.pharmacy_id,
        shift_date: r.shift_date,
        shift_type: r.shift_type,
        is_h24: r.is_h24,
        source_priority: r.source_priority,
        start_at: r.start_at instanceof Date ? r.start_at.toISOString() : String(r.start_at),
        end_at: r.end_at instanceof Date ? r.end_at.toISOString() : String(r.end_at),
      }));
    });
  }

  const supabase = getSupabase(import.meta.env);
  const chunkSize = 40;
  const chunks: string[][] = [];

  for (let offset = 0; offset < pharmacyIds.length; offset += chunkSize) {
    const chunk = pharmacyIds.slice(offset, offset + chunkSize);
    if (chunk.length) chunks.push(chunk);
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const cacheKey = `shifts:${chunk.join(',')}:${fromDate}`;
      return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
        const { data, error } = await supabase
          .from('pharmacy_daily_shifts')
          .select('pharmacy_id,shift_date,shift_type,start_at,end_at,is_h24')
          .in('pharmacy_id', chunk)
          .gte('shift_date', fromDate)
          .order('shift_date', { ascending: true })
          .order('start_at', { ascending: true })
          .limit(2000);
        if (error) throw new Error(error.message);
        return (data ?? []) as DailyShift[];
      });
    }),
  );

  return chunkResults.flat();
}

function sortOpenPharmacies(rows: PharmacyRow[]): PharmacyRow[] {
  return [...rows].sort((a, b) => {
    const aOfficial = a.status.hasOfficialShift ? 1 : 0;
    const bOfficial = b.status.hasOfficialShift ? 1 : 0;
    if (aOfficial !== bOfficial) return bOfficial - aOfficial;
    return a.name.localeCompare(b.name, 'it');
  });
}

function sortOrdinaryList(rows: PharmacyRow[]): PharmacyRow[] {
  return [...rows].sort((a, b) => {
    const aOpen = a.status.isOpen ? 1 : 0;
    const bOpen = b.status.isOpen ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return a.name.localeCompare(b.name, 'it');
  });
}

function enrichAllWithOpeningHours(rawRows: RawPharmacy[], now: Date): PharmacyRow[] {
  const rows: PharmacyRow[] = [];
  for (const row of rawRows) {
    const status = getPharmacyStatus(row, [], now);
    rows.push({ ...row, status });
  }
  return sortOrdinaryList(rows);
}

function enrichOpenOnly(rawRows: RawPharmacy[], shifts: DailyShift[], now: Date): PharmacyRow[] {
  const grouped = groupDailyShifts(shifts);
  const open: PharmacyRow[] = [];
  for (const row of rawRows) {
    // Solo turni ufficiali: niente fallback su opening_hours (es. Ferragosto).
    const status = getPharmacyStatus(row, grouped[row.id] ?? [], now, {
      allowOrdinaryFallback: false,
    });
    if (!status.isOpen) continue;
    open.push({ ...row, status });
  }
  return sortOpenPharmacies(open);
}

async function queryPharmaciesByCity(citySlug: string): Promise<RawPharmacy[]> {
  const supabase = getSupabase(import.meta.env);
  return cached(`city:${citySlug}`, CACHE_TTL_TURNI_MS, async () => {
    let rows: RawPharmacy[] = [];
    const seen = new Set<string>();
    const candidates = citySlugLookupCandidates(citySlug);

    for (const slug of candidates) {
      const { data: bySlug, error: e1 } = await supabase
        .from('paginegialle_pharmacies')
        .select(SELECT_COLS)
        .eq('city_slug', slug)
        .limit(200);
      if (e1) throw new Error(e1.message);
      for (const row of (bySlug ?? []) as RawPharmacy[]) {
        if (!seen.has(row.id)) {
          rows.push(row);
          seen.add(row.id);
        }
      }
    }

    if (rows.length < 5) {
      for (const slug of candidates) {
        const prefix = slug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const { data: byPrefix, error: e2 } = await supabase
          .from('paginegialle_pharmacies')
          .select(SELECT_COLS)
          .ilike('city', `${prefix}%`)
          .limit(100);
        if (e2) throw new Error(e2.message);
        for (const row of (byPrefix ?? []) as RawPharmacy[]) {
          // Solo match esatto di slug città (niente "Bari%" → Bari Sardo).
          if (!candidates.some((c) => cityMatchesSlugExactly(row, c))) continue;
          if (!seen.has(row.id)) {
            rows.push(row);
            seen.add(row.id);
          }
        }
      }
    }

    if (rows.length === 0 && FRAZIONE_TO_PARENT_CITY[citySlug]) {
      const parent = FRAZIONE_TO_PARENT_CITY[citySlug];
      const { data: parentRows, error: e3 } = await supabase
        .from('paginegialle_pharmacies')
        .select(SELECT_COLS)
        .eq('city_slug', parent)
        .limit(200);
      if (e3) throw new Error(e3.message);
      rows = (parentRows ?? []) as RawPharmacy[];
    }

    return filterCityPharmaciesByProvince(rows, citySlug);
  });
}

async function queryPharmaciesByProvince(provinceCode: string): Promise<RawPharmacy[]> {
  const supabase = getSupabase(import.meta.env);
  return cached(`prov:${provinceCode}`, CACHE_TTL_TURNI_MS, async () => {
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select(SELECT_COLS)
      .eq('province', provinceCode.toUpperCase())
      .order('name', { ascending: true })
      .limit(400);
    if (error) throw new Error(error.message);
    return ((data ?? []) as RawPharmacy[]).filter((row) =>
      pharmacyBelongsToProvince(row, provinceCode),
    );
  });
}

function hasValidCoords(row: Pick<PharmacyRow, 'latitude' | 'longitude'>): boolean {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  // Bounding box approssimativo Italia (inclusi territori principali)
  if (lat < 35 || lat > 48 || lng < 6 || lng > 19) return false;
  return true;
}

function averageCoords(rows: Pick<PharmacyRow, 'latitude' | 'longitude'>[]): GeoPoint | null {
  const valid = rows.filter(hasValidCoords);
  if (!valid.length) return null;
  const lat = valid.reduce((sum, row) => sum + Number(row.latitude), 0) / valid.length;
  const lng = valid.reduce((sum, row) => sum + Number(row.longitude), 0) / valid.length;
  return { lat, lng };
}

async function fetchCityCenterFromDb(citySlug: string): Promise<GeoPoint | null> {
  const slug = citySlug.trim().toLowerCase();
  if (!slug) return null;

  return cached(`city-center-db:${slug}`, CACHE_TTL_TURNI_MS * 24, async () => {
    const supabase = getSupabase(import.meta.env);
    const points: Pick<PharmacyRow, 'latitude' | 'longitude'>[] = [];
    for (const candidate of citySlugLookupCandidates(slug)) {
      const { data, error } = await supabase
        .from('paginegialle_pharmacies')
        .select('latitude,longitude')
        .eq('city_slug', candidate)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(80);
      if (error) throw new Error(error.message);
      points.push(...((data ?? []) as Pick<PharmacyRow, 'latitude' | 'longitude'>[]));
    }
    return averageCoords(points);
  }).catch(() => null);
}

async function resolveRowCoordinates(row: RawPharmacy, batchCenter: GeoPoint | null): Promise<GeoPoint | null> {
  const addressQuery = [row.address, row.city, row.province, 'Italia'].filter(Boolean).join(', ');
  let coords = addressQuery ? await geocodeQuery(addressQuery) : null;
  if (!coords && row.city) {
    coords = await geocodeCity(row.city);
  }
  if (!coords && row.city_slug) {
    coords = await fetchCityCenterFromDb(row.city_slug);
  }
  return coords ?? batchCenter;
}

async function enrichTurniRowsCoordinates(
  rows: PharmacyRow[],
  options: { skipGeocode?: boolean } = {},
): Promise<PharmacyRow[]> {
  const skipGeocode = options.skipGeocode ?? false;
  const enriched: PharmacyRow[] = [];

  for (const row of rows) {
    if (hasValidCoords(row)) {
      enriched.push(row);
      continue;
    }

    if (skipGeocode) {
      enriched.push(row);
      continue;
    }

    const coords = await resolveRowCoordinates(row as RawPharmacy, null);
    enriched.push(coords ? { ...row, latitude: coords.lat, longitude: coords.lng } : row);
  }

  const batchCenter = averageCoords(enriched);
  if (!batchCenter) return enriched;

  return enriched.map((row) =>
    hasValidCoords(row) ? row : { ...row, latitude: batchCenter.lat, longitude: batchCenter.lng },
  );
}

export async function resolveTurniMapFallbackCenter(
  rows: PharmacyRow[],
  cityLabel?: string | null,
  citySlug?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (toMapPoints(rows).length > 0) return null;

  const slug =
    citySlug?.trim().toLowerCase() ||
    (rows[0] as RawPharmacy | undefined)?.city_slug?.trim().toLowerCase() ||
    null;
  if (slug) {
    const fromDb = await fetchCityCenterFromDb(slug);
    if (fromDb) return fromDb;
  }

  if (cityLabel) {
    const fromGeo = await geocodeCity(cityLabel);
    if (fromGeo) return fromGeo;
  }

  const firstCity = rows.find((r) => r.city?.trim())?.city;
  return firstCity ? geocodeCity(firstCity) : null;
}

/** Provincia dominante per uno city_slug (anche se nessuna farmacia è aperta ora). */
export async function resolveProvinceCodeForCitySlug(citySlug: string): Promise<string | null> {
  const rows = await queryPharmaciesByCity(citySlug);
  return dominantProvince(rows);
}

/** Farmacie del comune (senza filtro aperte ora), per messaggistica e SEO. */
export async function countPharmaciesInCity(citySlug: string): Promise<number> {
  const rows = await queryPharmaciesByCity(citySlug);
  return rows.length;
}

async function fetchPharmaciesForListing(
  rawRows: RawPharmacy[],
  mode: TurniQueryMode,
  now: Date,
): Promise<PharmacyRow[]> {
  if (mode === 'ordinary') {
    const all = enrichAllWithOpeningHours(rawRows, now);
    return enrichTurniRowsCoordinates(all, { skipGeocode: true });
  }

  const ids = rawRows.map((r) => r.id).filter(Boolean);
  const { from } = shiftDateRange(now);
  const shifts = await fetchDailyShifts(ids, from);
  const open = enrichOpenOnly(rawRows, shifts, now);
  return enrichTurniRowsCoordinates(open);
}

export interface CityNearbySearchMeta {
  radiusKm: number;
  extended: boolean;
  center: GeoPoint;
  distanceBySlug: Record<string, number>;
}

export interface FetchOpenPharmaciesByCityResult {
  rows: PharmacyRow[];
  /** Se nel comune non c’è nessuna aperta, risultati entro 10 km (esteso fino a 20 km). */
  nearbySearch?: CityNearbySearchMeta;
}

function dominantProvince(rows: Pick<RawPharmacy, 'province'>[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = row.province?.trim().toUpperCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [code, count] of counts) {
    if (count > max) {
      best = code;
      max = count;
    }
  }
  return best;
}

async function resolveCitySearchCenter(
  citySlug: string,
  rawRows: RawPharmacy[],
): Promise<GeoPoint | null> {
  const provinceCode = dominantProvince(rawRows);
  const fromRows = averageCoords(
    provinceCode
      ? rawRows.filter((row) => row.province?.trim().toUpperCase() === provinceCode)
      : rawRows,
  );
  if (fromRows) return fromRows;

  const fromDb = await fetchCityCenterFromDb(citySlug);
  if (fromDb) return fromDb;

  const cityLabel = resolveCityLabel(rawRows, citySlug);
  if (cityLabel && provinceCode) {
    const fromGeo = await geocodeQuery(`${cityLabel}, ${provinceCode}, Italia`);
    if (fromGeo) return fromGeo;
  }

  if (cityLabel) {
    const fromGeo = await geocodeCity(cityLabel);
    if (fromGeo) return fromGeo;
  }

  return null;
}

export async function fetchOpenPharmaciesByCity(
  citySlug: string,
): Promise<FetchOpenPharmaciesByCityResult> {
  const now = romeNow();
  const mode = getTurniQueryMode(now);
  let rawRows = await queryPharmaciesByCity(citySlug);
  let rows = await fetchPharmaciesForListing(rawRows, mode, now);
  let openInCity = rows.filter((row) => row.status.isOpen);

  const refreshAfterSync = async () => {
    invalidateCacheByPrefix(`city:${citySlug}`);
    invalidateCacheByPrefix('shifts:');
    invalidateCacheByPrefix('bbox:');
    rawRows = await queryPharmaciesByCity(citySlug);
    rows = await fetchPharmaciesForListing(rawRows, mode, now);
    openInCity = rows.filter((row) => row.status.isOpen);
  };

  // Turno a zero in città, oppure nessuna aperta entro 10 km: una sola verifica on-demand
  // (rispetta cooldown 10 min — niente force a ogni pageview).
  let didAttemptSync = false;
  if (openInCity.length === 0 && mode === 'shift') {
    const sync = await syncPharmAroundCityOnDemand(citySlug);
    didAttemptSync = sync.attempted || Boolean(sync.skippedReason);
    if (sync.upserted > 0 || sync.created > 0) {
      await refreshAfterSync();
    }
  }

  if (openInCity.length > 0) {
    return { rows };
  }

  const center = await resolveCitySearchCenter(citySlug, rawRows);
  if (!center) {
    return { rows };
  }

  let near = await fetchOpenPharmaciesNearLocation(center.lat, center.lng);
  const withinPreferred = near.rows.filter(
    (r) => Number.isFinite(r.distanceKm) && r.distanceKm <= NEAR_ME_PREFERRED_KM,
  );

  // Solo se non abbiamo già tentato il sync in questa richiesta (es. città aveva
  // risultati chiusi ma nearby > 10 km — caso raro). Mai force: rispetta cooldown.
  if (withinPreferred.length === 0 && mode === 'shift' && !didAttemptSync) {
    const sync = await syncPharmAroundCityOnDemand(citySlug);
    if (sync.upserted > 0 || sync.created > 0) {
      await refreshAfterSync();
      if (openInCity.length > 0) {
        return { rows };
      }
      near = await fetchOpenPharmaciesNearLocation(center.lat, center.lng);
    }
  }

  if (near.rows.length === 0) {
    return { rows };
  }

  return {
    rows: near.rows,
    nearbySearch: {
      radiusKm: near.radiusKm,
      extended: near.extended,
      center,
      distanceBySlug: Object.fromEntries(
        near.rows.map((r) => [r.prontofarmacie_slug || '', r.distanceKm]),
      ),
    },
  };
}

export async function fetchOpenPharmaciesByProvince(provinceCode: string): Promise<PharmacyRow[]> {
  const now = romeNow();
  const mode = getTurniQueryMode(now);
  const rawRows = await queryPharmaciesByProvince(provinceCode);
  return fetchPharmaciesForListing(rawRows, mode, now);
}

async function queryPharmaciesInBBox(
  lat: number,
  lng: number,
  maxKm: number,
): Promise<RawPharmacy[]> {
  const { minLat, maxLat, minLng, maxLng } = bboxForRadiusKm(lat, lng, maxKm);
  const cacheKey = `bbox:${lat.toFixed(3)}:${lng.toFixed(3)}:${maxKm}:nearest`;

  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    // Preferisci le più vicine (Brianza/Milano: il bbox 20 km supera facilmente 400 schede).
    if (localDb) {
      const { rows } = await query<RawPharmacy>(
        `SELECT id, name, address, phone, city, city_slug, province,
                latitude, longitude, opening_hours, prontofarmacie_slug, turni_updated_at
         FROM paginegialle_pharmacies
         WHERE latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND coalesce(source_status,'') <> 'LOST'
           AND latitude BETWEEN $1 AND $2
           AND longitude BETWEEN $3 AND $4
         ORDER BY (
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS((latitude::float - $5) / 2)), 2) +
             COS(RADIANS($5)) * COS(RADIANS(latitude::float)) *
             POWER(SIN(RADIANS((longitude::float - $6) / 2)), 2)
           ))
         ) ASC
         LIMIT $7`,
        [minLat, maxLat, minLng, maxLng, lat, lng, BBOX_NEAREST_LIMIT],
      );
      return rows.filter((r) => {
        const d = haversineKm(lat, lng, Number(r.latitude), Number(r.longitude));
        return d <= maxKm;
      });
    }

    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select(SELECT_COLS)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(800);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RawPharmacy[];
    return rows
      .map((r) => ({
        row: r,
        km: haversineKm(lat, lng, Number(r.latitude), Number(r.longitude)),
      }))
      .filter((x) => Number.isFinite(x.km) && x.km <= maxKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, BBOX_NEAREST_LIMIT)
      .map((x) => x.row);
  });
}

/** Farmacie aperte: priorità 10 km, estensione fino a 20 km se servono più risultati. */
export async function fetchOpenPharmaciesNearLocation(
  lat: number,
  lng: number,
  maxKm = NEAR_ME_EXTENDED_MAX_KM,
): Promise<{
  rows: (PharmacyRow & { distanceKm: number })[];
  radiusKm: number;
  extended: boolean;
}> {
  const now = romeNow();
  const mode = getTurniQueryMode(now);
  const rawRows = await queryPharmaciesInBBox(lat, lng, maxKm);

  let openRows: PharmacyRow[];
  if (mode === 'ordinary') {
    openRows = enrichAllWithOpeningHours(rawRows, now).filter((row) => row.status.isOpen);
  } else {
    const ids = rawRows.map((r) => r.id).filter(Boolean);
    const { from } = shiftDateRange(now);
    const shifts = await fetchDailyShifts(ids, from);
    openRows = enrichOpenOnly(rawRows, shifts, now);
  }

  const points = openRows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      row: r,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      slug: r.prontofarmacie_slug || '',
    }));

  const { ranked, radiusKm, extended } = rankPointsWithExtendedSearch(
    points,
    lat,
    lng,
    { maxKm, maxResults: NEAR_ME_MAX_RESULTS },
  );

  return {
    rows: ranked.map(({ row, km }) => ({ ...row, distanceKm: km })),
    radiusKm,
    extended,
  };
}

export {
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_EXTENDED_MAX_KM as NEAR_ME_MAX_KM,
  NEAR_ME_PREFERRED_KM,
} from '@/lib/geoTurni';

export function toMapPoints(rows: PharmacyRow[]): PharmacyMapPoint[] {
  return rows
    .filter((r) => hasValidCoords(r))
    .map((r) => ({
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      name: r.name,
      address: r.address,
      slug: r.prontofarmacie_slug || '',
      statusLabel: r.status.label,
      statusDetail: r.status.detail,
    }));
}

/**
 * Esclude pin geocodificati fuori zona (es. farmacia MN con coords in Brianza)
 * così fitBounds della mappa provincia resta sull’inquadratura corretta.
 */
export function filterMapPointsNearCluster(
  points: PharmacyMapPoint[],
  maxKmFromMedian = 75,
): PharmacyMapPoint[] {
  if (points.length <= 2) return points;
  const lats = [...points.map((p) => p.lat)].sort((a, b) => a - b);
  const lngs = [...points.map((p) => p.lng)].sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  const medLat = points.length % 2 ? lats[mid] : (lats[mid - 1] + lats[mid]) / 2;
  const medLng = points.length % 2 ? lngs[mid] : (lngs[mid - 1] + lngs[mid]) / 2;
  const kept = points.filter((p) => haversineKm(medLat, medLng, p.lat, p.lng) <= maxKmFromMedian);
  return kept.length >= Math.min(3, points.length) ? kept : points;
}

export function latestUpdatedAt(rows: PharmacyRow[]): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (!row.turni_updated_at) continue;
    const d = new Date(row.turni_updated_at);
    if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
  }
  return latest;
}

export function showUpdatedBadge(updatedAt: Date | null, now = new Date()): boolean {
  if (!updatedAt) return false;
  const ageMs = now.getTime() - updatedAt.getTime();
  return ageMs >= 0 && ageMs <= 7 * 86400000;
}

export function resolveCityLabel(rows: PharmacyRow[], citySlug: string): string {
  if (rows.length > 0 && rows[0].city) return rows[0].city;
  return citySlug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function resolveCityMetaFromSlug(
  citySlug: string,
): Promise<{ cityLabel: string; provinceCode: string | null }> {
  const rows = await queryPharmaciesByCity(citySlug);
  return {
    cityLabel: resolveCityLabel(rows, citySlug),
    provinceCode: rows[0]?.province?.toUpperCase() ?? null,
  };
}
