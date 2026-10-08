import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import { requireLocalAdmin } from '@/lib/local-auth';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function mapContract(raw: string | null | undefined) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('indeterminat')) return 'Tempo indeterminato';
  if (value.includes('determinat')) return 'Tempo determinato';
  if (value.includes('part')) return 'Part time';
  if (value.includes('full')) return 'Full time';
  if (value.includes('stage') || value.includes('tirocin')) return 'Stage/Tirocinio';
  if (value.includes('sostitu')) return 'Sostituzione';
  return 'Tempo determinato';
}

function mapCategory(raw: string | null | undefined) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('magazz')) return 'Magazzino';
  if (value.includes('direz')) return 'Direzione';
  if (value.includes('vendit')) return 'Vendite';
  if (value.includes('prepar')) return 'Preparazioni';
  if (value.includes('amministr')) return 'Amministrazione';
  return 'Farmacista';
}

export const POST: APIRoute = async (context) => {
  const auth = await requireLocalAdmin(context);
  if (!auth.ok || !auth.user) {
    return json({ success: false, error: 'Solo admin.' }, 401);
  }

  const body = await context.request.json().catch(() => ({}));
  const submissionId = String(body.submission_id || '').trim();
  if (!submissionId) return json({ success: false, error: 'submission_id obbligatorio.' }, 422);

  const { rows } = await query<Record<string, unknown>>(
    `select * from public.job_offer_submissions where id = $1 limit 1`,
    [submissionId],
  );
  const submission = rows[0];
  if (!submission) return json({ success: false, error: 'Submission non trovata.' }, 404);

  if (submission.published_job_guid) {
    return json({
      success: true,
      already_published: true,
      guid: submission.published_job_guid,
    });
  }

  // Upsert farmacia lavoro (tabella pharmacies usata da job_listings)
  const pharmacyName = String(submission.pharmacy_name || 'Farmacia');
  const pharmacyCity = String(submission.pharmacy_city || '');
  let pharmacyId: number | null = null;
  const found = await query<{ id: number }>(
    `select id from public.pharmacies
     where lower(name) = lower($1)
       and lower(coalesce(city,'')) = lower($2)
     limit 1`,
    [pharmacyName, pharmacyCity],
  );
  if (found.rows[0]) {
    pharmacyId = found.rows[0].id;
    await query(
      `update public.pharmacies set
         address = coalesce($2, address),
         province = coalesce($3, province),
         zip_code = coalesce($4, zip_code),
         email = coalesce($5, email),
         phone = coalesce($6, phone),
         maps_url = coalesce($7, maps_url)
       where id = $1`,
      [
        pharmacyId,
        submission.pharmacy_address || null,
        submission.pharmacy_province || null,
        submission.pharmacy_zip || null,
        submission.pharmacy_email || null,
        submission.pharmacy_phone || null,
        submission.pharmacy_maps_url || null,
      ],
    );
  } else {
    const inserted = await query<{ id: number }>(
      `insert into public.pharmacies (name, address, city, province, zip_code, email, phone, maps_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        pharmacyName,
        submission.pharmacy_address || null,
        pharmacyCity || null,
        submission.pharmacy_province || null,
        submission.pharmacy_zip || null,
        submission.pharmacy_email || null,
        submission.pharmacy_phone || null,
        submission.pharmacy_maps_url || null,
      ],
    );
    pharmacyId = inserted.rows[0]?.id || null;
  }
  const guid = `prontofarmacie|submission|${submissionId}`;
  const description = String(submission.description || '');
  const descriptionHtml = `<p>${description.replace(/\n/g, '<br/>')}</p>`;
  const excerpt = description.slice(0, 280);
  const contractType = mapContract(String(submission.contract_type || ''));
  const category = mapCategory(String(submission.job_category || ''));

  await query(
    `insert into public.job_listings (
       guid, title, description_html, excerpt, pharmacy_id, date_posted,
       contract_type, category, benefits, requirements, is_active, source_url, source_name
     ) values (
       $1, $2, $3, $4, $5, current_date,
       $6::public.job_contract_type, $7::public.job_category_type, $8, $9, true, $10, $11
     )
     on conflict (guid) do update set
       title = excluded.title,
       description_html = excluded.description_html,
       excerpt = excluded.excerpt,
       pharmacy_id = excluded.pharmacy_id,
       contract_type = excluded.contract_type,
       category = excluded.category,
       benefits = excluded.benefits,
       requirements = excluded.requirements,
       is_active = true,
       updated_at = now()`,
    [
      guid,
      String(submission.job_title || 'Offerta di lavoro'),
      descriptionHtml,
      excerpt,
      pharmacyId,
      contractType,
      category,
      Array.isArray(submission.benefits) ? submission.benefits : [],
      Array.isArray(submission.requirements) ? submission.requirements : [],
      null,
      'ProntoFarmacie',
    ],
  );

  await query(
    `update public.job_offer_submissions
     set status = 'approved',
         published_job_guid = $2,
         handled_by_email = $3,
         handled_at = now(),
         status_changed_at = now()
     where id = $1`,
    [submissionId, guid, auth.user.email],
  );

  // Best-effort: ping Google Indexing (fallisce silenzioso se SA non verificato)
  try {
    const { spawn } = await import('node:child_process');
    const script = '/var/www/prontofarmacie.it/scripts/supabase/notify_google_indexing_jobs.py';
    spawn('python3', [script, '--guid', guid], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // ignore
  }

  return json({
    success: true,
    guid,
    detail_url: `/lavoro/offerta/${encodeURIComponent(guid)}/`,
  });
};
