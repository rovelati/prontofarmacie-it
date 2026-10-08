import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MarketplaceRole } from '@/lib/local-auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const secret =
  process.env.AUTH_SECRET ||
  import.meta.env.AUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
  'dev-local-auth-secret';

export type GoogleOAuthState = {
  role: MarketplaceRole;
  redirectTo: string;
  nonce: string;
  exp: number;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: Record<string, unknown>) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySignedPayload<T extends Record<string, unknown>>(token: string): T | null {
  if (!token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function getGoogleOAuthConfig(siteUrl: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || import.meta.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET || import.meta.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = `${siteUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    enabled: Boolean(clientId && clientSecret),
  };
}

export function createGoogleOAuthState(role: MarketplaceRole, redirectTo: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    role,
    redirectTo,
    nonce: randomBytes(16).toString('base64url'),
    exp: now + 600,
  });
}

export function parseGoogleOAuthState(token: string | null | undefined): GoogleOAuthState | null {
  if (!token) return null;
  const payload = verifySignedPayload<GoogleOAuthState>(token);
  if (!payload?.role || !payload.redirectTo || !payload.nonce || !payload.exp) return null;
  if (Date.now() / 1000 > Number(payload.exp)) return null;
  if (payload.role !== 'pharmacy_owner' && payload.role !== 'job_seeker') return null;
  if (!payload.redirectTo.startsWith('/')) return null;
  return payload;
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeGoogleCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Scambio token Google fallito');
  }
  return payload as { access_token: string };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.sub || !payload.email) {
    throw new Error('Impossibile leggere il profilo Google');
  }
  return payload as GoogleUserInfo;
}
