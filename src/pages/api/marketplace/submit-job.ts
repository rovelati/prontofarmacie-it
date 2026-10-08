import type { APIRoute } from 'astro';
import { query } from '@/lib/local-db';
import { requireLocalUser } from '@/lib/local-auth';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function asText(value: unknown) {
  return String(value || '').trim();
}

function asMultilineList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const POST: APIRoute = async (context) => {
  const body = await context.request.json().catch(() => ({}));
  const auth = await requireLocalUser(context);

  const pharmacyName = asText(body.pharmacy_name);
  const pharmacyCity = asText(body.pharmacy_city);
  const pharmacyProvince = asText(body.pharmacy_province).toUpperCase();
  const jobTitle = asText(body.job_title);
  const jobCategory = asText(body.job_category);
  const contractType = asText(body.contract_type);
  const description = asText(body.description);
  const contactEmail = asText(body.contact_email).toLowerCase();
  const submitterEmail = asText(body.submitter_email).toLowerCase();
  const consentPrivacy = Boolean(body.consent_privacy);
  const consentResponsibility = Boolean(body.consent_responsibility);
  const submitterIp = asText(body.submitter_ip);

  const emailOk = (v: string) => /\S+@\S+\.\S+/.test(v);

  if (!pharmacyName || !pharmacyCity || pharmacyProvince.length !== 2) {
    return json({ success: false, error: 'Dati farmacia incompleti.' }, 422);
  }
  if (!jobTitle || !jobCategory || !contractType || !description) {
    return json({ success: false, error: 'Dati offerta incompleti.' }, 422);
  }
  if (!emailOk(contactEmail) || !emailOk(submitterEmail)) {
    return json({ success: false, error: 'Email non valide.' }, 422);
  }
  if (!consentPrivacy || !consentResponsibility) {
    return json({ success: false, error: 'Consensi obbligatori.' }, 422);
  }
  if (!submitterIp) {
    return json({ success: false, error: 'IP mittente mancante.' }, 422);
  }

  let claimedPharmacyId: string | null = null;
  let submittedByUserId: string | null = null;

  if (auth.user && (auth.user.role === 'pharmacy_owner' || auth.user.role === 'admin')) {
    submittedByUserId = auth.user.id;
    const claimRes = await query<{ pharmacy_id: string }>(
      `select pharmacy_id
       from public.pharmacy_claims
       where user_id = $1 and status = 'approved'
       order by updated_at desc
       limit 1`,
      [auth.user.id],
    );
    claimedPharmacyId = claimRes.rows[0]?.pharmacy_id || null;
  }

  // Se il client passa un claimed_pharmacy_id, accettalo solo se matcha il claim approvato
  const requestedClaim = asText(body.claimed_pharmacy_id);
  if (requestedClaim && claimedPharmacyId && requestedClaim === claimedPharmacyId) {
    claimedPharmacyId = requestedClaim;
  } else if (requestedClaim && !claimedPharmacyId) {
    claimedPharmacyId = null;
  }

  const { rows } = await query(
    `insert into public.job_offer_submissions (
       status,
       pharmacy_name, pharmacy_address, pharmacy_city, pharmacy_province, pharmacy_zip,
       pharmacy_email, pharmacy_phone, pharmacy_website, pharmacy_maps_url,
       job_title, job_category, contract_type, working_hours, salary_range,
       description, requirements, benefits, additional_notes,
       contact_email, contact_phone, submitter_name, submitter_email,
       consent_privacy, consent_responsibility, submitter_ip,
       submitted_by_user_id, claimed_pharmacy_id
     ) values (
       'pending',
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,
       $10,$11,$12,$13,$14,
       $15,$16,$17,$18,
       $19,$20,$21,$22,
       $23,$24,$25,
       $26,$27
     )
     returning id, status, created_at`,
    [
      pharmacyName,
      asText(body.pharmacy_address) || null,
      pharmacyCity,
      pharmacyProvince,
      asText(body.pharmacy_zip) || null,
      asText(body.pharmacy_email).toLowerCase() || null,
      asText(body.pharmacy_phone) || null,
      asText(body.pharmacy_website) || null,
      asText(body.pharmacy_maps_url) || null,
      jobTitle,
      jobCategory,
      contractType,
      asText(body.working_hours) || null,
      asText(body.salary_range) || null,
      description,
      asMultilineList(body.requirements),
      asMultilineList(body.benefits),
      asText(body.additional_notes) || null,
      contactEmail,
      asText(body.contact_phone) || null,
      asText(body.submitter_name) || null,
      submitterEmail,
      consentPrivacy,
      consentResponsibility,
      submitterIp,
      submittedByUserId,
      claimedPharmacyId,
    ],
  );

  return json({
    success: true,
    submission: rows[0],
    linked_account: Boolean(submittedByUserId),
    linked_pharmacy: Boolean(claimedPharmacyId),
  });
};
