#!/usr/bin/env bash
# Keycloak local em modo desenvolvimento, na porta 8180, com o realm pickgo importado.
# Console de administração: http://localhost:8180/admin (admin / admin, só local).
set -euo pipefail
cd "$(dirname "$0")"
[ -d .ferramentas/keycloak ] || ./instalar.sh
JAVA_HOME="$PWD/.ferramentas/jdk/Contents/Home"
[ -d "$JAVA_HOME" ] || JAVA_HOME="$PWD/.ferramentas/jdk"
export JAVA_HOME
mkdir -p .ferramentas/keycloak/data/import
cp realm-pickgo.json .ferramentas/keycloak/data/import/
export KC_BOOTSTRAP_ADMIN_USERNAME="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
export KC_BOOTSTRAP_ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"
# --import-realm só cria o realm se ele não existir; para recriar, apague .ferramentas/keycloak/data/h2.
exec .ferramentas/keycloak/bin/kc.sh start-dev --http-port="${KC_PORTA:-8180}" --import-realm
