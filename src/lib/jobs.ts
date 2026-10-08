import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import {
  bboxForRadiusKm,
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_MAX_RESULTS,
  rankPointsWithExtendedSearch,
} from '@/lib/geoTurni';
import { jobDetailPathFromSlug, normalizeJobSlug } from '@/lib/jobSlug';
import { getSupabase } from '@/lib/supabase';
import { toTitleCase } from '@/lib/locationUtils';
import { slugifySegment } from '@/lib/turni';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';

export interface JobListing {
  id: string;
  guid?: string | null;
  title: string;
  title_seo?: string | null;
  excerpt?: string | null;
  description_html?: string | null;
  description_enriched_html?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  date_posted?: string | null;
  valid_through?: string | null;
  contract_type?: string | null;
  category?: string | null;
  pharmacy?: {
    name?: string | null;
    city?: string | null;
    province?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    source_url?: string | null;
    prontofarmacie_url?: string | null;
    maps_url?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

export type JobApplicationEmailSource = 'annuncio' | 'farmacia';

export interface JobApplicationContact {
  email: string | null;
  emailSource: JobApplicationEmailSource | null;
  sourceSiteUrl: string | null;
  sourceSiteLabel: string | null;
}

export type JobListingWithDistance = JobListing & { distanceKm: number };

const JOB_PHARMACY_SELECT =
  'name,city,province,address,phone,email,website,source_url,prontofarmacie_url,maps_url,latitude,longitude';

/** Gli annunci restano visibili al massimo 60 giorni dalla data di pubblicazione. */
export const JOB_LISTING_MAX_AGE_DAYS = 60;

export function jobListingCutoffDateKey(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - JOB_LISTING_MAX_AGE_DAYS);
  return d.toISOString().slice(0, 10);
}

export function shouldIndexJobListingPage(roleSlug: string, jobCount: number): boolean {
  if (jobCount <= 0) return false;
  return roleSlug === 'tutte' || jobCount >= 2;
}

export function jobListingPath(
  citySlug: string,
  roleSlug: string,
  jobCount: number,
): string {
  const city = slugifySegment(citySlug || '') || 'tutta-italia';
  const role = slugifySegment(roleSlug || '') || 'tutte';
  if (!shouldIndexJobListingPage(role, jobCount)) {
    return `/lavoro/${city}/tutte/`;
  }
  return `/lavoro/${city}/${role}/`;
}

export function isJobListingWithinAge(
  job: Pick<JobListing, 'date_posted' | 'valid_through'>,
  now = new Date(),
): boolean {
  if (!job.date_posted) return false;
  const posted = new Date(job.date_posted);
  if (Number.isNaN(posted.getTime())) return false;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - JOB_LISTING_MAX_AGE_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  posted.setHours(0, 0, 0, 0);
  if (posted < cutoff) return false;

  if (job.valid_through) {
    const validThrough = new Date(job.valid_through);
    if (!Number.isNaN(validThrough.getTime())) {
      validThrough.setHours(23, 59, 59, 999);
      if (now > validThrough) return false;
    }
  }

  return true;
}

function filterActiveJobListings(jobs: JobListing[], now = new Date()): JobListing[] {
  return jobs.filter((job) => isJobListingWithinAge(job, now));
}

const JOB_GEO_SELECT =
  `id,guid,title,title_seo,excerpt,description_html,date_posted,contract_type,category,pharmacy:pharmacies(${JOB_PHARMACY_SELECT})`;

interface PgGeoRow {
  name?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const LLM_INTRO_RE = /^\s*(?:<p[^>]*>\s*)?(?:certo[,:\s]+)?ecco\s+(?:il\s+)?(?:contenuto|testo|frammento)\s+html.{0,500}?(?:indicazioni|richiesto|annuncio|offerta)[^.?!]*[.?!]\s*(?:<\/p>\s*)?/isu;
const LLM_INTRO_LINE_RE = /^\s*(?:<p[^>]*>\s*)?(?:certo[,:\s]+)?ecco\s+(?:il\s+)?(?:contenuto|testo|frammento)(?:\s+html)?\b[^<\n]*(?:<\/p>)?\s*/iu;

/** Placeholder Cloudflare / scraper: `[email protected]` (spazio, NBSP o &#160;). */
const CF_EMAIL_PLACEHOLDER_RE = /\[?\s*email(?:[\s\u00a0]+|&#160;|&nbsp;)*protected\s*\]?/giu;

/** Decodifica email offuscate da Cloudflare (`data-cfemail`). */
export function decodeCloudflareEmailHex(hex: string): string | null {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]{4,}$/.test(clean) || clean.length % 2 !== 0) return null;
  try {
    const key = Number.parseInt(clean.slice(0, 2), 16);
    let email = '';
    for (let i = 2; i < clean.length; i += 2) {
      email += String.fromCharCode(Number.parseInt(clean.slice(i, i + 2), 16) ^ key);
    }
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

function decodeCloudflareEmailsInHtml(html: string): string {
  return html
    .replace(
      /<a[^>]*\bdata-cfemail=["']([0-9a-fA-F]+)["'][^>]*>[\s\S]*?<\/a>/giu,
      (_full, hex: string) => decodeCloudflareEmailHex(hex) || '',
    )
    .replace(/\bdata-cfemail=["']([0-9a-fA-F]+)["']/giu, (_full, hex: string) => {
      const email = decodeCloudflareEmailHex(hex);
      return email || _full;
    });
}

export function cleanJobDescriptionHtml(html?: string | null): string {
  if (!html) return '';
  return decodeCloudflareEmailsInHtml(html)
    .replace(/```html\s*/giu, '')
    .replace(/```/gu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(LLM_INTRO_RE, '')
    .replace(LLM_INTRO_LINE_RE, '')
    // Cloudflare / LLM: testo letterale al posto dell'email
    .replace(CF_EMAIL_PLACEHOLDER_RE, '')
    // Markdown residuo da LLM (anche dentro HTML)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // Collassa solo spazi/tab ripetuti; lascia i newline per Markdown (##, liste)
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type JobDescriptionProcessor = Awaited<ReturnType<typeof createMarkdownProcessor>>;
let jobDescriptionProcessor: JobDescriptionProcessor | null = null;

async function getJobDescriptionProcessor(): Promise<JobDescriptionProcessor> {
  if (!jobDescriptionProcessor) {
    jobDescriptionProcessor = await createMarkdownProcessor({
      gfm: true,
      smartypants: false,
      syntaxHighlight: false,
    });
  }
  return jobDescriptionProcessor;
}

/** HTML pronto per set:html (Markdown LLM → HTML, HTML esistente invariato). */
export async function formatJobDescriptionHtml(source?: string | null): Promise<string> {
  const cleaned = cleanJobDescriptionHtml(source);
  if (!cleaned) return '';
  const processor = await getJobDescriptionProcessor();
  const { code } = await processor.render(cleaned);
  return code.trim();
}

const ROLE_CATEGORY_BY_SLUG: Record<string, string> = {
  farmacista: 'Farmacista',
  farmacisti: 'Farmacista',
  magazziniere: 'Magazzino',
  magazzino: 'Magazzino',
  direttore: 'Direzione',
  direzione: 'Direzione',
  vendite: 'Vendite',
  tutte: '',
};

export function roleCategoryFromSlug(roleSlug: string): string | null {
  const key = roleSlug.toLowerCase();
  if (key === 'tutte') return null;
  return ROLE_CATEGORY_BY_SLUG[key] || null;
}

export function formatCityLabel(citySlug: string): string {
  if (citySlug === 'tutta-italia') return 'Italia';
  return toTitleCase(citySlug.replace(/-/g, ' '));
}

/**
 * Match ruolo: category DB esatta, oppure titolo/SEO se category vuota
 * (es. import Farmalavoro senza category → “farmacista collaboratore_orio al serio”).
 */
export function matchesRole(job: JobListing, roleSlug: string): boolean {
  if (!roleSlug || roleSlug === 'tutte') return true;
  const expected = roleCategoryFromSlug(roleSlug);
  const jobCat = (job.category || '').trim();
  if (expected && jobCat && jobCat.toLowerCase() === expected.toLowerCase()) return true;

  const hay = `${jobCat} ${job.title || ''} ${job.title_seo || ''} ${job.excerpt || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const needle = roleSlug.replace(/-/g, ' ').toLowerCase();
  if (needle && hay.includes(needle)) return true;
  if (expected && hay.includes(expected.toLowerCase())) return true;
  // Annunci senza category: includi “farmacista” se il testo sembra un’offerta farmacista
  if (!jobCat && (needle === 'farmacista' || needle === 'farmacisti')) {
    return hay.includes('farmac') || hay.includes('collaborator');
  }
  return false;
}

/** Match città su token slug interi (evita “romano” → “roma”). */
function citySlugMatches(haystackSlug: string, citySlug: string): boolean {
  const haystack = (haystackSlug || '').toLowerCase().replace(/^-+|-+$/g, '');
  const needle = (citySlug || '').toLowerCase().replace(/^-+|-+$/g, '');
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;

  const hTokens = haystack.split('-').filter(Boolean);
  const nTokens = needle.split('-').filter(Boolean);
  if (!hTokens.length || !nTokens.length) return false;

  // "roma" matcha "genzano-di-roma" / "roma-est" come token intero
  if (nTokens.length === 1 && hTokens.includes(nTokens[0])) return true;
  // ricerca "genzano-di-roma" con città "genzano"
  if (hTokens.length === 1 && nTokens.includes(hTokens[0])) return true;
  if (haystack.startsWith(`${needle}-`) || haystack.endsWith(`-${needle}`)) return true;
  return false;
}

/** Match flessibile: città sede, titolo o nome (es. agenzie che cercano “Milano” da un’altra città). */
function matchesCity(job: JobListing, citySlug: string): boolean {
  if (citySlug === 'tutta-italia') return true;
  const tokens = [
    slugifySegment(job.pharmacy?.city || ''),
    slugifySegment(job.title_seo || ''),
    slugifySegment(job.title || ''),
    slugifySegment(job.pharmacy?.name || ''),
  ].filter(Boolean);
  return tokens.some((t) => citySlugMatches(t, citySlug));
}

/** Solo città della sede collegata all’annuncio (per mappa / Maps). */
export function jobPharmacyCityMatches(job: JobListing, citySlug: string): boolean {
  if (citySlug === 'tutta-italia') return true;
  const city = job.pharmacy?.city?.trim();
  if (!city) return false;
  return citySlugMatches(slugifySegment(city), citySlug);
}

/** Coordinate usabili sulla mappa della città cercata (esclude HQ fuori zona). */
export function jobHasMapCoordsInCity(job: JobListing, citySlug: string): boolean {
  const lat = job.pharmacy?.latitude != null ? Number(job.pharmacy.latitude) : Number.NaN;
  const lng = job.pharmacy?.longitude != null ? Number(job.pharmacy.longitude) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return jobPharmacyCityMatches(job, citySlug);
}

/**
 * Città da mostrare in elenco: preferisci la città della sede.
 * Solo se l’annuncio entra via titolo (agenzia) e la sede è fuori zona, mostra la località cercata.
 */
export function jobDisplayCity(job: JobListing, citySlug: string): string | null {
  const pharmacyCity = job.pharmacy?.city?.trim() || null;
  if (citySlug === 'tutta-italia') return pharmacyCity;
  if (jobPharmacyCityMatches(job, citySlug)) return pharmacyCity;
  if (pharmacyCity && matchesCity(job, citySlug)) return formatCityLabel(citySlug);
  return pharmacyCity;
}

function pharmacyLookupNeedle(name?: string | null): string {
  return (name || '')
    .replace(/\bfarmacia\b/giu, ' ')
    .replace(/\b(srl|s\.r\.l\.|sas|s\.a\.s\.|snc|s\.n\.c\.)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((part) => part.length > 2)
    .slice(0, 2)
    .join(' ')
    .trim();
}

/** Path interno scheda farmacia o lista città se la sede è collegata. */
export function jobPharmacyDetailHref(job: Pick<JobListing, 'pharmacy'>): string | null {
  const raw = job.pharmacy?.prontofarmacie_url?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, 'https://www.prontofarmacie.it');
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'prontofarmacie.it') return null;
    const farmacia = url.pathname.match(/^\/farmacia\/([^/]+)\/?$/i);
    if (farmacia?.[1]) return `/farmacia/${decodeURIComponent(farmacia[1])}/`;
    const lista = url.pathname.match(/^\/listafarmacie\/([^/]+)\/?$/i);
    if (lista?.[1]) return `/listafarmacie/${decodeURIComponent(lista[1])}/`;
    return null;
  } catch {
    return null;
  }
}

async function enrichJobPharmacyFromDirectory(job: JobListing): Promise<JobListing> {
  const pharmacy = job.pharmacy;
  if (!pharmacy) return job;

  const hasUsefulGeo =
    pharmacy.address ||
    (pharmacy.latitude != null && pharmacy.longitude != null) ||
    pharmacy.maps_url;
  const hasEmail = Boolean(pharmacy.email?.trim());
  const hasPfUrl = Boolean(pharmacy.prontofarmacie_url?.trim());
  if (hasUsefulGeo && hasEmail && hasPfUrl) return job;

  const city = pharmacy.city?.trim();
  const needle = pharmacyLookupNeedle(pharmacy.name);
  if (!city || !needle) return job;

  const supabase = getSupabase(import.meta.env);
  const { data, error } = await supabase
    .from('paginegialle_pharmacies')
    .select('address,city,province,phone,latitude,longitude,website,prontofarmacie_slug')
    .ilike('city', `%${city}%`)
    .ilike('name', `%${needle}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return job;

  const slug = (data as { prontofarmacie_slug?: string | null }).prontofarmacie_slug?.trim();
  const pfUrl =
    pharmacy.prontofarmacie_url ||
    (slug ? `https://www.prontofarmacie.it/farmacia/${slug}/` : null);

  return {
    ...job,
    pharmacy: {
      ...pharmacy,
      address: pharmacy.address || data.address || null,
      city: pharmacy.city || data.city || null,
      province: pharmacy.province || data.province || null,
      phone: pharmacy.phone || data.phone || null,
      website: pharmacy.website || data.website || null,
      latitude: pharmacy.latitude ?? data.latitude ?? null,
      longitude: pharmacy.longitude ?? data.longitude ?? null,
      prontofarmacie_url: pfUrl,
    },
  };
}

function resolveJobCoords(job: JobListing, pgInBBox: PgGeoRow[]): { lat: number; lng: number } | null {
  const lat = job.pharmacy?.latitude != null ? Number(job.pharmacy.latitude) : Number.NaN;
  const lng = job.pharmacy?.longitude != null ? Number(job.pharmacy.longitude) : Number.NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  const city = job.pharmacy?.city?.trim();
  const needle = pharmacyLookupNeedle(job.pharmacy?.name);
  if (!city || !needle) return null;

  const cityLower = city.toLowerCase();
  const match = pgInBBox.find(
    (pg) =>
      pg.city?.toLowerCase().includes(cityLower) &&
      pg.name?.toLowerCase().includes(needle.toLowerCase()) &&
      pg.latitude != null &&
      pg.longitude != null,
  );
  if (!match) return null;
  return { lat: Number(match.latitude), lng: Number(match.longitude) };
}

/** Annunci attivi vicino alla posizione: priorità 10 km, estensione fino a 20 km. */
export async function fetchJobsNearLocation(
  userLat: number,
  userLng: number,
  maxKm = NEAR_ME_EXTENDED_MAX_KM,
  roleSlug?: string | null,
): Promise<{ jobs: JobListingWithDistance[]; radiusKm: number; extended: boolean }> {
  const cacheKey = `jobs:near:${userLat.toFixed(3)}:${userLng.toFixed(3)}:${maxKm}:${roleSlug || 'all'}`;
  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { minLat, maxLat, minLng, maxLng } = bboxForRadiusKm(userLat, userLng, maxKm);
    const category = roleSlug ? roleCategoryFromSlug(roleSlug) : null;

    let jobsQuery = supabase
      .from('job_listings')
      .select(JOB_GEO_SELECT)
      .eq('is_active', true)
      .gte('date_posted', jobListingCutoffDateKey())
      .order('date_posted', { ascending: false })
      .limit(250);

    if (category) jobsQuery = jobsQuery.eq('category', category);

    const [{ data: pgData, error: pgError }, { data: jobsData, error: jobsError }] = await Promise.all([
      supabase
        .from('paginegialle_pharmacies')
        .select('name,city,province,address,phone,latitude,longitude')
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(400),
      jobsQuery,
    ]);

    if (jobsError) throw new Error(jobsError.message);
    if (pgError) throw new Error(pgError.message);

    const pgInBBox = (pgData ?? []) as PgGeoRow[];
    const jobs = filterActiveJobListings((jobsData ?? []) as JobListing[]);

    const points = jobs
      .map((job) => {
        const coords = resolveJobCoords(job, pgInBBox);
        if (!coords) return null;
        return { job, lat: coords.lat, lng: coords.lng, slug: job.id };
      })
      .filter((row): row is { job: JobListing; lat: number; lng: number; slug: string } => row != null);

    const { ranked, radiusKm, extended } = rankPointsWithExtendedSearch(points, userLat, userLng, {
      maxKm,
      maxResults: NEAR_ME_MAX_RESULTS,
    });

    return {
      jobs: ranked.map(({ job, km, lat, lng }) => ({
        ...job,
        distanceKm: km,
        pharmacy: {
          ...job.pharmacy,
          latitude: lat,
          longitude: lng,
        },
      })),
      radiusKm,
      extended,
    };
  });
}

export async function fetchJobsForCity(citySlug: string, limit = 4): Promise<JobListing[]> {
  const jobs = await fetchJobListings(citySlug, 'tutte');
  return jobs.slice(0, limit);
}

export async function fetchJobsForProvince(provinceCode: string, limit = 4): Promise<JobListing[]> {
  const code = provinceCode.toUpperCase();
  if (!code) return [];

  const cacheKey = `jobs:province:${code}:${limit}`;
  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('job_listings')
      .select(
        `id,guid,title,title_seo,excerpt,date_posted,contract_type,category,pharmacy:pharmacies(${JOB_PHARMACY_SELECT})`,
      )
      .eq('is_active', true)
      .gte('date_posted', jobListingCutoffDateKey())
      .order('date_posted', { ascending: false })
      .limit(120);

    if (error) return [];

    return filterActiveJobListings((data ?? []) as JobListing[])
      .filter((job) => job.pharmacy?.province?.toUpperCase() === code)
      .slice(0, limit);
  });
}

function jobMatchesPharmacyName(job: JobListing, pharmacyName: string): boolean {
  const needle = pharmacyLookupNeedle(pharmacyName).toLowerCase();
  const haystack = (job.pharmacy?.name || '').toLowerCase();
  if (!needle || !haystack) return false;
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

/** Annunci recenti per sede (match nome+città) con fallback agli annunci in città. */
export async function fetchJobsForPharmacy(
  citySlug: string,
  pharmacyName: string,
  limit = 4,
): Promise<{ jobs: JobListing[]; exactMatch: boolean }> {
  const cityJobs = await fetchJobListings(citySlug, 'tutte');
  const matched = cityJobs.filter((job) => jobMatchesPharmacyName(job, pharmacyName));
  if (matched.length) {
    return { jobs: matched.slice(0, limit), exactMatch: true };
  }
  return { jobs: cityJobs.slice(0, limit), exactMatch: false };
}

export async function fetchJobListings(citySlug: string, roleSlug: string): Promise<JobListing[]> {
  const cacheKey = `jobs:${citySlug}:${roleSlug}`;
  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);

    // Non filtrare category in SQL: molti annunci attivi hanno category NULL ma titolo “farmacista…”.
    const { data, error } = await supabase
      .from('job_listings')
      .select(
        `id,guid,title,title_seo,excerpt,description_html,date_posted,contract_type,category,source_name,pharmacy:pharmacies(${JOB_PHARMACY_SELECT})`,
      )
      .eq('is_active', true)
      .gte('date_posted', jobListingCutoffDateKey())
      .order('date_posted', { ascending: false })
      .limit(400);

    if (error) throw new Error(error.message);

    return filterActiveJobListings((data ?? []) as JobListing[])
      .filter((job) => matchesCity(job, citySlug))
      .filter((job) => matchesRole(job, roleSlug));
  });
}

export async function fetchLatestJobs(limit = 15): Promise<JobListing[]> {
  return cached(
    `jobs:latest:${limit}`,
    CACHE_TTL_TURNI_MS,
    async () => {
      const supabase = getSupabase(import.meta.env);
      const { data, error } = await supabase
        .from('job_listings')
        .select(
          'id,guid,title,title_seo,excerpt,date_posted,contract_type,category,pharmacy:pharmacies(name,city,province)',
        )
        .eq('is_active', true)
        .gte('date_posted', jobListingCutoffDateKey())
        .order('date_posted', { ascending: false })
        .limit(limit);
      if (error) return [];
      return filterActiveJobListings((data ?? []) as JobListing[]);
    },
    { store: (jobs) => jobs.length > 0 },
  );
}

/** Slug URL-safe per annuncio (senza slash iniziali/finali del guid Federfarma). */
export { normalizeJobSlug } from '@/lib/jobSlug';

function jobGuidLookupCandidates(id: string): string[] {
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    decoded = id;
  }

  const slug = normalizeJobSlug(decoded);
  const candidates = [decoded, slug, `/${slug}/`, `/${slug}`, `${slug}/`].filter(Boolean);
  return [...new Set(candidates)];
}

export async function fetchJobById(id: string): Promise<JobListing | null> {
  const slug = normalizeJobSlug(id);
  return cached(`job:${slug}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const select =
      `id,guid,title,title_seo,excerpt,description_html,description_enriched_html,date_posted,valid_through,contract_type,category,source_url,source_name,pharmacy:pharmacies(${JOB_PHARMACY_SELECT})`;

    for (const guid of jobGuidLookupCandidates(id)) {
      const { data, error } = await supabase
        .from('job_listings')
        .select(select)
        .eq('guid', guid)
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        const job = data as JobListing;
        return isJobListingWithinAge(job) ? enrichJobPharmacyFromDirectory(job) : null;
      }
      if (error) return null;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);
    if (!isUuid) return null;

    const { data, error } = await supabase
      .from('job_listings')
      .select(select)
      .eq('id', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return null;
    const job = data as JobListing;
    if (!isJobListingWithinAge(job)) return null;
    return enrichJobPharmacyFromDirectory(job);
  });
}

export function jobDetailPath(job: JobListing): string {
  return jobDetailPathFromSlug(job.guid || job.id);
}

/** Data pubblicazione formattata (es. "1 lug 2026"). */
export function formatJobPostedDate(datePosted?: string | null): string | null {
  if (!datePosted) return null;
  const date = new Date(datePosted);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
}

/** Etichetta data pubblicazione per card annuncio (es. "Pubblicato il 1 lug 2026"). */
export function formatJobPostedLabel(datePosted?: string | null): string | null {
  const formatted = formatJobPostedDate(datePosted);
  return formatted ? `Pubblicato il ${formatted}` : null;
}

const JOB_EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
const BLOCKED_JOB_EMAIL_DOMAINS = [
  'example.com',
  'prontofarmacie.it',
  'wordpress.com',
  'wix.com',
  'sentry.io',
  'farmalavoro.it',
];

function isBlockedJobEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.startsWith('noreply') || lower.startsWith('no-reply')) return true;
  return BLOCKED_JOB_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`) || lower.includes(`@${domain}`));
}

/** Estrae indirizzi email citati nel testo dell'annuncio. */
export function extractJobEmailsFromContent(...sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const source of sources) {
    if (!source) continue;

    const decoded = decodeCloudflareEmailsInHtml(source);

    for (const match of decoded.matchAll(/mailto:([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/gi)) {
      const email = match[1].toLowerCase();
      if (seen.has(email) || isBlockedJobEmail(email)) continue;
      seen.add(email);
      out.push(match[1]);
    }

    const text = decoded
      .replace(/<[^>]+>/g, ' ')
      .replace(CF_EMAIL_PLACEHOLDER_RE, ' ')
      .replace(/\(\s*at\s*\)|\[\s*at\s*\]/gi, '@')
      .replace(/\s+@\s+/g, '@');

    for (const match of text.matchAll(JOB_EMAIL_RE)) {
      const email = match[0].toLowerCase();
      if (seen.has(email) || isBlockedJobEmail(email)) continue;
      seen.add(email);
      out.push(match[0]);
    }
  }

  return out;
}

export function resolveJobSourceSite(
  job: Pick<JobListing, 'guid' | 'source_url' | 'source_name'>,
): { url: string; label: string } | null {
  const storedUrl = job.source_url?.trim();
  if (storedUrl) {
    return {
      url: storedUrl,
      label: job.source_name?.trim() || 'Sito di origine',
    };
  }
  if (job.guid?.startsWith('farmalavoro|')) {
    return { url: 'https://www.farmalavoro.it/offerte-lavoro/', label: 'Farmalavoro.it' };
  }
  return null;
}

export function resolveJobApplicationContact(job: JobListing): JobApplicationContact {
  const fromAnnuncio = extractJobEmailsFromContent(
    job.description_enriched_html,
    job.description_html,
    job.excerpt,
  );
  const pharmacyEmail = job.pharmacy?.email?.trim() || null;
  const sourceSite = resolveJobSourceSite(job);

  if (fromAnnuncio[0]) {
    return {
      email: fromAnnuncio[0],
      emailSource: 'annuncio',
      sourceSiteUrl: sourceSite?.url || job.pharmacy?.source_url || null,
      sourceSiteLabel: sourceSite?.label || null,
    };
  }

  if (pharmacyEmail && !isBlockedJobEmail(pharmacyEmail)) {
    return {
      email: pharmacyEmail,
      emailSource: 'farmacia',
      sourceSiteUrl: sourceSite?.url || job.pharmacy?.source_url || null,
      sourceSiteLabel: sourceSite?.label || null,
    };
  }

  return {
    email: null,
    emailSource: null,
    sourceSiteUrl: sourceSite?.url || job.pharmacy?.source_url || null,
    sourceSiteLabel: sourceSite?.label || null,
  };
}

export function buildJobApplicationMailto(
  job: JobListing,
  email: string,
): string {
  const subject = encodeURIComponent(
    `Candidatura: ${job.title_seo || job.title}${job.pharmacy?.name ? ` — ${job.pharmacy.name}` : ''}`,
  );
  const body = encodeURIComponent(
    `Buongiorno,\n\nDesidero candidarmi per la posizione "${job.title_seo || job.title}".\n\nIn allegato invio il mio curriculum vitae.\n\nCordiali saluti`,
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export function formatJobRoleSeoLabel(roleSlug: string): string {
  const key = roleSlug.toLowerCase();
  const labels: Record<string, string> = {
    farmacista: 'Farmacista',
    farmacisti: 'Farmacista',
    magazziniere: 'Magazziniere',
    magazzino: 'Magazziniere',
    direttore: 'Direttore',
    direzione: 'Direttore',
    vendite: 'Vendite',
  };
  if (labels[key]) return labels[key];
  const cat = roleCategoryFromSlug(roleSlug);
  if (cat) return cat;
  return formatCityLabel(roleSlug);
}

/**
 * Title SERP stile Indeed/Randstad:
 * "Offerte di lavoro Farmacista - Milano, Lombardia | ProntoFarmacie"
 */
export function buildLavoroSeoTitle(
  citySlug: string,
  roleSlug: string,
  options?: { regionLabel?: string | null },
): string {
  const brand = ' | ProntoFarmacie';
  const city = formatCityLabel(citySlug);
  const roleLabel = formatJobRoleSeoLabel(roleSlug);
  const region = options?.regionLabel?.trim() || '';
  const place =
    citySlug === 'tutta-italia'
      ? null
      : region && region.toLowerCase() !== city.toLowerCase()
        ? `${city}, ${region}`
        : city;

  if (citySlug === 'tutta-italia') {
    if (roleSlug === 'tutte') return `Offerte di lavoro in farmacia in Italia${brand}`;
    return `Offerte di lavoro ${roleLabel} in Italia${brand}`;
  }

  if (roleSlug === 'tutte') {
    return `Offerte di lavoro in farmacia - ${place}${brand}`;
  }
  return `Offerte di lavoro ${roleLabel} - ${place}${brand}`;
}

export function buildLavoroSeoDescription(
  citySlug: string,
  roleSlug: string,
  jobCount: number,
  options?: { regionLabel?: string | null },
): string {
  const city = formatCityLabel(citySlug);
  const roleLabel = formatJobRoleSeoLabel(roleSlug);
  const region = options?.regionLabel?.trim();
  const place =
    citySlug === 'tutta-italia'
      ? 'in tutta Italia'
      : region
        ? `a ${city} (${region})`
        : `a ${city}`;
  const roleBit = roleSlug === 'tutte' ? 'in farmacia' : `per ${roleLabel}`;
  const countBit = jobCount === 1 ? '1 offerta di lavoro' : `${jobCount} offerte di lavoro`;
  return `${countBit} ${roleBit} ${place}: contratti, telefono/email e candidature. Aggiornate da Farmalavoro e Federfarma.`;
}

/** Valori employmentType accettati da Google for Jobs. */
export type GoogleEmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACTOR'
  | 'TEMPORARY'
  | 'INTERN'
  | 'VOLUNTEER'
  | 'PER_DIEM'
  | 'OTHER';

export function mapJobEmploymentTypes(
  job: Pick<JobListing, 'contract_type' | 'title' | 'title_seo' | 'excerpt'>,
): GoogleEmploymentType[] {
  const blob = [job.contract_type, job.title_seo, job.title, job.excerpt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const types = new Set<GoogleEmploymentType>();
  const hasFull = /full[\s-]?time|tempo pieno|fulltime|\bfull\b/.test(blob);
  const hasPart = /part[\s-]?time|orario ridotto|\bpart\b/.test(blob);
  if (hasFull) types.add('FULL_TIME');
  if (hasPart) types.add('PART_TIME');
  if (/stage|tirocinio|intern/.test(blob)) types.add('INTERN');
  if (/collaboraz|partita\s*iva|p\.?\s*iva|contrattista|freelance/.test(blob)) {
    types.add('CONTRACTOR');
  }
  // Non matchare "indeterminato" come "determinato"
  if (/(?:^|[^a-z])determinato|sostituzione|temporane|interim|a termine/.test(blob)) {
    types.add('TEMPORARY');
  }
  if (/indeterminato/.test(blob) && !types.has('PART_TIME') && !types.has('FULL_TIME')) {
    types.add('FULL_TIME');
  }
  if (types.size === 0) types.add('OTHER');
  return [...types];
}

export function resolveJobValidThroughIso(
  job: Pick<JobListing, 'date_posted' | 'valid_through'>,
): string | null {
  if (job.valid_through) {
    const vt = new Date(job.valid_through);
    if (!Number.isNaN(vt.getTime())) {
      return `${vt.toISOString().slice(0, 10)}T23:59:59+02:00`;
    }
  }
  if (!job.date_posted) return null;
  const posted = new Date(job.date_posted);
  if (Number.isNaN(posted.getTime())) return null;
  posted.setDate(posted.getDate() + JOB_LISTING_MAX_AGE_DAYS);
  return `${posted.toISOString().slice(0, 10)}T23:59:59+02:00`;
}

export function buildJobPostingJsonLd(opts: {
  job: JobListing;
  descriptionHtml: string;
  canonicalUrl: string;
  lat?: number | null;
  lng?: number | null;
  hasCoordinates?: boolean;
  directApply?: boolean;
}): Record<string, unknown> {
  const { job, descriptionHtml, canonicalUrl } = opts;
  const pharmacyPath = jobPharmacyDetailHref(job);
  const rawOrgUrl =
    job.pharmacy?.website?.trim() ||
    (pharmacyPath ? `https://www.prontofarmacie.it${pharmacyPath}` : null) ||
    job.pharmacy?.prontofarmacie_url?.trim() ||
    'https://www.prontofarmacie.it/';
  const orgUrl = rawOrgUrl.replace(/^https?:\/\/prontofarmacie\.it(?=\/|$)/i, 'https://www.prontofarmacie.it');
  const employmentType = mapJobEmploymentTypes(job);
  const validThrough = resolveJobValidThroughIso(job);
  const datePosted = job.date_posted
    ? String(job.date_posted).slice(0, 10)
    : undefined;

  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title_seo || job.title,
    description: descriptionHtml || job.excerpt || job.title,
    datePosted,
    url: canonicalUrl,
    employmentType: employmentType.length === 1 ? employmentType[0] : employmentType,
    identifier: {
      '@type': 'PropertyValue',
      name: 'ProntoFarmacie',
      value: job.guid || job.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.pharmacy?.name || 'Farmacia',
      sameAs: orgUrl,
    },
    jobLocation: {
      '@type': 'Place',
      ...(opts.hasCoordinates && opts.lat != null && opts.lng != null
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: opts.lat,
              longitude: opts.lng,
            },
          }
        : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: job.pharmacy?.address || undefined,
        addressLocality: job.pharmacy?.city || undefined,
        addressRegion: job.pharmacy?.province || undefined,
        addressCountry: 'IT',
      },
    },
  };

  if (validThrough) posting.validThrough = validThrough;
  if (opts.directApply) posting.directApply = true;

  return posting;
}

