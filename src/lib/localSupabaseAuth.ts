import type { SupabaseClient } from '@supabase/supabase-js';

type AuthListener = (event: string, session: unknown) => void;

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    return { data: null, error: { message: payload.error || `Errore HTTP ${response.status}` } };
  }
  return { data: payload, error: null };
}

const listeners = new Set<AuthListener>();

async function emitAuthChange(event: string, session: unknown) {
  for (const listener of listeners) {
    listener(event, session);
  }
}

/** Sostituisce Supabase Auth con cookie HMAC locale (pattern veterinari). */
export function patchLocalAuth(client: SupabaseClient) {
  const auth = {
    async getSession() {
      const { data, error } = await requestJson('/api/local-auth?action=session');
      return { data: { session: data?.session || null }, error };
    },
    async getUser() {
      const { data, error } = await requestJson('/api/local-auth?action=session');
      return { data: { user: data?.user || null }, error };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { data, error } = await requestJson('/api/local-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', email, password }),
      });
      if (!error) await emitAuthChange('SIGNED_IN', data?.session || null);
      return { data: { session: data?.session || null, user: data?.user || null }, error };
    },
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      const { data, error } = await requestJson('/api/local-auth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'register',
          email,
          password,
          role: options?.data?.role || 'job_seeker',
          display_name: options?.data?.display_name || null,
        }),
      });
      if (!error) await emitAuthChange('SIGNED_IN', data?.session || null);
      return { data: { session: data?.session || null, user: data?.user || null }, error };
    },
    async signOut() {
      const { error } = await requestJson('/api/local-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'logout' }),
      });
      if (!error) await emitAuthChange('SIGNED_OUT', null);
      return { error };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    },
  };

  Object.assign(client.auth, auth);
}
