import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import {
  bboxForRadiusKm,
  haversineKm,
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_PREFERRED_KM,
} from '@/lib/geoTurni';
import {
  fetchJobsForCity,
  fetchJobsForProvince,
  fetchJobsNearLocation,
  fetchLatestJobs,
  type JobListing,
} from '@/lib/jobs';
import { fetchNewsArticles, type NewsArticle } from '@/lib/news';
import { getSupabase } from '@/lib/supabase';
import type { IpGeoResult } from '@/lib/ipGeo';
import { slugifySegment } from '@/lib/turni';

export interface HomePharmacy {
  id: string;
  name: string;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  prontofarmacie_slug?: string | null;
  distanceKm?: number;
}

export type HomeJob = JobListing & { distanceKm?: number };

const HOME_NEAR_LIMIT = 6;
const HOME_JOBS_LIMIT = 3;
/** Gli annunci sono sparsi: fino a ~150 km dalla posizione IP. */
const HOME_JOBS_MAX_KM = 150;

/** Farmacie vicine a un punto (geo IP); priorità entro 10 km, estensione a 20 km. */
export async function fetchHomeNearbyPharmacies(
  lat: number,
  lng: number,
  limit = HOME_NEAR_LIMIT,
): Promise<HomePharmacy[]> {
  const key = `home:near:${lat.toFixed(2)}:${lng.toFixed(2)}:${limit}`;
  return cached(key, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { minLat, maxLat, minLng, maxLng } = bboxForRadiusKm(lat, lng, NEAR_ME_EXTENDED_MAX_KM);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select('id,name,city,province,address,prontofarmacie_slug,latitude,longitude')
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng)
      .not('prontofarmacie_slug', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(120);
    if (error) return [];

    const ranked = ((data ?? []) as Array<HomePharmacy & { latitude?: number | null; longitude?: number | null }>)
      .map((row) => {
        const plat = Number(row.latitude);
        const plng = Number(row.longitude);
        return {
          id: row.id,
          name: row.name,
          city: row.city,
          province: row.province,
          address: row.address,
          prontofarmacie_slug: row.prontofarmacie_slug,
          distanceKm: haversineKm(lat, lng, plat, plng),
        };
      })
      .filter((row) => row.distanceKm <= NEAR_ME_EXTENDED_MAX_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const preferred = ranked.filter((r) => r.distanceKm <= NEAR_ME_PREFERRED_KM);
    const picked = (preferred.length >= 3 ? preferred : ranked).slice(0, limit);
    return picked.map(({ distanceKm, ...rest }) => ({
      ...rest,
      distanceKm: Math.round(distanceKm * 10) / 10,
    }));
  });
}

function dominantProvinceCode(rows: HomePharmacy[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = (row.province || '').trim().toUpperCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [code, n] of counts) {
    if (n > bestN) {
      best = code;
      bestN = n;
    }
  }
  return best;
}

function dominantCitySlug(rows: HomePharmacy[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const slug = slugifySegment(row.city || '');
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [slug, n] of counts) {
    if (n > bestN) {
      best = slug;
      bestN = n;
    }
  }
  return best;
}

function mergeJobsUnique(primary: HomeJob[], secondary: JobListing[], limit: number): HomeJob[] {
  const seen = new Set(primary.map((j) => j.id));
  const out: HomeJob[] = [...primary];
  for (const job of secondary) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Offerte: geo (raggio ampio), poi città/provincia, poi nazionali. */
export async function fetchHomeJobs(
  geo?: IpGeoResult | null,
  provinceCode?: string | null,
  citySlug?: string | null,
): Promise<{ jobs: HomeJob[]; localized: boolean }> {
  const withDistance = (job: JobListing): HomeJob => {
    if (!geo) return job;
    const lat = job.pharmacy?.latitude != null ? Number(job.pharmacy.latitude) : NaN;
    const lng = job.pharmacy?.longitude != null ? Number(job.pharmacy.longitude) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return job;
    return {
      ...job,
      distanceKm: Math.round(haversineKm(geo.lat, geo.lng, lat, lng) * 10) / 10,
    };
  };

  const byDistance = (a: HomeJob, b: HomeJob) => {
    const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (b.date_posted || '').localeCompare(a.date_posted || '');
  };

  let localizedPool: HomeJob[] = [];

  if (geo) {
    const near = await fetchJobsNearLocation(geo.lat, geo.lng, HOME_JOBS_MAX_KM);
    localizedPool = near.jobs.map((job) => ({
      ...job,
      distanceKm: Math.round(job.distanceKm * 10) / 10,
    }));
  }

  if (localizedPool.length < HOME_JOBS_LIMIT && citySlug) {
    const cityJobs = (await fetchJobsForCity(citySlug, 24)).map(withDistance);
    localizedPool = mergeJobsUnique(localizedPool, cityJobs, 24);
  }

  if (localizedPool.length < HOME_JOBS_LIMIT && provinceCode) {
    const provinceJobs = (await fetchJobsForProvince(provinceCode, 24)).map(withDistance);
    localizedPool = mergeJobsUnique(localizedPool, provinceJobs, 24);
  }

  localizedPool.sort(byDistance);

  if (localizedPool.length > 0) {
    return { jobs: localizedPool.slice(0, HOME_JOBS_LIMIT), localized: true };
  }

  const latest = await fetchLatestJobs(HOME_JOBS_LIMIT);
  return { jobs: latest, localized: false };
}

export async function fetchHomeData(geo?: IpGeoResult | null) {
  const [pharmacies, news] = await Promise.all([
    geo ? fetchHomeNearbyPharmacies(geo.lat, geo.lng) : Promise.resolve([] as HomePharmacy[]),
    fetchNewsArticles({ limit: 3 }),
  ]);

  const provinceCode = dominantProvinceCode(pharmacies);
  const citySlug = dominantCitySlug(pharmacies);
  const { jobs, localized: jobsLocalized } = await fetchHomeJobs(geo, provinceCode, citySlug);

  return { pharmacies, news, jobs, jobsLocalized, geo: geo ?? null };
}

export type { NewsArticle, JobListing };
