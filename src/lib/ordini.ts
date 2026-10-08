import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { getSupabase } from '@/lib/supabase';
import { slugifySegment } from '@/lib/turni';
import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';

export interface OrdineFarmacisti {
  provincia_code: string;
  provincia: string;
  regione: string;
  url_sito_ordine: string;
  url_farmacie_turno?: string | null;
  url_elenco_farmacie?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  pec?: string | null;
  fax?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const FALLBACK_PROVINCE_ORDINE: Record<string, string> = { MB: 'MI' };
const ORDINI_URL_OVERRIDES: Record<string, Partial<OrdineFarmacisti>> = {
  VE: {
    url_sito_ordine: 'https://www.ordinefarmacistivenezia.it/',
    url_farmacie_turno: 'https://www.ordinefarmacistivenezia.it/farmacie-di-turno.html',
  },
};

export function applyOrdineOverrides(ordine: OrdineFarmacisti | null): OrdineFarmacisti | null {
  if (!ordine) return ordine;
  const code = String(ordine.provincia_code || '').toUpperCase();
  const override = ORDINI_URL_OVERRIDES[code];
  if (!override) return ordine;
  return { ...ordine, ...override };
}

export function provinceCodeFromSlug(slug: string): string | null {
  const normalized = slugifySegment(slug);
  const fromName = Object.entries(PROVINCE_NAME_BY_CODE).find(
    ([, name]) => slugifySegment(name) === normalized,
  );
  if (fromName) return fromName[0];
  if (normalized.length === 2) return normalized.toUpperCase();
  return null;
}

export async function fetchOrdineByProvinceCode(provinciaCode: string): Promise<OrdineFarmacisti | null> {
  return cached(`ordine:${provinciaCode}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const code = provinciaCode.toUpperCase();

    let { data, error } = await supabase
      .from('ordini_farmacisti_province')
      .select('*')
      .eq('provincia_code', code)
      .maybeSingle();

    if ((error || !data) && FALLBACK_PROVINCE_ORDINE[code]) {
      const fallback = FALLBACK_PROVINCE_ORDINE[code];
      const res = await supabase
        .from('ordini_farmacisti_province')
        .select('*')
        .eq('provincia_code', fallback)
        .maybeSingle();
      data = res.data;
    }

    return applyOrdineOverrides((data as OrdineFarmacisti) ?? null);
  });
}

export async function fetchAllOrdini(): Promise<OrdineFarmacisti[]> {
  return cached('ordini:all', CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('ordini_farmacisti_province')
      .select(
        'provincia_code, provincia, regione, url_sito_ordine, url_farmacie_turno, url_elenco_farmacie',
      )
      .order('regione', { ascending: true })
      .order('provincia', { ascending: true });
    if (error) return [];
    return (data ?? []).map((row) => applyOrdineOverrides(row as OrdineFarmacisti)!);
  });
}

export function getOrdineBestLink(ordine: OrdineFarmacisti): { href: string; label: string } {
  if (!ordine?.url_sito_ordine) return { href: '#', label: 'sito ordine' };
  if (ordine.url_farmacie_turno) return { href: ordine.url_farmacie_turno, label: 'farmacie di turno' };
  if (ordine.url_elenco_farmacie) return { href: ordine.url_elenco_farmacie, label: 'elenco farmacie' };
  return { href: ordine.url_sito_ordine, label: 'sito ordine' };
}
