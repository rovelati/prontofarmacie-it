/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_USE_LOCAL_DB?: string;
  readonly PUBLIC_MEDIA_BASE?: string;
  readonly LOCAL_SUPABASE_URL?: string;
  readonly LOCAL_DATABASE_URL?: string;
  readonly DATABASE_URL?: string;
  readonly AUTH_SECRET?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly MEDIA_ROOT?: string;
  readonly ADMIN_TEST_ALLOW_UNAUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
