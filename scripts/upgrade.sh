#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
[ -f "$ENV_FILE" ] || { printf 'FOUT: .env ontbreekt.\n' >&2; exit 1; }
printf 'Upgrade op %s naar %s\n' "$(hostname)" "$(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)"
printf 'De migrator controleert en voert uitsluitend nieuwe schema-migrations uit; hij roteert geen secrets.\n'
ENV_FILE="$ENV_FILE" "$ROOT/scripts/preflight.sh"
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" up --build --detach --wait
"$ROOT/scripts/doctor.sh"
