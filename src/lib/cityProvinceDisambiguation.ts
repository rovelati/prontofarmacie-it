import { slugifySegment } from '@/lib/turni';

type WithProvince = {
  province?: string | null;
  city?: string | null;
  city_slug?: string | null;
  address?: string | null;
};

/**
 * Capoluoghi con omonimie (es. Bari vs Bari Sardo, Roma vs Giuliano di Roma).
 * Se presente, le liste città tengono solo questa provincia.
 */
export const CITY_SLUG_PRIMARY_PROVINCE: Record<string, string> = {
  bari: 'BA',
  roma: 'RM',
  milano: 'MI',
  napoli: 'NA',
  torino: 'TO',
  palermo: 'PA',
  genova: 'GE',
  bologna: 'BO',
  firenze: 'FI',
  venezia: 'VE',
  verona: 'VR',
  padova: 'PD',
  trieste: 'TS',
  catania: 'CT',
  messina: 'ME',
};

function normalizeProvince(value: string | null | undefined): string | null {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Provincia più frequente nel set (solo codici a 2 lettere). */
export function dominantProvinceCode<T extends WithProvince>(rows: T[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = normalizeProvince(row.province);
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [code, n] of counts) {
    if (n > max) {
      best = code;
      max = n;
    }
  }
  return best;
}

/**
 * Filtra farmacie di una lista città escludendo omonimi in altre province
 * (es. Bari Sardo/NU dentro /listafarmacie/bari/).
 */
export function filterCityPharmaciesByProvince<T extends WithProvince>(
  rows: T[],
  citySlug: string,
): T[] {
  if (rows.length <= 1) return rows;

  const preferred =
    CITY_SLUG_PRIMARY_PROVINCE[citySlug] || dominantProvinceCode(rows);
  if (!preferred) return rows;

  const filtered = rows.filter((row) => {
    const code = normalizeProvince(row.province);
    if (!code) return true;
    return code === preferred;
  });

  return filtered.length > 0 ? filtered : rows;
}

/**
 * Match città per prefisso: accetta solo comune esatto (slug), non "Bari%" → Bari Sardo.
 */
export function cityMatchesSlugExactly(
  row: WithProvince,
  citySlug: string,
): boolean {
  const slug = (row.city_slug || slugifySegment(row.city || '')).toLowerCase();
  if (slug === citySlug) return true;
  // Evita che il fallback ilike("Bari%") includa Bari Sardo
  return false;
}
