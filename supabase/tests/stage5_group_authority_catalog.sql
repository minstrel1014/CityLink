-- Read-only post-migration catalog checks for
-- 20261114162301_stage5_group_authority_and_succession.sql.
-- Run through the authorized Supabase MCP against CityLink-Stage5-Test only.
-- Expected: every `passed` value is true. This does not create test data.

with function_source as (
  select
    pg_get_functiondef('public.review_group_join_request(uuid,boolean)'::regprocedure) as review_rpc,
    pg_get_functiondef('public.send_group_invitation(uuid,uuid)'::regprocedure) as invitation_rpc,
    pg_get_functiondef('public.request_to_join_group(uuid)'::regprocedure) as request_rpc,
    pg_get_functiondef('private.reconcile_group_leader_after_membership_end(uuid,uuid)'::regprocedure) as succession_helper,
    pg_get_functiondef('private.archive_deleted_profile_citylink_history()'::regprocedure) as profile_delete_trigger
), checks as (
  select
    'join-request review requires current creator and active membership'::text as check_name,
    position('v_creator_id is distinct from v_actor' in review_rpc) > 0
      and position('only the current group leader may review requests' in review_rpc) > 0 as passed
  from function_source
  union all
  select
    'join-request SELECT policy allows requester and current active leader',
    exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'group_join_requests'
        and p.policyname = 'requester and current leader read join requests'
        and position('requester_id' in p.qual) > 0
        and position('creator_id' in p.qual) > 0
        and position('is_active_group_member' in p.qual) > 0
    )
  from function_source
  union all
  select
    'old permissive requester-or-any-member SELECT policy is absent',
    not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'group_join_requests'
        and p.policyname = 'requester and members read join requests'
    )
  from function_source
  union all
  select
    'invitation RPC rejects a pending join request with a clear conflict message after locking',
    position('for update' in invitation_rpc) > 0
      and position('for update' in invitation_rpc) < position('student already has a pending join request for this group' in invitation_rpc)
  from function_source
  union all
  select
    'join-request RPC rejects a pending invitation with a clear conflict message after locking',
    position('for update' in request_rpc) > 0
      and position('for update' in request_rpc) < position('you already have a pending invitation to this group' in request_rpc)
  from function_source
  union all
  select
    'both action-creation RPCs serialize by locking the group row',
    position('for update' in invitation_rpc) > 0
      and position('for update' in request_rpc) > 0
  from function_source
  union all
  select
    'succession ordering is joined_at, then created_at, then membership id',
    position('order by m.joined_at asc, m.created_at asc, m.id asc' in succession_helper) > 0
  from function_source
  union all
  select
    'no-successor path abandons the group and expires pending actions',
    position('status = ''abandoned''' in succession_helper) > 0
      and position('status = ''expired''' in succession_helper) > 0
  from function_source
  union all
  select
    'membership update trigger is installed',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'group_memberships'
        and t.tgname = 'group_memberships_leadership_after_update'
        and not t.tgisinternal
    )
  from function_source
  union all
  select
    'membership delete trigger is installed',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'group_memberships'
        and t.tgname = 'group_memberships_leadership_after_delete'
        and not t.tgisinternal
    )
  from function_source
  union all
  select
    'existing profile-deletion history function invokes succession helper',
    position('private.reconcile_group_leader_after_membership_end' in profile_delete_trigger) > 0
      and position('Deleted User' in profile_delete_trigger) > 0
  from function_source
  union all
  select
    'no opposite pending invitation/request pairs remain',
    not exists (
      select 1
      from public.group_invitations i
      join public.group_join_requests r
        on r.group_id = i.group_id
       and r.requester_id = i.recipient_id
      where i.status = 'pending'
        and r.status = 'pending'
    )
  from function_source
)
select check_name, passed
from checks
order by check_name
limit 20;
