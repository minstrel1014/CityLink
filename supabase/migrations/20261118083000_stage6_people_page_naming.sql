-- CityLink Stage 6 follow-up: people page, group naming, recruitment subject, display names.
-- Forward-only. Authorized by Adam for the disposable Test project only (2026-11-18).
-- Preflight on Test: 0 invalid display names, 0 long group names, 5 empty legacy groups.
-- Main must not be touched without a new written authorization.

BEGIN;

-- 1. Display names ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'New CityLink member'),
      50
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profiles
  add constraint profiles_display_name_length_chk
  check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 50
  ) not valid;

alter table public.profiles
  validate constraint profiles_display_name_length_chk;

create or replace function public.update_own_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(p_display_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'display name must contain between 1 and 50 characters';
  end if;
  if v_name = 'New CityLink member' then
    raise exception 'please choose your own display name';
  end if;
  update public.profiles
  set display_name = v_name,
      updated_at = clock_timestamp()
  where id = v_actor;
  if not found then
    raise exception 'profile not found';
  end if;
  return v_name;
end;
$function$;

revoke all on function public.update_own_display_name(text) from public, anon;
grant execute on function public.update_own_display_name(text) to authenticated;

-- 2. Group names -----------------------------------------------------------

alter table public.study_groups
  add constraint study_groups_name_length_chk
  check (
    name = ''
    or (name = btrim(name) and char_length(name) between 1 and 50)
  ) not valid;

alter table public.study_groups
  validate constraint study_groups_name_length_chk;

drop function public.create_group_and_invite(uuid, uuid);

create function public.create_group_and_invite(
  p_course_id uuid,
  p_recipient_id uuid,
  p_name text
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
  v_invitation uuid;
  v_actor_name text;
  v_recipient_name text;
  v_name text := btrim(p_name);
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'group name must contain 1 to 50 characters';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;
  select c.term_id into v_term from public.courses c where c.id = p_course_id;
  if v_term is null or not private.lock_current_term(v_term) then
    raise exception 'course is not in the current academic term';
  end if;
  perform private.lock_course_profiles(p_course_id, v_term, v_actor, p_recipient_id);
  if not private.is_enrolled(v_actor, p_course_id)
     or not private.is_enrolled(p_recipient_id, p_course_id) then
    raise exception 'both students must be enrolled in the course';
  end if;
  select p.display_name into v_actor_name from public.profiles p where p.id = v_actor;
  select p.display_name into v_recipient_name from public.profiles p
    where p.id = p_recipient_id and p.status in ('open', 'considering');
  if v_recipient_name is null then raise exception 'recipient is not accepting invitations'; end if;
  if exists (
    select 1 from public.group_memberships m
    where m.profile_id in (v_actor, p_recipient_id)
      and m.course_id = p_course_id and m.term_id = v_term
      and m.membership_status = 'active'
  ) then raise exception 'a participant already belongs to a group for this course and term'; end if;
  select g.id into v_group from public.study_groups g
  where g.creator_id = v_actor and g.course_id = p_course_id
    and g.term_id = v_term and g.status = 'forming'
  for update;
  if v_group is null then
    insert into public.study_groups(course_id, term_id, creator_id, status, name)
    values (p_course_id, v_term, v_actor, 'forming', v_name) returning id into v_group;
  end if;
  select i.id into v_invitation from public.group_invitations i
  where i.group_id = v_group and i.recipient_id = p_recipient_id and i.status = 'pending';
  if v_invitation is null then
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

revoke all on function public.create_group_and_invite(uuid, uuid, text) from public, anon;
grant execute on function public.create_group_and_invite(uuid, uuid, text) to authenticated;

create or replace function public.rename_study_group(
  p_group_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_term_id uuid;
  v_creator_id uuid;
  v_group_status text;
  v_name text := btrim(p_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'group names must contain between 1 and 50 characters';
  end if;
  select study_group.term_id
    into v_term_id
  from public.study_groups as study_group
  where study_group.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  perform private.lock_current_term(v_term_id);
  select study_group.term_id, study_group.creator_id, study_group.status
    into v_term_id, v_creator_id, v_group_status
  from public.study_groups as study_group
  where study_group.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.is_current_term(v_term_id)
     or v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator_id is distinct from v_actor
     or (
       v_group_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may rename this group';
  end if;
  update public.study_groups as study_group
  set name = v_name,
      updated_at = clock_timestamp()
  where study_group.id = p_group_id;
end;
$function$;

-- 3. Course group list: hide the viewer's own group ------------------------

create or replace function public.list_current_term_course_groups(
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
      select g.id as group_id,
             g.name as group_name,
             g.status as group_status,
             count(m.id) as active_member_count,
             (g.status = 'active' and exists (
               select 1 from public.group_memberships as own_membership
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
          select 1 from public.group_memberships as own_m
          where own_m.group_id = g.id
            and own_m.profile_id = (select auth.uid())
            and own_m.membership_status = 'active'
        )
      group by g.id, g.name, g.status
      having count(m.id) >= 2
    ), page as (
      select e.*,
             (count(*) over () > p_limit) as has_more
      from eligible as e
      where p_after_group_name is null
         or (e.group_name, e.group_id) > (p_after_group_name, p_after_group_id)
      order by e.group_name, e.group_id
      limit p_limit
    )
    select page.group_id, page.group_name, page.group_status,
           page.active_member_count, page.can_create_post, page.has_more
    from page;
end;
$function$;

-- 4. Member lists: a member may read their own one-member group ------------

create or replace function public.list_current_term_group_members(
  p_group_id uuid,
  p_after_joined_at timestamptz default null,
  p_after_membership_id uuid default null,
  p_limit integer default 50
)
returns table (
  profile_id uuid,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[],
  cursor_joined_at timestamptz,
  cursor_membership_id uuid,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (p_after_joined_at is null) <> (p_after_membership_id is null) then
    raise exception 'both member pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  return query
    with eligible_group as (
      select g.id
      from public.study_groups as g
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = g.term_id
      where g.id = p_group_id
        and g.status in ('forming', 'active')
        and (
          (select count(*) from public.group_memberships as active_m
           where active_m.group_id = g.id
             and active_m.membership_status = 'active') >= 2
          or private.is_active_group_member(g.id, (select auth.uid()))
        )
    ), roster as (
      select p.id as profile_id, p.display_name, p.major, p.year, p.bio, p.skills,
             m.joined_at as cursor_joined_at, m.id as cursor_membership_id
      from eligible_group as eg
      join public.group_memberships as m
        on m.group_id = eg.id and m.membership_status = 'active'
      join public.profiles as p on p.id = m.profile_id
      where p.id = (select auth.uid())
         or private.shares_course_with(p.id)
    ), page as (
      select r.*,
             (count(*) over () > p_limit) as has_more
      from roster as r
      where p_after_joined_at is null
         or (r.cursor_joined_at, r.cursor_membership_id)
              > (p_after_joined_at, p_after_membership_id)
      order by r.cursor_joined_at, r.cursor_membership_id
      limit p_limit
    )
    select page.profile_id, page.display_name, page.major, page.year,
           page.bio, page.skills, page.cursor_joined_at,
           page.cursor_membership_id, page.has_more
    from page;
end;
$function$;

create or replace function public.get_current_term_group_member_profile(
  p_group_id uuid,
  p_profile_id uuid
)
returns table (
  profile_id uuid,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.major, p.year, p.bio, p.skills
  from public.study_groups as g
  join public.citylink_settings as s
    on s.singleton and s.current_term_id = g.term_id
  join public.group_memberships as m
    on m.group_id = g.id
   and m.profile_id = p_profile_id
   and m.membership_status = 'active'
  join public.profiles as p on p.id = p_profile_id
  where (select auth.uid()) is not null
    and g.id = p_group_id
    and g.status in ('forming', 'active')
    and (
      (select count(*) from public.group_memberships as active_m
       where active_m.group_id = g.id
         and active_m.membership_status = 'active') >= 2
      or private.is_active_group_member(g.id, (select auth.uid()))
    )
    and (p_profile_id = (select auth.uid())
         or private.shares_course_with(p_profile_id));
$function$;

-- 5. Ungrouped coursemates and coursemate profiles -------------------------

create function public.list_course_ungrouped_classmates(
  p_course_id uuid,
  p_after_display_name text default null,
  p_after_profile_id uuid default null,
  p_limit integer default 25
)
returns table (
  profile_id uuid,
  display_name text,
  year smallint,
  major text,
  skills text[],
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (p_after_display_name is null) <> (p_after_profile_id is null) then
    raise exception 'both pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  return query
    with eligible as (
      select p.id as profile_id, p.display_name, p.year, p.major, p.skills
      from public.profiles as p
      join public.enrolments as target_enrolment
        on target_enrolment.student_id = p.id
       and target_enrolment.course_id = p_course_id
      join public.courses as c on c.id = target_enrolment.course_id
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = c.term_id
      join public.enrolments as viewer_enrolment
        on viewer_enrolment.student_id = (select auth.uid())
       and viewer_enrolment.course_id = p_course_id
      where p.id <> (select auth.uid())
        and not exists (
          select 1 from public.group_memberships as m
          where m.profile_id = p.id
            and m.course_id = p_course_id
            and m.term_id = c.term_id
            and m.membership_status = 'active'
        )
    ), page as (
      select e.*,
             (count(*) over () > p_limit) as has_more
      from eligible as e
      where p_after_display_name is null
         or (e.display_name, e.profile_id) > (p_after_display_name, p_after_profile_id)
      order by e.display_name, e.profile_id
      limit p_limit
    )
    select page.profile_id, page.display_name, page.year, page.major,
           page.skills, page.has_more
    from page;
end;
$function$;

create function public.get_current_term_coursemate_profile(
  p_course_id uuid,
  p_profile_id uuid
)
returns table (
  profile_id uuid,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.major, p.year, p.bio, p.skills
  from public.profiles as p
  join public.enrolments as target_enrolment
    on target_enrolment.student_id = p.id
   and target_enrolment.course_id = p_course_id
  join public.courses as c on c.id = target_enrolment.course_id
  join public.citylink_settings as s
    on s.singleton and s.current_term_id = c.term_id
  join public.enrolments as viewer_enrolment
    on viewer_enrolment.student_id = (select auth.uid())
   and viewer_enrolment.course_id = p_course_id
  where (select auth.uid()) is not null
    and p.id = p_profile_id;
$function$;

revoke all on function public.list_course_ungrouped_classmates(uuid, text, uuid, integer) from public, anon;
revoke all on function public.get_current_term_coursemate_profile(uuid, uuid) from public, anon;
grant execute on function public.list_course_ungrouped_classmates(uuid, text, uuid, integer) to authenticated;
grant execute on function public.get_current_term_coursemate_profile(uuid, uuid) to authenticated;

-- 6. Recruitment posts: subject -------------------------------------------

alter table public.group_recruitment_posts add column subject text;

update public.group_recruitment_posts
set subject = 'Recruitment post'
where subject is null;

alter table public.group_recruitment_posts alter column subject set not null;

alter table public.group_recruitment_posts
  add constraint group_recruitment_posts_subject_length_chk
  check (subject = btrim(subject) and char_length(subject) between 1 and 120) not valid;

alter table public.group_recruitment_posts
  validate constraint group_recruitment_posts_subject_length_chk;

drop function public.create_group_recruitment_post(uuid, text);

create function public.create_group_recruitment_post(
  p_group_id uuid,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
    raise exception 'only an active member of an active current-term group may post';
  end if;
  select g.course_id, g.term_id, g.status
    into v_course_id, v_term_id, v_group_status
  from public.study_groups as g where g.id = p_group_id
  for update;
  if v_course_id is null or v_group_status <> 'active'
     or not private.is_current_term(v_term_id)
     or not private.is_enrolled((select auth.uid()), v_course_id)
     or not private.is_active_group_member(p_group_id, (select auth.uid())) then
    raise exception 'only an active member of an active current-term group may post';
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

drop function public.edit_group_recruitment_post(uuid, text);

create function public.edit_group_recruitment_post(
  p_post_id uuid,
  p_subject text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject text := btrim(p_subject);
  v_body text := btrim(p_body);
  v_group_id uuid;
begin
  if v_subject is null or char_length(v_subject) < 1 or char_length(v_subject) > 120 then
    raise exception 'subject must contain 1 to 120 characters';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'post must contain 1 to 2000 characters';
  end if;
  select p.group_id into v_group_id
  from public.group_recruitment_posts as p where p.id = p_post_id;
  perform 1
  from public.group_memberships as m
  where m.group_id = v_group_id
    and m.profile_id = (select auth.uid())
    and m.membership_status = 'active'
  for update;
  if v_group_id is null or not found
     or not private.can_manage_recruitment_post(p_post_id) then
    raise exception 'only the active post author may edit this post';
  end if;
  update public.group_recruitment_posts
  set subject = v_subject, body = v_body, updated_at = now()
  where id = p_post_id and status = 'open';
  if not found then
    raise exception 'post is no longer open';
  end if;
end;
$function$;

revoke all on function public.edit_group_recruitment_post(uuid, text, text) from public, anon;
grant execute on function public.edit_group_recruitment_post(uuid, text, text) to authenticated;

drop function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer);

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
  author_name text,
  body text,
  post_status text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  apply_enabled boolean,
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
      select p.id as post_id,
             case when g.status in ('forming', 'active') then g.id else null end as group_id,
             case when g.status in ('forming', 'active') then g.name else null end as group_name,
             p.subject,
             case when g.status in ('forming', 'active') then
               (select count(*) from public.group_memberships as m
                where m.group_id = g.id and m.membership_status = 'active')
               else null end as active_member_count,
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
                 select 1 from public.profiles as viewer
                 where viewer.id = (select auth.uid())
                   and viewer.status in ('open', 'considering')
               )
               and not exists (
                 select 1 from public.group_memberships as own_m
                 where own_m.profile_id = (select auth.uid())
                   and own_m.course_id = p.course_id
                   and own_m.term_id = p.term_id
                   and own_m.membership_status = 'active'
               )
               and not exists (
                 select 1 from public.group_invitations as i
                 where i.group_id = p.group_id
                   and i.recipient_id = (select auth.uid())
                   and i.status = 'pending'
               )
               and not exists (
                 select 1 from public.group_join_requests as r
                 where r.group_id = p.group_id
                   and r.requester_id = (select auth.uid())
                   and r.status = 'pending'
               )) as apply_enabled,
             private.can_manage_recruitment_post(p.id) as can_manage
      from public.group_recruitment_posts as p
      join public.study_groups as g
        on g.id = p.group_id and g.course_id = p.course_id and g.term_id = p.term_id
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = p.term_id
      join public.enrolments as e
        on e.course_id = p.course_id and e.student_id = (select auth.uid())
      where p.course_id = p_course_id
    ), page as (
      select e.*,
             (count(*) over () > p_limit) as has_more
      from eligible as e
      where p_after_created_at is null
         or (e.created_at, e.post_id) < (p_after_created_at, p_after_id)
      order by e.created_at desc, e.post_id desc
      limit p_limit
    )
    select page.post_id, page.group_id, page.group_name, page.subject,
           page.active_member_count, page.author_name, page.body,
           page.post_status, page.created_at, page.updated_at, page.closed_at,
           page.apply_enabled, page.can_manage, page.has_more
    from page;
end;
$function$;

revoke all on function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer) to authenticated;

COMMIT;
