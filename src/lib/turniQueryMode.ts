/** Quando servono i turni ufficiali vs basta l'orario ordinario (opening_hours). */

export type TurniQueryMode = 'ordinary' | 'shift';

const ROME = 'Europe/Rome';

/** Lun–ven 8:00–19:30 → elenco completo con orario ordinario. */
const ORDINARY_START_MINUTES = 8 * 60;
const ORDINARY_END_MINUTES = 19 * 60 + 30;
/** Sabato: molte farmacie lavorano come giorno feriale fino al pomeriggio. */
const SATURDAY_ORDINARY_END_MINUTES = 18 * 60;

/** Festività nazionali italiane (mese-giorno, es. 05-01 = 1 maggio). */
const FIXED_ITALIAN_HOLIDAYS = [
  '01-01', // Capodanno
  '01-06', // Epifania
  '04-25', // Liberazione
  '05-01', // Festa del Lavoro
  '06-02', // Festa della Repubblica
  '08-15', // Ferragosto
  '11-01', // Ognissanti
  '12-08', // Immacolata
  '12-25', // Natale
  '12-26', // Santo Stefano
] as const;

export function getRomeDayIndex(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ROME }).format(now);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  return idx >= 0 ? idx : 0;
}

export function getRomeMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ROME,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

export function getRomeDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Pasqua (domenica) — calendario gregoriano. */
function easterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function easterMondayDateKey(year: number): string {
  const sunday = easterSundayUtc(year);
  const monday = new Date(sunday.getTime() + 86400000);
  const y = monday.getUTCFullYear();
  const mo = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Festività nazionali italiane (inclusa Pasquetta). */
export function isItalianHoliday(now: Date): boolean {
  const dateKey = getRomeDateKey(now);
  const [, monthDay] = dateKey.split('-').length === 3
    ? [dateKey.slice(0, 4), dateKey.slice(5)]
    : ['', ''];
  if (FIXED_ITALIAN_HOLIDAYS.includes(monthDay as (typeof FIXED_ITALIAN_HOLIDAYS)[number])) {
    return true;
  }
  const year = parseInt(dateKey.slice(0, 4), 10);
  return dateKey === easterMondayDateKey(year);
}

/**
 * Orario ordinario (elenco + opening_hours da PagineGialle/Virgilio):
 * - Lun–ven 8:00–19:30
 * - Sabato 8:00–18:00 (giornata lavorativa tipica farmacie)
 *
 * Turno ufficiale (pharmacy_daily_shifts / PharmAround / Ordini):
 * - domenica, festivi, notti, sabato dopo le 18
 */
export function getTurniQueryMode(now = new Date()): TurniQueryMode {
  if (isItalianHoliday(now)) return 'shift';

  const day = getRomeDayIndex(now);
  const minutes = getRomeMinutes(now);

  // Domenica → turno ufficiale
  if (day === 0) return 'shift';

  // Sabato: ordinario fino alle 18, poi turno
  if (day === 6) {
    if (minutes >= ORDINARY_START_MINUTES && minutes < SATURDAY_ORDINARY_END_MINUTES) {
      return 'ordinary';
    }
    return 'shift';
  }

  // Lun–ven
  if (minutes >= ORDINARY_START_MINUTES && minutes < ORDINARY_END_MINUTES) return 'ordinary';
  return 'shift';
}

export function isShiftQueryMode(now = new Date()): boolean {
  return getTurniQueryMode(now) === 'shift';
}
