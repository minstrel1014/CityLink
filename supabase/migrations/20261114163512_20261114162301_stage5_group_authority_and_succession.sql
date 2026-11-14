-- CityLink Stage 5 correction: request authority, opposite-pending-action
-- conflicts, and current-leader succession.
--
-- Scope: apply only to CityLink-Stage5-Test (ref wkzclgmhrtecnpexfesr) after
-- review. This is forward-only; it does not reset, delete, or roll back Test.
-- No group size/capacity limit is added.

-- Do not silently choose a winner for legacy rows if both opposite actions are
-- already pending. The lead's rule is first-pending-action-wins, but a migration
-- cannot safely infer which legacy record should remain without inspecting it.
do $preflight$
begin
  if exists (
    select 1
    from public.group_invitations as i
    join public.group_join_requests as r
      on r.group_id = i.group_id
     and r.requester_id = i.recipient_id
    where i.status = 'pending'
      and r.status = 'pending'
    limit 1
  ) then
    raise exception
      'cannot apply Stage 5 first-action-wins rules: resolve existing pending invitation/request conflicts with the project lead first';
  end if;
end;
$preflight$;

-- Reconcile the group's current leader after a membership ends. The helper is
-- SECURITY DEFINER because client roles have read-only access to group tables;
-- only trusted RPC/trigger paths may perform these coordinated updates.
create or replace function private.reconcile_group_leader_after_membership_end(
  p_group_id uuid,
  p_ended_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_creator_id uuid;
  v_group_status text;
  v_successor_id uuid;
begin
  select g.creator_id, g.status
    into v_creator_id, v_group_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;

  if not found then
    return;
  end if;

  -- Terminal groups stay terminal. Clear the leader reference only if that
  -- leader has actually departed or is no longer an active member.
  if v_group_status in ('abandoned', 'archived') then
    if v_creator_id is not null
       and (v_creator_id is not distinct from p_ended_profile_id
            or not private.is_active_group_member(p_group_id, v_creator_id)) then
      update public.study_groups
      set creator_id = null,
          updated_at = clock_timestamp()
      where id = p_group_id;
    end if;
    return;
  end if;

  if v_group_status not in ('forming', 'active') then
    return;
  end if;

  -- `created_at` and `id` make the explicitly approved fallback deterministic;
  -- PostgreSQL does not guarantee an implicit/natural row order.
  select m.profile_id
    into v_successor_id
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.membership_status = 'active'
    and m.profile_id is not null
    and m.profile_id is distinct from p_ended_profile_id
  order by m.joined_at asc, m.created_at asc, m.id asc
  limit 1;

  if v_successor_id is null then
    -- No active member remains: dismiss the group and make pending actions
    -- terminal in the same transaction as the membership end.
    update public.study_groups
    set creator_id = null,
        status = 'abandoned',
        updated_at = clock_timestamp()
    where id = p_group_id;

    update public.group_invitations
    set status = 'expired',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where group_id = p_group_id
      and status = 'pending';

    update public.group_join_requests
    set status = 'expired',
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where group_id = p_group_id
      and status = 'pending';

    return;
  end if;

  -- Keep the current leader if still active. Otherwise transfer to the earliest
  -- remaining active member using the order approved by the project lead.
  if v_creator_id is null
     or v_creator_id is not distinct from p_ended_profile_id
     or not private.is_active_group_member(p_group_id, v_creator_id) then
    update public.study_groups
    set creator_id = v_successor_id,
        updated_at = clock_timestamp()
    where id = p_group_id;
  end if;
end;
$function$;

revoke all on function private.reconcile_group_leader_after_membership_end(uuid, uuid)
  from public, anon, authenticated;

-- Any trusted membership status transition or row deletion invokes the same
-- reconciliation logic. Profile deletion is also covered by the existing
-- BEFORE DELETE history trigger, whose function is extended below.
create or replace function private.handle_group_membership_end()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.membership_status = 'active'
       and (new.membership_status is distinct from 'active'
            or new.profile_id is distinct from old.profile_id) then
      perform private.reconcile_group_leader_after_membership_end(
        old.group_id,
        old.profile_id
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.membership_status = 'active' then
    perform private.reconcile_group_leader_after_membership_end(
      old.group_id,
      old.profile_id
    );
  end if;
  return old;
end;
$function$;

revoke all on function private.handle_group_membership_end()
  from public, anon, authenticated;

drop trigger if exists group_memberships_leadership_after_update
  on public.group_memberships;
create trigger group_memberships_leadership_after_update
  after update of membership_status, profile_id on public.group_memberships
  for each row execute function private.handle_group_membership_end();

drop trigger if exists group_memberships_leadership_after_delete
  on public.group_memberships;
create trigger group_memberships_leadership_after_delete
  after delete on public.group_memberships
  for each row execute function private.handle_group_membership_end();

-- Extend, rather than replace or duplicate, the existing profile-history trigger:
-- it still anonymizes memberships and cancels actions involving the deleted
-- profile, and now lets the membership trigger transfer/dismiss groups first.
create or replace function private.archive_deleted_profile_citylink_history()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_group_id uuid;
begin
  update public.group_memberships
  set profile_id = null,
      display_name_snapshot = 'Deleted User',
      membership_status = case when membership_status = 'active'
        then 'account_deleted' else membership_status end,
      ended_at = case when membership_status = 'active'
        then clock_timestamp() else ended_at end
  where profile_id = old.id;

  -- Handles creator-owned forming groups without a membership row too, as well
  -- as any remaining creator references after membership reconciliation.
  for v_group_id in
    select g.id
    from public.study_groups as g
    where g.creator_id = old.id
      and g.status in ('forming', 'active')
    order by g.id
  loop
    perform private.reconcile_group_leader_after_membership_end(v_group_id, old.id);
  end loop;

  update public.group_invitations
  set sender_id = case when sender_id = old.id then null else sender_id end,
      recipient_id = case when recipient_id = old.id then null else recipient_id end,
      sender_name_snapshot = case when sender_id = old.id then 'Deleted User' else sender_name_snapshot end,
      recipient_name_snapshot = case when recipient_id = old.id then 'Deleted User' else recipient_name_snapshot end,
      status = case when status = 'pending' and (sender_id = old.id or recipient_id = old.id)
        then 'cancelled' else status end,
      cancelled_at = case when status = 'pending' and (sender_id = old.id or recipient_id = old.id)
        then clock_timestamp() else cancelled_at end,
      updated_at = case when sender_id = old.id or recipient_id = old.id
        then clock_timestamp() else updated_at end
  where sender_id = old.id or recipient_id = old.id;

  update public.group_join_requests
  set requester_id = case when requester_id = old.id then null else requester_id end,
      requester_name_snapshot = case when requester_id = old.id then 'Deleted User' else requester_name_snapshot end,
      reviewed_by = case when reviewed_by = old.id then null else reviewed_by end,
      status = case when status = 'pending' and requester_id = old.id
        then 'cancelled' else status end,
      cancelled_at = case when status = 'pending' and requester_id = old.id
        then clock_timestamp() else cancelled_at end,
      reviewed_at = case when status = 'pending' and requester_id = old.id
        then clock_timestamp() else reviewed_at end,
      updated_at = case when requester_id = old.id or reviewed_by = old.id
        then clock_timestamp() else updated_at end
  where requester_id = old.id or reviewed_by = old.id;

  return old;
end;
$function$;

revoke all on function private.archive_deleted_profile_citylink_history()
  from public, anon, authenticated;

-- Atomic against send_group_invitation: both RPCs lock the same group row
-- before checking for the opposing pending action.
create or replace function public.send_group_invitation(
  p_group_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_group_status text;
  v_invitation uuid;
  v_sender_name text;
  v_recipient_name text;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;
  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups g where g.id = p_group_id;
  if v_course is null then raise exception 'group not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_actor, p_recipient_id);

  select g.course_id, g.term_id, g.status into v_course, v_term, v_group_status
  from public.study_groups g where g.id = p_group_id for update;
  if not found then raise exception 'group not found'; end if;
  if not private.is_current_term(v_term) or v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if not (
    private.is_active_group_member(p_group_id, v_actor)
    or (v_group_status = 'forming' and exists (
      select 1 from public.study_groups g where g.id = p_group_id and g.creator_id = v_actor
    ))
  ) then raise exception 'only a group member or forming-group creator can invite'; end if;
  if not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(p_recipient_id, v_course) then
    raise exception 'both students must be enrolled in the course';
  end if;

  if exists (
    select 1 from public.group_join_requests r
    where r.group_id = p_group_id
      and r.requester_id = p_recipient_id
      and r.status = 'pending'
  ) then
    raise exception
      'student already has a pending join request for this group; review that request instead of sending an invitation';
  end if;

  select p.display_name into v_sender_name from public.profiles p where p.id = v_actor;
  select p.display_name into v_recipient_name from public.profiles p
    where p.id = p_recipient_id and p.status in ('open', 'considering');
  if v_recipient_name is null then raise exception 'recipient is not accepting invitations'; end if;
  if private.is_active_group_member(p_group_id, p_recipient_id) then
    raise exception 'recipient already belongs to this group';
  end if;
  if exists (
    select 1 from public.group_memberships m where m.profile_id = p_recipient_id
      and m.course_id = v_course and m.term_id = v_term and m.membership_status = 'active'
  ) then raise exception 'recipient already belongs to a group for this course and term'; end if;
  if exists (
    select 1 from public.group_memberships m where m.profile_id = v_actor
      and m.course_id = v_course and m.term_id = v_term and m.membership_status = 'active'
      and m.group_id <> p_group_id
  ) then raise exception 'you already belong to another group for this course and term'; end if;

  select i.id into v_invitation from public.group_invitations i
  where i.group_id = p_group_id and i.recipient_id = p_recipient_id and i.status = 'pending';
  if v_invitation is null then
    insert into public.group_invitations(
      group_id, course_id, term_id, sender_id, recipient_id,
      sender_name_snapshot, recipient_name_snapshot
    ) values (
      p_group_id, v_course, v_term, v_actor, p_recipient_id,
      coalesce(v_sender_name, 'New CityLink member'), v_recipient_name
    ) returning id into v_invitation;
  end if;
  return v_invitation;
end;
$function$;

create or replace function public.request_to_join_group(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_status text;
  v_request uuid;
  v_name text;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups g where g.id = p_group_id;
  if v_course is null then raise exception 'group not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profile(v_course, v_term, v_actor);
  select g.course_id, g.term_id, g.status into v_course, v_term, v_status
  from public.study_groups g where g.id = p_group_id for update;
  if not found or v_status <> 'active' or not private.is_current_term(v_term) then
    raise exception 'active current-term group not found';
  end if;
  if not private.is_enrolled(v_actor, v_course) then raise exception 'you must be enrolled in the course'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_actor and p.status in ('open', 'considering')
  ) then raise exception 'your profile is not currently available to join a group'; end if;
  if exists (
    select 1 from public.group_memberships m where m.profile_id = v_actor
      and m.course_id = v_course and m.term_id = v_term and m.membership_status = 'active'
  ) then raise exception 'you already belong to a group for this course and term'; end if;

  if exists (
    select 1 from public.group_invitations i
    where i.group_id = p_group_id
      and i.recipient_id = v_actor
      and i.status = 'pending'
  ) then
    raise exception
      'you already have a pending invitation to this group; respond to that invitation instead of requesting to join';
  end if;

  select p.display_name into v_name from public.profiles p where p.id = v_actor;
  select r.id into v_request from public.group_join_requests r
    where r.group_id = p_group_id and r.requester_id = v_actor and r.status = 'pending';
  if v_request is null then
    insert into public.group_join_requests(
      group_id, course_id, term_id, requester_id, requester_name_snapshot
    ) values (p_group_id, v_course, v_term, v_actor,
      coalesce(v_name, 'New CityLink member')) returning id into v_request;
  end if;
  return v_request;
end;
$function$;

create or replace function public.review_group_join_request(
  p_request_id uuid,
  p_approve boolean
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_group uuid;
  v_course uuid;
  v_term uuid;
  v_requester uuid;
  v_status text;
  v_group_status text;
  v_creator_id uuid;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if p_approve is null then raise exception 'approve/reject choice is required'; end if;
  select r.group_id, r.course_id, r.term_id, r.requester_id
    into v_group, v_course, v_term, v_requester
  from public.group_join_requests r where r.id = p_request_id;
  if not found or v_requester is null then raise exception 'join request not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_actor, v_requester);
  select g.status, g.creator_id into v_group_status, v_creator_id
  from public.study_groups g where g.id = v_group for update;
  if not found then raise exception 'group not found'; end if;
  select r.status into v_status from public.group_join_requests r
    where r.id = p_request_id for update;
  if not found then raise exception 'join request not found'; end if;
  if v_status <> 'pending' then raise exception 'join request is no longer pending'; end if;
  if v_creator_id is distinct from v_actor
     or not private.is_active_group_member(v_group, v_actor) then
    raise exception 'only the current group leader may review requests';
  end if;

  if not p_approve then
    update public.group_join_requests set status = 'rejected', reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_request_id;
    return 'rejected';
  end if;
  if v_group_status <> 'active' or not private.is_current_term(v_term) then
    update public.group_join_requests set status = 'expired', reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if not private.is_enrolled(v_requester, v_course)
     or not exists (
       select 1 from public.profiles p
       where p.id = v_requester and p.status in ('open', 'considering')
     ) then
    update public.group_join_requests set status = 'expired', reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if exists (
    select 1 from public.group_memberships m where m.profile_id = v_requester
      and m.course_id = v_course and m.term_id = v_term and m.membership_status = 'active'
  ) then
    update public.group_join_requests set status = 'expired', reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  insert into public.group_memberships(
    group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
  ) select v_group, v_course, v_term, p.id, p.display_name, 'active'
    from public.profiles p where p.id = v_requester;
  if not found then raise exception 'requester profile no longer exists'; end if;
  update public.group_join_requests set status = 'approved', reviewed_by = v_actor,
    reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id;
  return 'approved';
end;
$function$;

-- Remove the old requester-or-any-member SELECT policy and replace it with
-- requester-or-current-active-leader access.
drop policy if exists "requester and members read join requests"
  on public.group_join_requests;
create policy "requester and current leader read join requests"
  on public.group_join_requests
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (
      select 1
      from public.study_groups as g
      where g.id = group_join_requests.group_id
        and g.creator_id = (select auth.uid())
        and private.is_active_group_member(g.id, (select auth.uid()))
    )
  );

-- Public RPC signatures, return types, and existing execute grants are preserved
-- by CREATE OR REPLACE. Table grants remain unchanged and no capacity check is
-- introduced.
