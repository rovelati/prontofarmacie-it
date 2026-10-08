/**
 * Meta description e filtri farmacie vicine (condiviso con prontofarmacie-web).
 */

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type OpenStatusLike = {
  label?: string;
  detail?: string;
};

export function buildPharmacyMetaDescription(
  pharmacy: {
    name?: string | null;
    city?: string | null;
    province?: string | null;
    address?: string | null;
    phone?: string | null;
  },
  openStatus?: OpenStatusLike | null,
  maxLen = 155,
): string {
  const name = (pharmacy.name || 'Farmacia').trim();
  const city = pharmacy.city?.trim();
  const province = pharmacy.province?.trim()?.toUpperCase();
  const phone = formatPhoneForMeta(pharmacy.phone);
  const address = (pharmacy.address || '').trim();

  // Utente in SERP cerca: farmacia + località + orari/telefono
  const where = city
    ? `${name} a ${city}${province ? ` (${province})` : ''}`
    : province
      ? `${name} (${province})`
      : name;

  const statusBit = (() => {
    if (openStatus?.label === 'Sempre aperta') return 'Aperta 24 ore su 24';
    if (openStatus?.label === 'Aperta ora') {
      const detail = (openStatus.detail || '').replace(/\.$/, '');
      return detail && detail.length <= 36 ? `Aperta ora (${detail})` : 'Aperta ora';
    }
    if (openStatus?.label === 'Chiusa ora' && openStatus.detail) {
      const detail = openStatus.detail.replace(/\.$/, '');
      return detail.length <= 42 ? detail : 'Controlla gli orari di oggi';
    }
    return 'Orari di oggi, telefono e mappa';
  })();

  const parts: string[] = [where, statusBit];
  if (phone) parts.push(`Tel. ${phone}`);
  if (address) {
    // Indirizzo corto: evita CAP/città duplicati se già nel where
    let shortAddr = address;
    if (city) {
      shortAddr = shortAddr.replace(new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '');
    }
    shortAddr = shortAddr
      .replace(/\b\d{5}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[,\s]+$/g, '')
      .trim();
    if (shortAddr.length >= 8 && shortAddr.length <= 48) parts.push(shortAddr);
  }

  let desc = parts.join('. ').replace(/\s+/g, ' ').replace(/\.\./g, '.');
  if (!desc.endsWith('.')) desc += '.';

  if (desc.length <= maxLen) return desc;

  // Taglia partendo dall'indirizzo
  const withoutAddr = [where, statusBit, phone ? `Tel. ${phone}` : null]
    .filter(Boolean)
    .join('. ');
  desc = withoutAddr.endsWith('.') ? withoutAddr : `${withoutAddr}.`;
  if (desc.length <= maxLen) return desc;

  const minimal = `${where}. ${statusBit}.${phone ? ` Tel. ${phone}.` : ''}`;
  return minimal.length > maxLen ? `${minimal.slice(0, maxLen - 1).trim()}…` : minimal;
}

function formatPhoneForMeta(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone.trim();
  // Prefissi IT comuni: 0xx / 0xxx + resto
  if (digits.startsWith('0') && digits.length >= 9) {
    if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone.trim();
}

export interface NearbyCandidate {
  id: string;
  name: string;
  prontofarmacie_slug: string;
  city?: string | null;
  province?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function rankNearbyPharmacies<T extends NearbyCandidate>(
  current: {
    id: string;
    city?: string | null;
    province?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  candidates: T[],
  options?: { maxItems?: number; maxKm?: number },
): T[] {
  const maxItems = options?.maxItems ?? 4;
  const maxKm = options?.maxKm ?? 20;
  const lat0 = current.latitude != null ? Number(current.latitude) : null;
  const lng0 = current.longitude != null ? Number(current.longitude) : null;
  const hasCoords =
    lat0 != null && lng0 != null && !Number.isNaN(lat0) && !Number.isNaN(lng0);
  const cityNorm = (current.city || '').trim().toLowerCase();

  const deduped = candidates.filter((r) => r.id !== current.id && r.prontofarmacie_slug);

  const withMeta = deduped.map((r) => {
    const rLat = r.latitude != null ? Number(r.latitude) : null;
    const rLng = r.longitude != null ? Number(r.longitude) : null;
    const distanceKm =
      hasCoords && rLat != null && rLng != null && !Number.isNaN(rLat) && !Number.isNaN(rLng)
        ? haversineKm(lat0!, lng0!, rLat, rLng)
        : null;
    const sameCity = cityNorm && (r.city || '').trim().toLowerCase() === cityNorm;
    return { row: r, distanceKm, sameCity };
  });

  let filtered = withMeta;
  if (hasCoords) {
    filtered = withMeta.filter(
      (x) => x.sameCity || (x.distanceKm != null && x.distanceKm <= maxKm),
    );
  } else if (cityNorm) {
    filtered = withMeta.filter((x) => x.sameCity);
  } else {
    return [];
  }

  filtered.sort((a, b) => {
    if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
    if (a.distanceKm == null && b.distanceKm == null) return a.row.name.localeCompare(b.row.name);
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return filtered.slice(0, maxItems).map((x) => x.row);
}

export function buildNearbyItemListJsonLd(
  baseUrl: string,
  nearby: Array<{ name: string; prontofarmacie_slug: string; city?: string | null }>,
  labelCity?: string | null,
): Record<string, unknown> | null {
  if (!nearby.length) return null;
  const base = baseUrl.replace(/\/$/, '');
  const name = labelCity?.trim()
    ? `Altre farmacie a ${labelCity.trim()}`
    : 'Farmacie nelle vicinanze';
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: nearby.map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${base}/farmacia/${p.prontofarmacie_slug}/`,
      name: p.name,
    })),
  };
}
