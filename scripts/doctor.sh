#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
[ -f "$ENV_FILE" ] || { printf 'FOUT: .env ontbreekt.\n' >&2; exit 1; }
printf 'Diagnose voor %s (%s)\n' "$(hostname)" "$(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)"
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" ps
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" exec -T api \
  node -e "fetch('http://127.0.0.1:4311/api/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
printf 'API-healthcheck is geslaagd. Controleer extern HTTPS en certificaatstatus afzonderlijk na DNS-propagatie.\n'
