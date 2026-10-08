import type { APIRoute } from 'astro';
import { slugifySegment } from '@/lib/turni';

export const GET: APIRoute = ({ url, redirect }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q) return redirect('/listafarmacie/italia/', 302);
  const slug = slugifySegment(q);
  if (!slug) return redirect('/listafarmacie/italia/', 302);
  return redirect(`/listafarmacie/${slug}/`, 302);
};
