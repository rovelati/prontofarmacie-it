/**
 * Sync on-demand turni da PharmAround quando la pagina città è a zero.
 * Scrive solo pharmacy_daily_shifts + turni_updated_at (NON opening_hours legacy).
 */
import { localDb, query } from '@/lib/local-db';

const BASE_URL = 'https://web.pharmaround.it';
const LISTING_TMPL = `${BASE_URL}/farmacie/{city_slug}?onlyOpen=true`;
const FETCH_TIMEOUT_MS = 8_000;
const COOLDOWN_MS = 10 * 60 * 1000;
const ROME = 'Europe/Rome';

type SyncAttempt = { at: number; upserted: number };
const recentAttempts = new Map<string, SyncAttempt>();

export type PharmAroundOnDemandResult = {
  attempted: boolean;
  skippedReason?: string;
  listingCount: number;
  matched: number;
  created: number;
  upserted: number;
  error?: string;
};

export type PharmAroundOnDemandOptions = {
  /** @deprecated Non usare in pageview: bypassava il cooldown su ogni hit. */
  force?: boolean;
};

type ListingEntry = {
  name: string;
  address: string;
  city: string;
  citySlugFromUrl: string;
  detailPath: string;
  detailUrl: string;
  locationId: string;
  statusText: string;
  shiftKind: 'night' | 'day';
};

type ShiftWindow = {
  shift_date: string;
  shift_type: string;
  start_at: Date;
  end_at: Date;
  is_h24: boolean;
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

function classifyStatus(statusText: string): 'night' | 'day' | 'skip' {
  const norm = normalizeText(statusText);
  if (norm.includes('tutta la notte')) return 'night';
  if (norm.includes('aperto') || norm.includes('in turno')) return 'day';
  return 'skip';
}

function parseHhMm(value: string): [number, number] {
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  return [h || 0, m || 0];
}

function romeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
  };
}

/** Costruisce un Date UTC corrispondente a un orario Europe/Rome. */
function romeLocalToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ROME,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const tzPart = fmt.formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  let offsetMin = 60;
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    offsetMin = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
  }
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0) - offsetMin * 60_000);
}

function computeNightWindow(now = new Date()): ShiftWindow {
  const p = romeParts(now);
  const [startH, startM] = parseHhMm('20:00');
  const [endH, endM] = parseHhMm('08:00');
  let start = romeLocalToUtc(p.year, p.month, p.day, startH, startM);
  let end = romeLocalToUtc(p.year, p.month, p.day, endH, endM);
  const mins = p.hour * 60 + p.minute;
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (mins >= startMins) {
    end = new Date(end.getTime() + 86400000);
  } else if (mins < endMins) {
    start = new Date(start.getTime() - 86400000);
  } else {
    end = new Date(end.getTime() + 86400000);
  }

  // Domenica/pomeriggio: PharmAround marca già "in turno, tutta la notte"
  // anche prima delle 20:00 — anticipa l'inizio così la pagina non resta vuota.
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ROME }).format(now);
  const isSunday = weekday === 'Sun';
  if ((isSunday || mins >= 12 * 60) && mins < startMins && mins >= endMins) {
    start = romeLocalToUtc(p.year, p.month, p.day, 8, 0);
    if (start > now) start = new Date(now.getTime() - 5 * 60_000);
  }

  const shiftDate = start.toLocaleDateString('en-CA', { timeZone: ROME });
  return { shift_date: shiftDate, shift_type: 'night', start_at: start, end_at: end, is_h24: false };
}

function parseCloseHhMm(statusText: string): [number, number] | null {
  const m = statusText.match(/chiude\s+alle\s+(\d{1,2})[:.](\d{2})/i);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return [hh, mm];
  return null;
}

function computeDayWindow(statusText: string, now = new Date()): ShiftWindow {
  const p = romeParts(now);
  const [startH, startM] = parseHhMm('08:00');
  const close = parseCloseHhMm(statusText);
  const [endH, endM] = close || parseHhMm('20:00');
  let start = romeLocalToUtc(p.year, p.month, p.day, startH, startM);
  let end = romeLocalToUtc(p.year, p.month, p.day, endH, endM);
  if (end <= start) end = romeLocalToUtc(p.year, p.month, p.day, 20, 0);
  if (end <= now) end = new Date(now.getTime() + 30 * 60_000);
  const shiftDate = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return { shift_date: shiftDate, shift_type: 'day', start_at: start, end_at: end, is_h24: false };
}

function parseAddressLine(value: string): { address: string; city: string } {
  let txt = value.replace(/\s+/g, ' ').trim();
  // PharmAround appende distanza: "- 850m" / "- 19.87km"
  txt = txt.replace(/\s*-\s*\d+(?:[.,]\d+)?\s*(?:km|m)\s*$/i, '');
  const m = txt.match(/^(.*?)\s*-\s*(\d{5})\s+(.+?)$/);
  if (!m) return { address: txt, city: '' };
  const city = m[3]
    .replace(/\s*-\s*\d+(?:[.,]\d+)?\s*(?:km|m)\s*$/i, '')
    .replace(/[,\s-]+$/g, '')
    .trim();
  return { address: m[1].replace(/[,\s-]+$/g, '').trim(), city };
}

function parseListingEntries(html: string, cityQuerySlug: string): ListingEntry[] {
  const entries: ListingEntry[] = [];
  const seen = new Set<string>();
  // Attributi in ordine variabile: href / data-location / class
  const re = /<a\b([^>]*\bfarmacia-wrapper\b[^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    const inner = match[2] || '';
    const hrefM = attrs.match(/\bhref="([^"]+)"/i);
    const locM = attrs.match(/\bdata-location="([^"]*)"/i);
    const href = (hrefM?.[1] || '').trim();
    const locationId = locM?.[1] || '';
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const titleM = inner.match(/class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\//i);
    const addrM = inner.match(/class="[^"]*\baddress\b[^"]*"[^>]*>([\s\S]*?)<\//i);
    const name = (titleM?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const addressRaw = (addrM?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const statusText = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const kind = classifyStatus(statusText);
    if (kind === 'skip' || !name) continue;

    const path = href.startsWith('/') ? href : `/${href}`;
    const cityFromUrlM = path.match(/^\/farmacie\/([^/]+)\//);
    const cityFromUrl = cityFromUrlM ? cityFromUrlM[1].replace(/-/g, ' ') : '';
    const citySlugFromUrl = cityFromUrlM?.[1] || '';
    const { address, city: cityFromAddr } = parseAddressLine(addressRaw);
    const city = cityFromAddr || cityFromUrl || cityQuerySlug.replace(/-/g, ' ');

    entries.push({
      name,
      address,
      city,
      citySlugFromUrl,
      detailPath: path,
      detailUrl: new URL(path, BASE_URL).toString(),
      locationId,
      statusText,
      shiftKind: kind,
    });
  }
  return entries;
}

function pharmacyNameKey(name: string): string {
  return normalizeText(name).replace(/^farmacia\s+/, '').trim();
}

async function ensureTurniSource(citySlug: string, listingUrl: string): Promise<number | null> {
  if (!localDb) return null;
  const slug = `pharmaround-turni-${citySlug}`;
  const name = `PharmAround - ${citySlug.replace(/-/g, ' ')}`;
  const existing = await query<{ id: number }>(`SELECT id FROM turni_sources WHERE slug = $1 LIMIT 1`, [slug]);
  if (existing.rows[0]) {
    await query(
      `UPDATE turni_sources SET source_url = $1, updated_at = NOW() WHERE id = $2`,
      [listingUrl, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }
  const inserted = await query<{ id: number }>(
    `INSERT INTO turni_sources (slug, name, source_url, description, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id`,
    [slug, name, listingUrl, 'Sync on-demand PharmAround (pagina città a zero risultati)'],
  );
  return inserted.rows[0]?.id ?? null;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

async function findPharmacyIdByPhone(phone: string): Promise<string | null> {
  const phoneNorm = normalizePhone(phone);
  if (phoneNorm.length < 8) return null;
  const candidates = [phoneNorm];
  if (phoneNorm.length === 10) candidates.push(`39${phoneNorm}`);
  const { rows } = await query<{ id: string }>(
    `SELECT id
     FROM paginegialle_pharmacies
     WHERE coalesce(source_status,'') <> 'LOST'
       AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') = ANY($1::text[])
     LIMIT 1`,
    [candidates],
  );
  return rows[0]?.id ?? null;
}

async function findPharmacyId(entry: ListingEntry): Promise<string | null> {
  const citySlug = entry.citySlugFromUrl || slugify(entry.city);
  const nameKey = pharmacyNameKey(entry.name);
  if (!nameKey) return null;

  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name
     FROM paginegialle_pharmacies
     WHERE coalesce(source_status,'') <> 'LOST'
       AND (
         lower(coalesce(city_slug,'')) = $1
         OR lower(coalesce(city,'')) = $2
       )
     LIMIT 40`,
    [citySlug, normalizeText(entry.city)],
  );

  for (const row of rows) {
    if (pharmacyNameKey(row.name) === nameKey) return row.id;
  }
  // soft contains
  for (const row of rows) {
    const dbKey = pharmacyNameKey(row.name);
    if (dbKey.includes(nameKey) || nameKey.includes(dbKey)) return row.id;
  }
  return null;
}

async function fetchDetailPhone(detailUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const resp = await fetch(detailUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ProntoFarmacieTurni/1.0; +https://prontofarmacie.it)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      redirect: 'follow',
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    const telM = html.match(/href=["']tel:([^"']+)["']/i);
    if (!telM) return '';
    return telM[1].replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function inferProvinceForCity(city: string): Promise<string | null> {
  const { rows } = await query<{ province: string }>(
    `SELECT province
     FROM paginegialle_pharmacies
     WHERE coalesce(source_status,'') <> 'LOST'
       AND province IS NOT NULL
       AND (
         lower(coalesce(city,'')) = $1
         OR lower(coalesce(city_slug,'')) = $2
       )
     LIMIT 1`,
    [normalizeText(city), slugify(city)],
  );
  return rows[0]?.province ?? null;
}

async function createPharmacyFromEntry(
  entry: ListingEntry,
  turniSourceId: number,
  listingUrl: string,
): Promise<{ id: string; created: boolean } | null> {
  const citySlug = entry.citySlugFromUrl || slugify(entry.city);
  const phone = await fetchDetailPhone(entry.detailUrl);
  const phoneNorm = normalizePhone(phone);
  const byPhone = phoneNorm ? await findPharmacyIdByPhone(phone) : null;
  if (byPhone) return { id: byPhone, created: false };

  const province = await inferProvinceForCity(entry.city);
  let slugBase = slugify(`${entry.name} ${entry.city}`) || 'farmacia';
  if (phoneNorm) slugBase = `${slugBase}-tel-${phoneNorm.slice(0, 10)}`;
  if (entry.locationId) slugBase = `${slugBase}-${entry.locationId}`;

  const description =
    `Turni sincronizzati da PharmAround on-demand ` +
    `(<a href="${listingUrl}" rel="nofollow">elenco</a>, ` +
    `dettaglio: <a href="${entry.detailUrl}" rel="nofollow">scheda farmacia</a>).`;

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO paginegialle_pharmacies (
         id, name, phone, address, city, province, opening_hours, pharmacy_type,
         prontofarmacie_slug, city_slug, description, turni_source_id,
         turni_updated_at, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, NULL, 'farmacia',
         $6, $7, $8, $9, NOW(), NOW(), NOW()
       )
       RETURNING id`,
      [
        entry.name,
        phone || null,
        entry.address || null,
        entry.city || null,
        province,
        slugBase,
        citySlug,
        description,
        turniSourceId,
      ],
    );
    const id = inserted.rows[0]?.id;
    return id ? { id, created: true } : null;
  } catch {
    const existing = await findPharmacyId(entry);
    return existing ? { id: existing, created: false } : null;
  }
}

async function upsertShift(
  pharmacyId: string,
  turniSourceId: number,
  window: ShiftWindow,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO pharmacy_daily_shifts (
       pharmacy_id, turni_source_id, shift_date, shift_type, start_at, end_at, is_h24, source_payload
     ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (pharmacy_id, turni_source_id, shift_date, shift_type)
     DO UPDATE SET
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       is_h24 = EXCLUDED.is_h24,
       source_payload = EXCLUDED.source_payload,
       updated_at = NOW()`,
    [
      pharmacyId,
      turniSourceId,
      window.shift_date,
      window.shift_type,
      window.start_at.toISOString(),
      window.end_at.toISOString(),
      window.is_h24,
      JSON.stringify(payload),
    ],
  );
  await query(
    `UPDATE paginegialle_pharmacies
     SET turni_updated_at = NOW(), turni_source_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [pharmacyId, turniSourceId],
  );
}

/**
 * Sync on-the-fly da PharmAround onlyOpen:
 * - match schede esistenti (città + nearby)
 * - crea scheda se l'entry è della città richiesta e manca in DB
 * Non tocca opening_hours ordinari.
 */
export async function syncPharmAroundCityOnDemand(
  citySlug: string,
  options: PharmAroundOnDemandOptions = {},
): Promise<PharmAroundOnDemandResult> {
  const slug = citySlug.toLowerCase().trim();
  const empty = {
    attempted: false as const,
    listingCount: 0,
    matched: 0,
    created: 0,
    upserted: 0,
  };
  if (!slug) {
    return { ...empty, skippedReason: 'empty-slug' };
  }
  if (!localDb) {
    return { ...empty, skippedReason: 'no-database' };
  }

  const prev = recentAttempts.get(slug);
  if (!options.force && prev && Date.now() - prev.at < COOLDOWN_MS) {
    return {
      ...empty,
      skippedReason: 'cooldown',
      upserted: prev.upserted,
    };
  }

  const listingUrl = LISTING_TMPL.replace('{city_slug}', encodeURIComponent(slug));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(listingUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ProntoFarmacieTurni/1.0; +https://prontofarmacie.it)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!resp.ok) {
      recentAttempts.set(slug, { at: Date.now(), upserted: 0 });
      return {
        attempted: true,
        listingCount: 0,
        matched: 0,
        created: 0,
        upserted: 0,
        error: `HTTP ${resp.status}`,
      };
    }
    const html = await resp.text();
    const entries = parseListingEntries(html, slug);
    if (!entries.length) {
      recentAttempts.set(slug, { at: Date.now(), upserted: 0 });
      return { attempted: true, listingCount: 0, matched: 0, created: 0, upserted: 0 };
    }

    const turniSourceId = await ensureTurniSource(slug, listingUrl);
    if (!turniSourceId) {
      return {
        attempted: true,
        listingCount: entries.length,
        matched: 0,
        created: 0,
        upserted: 0,
        error: 'turni-source',
      };
    }

    const nightWindow = computeNightWindow();
    let matched = 0;
    let created = 0;
    let upserted = 0;

    // Preferisci schede della città richiesta; poi le altre aperte (per nearby).
    const ordered = [
      ...entries.filter((e) => e.citySlugFromUrl === slug || slugify(e.city) === slug),
      ...entries.filter((e) => e.citySlugFromUrl !== slug && slugify(e.city) !== slug),
    ];

    for (const entry of ordered) {
      const isQueryCity = entry.citySlugFromUrl === slug || slugify(entry.city) === slug;
      let pharmacyId = await findPharmacyId(entry);
      if (!pharmacyId && isQueryCity) {
        const createdRow = await createPharmacyFromEntry(entry, turniSourceId, listingUrl);
        if (createdRow) {
          pharmacyId = createdRow.id;
          if (createdRow.created) created += 1;
        }
      }
      if (!pharmacyId) continue;
      matched += 1;
      const window =
        entry.shiftKind === 'night' ? nightWindow : computeDayWindow(entry.statusText);
      await upsertShift(pharmacyId, turniSourceId, window, {
        source: 'pharmaround-ondemand',
        query_city_slug: slug,
        listing_url: listingUrl,
        entry,
      });
      upserted += 1;
    }

    recentAttempts.set(slug, { at: Date.now(), upserted });
    return { attempted: true, listingCount: entries.length, matched, created, upserted };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    recentAttempts.set(slug, { at: Date.now(), upserted: 0 });
    return {
      attempted: true,
      listingCount: 0,
      matched: 0,
      created: 0,
      upserted: 0,
      error: message,
    };
  }
}
