import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { getSupabase } from '@/lib/supabase';
import { slugifySegment } from '@/lib/turni';

export interface SearchPharmacy {
  id: string;
  name: string;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  address?: string | null;
  prontofarmacie_slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  pharmacy_type?: string | null;
}

function cleanSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(
      /\b(farmacia|farmacie|parafarmacia|parafarmacie|dott|dottssa|dr|a|in|di|da|per|con|su|tra|fra|il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLocationFromTurniQuery(query: string): string | null {
  const lower = query.toLowerCase().trim();
  const patterns = [
    /farmacie di turno(?: a| in| di)?\s+(.+)/i,
    /farmacie aperte(?: ora)?(?: a| in| di)?\s+(.+)/i,
    /farmacia di turno(?: a| in| di)?\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function turniRedirectSlug(query: string): string | null {
  const location = extractLocationFromTurniQuery(query);
  if (!location) return null;
  const slug = slugifySegment(location);
  return slug ? `/farmacie-di-turno/farmacie-di-turno-a-${slug}-aperte-ora/` : null;
}

export async function searchPharmacies(query: string): Promise<SearchPharmacy[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return cached(`search:${trimmed.toLowerCase()}`, CACHE_TTL_TURNI_MS, async () => {
    const cleaned = cleanSearchQuery(trimmed);
    const effective = cleaned.length >= 2 ? cleaned : trimmed;
    const ilikeQuery = `%${effective}%`;

    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select(
        'id,name,city,province,phone,address,prontofarmacie_slug,latitude,longitude,pharmacy_type',
      )
      .or(`name.ilike."${ilikeQuery}",city.ilike."${ilikeQuery}",address.ilike."${ilikeQuery}"`)
      .limit(100)
      .order('name', { ascending: true });

    if (error) return [];
    return (data ?? []) as SearchPharmacy[];
  });
}
