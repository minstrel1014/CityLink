#!/usr/bin/env bash
# Coordinator independent re-check of Role 6's load-bearing claims at PR #51 head bc6a6d5.
# Disposable LOCAL engine only: unix socket, no TCP listener, synthetic objects, no data.
# Never contacts Supabase Test wkzclgmhrtecnpexfesr or Main pijslbchvstkoweslymr.
set -u
PGBIN=/usr/lib/postgresql/17/bin
DATA=/tmp/pgdata-role617check
SOCK=/tmp/citylink-pgsock2
export PATH="$PGBIN:$PATH"

if [ ! -x "$PGBIN/initdb" ]; then echo "PG_BINARIES_MISSING"; exit 9; fi
sudo rm -rf "$DATA"; rm -rf "$SOCK"; mkdir -p "$DATA" "$SOCK"
sudo chown -R postgres:postgres "$DATA" "$SOCK"; sudo chmod 700 "$DATA"; sudo chmod 755 "$SOCK"

echo "=== engine version ==="
"$PGBIN/psql" --version

sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; initdb -D $DATA -A trust --no-sync >/tmp/initdb-role617.log 2>&1" || { echo "INITDB_FAILED"; tail -5 /tmp/initdb-role617.log; exit 8; }
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -o \"-c listen_addresses='' -c unix_socket_directories='$SOCK'\" -w start >/tmp/pgstart-role617.log 2>&1" || { echo "PG_START_FAILED"; tail -5 /tmp/pgstart-role617.log; exit 7; }
echo "TCP_LISTENERS=$(ss -ltnp 2>/dev/null | grep -c postgres)"

PSQL="$PGBIN/psql -h $SOCK -U postgres -d postgres -v ON_ERROR_STOP=0 -X -q"

echo "=== C1 proconfig rendering for SET search_path to '' (Role 6 F7) ==="
$PSQL <<'SQL'
drop function if exists r6_pin_blob_style();
create function r6_pin_blob_style() returns int language sql set search_path to '' as $$ select 1 $$;
select 'rendered=' || coalesce((select string_agg(c, ',' order by c) from unnest(p.proconfig) c), '<none>') as guard_style_text
from pg_proc p where p.proname='r6_pin_blob_style';
select 'guard_rule_says_mismatch=' ||
  case when coalesce((select string_agg(c, ',' order by c) from unnest(p.proconfig) c), '<none>') <> 'search_path='
       then 'YES(false positive on a correctly pinned helper)' else 'no' end
from pg_proc p where p.proname='r6_pin_blob_style';
select 'validated_predicate_a=' ||
  case when exists (select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) c
        where split_part(c,'=',1)='search_path'
          and btrim(replace(split_part(c,'=',2),'"',''),''' ')='')
       then 'passes' else 'fails' end
from pg_proc p where p.proname='r6_pin_blob_style';
SQL

echo "=== C2 hard 'name'::regclass inside to_regclass short-circuit (Role 6 F8) ==="
$PSQL -c "select case when to_regclass('public.courses') is not null and 'public.courses'::regclass is not null then 1 else 0 end;" 2>&1 | head -3
$PSQL -c "select count(*) from pg_constraint where conrelid = 'public.study_groups'::regclass;" 2>&1 | head -3
$PSQL -c "select case when to_regclass('public.courses') is not null and to_regclass('public.courses') is not null then 1 else 0 end as to_regclass_form;" 2>&1 | head -3

echo "=== C3 accumulator forms (Role 6 F5 refinement) ==="
$PSQL -c "do \$\$ declare v text[] := '{}'; begin v := v || 'a, with comma'; raise notice 'ok %', v; end \$\$;" 2>&1 | head -3
$PSQL -c "do \$\$ declare v text[] := '{}'; begin v := v || array['ok-array-cat']; raise notice 'array_cat form %', v; end \$\$;" 2>&1 | head -2
$PSQL -c "do \$\$ declare v text[] := '{}'; begin v := array_append(v, 'ok-append'); raise notice 'append form %', v; end \$\$;" 2>&1 | head -2

echo "=== C4 to_regprocedure semantics (Role 6 F2 refinement) ==="
$PSQL -c "select coalesce(to_regprocedure('public.definitely_absent_fn(uuid)')::text,'NULL-no-abort') as absent_parenthesized;" 2>&1 | head -3
$PSQL -c "select coalesce(to_regprocedure('now')::text,'NULL-no-abort') as bare_name;" 2>&1 | head -3
$PSQL -c "select coalesce(to_regfunction('now')::text,'x') as to_regfunction_exists;" 2>&1 | head -3

echo "=== C5 blob-style begin/commit defeats --single-transaction (Role 6 F10) ==="
cat > /tmp/role617-st.sql <<'SQL'
begin;
create table r6_a (i int);
commit;
create table r6_b (i int);
SQL
$PGBIN/psql -h "$SOCK" -U postgres -d postgres -X --single-transaction -f /tmp/role617-st.sql 2>&1 | head -6
$PSQL -c "select 'survived_a=' || count(*)::text from r6_a;" 2>&1 | head -2
$PSQL -c "select 'survived_b=' || count(*)::text from r6_b;" 2>&1 | head -2

echo "=== C6 main-shaped: language sql wrapper referencing absent column (Role 6 Finding 1 leg) ==="
$PSQL <<'SQL'
drop table if exists r6_groups;
create table r6_groups (id uuid primary key);
drop function if exists r6_sql_wrap(uuid);
create function r6_sql_wrap(p_id uuid) returns table (subject text) language sql as
$$ select g.subject from r6_groups g where g.id = p_id $$;
SQL
$PSQL <<'SQL'
drop function if exists r6_plpgsql_wrap(uuid);
create function r6_plpgsql_wrap(p_id uuid) returns text language plpgsql as
$$ declare r text; begin select g.subject into r from r6_groups g where g.id = p_id; return r; end $$;
select 'plpgsql_created_ok' as status;
SQL
$PSQL -c "select r6_plpgsql_wrap('00000000-0000-0000-0000-000000000000'::uuid);" 2>&1 | head -3

echo "=== cleanup ==="
sudo -u postgres bash -c "export PATH=$PGBIN:\$PATH; pg_ctl -D $DATA -m fast stop" >/tmp/pgstop-role617.log 2>&1; echo "STOP_EXIT=$?"
sudo rm -rf "$DATA" /tmp/role617-st.sql /tmp/initdb-role617.log /tmp/pgstart-role617.log /tmp/pgstop-role617.log
echo "REMAINING_POSTGRES_PROCESSES=$(pgrep -fc "postgres -D" 2>/dev/null || echo 0)"
echo "SOCKDIR_GONE=$([ -d "$SOCK" ] && echo no || echo yes)"
