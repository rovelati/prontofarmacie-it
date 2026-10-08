import { cityTurniUrl, provinceTurniUrl, slugifySegment } from '@/lib/turni';

const TOP_PROVINCE = [
  { slug: 'mantova', label: 'Mantova' },
  { slug: 'como', label: 'Como' },
  { slug: 'chieti', label: 'Chieti' },
  { slug: 'crotone', label: 'Crotone' },
  { slug: 'catanzaro', label: 'Catanzaro' },
  { slug: 'bergamo', label: 'Bergamo' },
];

const LOMBARDY_PROVINCES: {
  slug: string;
  label: string;
  cities: { slug: string; label: string }[];
}[] = [
  {
    slug: 'bergamo',
    label: 'Bergamo',
    cities: [
      { slug: 'bergamo', label: 'Bergamo' },
      { slug: 'treviglio', label: 'Treviglio' },
      { slug: 'seriate', label: 'Seriate' },
      { slug: 'dalmine', label: 'Dalmine' },
    ],
  },
  {
    slug: 'brescia',
    label: 'Brescia',
    cities: [
      { slug: 'brescia', label: 'Brescia' },
      { slug: 'desenzano-del-garda', label: 'Desenzano del Garda' },
      { slug: 'montichiari', label: 'Montichiari' },
      { slug: 'lumezzane', label: 'Lumezzane' },
    ],
  },
  {
    slug: 'como',
    label: 'Como',
    cities: [
      { slug: 'como', label: 'Como' },
      { slug: 'cantu', label: 'Cantù' },
      { slug: 'mariano-comense', label: 'Mariano Comense' },
    ],
  },
  {
    slug: 'cremona',
    label: 'Cremona',
    cities: [
      { slug: 'cremona', label: 'Cremona' },
      { slug: 'crema', label: 'Crema' },
    ],
  },
  {
    slug: 'lecco',
    label: 'Lecco',
    cities: [
      { slug: 'lecco', label: 'Lecco' },
      { slug: 'merate', label: 'Merate' },
      { slug: 'calolziocorte', label: 'Calolziocorte' },
    ],
  },
  {
    slug: 'lodi',
    label: 'Lodi',
    cities: [
      { slug: 'lodi', label: 'Lodi' },
      { slug: 'codogno', label: 'Codogno' },
    ],
  },
  {
    slug: 'mantova',
    label: 'Mantova',
    cities: [
      { slug: 'mantova', label: 'Mantova' },
      { slug: 'suzzara', label: 'Suzzara' },
      { slug: 'castiglione-delle-stiviere', label: 'Castiglione delle Stiviere' },
    ],
  },
  {
    slug: 'milano',
    label: 'Milano',
    cities: [
      { slug: 'milano', label: 'Milano' },
      { slug: 'sesto-san-giovanni', label: 'Sesto San Giovanni' },
      { slug: 'cinisello-balsamo', label: 'Cinisello Balsamo' },
      { slug: 'rho', label: 'Rho' },
      { slug: 'legnano', label: 'Legnano' },
    ],
  },
  {
    slug: 'monza-e-della-brianza',
    label: 'Monza e Brianza',
    cities: [
      { slug: 'monza', label: 'Monza' },
      { slug: 'desio', label: 'Desio' },
      { slug: 'lissone', label: 'Lissone' },
      { slug: 'seregno', label: 'Seregno' },
      { slug: 'vimercate', label: 'Vimercate' },
    ],
  },
  {
    slug: 'pavia',
    label: 'Pavia',
    cities: [
      { slug: 'pavia', label: 'Pavia' },
      { slug: 'vigevano', label: 'Vigevano' },
      { slug: 'voghera', label: 'Voghera' },
    ],
  },
  {
    slug: 'sondrio',
    label: 'Sondrio',
    cities: [
      { slug: 'sondrio', label: 'Sondrio' },
      { slug: 'tirano', label: 'Tirano' },
    ],
  },
  {
    slug: 'varese',
    label: 'Varese',
    cities: [
      { slug: 'varese', label: 'Varese' },
      { slug: 'busto-arsizio', label: 'Busto Arsizio' },
      { slug: 'gallarate', label: 'Gallarate' },
      { slug: 'saronno', label: 'Saronno' },
    ],
  },
];

const TOP_CITIES = [
  'niscemi', 'vittoria', 'riccione', 'acerra', 'laterza', 'gubbio', 'noci',
  'ceglie-messapica', 'porto-empedocle', 'torremaggiore', 'ovada', 'san-salvo',
].map((slug) => ({
  slug,
  label: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

const MAIN_CITIES = [
  'milano', 'roma', 'napoli', 'torino', 'bologna', 'firenze', 'bari', 'verona', 'padova', 'bergamo', 'como', 'mantova',
].map((slug) => ({ slug, label: slug.charAt(0).toUpperCase() + slug.slice(1) }));

export interface LocationTreeNode {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

export interface LocationTreeSection {
  title: string;
  nodes: LocationTreeNode[];
  layout?: 'list' | 'grid';
}

function buildProvinceNodes(
  env: ImportMetaEnv,
  provinces: { slug: string; label: string; cities?: { slug: string; label: string }[] }[],
  used: Set<string>,
): LocationTreeNode[] {
  return provinces.map((prov) => {
    const children = (prov.cities ?? MAIN_CITIES.filter((c) => c.slug === prov.slug)).map((c) => {
      used.add(c.slug);
      return { label: c.label, href: cityTurniUrl(env, c.slug) };
    });
    return {
      label: `Provincia di ${prov.label}`,
      href: provinceTurniUrl(env, prov.slug),
      children,
    };
  });
}

export function buildLocationTree(baseUrl: string): LocationTreeSection[] {
  const env = { PUBLIC_SITE_URL: baseUrl } as ImportMetaEnv;
  const used = new Set<string>();

  const provinceNodes = buildProvinceNodes(env, TOP_PROVINCE, used);
  const lombardiaNodes = buildProvinceNodes(env, LOMBARDY_PROVINCES, used);

  const comuniNodes = TOP_CITIES.filter((c) => !used.has(c.slug)).map((c) => {
    used.add(c.slug);
    return { label: c.label, href: cityTurniUrl(env, c.slug) };
  });

  const grandiNodes = MAIN_CITIES.filter((c) => !used.has(c.slug)).map((c) => ({
    label: c.label,
    href: cityTurniUrl(env, c.slug),
  }));

  return [
    { title: 'Province più cercate', nodes: provinceNodes, layout: 'list' },
    { title: 'Lombardia — province e comuni principali', nodes: lombardiaNodes, layout: 'grid' },
    { title: 'Comuni più cercati', nodes: comuniNodes, layout: 'list' },
    { title: 'Grandi città', nodes: grandiNodes, layout: 'list' },
  ].filter((s) => s.nodes.length > 0);
}

export function resolveTurniSearch(baseUrl: string, query: string): string | null {
  const env = { PUBLIC_SITE_URL: baseUrl } as ImportMetaEnv;
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.includes('vicino a me')) {
    return '/farmacie-di-turno/?near=1';
  }
  let q = normalized
    .replace(/^(farmacie|farmacia)\s+(di\s+turno|aperte?)\s*/u, '')
    .replace(/\b(oggi|adesso|aperte\s+ora)\b/gu, '')
    .trim();
  const isProvince = q.includes('provincia') || q.includes('e provincia');
  q = q
    .replace(/\be\s+provincia\b/gu, '')
    .replace(/\b(provincia\s+di|provincia)\b/gu, '')
    .replace(/\ba\b/gu, ' ')
    .trim();
  const slug = slugifySegment(q);
  if (!slug) return null;
  return isProvince ? provinceTurniUrl(env, slug) : cityTurniUrl(env, slug);
}
