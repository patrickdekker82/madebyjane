#!/usr/bin/env bash

set -Eeuo pipefail
source "$(dirname "$0")/backup-lib.sh"

require_backup_tools
DATA_DIR=$(data_dir)
STAGE_PARENT=${BACKUP_STAGING_DIR:-"$DATA_DIR/backups/staging"}
mkdir -p "$STAGE_PARENT"
STAGE=$(mktemp -d "$STAGE_PARENT/backup.XXXXXX")
api_stopped=0

cleanup() {
  local result=$?
  if [ "$api_stopped" -eq 1 ]; then
    note "Onderhoudsvenster sluiten: API opnieuw starten."
    compose start api >/dev/null 2>&1 || {
      write_backup_status failed "API kon na backup niet herstarten"
      note "FOUT: de API kon niet automatisch herstarten; voer scripts/doctor.sh uit."
      result=1
    }
  fi
  if [ "$result" -ne 0 ]; then
    write_backup_status failed "Backup afgebroken; controleer de beveiligde restic- en Docker-logs"
  fi
  rm -rf "$STAGE"
  exit "$result"
}
trap cleanup EXIT

note "Back-up op $(hostname), versie $(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)."
note "Onderhoudsvenster: de API wordt tijdelijk gestopt; er is geen aparte worker in deze release."
compose stop --timeout 60 api
api_stopped=1

mkdir -p "$STAGE/db" "$STAGE/assets" "$STAGE/config"
compose exec -T -u postgres postgres pg_dump -U postgres -d "$(require_value POSTGRES_DB)" -Fc >"$STAGE/db/database.dump"
compose exec -T -u postgres postgres pg_dumpall -U postgres --globals-only >"$STAGE/db/globals.sql"

[ -d "$DATA_DIR/assets" ] || fail "Assetmap ontbreekt: $DATA_DIR/assets"
cp -a "$DATA_DIR/assets/." "$STAGE/assets/"
(cd "$STAGE" && find assets -type f -print0 | sort -z | xargs -0 -r sha256sum > manifest-assets.sha256)

cp "$ROOT/.env.example" "$ROOT/compose.production.yaml" "$ROOT/release-manifest.json" "$STAGE/config/"
awk -F= 'BEGIN {OFS="="} /^[[:space:]]*($|#)/ {print; next} $1 ~ /(PASSWORD|SECRET|TOKEN|KEY)/ {print $1,"[REDACTED]"; next} {print}' "$ENV_FILE" >"$STAGE/config/env.redacted"
chmod -R go-rwx "$STAGE/config"

for destination in synology external; do
  repository=$(backup_repository "$destination")
  note "Versleutelde back-up naar $destination starten."
  restic_run "$repository" snapshots >/dev/null 2>&1 || fail "Restic-repository voor $destination is niet geïnitialiseerd of niet bereikbaar."
  (cd "$STAGE" && restic_run "$repository" backup db assets config manifest-assets.sha256 --tag interieurstudio --tag "$destination")
  restic_run "$repository" forget --prune \
    --keep-daily "${BACKUP_KEEP_DAILY:-14}" \
    --keep-weekly "${BACKUP_KEEP_WEEKLY:-8}" \
    --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}"
done

write_backup_status success "Twee bestemmingen, assets-manifest en PostgreSQL-dump vastgelegd"
note "Back-up geslaagd; de API wordt nu hervat. Een backup is pas volledig gevalideerd na scripts/verify-backup.sh."
