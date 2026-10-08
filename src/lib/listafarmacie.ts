import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { filterCityPharmaciesByProvince } from '@/lib/cityProvinceDisambiguation';
import {
  cleanListSlug,
  getRegionDisplayName,
  PROVINCE_SLUG_TO_CODE,
  PROVINCES_BY_REGION,
  toTitleCase,
} from '@/lib/locationUtils';
import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';
import { getSupabase } from '@/lib/supabase';
import {
  cityTurniUrl,
  provinceTurniUrl,
  siteUrl,
  slugifySegment,
} from '@/lib/turni';

export interface ListaPharmacyItem {
  id: string;
  name: string;
  city?: string | null;
  city_slug?: string | null;
  province?: string | null;
  phone?: string | null;
  address?: string | null;
  prontofarmacie_slug?: string | null;
  services?: unknown;
  latitude?: number | null;
  longitude?: number | null;
  pharmacy_type?: string | null;
}

export type ListaScope = 'italia' | 'region' | 'province' | 'city';

export interface ListaContext {
  rawSlug: string;
  normalizedSlug: string;
  scope: ListaScope;
  contextLabel: string;
  provinceCode: string;
  regionLabel: string | undefined;
}

const SELECT_COLS =
  'id,name,city,city_slug,province,phone,address,prontofarmacie_slug,opening_hours,services,latitude,longitude,pharmacy_type';

export function resolveListaContext(localita: string): ListaContext {
  const rawSlug = localita.trim();
  const citySlugFromUrl = cleanListSlug(rawSlug);
  const normalizedSlug = slugifySegment(citySlugFromUrl || rawSlug);
  const isItalia = normalizedSlug === 'italia' || rawSlug.toLowerCase() === 'italia';
  const regionLabel = getRegionDisplayName(rawSlug) || getRegionDisplayName(normalizedSlug);
  const provinceCode = PROVINCE_SLUG_TO_CODE[normalizedSlug] || '';

  // Capoluoghi (bari, milano, …): lo slug coincide col nome provincia ma la lista
  // è quella del comune (city_slug). Scope "city" → title/H1 coerenti ("Farmacie a Bari").
  const isProvinceCapitalSlug = Boolean(
    provinceCode && slugifySegment(PROVINCE_NAME_BY_CODE[provinceCode] || '') === normalizedSlug,
  );

  let scope: ListaScope = 'city';
  if (isItalia) scope = 'italia';
  else if (regionLabel) scope = 'region';
  else if (provinceCode && !isProvinceCapitalSlug) scope = 'province';

  let contextLabel = toTitleCase(citySlugFromUrl.replace(/-/g, ' ') || rawSlug);
  if (isItalia) contextLabel = 'Italia';
  else if (regionLabel) contextLabel = regionLabel;
  else if (scope === 'province' && provinceCode && PROVINCE_NAME_BY_CODE[provinceCode]) {
    contextLabel = PROVINCE_NAME_BY_CODE[provinceCode];
  } else if (isProvinceCapitalSlug && PROVINCE_NAME_BY_CODE[provinceCode]) {
    contextLabel = PROVINCE_NAME_BY_CODE[provinceCode];
  }

  return { rawSlug, normalizedSlug, scope, contextLabel, provinceCode, regionLabel };
}

function sortListaItems(items: ListaPharmacyItem[], ctx: ListaContext): ListaPharmacyItem[] {
  const sorted = [...items];
  if (ctx.scope === 'city') {
    sorted.sort((a, b) => {
      const aSlug = a.city_slug || slugifySegment(a.city || '');
      const bSlug = b.city_slug || slugifySegment(b.city || '');
      const aMatch = aSlug === ctx.normalizedSlug;
      const bMatch = bSlug === ctx.normalizedSlug;
      const aData = !!(a.prontofarmacie_slug || a.phone);
      const bData = !!(b.prontofarmacie_slug || b.phone);
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      if (aData !== bData) return aData ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '', 'it');
    });
  } else {
    sorted.sort((a, b) => {
      const aData = !!(a.prontofarmacie_slug || a.phone);
      const bData = !!(b.prontofarmacie_slug || b.phone);
      if (aData !== bData) return aData ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '', 'it');
    });
  }
  return sorted;
}

export async function fetchListaPharmacies(ctx: ListaContext): Promise<ListaPharmacyItem[]> {
  if (ctx.scope === 'italia') return [];

  return cached(`lista:${ctx.normalizedSlug}:${ctx.scope}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    let data: ListaPharmacyItem[] = [];
    let error: { message: string } | null = null;

    const base = () =>
      supabase
        .from('paginegialle_pharmacies')
        .select(SELECT_COLS)
        .order('name', { ascending: true })
        .limit(1000);

    if (ctx.scope === 'region' && ctx.regionLabel) {
      const provinces = PROVINCES_BY_REGION[ctx.regionLabel] || [];
      if (provinces.length) {
        ({ data, error } = await base().in('province', provinces));
      } else {
        ({ data, error } = await base());
      }
    } else {
      const cityName = cleanListSlug(ctx.rawSlug).replace(/-/g, ' ').trim();
      ({ data, error } = await base().eq('city_slug', ctx.normalizedSlug));

      if (!error && (!data || data.length === 0)) {
        ({ data, error } = await base().ilike('city', cityName));
      }

      if (!error && (!data || data.length === 0) && ctx.provinceCode) {
        ({ data, error } = await base().eq('province', ctx.provinceCode));
      }

      if (!error && data?.length && ctx.scope === 'city') {
        data = filterCityPharmaciesByProvince(data, ctx.normalizedSlug);
      }
    }

    if (error) throw new Error(error.message);
    return sortListaItems((data ?? []) as ListaPharmacyItem[], ctx);
  });
}

export function listaPageUrl(env: ImportMetaEnv, slug: string): string {
  return `${siteUrl(env)}/listafarmacie/${encodeURIComponent(slugifySegment(slug) || slug)}/`;
}

export function buildListaTitle(ctx: ListaContext): string {
  if (ctx.scope === 'italia') {
    return 'Farmacie in Italia - Cerca per Città, Provincia o Regione | ProntoFarmacie';
  }
  if (ctx.scope === 'region') return `Farmacie in ${ctx.contextLabel} - ProntoFarmacie`;
  if (ctx.scope === 'province') {
    return `Farmacie in provincia di ${ctx.contextLabel} - ProntoFarmacie`;
  }
  return `Farmacie a ${ctx.contextLabel} - ProntoFarmacie`;
}

export function buildListaDescription(ctx: ListaContext, count: number, topServices: string[]): string {
  if (ctx.scope === 'italia') {
    return 'Cerca farmacie in Italia per città, provincia o regione. Trova farmacie di turno con orari, contatti, servizi e indicazioni stradali aggiornate.';
  }
  const countText = count > 0 ? `Trova ${count} farmacie e parafarmacie` : 'Elenco completo farmacie';
  let base =
    ctx.scope === 'region'
      ? `${countText} in ${ctx.contextLabel}. Consulta orari, turni, contatti telefonici e servizi disponibili per ogni farmacia della regione ${ctx.contextLabel}.`
      : `${countText} a ${ctx.contextLabel}. Scopri le farmacie di turno aperte ora, indirizzi, numeri di telefono e servizi offerti nel comune di ${ctx.contextLabel}.`;
  if (topServices.length) base += ` Servizi in evidenza: ${topServices.join(', ')}.`;
  return base;
}

export function extractTopServices(items: ListaPharmacyItem[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!Array.isArray(item.services)) continue;
    for (const service of item.services) {
      if (!service) continue;
      const key = String(service);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([service]) => service);
}

export function buildTurnoLink(env: ImportMetaEnv, ctx: ListaContext): string {
  if (ctx.scope === 'city') return cityTurniUrl(env, ctx.normalizedSlug);
  if (ctx.scope === 'province' && ctx.provinceCode) {
    const name = PROVINCE_NAME_BY_CODE[ctx.provinceCode];
    return provinceTurniUrl(env, slugifySegment(name || ctx.provinceCode));
  }
  return `${siteUrl(env)}/farmacie-di-turno/`;
}

export function buildListaJsonLd(
  env: ImportMetaEnv,
  ctx: ListaContext,
  items: ListaPharmacyItem[],
  title: string,
  description: string,
): Record<string, unknown>[] {
  const base = siteUrl(env);
  const canonical = listaPageUrl(env, ctx.normalizedSlug || 'italia');
  const schemas: Record<string, unknown>[] = [];

  if (ctx.scope === 'italia') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: 'Farmacie in Italia', item: canonical },
        ],
      },
    });
    return schemas;
  }

  if (items.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: items.slice(0, 50).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Pharmacy',
          name: item.name,
          telephone: item.phone || undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: item.address,
            addressLocality: item.city,
            addressRegion: item.province,
            addressCountry: 'IT',
          },
          url: item.prontofarmacie_slug ? `${base}/farmacia/${item.prontofarmacie_slug}/` : undefined,
        },
      })),
    });
  }

  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: 'Farmacie', item: `${base}/listafarmacie/italia/` },
      { '@type': 'ListItem', position: 3, name: ctx.contextLabel, item: canonical },
    ],
  });

  return schemas;
}

export const SSR_LIST_LIMIT = 60;
