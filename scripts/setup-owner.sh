#!/usr/bin/env bash

set -Eeuo pipefail
source "$(dirname "$0")/backup-lib.sh"

# De eerste eigenaar van een verse installatie.
#
# Dit draait in een wegwerpcontainer op hetzelfde interne netwerk als de
# database: PostgreSQL is van buiten niet bereikbaar, en dat hoort zo te
# blijven. De migratierol wordt gebruikt omdat de draaiende app met opzet geen
# organisaties of leden mag aanmaken.
#
# De twee waarden die de migrator normaal niet kent — de publieke URL en het
# sessiegeheim — worden hier eenmalig meegegeven en staan daarom niet in de
# service-definitie van compose.

[ -f "$ENV_FILE" ] || fail "Configuratiebestand ontbreekt: $ENV_FILE"
command -v docker >/dev/null 2>&1 || fail "Docker ontbreekt."
docker info >/dev/null 2>&1 || fail "Docker-engine is niet bereikbaar voor deze gebruiker."
[ -t 0 ] || fail "Deze setup vraagt om een wachtwoord en heeft een terminal nodig."

PUBLIC_BASE_URL=$(require_value PUBLIC_BASE_URL)
AUTH_SECRET=$(require_value AUTH_SECRET)

note "Eerste eigenaar aanmaken voor $PUBLIC_BASE_URL."
note "De database blijft op het interne netwerk; dit draait in een wegwerpcontainer."
compose run --rm -it \
  -e PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  migrator pnpm setup:owner
