#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
COMPOSE_FILE="$ROOT/compose.production.yaml"

fail() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*" >&2; }
env_value() {
  [ -f "$ENV_FILE" ] || return 1
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}
require_value() {
  local value
  value=$(env_value "$1" || true)
  [ -n "$value" ] && [[ "$value" != VERVANG_DOOR_* ]] || fail "$1 ontbreekt in $ENV_FILE."
  printf '%s' "$value"
}
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
data_dir() { require_value STUDIO_DATA_DIR; }
restic_password_file() {
  local file
  file=$(require_value BACKUP_RESTIC_PASSWORD_FILE)
  [ -r "$file" ] || fail "BACKUP_RESTIC_PASSWORD_FILE is niet leesbaar."
  printf '%s' "$file"
}
restic_run() {
  local repository=$1
  shift
  RESTIC_REPOSITORY="$repository" RESTIC_PASSWORD_FILE="$(restic_password_file)" restic "$@"
}
backup_repository() {
  case "$1" in
    synology) require_value BACKUP_SYNOLOGY_REPOSITORY ;;
    external) require_value BACKUP_EXTERNAL_REPOSITORY ;;
    *) fail "Onbekende backupbestemming: $1" ;;
  esac
}
require_backup_tools() {
  command -v docker >/dev/null 2>&1 || fail "Docker ontbreekt."
  docker info >/dev/null 2>&1 || fail "Docker-engine is niet bereikbaar."
  command -v restic >/dev/null 2>&1 || fail "Restic ontbreekt; installeer het via de pakketbron van de host."
  command -v sha256sum >/dev/null 2>&1 || fail "sha256sum ontbreekt."
  [ -f "$ENV_FILE" ] || fail "Configuratiebestand ontbreekt: $ENV_FILE"
}
write_backup_status() {
  local status=$1 detail=$2 state directory
  directory="$(data_dir)/backups"
  install -d -m 0700 "$directory"
  state="$directory/status.json"
  printf '{"status":"%s","at":"%s","detail":"%s"}\n' \
    "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${detail//\"/}" >"$state"
  chmod 600 "$state"
}
