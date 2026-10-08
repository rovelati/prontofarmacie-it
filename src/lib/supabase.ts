import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { browserPostgrestProxyFetch, localPostgrestFetch } from '@/lib/postgrestFetch';

let browserClient: SupabaseClient | null = null;

function runtimeEnv(key: string, env: ImportMetaEnv): string | undefined {
  if (import.meta.env.SSR && typeof process !== 'undefined') {
    const fromProcess = process.env[key];
    if (fromProcess) return fromProcess;
  }
  return (env as Record<string, string | undefined>)[key];
}

function resolveSupabaseUrl(env: ImportMetaEnv): string {
  const localUrl = runtimeEnv('LOCAL_SUPABASE_URL', env);
  if (import.meta.env.SSR && localUrl) {
    return localUrl;
  }
  if (env.PUBLIC_USE_LOCAL_DB === 'true') {
    return env.PUBLIC_SITE_URL || 'http://localhost:4321';
  }
  return env.PUBLIC_SUPABASE_URL;
}

function useLocalPostgrest(env: ImportMetaEnv): boolean {
  if (import.meta.env.SSR) {
    return Boolean(runtimeEnv('LOCAL_SUPABASE_URL', env));
  }
  return env.PUBLIC_USE_LOCAL_DB === 'true';
}

export function getSupabase(env: ImportMetaEnv): SupabaseClient {
  const url = resolveSupabaseUrl(env);
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase URL or PUBLIC_SUPABASE_ANON_KEY');
  }

  const localMode = useLocalPostgrest(env);
  const fetchImpl = import.meta.env.SSR
    ? localMode
      ? localPostgrestFetch
      : undefined
    : localMode
      ? browserPostgrestProxyFetch
      : undefined;

  if (import.meta.env.SSR) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: fetchImpl ? { fetch: fetchImpl } : undefined,
      realtime: { transport: WebSocket },
    });
  }

  if (!browserClient) {
    browserClient = createClient(url, key, {
      global: fetchImpl ? { fetch: fetchImpl } : undefined,
    });
  }
  return browserClient;
}
