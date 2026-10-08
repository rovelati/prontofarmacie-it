/** Client-side GA4 helpers (gtag). */

export type GaEventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGaEvent(eventName: string, params: GaEventParams = {}): void {
  if (typeof window === 'undefined') return;
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    cleaned[key] = value;
  }
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, cleaned);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...cleaned });
}

/** Classificazione pagina per funnels Explore. */
export function detectPageType(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): string {
  const p = pathname.toLowerCase();
  if (p === '/' || p === '') return 'home';
  if (p.includes('/farmacie-di-turno-della-provincia-di-')) return 'turni_province';
  if (p.includes('/farmacie-di-turno-a-') && p.includes('-aperte-ora')) return 'turni_city';
  if (p.includes('/farmacie-di-turno')) return 'turni_hub';
  if (p.startsWith('/farmacia/')) return 'farmacia_detail';
  if (p.startsWith('/listafarmacie')) return 'lista_farmacie';
  if (p.startsWith('/lavoro')) return 'lavoro';
  if (p.startsWith('/notizie')) return 'notizie';
  if (p.startsWith('/area-farmacia') || p.startsWith('/lavoro/area-candidati')) return 'area_account';
  return 'other';
}
