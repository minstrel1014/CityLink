-- Reconstructed 2026-11-18 from the live CityLink Test catalog
-- (project CityLink-Stage5-Test, ref wkzclgmhrtecnpexfesr).
--
-- Why this file exists: the original 2026-11-02 Stage 5 roster RPC migration
-- was applied directly to Test and was never saved as a repository file.
-- Without it, the checked-in Stage 5 recipe is incomplete.
--
-- Scope: public.list_course_classmates(p_course_id uuid) and its EXECUTE
-- grants. The function is reproduced exactly as it exists on Test.
--
-- Privacy note (Role 6, Stage 6 handoff): this RPC returns student_id and
-- status, which are outside the later approved current-term peer field
-- allowlist. It is reproduced unchanged here only for parity with Test.
-- Tightening it, or replacing its callers with the narrower Stage 6 RPCs, is
-- a separate decision that must be made before promotion to Main.
--
-- NOT applied by this PR. Do NOT run on Test (already applied there). Main
-- requires Role 6 review and the lead's separate approval.

begin;

create or replace function public.list_course_classmates(p_course_id uuid)
returns table(
  profile_id uuid,
  student_id text,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[],
  status text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    peer.id as profile_id,
    peer.student_id,
    peer.display_name,
    peer.major,
    peer.year,
    peer.bio,
    peer.skills,
    peer.status
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
  order by pg_catalog.lower(peer.display_name), peer.id;
$function$;

revoke execute on function public.list_course_classmates(uuid) from public, anon;
grant execute on function public.list_course_classmates(uuid) to authenticated;

commit;
