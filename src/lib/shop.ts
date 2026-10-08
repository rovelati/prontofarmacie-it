import { shops, complaints } from '@/data/shopData';
import { getSupabase } from '@/lib/supabase';

export type Shop = (typeof shops)[number];

export interface ShopOffer {
  id?: string | number;
  shop_slug?: string | null;
  shop_name?: string | null;
  product_name?: string | null;
  product_url?: string | null;
  image_url?: string | null;
  category_slug?: string | null;
  offer_date?: string | null;
  price_offered?: number | null;
  price_original?: number | null;
  discount_pct?: number | null;
}

export const OFFER_CATEGORY_NAMES: Record<string, string> = {
  integratori: 'Integratori',
  dimagranti: 'Dimagranti e Controllo Peso',
  vitamine: 'Vitamine e Minerali',
  dermatologici: 'Dermatologici e Cura Pelle',
  probiotici: 'Probiotici e Fermenti',
  omeopatici: 'Omeopatici e Fitoterapici',
  igiene: 'Igiene e Cura Personale',
  altro: 'Altro',
};

export const OFFER_CATEGORY_ORDER = ['integratori', 'dimagranti', 'vitamine', 'dermatologici', 'probiotici', 'omeopatici', 'igiene', 'altro'];

export function todayRomeIsoDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Oggi (Roma) se ci sono offerte; altrimenti l'ultima data disponibile nel DB. */
export async function resolveShopOfferDate(preferred = todayRomeIsoDate()): Promise<string> {
  const supabase = getSupabase(import.meta.env);
  const { count, error: countError } = await supabase
    .from('shop_offers')
    .select('id', { count: 'exact', head: true })
    .eq('offer_date', preferred);
  if (!countError && (count ?? 0) > 0) return preferred;

  const { data, error } = await supabase
    .from('shop_offers')
    .select('offer_date')
    .order('offer_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.offer_date) return preferred;
  return String(data.offer_date);
}

interface ShopOfferFilters {
  categorySlug?: string;
  shopSlug?: string;
}

export async function fetchShopOffersForDate(
  categorySlugOrFilters?: string | ShopOfferFilters,
  offerDate = todayRomeIsoDate(),
) {
  const filters = typeof categorySlugOrFilters === 'string'
    ? { categorySlug: categorySlugOrFilters }
    : categorySlugOrFilters || {};
  const supabase = getSupabase(import.meta.env);
  let query = supabase
    .from('shop_offers')
    .select('*')
    .eq('offer_date', offerDate)
    .order('discount_pct', { ascending: false, nullsFirst: false })
    .order('price_offered', { ascending: true });

  if (filters.categorySlug && filters.categorySlug !== 'tutte') {
    query = query.eq('category_slug', filters.categorySlug);
  }

  if (filters.shopSlug) {
    query = query.eq('shop_slug', filters.shopSlug);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Errore fetch offerte shop:', error);
    return [] as ShopOffer[];
  }
  return (data ?? []) as ShopOffer[];
}

export async function fetchShopOfferCategoriesForDate(offerDate = todayRomeIsoDate(), shopSlug?: string) {
  const supabase = getSupabase(import.meta.env);
  let query = supabase
    .from('shop_offers')
    .select('category_slug')
    .eq('offer_date', offerDate);

  if (shopSlug) {
    query = query.eq('shop_slug', shopSlug);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Errore fetch categorie offerte shop:', error);
    return [] as string[];
  }

  const slugs = [...new Set((data ?? []).map((row) => row.category_slug).filter(Boolean))] as string[];
  return OFFER_CATEGORY_ORDER.filter((slug) => slugs.includes(slug)).concat(
    slugs.filter((slug) => !OFFER_CATEGORY_ORDER.includes(slug)),
  );
}

export function getShopBySlug(slug: string): Shop | undefined {
  return shops.find((s) => s.slug === slug);
}

export function getComplaintBySlug(slug: string) {
  const normalized = slug.replace(/-/g, '').toLowerCase();
  const key = Object.keys(complaints).find((k) => k.replace(/-/g, '').toLowerCase() === normalized);
  if (key) return { key, ...complaints[key as keyof typeof complaints] };
  const shop = getShopBySlug(slug);
  if (!shop) return null;
  const fromShop = Object.entries(complaints).find(([k]) => shop.complaintPath?.includes(k));
  if (!fromShop) return null;
  return { key: fromShop[0], ...fromShop[1] };
}

export { shops, complaints };
