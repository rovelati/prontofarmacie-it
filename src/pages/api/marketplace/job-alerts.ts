import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import { requireLocalRole, requireLocalUser } from '@/lib/local-auth';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireLocalRole(context, ['job_seeker', 'admin']);
  if (!auth.ok || !auth.user) {
    return json({ success: false, error: 'Accedi come candidato.' }, 401);
  }

  const { rows } = await query(
    `select id, email, location_text, radius_km, role_category, contract_type, status,
            created_at, updated_at, last_notified_at
     from public.job_search_alerts
     where user_id = $1 or (user_id is null and lower(email) = lower($2))
     order by created_at desc`,
    [auth.user.id, auth.user.email],
  );

  // Collega alert orfani (stessa email) all'account
  await query(
    `update public.job_search_alerts
     set user_id = $1, updated_at = now()
     where user_id is null and lower(email) = lower($2)`,
    [auth.user.id, auth.user.email],
  ).catch(() => undefined);

  return json({ success: true, alerts: rows });
};

export const POST: APIRoute = async (context) => {
  const body = await context.request.json().catch(() => ({}));
  const action = String(body.action || '');
  const auth = await requireLocalUser(context);
  if (!auth.user) return json({ success: false, error: 'Accedi per continuare.' }, 401);

  if (action === 'create') {
    const roleOk = auth.user.role === 'job_seeker' || auth.user.role === 'admin';
    if (!roleOk) return json({ success: false, error: 'Solo i candidati possono creare alert lavoro.' }, 403);

    const location = String(body.location_text || body.city || '').trim();
    const radius = Number(body.radius_km || 10);
    const roleCategory = String(body.role_category || 'Farmacista').trim() || 'Farmacista';
    const contractType = body.contract_type ? String(body.contract_type).trim() : null;
    if (location.length < 2) return json({ success: false, error: 'Indica una località.' }, 422);
    if (![10, 25, 50].includes(radius)) {
      return json({ success: false, error: 'Raggio non valido (10, 25 o 50 km).' }, 422);
    }

    const { rows } = await query(
      `insert into public.job_search_alerts
         (email, location_text, radius_km, role_category, contract_type, status, source, consent_privacy, user_id)
       values ($1, $2, $3, $4, $5, 'active', 'area_candidati', true, $6)
       returning id, location_text, radius_km, role_category, contract_type, status, created_at`,
      [auth.user.email, location, radius, roleCategory, contractType, auth.user.id],
    );
    return json({ success: true, alert: rows[0] });
  }

  if (action === 'set_status') {
    const alertId = String(body.id || '').trim();
    const status = String(body.status || '').trim();
    if (!alertId || !['active', 'paused', 'unsubscribed'].includes(status)) {
      return json({ success: false, error: 'Parametri non validi.' }, 422);
    }

    const { rows } = await query(
      `update public.job_search_alerts
       set status = $3, updated_at = now(), user_id = coalesce(user_id, $1)
       where id = $2
         and (user_id = $1 or lower(email) = lower($4))
       returning id, status`,
      [auth.user.id, alertId, status, auth.user.email],
    );
    if (!rows[0]) return json({ success: false, error: 'Alert non trovato.' }, 404);
    return json({ success: true, alert: rows[0] });
  }

  return json({ success: false, error: 'Azione non valida.' }, 400);
};
