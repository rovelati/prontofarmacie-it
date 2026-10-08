import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { requireLocalAdmin } from '@/lib/local-auth';
import { localPostgrestFetch } from '@/lib/postgrestFetch';

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const mediaRoot =
  process.env.MEDIA_ROOT ||
  import.meta.env.MEDIA_ROOT ||
  '/var/www/prontofarmacie.it/media/gallery';

const publicMediaBase = import.meta.env.PUBLIC_MEDIA_BASE || process.env.PUBLIC_MEDIA_BASE || '/media/gallery';

function slugSafe(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'farmacia';
}

function adminClient() {
  const url = process.env.LOCAL_SUPABASE_URL || import.meta.env.LOCAL_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const useLocal = Boolean(process.env.LOCAL_SUPABASE_URL || import.meta.env.LOCAL_SUPABASE_URL);
  return createClient(url, key, {
    auth: { persistSession: false },
    global: useLocal ? { fetch: localPostgrestFetch } : undefined,
    realtime: { transport: WebSocket },
  });
}

export const POST: APIRoute = async (context) => {
  const allowUnauth = import.meta.env.ADMIN_TEST_ALLOW_UNAUTH === 'true';
  if (!allowUnauth) {
    const gate = await requireLocalAdmin(context);
    if (!gate.ok) {
      return json({ success: false, error: 'Accesso admin richiesto.' }, 401);
    }
  }

  const admin = adminClient();
  if (!admin) {
    return json({ success: false, error: 'Database non configurato.' }, 503);
  }

  try {
    const form = await context.request.formData();
    const pharmacyId = String(form.get('pharmacy_id') || form.get('clinic_id') || '');
    const file = form.get('image') || form.get('file');

    if (!pharmacyId || !(file instanceof File)) {
      return json({ success: false, error: 'pharmacy_id e image sono obbligatori.' }, 422);
    }

    const { data: pharmacy, error: pharmacyError } = await admin
      .from('paginegialle_pharmacies')
      .select('id, prontofarmacie_slug, images')
      .eq('id', pharmacyId)
      .maybeSingle();
    if (pharmacyError) throw pharmacyError;
    if (!pharmacy) return json({ success: false, error: 'Farmacia non trovata.' }, 404);

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const slug = slugSafe(pharmacy.prontofarmacie_slug || String(pharmacy.id));
    const filename = `${slug}_${Date.now()}.${extension}`;
    const relativePath = path.posix.join('gallery', filename);
    const absolutePath = path.join(mediaRoot, filename);

    await mkdir(mediaRoot, { recursive: true });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeFile(absolutePath, bytes);

    const imageUrl = `${publicMediaBase.replace(/\/$/, '')}/${filename}`;
    const existing = Array.isArray(pharmacy.images)
      ? pharmacy.images.filter(Boolean).map(String)
      : pharmacy.images
        ? [String(pharmacy.images)]
        : [];
    const images = [...existing, imageUrl];

    const { error: updateError } = await admin
      .from('paginegialle_pharmacies')
      .update({ images })
      .eq('id', pharmacyId);
    if (updateError) throw updateError;

    return json({ success: true, image_url: imageUrl, images, path: relativePath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ success: false, error: message }, 500);
  }
};
