/** Port da php/turni_status.php */

export interface DailyShift {
  pharmacy_id: string;
  shift_date?: string;
  shift_type?: string | null;
  start_at: string;
  end_at: string;
  is_h24?: boolean | null;
  /** Priorità fonte (più basso = preferita). Opzionale. */
  source_priority?: number | null;
}

export interface PharmacyStatus {
  label: string;
  color: string;
  detail: string;
  isOpen: boolean;
  hasOfficialShift: boolean;
  shiftType?: string;
}

type TimeRange = { start: string; end: string };
type DaySchedule = { label: string; ranges: TimeRange[] };

const DAY_LABELS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const DAY_MAP: Record<string, string> = {
  domenica: 'Domenica',
  dom: 'Domenica',
  lunedi: 'Lunedì',
  lunedì: 'Lunedì',
  lun: 'Lunedì',
  martedi: 'Martedì',
  martedì: 'Martedì',
  mar: 'Martedì',
  mercoledi: 'Mercoledì',
  mercoledì: 'Mercoledì',
  mer: 'Mercoledì',
  giovedi: 'Giovedì',
  giovedì: 'Giovedì',
  gio: 'Giovedì',
  venerdi: 'Venerdì',
  venerdì: 'Venerdì',
  ven: 'Venerdì',
  sabato: 'Sabato',
  sab: 'Sabato',
};

const ROME = 'Europe/Rome';

function normalizeTimeToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.replace(/\./g, ':').trim().replace(/[^\d:]/g, '');
  if (!cleaned) return null;
  if (/^\d{1,2}$/.test(cleaned)) return `${cleaned.padStart(2, '0')}:00`;
  if (/^\d{1,2}:\d{1,2}$/.test(cleaned)) {
    const [h, m] = cleaned.split(':').map((x) => parseInt(x, 10));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return null;
}

function parseRanges(timesStr: string | null | undefined): TimeRange[] {
  if (!timesStr?.trim()) return [];
  let cleaned = timesStr.trim().replace(/[–—]/g, '-');
  cleaned = cleaned.replace(/\s*[/;]\s*/g, ',');
  cleaned = cleaned.replace(
    /(\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2})\s+(?=\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2})/g,
    '$1,',
  );
  const ranges: TimeRange[] = [];
  for (const range of cleaned.split(',')) {
    const parts = range.trim().split('-').map((p) => p.trim());
    if (parts.length !== 2) continue;
    const start = normalizeTimeToken(parts[0]);
    const end = normalizeTimeToken(parts[1]);
    if (start && end) ranges.push({ start, end });
  }
  return ranges;
}

function normalizeDayLabel(value: string): string | null {
  const cleaned = value.trim().replace(/[,.]/g, '').toLowerCase();
  return DAY_MAP[cleaned] ?? null;
}

export function parseOpeningHours(openingHours: unknown): Record<string, DaySchedule> | null {
  if (!openingHours) return null;
  let raw = openingHours;
  if (typeof raw === 'object' && raw !== null && 'raw' in raw && typeof (raw as { raw: unknown }).raw === 'string') {
    raw = (raw as { raw: string }).raw;
  }
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const schedule: Record<string, DaySchedule> = {};
  const continuatoMatch = raw.match(/continuato[:\s]+([\d.:]+\s*[-–—]\s*[\d.:]+)/iu);
  if (continuatoMatch) {
    const ranges = parseRanges(continuatoMatch[1]);
    if (ranges.length) {
      for (const day of DAY_LABELS.slice(1).concat(DAY_LABELS[0])) {
        schedule[day.toLowerCase()] = { label: day, ranges };
      }
      return schedule;
    }
  }

  const tokens = raw.split('|').map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.includes(',')) {
      const parts = token.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length) {
        const label = normalizeDayLabel(parts[0]);
        if (label) {
          schedule[label.toLowerCase()] = {
            label,
            ranges: parseRanges(parts.slice(1).join(',')),
          };
          continue;
        }
      }
    }
    const label = normalizeDayLabel(token);
    if (label) {
      const next = tokens[i + 1] ?? '';
      schedule[label.toLowerCase()] = {
        label,
        ranges: /\d/.test(next) ? parseRanges(next) : [],
      };
      if (/\d/.test(next)) i++;
    }
  }

  return Object.keys(schedule).length ? schedule : null;
}

function timeToMinutes(time: string): number | null {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || m < 0) return null;
  return h * 60 + m;
}

function formatRomeTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ROME,
  }).format(date);
}

function formatShiftLabel(shift: DailyShift): string {
  if (shift.is_h24) return 'Turno H24';
  const type = String(shift.shift_type ?? '').toLowerCase();
  if (type === 'night' || type === 'notte') return 'Turno notturno';
  if (type === 'day' || type === 'diurno') return 'Turno diurno';
  return 'Di turno';
}

function formatShiftDetail(shift: DailyShift, end: Date): string {
  return `${formatShiftLabel(shift)} fino alle ${formatRomeTime(end)}`;
}

export function getRomeDayLabel(now = new Date()): string {
  return DAY_LABELS[getRomeDayIndex(now)];
}

function getRomeDayIndex(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ROME }).format(now);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  return idx >= 0 ? idx : 0;
}

function getRomeMinutes(now: Date): number {
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

function getOpeningHoursStatus(openingHours: unknown, now: Date): PharmacyStatus {
  const schedule = parseOpeningHours(openingHours);
  if (!schedule) {
    return {
      label: 'Orari non disponibili',
      color: 'gray',
      detail: 'Orari non disponibili',
      isOpen: false,
      hasOfficialShift: false,
    };
  }

  const dayLabel = DAY_LABELS[getRomeDayIndex(now)];
  const entry = schedule[dayLabel.toLowerCase()];
  const nowMinutes = getRomeMinutes(now);

  // Giorno assente o senza fasce = chiusa quel giorno (non "orari non disponibili":
  // gli orari degli altri giorni ci sono, come nella sezione Orari della scheda).
  if (!entry?.ranges?.length) {
    return {
      label: 'Chiusa ora',
      color: 'amber',
      detail: `Chiusa ${dayLabel.toLowerCase()}`,
      isOpen: false,
      hasOfficialShift: false,
    };
  }

  const ranges = entry.ranges
    .map((range) => {
      const startMin = timeToMinutes(range.start);
      const endMin = timeToMinutes(range.end);
      if (startMin == null || endMin == null) return null;
      return { ...range, startMin, endMin };
    })
    .filter(Boolean) as Array<TimeRange & { startMin: number; endMin: number }>;

  for (const range of ranges) {
    if (nowMinutes >= range.startMin && nowMinutes <= range.endMin) {
      return {
        label: 'Aperta ora',
        color: 'emerald',
        detail: `Orario ordinario fino alle ${range.end}`,
        isOpen: true,
        hasOfficialShift: false,
      };
    }
  }

  let nextRange: (TimeRange & { startMin: number }) | null = null;
  for (const range of ranges) {
    if (range.startMin > nowMinutes && (!nextRange || range.startMin < nextRange.startMin)) {
      nextRange = range;
    }
  }

  return {
    label: 'Chiusa ora',
    color: 'amber',
    detail: nextRange ? `Apre alle ${nextRange.start}` : 'Chiusa per oggi',
    isOpen: false,
    hasOfficialShift: false,
  };
}

export type PharmacyStatusOptions = {
  /**
   * Se false (sab/dom/festivi/notte): non usare opening_hours.
   * Evita falsi "Aperta ora" quando serve solo il turno ufficiale.
   */
  allowOrdinaryFallback?: boolean;
};

export function getPharmacyStatus(
  pharmacy: { opening_hours?: unknown },
  shifts: DailyShift[],
  now = new Date(),
  options: PharmacyStatusOptions = {},
): PharmacyStatus {
  const allowOrdinaryFallback = options.allowOrdinaryFallback !== false;
  let activeShift: (DailyShift & { _end: Date }) | null = null;
  let nextShift: (DailyShift & { _start: Date }) | null = null;

  for (const shift of shifts) {
    if (!shift.start_at || !shift.end_at) continue;
    const start = new Date(shift.start_at);
    const end = new Date(shift.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (now >= start && now <= end) {
      const priority = shift.source_priority ?? 50;
      const currentPriority = activeShift?.source_priority ?? 50;
      // Preferisci fonti istituzionali (Federfarma/Ordini) rispetto a sync secondari.
      if (!activeShift || priority < currentPriority) {
        activeShift = { ...shift, _end: end };
      }
      continue;
    }
    if (start > now && (!nextShift || start < nextShift._start)) {
      nextShift = { ...shift, _start: start };
    }
  }

  if (activeShift) {
    return {
      label: 'Aperta ora',
      color: 'emerald',
      detail: formatShiftDetail(activeShift, activeShift._end),
      isOpen: true,
      hasOfficialShift: true,
      shiftType: String(activeShift.shift_type ?? ''),
    };
  }

  if (nextShift) {
    return {
      label: 'Chiusa ora',
      color: 'amber',
      detail: `${formatShiftLabel(nextShift)} dalle ${formatRomeTime(nextShift._start)}`,
      isOpen: false,
      hasOfficialShift: true,
      shiftType: String(nextShift.shift_type ?? ''),
    };
  }

  if (!allowOrdinaryFallback) {
    return {
      label: 'Chiusa ora',
      color: 'amber',
      detail: 'Nessun turno ufficiale in questo momento',
      isOpen: false,
      hasOfficialShift: false,
    };
  }

  return getOpeningHoursStatus(pharmacy.opening_hours, now);
}

export function groupDailyShifts(rows: DailyShift[]): Record<string, DailyShift[]> {
  const grouped: Record<string, DailyShift[]> = {};
  for (const row of rows) {
    const id = row.pharmacy_id;
    if (!id) continue;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(row);
  }
  return grouped;
}
