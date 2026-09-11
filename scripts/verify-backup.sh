#!/usr/bin/env bash

set -Eeuo pipefail
source "$(dirname "$0")/backup-lib.sh"

SOURCE=""
TARGET=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --from) SOURCE=${2:-}; shift 2 ;;
    --target) TARGET=${2:-}; shift 2 ;;
    *) fail "Gebruik: verify-backup.sh --from synology|external --target /lege/controlemap" ;;
  esac
done

[ -n "$SOURCE" ] && [ -n "$TARGET" ] || fail "--from en --target zijn verplicht."
"$ROOT/scripts/restore.sh" --from "$SOURCE" --target "$TARGET" --confirm-empty-target --verify-database
write_backup_status verified "Geïsoleerde restore, assethashes en kernschema's gecontroleerd vanaf $SOURCE"
note "Verificatie geslaagd. Voor login-, project-, presentatie- en offerte-smoketests is een schone recovery-host met de afzonderlijk bewaarde secrets vereist; zie docs/notes/backup-herstel.md."
