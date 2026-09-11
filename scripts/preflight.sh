#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
MIN_DISK_KIB=$((100 * 1024 * 1024))

fail() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }
warn() { printf 'LET OP: %s\n' "$*" >&2; }
env_value() {
  [ -f "$ENV_FILE" ] || return 1
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}
is_secret() { [[ "$1" =~ ^[A-Za-z0-9_-]{32,}$ ]] && [[ "$1" != VERVANG_DOOR_* ]]; }
need_secret() {
  local value
  value=$(env_value "$1" || true)
  is_secret "$value" || fail "$1 ontbreekt, is een placeholder, of bevat onveilige tekens."
}
port_free() {
  if command -v ss >/dev/null 2>&1; then
    ! ss -ltnH "sport = :$1" | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    warn "Geen ss of lsof; poort $1 is niet lokaal gecontroleerd."
  fi
}

printf 'Preflight voor %s\n' "$ROOT"
printf 'Configuratiebestand: %s\n' "$ENV_FILE"
printf 'Versie: %s\n' "$(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)"

[ "$(uname -s)" = Linux ] || fail "Deze productie-opzet ondersteunt alleen Linux hosts."
case "$(uname -m)" in x86_64|aarch64) ;; *) fail "Niet-ondersteunde architectuur: $(uname -m)" ;; esac
if [ -r /etc/os-release ]; then
  . /etc/os-release
  [ "${ID:-}" = debian ] || warn "Getest doel is Debian 13; gevonden: ${PRETTY_NAME:-onbekend}."
  [ "${VERSION_ID:-}" = 13 ] || warn "Debian 13/Hyper-V is nog niet in deze omgeving gevalideerd."
fi

command -v docker >/dev/null 2>&1 || fail "Docker ontbreekt. Installeer Docker via de gedocumenteerde distributieroute."
docker info >/dev/null 2>&1 || fail "Docker-engine is niet bereikbaar voor deze gebruiker."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ontbreekt."
[ -f "$ENV_FILE" ] || fail "Maak eerst $ENV_FILE op basis van .env.example."

DATA_DIR=$(env_value STUDIO_DATA_DIR || true)
[ -n "$DATA_DIR" ] || fail "STUDIO_DATA_DIR ontbreekt."
mkdir -p "$DATA_DIR" || fail "Kan STUDIO_DATA_DIR niet aanmaken: $DATA_DIR"
touch "$DATA_DIR/.write-check" || fail "STUDIO_DATA_DIR is niet beschrijfbaar: $DATA_DIR"
rm -f "$DATA_DIR/.write-check"
available=$(df -Pk "$DATA_DIR" | awk 'NR == 2 {print $4}')
[ "${available:-0}" -ge "$MIN_DISK_KIB" ] || fail "Minder dan 100 GiB vrije lokale schijfruimte in $DATA_DIR."

HTTP_PORT=$(env_value HTTP_PORT || printf 80)
HTTPS_PORT=$(env_value HTTPS_PORT || printf 443)
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] || fail "HTTP_PORT en HTTPS_PORT moeten poortnummers zijn."
port_free "$HTTP_PORT" || fail "HTTP-poort $HTTP_PORT is al in gebruik."
port_free "$HTTPS_PORT" || fail "HTTPS-poort $HTTPS_PORT is al in gebruik."

SITE=$(env_value CADDY_SITE_ADDRESS || true)
PUBLIC_URL=$(env_value PUBLIC_BASE_URL || true)
[ -n "$SITE" ] && [ -n "$PUBLIC_URL" ] || fail "CADDY_SITE_ADDRESS of PUBLIC_BASE_URL ontbreekt."
[ "$PUBLIC_URL" = "https://$SITE" ] || fail "PUBLIC_BASE_URL moet exact https://CADDY_SITE_ADDRESS zijn."
if command -v getent >/dev/null 2>&1; then
  getent ahosts "$SITE" >/dev/null 2>&1 || fail "DNS voor $SITE resolveert niet vanaf deze host."
else
  warn "getent ontbreekt; DNS voor $SITE is niet gecontroleerd."
fi
if command -v timedatectl >/dev/null 2>&1; then
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)" = yes ] || warn "Klok is niet als NTP-gesynchroniseerd bevestigd."
else
  warn "timedatectl ontbreekt; klokstatus is niet gecontroleerd."
fi

for key in POSTGRES_PASSWORD MIGRATION_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD AUTH_SECRET; do
  need_secret "$key"
done
printf 'Gereed: Docker, configuratie, opslag, poorten, DNS en secrets zijn gecontroleerd.\n'
