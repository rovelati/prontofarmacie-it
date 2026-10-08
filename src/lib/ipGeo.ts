import { cached } from '@/lib/cache';

export interface IpGeoResult {
  lat: number;
  lng: number;
  city?: string | null;
  countryCode?: string | null;
  source: 'cloudflare' | 'ip-api';
}

const GEO_TTL_MS = 60 * 60 * 1000;

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === '::1' || v === 'localhost') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:')) return true;
  if (v.startsWith('127.') || v.startsWith('10.') || v.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(v);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** IP client da header proxy / Astro.clientAddress. */
export function clientIpFromRequest(request: Request, clientAddress?: string | null): string | null {
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const addr = clientAddress?.trim();
  return addr || null;
}

function parseHeaderFloat(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Preferisce header Cloudflare; altrimenti lookup ip-api (cache per /24). */
export async function resolveIpGeo(
  request: Request,
  clientAddress?: string | null,
): Promise<IpGeoResult | null> {
  const cfLat = parseHeaderFloat(request.headers.get('cf-iplatitude'));
  const cfLng = parseHeaderFloat(request.headers.get('cf-iplongitude'));
  if (cfLat != null && cfLng != null) {
    return {
      lat: cfLat,
      lng: cfLng,
      city: request.headers.get('cf-ipcity') || null,
      countryCode: request.headers.get('cf-ipcountry') || null,
      source: 'cloudflare',
    };
  }

  const ip = clientIpFromRequest(request, clientAddress);
  if (!ip || isPrivateOrLocalIp(ip)) return null;

  const cacheKey = `ipgeo:v2:${ip.includes(':') ? ip : ip.replace(/\.\d+$/, '.0')}`;
  return cached(cacheKey, GEO_TTL_MS, async () => {
    try {
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=it&fields=status,countryCode,city,lat,lon`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1800),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        status?: string;
        countryCode?: string;
        city?: string;
        lat?: number;
        lon?: number;
      };
      if (data.status !== 'success') return null;
      const lat = Number(data.lat);
      const lng = Number(data.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        city: data.city || null,
        countryCode: data.countryCode || null,
        source: 'ip-api' as const,
      };
    } catch {
      return null;
    }
  });
}
