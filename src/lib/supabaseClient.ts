import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browserPostgrestProxyFetch } from '@/lib/postgrestFetch';
import { patchLocalAuth } from '@/lib/localSupabaseAuth';

const useLocalDb = import.meta.env.PUBLIC_USE_LOCAL_DB === 'true';
const supabaseUrl = useLocalDb
  ? import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321'
  : import.meta.env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

/** Polyfill WebSocket su Node < 22 (SSR delle React islands). */
if (import.meta.env.SSR && typeof globalThis.WebSocket === 'undefined') {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS as unknown as typeof WebSocket;
}

const clientOptions = import.meta.env.SSR
  ? { auth: { persistSession: false, autoRefreshToken: false } }
  : undefined;

const globalOptions =
  useLocalDb && !import.meta.env.SSR ? { fetch: browserPostgrestProxyFetch } : undefined;

/** Client browser / SSR per React islands (auth, form, admin). */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    ...clientOptions,
    global: globalOptions,
  },
);

if (useLocalDb && !import.meta.env.SSR) {
  patchLocalAuth(supabase);
}

export function getServiceRoleKey(): string | undefined {
  const key = import.meta.env.PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (key && key !== 'undefined' && key.length > 10) return key;
  if (typeof window !== 'undefined') {
    const w = (window as unknown as { __SUPABASE_SERVICE_ROLE_KEY__?: string }).__SUPABASE_SERVICE_ROLE_KEY__;
    if (w && w.length > 10) return w;
  }
  return undefined;
}

/** Client admin: stesso endpoint del sito in modalità DB locale (proxy /api/postgrest). */
export function getAdminSupabaseClient(): SupabaseClient {
  const cacheKey = '__prontofarmacie_admin_client__';
  if (typeof window !== 'undefined' && (window as unknown as Record<string, SupabaseClient>)[cacheKey]) {
    return (window as unknown as Record<string, SupabaseClient>)[cacheKey];
  }

  const serviceRoleKey = getServiceRoleKey();
  const key = serviceRoleKey || supabaseAnonKey || 'placeholder-key';
  const globalOptions =
    useLocalDb && !import.meta.env.SSR ? { fetch: browserPostgrestProxyFetch } : undefined;

  const adminClient = createClient(supabaseUrl || 'https://placeholder.supabase.co', key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: 'admin-supabase-auth',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      detectSessionInUrl: false,
    },
    global: globalOptions,
  });

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, SupabaseClient>)[cacheKey] = adminClient;
  }

  return adminClient;
}

export function isLocalDbMode(): boolean {
  return useLocalDb;
}
