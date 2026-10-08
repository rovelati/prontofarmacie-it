import { PROVINCE_NAME_BY_CODE } from '@/lib/provinceNames';
import { slugifySegment } from '@/lib/turni';

export const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

export const PROVINCES_BY_REGION: Record<string, string[]> = {
  Abruzzo: ['AQ', 'CH', 'PE', 'TE'],
  Basilicata: ['MT', 'PZ'],
  Calabria: ['CZ', 'CS', 'KR', 'RC', 'VV'],
  Campania: ['AV', 'BN', 'CE', 'NA', 'SA'],
  'Emilia Romagna': ['BO', 'FC', 'FE', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN'],
  'Friuli Venezia Giulia': ['GO', 'PN', 'TS', 'UD'],
  Lazio: ['FR', 'LT', 'RI', 'RM', 'VT'],
  Liguria: ['GE', 'IM', 'SP', 'SV'],
  Lombardia: ['BG', 'BS', 'CO', 'CR', 'LC', 'LO', 'MN', 'MI', 'MB', 'PV', 'SO', 'VA'],
  Marche: ['AN', 'AP', 'FM', 'MC', 'PU'],
  Molise: ['CB', 'IS'],
  Piemonte: ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'],
  Puglia: ['BA', 'BT', 'BR', 'FG', 'LE', 'TA'],
  Sardegna: ['CA', 'NU', 'OR', 'SS', 'SU'],
  Sicilia: ['AG', 'CL', 'CT', 'EN', 'ME', 'PA', 'RG', 'SR', 'TP'],
  Toscana: ['AR', 'FI', 'GR', 'LI', 'LU', 'MS', 'PI', 'PT', 'PO', 'SI'],
  'Trentino Alto Adige': ['BZ', 'TN'],
  Umbria: ['PG', 'TR'],
  "Valle D'Aosta": ['AO'],
  Veneto: ['BL', 'PD', 'RO', 'TV', 'VE', 'VR', 'VI'],
};

const REGION_DISPLAY = new Map<string, string>([
  ['abruzzo', 'Abruzzo'],
  ['basilicata', 'Basilicata'],
  ['calabria', 'Calabria'],
  ['campania', 'Campania'],
  ['emilia romagna', 'Emilia Romagna'],
  ['emilia-romagna', 'Emilia Romagna'],
  ['friuli venezia giulia', 'Friuli Venezia Giulia'],
  ['friuli-venezia-giulia', 'Friuli Venezia Giulia'],
  ['lazio', 'Lazio'],
  ['liguria', 'Liguria'],
  ['lombardia', 'Lombardia'],
  ['marche', 'Marche'],
  ['molise', 'Molise'],
  ['piemonte', 'Piemonte'],
  ['puglia', 'Puglia'],
  ['sardegna', 'Sardegna'],
  ['sicilia', 'Sicilia'],
  ['toscana', 'Toscana'],
  ['trentino alto adige', 'Trentino Alto Adige'],
  ['trentino-alto-adige', 'Trentino Alto Adige'],
  ['umbria', 'Umbria'],
  ["valle d'aosta", "Valle D'Aosta"],
  ['valle d aosta', "Valle D'Aosta"],
  ['valle-daosta', "Valle D'Aosta"],
  ['veneto', 'Veneto'],
  ['italia', 'Italia'],
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function getRegionDisplayName(value: string): string | undefined {
  return REGION_DISPLAY.get(normalizeText(value.replace(/-/g, ' ')));
}

/** Province in evidenza (homepage + listafarmacie): grandi città + 8 ricercate + BG/BS. */
export const TOP_PROVINCES = [
  { code: 'MI', name: 'Milano', slug: 'milano' },
  { code: 'RM', name: 'Roma', slug: 'roma' },
  { code: 'NA', name: 'Napoli', slug: 'napoli' },
  { code: 'TO', name: 'Torino', slug: 'torino' },
  { code: 'BO', name: 'Bologna', slug: 'bologna' },
  { code: 'FI', name: 'Firenze', slug: 'firenze' },
  { code: 'GE', name: 'Genova', slug: 'genova' },
  { code: 'VE', name: 'Venezia', slug: 'venezia' },
  { code: 'VR', name: 'Verona', slug: 'verona' },
  { code: 'PD', name: 'Padova', slug: 'padova' },
  { code: 'PA', name: 'Palermo', slug: 'palermo' },
  { code: 'CT', name: 'Catania', slug: 'catania' },
  { code: 'BA', name: 'Bari', slug: 'bari' },
  { code: 'ME', name: 'Messina', slug: 'messina' },
  { code: 'BG', name: 'Bergamo', slug: 'bergamo' },
  { code: 'BS', name: 'Brescia', slug: 'brescia' },
  { code: 'MN', name: 'Mantova', slug: 'mantova' },
];

export const REGION_NAMES = Object.keys(PROVINCES_BY_REGION);

export const PROVINCE_SLUG_TO_CODE: Record<string, string> = Object.entries(
  PROVINCE_NAME_BY_CODE,
).reduce<Record<string, string>>((acc, [code, name]) => {
  acc[slugifySegment(name)] = code;
  acc[code.toLowerCase()] = code;
  return acc;
}, {});

export function cleanListSlug(raw: string): string {
  return raw
    .replace(/^farmacie-(a|in|di|della|del|dello|dei|degli|delle)-/i, '')
    .replace(/^farmacie-/i, '')
    .trim();
}
