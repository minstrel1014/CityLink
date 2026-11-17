-- Review-only proposal for CityLink-Stage5-Test (wkzclgmhrtecnpexfesr).
-- Role 6 must review this forward-only migration. The CityLink lead must
-- separately approve applying it to disposable Test. Never apply to Main.
--
-- It adds only three authenticated RPCs. It does not change table RLS, table
-- grants, membership, invitation, join-request, or group-capacity behavior.

create or replace function public.list_current_course_enrolment_counts()
returns table(course_id uuid, enrolled_count bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    course.id as course_id,
    count(enrolment.student_id)::bigint as enrolled_count
  from public.courses as course
  join public.citylink_settings as setting
    on setting.singleton
   and setting.current_term_id = course.term_id
  left join public.enrolments as enrolment
    on enrolment.course_id = course.id
  where (select auth.uid()) is not null
  group by course.id, course.code
  order by course.code, course.id;
$function$;

revoke all on function public.list_current_course_enrolment_counts()
  from public;
revoke all on function public.list_current_course_enrolment_counts()
  from anon;
grant execute on function public.list_current_course_enrolment_counts()
  to authenticated;

create or replace function public.list_course_group_summaries(
  p_course_id uuid
)
returns table(
  profile_id uuid,
  group_id uuid,
  group_name text,
  group_status text,
  group_size bigint
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    peer.id as profile_id,
    study_group.id as group_id,
    study_group.name as group_name,
    study_group.status as group_status,
    (
      select count(*)::bigint
      from public.group_memberships as membership
      where membership.group_id = study_group.id
        and membership.term_id = study_group.term_id
        and membership.membership_status = 'active'
    ) + case
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
      then 1::bigint
      else 0::bigint
    end as group_size
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
  order by peer.id, study_group.id;
$function$;

revoke all on function public.list_course_group_summaries(uuid)
  from public;
revoke all on function public.list_course_group_summaries(uuid)
  from anon;
grant execute on function public.list_course_group_summaries(uuid)
  to authenticated;

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
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception 'group names must contain between 1 and 120 characters';
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

revoke all on function public.rename_study_group(uuid, text)
  from public;
revoke all on function public.rename_study_group(uuid, text)
  from anon;
grant execute on function public.rename_study_group(uuid, text)
  to authenticated;
