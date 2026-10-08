import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

const site = process.env.PUBLIC_SITE_URL || 'https://www.prontofarmacie.it';

/** @see https://docs.astro.build/en/guides/configuring-astro/ */
export default defineConfig({
  site,
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [react(), tailwind({ applyBaseStyles: true })],
  vite: {
    ssr: {
      noExternal: ['@supabase/supabase-js'],
    },
  },
  server: {
    port: 4321,
    host: true,
  },
});
