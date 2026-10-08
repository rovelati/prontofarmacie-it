const store = new Map<string, { value: unknown; expires: number }>();

export type CachedOptions<T> = {
  /** Se restituisce false il risultato non viene messo in cache (es. liste vuote temporanee). */
  store?: (value: T) => boolean;
};

export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  options?: CachedOptions<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    return Promise.resolve(hit.value as T);
  }
  return fn().then((value) => {
    if (options?.store === undefined || options.store(value)) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    }
    return value;
  });
}

/** Invalida chiavi cache che iniziano con il prefisso (es. dopo sync turni on-demand). */
export function invalidateCacheByPrefix(prefix: string): number {
  let n = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      n += 1;
    }
  }
  return n;
}

export const CACHE_TTL_TURNI_MS = 5 * 60 * 1000;
