import {
  ensureAbsoluteUrl,
  normalizeImages,
  toTitleCase,
  type PharmacyRecord,
} from '@/lib/pharmacy';
import { getPharmacyStatus, getRomeDayLabel, parseOpeningHours, type DailyShift } from '@/lib/turniStatus';
import { getTurniQueryMode } from '@/lib/turniQueryMode';
import {
  buildPharmacyMetaDescription,
} from '@/lib/pharmacyNearbySeo';
import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';
import { organizationId, websiteId } from '@/lib/seo';
import { cityTurniUrl, provinceTurniUrl, siteUrl, slugifySegment } from '@/lib/turni';

const SCHEMA_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const IT_TO_SCHEMA_DAY: Record<string, string> = {
  domenica: 'Sunday',
  lunedi: 'Monday',
  lunedì: 'Monday',
  martedi: 'Tuesday',
  martedì: 'Tuesday',
  mercoledi: 'Wednesday',
  mercoledì: 'Wednesday',
  giovedi: 'Thursday',
  giovedì: 'Thursday',
  venerdi: 'Friday',
  venerdì: 'Friday',
  sabato: 'Saturday',
};

function italianDayToSchema(label: string): string | null {
  const cleaned = label.trim().replace(/[.,]/g, '').toLowerCase();
  const deaccent = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return IT_TO_SCHEMA_DAY[cleaned] || IT_TO_SCHEMA_DAY[deaccent] || null;
}

function buildOpeningHoursSpec(schedule: ReturnType<typeof parseOpeningHours>) {
  if (!schedule) return [];
  const specs: Record<string, unknown>[] = [];
  for (const data of Object.values(schedule)) {
    if (!data.ranges?.length) continue;
    const dayName = italianDayToSchema(data.label);
    if (!dayName) continue;
    for (const range of data.ranges) {
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${dayName}`,
        opens: range.start,
        closes: range.end,
      });
    }
  }
  return specs;
}

function romeWeekday(date: Date): (typeof SCHEMA_WEEKDAYS)[number] {
  const name = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Europe/Rome',
  }).format(date);
  return (SCHEMA_WEEKDAYS.find((d) => d === name) || 'Monday') as (typeof SCHEMA_WEEKDAYS)[number];
}

function romeHHMM(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Rome',
  }).format(date);
}

/** Se mancano gli orari ordinari, usa turni H24 o le finestre ufficiali del giorno. */
export function openingHoursFromShifts(shifts: DailyShift[]): Record<string, unknown>[] {
  if (!shifts.length) return [];
  if (shifts.some((s) => s.is_h24)) {
    return SCHEMA_WEEKDAYS.map((day) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${day}`,
      opens: '00:00',
      closes: '23:59',
    }));
  }

  const specs: Record<string, unknown>[] = [];
  for (const shift of shifts) {
    const start = new Date(shift.start_at);
    const end = new Date(shift.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${romeWeekday(start)}`,
      opens: romeHHMM(start),
      closes: romeHHMM(end),
      validFrom: start.toISOString().slice(0, 10),
      validThrough: end.toISOString().slice(0, 10),
    });
  }
  return specs;
}

export function extractItalianPostalCode(
  pharmacy: Pick<PharmacyRecord, 'zip_code' | 'address' | 'gaddress'> & Record<string, unknown>,
): string | undefined {
  const direct = [pharmacy.zip_code, pharmacy.cap, pharmacy.postal_code]
    .map((v) => String(v || '').trim())
    .find((v) => /^\d{5}$/.test(v));
  if (direct) return direct;

  for (const blob of [pharmacy.gaddress, pharmacy.address]) {
    const match = String(blob || '').match(/\b(\d{5})\b/);
    if (match) return match[1];
  }
  return undefined;
}

export function pharmacyPageUrl(env: ImportMetaEnv, slug: string): string {
  return `${siteUrl(env)}/farmacia/${encodeURIComponent(slug.replace(/\/$/, ''))}/`;
}

export function buildPharmacyPageTitle(
  pharmacy: PharmacyRecord,
  shifts: DailyShift[],
  now = new Date(),
): string {
  const name = (pharmacy.name || 'Farmacia').trim();
  const city = formatPlaceName(pharmacy.city);
  const status = openStatusForPharmacy(pharmacy, shifts, now);
  const is24 = shifts.some((s) => s.is_h24) || status.detail.includes('H24') || status.label === 'Sempre aperta';
  const brand = ' | ProntoFarmacie';
  // Google spesso mostra ~55–65 caratteri: budget un filo più largo del vecchio 45
  const maxCore = 65 - brand.length;

  // Intent dominante in GSC: "farmacia {città} orari" / nome+città
  let intent = 'orari e telefono';
  if (is24) intent = 'aperta 24h';
  else if (status.label === 'Aperta ora') intent = 'aperta ora';

  // Per città composite ("Lampedusa e Linosa") tieni anche la forma corta
  const cityShort = city.includes(' e ') ? city.split(/\s+e\s+/i)[0].trim() : city;

  const candidates: string[] = [];
  if (city) {
    candidates.push(`${name} a ${city}: ${intent}`);
    if (cityShort && cityShort !== city) candidates.push(`${name} a ${cityShort}: ${intent}`);
    candidates.push(`${name} a ${city} — orari`);
    if (cityShort && cityShort !== city) candidates.push(`${name} a ${cityShort} — orari`);
    candidates.push(`${name} a ${city}`);
    if (cityShort && cityShort !== city) candidates.push(`${name} a ${cityShort}`);
  } else {
    candidates.push(`${name}: ${intent}`);
    candidates.push(`${name} — orari e telefono`);
    candidates.push(name);
  }

  let core = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c.length <= maxCore) {
      core = c;
      break;
    }
  }
  if (core.length > maxCore) {
    core = `${core.slice(0, Math.max(24, maxCore - 1)).trim()}…`;
  }
  return `${core}${brand}`;
}

export function buildPharmacyPageDescription(
  pharmacy: PharmacyRecord,
  shifts: DailyShift[],
  now = new Date(),
): string {
  const status = openStatusForPharmacy(pharmacy, shifts, now);
  return buildPharmacyMetaDescription(
    {
      ...pharmacy,
      city: formatPlaceName(pharmacy.city) || pharmacy.city,
    },
    status,
    155,
  );
}

/** Città/località leggibili in SERP ("Lampedusa e Linosa", non "E Linosa"). */
export function formatPlaceName(value?: string | null): string {
  if (!value) return '';
  const small = new Set([
    'e',
    'di',
    'a',
    'da',
    'in',
    'su',
    'per',
    'con',
    'del',
    'della',
    'dei',
    'delle',
    'dello',
    'degli',
    'lo',
    'la',
    'il',
    'gli',
    'le',
    'un',
    'una',
  ]);
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      if (/^[A-Za-zÀ-ÿ]{2}$/.test(w) && w === w.toUpperCase()) return w.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function buildPharmacyJsonLd(
  env: ImportMetaEnv,
  pharmacy: PharmacyRecord,
  slug: string,
  shifts: DailyShift[],
  _nearby: Array<{ name: string; prontofarmacie_slug: string; city?: string | null }> = [],
  options?: { coords?: { lat: number; lng: number } | null },
): Record<string, unknown>[] {
  const base = siteUrl(env);
  const orgId = organizationId(base);
  const pageUrl = pharmacyPageUrl(env, slug);
  const pharmacyId = `${pageUrl}#pharmacy`;
  const schedule = parseOpeningHours(pharmacy.opening_hours);
  const ordinaryHours = buildOpeningHoursSpec(schedule);
  const openingHours = ordinaryHours.length ? ordinaryHours : openingHoursFromShifts(shifts);
  const images = normalizeImages(pharmacy.images);
  const lat =
    options?.coords?.lat != null && Number.isFinite(options.coords.lat)
      ? options.coords.lat
      : pharmacy.latitude != null
        ? Number(pharmacy.latitude)
        : null;
  const lng =
    options?.coords?.lng != null && Number.isFinite(options.coords.lng)
      ? options.coords.lng
      : pharmacy.longitude != null
        ? Number(pharmacy.longitude)
        : null;
  const hasGeo = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const postalCode = extractItalianPostalCode(pharmacy);

  const pharmacyLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    '@id': pharmacyId,
    name: pharmacy.name,
    url: pageUrl,
    telephone: pharmacy.phone || undefined,
    email: pharmacy.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: (pharmacy.address || pharmacy.gaddress || '').trim() || undefined,
      addressLocality: pharmacy.city ? formatPlaceName(pharmacy.city) : undefined,
      addressRegion: pharmacy.province || undefined,
      postalCode,
      addressCountry: 'IT',
    },
    publisher: { '@id': orgId },
  };
  if (images.length) pharmacyLd.image = images.map((u) => ensureAbsoluteUrl(u, base));

  if (hasGeo) {
    pharmacyLd.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
    pharmacyLd.hasMap = `https://www.google.com/maps?q=${lat},${lng}`;
  }
  if (openingHours.length) pharmacyLd.openingHoursSpecification = openingHours;
  if (pharmacy.rating_avg_cached != null && (pharmacy.rating_count_cached ?? 0) > 0) {
    pharmacyLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: pharmacy.rating_avg_cached,
      ratingCount: pharmacy.rating_count_cached,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: 'Farmacie', item: `${base}/listafarmacie/` },
      { '@type': 'ListItem', position: 3, name: pharmacy.name || 'Farmacia', item: pageUrl },
    ],
  };

  const webpage: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: buildPharmacyPageTitle(pharmacy, shifts),
    description: buildPharmacyPageDescription(pharmacy, shifts),
    inLanguage: 'it-IT',
    isPartOf: { '@id': websiteId(base) },
    publisher: { '@id': orgId },
    mainEntity: { '@id': pharmacyId },
  };

  if (hasGeo) {
    webpage.contentLocation = {
      '@type': 'Place',
      name: pharmacy.name || 'Farmacia',
      geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng },
      address: pharmacyLd.address,
    };
  }

  const graphs: Record<string, unknown>[] = [pharmacyLd, breadcrumb, webpage];

  return graphs;
}

export function turniLinksForPharmacy(env: ImportMetaEnv, pharmacy: PharmacyRecord) {
  const links: { href: string; label: string }[] = [];
  if (pharmacy.city) {
    const citySlug = slugifySegment(String(pharmacy.city));
    if (citySlug) {
      links.push({
        href: cityTurniUrl(env, citySlug),
        label: `Farmacie di turno a ${toTitleCase(pharmacy.city)}`,
      });
    }
  }
  if (pharmacy.province) {
    const provName = PROVINCE_NAME_BY_CODE[String(pharmacy.province).toUpperCase()];
    const provSlug = provName ? slugifySegment(provName) : slugifySegment(String(pharmacy.province));
    if (provSlug) {
      links.push({
        href: provinceTurniUrl(env, provSlug),
        label: `Farmacie di turno in provincia di ${provName || pharmacy.province}`,
      });
    }
  }
  return links;
}

export function openingHoursLines(
  pharmacy: PharmacyRecord,
  now = new Date(),
): { label: string; ranges: string; isToday: boolean }[] {
  const schedule = parseOpeningHours(pharmacy.opening_hours);
  if (!schedule) return [];
  const todayLabel = getRomeDayLabel(now);
  return Object.values(schedule).map((day) => ({
    label: day.label,
    ranges: day.ranges.length
      ? day.ranges.map((r) => `${r.start} – ${r.end}`).join(', ')
      : 'Chiuso',
    isToday: day.label === todayLabel,
  }));
}

export function openStatusForPharmacy(pharmacy: PharmacyRecord, shifts: DailyShift[], now = new Date()) {
  // Sab/dom/festivi/notte: solo turno ufficiale (allineato alle liste turni).
  const allowOrdinaryFallback = getTurniQueryMode(now) === 'ordinary';
  return getPharmacyStatus(pharmacy, shifts, now, { allowOrdinaryFallback });
}
