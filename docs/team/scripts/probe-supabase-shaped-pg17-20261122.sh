#!/usr/bin/env bash
# Bounded feasibility probe: can the 8 checked-in CityLink migrations be applied to a
# plain PostgreSQL 17 shaped like Supabase (auth schema, anon/authenticated/service_role,
# auth.uid()/auth.role()/auth.jwt()), without Docker and without any Supabase project?
# Read-only with respect to every real project: it only creates a throwaway cluster in /tmp.
set -uo pipefail
PGBIN=/usr/lib/postgresql/17/bin
ROOT=/tmp/sbshape
DATA=$ROOT/data
SOCK=$ROOT/sock
REPO=/home/ubuntu/citylink-recreation/CityLink
OUT=/tmp/sbshape-apply.log

sudo rm -rf "$ROOT"; sudo mkdir -p "$DATA" "$SOCK"
sudo chown -R postgres:postgres "$ROOT"; sudo chmod 700 "$DATA"
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; initdb -D $DATA -A trust --no-sync" >/tmp/sbshape-initdb.log 2>&1 || { echo "INITDB_FAILED"; tail -3 /tmp/sbshape-initdb.log; exit 8; }
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -o \"-c listen_addresses='' -c unix_socket_directories='$SOCK'\" -w start" >/tmp/sbshape-start.log 2>&1 || { echo "START_FAILED"; tail -3 /tmp/sbshape-start.log; exit 7; }
PSQL="$PGBIN/psql -h $SOCK -U postgres -d postgres -X -q -v ON_ERROR_STOP=1"

echo "=== engine ==="; $PGBIN/psql --version
echo "=== listeners (must be 0) ==="; ss -ltn | grep -c 543 || true

echo "=== step 1: create the Supabase-shaped skeleton ==="
$PSQL <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
SQL
echo "SKELETON_EXIT=$?"

echo "=== step 1b: apply the checked-in base schema (supabase/schema.sql) ==="
$PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/schema.sql" >/tmp/sbshape-schema.log 2>&1
echo "BASE_SCHEMA_EXIT=$?"
if [ $? -ne 0 ]; then grep -nE "ERROR" /tmp/sbshape-schema.log | head -5; fi

echo "=== step 1c: apply the checked-in fictional course seed ==="
$PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f "$REPO/supabase/seed_citylink_fictional_courses.sql" >/tmp/sbshape-seed.log 2>&1
echo "SEED_EXIT=$?"
grep -nE "ERROR" /tmp/sbshape-seed.log | head -3
$PSQL -c "select count(*) as courses from public.courses;" 2>&1 | head -4

echo "=== step 2: apply the eight checked-in migrations in filename order ==="
: > "$OUT"
i=0
for f in $(ls "$REPO"/supabase/migrations/*.sql | sort); do
  i=$((i+1))
  name=$(basename "$f")
  echo "--- [$i] $name" | tee -a "$OUT"
  $PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f "$f" >>"$OUT" 2>&1
  rc=$?
  echo "    exit=$rc" | tee -a "$OUT"
  if [ $rc -ne 0 ]; then
    echo "FIRST_FAILURE=$name"
    echo "--- first error lines ---"
    grep -nE "ERROR|FATAL" "$OUT" | head -5
    break
  fi
done
echo "APPLIED_COUNT=$(grep -c 'exit=0' "$OUT")"

echo "=== step 3: does the resulting schema look like CityLink? ==="
$PSQL -c "select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_group_and_invite','request_to_join_group','list_group_recruitment_posts') order by 1 limit 10;" 2>&1 | head -12
$PSQL -c "select count(*) as public_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';" 2>&1 | head -4

echo "=== cleanup ==="
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -m fast -w stop" >/tmp/sbshape-stop.log 2>&1; echo "STOP=$?"
sudo rm -rf "$ROOT" /tmp/sbshape-*.log
echo "PROCS=$(pgrep -c postgres || echo 0)"
