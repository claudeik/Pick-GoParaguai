#!/usr/bin/env bash
# Build da demo no Vercel (Build Output API): site estático do pickgo-web e a API
# do pickgo-backend numa única Vercel Function em /v1. O protótipo antigo fica em /prototipo.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
saida="$raiz/.vercel/output"
func="$saida/functions/v1.func"
rm -rf "$saida"
mkdir -p "$func" "$saida/static/prototipo"

# API: um arquivo só, empacotado pelo esbuild, com as migrações ao lado.
cd "$raiz/pickgo-backend"
npm ci --no-audit --no-fund
npx esbuild src/vercel.ts --bundle --platform=node --format=esm --target=node22 \
  --outfile="$func/index.mjs" --external:pg-native --external:@electric-sql/pglite \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
cp -R migrations "$func/migrations"
# Banco em memória da demo enquanto não há DATABASE_URL (o esbuild deixa o PGlite de fora).
mkdir -p "$func/node_modules/@electric-sql"
cp -R node_modules/@electric-sql/pglite "$func/node_modules/@electric-sql/pglite"
cat > "$func/.vc-config.json" <<'JSON'
{ "runtime": "nodejs22.x", "handler": "index.mjs", "launcherType": "Nodejs", "shouldAddHelpers": false, "maxDuration": 30 }
JSON

# Front: o sistema completo (equipe em modo demonstração, porque não há Keycloak).
cd "$raiz/pickgo-web"
npm ci --no-audit --no-fund
npx vite build --outDir "$saida/static" --emptyOutDir false

cp "$raiz/index.html" "$raiz/app.js" "$raiz/styles.css" "$saida/static/prototipo/"

cat > "$saida/config.json" <<'JSON'
{
  "version": 3,
  "routes": [
    { "src": "^/v1(/.*)?$", "dest": "/v1?__p=/v1$1" },
    { "src": "^/(v|l)/([A-Za-z0-9]+)$", "dest": "/v1?__p=/$1/$2" },
    { "handle": "filesystem" },
    { "src": "^/prototipo/?$", "dest": "/prototipo/index.html" },
    { "src": "^/(.*)$", "dest": "/index.html" }
  ]
}
JSON
echo "build da demo pronto em $saida"
