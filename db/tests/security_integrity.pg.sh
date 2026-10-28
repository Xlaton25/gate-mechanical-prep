#!/usr/bin/env bash
# Runs security_integrity.test.sql with real pgTAP on a throwaway local PostgreSQL cluster
# after canonical migrations 000001–000005. Synthetic data only; never touches a remote.
# Needs PGTAP_SQL=/path/to/pgtap.sql (built from github.com/theory/pgtap via `make sql/pgtap.sql`)
# when the pgtap extension is not installed; it is then loaded into schema `extensions`.
set -euo pipefail
if [ "$(id -u)" = 0 ]; then exec setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp PATH="$PATH" PGTAP_SQL="${PGTAP_SQL:-}" bash "$(readlink -f "$0")"; fi
DIR=$(mktemp -d /tmp/pgsec.XXXX); HERE="$(cd "$(dirname "$0")" && pwd)"; M="$HERE/../migrations"; PORT=${PGPORT_REHEARSAL:-55440}
initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$DIR"' EXIT
q() { psql -X -q -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres -d postgres "$@"; }
q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;" >/dev/null
for f in 20261027000001_core_schema 20261027000002_security 20261027000003_integrity_hardening 20261028000004_practice_submission 20261028000005_practice_hardening; do q -f "$M/$f.sql" >/dev/null; done
if [ -n "${PGTAP_SQL:-}" ]; then
  PGOPTIONS="-c search_path=extensions" q -f "$PGTAP_SQL" >/dev/null 2>&1
  grant="grant usage on schema extensions to public; grant execute on all functions in schema extensions to public;"
  q -c "$grant" >/dev/null
fi
# Only adaptation: when pgTAP was loaded from SQL (no extension control file), skip the
# `create extension pgtap` line. Every assertion runs unchanged.
T="$HERE/security_integrity.test.sql"
if [ -n "${PGTAP_SQL:-}" ]; then sed '/create extension if not exists pgtap/d' "$T" > "$DIR/t.sql"; T="$DIR/t.sql"; fi
PGOPTIONS="-c search_path=public,extensions" psql -X -At -h "$DIR" -p "$PORT" -U postgres -d postgres -f "$T" 2>&1 | tee "$DIR/out"
! grep -q '^not ok' "$DIR/out" && grep -q '^1\.\.43' "$DIR/out" && [ "$(grep -c '^ok' "$DIR/out")" = 43 ]
