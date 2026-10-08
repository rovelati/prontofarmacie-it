#!/usr/bin/env bash
# Genera sitemap da Supabase e le scrive in prontofarmacie-astro/public/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASTRO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ASTRO_ROOT/.." && pwd)"
WEB_ROOT="$REPO_ROOT/prontofarmacie-web"
OUTPUT_DIR="$ASTRO_ROOT/public"

export SITE_BASE_URL="${SITE_BASE_URL:-https://www.prontofarmacie.it}"
export SITEMAP_OUTPUT_DIR="$OUTPUT_DIR"
export NEWS_JSON_PATH="$OUTPUT_DIR/data/news.json"

if [[ -f "$WEB_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$WEB_ROOT/.env.local"
  set +a
fi

export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${VITE_SUPABASE_SERVICE_ROLE_KEY:-}}"

echo "==> Sitemap → $OUTPUT_DIR (SITE_BASE_URL=$SITE_BASE_URL)"
cd "$WEB_ROOT"
node tools/generate-sitemaps-v2.js
echo "==> Sitemap generate: $(ls -1 "$OUTPUT_DIR"/sitemap*.xml | wc -l | tr -d ' ') file"
