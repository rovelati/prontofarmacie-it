import type { ListaContext, ListaPharmacyItem } from '@/lib/listafarmacie';
import { listaPageUrl } from '@/lib/listafarmacie';
import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { toTitleCase } from '@/lib/locationUtils';
import { getSupabase } from '@/lib/supabase';
import { cityTurniUrl, slugifySegment } from '@/lib/turni';

/** Comuni vicini curati per slug città/provincia (priorità SEO). */
const NEARBY_CITIES_BY_SLUG: Record<string, string[]> = {
  varese: ['Azzate', 'Sesto Calende', 'Vergiate', 'Gallarate', 'Busto Arsizio', 'Saronno'],
  milano: ['Monza', 'Sesto San Giovanni', 'Cinisello Balsamo', 'Rho', 'Legnano', 'Segrate'],
  roma: ['Fiumicino', 'Tivoli', 'Guidonia Montecelio', 'Ciampino', 'Frascati', 'Pomezia'],
  bologna: ['Imola', 'Casalecchio di Reno', 'San Lazzaro di Savena', 'Castel Maggiore', 'Budrio'],
  torino: ['Moncalieri', 'Rivoli', 'Collegno', 'Settimo Torinese', 'Nichelino'],
  napoli: ['Giugliano in Campania', 'Torre del Greco', 'Pozzuoli', 'Casoria', 'Portici'],
  firenze: ['Prato', 'Scandicci', 'Empoli', 'Sesto Fiorentino', 'Campi Bisenzio'],
  verona: ['Villafranca di Verona', 'Bussolengo', 'San Giovanni Lupatoto', 'Legnago'],
  padova: ['Albignasego', 'Abano Terme', 'Cittadella', 'Monselice', 'Selvazzano Dentro'],
  genova: ['Rapallo', 'Chiavari', 'Sestri Levante', 'Arenzano', 'Recco'],
  venezia: ['Mestre', 'Chioggia', 'Jesolo', 'Mira', 'Spinea'],
};

/** Comuni principali per provincia (fallback). */
const MAIN_CITIES_BY_PROVINCE: Record<string, string[]> = {
  VA: ['Varese', 'Azzate', 'Sesto Calende', 'Vergiate', 'Gallarate', 'Busto Arsizio', 'Saronno'],
  MI: ['Milano', 'Sesto San Giovanni', 'Cinisello Balsamo', 'Legnano', 'Rho', 'Monza'],
  RM: ['Roma', 'Fiumicino', 'Tivoli', 'Guidonia Montecelio', 'Ciampino', 'Frascati'],
  BO: ['Bologna', 'Imola', 'Casalecchio di Reno', 'San Lazzaro di Savena', 'Castel Maggiore'],
  TO: ['Torino', 'Moncalieri', 'Rivoli', 'Collegno', 'Settimo Torinese'],
  NA: ['Napoli', 'Giugliano in Campania', 'Torre del Greco', 'Pozzuoli', 'Casoria'],
  FI: ['Firenze', 'Prato', 'Scandicci', 'Empoli', 'Sesto Fiorentino'],
  VR: ['Verona', 'Villafranca di Verona', 'Bussolengo', 'San Giovanni Lupatoto'],
  PD: ['Padova', 'Albignasego', 'Abano Terme', 'Cittadella', 'Monselice'],
  GE: ['Genova', 'Rapallo', 'Chiavari', 'Sestri Levante', 'Arenzano'],
  VE: ['Venezia', 'Chioggia', 'Jesolo', 'Mira', 'Spinea'],
};

export const NEARBY_CITIES_LIMIT = 5;

export interface NearbyCityLink {
  city: string;
  citySlug: string;
  listaHref: string;
  turniHref: string;
}

function addCity(
  out: NearbyCityLink[],
  seen: Set<string>,
  env: ImportMetaEnv,
  cityName: string,
  excludeSlug: string,
): void {
  if (out.length >= NEARBY_CITIES_LIMIT) return;
  const normalized = cityName.trim();
  if (!normalized) return;
  const slug = slugifySegment(normalized);
  if (!slug || slug === excludeSlug || seen.has(slug)) return;
  seen.add(slug);
  out.push({
    city: normalized,
    citySlug: slug,
    listaHref: listaPageUrl(env, slug),
    turniHref: cityTurniUrl(env, slug),
  });
}

function citiesFromItems(
  items: ListaPharmacyItem[],
  provinceCode: string,
  excludeSlug: string,
): { city: string; citySlug: string }[] {
  const seen = new Set<string>();
  const out: { city: string; citySlug: string }[] = [];
  for (const item of items) {
    if (provinceCode && item.province !== provinceCode) continue;
    if (!item.city) continue;
    const slug = item.city_slug || slugifySegment(item.city);
    if (!slug || slug === excludeSlug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ city: item.city, citySlug: slug });
  }
  return out;
}

async function fetchNearbyFromDb(
  env: ImportMetaEnv,
  provinceCode: string,
  excludeSlug: string,
): Promise<{ city: string; citySlug: string }[]> {
  if (!provinceCode) return [];

  return cached(`lista-nearby:${provinceCode}:${excludeSlug}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select('city, city_slug')
      .eq('province', provinceCode)
      .not('city_slug', 'is', null)
      .neq('city_slug', excludeSlug)
      .limit(60);

    if (error) return [];

    const seen = new Set<string>();
    return (data ?? [])
      .filter((row) => {
        if (!row?.city_slug || seen.has(row.city_slug)) return false;
        seen.add(row.city_slug);
        return true;
      })
      .map((row) => ({
        city: row.city || toTitleCase(String(row.city_slug).replace(/-/g, ' ')),
        citySlug: row.city_slug as string,
      }));
  });
}

export async function buildNearbyCityLinks(
  env: ImportMetaEnv,
  ctx: ListaContext,
  items: ListaPharmacyItem[],
): Promise<NearbyCityLink[]> {
  if (ctx.scope === 'italia') return [];

  const excludeSlug = ctx.normalizedSlug;
  const provinceCode = ctx.provinceCode || items[0]?.province || '';
  const links: NearbyCityLink[] = [];
  const seen = new Set<string>();

  for (const city of NEARBY_CITIES_BY_SLUG[excludeSlug] || []) {
    addCity(links, seen, env, city, excludeSlug);
  }

  if (links.length < NEARBY_CITIES_LIMIT && provinceCode) {
    for (const city of MAIN_CITIES_BY_PROVINCE[provinceCode.toUpperCase()] || []) {
      addCity(links, seen, env, city, excludeSlug);
    }
  }

  if (links.length < NEARBY_CITIES_LIMIT) {
    for (const { city } of citiesFromItems(items, provinceCode, excludeSlug)) {
      addCity(links, seen, env, city, excludeSlug);
    }
  }

  if (links.length < NEARBY_CITIES_LIMIT && provinceCode) {
    const fromDb = await fetchNearbyFromDb(env, provinceCode, excludeSlug);
    for (const { city } of fromDb) {
      addCity(links, seen, env, city, excludeSlug);
    }
  }

  return links.slice(0, NEARBY_CITIES_LIMIT);
}

/** Link turni per la città della pagina (es. Varese su /listafarmacie/varese/). */
export function buildListaCityTurnoLink(env: ImportMetaEnv, ctx: ListaContext): string | null {
  if (ctx.scope === 'italia' || ctx.scope === 'region') return null;
  return cityTurniUrl(env, ctx.normalizedSlug);
}
