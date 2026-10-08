import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import { requireLocalAdmin, type LocalUser } from '@/lib/local-auth';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const allowUnauth = () =>
  process.env.ADMIN_TEST_ALLOW_UNAUTH === 'true' ||
  import.meta.env.ADMIN_TEST_ALLOW_UNAUTH === 'true';

async function gateAdmin(context: Parameters<APIRoute>[0]): Promise<
  | { ok: true; user: LocalUser | { id: string; email: string; role: string } }
  | { ok: false; response: Response }
> {
  if (allowUnauth()) {
    const auth = await requireLocalAdmin(context);
    return {
      ok: true,
      user: auth.user || { id: '00000000-0000-0000-0000-000000000000', email: 'admin-test@local', role: 'admin' },
    };
  }
  const auth = await requireLocalAdmin(context);
  if (!auth.ok || !auth.user) {
    return { ok: false, response: json({ success: false, error: 'Solo admin.' }, 401) };
  }
  return { ok: true, user: auth.user };
}

export const GET: APIRoute = async (context) => {
  const gate = await gateAdmin(context);
  if (!gate.ok) return gate.response;

  const resource = context.url.searchParams.get('resource') || 'submissions';
  const status = String(context.url.searchParams.get('status') || 'pending').trim();

  if (resource === 'stats') {
    const [users, claims, submissions, alerts] = await Promise.all([
      query<{ role: string; total: number; active: number }>(
        `select role,
                count(*)::int as total,
                count(*) filter (where disabled_at is null)::int as active
         from public.local_auth_users
         where role in ('pharmacy_owner', 'job_seeker', 'admin')
         group by role`,
      ),
      query<{ status: string; total: number }>(
        `select status, count(*)::int as total
         from public.pharmacy_claims
         group by status`,
      ),
      query<{ status: string; total: number }>(
        `select status, count(*)::int as total
         from public.job_offer_submissions
         group by status`,
      ),
      query<{ total: number }>(
        `select count(*)::int as total from public.job_search_alerts where status = 'active'`,
      ),
    ]);

    const byRole = Object.fromEntries(users.rows.map((r) => [r.role, r]));
    const claimsByStatus = Object.fromEntries(claims.rows.map((r) => [r.status, r.total]));
    const submissionsByStatus = Object.fromEntries(submissions.rows.map((r) => [r.status, r.total]));
    const registeredUsers = users.rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const activeUsers = users.rows.reduce((sum, r) => sum + Number(r.active || 0), 0);

    return json({
      success: true,
      stats: {
        registeredUsers,
        activeUsers,
        pharmacyOwners: Number(byRole.pharmacy_owner?.total || 0),
        jobSeekers: Number(byRole.job_seeker?.total || 0),
        admins: Number(byRole.admin?.total || 0),
        claimsTotal: claims.rows.reduce((sum, r) => sum + Number(r.total || 0), 0),
        claimsPending: Number(claimsByStatus.pending || 0),
        claimsApproved: Number(claimsByStatus.approved || 0),
        claimsRejected: Number(claimsByStatus.rejected || 0),
        submissionsPending: Number(submissionsByStatus.pending || 0),
        submissionsApproved: Number(submissionsByStatus.approved || 0),
        submissionsRejected: Number(submissionsByStatus.rejected || 0),
        activeAlerts: Number(alerts.rows[0]?.total || 0),
      },
      allowUnauth: allowUnauth(),
    });
  }

  if (resource === 'claims') {
    const params: unknown[] = [];
    let where = 'where true';
    if (status !== 'all') {
      params.push(status);
      where = `where c.status = $1`;
    }
    const { rows } = await query(
      `select c.id, c.status, c.claim_note, c.verified_via, c.created_at, c.updated_at, c.reviewed_at,
              c.user_id, c.pharmacy_id,
              u.email as user_email, u.display_name as user_display_name,
              p.name as pharmacy_name, p.city as pharmacy_city, p.province as pharmacy_province,
              p.email as pharmacy_email, p.prontofarmacie_slug, p.phone as pharmacy_phone
       from public.pharmacy_claims c
       join public.local_auth_users u on u.id = c.user_id
       join public.paginegialle_pharmacies p on p.id = c.pharmacy_id
       ${where}
       order by c.created_at desc
       limit 200`,
      params,
    );
    return json({ success: true, claims: rows });
  }

  if (resource === 'submissions') {
    const params: unknown[] = [];
    let where = 'where true';
    if (status !== 'all') {
      params.push(status);
      where = `where status = $1`;
    }
    const { rows } = await query(
      `select *
       from public.job_offer_submissions
       ${where}
       order by created_at desc
       limit 200`,
      params,
    );
    return json({ success: true, submissions: rows });
  }

  if (resource === 'users') {
    const role = String(context.url.searchParams.get('role') || 'all').trim();
    const q = String(context.url.searchParams.get('q') || '').trim().toLowerCase();
    const params: unknown[] = [];
    const whereParts: string[] = ["u.role in ('pharmacy_owner', 'job_seeker', 'admin')"];

    if (role !== 'all' && ['pharmacy_owner', 'job_seeker', 'admin'].includes(role)) {
      params.push(role);
      whereParts.push(`u.role = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      whereParts.push(
        `(u.email ilike $${params.length} or coalesce(u.display_name, '') ilike $${params.length})`,
      );
    }

    const { rows } = await query(
      `select u.id, u.email, u.role, u.display_name, u.avatar_url, u.google_sub is not null as has_google,
              u.created_at, u.last_login_at, u.disabled_at,
              (select count(*)::int from public.pharmacy_claims c where c.user_id = u.id) as claims_count,
              (select count(*)::int from public.pharmacy_claims c where c.user_id = u.id and c.status = 'approved') as claims_approved,
              (select count(*)::int from public.job_search_alerts a where a.user_id = u.id) as alerts_count,
              (select count(*)::int from public.job_offer_submissions s where s.submitted_by_user_id = u.id) as submissions_count
       from public.local_auth_users u
       where ${whereParts.join(' and ')}
       order by u.created_at desc
       limit 300`,
      params,
    );

    const counts = await query<{ role: string; total: number }>(
      `select role, count(*)::int as total
       from public.local_auth_users
       where role in ('pharmacy_owner', 'job_seeker', 'admin')
         and disabled_at is null
       group by role`,
    );

    return json({
      success: true,
      users: rows,
      counts: Object.fromEntries(counts.rows.map((r) => [r.role, r.total])),
    });
  }

  return json({ success: false, error: 'resource non valida.' }, 400);
};

export const POST: APIRoute = async (context) => {
  const gate = await gateAdmin(context);
  if (!gate.ok) return gate.response;
  const adminUser = gate.user;

  const body = await context.request.json().catch(() => ({}));
  const action = String(body.action || '');

  if (action === 'reject_submission') {
    const submissionId = String(body.submission_id || '').trim();
    const note = body.admin_notes != null ? String(body.admin_notes).trim() || null : null;
    if (!submissionId) return json({ success: false, error: 'submission_id obbligatorio.' }, 422);

    const { rows } = await query(
      `update public.job_offer_submissions
       set status = 'rejected',
           admin_notes = coalesce($2, admin_notes),
           handled_by_email = $3,
           handled_at = now(),
           status_changed_at = now()
       where id = $1
       returning id, status`,
      [submissionId, note, adminUser.email],
    );
    if (!rows[0]) return json({ success: false, error: 'Submission non trovata.' }, 404);
    return json({ success: true, submission: rows[0] });
  }

  if (action === 'approve_claim' || action === 'reject_claim') {
    const claimId = String(body.claim_id || '').trim();
    if (!claimId) return json({ success: false, error: 'claim_id obbligatorio.' }, 422);
    const nextStatus = action === 'approve_claim' ? 'approved' : 'rejected';
    const note = body.claim_note != null ? String(body.claim_note).trim() || null : null;

    if (nextStatus === 'approved') {
      const claimRes = await query<{ pharmacy_id: string }>(
        `select pharmacy_id from public.pharmacy_claims where id = $1 limit 1`,
        [claimId],
      );
      const pharmacyId = claimRes.rows[0]?.pharmacy_id;
      if (!pharmacyId) return json({ success: false, error: 'Claim non trovato.' }, 404);

      const taken = await query(
        `select id from public.pharmacy_claims
         where pharmacy_id = $1 and status = 'approved' and id <> $2
         limit 1`,
        [pharmacyId, claimId],
      );
      if (taken.rows[0]) {
        return json({
          success: false,
          error: 'Questa farmacia è già collegata a un altro account approvato.',
        }, 409);
      }
    }

    const { rows } = await query(
      `update public.pharmacy_claims
       set status = $2,
           claim_note = coalesce($3, claim_note),
           verified_via = coalesce(verified_via, 'admin'),
           reviewed_at = now(),
           reviewed_by = $4,
           updated_at = now()
       where id = $1
       returning id, status, pharmacy_id, user_id`,
      [
        claimId,
        nextStatus,
        note,
        adminUser.id === '00000000-0000-0000-0000-000000000000' ? null : adminUser.id,
      ],
    );
    if (!rows[0]) return json({ success: false, error: 'Claim non trovato.' }, 404);
    return json({ success: true, claim: rows[0] });
  }

  if (action === 'disable_user' || action === 'enable_user') {
    const userId = String(body.user_id || '').trim();
    if (!userId) return json({ success: false, error: 'user_id obbligatorio.' }, 422);
    if (userId === adminUser.id) {
      return json({ success: false, error: 'Non puoi disabilitare il tuo stesso account.' }, 422);
    }

    if (action === 'disable_user') {
      const target = await query<{ role: string }>(
        `select role from public.local_auth_users where id = $1 limit 1`,
        [userId],
      );
      if (!target.rows[0]) return json({ success: false, error: 'Utente non trovato.' }, 404);
      if (target.rows[0].role === 'admin') {
        const admins = await query<{ total: number }>(
          `select count(*)::int as total from public.local_auth_users
           where role = 'admin' and disabled_at is null`,
        );
        if ((admins.rows[0]?.total || 0) <= 1) {
          return json({ success: false, error: 'Non puoi disabilitare l’ultimo admin.' }, 409);
        }
      }
    }

    const { rows } = await query(
      `update public.local_auth_users
       set disabled_at = ${action === 'disable_user' ? 'now()' : 'null'}
       where id = $1
       returning id, email, role, disabled_at`,
      [userId],
    );
    if (!rows[0]) return json({ success: false, error: 'Utente non trovato.' }, 404);
    return json({ success: true, user: rows[0] });
  }

  return json({ success: false, error: 'Azione non valida.' }, 400);
};
