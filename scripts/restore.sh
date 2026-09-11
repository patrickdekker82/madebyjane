#!/usr/bin/env bash

set -Eeuo pipefail
source "$(dirname "$0")/backup-lib.sh"

SOURCE=""
TARGET=""
DATABASE_CHECK=0
CONFIRM_EMPTY_TARGET=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --from) SOURCE=${2:-}; shift 2 ;;
    --target) TARGET=${2:-}; shift 2 ;;
    --verify-database) DATABASE_CHECK=1; shift ;;
    --confirm-empty-target) CONFIRM_EMPTY_TARGET=1; shift ;;
    *) fail "Gebruik: restore.sh --from synology|external --target /lege/herstelmap --confirm-empty-target [--verify-database]" ;;
  esac
done

[ "$SOURCE" = synology ] || [ "$SOURCE" = external ] || fail "Kies expliciet --from synology of --from external."
[ -n "$TARGET" ] || fail "--target is verplicht."
[ "$CONFIRM_EMPTY_TARGET" -eq 1 ] || fail "Bevestig een leeg hersteldoel met --confirm-empty-target."
case "$TARGET" in /*) ;; *) fail "--target moet een absoluut pad zijn." ;; esac
PRODUCTION_DATA_DIR=$(data_dir)
[ "$TARGET" != "$PRODUCTION_DATA_DIR" ] || fail "Herstel naar de productiedatamap is verboden."
if [ -e "$TARGET" ] && [ "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  fail "Hersteldoel is niet leeg: $TARGET"
fi
mkdir -p "$TARGET"

require_backup_tools
repository=$(backup_repository "$SOURCE")
note "Herstel naar expliciet geïsoleerd doel: $TARGET"
restic_run "$repository" restore latest --target "$TARGET"
[ -f "$TARGET/manifest-assets.sha256" ] || fail "Backup bevat geen assetmanifest."
(cd "$TARGET" && sha256sum -c manifest-assets.sha256)
[ -s "$TARGET/db/database.dump" ] && [ -s "$TARGET/db/globals.sql" ] || fail "Databasebestanden ontbreken in backup."

if [ "$DATABASE_CHECK" -eq 1 ]; then
  name="interieurstudio-herstel-$$"
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
  docker run -d --rm --name "$name" --network none \
    -e POSTGRES_PASSWORD=alleen-voor-geisoleerde-controle \
    -e POSTGRES_DB=interieurstudio \
    -v "$TARGET:/recovery:ro" \
    postgres:17.5-bookworm@sha256:0145b2977c9b49729ff8f8edc3b1192691eff92c1039bc969e25ae64bd7cbbe9 >/dev/null
  for _ in $(seq 1 30); do
    docker exec -u postgres "$name" pg_isready -U postgres -d interieurstudio >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec -u postgres "$name" pg_isready -U postgres -d interieurstudio >/dev/null || fail "Geïsoleerde herstel-PostgreSQL startte niet."
  docker exec -i -u postgres "$name" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <"$TARGET/db/globals.sql"
  docker exec -u postgres "$name" pg_restore -v --clean --if-exists -U postgres -d interieurstudio /recovery/db/database.dump
  schema_count=$(docker exec -u postgres "$name" psql -v ON_ERROR_STOP=1 -U postgres -d interieurstudio -Atc \
    "SELECT count(*) FROM (VALUES (to_regclass('public.projects')), (to_regclass('public.presentations')), (to_regclass('public.quote_versions')), (to_regclass('identity.\"user\"'))) AS required(table_name) WHERE table_name IS NOT NULL;")
  [ "$schema_count" = 4 ] || fail "Herstelde database mist een of meer kernschema's."
  note "Geïsoleerde databaseherstelcontrole geslaagd."
fi

note "Herstelartefacten staan in $TARGET. De originele .env-secrets horen bij de afzonderlijke veilige herstelroute en zijn bewust niet uit de backup teruggezet."
