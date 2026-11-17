-- Review-only proposal for CityLink-Stage5-Test (wkzclgmhrtecnpexfesr).
-- Do not apply until the CityLink lead has reviewed this SQL and explicitly
-- approved applying this migration to disposable Test. Never apply to Main.
--
-- The function returns only profile UUIDs that may be offered an invitation.
-- It does not return group IDs, group names, roles, or membership rows. The
-- existing mutation RPC remains authoritative if eligibility changes after
-- this read or if a group-specific pending-action conflict exists.

create or replace function public.list_course_group_invite_candidates(
  p_course_id uuid
)
returns table(profile_id uuid)
language sql
stable
security definer
set search_path to ''
as $function$
  select peer.id as profile_id
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
  where course.id = p_course_id
    and peer.id is distinct from (select auth.uid())
    and peer.status in ('open', 'considering')
    and not exists (
      select 1
      from public.group_memberships as membership
      where membership.profile_id = peer.id
        and membership.course_id = course.id
        and membership.term_id = setting.current_term_id
        and membership.membership_status = 'active'
    )
  order by peer.id;
$function$;

revoke all on function public.list_course_group_invite_candidates(uuid)
  from public;
revoke all on function public.list_course_group_invite_candidates(uuid)
  from anon;
grant execute on function public.list_course_group_invite_candidates(uuid)
  to authenticated;
