-- CityLink: leave a group, and give legacy forming groups their creator back.
--
-- Adam authorised both on 2026-11-24 01:30 (Asia/Taipei): a "quit group" action
-- was missing from the My group page, and he approved a one-time backfill for
-- groups created before create_group_alone existed.
--
-- Applied to pijslbchvstkoweslymr on 2026-11-24. Verified by running each
-- statement inside a transaction that was rolled back, then confirming that no
-- row was left behind.

-- 1. Leaving a group -------------------------------------------------------

create or replace function public.leave_group(p_group_id uuid)
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
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null then
    raise exception 'invalid group';
  end if;
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
  -- Same lock order as remove_group_member: profile pair, then membership,
  -- then the group row.
  perform private.lock_course_profiles(v_course, v_term, v_actor, v_actor);
  select m.id into v_membership_id
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.course_id = v_course
    and m.term_id = v_term
    and m.profile_id = v_actor
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'you are not an active member of this group';
  end if;
  select g.status into v_group_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  -- Membership history is preserved: the row is ended, never deleted, so the
  -- membership-end triggers can hand leadership on or abandon an empty group.
  update public.group_memberships
  set membership_status = 'left',
      ended_at = clock_timestamp()
  where id = v_membership_id
    and membership_status = 'active';
  if not found then
    raise exception 'you are no longer an active member of this group';
  end if;
  -- The leaver's own pending invitations are cancelled here rather than
  -- through private.cancel_pending_invitations_from_removed_member, which is
  -- leader-only by design and rejects a member leaving on their own.
  update public.group_invitations
  set status = 'cancelled',
      responded_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where group_id = p_group_id
    and sender_id = v_actor
    and status = 'pending';
  return 'left';
end;
$function$;

revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- 2. One-time backfill: legacy forming groups get their creator as a member --

-- Before create_group_alone, creating a group wrote no membership row for the
-- creator. Those groups therefore had no members at all: their creator was not
-- counted, they could not publish, and after the visibility change they would
-- have shown as empty groups to other students.
--
-- Scope is deliberately narrow: only `forming` groups, only where the creator
-- still has no active membership in that group, and only where the creator has
-- no other active membership in the same course and term, so the one-group
-- rule is never broken by the backfill. The statement is idempotent: a second
-- run matches nothing.
insert into public.group_memberships (
  group_id, course_id, term_id, profile_id, display_name_snapshot,
  membership_status
)
select
  g.id,
  g.course_id,
  g.term_id,
  g.creator_id,
  left(coalesce(nullif(btrim(p.display_name), ''), 'CityLink member'), 120),
  'active'
from public.study_groups as g
join public.profiles as p on p.id = g.creator_id
where g.status = 'forming'
  and g.creator_id is not null
  and not exists (
    select 1 from public.group_memberships m
    where m.group_id = g.id and m.profile_id = g.creator_id
      and m.membership_status = 'active'
  )
  and not exists (
    select 1 from public.group_memberships m2
    where m2.profile_id = g.creator_id and m2.course_id = g.course_id
      and m2.term_id = g.term_id and m2.membership_status = 'active'
  );
