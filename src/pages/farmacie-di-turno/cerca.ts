import type { APIRoute } from 'astro';
import { resolveTurniSearch } from '@/data/locationTree';
import { siteUrl } from '@/lib/turni';

export const GET: APIRoute = ({ url, redirect }) => {
  const q = url.searchParams.get('q') || url.searchParams.get('citta') || '';
  const target = resolveTurniSearch(siteUrl(import.meta.env), q);
  if (!target) {
    return redirect('/farmacie-di-turno/', 302);
  }
  return redirect(target, 302);
};
