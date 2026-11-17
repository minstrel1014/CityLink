-- Read-only catalog checks for the proposed
-- 20261117043100_stage5_course_group_invite_candidates.sql migration.
-- Run only against CityLink-Stage5-Test after explicit lead approval and apply.
-- This query creates no data and does not prove multi-account behavior.
with target_function as (
  select
    p.oid,
    p.prosecdef,
    p.provolatile,
    p.proconfig,
    pg_get_function_result(p.oid) as result_shape,
    pg_get_functiondef(p.oid) as definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'list_course_group_invite_candidates'
    and p.pronargs = 1
), checks as (
  select
    'function exists with one UUID input and profile_id-only output'::text as check_name,
    exists (
      select 1 from target_function
      where result_shape = 'TABLE(profile_id uuid)'
        and position('p_course_id uuid' in definition) > 0
    ) as passed
  union all
  select
    'function is stable SECURITY DEFINER with an empty search_path',
    exists (
      select 1 from target_function
      where prosecdef
        and provolatile = 's'
        and position('SECURITY DEFINER' in definition) > 0
        and position('SET search_path' in definition) > 0
        and proconfig @> ARRAY['search_path=""']::text[]
    )
  union all
  select
    'caller must be enrolled and course must be in the current term',
    exists (
      select 1 from target_function
      where position('caller_enrolment' in definition) > 0
        and position('auth.uid()' in definition) > 0
        and position('current_term_id' in definition) > 0
        and position('peer_enrolment' in definition) > 0
    )
  union all
  select
    'only other open or considering peers are candidates',
    exists (
      select 1 from target_function
      where position('peer.id is distinct from' in definition) > 0
        and position('peer.status' in definition) > 0
        and position('open' in definition) > 0
        and position('considering' in definition) > 0
    )
  union all
  select
    'active course-term group members are excluded',
    exists (
      select 1 from target_function
      where position('group_memberships' in definition) > 0
        and position('membership_status' in definition) > 0
        and position('not exists' in lower(definition)) > 0
    )
  union all
  select
    'only authenticated can execute (not anon)',
    exists (
      select 1 from target_function
      where has_function_privilege('authenticated', oid, 'execute')
        and not has_function_privilege('anon', oid, 'execute')
    )
  union all
  select
    'no group IDs or membership fields appear in the output contract',
    exists (
      select 1 from target_function
      where result_shape = 'TABLE(profile_id uuid)'
        and position('group_id' in lower(result_shape)) = 0
        and position('membership' in lower(result_shape)) = 0
    )
)
select check_name, passed
from checks
order by check_name
limit 20;
