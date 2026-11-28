-- CityLink — CityU signup hook preflight
-- READ-ONLY. SELECT only, no DDL, no temp tables, no writes.
-- Run immediately before the apply, in the same session, with:
--   set citylink.target_ref = 'pijslbchvstkoweslymr';
-- Never run against the frozen Prototype (wkzclgmhrtecnpexfesr).
--
-- Revision 3 answers Role 6 BLK-1, BLK-3, BLK-4 and NB-8. It prints three sections and
-- cannot abort on a target that lacks the hook:
--   1. identity evidence (the values that actually differ between projects)
--   2. a checks table, every row guarded so absent objects report '<absent>'
--   3. predicate probes inside a PL/pgSQL block, because a bare reference to
--      private.is_cityu_signup_email() fails at PARSE time when the schema is absent —
--      the same failure class as BLK-1, found again in rehearsal of revision 2.

-- ===========================================================================
-- Section 1 — identity evidence. Confirm before reading on:
--   system_identifier = 7692131729119822239  (Launch, measured at gate 4)
-- If this section errors, that is a stop: record the error, do not proceed.
-- ===========================================================================
select 'I-01 system identifier' as item,
       (select system_identifier::text from pg_control_system()) as observed,
       '7692131729119822239 = CityLink Launch' as expected
union all
select 'I-02 applying role',
       current_user || ' (session_user ' || session_user || ')',
       'record it; the definer owner depends on who applies'
union all
select 'I-03 database / server address',
       current_database() || ' @ ' || coalesce(inet_server_addr()::text, 'local socket'),
       'both projects report database `postgres`; the address is the useful part'
union all
select 'I-04 marker/target relations present',
       coalesce((select string_agg(n.nspname || '.' || c.relname, ', ' order by 1)
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r', 'v', 'm')
                   and (c.relname ilike '%marker%' or c.relname ilike '%target%')),
                '<none>'),
       'if gate 4 used a marker row, it must appear here with its recorded value';

-- ===========================================================================
-- Section 2 — checks. Guarded: absent objects report '<absent>', never abort.
-- ===========================================================================
with checks as (

  select 1 as ord, 'H-01 engine version' as check_name,
         current_setting('server_version') as observed,
         '17.x expected for Launch' as expectation

  union all
  select 2, 'H-02 declared target ref',
         coalesce(current_setting('citylink.target_ref', true), '<not set>'),
         'pijslbchvstkoweslymr'

  union all
  select 3, 'H-03 applying role may create in public',
         has_schema_privilege(current_user, 'public', 'CREATE')::text,
         'true required to create the hook function'

  union all
  select 4, 'H-04 applying role may create in private',
         case when to_regnamespace('private') is null then '<schema absent>'
              else has_schema_privilege(current_user, 'private', 'CREATE')::text end,
         'true if the predicate is created or replaced here'

  union all
  select 5, 'H-05 private schema owner',
         coalesce((select pg_get_userbyid(n.nspowner) from pg_namespace n where n.nspname = 'private'), '<absent>'),
         'record it; the owner must be able to replace the predicate'

  union all
  select 6, 'H-06 hook function present',
         coalesce((select p.prosecdef::text || ' / owner=' || pg_get_userbyid(p.proowner)
                   from pg_proc p where p.oid = to_regprocedure('public.hook_cityu_signup(jsonb)')), '<absent>'),
         '<absent> on first apply; secdef=true and a recorded owner afterwards'

  -- BLK-1: has_function_privilege() RAISES 42883 when the function is absent, so the
  -- text signature must never be evaluated on a target that has not applied this file.
  union all
  select 7, 'H-07 supabase_auth_admin can execute the hook',
         case when to_regprocedure('public.hook_cityu_signup(jsonb)') is null then '<absent>'
              when not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then '<role absent>'
              else has_function_privilege('supabase_auth_admin', 'public.hook_cityu_signup(jsonb)', 'EXECUTE')::text end,
         'true after the apply'

  union all
  select 8, 'H-08 browser roles cannot execute the hook',
         case when to_regprocedure('public.hook_cityu_signup(jsonb)') is null then '<absent>'
              else coalesce((select bool_and(not has_function_privilege(r.rolname, 'public.hook_cityu_signup(jsonb)', 'EXECUTE'))::text
                             from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')), '<roles absent>') end,
         'true after the apply; <absent> before it'

  union all
  select 9, 'H-09 browser roles cannot execute the predicate',
         case when to_regprocedure('private.is_cityu_signup_email(text)') is null then '<absent>'
              else coalesce((select bool_and(not has_function_privilege(r.rolname, 'private.is_cityu_signup_email(text)', 'EXECUTE'))::text
                             from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')), '<roles absent>') end,
         'true after the apply; <absent> before it'

  -- BLK-4: the documented hook pattern requires supabase_auth_admin to have USAGE on the
  -- schema holding the hook. If this is false, activation makes EVERY signup fail.
  union all
  select 10, 'H-10 supabase_auth_admin has USAGE on public',
         case when not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then '<role absent>'
              else has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')::text end,
         'true; false is a stop, and granting it is a separate decision'

  -- BLK-2: a pre-existing table would have skipped CREATE TABLE entirely.
  union all
  select 11, 'H-11 allowlist table and its four constraints',
         case when to_regclass('private.signup_email_allowlist') is null then '<absent>'
              else (select 'present / validated: '
                           || coalesce(string_agg(pc.conname, ', ' order by pc.conname), '<none>')
                   from pg_constraint pc
                    where pc.conrelid = to_regclass('private.signup_email_allowlist')
                      and pc.conname in ('signup_email_allowlist_email_normalised',
                                         'signup_email_allowlist_email_shape',
                                         'signup_email_allowlist_expiry_ceiling',
                                         'signup_email_allowlist_expiry_after_creation')
                      and pc.convalidated) end,
         '<absent> before the apply; all four validated afterwards'

  union all
  select 12, 'H-12 allowlist row-level security',
         case when to_regclass('private.signup_email_allowlist') is null then '<absent>'
              else (select c.relrowsecurity::text from pg_class c
                    where c.oid = to_regclass('private.signup_email_allowlist')) end,
         'record only; false is the intended, documented state'

  -- NB-8: the definer owner is the effective reader of the allowlist.
  union all
  select 13, 'H-13 hook definer owner can select the allowlist',
         case when to_regprocedure('public.hook_cityu_signup(jsonb)') is null then '<absent>'
              when to_regclass('private.signup_email_allowlist') is null then '<table absent>'
              else has_table_privilege(
                     pg_get_userbyid((select p.proowner from pg_proc p
                                      where p.oid = to_regprocedure('public.hook_cityu_signup(jsonb)'))),
                     'private.signup_email_allowlist', 'SELECT')::text end,
         'true; false means allowlisted accounts are silently rejected'

  -- NB-4: enumerate grantees instead of naming the roles we thought of.
  union all
  select 14, 'H-14 hook EXECUTE grantees (census)',
         case when to_regprocedure('public.hook_cityu_signup(jsonb)') is null then '<absent>'
              else coalesce((select string_agg(x.grantee_name, ', ' order by x.grantee_name)
                             from pg_proc p
                             cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             cross join lateral (select case when a.grantee = 0 then 'PUBLIC'
                                                             else pg_get_userbyid(a.grantee) end) as x(grantee_name)
                             where p.oid = to_regprocedure('public.hook_cityu_signup(jsonb)')
                               and a.privilege_type = 'EXECUTE'
                               and a.grantee <> p.proowner), '<none>') end,
         'supabase_auth_admin only'

  -- Two distinct tokens on purpose: "ready to apply" is not "verified after apply".
  -- A single token that reads green on an empty target is exactly the false green
  -- Role 6 warned about.
  union all
  select 15, 'H-15 verdict',
         case
           when current_setting('citylink.target_ref', true) is distinct from 'pijslbchvstkoweslymr'
             then 'citylink_cityu_hook_preflight_unsatisfied target='
                  || coalesce(current_setting('citylink.target_ref', true), '<not set>')
           when not has_schema_privilege(current_user, 'public', 'CREATE')
             then 'citylink_cityu_hook_preflight_unsatisfied reason=no_create_on_public'
           when not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin')
             then 'citylink_cityu_hook_preflight_unsatisfied reason=auth_admin_role_absent'
           when not has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')
             then 'citylink_cityu_hook_preflight_unsatisfied reason=auth_admin_lacks_usage_on_public'
           when to_regprocedure('public.hook_cityu_signup(jsonb)') is null
             then 'citylink_cityu_hook_preflight_ready target=pijslbchvstkoweslymr'
           -- NF-2 patch: the verdict must fail on any grantee outside the owner and supabase_auth_admin,
           -- not just on PUBLIC, so H-14 and H-15 can no longer disagree.
           when exists (select 1
                        from pg_proc p
                        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        cross join lateral (select case when a.grantee = 0 then 'PUBLIC'
                                                        else pg_get_userbyid(a.grantee) end) as x(grantee_name)
                        where p.oid = to_regprocedure('public.hook_cityu_signup(jsonb)')
                          and a.privilege_type = 'EXECUTE'
                          and a.grantee <> p.proowner
                          and x.grantee_name <> 'supabase_auth_admin')
             then 'citylink_cityu_hook_verify_unsatisfied reason=unexpected_execute_grantee'
           when has_function_privilege('supabase_auth_admin', 'public.hook_cityu_signup(jsonb)', 'EXECUTE')
                and not has_function_privilege('anon', 'public.hook_cityu_signup(jsonb)', 'EXECUTE')
                and not has_function_privilege('authenticated', 'public.hook_cityu_signup(jsonb)', 'EXECUTE')
                and to_regclass('private.signup_email_allowlist') is not null
             then 'citylink_cityu_hook_verify_satisfied target=pijslbchvstkoweslymr'
           else 'citylink_cityu_hook_verify_unsatisfied target=pijslbchvstkoweslymr'
         end,
         'ready = apply next; verify_satisfied = objects correct after apply; only after I-01 matches'
)
select ord, check_name, observed, expectation
from checks
order by ord;

-- ===========================================================================
-- Section 3 — predicate probes. PL/pgSQL resolves these names at execution, so the
-- block reports '<absent>' instead of aborting when the schema or function is missing.
-- ===========================================================================
do $probe$
declare
  v_bad  text := '<absent>';
  v_good text := '<absent>';
  v_nl   text := '<absent>';
begin
  begin
    v_bad  := private.is_cityu_signup_email('probe@gmail.com')::text;
    v_good := private.is_cityu_signup_email('probe@my.cityu.edu.hk')::text;
    -- NB-1 probe, on the retracted finding: PostgreSQL does not treat a trailing newline
    -- specially, and the predicate strips spaces only, so this must be FALSE. It is the
    -- case Role 6 first flagged as accepted, then retracted; the probe is the record.
    v_nl   := private.is_cityu_signup_email('probe@my.cityu.edu.hk' || E'\n')::text;
  exception
    when others then
      -- Never abort the preflight, but never hide the reason either.
      raise notice 'P-00 predicate probes could not run: % (%)', sqlerrm, sqlstate;
  end;

  raise notice 'P-01 predicate rejects a known-bad address: % (expected false)', v_bad;
  raise notice 'P-02 predicate accepts a known-good address: % (expected true)', v_good;
  raise notice 'P-03 predicate rejects a trailing newline: % (expected false)', v_nl;
end
$probe$;
