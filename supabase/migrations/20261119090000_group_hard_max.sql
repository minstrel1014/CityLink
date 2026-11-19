-- CityLink group hard-maximum migration — DRAFT FOR ROLE 6 REVIEW ONLY.
-- Do not apply this file until Role 6 completes the final SQL review and Adam
-- gives separate Test authorization. Main is out of scope.
--
-- Scope:
--   * nullable 2–19 maximum on study_groups;
--   * canonical active-member count and capacity rejection helpers;
--   * capacity checks in group creation, invitation, join request, acceptance,
--     and leader approval;
--   * leader-only manual member removal;
--   * private transaction-keyed removal context and invitation-cancellation
--     helper;
--   * no change to the currently unattached invitation-integrity guard; a
--     complete guard/trigger change is deferred until it can authorize every
--     existing lifecycle path, including expiry and profile-deletion cleanup.
--   * capacity fields in the three read RPCs whose return shapes change.
--
-- This is forward-only and targets the disposable Test project only after the
-- separate review/authorization gates. It does not reset or delete data.
--
-- Client note: changing a RETURNS TABLE shape requires a matching client
-- mapper/UI release. Applying this SQL alone will make older clients reject the
-- new response keys. That client work is intentionally outside this SQL draft.

begin;

-- ---------------------------------------------------------------------------
-- 1. Maximum column and private capacity helpers
-- ---------------------------------------------------------------------------

alter table public.study_groups
  add column if not exists max_members integer;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_groups_max_members_chk'
      and conrelid = 'public.study_groups'::regclass
  ) then
    alter table public.study_groups
      add constraint study_groups_max_members_chk
      check (max_members is null or max_members between 2 and 19);
  end if;
end;
$migration$;

comment on column public.study_groups.max_members is
  'Leader-set hard maximum from 2 to 19. NULL means not configured; it is not unlimited and must block additions.';

create or replace function private.group_active_member_count(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (
      select count(*)::integer
      from public.group_memberships as m
      where m.group_id = p_group_id
        and m.membership_status = 'active'
    )
    +
    case
      when exists (
        select 1
        from public.study_groups as g
        where g.id = p_group_id
          and g.status = 'forming'
          and g.creator_id is not null
          and not exists (
            select 1
            from public.group_memberships as m
            where m.group_id = p_group_id
              and m.profile_id = g.creator_id
              and m.membership_status = 'active'
          )
      ) then 1
      else 0
    end;
$function$;

create or replace function private.assert_group_has_capacity(
  p_group_id uuid,
  p_additional_members integer
)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_max_members integer;
  v_status text;
  v_count integer;
begin
  if p_group_id is null then
    raise exception 'group not found';
  end if;
  if p_additional_members is null or p_additional_members < 1 then
    raise exception 'invalid capacity addition';
  end if;

  select g.max_members, g.status
    into v_max_members, v_status
  from public.study_groups as g
  where g.id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;
  if v_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;

  v_count := private.group_active_member_count(p_group_id);

  -- Over-limit takes precedence over the unconfigured message: an existing
  -- group above 19 must be reduced before it can choose a maximum.
  if v_count > 19 then
    raise exception 'This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.';
  end if;
  if v_max_members is null then
    raise exception 'Group maximum is not set';
  end if;
  if v_count + p_additional_members > v_max_members then
    raise exception 'Group is full';
  end if;
end;
$function$;

revoke all on function private.group_active_member_count(uuid)
  from public, anon, authenticated;
revoke all on function private.assert_group_has_capacity(uuid, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Leader maximum editing
-- ---------------------------------------------------------------------------

create or replace function public.set_group_max_members(
  p_group_id uuid,
  p_max_members integer
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_creator uuid;
  v_status text;
  v_count integer;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;

  select g.term_id into v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.lock_current_term(v_term) then
    raise exception 'group is not in the current academic term';
  end if;

  select g.creator_id, g.status
    into v_creator, v_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator is distinct from v_actor
     or (
       v_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may set the maximum';
  end if;

  v_count := private.group_active_member_count(p_group_id);
  if v_count > 19 then
    raise exception 'This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.';
  end if;
  if p_max_members < v_count then
    raise exception 'Maximum cannot be lower than the current number of active members. Remove members first.';
  end if;

  update public.study_groups
  set max_members = p_max_members,
      updated_at = clock_timestamp()
  where id = p_group_id;

  return p_max_members;
end;
$function$;

revoke all on function public.set_group_max_members(uuid, integer)
  from public, anon;
grant execute on function public.set_group_max_members(uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Group creation with creation-time maximum
-- ---------------------------------------------------------------------------

-- The naming migration replaced the old two-argument overload with the
-- three-argument name-bearing overload. Drop both exact historical signatures
-- so neither can bypass the maximum. No CASCADE: a dependency must fail loudly.
drop function if exists public.create_group_and_invite(uuid, uuid);
drop function if exists public.create_group_and_invite(uuid, uuid, text);

create or replace function public.create_group_and_invite(
  p_course_id uuid,
  p_recipient_id uuid,
  p_name text,
  p_max_members integer
)
returns table(group_id uuid, invitation_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_group uuid;
  v_group_max integer;
  v_invitation uuid;
  v_actor_name text;
  v_recipient_name text;
  v_name text := btrim(p_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'group name must contain 1 to 50 characters';
  end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;

  select c.term_id into v_term
  from public.courses as c
  where c.id = p_course_id;
  if v_term is null or not private.lock_current_term(v_term) then
    raise exception 'course is not in the current academic term';
  end if;

  perform private.lock_course_profiles(
    p_course_id, v_term, v_actor, p_recipient_id
  );
  if not private.is_enrolled(v_actor, p_course_id)
     or not private.is_enrolled(p_recipient_id, p_course_id) then
    raise exception 'both students must be enrolled in the course';
  end if;

  select p.display_name into v_actor_name
  from public.profiles as p
  where p.id = v_actor;
  select p.display_name into v_recipient_name
  from public.profiles as p
  where p.id = p_recipient_id
    and p.status in ('open', 'considering');
  if v_recipient_name is null then
    raise exception 'recipient is not accepting invitations';
  end if;

  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id in (v_actor, p_recipient_id)
      and m.course_id = p_course_id
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'a participant already belongs to a group for this course and term';
  end if;

  select g.id, g.max_members
    into v_group, v_group_max
  from public.study_groups as g
  where g.creator_id = v_actor
    and g.course_id = p_course_id
    and g.term_id = v_term
    and g.status = 'forming'
  for update;

  if v_group is null then
    insert into public.study_groups(
      course_id, term_id, creator_id, status, name, max_members
    ) values (
      p_course_id, v_term, v_actor, 'forming', v_name, p_max_members
    ) returning id into v_group;
    v_group_max := p_max_members;
  else
    -- Reusing a forming group must not bypass the required maximum. Do not
    -- silently overwrite it; the leader must use set_group_max_members.
    if v_group_max is null then
      raise exception 'Group maximum is not set; set a maximum before adding members';
    end if;
    if v_group_max is distinct from p_max_members then
      raise exception 'Group maximum does not match this group; edit the maximum before inviting';
    end if;
  end if;

  select i.id into v_invitation
  from public.group_invitations as i
  where i.group_id = v_group
    and i.recipient_id = p_recipient_id
    and i.status = 'pending';

  if v_invitation is null then
    -- One additional place is required for the invitation/acceptance path.
    perform private.assert_group_has_capacity(v_group, 1);
    insert into public.group_invitations(
      group_id, course_id, term_id, sender_id, recipient_id,
      sender_name_snapshot, recipient_name_snapshot
    ) values (
      v_group, p_course_id, v_term, v_actor, p_recipient_id,
      coalesce(v_actor_name, 'New CityLink member'), v_recipient_name
    ) returning id into v_invitation;
  end if;

  return query select v_group, v_invitation;
end;
$function$;

revoke all on function public.create_group_and_invite(uuid, uuid, text, integer)
  from public, anon;
grant execute on function public.create_group_and_invite(uuid, uuid, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Invitation, request, acceptance, and approval capacity checks
-- ---------------------------------------------------------------------------

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
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;

  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if v_course is null then
    raise exception 'group not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(
    v_course, v_term, v_actor, p_recipient_id
  );

  select g.course_id, g.term_id, g.status
    into v_course, v_term, v_group_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.is_current_term(v_term)
     or v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if not (
    private.is_active_group_member(p_group_id, v_actor)
    or (
      v_group_status = 'forming'
      and exists (
        select 1
        from public.study_groups as g
        where g.id = p_group_id
          and g.creator_id = v_actor
      )
    )
  ) then
    raise exception 'only a group member or forming-group creator can invite';
  end if;
  if not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(p_recipient_id, v_course) then
    raise exception 'both students must be enrolled in the course';
  end if;

  if exists (
    select 1
    from public.group_join_requests as r
    where r.group_id = p_group_id
      and r.requester_id = p_recipient_id
      and r.status = 'pending'
  ) then
    raise exception 'student already has a pending join request for this group; review that request instead of sending an invitation';
  end if;

  select p.display_name into v_sender_name
  from public.profiles as p
  where p.id = v_actor;
  select p.display_name into v_recipient_name
  from public.profiles as p
  where p.id = p_recipient_id
    and p.status in ('open', 'considering');
  if v_recipient_name is null then
    raise exception 'recipient is not accepting invitations';
  end if;
  if private.is_active_group_member(p_group_id, p_recipient_id) then
    raise exception 'recipient already belongs to this group';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = p_recipient_id
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'recipient already belongs to a group for this course and term';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
      and m.group_id <> p_group_id
  ) then
    raise exception 'you already belong to another group for this course and term';
  end if;

  select i.id into v_invitation
  from public.group_invitations as i
  where i.group_id = p_group_id
    and i.recipient_id = p_recipient_id
    and i.status = 'pending';
  if v_invitation is null then
    perform private.assert_group_has_capacity(p_group_id, 1);
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
  if v_actor is null then
    raise exception 'authentication required';
  end if;

  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if v_course is null then
    raise exception 'group not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profile(v_course, v_term, v_actor);

  select g.course_id, g.term_id, g.status
    into v_course, v_term, v_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found
     or v_status <> 'active'
     or not private.is_current_term(v_term) then
    raise exception 'active current-term group not found';
  end if;
  if not private.is_enrolled(v_actor, v_course) then
    raise exception 'you must be enrolled in the course';
  end if;
  if not exists (
    select 1
    from public.profiles as p
    where p.id = v_actor
      and p.status in ('open', 'considering')
  ) then
    raise exception 'your profile is not currently available to join a group';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'you already belong to a group for this course and term';
  end if;

  if exists (
    select 1
    from public.group_invitations as i
    where i.group_id = p_group_id
      and i.recipient_id = v_actor
      and i.status = 'pending'
  ) then
    raise exception 'you already have a pending invitation to this group; respond to that invitation instead of requesting to join';
  end if;

  select p.display_name into v_name
  from public.profiles as p
  where p.id = v_actor;
  select r.id into v_request
  from public.group_join_requests as r
  where r.group_id = p_group_id
    and r.requester_id = v_actor
    and r.status = 'pending';

  if v_request is null then
    perform private.assert_group_has_capacity(p_group_id, 1);
    insert into public.group_join_requests(
      group_id, course_id, term_id, requester_id, requester_name_snapshot
    ) values (
      p_group_id, v_course, v_term, v_actor,
      coalesce(v_name, 'New CityLink member')
    ) returning id into v_request;
  end if;

  return v_request;
end;
$function$;

create or replace function public.respond_to_group_invitation(
  p_invitation_id uuid,
  p_accept boolean
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
  v_sender uuid;
  v_recipient uuid;
  v_status text;
  v_group_status text;
  v_sender_name text;
  v_recipient_name text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_accept is null then
    raise exception 'accept/decline choice is required';
  end if;

  select i.group_id, i.course_id, i.term_id, i.sender_id, i.recipient_id
    into v_group, v_course, v_term, v_sender, v_recipient
  from public.group_invitations as i
  where i.id = p_invitation_id;
  if not found or v_sender is null or v_recipient is null then
    raise exception 'invitation not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_sender, v_recipient);

  select g.status into v_group_status
  from public.study_groups as g
  where g.id = v_group
  for update;
  if not found then
    raise exception 'group not found';
  end if;

  select i.status into v_status
  from public.group_invitations as i
  where i.id = p_invitation_id
  for update;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_recipient <> v_actor then
    raise exception 'only the recipient may respond';
  end if;
  if v_status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;

  if not p_accept then
    update public.group_invitations
    set status = 'declined',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'declined';
  end if;

  if v_group_status not in ('forming', 'active')
     or not private.is_current_term(v_term)
     or not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(v_sender, v_course)
     or not exists (
       select 1
       from public.profiles as p
       where p.id = v_actor
         and p.status in ('open', 'considering')
     ) then
    update public.group_invitations
    set status = 'expired',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'expired';
  end if;

  if v_group_status = 'forming' then
    if not exists (
      select 1
      from public.study_groups as g
      where g.id = v_group
        and g.creator_id = v_sender
    ) then
      raise exception 'forming group creator is no longer available';
    end if;
    if exists (
      select 1
      from public.group_memberships as m
      where m.profile_id in (v_sender, v_actor)
        and m.course_id = v_course
        and m.term_id = v_term
        and m.membership_status = 'active'
    ) then
      raise exception 'a participant already belongs to a group for this course and term';
    end if;

    perform private.assert_group_has_capacity(v_group, 1);

    select p.display_name into v_sender_name
    from public.profiles as p
    where p.id = v_sender;
    select p.display_name into v_recipient_name
    from public.profiles as p
    where p.id = v_actor;

    -- Both inserts are mandatory. A capacity/race failure rolls back both.
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values
      (v_group, v_course, v_term, v_sender,
       coalesce(v_sender_name, 'New CityLink member'), 'active'),
      (v_group, v_course, v_term, v_actor,
       coalesce(v_recipient_name, 'New CityLink member'), 'active');

    update public.study_groups
    set status = 'active',
        activated_at = coalesce(activated_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where id = v_group
      and status = 'forming';
  else
    if not private.is_active_group_member(v_group, v_sender) then
      raise exception 'invitation sender is no longer an active member of this group';
    end if;
    if exists (
      select 1
      from public.group_memberships as m
      where m.profile_id = v_actor
        and m.course_id = v_course
        and m.term_id = v_term
        and m.membership_status = 'active'
    ) then
      raise exception 'you already belong to a group for this course and term';
    end if;

    perform private.assert_group_has_capacity(v_group, 1);

    select p.display_name into v_recipient_name
    from public.profiles as p
    where p.id = v_actor;
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values (
      v_group, v_course, v_term, v_actor,
      coalesce(v_recipient_name, 'New CityLink member'), 'active'
    );
  end if;

  update public.group_invitations
  set status = 'accepted',
      responded_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_invitation_id;

  return 'accepted';
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
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_approve is null then
    raise exception 'approve/reject choice is required';
  end if;

  select r.group_id, r.course_id, r.term_id, r.requester_id
    into v_group, v_course, v_term, v_requester
  from public.group_join_requests as r
  where r.id = p_request_id;
  if not found or v_requester is null then
    raise exception 'join request not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_actor, v_requester);

  select g.status, g.creator_id
    into v_group_status, v_creator_id
  from public.study_groups as g
  where g.id = v_group
  for update;
  if not found then
    raise exception 'group not found';
  end if;

  select r.status into v_status
  from public.group_join_requests as r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'join request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'join request is no longer pending';
  end if;
  if v_creator_id is distinct from v_actor
     or not private.is_active_group_member(v_group, v_actor) then
    raise exception 'only the current group leader may review requests';
  end if;

  if not p_approve then
    update public.group_join_requests
    set status = 'rejected',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'rejected';
  end if;

  if v_group_status <> 'active' or not private.is_current_term(v_term) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if not private.is_enrolled(v_requester, v_course)
     or not exists (
       select 1
       from public.profiles as p
       where p.id = v_requester
         and p.status in ('open', 'considering')
     ) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_requester
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;

  perform private.assert_group_has_capacity(v_group, 1);

  insert into public.group_memberships(
    group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
  )
  select v_group, v_course, v_term, p.id, p.display_name, 'active'
  from public.profiles as p
  where p.id = v_requester;
  if not found then
    raise exception 'requester profile no longer exists';
  end if;

  update public.group_join_requests
  set status = 'approved',
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_request_id;

  return 'approved';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Leader-only manual removal and private cancellation context
-- ---------------------------------------------------------------------------

create schema if not exists private;

create table if not exists private.group_removal_context (
  transaction_id bigint not null,
  group_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (transaction_id, group_id, profile_id)
);

alter table private.group_removal_context enable row level security;

revoke all on table private.group_removal_context
  from public, anon, authenticated;

comment on table private.group_removal_context is
  'Transaction-scoped authorization for the leader-removal invitation cancellation path. Browser roles have no privileges.';

create or replace function private.cancel_pending_invitations_from_removed_member(
  p_group_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_creator uuid;
  v_status text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null or p_profile_id is null then
    raise exception 'invalid removal context';
  end if;

  select g.creator_id, g.status
    into v_creator, v_status
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if v_creator is distinct from v_actor
     or v_status not in ('forming', 'active') then
    raise exception 'only the current group leader may cancel removed-member invitations';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.group_id = p_group_id
      and m.profile_id = p_profile_id
      and m.membership_status = 'active'
  ) then
    raise exception 'target member is still active';
  end if;

  insert into private.group_removal_context(
    transaction_id, group_id, profile_id
  ) values (
    txid_current(), p_group_id, p_profile_id
  )
  on conflict (transaction_id, group_id, profile_id) do nothing;

  update public.group_invitations
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where group_id = p_group_id
    and sender_id = p_profile_id
    and status = 'pending';

  delete from private.group_removal_context
  where transaction_id = txid_current()
    and group_id = p_group_id
    and profile_id = p_profile_id;
end;
$function$;

revoke all on function private.cancel_pending_invitations_from_removed_member(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.remove_group_member(
  p_group_id uuid,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_membership_id uuid;
  v_group_status text;
  v_creator uuid;
  v_active_count integer;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null or p_profile_id is null then
    raise exception 'invalid removal target';
  end if;

  -- 1. Read group identifiers without a row lock.
  select g.course_id, g.term_id
    into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.lock_current_term(v_term) then
    raise exception 'group is not in the current academic term';
  end if;

  -- 2. Deterministic profile guard: same order as the existing admission paths.
  perform private.lock_course_profiles(
    v_course, v_term, v_actor, p_profile_id
  );

  -- 3. Lock the target membership before the group. This matches the Stage 6
  -- chat/post membership-first order and avoids the earlier deadlock.
  select m.id into v_membership_id
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.course_id = v_course
    and m.term_id = v_term
    and m.profile_id = p_profile_id
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'target is not an active member of this group';
  end if;

  -- 4. Lock the group and recheck authority/status.
  select g.status, g.creator_id
    into v_group_status, v_creator
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator is distinct from v_actor
     or (
       v_group_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may remove members';
  end if;

  -- 5. Approved v1 boundaries: no leader self-removal and no last-member
  -- removal/abandonment through this RPC.
  if p_profile_id = v_creator then
    raise exception 'the current group leader cannot remove themselves through this operation';
  end if;
  v_active_count := private.group_active_member_count(p_group_id);
  if v_active_count <= 1 then
    raise exception 'the last active member cannot be removed through this operation';
  end if;

  -- 6. Preserve membership history; membership-end triggers handle the
  -- approved leader/recruitment-post effects.
  update public.group_memberships
  set membership_status = 'removed',
      ended_at = clock_timestamp()
  where id = v_membership_id
    and membership_status = 'active';
  if not found then
    raise exception 'target is no longer an active member of this group';
  end if;

  -- 7. Only the removed sender's pending invitations are cancelled. Pending
  -- join requests and other members' invitations remain pending.
  perform private.cancel_pending_invitations_from_removed_member(
    p_group_id, p_profile_id
  );

  return 'removed';
end;
$function$;

revoke all on function public.remove_group_member(uuid, uuid)
  from public, anon;
grant execute on function public.remove_group_member(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Invitation guard: intentionally unchanged in this migration
-- ---------------------------------------------------------------------------

-- The checked-in public.enforce_invitation_integrity() guard is currently
-- unattached. Role 6's review found that replacing it here would conflict with
-- legitimate existing transitions (expired invitations on abandoned groups or
-- ineligible acceptance) and profile-deletion anonymization. This migration
-- therefore does NOT replace or attach the guard.
--
-- A future complete guard/trigger migration must explicitly authorize all
-- existing lifecycle paths, including expiry and profile-deletion cleanup, and
-- the leader-removal cancellation context. Until that review, the removal helper
-- below remains safe while the guard is unattached.

-- ---------------------------------------------------------------------------
-- 7. Read RPCs with capacity fields
-- ---------------------------------------------------------------------------

drop function if exists public.list_course_group_summaries(uuid);

create function public.list_course_group_summaries(p_course_id uuid)
returns table(
  profile_id uuid,
  group_id uuid,
  group_name text,
  group_status text,
  group_size bigint,
  max_members integer,
  capacity_count integer,
  capacity_state text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with base as (
    select
      peer.id as profile_id,
      study_group.id as group_id,
      study_group.name as group_name,
      study_group.status as group_status,
      (
        select count(*)::integer
        from public.group_memberships as membership
        where membership.group_id = study_group.id
          and membership.term_id = study_group.term_id
          and membership.membership_status = 'active'
      ) as active_count,
      case
        when study_group.status = 'forming'
         and study_group.creator_id is not null
         and not exists (
           select 1
           from public.group_memberships as founder_membership
           where founder_membership.group_id = study_group.id
             and founder_membership.term_id = study_group.term_id
             and founder_membership.profile_id = study_group.creator_id
             and founder_membership.membership_status = 'active'
         )
        then 1
        else 0
      end as creator_bonus,
      study_group.max_members
    from public.courses as course
    join public.citylink_settings as setting
      on setting.singleton
     and setting.current_term_id = course.term_id
    join public.enrolments as caller_enrolment
      on caller_enrolment.course_id = course.id
     and caller_enrolment.student_id = (select auth.uid())
    join public.enrolments as peer_enrolment
      on peer_enrolment.course_id = course.id
    join public.profiles as peer
      on peer.id = peer_enrolment.student_id
    join public.study_groups as study_group
      on study_group.course_id = course.id
     and study_group.term_id = setting.current_term_id
     and study_group.status in ('forming', 'active')
    where course.id = p_course_id
      and peer.id is distinct from (select auth.uid())
      and (
        private.is_active_group_member(study_group.id, peer.id)
        or (
          study_group.status = 'forming'
          and study_group.creator_id = peer.id
        )
      )
  )
  select
    base.profile_id,
    base.group_id,
    base.group_name,
    base.group_status,
    (base.active_count + base.creator_bonus)::bigint as group_size,
    base.max_members,
    (base.active_count + base.creator_bonus)::integer as capacity_count,
    case
      when base.active_count + base.creator_bonus > 19 then 'over_limit'
      when base.max_members is null then 'maximum_not_set'
      when base.active_count + base.creator_bonus >= base.max_members then 'full'
      else 'available'
    end as capacity_state
  from base
  -- Course-detail People results are visible only once at least two actual
  -- people are in the group. Pending invitations do not count, and a forming
  -- creator alone must not create a one-person summary card.
  where (base.active_count + base.creator_bonus) >= 2
  order by base.profile_id, base.group_id;
$function$;

revoke all on function public.list_course_group_summaries(uuid)
  from public, anon;
grant execute on function public.list_course_group_summaries(uuid)
  to authenticated;

drop function if exists public.list_current_term_course_groups(uuid, text, uuid, integer);

create function public.list_current_term_course_groups(
  p_course_id uuid,
  p_after_group_name text default null,
  p_after_group_id uuid default null,
  p_limit integer default 25
)
returns table (
  group_id uuid,
  group_name text,
  group_status text,
  active_member_count bigint,
  max_members integer,
  capacity_count integer,
  capacity_state text,
  can_create_post boolean,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (p_after_group_name is null) <> (p_after_group_id is null) then
    raise exception 'both group pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  return query
    with eligible as (
      select
        g.id as group_id,
        g.name as group_name,
        g.status as group_status,
        count(m.id)::integer as active_count,
        case
          when g.status = 'forming'
           and g.creator_id is not null
           and not exists (
             select 1
             from public.group_memberships as founder_membership
             where founder_membership.group_id = g.id
               and founder_membership.profile_id = g.creator_id
               and founder_membership.membership_status = 'active'
           )
          then 1
          else 0
        end as creator_bonus,
        g.max_members,
        (g.status = 'active' and exists (
          select 1
          from public.group_memberships as own_membership
          where own_membership.group_id = g.id
            and own_membership.profile_id = (select auth.uid())
            and own_membership.membership_status = 'active'
        )) as can_create_post
      from public.study_groups as g
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = g.term_id
      join public.enrolments as viewer_enrolment
        on viewer_enrolment.course_id = g.course_id
       and viewer_enrolment.student_id = (select auth.uid())
      left join public.group_memberships as m
        on m.group_id = g.id and m.membership_status = 'active'
      where g.course_id = p_course_id
        and g.status in ('forming', 'active')
        and private.can_browse_current_term_group(g.id)
        and not exists (
          select 1
          from public.group_memberships as own_m
          where own_m.group_id = g.id
            and own_m.profile_id = (select auth.uid())
            and own_m.membership_status = 'active'
        )
      group by g.id, g.name, g.status, g.creator_id, g.max_members
      having count(m.id) >= 2
    ), scored as (
      select
        e.*,
        (e.active_count + e.creator_bonus)::integer as capacity_count,
        case
          when e.active_count + e.creator_bonus > 19 then 'over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.active_count + e.creator_bonus >= e.max_members then 'full'
          else 'available'
        end as capacity_state
      from eligible as e
    ), page as (
      select
        scored.*,
        (count(*) over () > p_limit) as has_more
      from scored
      where p_after_group_name is null
         or (scored.group_name, scored.group_id) > (p_after_group_name, p_after_group_id)
      order by scored.group_name, scored.group_id
      limit p_limit
    )
    select
      page.group_id,
      page.group_name,
      page.group_status,
      page.capacity_count::bigint as active_member_count,
      page.max_members,
      page.capacity_count,
      page.capacity_state,
      page.can_create_post,
      page.has_more
    from page;
end;
$function$;

revoke all on function public.list_current_term_course_groups(uuid, text, uuid, integer)
  from public, anon;
grant execute on function public.list_current_term_course_groups(uuid, text, uuid, integer)
  to authenticated;

drop function if exists public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer);

create function public.list_group_recruitment_posts(
  p_course_id uuid,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 20
)
returns table (
  post_id uuid,
  group_id uuid,
  group_name text,
  subject text,
  active_member_count bigint,
  max_members integer,
  capacity_count integer,
  capacity_state text,
  author_name text,
  body text,
  post_status text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  apply_enabled boolean,
  apply_block_reason text,
  can_manage boolean,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception 'both post pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  return query
    with eligible as (
      select
        p.id as post_id,
        case when g.status in ('forming', 'active') then g.id else null end as group_id,
        case when g.status in ('forming', 'active') then g.name else null end as group_name,
        p.subject,
        p.course_id as post_course_id,
        p.term_id as post_term_id,
        case when g.status in ('forming', 'active') then
          (select count(*)
           from public.group_memberships as m
           where m.group_id = g.id
             and m.membership_status = 'active')
        else null end as active_count,
        case when g.status in ('forming', 'active') then
          (select count(*)
           from public.group_memberships as m
           where m.group_id = g.id
             and m.membership_status = 'active')
          + case
              when g.status = 'forming'
               and g.creator_id is not null
               and not exists (
                 select 1
                 from public.group_memberships as founder_membership
                 where founder_membership.group_id = g.id
                   and founder_membership.profile_id = g.creator_id
                   and founder_membership.membership_status = 'active'
               )
              then 1
              else 0
            end
        else null end::integer as capacity_count,
        case when g.status in ('forming', 'active') then g.max_members else null end as max_members,
        p.author_name_snapshot as author_name,
        p.body,
        p.status as post_status,
        p.created_at,
        p.updated_at,
        p.closed_at,
        (p.status = 'open'
          and g.status = 'active'
          and private.is_current_term(g.term_id)
          and exists (
            select 1
            from public.profiles as viewer
            where viewer.id = (select auth.uid())
              and viewer.status in ('open', 'considering')
          )
          and not exists (
            select 1
            from public.group_memberships as own_m
            where own_m.profile_id = (select auth.uid())
              and own_m.course_id = p.course_id
              and own_m.term_id = p.term_id
              and own_m.membership_status = 'active'
          )
          and not exists (
            select 1
            from public.group_invitations as i
            where i.group_id = p.group_id
              and i.recipient_id = (select auth.uid())
              and i.status = 'pending'
          )
          and not exists (
            select 1
            from public.group_join_requests as r
            where r.group_id = p.group_id
              and r.requester_id = (select auth.uid())
              and r.status = 'pending'
          )) as apply_enabled,
        private.can_manage_recruitment_post(p.id) as can_manage
      from public.group_recruitment_posts as p
      join public.study_groups as g
        on g.id = p.group_id
       and g.course_id = p.course_id
       and g.term_id = p.term_id
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = p.term_id
      join public.enrolments as e
        on e.course_id = p.course_id
       and e.student_id = (select auth.uid())
      where p.course_id = p_course_id
    ), scored as (
      select
        e.*,
        case
          when e.group_id is null then null
          when e.capacity_count > 19 then 'over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.capacity_count >= e.max_members then 'full'
          else 'available'
        end as capacity_state,
        case
          when e.group_id is null then 'group_inactive'
          when e.post_status <> 'open' then 'post_closed'
          when e.capacity_count > 19 then 'group_over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.capacity_count >= e.max_members then 'group_full'
          when not exists (
            select 1
            from public.profiles as viewer
            where viewer.id = (select auth.uid())
              and viewer.status in ('open', 'considering')
          ) then 'profile_unavailable'
          when exists (
            select 1
            from public.group_memberships as own_m
            where own_m.profile_id = (select auth.uid())
              and own_m.course_id = e.post_course_id
              and own_m.term_id = e.post_term_id
              and own_m.membership_status = 'active'
          ) then 'already_member'
          when exists (
            select 1
            from public.group_invitations as i
            where i.group_id = e.group_id
              and i.recipient_id = (select auth.uid())
              and i.status = 'pending'
          ) then 'pending_invitation'
          when exists (
            select 1
            from public.group_join_requests as r
            where r.group_id = e.group_id
              and r.requester_id = (select auth.uid())
              and r.status = 'pending'
          ) then 'pending_request'
          else 'not_eligible'
        end as apply_block_reason
      from eligible as e
    ), page as (
      select
        scored.*,
        (count(*) over () > p_limit) as has_more
      from scored
      where p_after_created_at is null
         or (scored.created_at, scored.post_id) < (p_after_created_at, p_after_id)
      order by scored.created_at desc, scored.post_id desc
      limit p_limit
    )
    select
      page.post_id,
      page.group_id,
      page.group_name,
      page.subject,
      page.capacity_count::bigint as active_member_count,
      page.max_members,
      page.capacity_count,
      page.capacity_state,
      page.author_name,
      page.body,
      page.post_status,
      page.created_at,
      page.updated_at,
      page.closed_at,
      (page.apply_block_reason is null) as apply_enabled,
      page.apply_block_reason,
      page.can_manage,
      page.has_more
    from page;
end;
$function$;

revoke all on function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer)
  to authenticated;

commit;
