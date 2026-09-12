#!/usr/bin/env bash

set -Eeuo pipefail
source "$(dirname "$0")/backup-lib.sh"

# De root van Caddy's eigen CA, voor een installatie die alleen via een VPN
# bereikbaar is. Zonder deze root op je apparaten toont elke browser een
# waarschuwing; mét is de verbinding gewoon vertrouwd.
#
# Dit is een certificaat en geen sleutel: het mag rondgestuurd worden. De
# bijbehorende privésleutel blijft in de gegevensmap van Caddy en hoort daar.

OUTPUT=${1:-${TMPDIR:-/tmp}/studio-root-ca.crt}
CONTAINER_PATH=/data/caddy/pki/authorities/local/root.crt

[ -f "$ENV_FILE" ] || fail "Configuratiebestand ontbreekt: $ENV_FILE"
TLS_MODE=$(env_value CADDY_TLS || printf '')
[ "$TLS_MODE" = "tls internal" ] ||
  fail "CADDY_TLS staat op '${TLS_MODE:-leeg}'. Er is alleen een eigen CA wanneer CADDY_TLS op 'tls internal' staat."

# Eerst uit de container: dat pad is vast, ongeacht waar de gegevensmap staat.
# Draait Caddy niet, dan valt het terug op de gegevensmap zelf.
if compose ps --status running --quiet caddy 2>/dev/null | grep -q .; then
  compose exec -T caddy cat "$CONTAINER_PATH" >"$OUTPUT" ||
    fail "Caddy draait, maar $CONTAINER_PATH is niet leesbaar. Is CADDY_TLS actief sinds de laatste herstart?"
else
  note "Caddy draait niet; de root wordt uit de gegevensmap gehaald."
  found=$(find "$(data_dir)/caddy" -name root.crt -path '*authorities/local*' -print -quit 2>/dev/null || true)
  [ -n "$found" ] || fail "Geen root.crt gevonden. Start de stack eenmaal met CADDY_TLS op 'tls internal'."
  cp "$found" "$OUTPUT"
fi

command -v openssl >/dev/null 2>&1 || fail "openssl ontbreekt; kan het resultaat niet controleren."
openssl x509 -in "$OUTPUT" -noout -subject -issuer -dates >/dev/null 2>&1 ||
  fail "Het opgehaalde bestand is geen leesbaar certificaat: $OUTPUT"
chmod 644 "$OUTPUT"

printf 'Root-CA weggeschreven naar %s\n' "$OUTPUT"
openssl x509 -in "$OUTPUT" -noout -subject -dates
printf '\nVertrouw hem op deze host:\n'
printf '  sudo cp %s /usr/local/share/ca-certificates/studio-root.crt && sudo update-ca-certificates\n' "$OUTPUT"
printf 'En haal hem naar je eigen machines; zie docs/manuals/installatie-vps.md.\n'
printf 'Let op: deze root zit in de back-up van de gegevensmap. Zet je de installatie elders\n'
printf 'opnieuw op zonder die data, dan ontstaat er een nieuwe CA en moet je opnieuw uitrollen.\n'
