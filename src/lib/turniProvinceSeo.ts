import type { PharmacyRow } from '@/lib/turniData';
import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { PROVINCES_BY_REGION, toTitleCase } from '@/lib/locationUtils';
import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';
import { getSupabase } from '@/lib/supabase';
import { cityTurniUrl, provinceTurniUrl, siteUrl, slugifySegment } from '@/lib/turni';

const MAIN_CITIES_BY_PROVINCE: Record<string, string[]> = {
  CH: ['Lanciano', 'Ortona', 'Vasto', 'Francavilla Al Mare', 'San Giovanni Teatino'],
  CT: ['Catania', 'Acireale', 'Paternò', 'Misterbianco'],
  MN: [
    'Mantova',
    'Castiglione delle Stiviere',
    'Suzzara',
    'Viadana',
    'Porto Mantovano',
    'Borgo Virgilio',
    'Curtatone',
    'Castel Goffredo',
    'Goito',
    'Asola',
  ],
  BG: ['Bergamo', 'Treviglio', 'Seriate', 'Dalmine', 'Romano di Lombardia'],
  BS: ['Brescia', 'Desenzano del Garda', 'Lumezzane', 'Montichiari', 'Chiari'],
  CR: ['Cremona', 'Crema', 'Casalmaggiore', 'Soresina'],
  LO: ['Lodi', 'Codogno', "Sant'Angelo Lodigiano"],
  MB: ['Monza', 'Seregno', 'Desio', 'Lissone', 'Cesano Maderno'],
  PV: ['Pavia', 'Vigevano', 'Voghera', 'Stradella'],
  CO: ['Como', 'Cantù', 'Erba', 'Mariano Comense'],
  LC: ['Lecco', 'Merate', 'Calolziocorte'],
  SO: ['Sondrio', 'Morbegno', 'Tirano'],
  VA: ['Varese', 'Busto Arsizio', 'Gallarate', 'Saronno'],
  MI: [
    'Milano',
    'Sesto San Giovanni',
    'Cinisello Balsamo',
    'Legnano',
    'Rho',
    'Cologno Monzese',
    'Rozzano',
    'San Giuliano Milanese',
    'Pioltello',
    'Segrate',
  ],
  RM: [
    'Roma',
    'Guidonia Montecelio',
    'Fiumicino',
    'Tivoli',
    'Anzio',
    'Ciampino',
    'Pomezia',
    'Velletri',
    'Civitavecchia',
    'Monterotondo',
    'Albano Laziale',
    'Frascati',
  ],
  NA: [
    'Napoli',
    'Giugliano in Campania',
    'Torre del Greco',
    'Casoria',
    'Afragola',
    'Pozzuoli',
    'Acerra',
    'Portici',
    'Ercolano',
    'Castellammare di Stabia',
  ],
  TO: [
    'Torino',
    'Moncalieri',
    'Rivoli',
    'Collegno',
    'Nichelino',
    'Settimo Torinese',
    'Chieri',
    'Grugliasco',
    'Pinerolo',
    'Ivrea',
    'Orbassano',
  ],
  PA: ['Palermo', 'Bagheria', 'Partinico', 'Monreale'],
  FI: ['Firenze', 'Prato', 'Empoli', 'Scandicci'],
  BO: [
    'Bologna',
    'Imola',
    'Casalecchio di Reno',
    'San Lazzaro di Savena',
    'Castel Maggiore',
    'San Giovanni in Persiceto',
    'Budrio',
    'Zola Predosa',
  ],
  GE: ['Genova', 'Rapallo', 'Chiavari', 'Sestri Levante'],
  VE: ['Venezia', 'Chioggia', 'Mira', 'Jesolo'],
  VR: ['Verona', 'Villafranca di Verona', 'Legnago', 'Bussolengo'],
  PD: ['Padova', 'Albignasego', 'Cittadella', 'Abano Terme'],
  EN: ['Piazza Armerina', 'Nicosia', 'Leonforte', 'Barrafranca', 'Agira'],
  CL: ['Caltanissetta', 'Gela', 'San Cataldo', 'Niscemi'],
  ME: ['Messina', 'Milazzo', 'Barcellona Pozzo di Gotto', 'Taormina'],
  AG: ['Agrigento', 'Sciacca', 'Canicattì', 'Licata'],
  TP: ['Trapani', 'Marsala', 'Mazara del Vallo', 'Alcamo'],
  SR: ['Siracusa', 'Avola', 'Noto', 'Augusta'],
  RG: ['Ragusa', 'Modica', 'Vittoria', 'Comiso'],
  MS: ['Massa', 'Carrara', 'Aulla', 'Fivizzano', 'Pontremoli', 'Montignoso', 'Licciana Nardi', 'Villafranca In Lunigiana', 'Bagnone', 'Mulazzo'],
  SP: ['La Spezia', 'Sarzana', 'Santo Stefano Di Magra', 'Lerici', 'Porto Venere', 'Bolano', 'Brugnato'],
  LU: ['Lucca', 'Viareggio', 'Capannori', 'Camaiore', 'Pietrasanta'],
  PI: ['Pisa', 'Cascina', 'Pontedera', 'San Giuliano Terme'],
};

/** Province geograficamente vicine (non l’intero elenco regionale). */
const ADJACENT_PROVINCES: Record<string, string[]> = {
  MN: ['CR', 'BS', 'VR', 'RO', 'RE', 'PR'],
  MI: ['MB', 'LO', 'PV', 'BG', 'VA'],
  MB: ['MI', 'LC', 'CO', 'BG'],
  BG: ['MI', 'MB', 'LC', 'BS', 'CR'],
  BS: ['BG', 'CR', 'MN', 'VR'],
  CR: ['BS', 'MN', 'LO', 'MI', 'PR'],
  LO: ['MI', 'CR', 'PV', 'PI'],
  PV: ['MI', 'LO', 'AL', 'PC'],
  VA: ['MI', 'CO', 'NO'],
  CO: ['VA', 'LC', 'MI', 'MB'],
  LC: ['CO', 'BG', 'MB'],
  SO: ['LC', 'BG', 'BS'],
  VR: ['MN', 'BS', 'VI', 'PD', 'RO'],
  RO: ['MN', 'VR', 'PD', 'FE'],
  RE: ['MN', 'PR', 'MO', 'CR'],
  PR: ['MN', 'CR', 'RE', 'PC'],
  RM: ['LT', 'FR', 'RI', 'VT'],
  NA: ['CE', 'SA', 'AV'],
  TO: ['AT', 'AL', 'CN', 'VC', 'BI'],
  MS: ['SP', 'LU', 'PR', 'RE'],
  SP: ['MS', 'GE', 'PR'],
  LU: ['MS', 'PI', 'PT', 'FI'],
  PI: ['LU', 'LI', 'FI', 'PO'],
};

export interface TurniRelatedLink {
  href: string;
  label: string;
}

function getRegionByProvince(provinceCode: string): string | null {
  for (const [region, codes] of Object.entries(PROVINCES_BY_REGION)) {
    if (codes.includes(provinceCode.toUpperCase())) return region;
  }
  return null;
}

/** Titolo SEO standard per pagine `/farmacie-di-turno/*`. */
export function buildTurniSeoTitle(localita?: string | null): string {
  const suffix = ' - Mappa e Orari - Prontofarmacie';
  const place = localita?.trim();
  if (!place) return `Farmacie di Turno${suffix}`;
  return `Farmacie di Turno a ${place}${suffix}`;
}

export function buildTurniSeoTitleVicino(): string {
  return `Farmacie di Turno vicino a te - Mappa e Orari - Prontofarmacie`;
}

export function buildProvinceTurniTitle(provinceLabel: string): string {
  const suffix = ' - Mappa e Orari - Prontofarmacie';
  return `Farmacie di Turno in provincia di ${provinceLabel.trim()}${suffix}`;
}

export function buildProvinceTurniHeading(provinceLabel: string): string {
  return `Farmacie di turno della provincia di ${provinceLabel}`;
}

export function buildProvinceTurniMetaDescription(provinceLabel: string): string {
  return `Farmacie di turno in provincia di ${provinceLabel}: consulta mappa, orari e telefono aggiornati prima di partire. Trova la farmacia aperta ora più vicina.`;
}

export function buildProvinceTurniRelatedLinks(
  env: ImportMetaEnv,
  provinceCode: string,
  provinceLabel: string,
  rows: PharmacyRow[],
): TurniRelatedLink[] {
  const links: TurniRelatedLink[] = [];
  const seen = new Set<string>();

  const addCity = (cityName: string) => {
    const normalized = cityName.trim();
    if (!normalized) return;
    const slug = slugifySegment(normalized);
    const key = `city:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      href: cityTurniUrl(env, slug),
      label: `Farmacie di turno a ${normalized}`,
    });
  };

  const addProvince = (code: string) => {
    const name = PROVINCE_NAME_BY_CODE[code];
    if (!name) return;
    const slug = slugifySegment(name);
    const key = `prov:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      href: provinceTurniUrl(env, slug),
      label: `Farmacie di turno in provincia di ${name}`,
    });
  };

  addCity(provinceLabel);

  for (const city of MAIN_CITIES_BY_PROVINCE[provinceCode.toUpperCase()] || []) {
    if (links.length >= 4) break;
    if (city.toLowerCase() === provinceLabel.toLowerCase()) continue;
    addCity(city);
  }

  if (links.length < 4) {
    const citiesFromRows = [...new Set(rows.map((row) => row.city).filter(Boolean))];
    for (const city of citiesFromRows) {
      if (links.length >= 4) break;
      if (city.toLowerCase() === provinceLabel.toLowerCase()) continue;
      addCity(city);
    }
  }

  const region = getRegionByProvince(provinceCode);
  if (region) {
    const nearby = (PROVINCES_BY_REGION[region] || []).find(
      (code) => code.toUpperCase() !== provinceCode.toUpperCase(),
    );
    if (nearby) addProvince(nearby);
  }

  return links.slice(0, 4);
}

export function buildCityTurniNearbyCityLinks(
  env: ImportMetaEnv,
  cityLabel: string,
  provinceCode: string,
  limit = 2,
): TurniRelatedLink[] {
  const links: TurniRelatedLink[] = [];
  const seen = new Set<string>();
  const currentSlug = slugifySegment(cityLabel);
  const normalizedProvince = provinceCode.toUpperCase();

  const addCity = (cityName: string) => {
    if (links.length >= limit) return;
    const normalized = cityName.trim();
    if (!normalized) return;
    const slug = slugifySegment(normalized);
    if (!slug || slug === currentSlug || seen.has(slug)) return;
    seen.add(slug);
    links.push({
      href: cityTurniUrl(env, slug),
      label: `Farmacie di turno a ${normalized}`,
    });
  };

  for (const city of MAIN_CITIES_BY_PROVINCE[normalizedProvince] || []) {
    addCity(city);
  }

  // Se in provincia non bastano: solo pagine provincia confinanti (niente Milano su Mantova).
  if (links.length < limit) {
    const neighbors = ADJACENT_PROVINCES[normalizedProvince] || [];
    for (const code of neighbors) {
      if (links.length >= limit) break;
      const name = PROVINCE_NAME_BY_CODE[code.toUpperCase()];
      if (!name) continue;
      const slug = slugifySegment(name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      links.push({
        href: provinceTurniUrl(env, slug),
        label: `Farmacie di turno in provincia di ${name}`,
      });
    }
  }

  return links;
}

async function fetchNearbyCitiesFromProvinceDb(
  env: ImportMetaEnv,
  provinceCode: string,
  excludeSlug: string,
  limit = 12,
): Promise<{ city: string; citySlug: string }[]> {
  const code = provinceCode.toUpperCase();
  if (!code) return [];

  return cached(`turni-nearby-cities:${code}:${excludeSlug}`, CACHE_TTL_TURNI_MS * 12, async () => {
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('paginegialle_pharmacies')
      .select('city, city_slug')
      .eq('province', code)
      .not('city_slug', 'is', null)
      .neq('city_slug', excludeSlug)
      .limit(120);
    if (error) return [];

    const counts = new Map<string, { city: string; citySlug: string; n: number }>();
    for (const row of data ?? []) {
      const slug = String(row.city_slug || '').trim().toLowerCase();
      if (!slug || slug === excludeSlug) continue;
      // Evita frazioni/slug anomali troppo lunghi o uguali al nome farmacia.
      if (slug.includes('farmacia') || slug.split('-').length > 5) continue;
      const city =
        (row.city && String(row.city).trim()) ||
        toTitleCase(slug.replace(/-/g, ' '));
      const prev = counts.get(slug);
      if (prev) prev.n += 1;
      else counts.set(slug, { city, citySlug: slug, n: 1 });
    }

    return [...counts.values()]
      .sort((a, b) => b.n - a.n || a.city.localeCompare(b.city, 'it'))
      .slice(0, limit)
      .map(({ city, citySlug }) => ({ city, citySlug }));
  });
}

export async function buildCityTurniRelatedLinks(
  env: ImportMetaEnv,
  cityLabel: string,
  provinceCode: string,
  rows: PharmacyRow[],
): Promise<TurniRelatedLink[]> {
  const links: TurniRelatedLink[] = [];
  const seen = new Set<string>();
  const currentSlug = slugifySegment(cityLabel);

  const addLink = (key: string, href: string, label: string) => {
    if (!href || seen.has(key)) return;
    seen.add(key);
    links.push({ href, label });
  };

  const addCity = (cityName: string, citySlug?: string) => {
    const normalized = cityName.trim();
    if (!normalized) return;
    const slug = (citySlug || slugifySegment(normalized)).toLowerCase();
    if (!slug || slug === currentSlug) return;
    addLink(`city:${slug}`, cityTurniUrl(env, slug), `Farmacie di turno a ${normalized}`);
  };

  const normalizedProvince = provinceCode.toUpperCase();

  const RELATED_LINKS_MAX = 4;

  // 1) Città già in pagina (anche comuni da ricerca estesa / sync on-demand).
  for (const row of rows) {
    if (links.length >= RELATED_LINKS_MAX) break;
    if (!row.city) continue;
    addCity(row.city);
  }

  // 2) Comuni principali della stessa provincia.
  for (const city of MAIN_CITIES_BY_PROVINCE[normalizedProvince] || []) {
    if (links.length >= RELATED_LINKS_MAX) break;
    addCity(city);
  }

  // 3) Altri comuni della provincia dal DB (ordinati per n. farmacie).
  if (links.length < RELATED_LINKS_MAX && normalizedProvince) {
    const fromDb = await fetchNearbyCitiesFromProvinceDb(
      env,
      normalizedProvince,
      currentSlug,
      RELATED_LINKS_MAX,
    );
    for (const item of fromDb) {
      if (links.length >= RELATED_LINKS_MAX) break;
      addCity(item.city, item.citySlug);
    }
  }

  // 4) Fallback: province confinanti.
  if (links.length < RELATED_LINKS_MAX && normalizedProvince) {
    const neighbors = ADJACENT_PROVINCES[normalizedProvince] || [];
    for (const code of neighbors) {
      if (links.length >= RELATED_LINKS_MAX) break;
      const name = PROVINCE_NAME_BY_CODE[code.toUpperCase()];
      if (!name) continue;
      addLink(
        `prov:${code}`,
        provinceTurniUrl(env, slugifySegment(name)),
        `Farmacie di turno in provincia di ${name}`,
      );
    }
  }

  const provinceName = PROVINCE_NAME_BY_CODE[normalizedProvince];
  if (provinceName && links.length < RELATED_LINKS_MAX) {
    addLink(
      `prov:${normalizedProvince}`,
      provinceTurniUrl(env, slugifySegment(provinceName)),
      `Tutte le farmacie di turno in provincia di ${provinceName}`,
    );
  }

  return links.slice(0, RELATED_LINKS_MAX);
}

export function buildCityTurniMetaDescription(cityLabel: string): string {
  return `Farmacie di turno a ${cityLabel}: consulta mappa, orari e telefono aggiornati prima di partire. Trova la farmacia aperta ora più vicina.`;
}

export function buildTurniPharmacyItemListJsonLd(
  env: ImportMetaEnv,
  rows: PharmacyRow[],
  listTitle: string,
  description: string,
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const base = siteUrl(env);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listTitle,
    description,
    numberOfItems: rows.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: rows.slice(0, 50).map((row, index) => {
      const lat = row.latitude != null ? Number(row.latitude) : NaN;
      const lng = row.longitude != null ? Number(row.longitude) : NaN;
      const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Pharmacy',
          '@id': row.prontofarmacie_slug
            ? `${base}/farmacia/${row.prontofarmacie_slug}/`
            : undefined,
          name: row.name,
          telephone: row.phone || undefined,
          url: row.prontofarmacie_slug
            ? `${base}/farmacia/${row.prontofarmacie_slug}/`
            : undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: row.address || undefined,
            addressLocality: row.city || undefined,
            addressRegion: row.province || undefined,
            addressCountry: 'IT',
          },
          ...(hasGeo
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: lat,
                  longitude: lng,
                },
              }
            : {}),
        },
      };
    }),
  };
}
