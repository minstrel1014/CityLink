-- CityLink: a group is a group.
--
-- Adam approved applying this to the live project (pijslbchvstkoweslymr) on
-- 2026-11-24 01:14 (Asia/Taipei), after confirming:
--   * default name is the creator's display name plus "group";
--   * one active group per student per course and term stays the rule.
--
-- Why: creating a group required inviting somebody, the creator was not a
-- member of their own group, a new group was invisible to other students, and
-- a group could not publish a recruitment post until it already had two
-- members. That made recruiting impossible.
--
-- Role 6 reviewed this on 2026-11-24 and raised three findings, all folded in
-- below: F1 (a group created without a maximum can never invite anyone, so the
-- maximum is now mandatory), F2 (the visibility clause must exclude abandoned
-- groups, which it does) and F6 (posting must reject abandoned groups
-- explicitly instead of relying on membership). Role 6 reviewed the canonical
-- repository at 3514630; the definitions here were taken from the live
-- database, whose function bodies were read directly before any change.
--
-- Scope: adds one creation function and relaxes four read/write gates. It does
-- not change any existing function's signature or result shape, so the
-- three-argument create stub, the legacy read wrappers and the approved
-- _capacity names keep working unchanged.

-- 1. Creation without an invitee -------------------------------------------

create or replace function public.create_group_alone(
  p_course_id uuid,
  p_name text default null,
  p_max_members integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_name text;
  v_display_name text;
  v_group uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  -- Role 6 finding F1: a group created without a maximum can never invite
  -- anybody, because the invitation path raises 'Group maximum is not set'.
  -- A maximum is therefore mandatory at creation, not optional.
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;
  select c.term_id into v_term from public.courses c where c.id = p_course_id;
  if v_term is null or not private.lock_current_term(v_term) then
    raise exception 'course is not in the current academic term';
  end if;
  if not private.is_enrolled(v_actor, p_course_id) then
    raise exception 'only enrolled students may create a group';
  end if;
  if exists (
    select 1 from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = p_course_id
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'you already belong to a group for this course and term';
  end if;
  select p.display_name into v_display_name
  from public.profiles as p where p.id = v_actor;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    -- Adam's rule: the creator's name plus "group", e.g. "Adam's group".
    -- Display names in this database carry role and section suffixes
    -- ("Tom Whitfield - Leader - S08"), so only the first word is used.
    v_name := coalesce(
      nullif(split_part(btrim(coalesce(v_display_name, '')), ' ', 1), ''),
      'New study group'
    ) || '''s group';
  end if;
  v_name := left(v_name, 50);
  insert into public.study_groups (
    course_id, term_id, creator_id, status, name, max_members, activated_at
  ) values (
    p_course_id, v_term, v_actor, 'active', v_name, p_max_members,
    clock_timestamp()
  ) returning id into v_group;
  -- The creator is the first active member, so the group is a real group from
  -- the moment it exists: it counts for capacity, appears in "my group", and
  -- can publish a recruitment post.
  insert into public.group_memberships (
    group_id, course_id, term_id, profile_id, display_name_snapshot,
    membership_status
  ) values (
    v_group, p_course_id, v_term, v_actor,
    left(coalesce(nullif(btrim(coalesce(v_display_name, '')), ''), 'CityLink member'), 120),
    'active'
  );
  return v_group;
end;
$function$;

revoke all on function public.create_group_alone(uuid, text, integer) from public, anon;
grant execute on function public.create_group_alone(uuid, text, integer) to authenticated;

-- 2. Visibility: any student enrolled in the course can see the group --------

create or replace function private.can_view_group(
  p_group_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.study_groups g
    where g.id = p_group_id and p_profile_id is not null
      and (
        private.is_active_group_member(g.id, p_profile_id)
        or (
          g.status in ('forming', 'active')
          and private.is_current_term(g.term_id)
          and private.is_enrolled(p_profile_id, g.course_id)
        )
        or (g.status = 'forming' and (
          g.creator_id = p_profile_id
          or exists (
            select 1 from public.group_invitations i
            where i.group_id = g.id and i.recipient_id = p_profile_id
              and i.status = 'pending'
          )
        ))
      )
  );
$function$;

-- 3. Browsing: drop the "at least two members" gate -------------------------

create or replace function private.can_browse_current_term_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.study_groups as g
       join public.citylink_settings as s
         on s.singleton and s.current_term_id = g.term_id
       join public.enrolments as e
         on e.course_id = g.course_id
        and e.student_id = (select auth.uid())
       where g.id = p_group_id
         and g.status in ('forming', 'active')
     );
$function$;

-- 4. The browse list itself also required two members -----------------------

create or replace function public.list_current_term_course_groups_capacity(
  p_course_id uuid,
  p_after_group_name text default null,
  p_after_group_id uuid default null,
  p_limit integer default 25,
  p_search text default null
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
set search_path to ''
as $function$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
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
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'search text must be at most 100 characters';
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
        and (
          v_search is null
          or position(lower(v_search) in lower(g.name)) > 0
        )
      group by g.id, g.name, g.status, g.creator_id, g.max_members
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

revoke all on function public.list_current_term_course_groups_capacity(uuid, text, uuid, integer, text) from public, anon;
grant execute on function public.list_current_term_course_groups_capacity(uuid, text, uuid, integer, text) to authenticated;

-- 5. Posting: membership is the requirement, not the group's status ---------

create or replace function public.create_group_recruitment_post(
  p_group_id uuid,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_post_id uuid;
  v_course_id uuid;
  v_term_id uuid;
  v_group_status text;
  v_author_name text;
  v_subject text := btrim(p_subject);
  v_body text := btrim(p_body);
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if v_subject is null or char_length(v_subject) < 1 or char_length(v_subject) > 120 then
    raise exception 'subject must contain 1 to 120 characters';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'post must contain 1 to 2000 characters';
  end if;
  perform 1
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.profile_id = (select auth.uid())
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'only an active member of a current-term group may post';
  end if;
  select g.course_id, g.term_id, g.status
    into v_course_id, v_term_id, v_group_status
  from public.study_groups as g where g.id = p_group_id
  for update;
  -- Role 6 finding F6: membership alone already implies the group is not
  -- abandoned, but reject it explicitly rather than relying on that.
  if v_course_id is null
     or v_group_status = 'abandoned'
     or not private.is_current_term(v_term_id)
     or not private.is_enrolled((select auth.uid()), v_course_id)
     or not private.is_active_group_member(p_group_id, (select auth.uid())) then
    raise exception 'only an active member of a current-term group may post';
  end if;
  select p.display_name into v_author_name
  from public.profiles as p where p.id = (select auth.uid());
  insert into public.group_recruitment_posts (
    group_id, course_id, term_id, author_id, author_name_snapshot, subject, body
  ) values (
    p_group_id, v_course_id, v_term_id, (select auth.uid()),
    coalesce(nullif(v_author_name, ''), 'CityLink member'), v_subject, v_body
  ) returning id into v_post_id;
  return v_post_id;
end;
$function$;

revoke all on function public.create_group_recruitment_post(uuid, text, text) from public, anon;
grant execute on function public.create_group_recruitment_post(uuid, text, text) to authenticated;
