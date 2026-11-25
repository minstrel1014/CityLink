#!/usr/bin/env bash
# Local proof for docs/stage6/KAYK_AI_CHAT_USAGE_RPC_PROPOSAL.sql on PG 17.12.
# Builds a minimal stub of the three objects the function touches, then asserts
# behaviour. Not a substitute for the Launch preflight; this only proves the SQL
# does what its comments claim.
set -uo pipefail
PSQL="psql -X -q -v ON_ERROR_STOP=1 postgresql:///usageprobe?host=/var/run/postgresql&port=5433"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${1:-$HERE/KAYK_AI_CHAT_USAGE_RPC_PROPOSAL.sql}"

psql -X -q "postgresql:///postgres?host=/var/run/postgresql&port=5433" \
  -c "drop database if exists usageprobe" -c "create database usageprobe" || exit 1

$PSQL <<'STUB'
drop schema if exists auth cascade;
drop schema if exists private cascade;
drop table if exists public.group_ai_requests cascade;
drop table if exists public.group_memberships cascade;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid
$$;

create schema private;
create table public.group_memberships (
  group_id uuid not null,
  profile_id uuid not null,
  membership_status text not null
);
create function private.is_active_group_member(p_group_id uuid, p_profile_id uuid)
returns boolean language sql stable as $$
  select p_group_id is not null and p_profile_id is not null and exists (
    select 1 from public.group_memberships m
    where m.group_id = p_group_id and m.profile_id = p_profile_id
      and m.membership_status = 'active'
  );
$$;

create table public.group_ai_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  asked_by uuid not null,
  status text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
STUB

$PSQL -f "$SQL_FILE" || exit 1

run() { $PSQL -tA -c "$1" 2>&1; }

fail=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 = $3"; else echo "FAIL  $1 expected [$2] got [$3]"; fail=1; fi
}

G1=11111111-1111-1111-1111-111111111111
G2=22222222-2222-2222-2222-222222222222
ME=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
OTHER=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

run "insert into public.group_memberships values ('$G1','$ME','active'),('$G2','$ME','active'),('$G1','$OTHER','active'),('$G1','cccccccc-cccc-cccc-cccc-cccccccccccc','former');" >/dev/null

# rows today (UTC): claimed counts; unclaimed queued does not; yesterday does not
run "insert into public.group_ai_requests (group_id,asked_by,status,claimed_at,created_at) values
 ('$G1','$ME','done', now(), now()),
 ('$G1','$ME','failed', now() - interval '3 minutes', now() - interval '3 minutes'),
 ('$G1','$ME','queued', null, now()),
 ('$G1','$ME','done', now() - interval '1 day', date_trunc('day', now(), 'UTC') - interval '1 minute'),
 ('$G2','$ME','done', now(), now()),
 ('$G2','$OTHER','done', now(), now());" >/dev/null

echo '--- 1. member of G1 sees own group counts, per-user count spans groups'
row=$(run "select set_config('test.actor','$ME',false); select group_today||'|'||group_limit||'|'||user_today||'|'||user_limit||'|'||in_flight from public.get_group_ai_usage('$G1');")
check "G1 group_today" 2 "$(echo "$row" | sed -n 2p | cut -d'|' -f1)"
check "G1 group_limit" 20 "$(echo "$row" | sed -n 2p | cut -d'|' -f2)"
check "G1 user_today (G1+G2, excludes queued+yesterday)" 3 "$(echo "$row" | sed -n 2p | cut -d'|' -f3)"
check "G1 user_limit" 10 "$(echo "$row" | sed -n 2p | cut -d'|' -f4)"
check "G1 in_flight (unclaimed queued row is still in flight)" 1 "$(echo "$row" | sed -n 2p | cut -d'|' -f5)"

echo '--- 2. same user in G2 sees G2 numbers, same personal count'
row=$(run "select set_config('test.actor','$ME',false); select group_today||'|'||user_today||'|'||in_flight from public.get_group_ai_usage('$G2');")
check "G2 group_today" 2 "$(echo "$row" | sed -n 2p | cut -d'|' -f1)"
check "G2 user_today" 3 "$(echo "$row" | sed -n 2p | cut -d'|' -f2)"
check "G2 in_flight" 0 "$(echo "$row" | sed -n 2p | cut -d'|' -f3)"

echo '--- 3. retry_after matches the begin_group_ai_request formula'
row=$(run "select set_config('test.actor','$ME',false); select retry_after_seconds from public.get_group_ai_usage('$G1');")
got=$(echo "$row" | sed -n 2p)
expect=$(run "select greatest(1, floor(extract(epoch from ((date_trunc('day', now(), 'UTC') + interval '1 day') - now())))::int);")
delta=$(( got > expect ? got - expect : expect - got ))
if [ "$delta" -le 2 ]; then echo "PASS  retry_after within 2s of formula (got $got, formula $expect)"; else echo "FAIL  retry_after got $got formula $expect"; fail=1; fi

echo '--- 4. non-member is refused and learns nothing'
out=$(run "select set_config('test.actor','$OTHER',false); select count(*) from public.get_group_ai_usage('$G2');")
case "$out" in *"not authorized to read group ai usage"*) echo "PASS  non-member refused";; *) echo "FAIL  non-member got: $out"; fail=1;; esac

echo '--- 5. former member is refused'
out=$(run "select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false); select count(*) from public.get_group_ai_usage('$G1');")
case "$out" in *"not authorized"*) echo "PASS  former member refused";; *) echo "FAIL  former member got: $out"; fail=1;; esac

echo '--- 6. no auth.uid() is refused'
out=$(run "select count(*) from public.get_group_ai_usage('$G1');")
case "$out" in *"not authorized"*) echo "PASS  anonymous refused";; *) echo "FAIL  anonymous got: $out"; fail=1;; esac

echo '--- 7. unknown group is refused with the same error, not a different one'
out=$(run "select set_config('test.actor','$ME',false); select count(*) from public.get_group_ai_usage('99999999-9999-9999-9999-999999999999');")
case "$out" in *"not authorized"*) echo "PASS  unknown group refused identically";; *) echo "FAIL  unknown group got: $out"; fail=1;; esac

echo '--- 8. session timezone does not move the day boundary'
row=$(run "set timezone='Asia/Taipei'; select set_config('test.actor','$ME',false); select group_today||'|'||user_today from public.get_group_ai_usage('$G1');")
check "Taipei session still sees UTC counts" "2|3" "$(echo "$row" | sed -n 2p)"

echo '--- 9. shape: stable, definer, pinned search_path, single result row'
run "select set_config('test.actor','$ME',false);" >/dev/null
check "volatility" "s" "$(run "select provolatile from pg_proc where proname='get_group_ai_usage';")"
check "security definer" "t" "$(run "select prosecdef from pg_proc where proname='get_group_ai_usage';")"
check "search_path pinned" "search_path=\"\"" "$(run "select array_to_string(proconfig,',') from pg_proc where proname='get_group_ai_usage';")"
check "row count" 1 "$(run "select set_config('test.actor','$ME',false); select count(*) from public.get_group_ai_usage('$G1');" | sed -n 2p)"

echo '--- 10. privileges: authenticated only'
check "anon execute" "f" "$(run "select has_function_privilege('anon','public.get_group_ai_usage(uuid)','execute');")"
check "authenticated execute" "t" "$(run "select has_function_privilege('authenticated','public.get_group_ai_usage(uuid)','execute');")"
check "public execute" "f" "$(run "select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname='get_group_ai_usage' and a.grantee=0);")"

echo '--- 11. read-only: function creates no rows'
before=$(run "select count(*) from public.group_ai_requests;")
run "select set_config('test.actor','$ME',false); select * from public.get_group_ai_usage('$G1');" >/dev/null
check "row count unchanged" "$before" "$(run "select count(*) from public.group_ai_requests;")"

echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
