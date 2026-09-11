#!/bin/sh
set -eu

required() {
  eval "value=\${$1:-}"
  if [ -z "$value" ]; then
    printf '%s\n' "PostgreSQL-initialisatie mist $1." >&2
    exit 1
  fi
}
for name in POSTGRES_DB MIGRATION_DATABASE_PASSWORD RUNTIME_DATABASE_PASSWORD AUTH_DATABASE_PASSWORD; do
  required "$name"
done

psql --set ON_ERROR_STOP=1 \
  --set database_name="$POSTGRES_DB" \
  --set migration_password="$MIGRATION_DATABASE_PASSWORD" \
  --set runtime_password="$RUNTIME_DATABASE_PASSWORD" \
  --set auth_password="$AUTH_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE studio_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS PASSWORD :'migration_password';
CREATE ROLE studio_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'runtime_password';
CREATE ROLE studio_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'auth_password';
ALTER DATABASE :"database_name" OWNER TO studio_migrator;
SQL
