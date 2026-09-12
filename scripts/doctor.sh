#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
[ -f "$ENV_FILE" ] || { printf 'FOUT: .env ontbreekt.\n' >&2; exit 1; }
printf 'Diagnose voor %s (%s)\n' "$(hostname)" "$(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)"

env_value() { awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"; }
HTTPS_PUBLISH=$(env_value HTTPS_PORT || true)
[ -n "$HTTPS_PUBLISH" ] || HTTPS_PUBLISH=443
TLS_MODE=$(env_value CADDY_TLS || true)
printf 'Bereikbaarheid: HTTP %s, HTTPS %s. Certificaatroute: %s.\n' \
  "$(env_value HTTP_PORT || printf 80)" "$HTTPS_PUBLISH" "${TLS_MODE:-automatisch, publiek vertrouwd}"

# Waar luistert de HTTPS-poort werkelijk? Dit is de controle die de gevaarlijkste
# vergissing afvangt: een installatie die achter een VPN hoort te zitten maar na
# een wijziging weer op alle interfaces publiceert.
HTTPS_BIND=""
case "$HTTPS_PUBLISH" in *:*) HTTPS_BIND=${HTTPS_PUBLISH%:*} ;; esac
HTTPS_ONLY_PORT=${HTTPS_PUBLISH##*:}
if command -v ss >/dev/null 2>&1; then
  listeners=$(ss -ltnH "sport = :$HTTPS_ONLY_PORT" | awk '{print $4}' | sort -u | paste -sd' ' -)
  printf 'Luistert op: %s\n' "${listeners:-niets}"
  if [ -n "$HTTPS_BIND" ] && printf '%s' "$listeners" | grep -q '0\.0\.0\.0:'; then
    printf 'LET OP: HTTPS_PORT beperkt de publicatie tot %s, maar er luistert iets op alle interfaces. Controleer de publicatie in compose.production.yaml.\n' "$HTTPS_BIND" >&2
  fi
else
  printf 'Luisteraars niet gecontroleerd: ss ontbreekt.\n'
fi
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" ps
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" exec -T api \
  node -e "fetch('http://127.0.0.1:4311/api/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
if [ -r "$(awk -F= '$1 == "STUDIO_DATA_DIR" {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")/backups/status.json" ]; then
  printf 'Back-upstatus: '
  cat "$(awk -F= '$1 == "STUDIO_DATA_DIR" {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")/backups/status.json"
else
  printf 'Back-upstatus: nog geen geslaagde backup of verificatie geregistreerd.\n'
fi
printf 'API-healthcheck is geslaagd. Controleer extern HTTPS en certificaatstatus afzonderlijk na DNS-propagatie.\n'
