import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';

export { PROVINCE_NAME_BY_CODE };

/** Slug URL (sitemap / index.php pf_slugify style) */
export function slugifySegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug usato in province-turni.php per il match parametro URL */
export function phpProvinceSlug(name: string): string {
  return name.toLowerCase().replace(/ e della /g, '-').replace(/\s+/g, '-');
}

function provinceSlugVariants(label: string): string[] {
  const variants = new Set<string>([
    slugifySegment(label),
    slugifySegment(label.replace(' e della Brianza', '')),
    phpProvinceSlug(label),
    phpProvinceSlug(label.replace(' e della Brianza', '')),
  ]);
  return [...variants].filter(Boolean);
}

const SLUG_TO_CODE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [code, label] of Object.entries(PROVINCE_NAME_BY_CODE)) {
    map[code.toLowerCase()] = code;
    for (const slug of provinceSlugVariants(label)) {
      map[slug] = code;
    }
  }
  return map;
})();

export function provinceCodeFromSlug(slug: string): { code: string; label: string } | null {
  const normalized = slugifySegment(slug) || slug.toLowerCase().trim();
  const code = SLUG_TO_CODE[normalized] ?? SLUG_TO_CODE[slug.toLowerCase().trim()];
  if (!code) return null;
  return { code, label: PROVINCE_NAME_BY_CODE[code] };
}

export function provinceSlugFromCode(code: string): string | null {
  const label = PROVINCE_NAME_BY_CODE[code.toUpperCase()];
  return label ? slugifySegment(label) : null;
}

export function extractProvinceFromAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const paren = trimmed.match(/\(([A-Z]{2})\)/i);
  if (paren) return paren[1].toUpperCase();
  const cap = trimmed.match(/,\s*\d{5}\s+[^,]+,\s*([A-Z]{2})\b/i);
  if (cap) return cap[1].toUpperCase();
  const tail = trimmed.match(/,\s*([A-Z]{2})\s*,?\s*(?:Italia)?$/i);
  if (tail) return tail[1].toUpperCase();
  const italia = trimmed.match(/\b([A-Z]{2})\b\s*,?\s*Italia\s*$/i);
  if (italia) return italia[1].toUpperCase();
  return null;
}

export function pharmacyBelongsToProvince(
  row: { province?: string | null; address?: string | null },
  expectedCode: string,
): boolean {
  const expected = expectedCode.toUpperCase();
  const stored = String(row.province || '').toUpperCase();
  const fromAddress = extractProvinceFromAddress(String(row.address || ''));
  if (fromAddress && fromAddress !== expected) return false;
  if (stored && stored !== expected) return false;
  return stored === expected || (!stored && fromAddress === expected);
}

export function formatOpenNowLabel(date = new Date()): string {
  const datePart = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(date);
  const capitalized = datePart.charAt(0).toUpperCase() + datePart.slice(1);
  const hour = new Intl.DateTimeFormat('it-IT', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date);
  return `${capitalized} ore ${hour}`;
}

export function cityLabelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function siteUrl(env: ImportMetaEnv): string {
  return (env.PUBLIC_SITE_URL || 'https://www.prontofarmacie.it').replace(/\/$/, '');
}

export function cityTurniUrl(env: ImportMetaEnv, citySlug: string): string {
  return `${siteUrl(env)}/farmacie-di-turno/farmacie-di-turno-a-${encodeURIComponent(citySlug)}-aperte-ora/`;
}

export function provinceTurniUrl(env: ImportMetaEnv, provinceSlug: string): string {
  return `${siteUrl(env)}/farmacie-di-turno/farmacie-di-turno-della-provincia-di-${encodeURIComponent(provinceSlug)}/`;
}

/** Frazioni → comune capoluogo (allineato a React PharmaciesTurnoCityPage) */
export const FRAZIONE_TO_PARENT_CITY: Record<string, string> = {
  'lido-di-venezia': 'venezia',
};

/**
 * Alias slug URL → city_slug in DB (nomi ISTAT / PharmAround divergono).
 * Es. Castelletto Ticino (URL/PA) vs Castelletto sopra Ticino (DB).
 */
export const CITY_SLUG_ALIASES: Record<string, string> = {
  'castelletto-ticino': 'castelletto-sopra-ticino',
};

/** Candidati di lookup per uno slug pagina (slug richiesto + alias canonico). */
export function citySlugLookupCandidates(slug: string): string[] {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return [];
  const out = [normalized];
  const alias = CITY_SLUG_ALIASES[normalized];
  if (alias && !out.includes(alias)) out.push(alias);
  for (const [from, to] of Object.entries(CITY_SLUG_ALIASES)) {
    if (to === normalized && !out.includes(from)) out.push(from);
    if (alias && to === alias && !out.includes(from)) out.push(from);
  }
  return out;
}
