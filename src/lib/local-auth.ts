import type { APIContext } from 'astro';
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '@/lib/local-db';

const COOKIE_NAME = 'pf_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const secret =
  process.env.AUTH_SECRET ||
  import.meta.env.AUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
  'dev-local-auth-secret';

export const MARKETPLACE_ROLES = ['admin', 'pharmacy_owner', 'job_seeker'] as const;
export type MarketplaceRole = (typeof MARKETPLACE_ROLES)[number];

export type LocalUser = {
  id: string;
  email: string;
  role: MarketplaceRole | string;
  display_name?: string | null;
};

export function isMarketplaceRole(role: string): role is MarketplaceRole {
  return (MARKETPLACE_ROLES as readonly string[]).includes(role);
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: Record<string, unknown>) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token: string | undefined | null) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.email || !payload?.exp || Date.now() / 1000 > Number(payload.exp)) return null;
    return payload as { sub: string; email: string; role?: string; exp: number };
  } catch {
    return null;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [algo, iterationsRaw, salt, hash] = stored.split('$');
  if (algo !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !hash) return false;
  const computed = pbkdf2Sync(password, salt, Number(iterationsRaw), 32, 'sha256').toString('base64url');
  const left = Buffer.from(computed);
  const right = Buffer.from(hash);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createToken(user: LocalUser) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
}

export function setSessionCookie(context: APIContext, token: string) {
  context.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(context: APIContext) {
  context.cookies.delete(COOKIE_NAME, { path: '/' });
}

export function tokenFromRequest(request: Request, cookies?: APIContext['cookies']) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return bearer || cookies?.get(COOKIE_NAME)?.value || null;
}

export async function getUserByToken(token: string | undefined | null): Promise<LocalUser | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const { rows } = await query<LocalUser>(
    `select id, email, role, display_name
     from public.local_auth_users
     where id = $1
       and (disabled_at is null)
     limit 1`,
    [payload.sub],
  );
  return rows[0] || null;
}

export async function requireLocalUser(context: APIContext) {
  const token = tokenFromRequest(context.request, context.cookies);
  const user = await getUserByToken(token);
  if (!user) return { user: null, token: null };
  return { user, token };
}

export async function requireLocalAdmin(context: APIContext) {
  const auth = await requireLocalUser(context);
  if (!auth.user || auth.user.role !== 'admin') {
    return { ...auth, ok: false as const };
  }
  return { ...auth, ok: true as const };
}

export async function requireLocalRole(context: APIContext, roles: MarketplaceRole[]) {
  const auth = await requireLocalUser(context);
  if (!auth.user || !roles.includes(auth.user.role as MarketplaceRole)) {
    return { ...auth, ok: false as const };
  }
  return { ...auth, ok: true as const };
}

export function publicUser(user: LocalUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    display_name: user.display_name || null,
    user_metadata: { role: user.role, display_name: user.display_name || null },
  };
}

export function sessionPayload(user: LocalUser, token: string) {
  return {
    access_token: token,
    refresh_token: token,
    token_type: 'bearer',
    user: publicUser(user),
  };
}
