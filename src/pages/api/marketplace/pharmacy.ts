import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import { requireLocalRole, requireLocalUser } from '@/lib/local-auth';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const DAYS = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'] as const;

async function getApprovedClaim(userId: string) {
  const { rows } = await query<{
    id: string;
    pharmacy_id: string;
    status: string;
  }>(
    `select id, pharmacy_id, status
     from public.pharmacy_claims
     where user_id = $1 and status = 'approved'
     order by updated_at desc
     limit 1`,
    [userId],
  );
  return rows[0] || null;
}

export const GET: APIRoute = async (context) => {
  const action = context.url.searchParams.get('action') || 'dashboard';
  const auth = await requireLocalRole(context, ['pharmacy_owner', 'admin']);
  if (!auth.ok || !auth.user) {
    return json({ success: false, error: 'Accedi come farmacista.' }, 401);
  }

  if (action === 'search') {
    const q = String(context.url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ success: true, results: [] });
    const { rows } = await query<{
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      province: string | null;
      prontofarmacie_slug: string | null;
      email: string | null;
    }>(
      `select id, name, address, city, province, prontofarmacie_slug, email
       from public.paginegialle_pharmacies
       where name ilike $1
          or prontofarmacie_slug ilike $1
          or city ilike $1
          or address ilike $1
       order by name asc
       limit 20`,
      [`%${q}%`],
    );
    return json({ success: true, results: rows });
  }

  if (action === 'taxonomy') {
    const { rows } = await query(
      `select id, name, category, description, allow_price, average_price
       from public.pharmacy_services_taxonomy
       order by category asc, name asc`,
    );
    return json({ success: true, taxonomy: rows });
  }

  const claim = await getApprovedClaim(auth.user.id);
  const pending = claim
    ? null
    : (
        await query(
          `select c.id, c.status, c.pharmacy_id, p.name, p.prontofarmacie_slug, p.city
           from public.pharmacy_claims c
           join public.paginegialle_pharmacies p on p.id = c.pharmacy_id
           where c.user_id = $1
           order by c.created_at desc
           limit 1`,
          [auth.user.id],
        )
      ).rows[0];

  if (!claim) {
    return json({
      success: true,
      claim: pending || null,
      pharmacy: null,
      prices: [],
      needsClaim: true,
    });
  }

  const pharmacyRes = await query(
    `select id, name, prontofarmacie_slug, address, city, province, phone, email, website,
            opening_hours, services, description
     from public.paginegialle_pharmacies
     where id = $1
     limit 1`,
    [claim.pharmacy_id],
  );
  const pharmacy = pharmacyRes.rows[0] || null;

  const pricesRes = await query(
    `select psp.id, psp.service_id, psp.price, psp.context,
            t.name as service_name, t.category, t.allow_price, t.average_price
     from public.pharmacy_services_prices psp
     join public.pharmacy_services_taxonomy t on t.id = psp.service_id
     where psp.pharmacy_id = $1
     order by t.category, t.name`,
    [claim.pharmacy_id],
  );

  return json({
    success: true,
    claim,
    pharmacy,
    prices: pricesRes.rows,
    needsClaim: false,
    days: DAYS,
  });
};

export const POST: APIRoute = async (context) => {
  const body = await context.request.json().catch(() => ({}));
  const action = String(body.action || '');
  const auth = await requireLocalUser(context);
  if (!auth.user) return json({ success: false, error: 'Accedi per continuare.' }, 401);

  if (action === 'claim') {
    const roleOk = auth.user.role === 'pharmacy_owner' || auth.user.role === 'admin';
    if (!roleOk) return json({ success: false, error: 'Solo i farmacisti possono reclamare una scheda.' }, 403);

    const pharmacyId = String(body.pharmacy_id || '').trim();
    if (!pharmacyId) return json({ success: false, error: 'Seleziona una farmacia.' }, 422);

    const pharmacyRes = await query<{ id: string; email: string | null }>(
      `select id, email from public.paginegialle_pharmacies where id = $1 limit 1`,
      [pharmacyId],
    );
    const pharmacy = pharmacyRes.rows[0];
    if (!pharmacy) return json({ success: false, error: 'Farmacia non trovata.' }, 404);

    const taken = await query(
      `select id from public.pharmacy_claims where pharmacy_id = $1 and status = 'approved' limit 1`,
      [pharmacyId],
    );
    if (taken.rows[0]) {
      return json({ success: false, error: 'Questa scheda è già collegata a un altro account.' }, 409);
    }

    const emailMatch =
      pharmacy.email &&
      pharmacy.email.trim().toLowerCase() === auth.user.email.trim().toLowerCase();
    const status = emailMatch || auth.user.role === 'admin' ? 'approved' : 'pending';
    const verifiedVia = emailMatch ? 'email_match' : auth.user.role === 'admin' ? 'admin' : 'manual';

    const { rows } = await query(
      `insert into public.pharmacy_claims (user_id, pharmacy_id, status, verified_via, reviewed_at)
       values ($1, $2, $3, $4, case when $3 = 'approved' then now() else null end)
       on conflict (user_id, pharmacy_id) do update set
         status = excluded.status,
         verified_via = excluded.verified_via,
         updated_at = now(),
         reviewed_at = excluded.reviewed_at
       returning id, pharmacy_id, status`,
      [auth.user.id, pharmacyId, status, verifiedVia],
    );

    return json({
      success: true,
      claim: rows[0],
      message:
        status === 'approved'
          ? 'Scheda collegata. Puoi aggiornare orari e listino servizi.'
          : 'Richiesta inviata. La verificheremo a breve (match email automatico se la mail coincide).',
    });
  }

  if (action === 'save_profile') {
    const roleAuth = await requireLocalRole(context, ['pharmacy_owner', 'admin']);
    if (!roleAuth.ok || !roleAuth.user) {
      return json({ success: false, error: 'Accedi come farmacista.' }, 401);
    }
    const claim = await getApprovedClaim(roleAuth.user.id);
    if (!claim && roleAuth.user.role !== 'admin') {
      return json({ success: false, error: 'Nessuna scheda farmacia approvata.' }, 403);
    }
    const pharmacyId = claim?.pharmacy_id || String(body.pharmacy_id || '');
    if (!pharmacyId) return json({ success: false, error: 'Farmacia mancante.' }, 422);

    const phone = body.phone != null ? String(body.phone).trim() || null : undefined;
    const email = body.email != null ? String(body.email).trim().toLowerCase() || null : undefined;
    const website = body.website != null ? String(body.website).trim() || null : undefined;
    const description = body.description != null ? String(body.description).trim() || null : undefined;
    const openingHours = body.opening_hours;
    const services = body.services;

    await query(
      `update public.paginegialle_pharmacies set
         phone = $2,
         email = $3,
         website = $4,
         description = $5,
         opening_hours = coalesce($6::jsonb, opening_hours),
         services = coalesce($7::jsonb, services),
         updated_at = now()
       where id = $1`,
      [
        pharmacyId,
        phone === undefined ? null : phone,
        email === undefined ? null : email,
        website === undefined ? null : website,
        description === undefined ? null : description,
        openingHours ? JSON.stringify(openingHours) : null,
        services ? JSON.stringify(services) : null,
      ],
    );

    return json({ success: true, message: 'Scheda aggiornata.' });
  }

  if (action === 'save_prices') {
    const roleAuth = await requireLocalRole(context, ['pharmacy_owner', 'admin']);
    if (!roleAuth.ok || !roleAuth.user) {
      return json({ success: false, error: 'Accedi come farmacista.' }, 401);
    }
    const claim = await getApprovedClaim(roleAuth.user.id);
    if (!claim) return json({ success: false, error: 'Nessuna scheda farmacia approvata.' }, 403);

    const items = Array.isArray(body.prices) ? body.prices : [];
    await query(`delete from public.pharmacy_services_prices where pharmacy_id = $1`, [claim.pharmacy_id]);

    for (const item of items) {
      const serviceId = String(item.service_id || '').trim();
      const price = Number(item.price);
      if (!serviceId || Number.isNaN(price) || price < 0) continue;
      await query(
        `insert into public.pharmacy_services_prices (pharmacy_id, service_id, price, context)
         values ($1, $2, $3, $4)
         on conflict (pharmacy_id, service_id) do update set
           price = excluded.price,
           context = excluded.context,
           updated_at = now()`,
        [claim.pharmacy_id, serviceId, price, item.context ? String(item.context) : null],
      );
    }

    return json({ success: true, message: 'Listino servizi salvato.' });
  }

  return json({ success: false, error: 'Azione non valida.' }, 400);
};
