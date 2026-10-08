import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import {
  clearSessionCookie,
  createToken,
  hashPassword,
  isMarketplaceRole,
  publicUser,
  requireLocalUser,
  sessionPayload,
  setSessionCookie,
  verifyPassword,
  type MarketplaceRole,
} from '@/lib/local-auth';

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export const GET: APIRoute = async (context) => {
  const action = context.url.searchParams.get('action') || 'session';
  if (action !== 'session') return json({ success: false, error: 'Azione non valida.' }, 400);

  const { user, token } = await requireLocalUser(context);
  return json({
    success: true,
    session: user && token ? sessionPayload(user, token) : null,
    user: user ? publicUser(user) : null,
  });
};

export const POST: APIRoute = async (context) => {
  const body = await context.request.json().catch(() => ({}));
  const action = String(body.action || '');

  if (action === 'logout') {
    clearSessionCookie(context);
    return json({ success: true });
  }

  if (action === 'register') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const displayName = String(body.display_name || body.displayName || '').trim() || null;
    const roleRaw = String(body.role || '').trim();
    const role = (isMarketplaceRole(roleRaw) ? roleRaw : '') as MarketplaceRole | '';

    if (!email || !password) {
      return json({ success: false, error: 'Email e password sono obbligatorie.' }, 422);
    }
    if (password.length < 8) {
      return json({ success: false, error: 'La password deve avere almeno 8 caratteri.' }, 422);
    }
    if (role !== 'pharmacy_owner' && role !== 'job_seeker') {
      return json({
        success: false,
        error: 'Scegli un profilo: farmacista (pharmacy_owner) o candidato (job_seeker).',
      }, 422);
    }

    const existing = await query<{ id: string }>(
      `select id from public.local_auth_users where email = $1 limit 1`,
      [email],
    );
    if (existing.rows[0]) {
      return json({ success: false, error: 'Esiste già un account con questa email.' }, 409);
    }

    const { rows } = await query<{ id: string; email: string; role: string; display_name: string | null }>(
      `insert into public.local_auth_users (email, password_hash, role, display_name)
       values ($1, $2, $3, $4)
       returning id, email, role, display_name`,
      [email, hashPassword(password), role, displayName],
    );
    const created = rows[0];
    if (!created) return json({ success: false, error: 'Registrazione non riuscita.' }, 500);

    const sessionUser = {
      id: created.id,
      email: created.email,
      role: created.role,
      display_name: created.display_name,
    };
    const token = createToken(sessionUser);
    setSessionCookie(context, token);
    return json({
      success: true,
      session: sessionPayload(sessionUser, token),
      user: publicUser(sessionUser),
    });
  }

  if (action === 'login') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) {
      return json({ success: false, error: 'Email e password sono obbligatorie.' }, 422);
    }

    const { rows } = await query<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
      display_name: string | null;
    }>(
      `select id, email, password_hash, role, display_name
       from public.local_auth_users
       where email = $1
         and (disabled_at is null)
       limit 1`,
      [email],
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return json({ success: false, error: 'Credenziali non valide.' }, 401);
    }

    const expectedRole = String(body.expected_role || body.expectedRole || '').trim();
    if (expectedRole && user.role !== expectedRole && user.role !== 'admin') {
      return json({
        success: false,
        error: `Questo account non è un profilo ${expectedRole === 'pharmacy_owner' ? 'farmacista' : 'candidato'}.`,
      }, 403);
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.display_name,
    };
    const token = createToken(sessionUser);
    setSessionCookie(context, token);
    await query('update public.local_auth_users set last_login_at = now() where id = $1', [user.id]).catch(
      () => undefined,
    );
    return json({ success: true, session: sessionPayload(sessionUser, token), user: publicUser(sessionUser) });
  }

  return json({ success: false, error: 'Azione non valida.' }, 400);
};
