#!/usr/bin/env bash
# Full rehearsal of the option-(b) capacity preflight against a local Supabase-shaped
# PostgreSQL 17 at repository schema state. Nothing here touches any Supabase project.
set -uo pipefail
PGBIN=/usr/lib/postgresql/17/bin
ROOT=/tmp/rehearsal
DATA=$ROOT/data
SOCK=$ROOT/sock
REPO=/home/ubuntu/citylink-recreation/CityLink
OUT=/tmp/rehearsal-out
HEAD=7114b9611294460c59721c04183d099f37ef145c
BLOB_REL=supabase/migrations/20261119090000_group_hard_max.sql
BLOB=/tmp/rehearsal-blob.sql
PSQL="$PGBIN/psql -h $SOCK -U postgres -d postgres -X -q"

sudo rm -rf "$ROOT" "$OUT" /tmp/rehearsal-*.log
mkdir -p "$OUT"
sudo mkdir -p "$DATA" "$SOCK"; sudo chown -R postgres:postgres "$ROOT"; sudo chmod 700 "$DATA"
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; initdb -D $DATA -A trust --no-sync" >/tmp/rehearsal-initdb.log 2>&1 || { echo INITDB_FAILED; exit 8; }
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -o \"-c listen_addresses='' -c unix_socket_directories='$SOCK'\" -w start" >/tmp/rehearsal-start.log 2>&1 || { echo START_FAILED; exit 7; }

echo "=== engine ==="; $PGBIN/psql --version
echo "=== listeners (must be 0) ==="; ss -ltn | grep -c 543 || true

# --- stage 1: Supabase-shaped skeleton, base schema, seed, eight migrations ---
$PSQL -v ON_ERROR_STOP=1 <<'SQL' >/tmp/rehearsal-skeleton.log 2>&1
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
SQL
echo "SKELETON=$?"
$PSQL -v ON_ERROR_STOP=1 -f "$REPO/supabase/schema.sql" >/tmp/rehearsal-base.log 2>&1; echo "BASE=$?"
$PSQL -v ON_ERROR_STOP=1 -f "$REPO/supabase/seed_citylink_fictional_courses.sql" >/tmp/rehearsal-seed.log 2>&1; echo "SEED=$?"
applied=0
for f in $(ls "$REPO"/supabase/migrations/*.sql | sort); do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/tmp/rehearsal-mig-$(basename "$f").log 2>&1 || { echo "MIG_FAILED=$(basename $f)"; break; }
  applied=$((applied+1))
done
echo "MIGRATIONS_APPLIED=$applied"
$PSQL -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';" | sed 's/^/PUBLIC_TABLES=/'

# --- stage 2: run the six preflight pages with markers declared ---
echo "=== stage 2: preflight pages ==="
for p in 00_target_identity_and_engine 01_track_a_capacity_prerequisites 02_track_b_row8_promotion 03_track_c_grant_posture_survey 04_track_d_ledger_identity_capture 05_helper_pinning_record; do
  git -C "$REPO" show "$HEAD:docs/capacity-successor/preflight/$p.sql" > "/tmp/pg-$p.sql"
  $PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=0 \
    -c "set citylink.capacity_run_id='REH-20261123-01'" \
    -c "set citylink.capacity_target_ref='local-rehearsal-pg17'" \
    -c "set citylink.capacity_pages_run='00,01,02,03,04,05'" \
    -c "set citylink.capacity_engine_major='17'" \
    -f "/tmp/pg-$p.sql" > "$OUT/page-$p.txt" 2>&1
  rc=$?
  echo "$p exit=$rc rows=$(grep -cE 'PASS|FAIL|CAPTURE|UNPINNED' "$OUT/page-$p.txt")"
  grep -E "ERROR|FATAL" "$OUT/page-$p.txt" | head -2
done

# --- stage 3: install the draft wrapper and exercise every refusal branch ---
echo "=== stage 3: wrapper branches ==="
git -C "$REPO" show "$HEAD:docs/capacity-successor/preflight/90_apply_gate_wrapper_DRAFT.sql" > /tmp/pg-90.sql
$PSQL -v ON_ERROR_STOP=1 -f /tmp/pg-90.sql >/tmp/rehearsal-wrapper-install.log 2>&1; echo "WRAPPER_INSTALL=$?"
BLOB_SHA=$(git -C "$REPO" show "$HEAD:$BLOB_REL" | sha256sum | cut -d' ' -f1)
BLOB_ID=$(git -C "$REPO" rev-parse "$HEAD:$BLOB_REL"):$BLOB_SHA
echo "BLOB_ID=$BLOB_ID"
gate() {  # $1 label, rest: -c declarations
  local label="$1"; shift
  local out
  out=$($PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=0 "$@" -c "select private.citylink_capacity_apply_gate() as gate;" 2>&1)
  printf '%-14s %s\n' "$label" "$(echo "$out" | grep -oE 'group_capacity_gate_[a-z_]+|gate|[0-9]{5}' | head -3 | tr '\n' ' ')"
  echo "$out" | grep -oE 'ERROR:[^\\n]*' | head -1
}
gate "none"
gate "run-only"      -c "set citylink.capacity_run_id='R1'"
gate "target-main"   -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='pijslbchvstkoweslymr'"
gate "target-local"  -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='local-rehearsal-pg17'"
gate "pages-missing" -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00'"
gate "verdict-fail"  -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00,01,05'" -c "set citylink.capacity_preflight_verdict='FAIL'"
gate "pins-missing"  -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00,01,05'" -c "set citylink.capacity_preflight_verdict='PASS'"
gate "engine-16"     -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00,01,05'" -c "set citylink.capacity_preflight_verdict='PASS'" -c "set citylink.capacity_pinned_digests='P-H1-DIG=aa,P-H2-DIG=bb'" -c "set citylink.capacity_engine_major='16'"
gate "blob-wrong"    -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00,01,05'" -c "set citylink.capacity_preflight_verdict='PASS'" -c "set citylink.capacity_pinned_digests='P-H1-DIG=aa,P-H2-DIG=bb'" -c "set citylink.capacity_engine_major='17'" -c "set citylink.capacity_blob_identity='deadbeef:deadbeef'"
gate "all-declared"  -c "set citylink.capacity_run_id='R1'" -c "set citylink.capacity_target_ref='wkzclgmhrtecnpexfesr'" -c "set citylink.capacity_pages_run='00,01,05'" -c "set citylink.capacity_preflight_verdict='PASS'" -c "set citylink.capacity_pinned_digests='P-H1-DIG=aa,P-H2-DIG=bb'" -c "set citylink.capacity_engine_major='17'" -c "set citylink.capacity_blob_identity='$BLOB_ID'"

# --- stage 4: apply the reviewed blob exactly as reviewed (no --single-transaction) ---
echo "=== stage 4: apply the reviewed blob ==="
git -C "$REPO" show "$HEAD:$BLOB_REL" > "$BLOB"
echo "BLOB_SHA256_LOCAL=$(sha256sum "$BLOB" | cut -d' ' -f1)"
echo "PREFLIGHT_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
$PGBIN/psql -h "$SOCK" -U postgres -d postgres -X -q -v ON_ERROR_STOP=0 -f "$BLOB" > "$OUT/blob-apply.txt" 2>&1
echo "BLOB_APPLY_EXIT=$?"
echo "APPLY_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
grep -cE "ERROR" "$OUT/blob-apply.txt" | sed 's/^/BLOB_ERRORS=/'
grep -E "ERROR" "$OUT/blob-apply.txt" | head -3

# --- stage 5: post-apply catalog verification ---
echo "=== stage 5: post-apply catalog ==="
$PSQL -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='study_groups' and column_name='max_members';" | sed 's/^/MAX_MEMBERS_COLUMN=/'
$PSQL -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%\_capacity';" | sed 's/^/CAPACITY_FUNCS=/'
$PSQL -tAc "select string_agg(p.oid::regprocedure::text, ' | ' order by 1) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_group_and_invite';" | sed 's/^/CREATE_SIGS=/'
echo "--- stub behaviour (expect a fail-closed exception, not a created group) ---"
$PSQL -tAc "select * from public.create_group_and_invite('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, 'probe');" 2>&1 | grep -oE "ERROR:.*|group_capacity_upgrade_required|CityLink needs an update[^\"]*" | head -3
echo "--- tables still present after blob ---"
$PSQL -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';" | sed 's/^/PUBLIC_TABLES_AFTER=/'

# --- teardown ---
echo "=== teardown ==="
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -m fast -w stop" >/tmp/rehearsal-stop.log 2>&1; echo "STOP=$?"
sudo rm -rf "$ROOT" /tmp/rehearsal-*.log /tmp/pg-*.sql "$BLOB"
echo "PROCS=$(pgrep -c postgres || echo 0)"
echo "OUTPUTS_IN=$OUT"; ls -la "$OUT" | tail -8
