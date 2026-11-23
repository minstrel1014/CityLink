-- DRAFT ONLY — NOT APPLIED, NOT REVIEWED.
-- Purpose: add server-side name search to the capacity-aware group list used by
--   the People page ("Find your groupmate") of a course.
-- Target: pijslbchvstkoweslymr (CityLink Launch). Requires: Role 6 exact-head review,
--   Adam's explicit SQL-head + target authorization, and an immediately preceding preflight.
-- Contract note: the four-argument signature is recorded as an approved contract in
--   docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md:212, the identity matrix
--   (docs/capacity-successor/PREBLOB_RECONCILIATION_AND_LAUNCH_MATRIX_20261123.md:151) and
--   preflight check A-CAP-04. Widening it therefore requires an explicit contract amendment
--   from Adam plus updates to those three places. Prototype is a separate database project
--   that has no such function at all; the statement about it is irrelevant to this change.
-- Backward compatibility: the new function keeps the same name and returns the same
--   9 columns in the same order; the four existing arguments keep their defaults, so a
--   four-argument call still resolves (all trailing defaults). The superseded four-argument
--   function must be dropped in the same transaction to avoid overload ambiguity.

begin;

drop function if exists public.list_current_term_course_groups_capacity(uuid, text, uuid, integer);

create or replace function public.list_current_term_course_groups_capacity(
  p_course_id uuid,
  p_after_group_name text default null,
  p_after_group_id uuid default null,
  p_limit integer default 25,
  p_search text default null
)
returns table(
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
        -- server-side name filter; position() avoids treating % and _ as wildcards
        and (
          v_search is null
          or position(lower(v_search) in lower(g.name)) > 0
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

revoke all on function public.list_current_term_course_groups_capacity(uuid, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.list_current_term_course_groups_capacity(uuid, text, uuid, integer, text) to authenticated;

-- Post-condition: exactly one overload must exist and it must be the five-argument form.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'list_current_term_course_groups_capacity';
  if v_count <> 1 then
    raise exception 'expected exactly one list_current_term_course_groups_capacity overload, found %', v_count;
  end if;
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'list_current_term_course_groups_capacity'
    and p.pronargs = 5;
  if v_count <> 1 then
    raise exception 'expected the five-argument overload to exist, found %', v_count;
  end if;
end;
$$;

commit;
