import type { APIRoute } from 'astro';
import { findOrCreateGoogleUser } from '@/lib/google-auth-users';
import {
  createToken,
  setSessionCookie,
} from '@/lib/local-auth';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getGoogleOAuthConfig,
  parseGoogleOAuthState,
} from '@/lib/google-oauth';
import { siteUrl } from '@/lib/turni';

function redirect(url: string, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}

function fallbackLogin(role: string | undefined) {
  return role === 'job_seeker' ? '/lavoro/area-candidati/accedi/' : '/area-farmacia/accedi/';
}

export const GET: APIRoute = async (context) => {
  const origin = siteUrl(import.meta.env);
  const config = getGoogleOAuthConfig(origin);
  const errorParam = context.url.searchParams.get('error');
  const code = context.url.searchParams.get('code');
  const stateRaw = context.url.searchParams.get('state');
  const state = parseGoogleOAuthState(stateRaw);
  const loginPath = fallbackLogin(state?.role);

  if (errorParam) {
    return redirect(`${loginPath}?error=google_denied`);
  }
  if (!config.enabled || !code || !state) {
    return redirect(`${loginPath}?error=google_auth_failed`);
  }

  try {
    const tokenPayload = await exchangeGoogleCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const profile = await fetchGoogleUserInfo(tokenPayload.access_token);
    const result = await findOrCreateGoogleUser(profile, state.role);
    if ('error' in result) {
      const message = encodeURIComponent(result.error);
      return redirect(`${loginPath}?error=${message}`);
    }

    const token = createToken(result.user);
    setSessionCookie(context, token);
    return redirect(state.redirectTo);
  } catch (err) {
    const message = encodeURIComponent(
      err instanceof Error ? err.message : 'Accesso Google non riuscito',
    );
    return redirect(`${loginPath}?error=${message}`);
  }
};
