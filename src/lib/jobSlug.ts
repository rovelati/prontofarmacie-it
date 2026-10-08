/** Slug URL-safe per annuncio (senza slash iniziali/finali del guid Federfarma). */
export function normalizeJobSlug(raw: string | number | null | undefined): string {
  let value = String(raw ?? '').trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw value when not percent-encoded
  }
  return value.replace(/^\/+|\/+$/g, '');
}

export function jobDetailPathFromSlug(raw: string | number | null | undefined): string {
  const slug = normalizeJobSlug(raw);
  return `/lavoro/offerta/${encodeURIComponent(slug)}/`;
}
