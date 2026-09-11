#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
umask 077

fail() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }
value() { awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"; }
valid_secret() { [[ "$1" =~ ^[A-Za-z0-9_-]{32,}$ ]] && [[ "$1" != VERVANG_DOOR_* ]]; }
set_value() {
  local key=$1 replacement=$2 temporary
  temporary=$(mktemp "${ENV_FILE}.XXXXXX")
  awk -v key="$key" -v replacement="$replacement" -F= '
    $1 == key {print key "=" replacement; found=1; next} {print}
    END {if (!found) print key "=" replacement}
  ' "$ENV_FILE" >"$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ENV_FILE"
}
ensure_secret() {
  local key=$1 current entered
  current=$(value "$key" || true)
  valid_secret "$current" && return
  [ -t 0 ] || fail "$key moet veilig worden ingevuld in $ENV_FILE voordat een niet-interactieve installatie kan doorgaan."
  printf 'Voer %s in (minimaal 32 letters/cijfers/_/-; invoer is verborgen): ' "$key" >&2
  read -r -s entered
  printf '\n' >&2
  valid_secret "$entered" || fail "$key heeft niet het vereiste formaat."
  set_value "$key" "$entered"
}

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  printf 'Nieuw configuratiebestand gemaakt: %s\n' "$ENV_FILE"
fi
for key in POSTGRES_PASSWORD MIGRATION_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD AUTH_SECRET; do
  ensure_secret "$key"
done
DATA_DIR=$(value STUDIO_DATA_DIR || true)
[ -n "$DATA_DIR" ] || fail "STUDIO_DATA_DIR ontbreekt in $ENV_FILE."
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/assets" "$DATA_DIR/caddy" "$DATA_DIR/caddy-config"
printf 'Doelhost: %s\nInstallatiemap: %s\nGegevensmappen: %s/{postgres,assets,caddy,caddy-config}\n' "$(hostname)" "$ROOT" "$DATA_DIR"
printf 'De migrator draait eenmalig vóór de API. Bestaande secrets blijven ongewijzigd.\n'
ENV_FILE="$ENV_FILE" "$ROOT/scripts/preflight.sh"
docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" up --build --detach --wait
printf 'Installatie gereed. Controleer met scripts/doctor.sh.\n'
