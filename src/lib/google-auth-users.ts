import { query } from '@/lib/local-db';
import type { LocalUser, MarketplaceRole } from '@/lib/local-auth';
import type { GoogleUserInfo } from '@/lib/google-oauth';

type AuthUserRow = {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
};

function roleLabel(role: string) {
  return role === 'pharmacy_owner' ? 'farmacista' : 'candidato';
}

export async function findOrCreateGoogleUser(
  profile: GoogleUserInfo,
  expectedRole: MarketplaceRole,
): Promise<{ user: LocalUser } | { error: string }> {
  const email = String(profile.email || '')
    .trim()
    .toLowerCase();
  const displayName = String(profile.name || '').trim() || null;
  const avatarUrl = String(profile.picture || '').trim() || null;
  const googleSub = String(profile.sub || '').trim();

  if (!email || !googleSub) {
    return { error: 'Profilo Google incompleto.' };
  }
  if (profile.email_verified === false) {
    return { error: 'L’email Google non risulta verificata.' };
  }

  const byGoogle = await query<AuthUserRow>(
    `select id, email, role, display_name
     from public.local_auth_users
     where google_sub = $1
       and (disabled_at is null)
     limit 1`,
    [googleSub],
  );
  if (byGoogle.rows[0]) {
    const user = byGoogle.rows[0];
    if (user.role !== expectedRole && user.role !== 'admin') {
      return {
        error: `Questo account Google è già registrato come ${roleLabel(user.role)}.`,
      };
    }
    await query(
      `update public.local_auth_users
       set last_login_at = now(),
           avatar_url = coalesce($2, avatar_url),
           display_name = coalesce(display_name, $3)
       where id = $1`,
      [user.id, avatarUrl, displayName],
    ).catch(() => undefined);
    return { user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name } };
  }

  const byEmail = await query<AuthUserRow & { google_sub: string | null }>(
    `select id, email, role, display_name, google_sub
     from public.local_auth_users
     where email = $1
       and (disabled_at is null)
     limit 1`,
    [email],
  );
  if (byEmail.rows[0]) {
    const user = byEmail.rows[0];
    if (user.role !== expectedRole && user.role !== 'admin') {
      return {
        error: `Esiste già un account con questa email come ${roleLabel(user.role)}. Accedi con email e password.`,
      };
    }
    await query(
      `update public.local_auth_users
       set google_sub = $2,
           last_login_at = now(),
           avatar_url = coalesce($3, avatar_url),
           display_name = coalesce(display_name, $4)
       where id = $1`,
      [user.id, googleSub, avatarUrl, displayName],
    );
    return { user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name } };
  }

  const { rows } = await query<AuthUserRow>(
    `insert into public.local_auth_users (email, password_hash, role, display_name, google_sub, avatar_url)
     values ($1, null, $2, $3, $4, $5)
     returning id, email, role, display_name`,
    [email, expectedRole, displayName, googleSub, avatarUrl],
  );
  const created = rows[0];
  if (!created) return { error: 'Creazione account Google non riuscita.' };
  return {
    user: {
      id: created.id,
      email: created.email,
      role: created.role,
      display_name: created.display_name,
    },
  };
}
