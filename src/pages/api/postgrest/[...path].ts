import type { APIRoute } from 'astro';
import { localPostgrestFetch } from '@/lib/postgrestFetch';

export const prerender = false;

const ALL: APIRoute = async ({ params, request }) => {
  const localBase = process.env.LOCAL_SUPABASE_URL || import.meta.env.LOCAL_SUPABASE_URL;
  if (!localBase) {
    return new Response(JSON.stringify({ message: 'LOCAL_SUPABASE_URL non configurato.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const path = params.path || '';
  const incoming = new URL(request.url);
  const target = new URL(path, localBase.endsWith('/') ? localBase : `${localBase}/`);
  target.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('apikey');
  headers.delete('authorization');

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();

  const upstream = await localPostgrestFetch(target.toString(), {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

export { ALL as GET, ALL as HEAD, ALL as POST, ALL as PATCH, ALL as PUT, ALL as DELETE, ALL as OPTIONS };
