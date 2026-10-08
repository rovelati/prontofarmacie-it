import type { MiddlewareHandler } from 'astro';
import { jobDetailPathFromSlug, normalizeJobSlug } from '@/lib/jobSlug';

/** Redirect URL legacy → path Astro (pre-cutover DNS, stesso host staging). */
const REDIRECTS: Record<string, string> = {
  '/home': '/',
  '/home/': '/',
  '/crediti': '/credits/',
  '/crediti/': '/credits/',
  '/inserisci-annuncio': '/lavoro/inserisci-annuncio/',
  '/inserisci-annuncio/': '/lavoro/inserisci-annuncio/',
  '/farmacie-di-turno-vicino-a-me-trova-quella-piu-vicina-aperta': '/farmacie-di-turno/',
  '/farmacie-di-turno-vicino-a-me-trova-quella-piu-vicina-aperta/': '/farmacie-di-turno/',
  '/farmacie-di-turno-vicino-a-te': '/farmacie-di-turno/',
  '/farmacie-di-turno-vicino-a-te/': '/farmacie-di-turno/',
};

const CANONICAL_ORIGIN = 'https://www.prontofarmacie.it';

function isLocalDevHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host.endsWith('.local') ||
    host.includes('localhost:')
  );
}

/** Apex / subdomain legacy → host canonico www (301). */
function forceWwwRedirect(context: Parameters<MiddlewareHandler>[0]): Response | null {
  const host = (context.url.hostname || '').toLowerCase();
  if (!host || isLocalDevHost(host) || host === 'www.prontofarmacie.it') return null;

  const path = context.url.pathname || '/';
  const search = context.url.search || '';

  if (host === 'prontofarmacie.it') {
    return context.redirect(`${CANONICAL_ORIGIN}${path}${search}`, 301);
  }

  if (host === 'lavoro.prontofarmacie.it') {
    const targetPath = path === '/' || path === ''
      ? '/lavoro/'
      : path.startsWith('/lavoro/') || path === '/lavoro'
        ? path
        : `/lavoro${path.startsWith('/') ? path : `/${path}`}`;
    return context.redirect(`${CANONICAL_ORIGIN}${targetPath}${search}`, 301);
  }

  return null;
}

export const onRequest: MiddlewareHandler = (context, next) => {
  const wwwRedirect = forceWwwRedirect(context);
  if (wwwRedirect) return wwwRedirect;

  const path = context.url.pathname.replace(/\/+$/, '') || '/';
  const withSlash = path === '/' ? '/' : `${path}/`;

  // ?giorno= su pagine città turni → URL canonica senza query (consolidamento SEO)
  const turniCity = path.match(/^\/farmacie-di-turno\/farmacie-di-turno-a-[a-z0-9-]+-aperte-ora$/i);
  if (turniCity && context.url.searchParams.has('giorno')) {
    return context.redirect(withSlash, 301);
  }

  // Pagine località duplicate → guida ricetta canonica unica
  const ricettaLocalita = path.match(/^\/farmacie-di-turno\/ricetta-e-continuita-assistenziale\/[a-z0-9-]+$/i);
  if (ricettaLocalita) {
    return context.redirect('/farmacie-di-turno/ricetta-e-continuita-assistenziale/', 301);
  }

  const redirectTarget = REDIRECTS[path] || REDIRECTS[withSlash];
  if (redirectTarget) {
    const search = context.url.search || '';
    return context.redirect(`${redirectTarget}${search}`, 301);
  }

  // /offerta/:id → /lavoro/offerta/:id
  const offerta = path.match(/^\/offerta\/([^/]+)$/);
  if (offerta) {
    const slug = normalizeJobSlug(offerta[1]);
    return context.redirect(jobDetailPathFromSlug(slug), 301);
  }

  // /lavoro/offerta/* — canonicalizza guid Federfarma con slash (%2F...%2F → slug pulito)
  const jobOfferta = path.match(/^\/lavoro\/offerta\/(.+)$/);
  if (jobOfferta) {
    const slug = normalizeJobSlug(jobOfferta[1]);
    if (!slug) {
      return context.redirect('/lavoro/', 302);
    }
    const canonical = jobDetailPathFromSlug(slug);
    if (withSlash !== canonical) {
      return context.redirect(canonical, 301);
    }
  }

  // /lavoro/:city → /lavoro/:city/tutte/
  const lavoroCity = path.match(/^\/lavoro\/([^/]+)$/);
  const lavoroReserved = ['offerta', 'inserisci-annuncio', 'cerca', 'area-candidati'];
  if (lavoroCity && !lavoroReserved.includes(lavoroCity[1])) {
    return context.redirect(`/lavoro/${lavoroCity[1]}/tutte/`, 301);
  }

  return next();
};
