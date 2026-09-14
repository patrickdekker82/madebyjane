#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}
MIN_DISK_KIB=$((100 * 1024 * 1024))

fail() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }
warn() { printf 'LET OP: %s\n' "$*" >&2; }
env_value() {
  [ -f "$ENV_FILE" ] || return 1
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}
is_secret() { [[ "$1" =~ ^[A-Za-z0-9_-]{32,}$ ]] && [[ "$1" != VERVANG_DOOR_* ]]; }
need_secret() {
  local value
  value=$(env_value "$1" || true)
  is_secret "$value" || fail "$1 ontbreekt, is een placeholder, of bevat onveilige tekens."
}
publish_address() { case "$1" in *:*) printf '%s' "${1%:*}" ;; *) printf '' ;; esac; }
publish_port() { printf '%s' "${1##*:}"; }
address_is_local() {
  command -v ip >/dev/null 2>&1 || { warn "Het commando ip ontbreekt; adres $1 is niet gecontroleerd."; return 0; }
  ip -4 -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -qx "$1"
}
# Bij een upgrade draait de eigen stack nog; dan houdt Caddy poort 80 en 443
# vast en is "bezet" geen belemmering maar de verwachte toestand.
caddy_is_running() {
  docker compose --env-file "$ENV_FILE" -f "$ROOT/compose.production.yaml" \
    ps --status running --quiet caddy 2>/dev/null | grep -q .
}
check_tls_mode() {
  case "$1" in
    "") printf 'Certificaatroute: automatisch, publiek vertrouwd.\n' ;;
    "tls internal") printf 'Certificaatroute: eigen CA van Caddy; rol de root uit met scripts/export-ca.sh.\n' ;;
    "tls "*)
      case "$1" in
        *[\{\}\$]*) fail "CADDY_TLS mag geen { } of \$ bevatten; Caddy leest die als plaatsvervanger." ;;
      esac
      warn "CADDY_TLS verwijst naar eigen certificaatbestanden. Die moeten ook in de Caddy-container staan; de preflight controleert alleen de vorm."
      ;;
    *) fail "CADDY_TLS moet leeg zijn, 'tls internal', of een tls-regel met certificaatpaden." ;;
  esac
}
# Een privaat adres en een publiek vertrouwd certificaat sluiten elkaar uit: de
# uitgever moet de host van buiten kunnen bereiken. Omgekeerd is een eigen CA op
# een publiek adres een certificaat dat geen bezoeker kent. Beide zijn een
# waarschuwing en geen blokkade: de host kan legitiem anders bereikbaar zijn dan
# de naam suggereert.
warn_tls_dns_mismatch() {
  local site=$1 resolved=$2 tls=$3
  case "$resolved" in
    10.*|127.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*)
      [ -n "$tls" ] ||
        warn "$site resolveert naar het private adres $resolved terwijl CADDY_TLS leeg is; een publiek vertrouwd certificaat kan zo niet worden uitgegeven. Zet CADDY_TLS op 'tls internal' voor een installatie achter een VPN."
      ;;
    *)
      [ "$tls" != "tls internal" ] ||
        warn "$site resolveert naar het publieke adres $resolved terwijl CADDY_TLS op 'tls internal' staat; bezoekers krijgen dan een certificaat dat hun browser niet kent."
      ;;
  esac
}
check_publish() {
  local label=$1 value=$2 address port
  address=$(publish_address "$value")
  port=$(publish_port "$value")
  case "$value" in
    *:*) [ -n "$address" ] || fail "$label mist een adres voor de dubbele punt; gebruik poort of adres:poort." ;;
  esac
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] ||
    fail "$label moet een poortnummer zijn, eventueel als adres:poort (uitsluitend IPv4)."
  if [ -n "$address" ]; then
    [[ "$address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "$label bevat geen geldig IPv4-adres: $address."
    address_is_local "$address" ||
      fail "$label publiceert op $address, maar dat adres is niet actief op deze host. Staat de VPN-interface aan?"
    printf 'Publicatie %s: uitsluitend op %s, poort %s.\n' "$label" "$address" "$port"
  else
    printf 'Publicatie %s: op alle interfaces, poort %s.\n' "$label" "$port"
  fi
  if [ "$CADDY_RUNNING" -eq 1 ]; then
    printf 'Poort %s is in gebruik door de eigen Caddy-container; bij een upgrade is dat verwacht.\n' "$port"
  else
    port_free "$port" || fail "$label: poort $port is al in gebruik."
  fi
}
port_free() {
  if command -v ss >/dev/null 2>&1; then
    ! ss -ltnH "sport = :$1" | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    warn "Geen ss of lsof; poort $1 is niet lokaal gecontroleerd."
  fi
}

printf 'Preflight voor %s\n' "$ROOT"
printf 'Configuratiebestand: %s\n' "$ENV_FILE"
printf 'Versie: %s\n' "$(git -C "$ROOT" describe --always --dirty 2>/dev/null || printf onbekend)"

[ "$(uname -s)" = Linux ] || fail "Deze productie-opzet ondersteunt alleen Linux hosts."
case "$(uname -m)" in x86_64|aarch64) ;; *) fail "Niet-ondersteunde architectuur: $(uname -m)" ;; esac
if [ -r /etc/os-release ]; then
  . /etc/os-release
  [ "${ID:-}" = debian ] || warn "Getest doel is Debian 13; gevonden: ${PRETTY_NAME:-onbekend}."
  [ "${VERSION_ID:-}" = 13 ] || warn "Debian 13/Hyper-V is nog niet in deze omgeving gevalideerd."
fi

command -v docker >/dev/null 2>&1 || fail "Docker ontbreekt. Installeer Docker via de gedocumenteerde distributieroute."
docker info >/dev/null 2>&1 || fail "Docker-engine is niet bereikbaar voor deze gebruiker."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ontbreekt."
[ -f "$ENV_FILE" ] || fail "Maak eerst $ENV_FILE op basis van .env.example."

DATA_DIR=$(env_value STUDIO_DATA_DIR || true)
[ -n "$DATA_DIR" ] || fail "STUDIO_DATA_DIR ontbreekt."
mkdir -p "$DATA_DIR" || fail "Kan STUDIO_DATA_DIR niet aanmaken: $DATA_DIR"
touch "$DATA_DIR/.write-check" || fail "STUDIO_DATA_DIR is niet beschrijfbaar: $DATA_DIR"
rm -f "$DATA_DIR/.write-check"
available=$(df -Pk "$DATA_DIR" | awk 'NR == 2 {print $4}')
[ "${available:-0}" -ge "$MIN_DISK_KIB" ] || fail "Minder dan 100 GiB vrije lokale schijfruimte in $DATA_DIR."

CADDY_RUNNING=0
if caddy_is_running; then CADDY_RUNNING=1; fi
check_publish HTTP_PORT "$(env_value HTTP_PORT || printf 80)"
check_publish HTTPS_PORT "$(env_value HTTPS_PORT || printf 443)"

CADDY_TLS_VALUE=$(env_value CADDY_TLS || printf '')
check_tls_mode "$CADDY_TLS_VALUE"

SITE=$(env_value CADDY_SITE_ADDRESS || true)
PUBLIC_URL=$(env_value PUBLIC_BASE_URL || true)
[ -n "$SITE" ] && [ -n "$PUBLIC_URL" ] || fail "CADDY_SITE_ADDRESS of PUBLIC_BASE_URL ontbreekt."
[ "$PUBLIC_URL" = "https://$SITE" ] || fail "PUBLIC_BASE_URL moet exact https://CADDY_SITE_ADDRESS zijn."
if command -v getent >/dev/null 2>&1; then
  RESOLVED=$(getent ahosts "$SITE" | awk 'NR == 1 {print $1}' || true)
  [ -n "$RESOLVED" ] || fail "DNS voor $SITE resolveert niet vanaf deze host."
  printf 'DNS: %s resolveert naar %s.\n' "$SITE" "$RESOLVED"
  warn_tls_dns_mismatch "$SITE" "$RESOLVED" "$CADDY_TLS_VALUE"
else
  warn "getent ontbreekt; DNS voor $SITE is niet gecontroleerd."
fi
if command -v timedatectl >/dev/null 2>&1; then
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)" = yes ] || warn "Klok is niet als NTP-gesynchroniseerd bevestigd."
else
  warn "timedatectl ontbreekt; klokstatus is niet gecontroleerd."
fi

for key in POSTGRES_PASSWORD MIGRATION_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD AUTH_SECRET; do
  need_secret "$key"
done
printf 'Gereed: Docker, configuratie, opslag, poorten, DNS en secrets zijn gecontroleerd.\n'
