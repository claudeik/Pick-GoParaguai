#!/usr/bin/env bash
# Baixa um JDK 21 e o Keycloak para .ferramentas/, sem instalar nada no sistema.
# Para máquinas com Docker, use o docker-compose.yml no lugar deste script.
set -euo pipefail
cd "$(dirname "$0")"
KEYCLOAK_VERSAO="${KEYCLOAK_VERSAO:-26.7.5}"
mkdir -p .ferramentas && cd .ferramentas

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) SO=mac; ARQ=aarch64 ;;
  Darwin-x86_64) SO=mac; ARQ=x64 ;;
  Linux-x86_64) SO=linux; ARQ=x64 ;;
  Linux-aarch64) SO=linux; ARQ=aarch64 ;;
  *) echo "sistema não suportado: $(uname -s)-$(uname -m)"; exit 1 ;;
esac

if [ ! -d jdk ]; then
  echo "baixando JDK 21 ($SO/$ARQ)…"
  curl -fL --retry 3 -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/$SO/$ARQ/jdk/hotspot/normal/eclipse"
  mkdir jdk && tar -xzf jdk.tar.gz -C jdk --strip-components=1 && rm jdk.tar.gz
fi

if [ ! -d "keycloak-$KEYCLOAK_VERSAO" ]; then
  echo "baixando Keycloak $KEYCLOAK_VERSAO…"
  curl -fL --retry 3 -o keycloak.tar.gz "https://github.com/keycloak/keycloak/releases/download/$KEYCLOAK_VERSAO/keycloak-$KEYCLOAK_VERSAO.tar.gz"
  tar -xzf keycloak.tar.gz && rm keycloak.tar.gz
fi
ln -sfn "keycloak-$KEYCLOAK_VERSAO" keycloak
echo "pronto: $(./jdk/Contents/Home/bin/java -version 2>&1 | head -1 || ./jdk/bin/java -version 2>&1 | head -1)"
