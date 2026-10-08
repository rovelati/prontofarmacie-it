import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { PROVINCES_BY_REGION } from '@/lib/locationUtils';
import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';
import { getSupabase } from '@/lib/supabase';

export interface TurniSourceInfo {
  slug: string;
  name: string;
  sourceUrl: string;
  description?: string | null;
  updatedAt?: string | null;
}

export function getRegionForProvinceCode(code: string): string | null {
  const upper = code.toUpperCase();
  for (const [region, codes] of Object.entries(PROVINCES_BY_REGION)) {
    if (codes.includes(upper)) return region;
  }
  return null;
}

function mapRow(row: {
  slug: string;
  name: string;
  source_url: string;
  description?: string | null;
  updated_at?: string | null;
}): TurniSourceInfo {
  return {
    slug: row.slug,
    name: row.name,
    sourceUrl: row.source_url,
    description: row.description,
    updatedAt: row.updated_at,
  };
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] ?? url;
  }
}

/** Fonti turni attive per provincia (e, se presente, regione). */
export async function fetchTurniSourcesForProvince(
  env: ImportMetaEnv,
  provinceCode: string,
): Promise<TurniSourceInfo[]> {
  const code = provinceCode.toUpperCase();
  if (!code) return [];

  const region = getRegionForProvinceCode(code);
  const cacheKey = `turni-sources:province:${code}:${region ?? ''}`;

  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(env);
    const orParts = [`province.eq.${code}`];
    if (region) orParts.push(`region.eq.${region}`);

    const { data, error } = await supabase
      .from('turni_sources')
      .select('slug,name,source_url,description,updated_at,priority')
      .eq('is_active', true)
      .or(orParts.join(','))
      .order('priority', { ascending: true })
      .order('name', { ascending: true });

    if (error) return [];
    return (data ?? []).map(mapRow);
  });
}

/** Fonte PharmAround o simili legata allo slug città (es. pharmaround-turni-bologna). */
export async function fetchTurniSourcesForCitySlug(
  env: ImportMetaEnv,
  citySlug: string,
): Promise<TurniSourceInfo[]> {
  const slug = citySlug.toLowerCase().trim();
  if (!slug) return [];

  const cacheKey = `turni-sources:city:${slug}`;

  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('turni_sources')
      .select('slug,name,source_url,description,updated_at,priority')
      .eq('is_active', true)
      .eq('slug', `pharmaround-turni-${slug}`)
      .limit(1);

    if (error) return [];
    return (data ?? []).map(mapRow);
  });
}

export function mergeTurniSources(...groups: TurniSourceInfo[][]): TurniSourceInfo[] {
  const seen = new Set<string>();
  const merged: TurniSourceInfo[] = [];
  for (const group of groups) {
    for (const source of group) {
      if (seen.has(source.slug)) continue;
      seen.add(source.slug);
      merged.push(source);
    }
  }
  return merged;
}

/** True se la fonte è PharmAround (mostriamo solo la data, non il nome fonte). */
export function isPharmAroundSource(slug: string | null | undefined): boolean {
  return Boolean(slug?.startsWith('pharmaround-turni-') || slug === 'pharmaround');
}

/** Etichetta pubblica della fonte (es. Federfarma Lombardia + provincia). */
export function formatTurniSourceDisplayName(
  source: Pick<TurniSourceInfo, 'slug' | 'name'>,
  provinceCode?: string | null,
): string {
  if (source.slug === 'federfarma-lombardia') {
    const code = provinceCode?.trim().toUpperCase();
    const provinceLabel = code ? PROVINCE_NAME_BY_CODE[code] : null;
    if (provinceLabel) return `Federfarma ${provinceLabel}`;
    return 'Federfarma Lombardia';
  }
  return source.name;
}

export async function fetchTurniSourceById(
  env: ImportMetaEnv,
  sourceId: number | string | null | undefined,
): Promise<TurniSourceInfo | null> {
  const id = typeof sourceId === 'string' ? Number(sourceId) : sourceId;
  if (id == null || !Number.isFinite(id) || id <= 0) return null;

  const cacheKey = `turni-sources:id:${id}`;
  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('turni_sources')
      .select('slug,name,source_url,description,updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  });
}

export interface TurniAttribution {
  updatedLabel: string;
  showSource: boolean;
  sourceName?: string;
  sourceUrl?: string;
}

/**
 * Badge scheda farmacia: data aggiornamento turni + fonte ufficiale.
 * PharmAround: solo data (niente nome fonte).
 */
export function buildTurniAttribution(input: {
  updatedAt?: string | null;
  source?: TurniSourceInfo | null;
  provinceCode?: string | null;
  now?: Date;
}): TurniAttribution | null {
  const updatedAt = input.updatedAt;
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const now = input.now ?? new Date();
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
  const updatedLabel =
    ageMs <= 36 * 3600000
      ? `Turni aggiornati oggi alle ${timePart}`
      : `Turni aggiornati il ${datePart} alle ${timePart}`;

  const source = input.source;
  if (!source?.slug || isPharmAroundSource(source.slug)) {
    return { updatedLabel, showSource: false };
  }

  return {
    updatedLabel,
    showSource: true,
    sourceName: formatTurniSourceDisplayName(source, input.provinceCode),
    sourceUrl: source.sourceUrl || undefined,
  };
}

export function latestSourceUpdatedAt(sources: TurniSourceInfo[]): Date | null {
  let latest: Date | null = null;
  for (const source of sources) {
    if (!source.updatedAt) continue;
    const d = new Date(source.updatedAt);
    if (Number.isNaN(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}
