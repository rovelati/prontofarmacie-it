/** Fetch verso PostgREST locale: rimuove prefisso /rest/v1 e header Supabase. */
export function localPostgrestFetch(input: RequestInfo | URL, init?: RequestInit) {
  const sourceUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(sourceUrl);
  url.pathname = url.pathname.replace(/^\/rest\/v1\/?/, '/');

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.delete('apikey');
  headers.delete('authorization');

  return fetch(url, {
    ...init,
    headers,
  });
}

/** Browser: inoltra le chiamate Supabase JS verso /api/postgrest (same-origin). */
export function browserPostgrestProxyFetch(input: RequestInfo | URL, init?: RequestInit) {
  const sourceUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(sourceUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  if (url.pathname.startsWith('/rest/v1/')) {
    url.pathname = `/api/postgrest/${url.pathname.slice('/rest/v1/'.length)}`;
  }

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.delete('apikey');
  headers.delete('authorization');

  return fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}
