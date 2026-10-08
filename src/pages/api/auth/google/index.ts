import type { APIRoute } from 'astro';
import { isMarketplaceRole } from '@/lib/local-auth';
import {
  buildGoogleAuthUrl,
  createGoogleOAuthState,
  getGoogleOAuthConfig,
} from '@/lib/google-oauth';
import { siteUrl } from '@/lib/turni';

function redirect(url: string, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

export const GET: APIRoute = async (context) => {
  const origin = siteUrl(import.meta.env);
  const config = getGoogleOAuthConfig(origin);
  if (!config.enabled) {
    return redirect('/area-farmacia/accedi/?error=google_not_configured');
  }

  const roleRaw = context.url.searchParams.get('role') || '';
  const role = isMarketplaceRole(roleRaw) ? roleRaw : '';
  const redirectTo = context.url.searchParams.get('redirect_to') || '';

  if (role !== 'pharmacy_owner' && role !== 'job_seeker') {
    return redirect('/area-farmacia/accedi/?error=invalid_role');
  }

  const safeRedirect =
    redirectTo.startsWith('/') && !redirectTo.startsWith('//')
      ? redirectTo
      : role === 'pharmacy_owner'
        ? '/area-farmacia/dashboard/'
        : '/lavoro/area-candidati/i-miei-alert/';

  const state = createGoogleOAuthState(role, safeRedirect);
  const authUrl = buildGoogleAuthUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  });
  return redirect(authUrl);
};
