-- Reconstructed 2026-11-18 from the live CityLink Test catalog
-- (project CityLink-Stage5-Test, ref wkzclgmhrtecnpexfesr).
--
-- Why this file exists: the original 2026-11-02 Stage 5 base migration was
-- applied directly to Test and was never saved as a repository file. Without
-- it, the checked-in Stage 5 recipe is incomplete and cannot be applied to
-- Supabase Main.
--
-- Scope: the four group tables, their indexes, RLS and SELECT policies, the
-- private helper functions, and the base public RPCs. The later files
-- (authority_and_succession, course_group_invite_candidates,
-- course_detail_group_views) build on these objects and are applied after this
-- file.
--
-- NOT applied by this PR. Do NOT run on Test (already applied there). Main
-- requires Role 6 review and the lead's separate approval. Statements are
-- idempotent so a re-run where objects already exist is a no-op.
--
-- Note: public.enforce_invitation_integrity is reproduced for parity but has
-- no trigger on Test or Main; its checks are not enforced at table level.
-- Attaching a trigger is a separate decision.

-- Known dependency: the composite foreign keys require
-- public.courses(id, term_id) to be unique on the target database. Confirm
-- with a read-only schema comparison before applying to Main.

begin;

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  term_id uuid not null,
  creator_id uuid references public.profiles (id) on delete set null,
  status text not null default 'forming'
    check (status in ('forming', 'active', 'abandoned', 'archived')),
  name text not null default '' check (char_length(name) <= 120),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_groups_id_course_id_term_id_key
    unique (id, course_id, term_id),
  constraint study_groups_course_term_fkey
    foreign key (course_id, term_id) references public.courses (id, term_id)
    on delete restrict,
  constraint study_groups_term_id_fkey
    foreign key (term_id) references public.academic_terms (id)
    on delete restrict
);

create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  course_id uuid not null,
  term_id uuid not null,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name_snapshot text not null default 'Deleted User'
    check (char_length(display_name_snapshot) between 1 and 120),
  membership_status text not null default 'active'
    check (membership_status in ('active', 'left', 'removed', 'account_deleted')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_memberships_check check (
    (membership_status = 'active' and ended_at is null and profile_id is not null)
    or (membership_status <> 'active' and ended_at is not null)
  ),
  constraint group_memberships_group_course_term_fkey
    foreign key (group_id, course_id, term_id)
    references public.study_groups (id, course_id, term_id)
    on delete restrict
);

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  course_id uuid not null,
  term_id uuid not null,
  sender_id uuid references public.profiles (id) on delete set null,
  recipient_id uuid references public.profiles (id) on delete set null,
  sender_name_snapshot text not null default 'Deleted User'
    check (char_length(sender_name_snapshot) between 1 and 120),
  recipient_name_snapshot text not null default 'Deleted User'
    check (char_length(recipient_name_snapshot) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint group_invitations_check check (
    sender_id is null or recipient_id is null or sender_id <> recipient_id
  ),
  constraint group_invitations_group_course_term_fkey
    foreign key (group_id, course_id, term_id)
    references public.study_groups (id, course_id, term_id)
    on delete restrict
);

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  course_id uuid not null,
  term_id uuid not null,
  requester_id uuid references public.profiles (id) on delete set null,
  requester_name_snapshot text not null default 'Deleted User'
    check (char_length(requester_name_snapshot) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint group_join_requests_group_course_term_fkey
    foreign key (group_id, course_id, term_id)
    references public.study_groups (id, course_id, term_id)
    on delete restrict
);

create index if not exists study_groups_course_term_status_idx
  on public.study_groups (course_id, term_id, status);
create unique index if not exists study_groups_one_forming_per_creator_course_term_idx
  on public.study_groups (creator_id, course_id, term_id)
  where creator_id is not null and status = 'forming';

-- Required by the composite foreign keys below. Safe because id is already
-- the primary key, so (id, term_id) cannot contain duplicates. The term-model
-- migration creates it too; this keeps the file self-contained.
create unique index if not exists courses_id_term_id_uidx
  on public.courses (id, term_id);

create index if not exists group_memberships_group_status_idx
  on public.group_memberships (group_id, membership_status);
create unique index if not exists group_memberships_one_active_per_student_course_term_idx
  on public.group_memberships (profile_id, course_id, term_id)
  where membership_status = 'active' and profile_id is not null;
create unique index if not exists group_memberships_one_active_row_per_group_profile_idx
  on public.group_memberships (group_id, profile_id)
  where membership_status = 'active' and profile_id is not null;

create index if not exists group_invitations_group_idx
  on public.group_invitations (group_id, created_at);
create unique index if not exists group_invitations_one_pending_per_group_recipient_idx
  on public.group_invitations (group_id, recipient_id)
  where status = 'pending';
create index if not exists group_invitations_recipient_idx
  on public.group_invitations (recipient_id, created_at desc);
create index if not exists group_invitations_sender_idx
  on public.group_invitations (sender_id, created_at desc);

create index if not exists group_join_requests_group_idx
  on public.group_join_requests (group_id, created_at desc);
create unique index if not exists group_join_requests_one_pending_per_group_requester_idx
  on public.group_join_requests (group_id, requester_id)
  where status = 'pending';
create index if not exists group_join_requests_requester_idx
  on public.group_join_requests (requester_id, created_at desc);

create or replace function private.is_enrolled(
  p_profile_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select p_profile_id is not null and p_course_id is not null and exists (
    select 1 from public.enrolments e
    where e.student_id = p_profile_id and e.course_id = p_course_id
  );
$function$;

create or replace function private.both_enrolled_in_course(
  p_left_profile_id uuid,
  p_right_profile_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_left_profile_id is not null
    and p_right_profile_id is not null
    and p_course_id is not null
    and p_left_profile_id <> p_right_profile_id
    and exists (
      select 1
      from public.enrolments as left_enrolment
      join public.enrolments as right_enrolment
        on right_enrolment.course_id = left_enrolment.course_id
      where left_enrolment.student_id = p_left_profile_id
        and right_enrolment.student_id = p_right_profile_id
        and left_enrolment.course_id = p_course_id
    );
$function$;

create or replace function private.is_current_term(p_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.citylink_settings s
    where s.singleton and s.current_term_id = p_term_id
  );
$function$;

create or replace function private.lock_current_term(p_term_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current_term uuid;
begin
  select s.current_term_id into v_current_term
  from public.citylink_settings s where s.singleton for share;
  return v_current_term is not null and v_current_term = p_term_id;
end;
$function$;

create or replace function private.lock_course_profile(
  p_course_id uuid,
  p_term_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_profile_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_course_id::text || ':' || p_term_id::text || ':' || p_profile_id::text, 0
      )
    );
    perform p.id from public.profiles p where p.id = p_profile_id for share;
    perform e.student_id from public.enrolments e
    where e.student_id = p_profile_id and e.course_id = p_course_id
    for key share;
  end if;
end;
$function$;

create or replace function private.lock_course_profiles(
  p_course_id uuid,
  p_term_id uuid,
  p_profile_a uuid,
  p_profile_b uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_profile_a is null then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
  elsif p_profile_b is null or p_profile_a = p_profile_b then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
  elsif p_profile_a::text < p_profile_b::text then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
  else
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
  end if;
end;
$function$;

create or replace function private.is_active_group_member(
  p_group_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select p_group_id is not null and p_profile_id is not null and exists (
    select 1 from public.group_memberships m
    where m.group_id = p_group_id and m.profile_id = p_profile_id
      and m.membership_status = 'active'
  );
$function$;

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
        or (g.status = 'active' and private.is_current_term(g.term_id)
            and private.is_enrolled(p_profile_id, g.course_id))
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

create or replace function private.maybe_abandon_empty_forming_group(p_group_id uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.study_groups g
  set status = 'abandoned', updated_at = clock_timestamp()
  where g.id = p_group_id and g.status = 'forming'
    and not exists (
      select 1 from public.group_invitations i
      where i.group_id = g.id and i.status = 'pending'
    )
    and not exists (
      select 1 from public.group_memberships m
      where m.group_id = g.id and m.membership_status = 'active'
    );
$function$;

create or replace function private.recipient_can_receive_invitation(
  p_recipient_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_recipient_profile_id is not null
    and exists (
      select 1
      from public.profiles as recipient
      where recipient.id = p_recipient_profile_id
        and recipient.status in ('open', 'considering')
    );
$function$;

create or replace function private.shares_course_with(p_other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (select auth.uid()) is not null
    and (select auth.uid()) <> p_other_profile_id
    and exists (
      select 1
      from public.enrolments as mine
      join public.enrolments as theirs
        on theirs.course_id = mine.course_id
      where mine.student_id = (select auth.uid())
        and theirs.student_id = p_other_profile_id
    );
$function$;

create or replace function public.enforce_invitation_integrity()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'new invitations must be pending';
    end if;

    if new.sender_id is not distinct from new.recipient_id then
      raise exception 'an invitation cannot target its sender';
    end if;

    if not private.both_enrolled_in_course(new.sender_id, new.recipient_id, new.course_id) then
      raise exception 'both invitation participants must be enrolled in the course';
    end if;

    if not private.recipient_can_receive_invitation(new.recipient_id) then
      raise exception 'the recipient is not accepting group invitations';
    end if;

    -- Do not trust browser-supplied identifiers or timestamps.
    new.id := gen_random_uuid();
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.responded_at := null;
    new.cancelled_at := null;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.course_id is distinct from old.course_id
     or new.created_at is distinct from old.created_at then
    raise exception 'invitation identity fields are immutable';
  end if;

  if old.status <> 'pending' then
    raise exception 'a final invitation cannot be changed';
  end if;

  if new.status in ('accepted', 'declined') then
    if auth.uid() is distinct from old.recipient_id then
      raise exception 'only the invitation recipient may accept or decline';
    end if;
    new.responded_at := clock_timestamp();
    new.cancelled_at := null;
  elsif new.status = 'cancelled' then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the invitation sender may cancel';
    end if;
    new.responded_at := null;
    new.cancelled_at := clock_timestamp();
  else
    raise exception 'pending invitations may only be accepted, declined, or cancelled';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

create or replace function public.create_group_and_invite(
  p_course_id uuid,
  p_recipient_id uuid
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
begin
  if v_actor is null then raise exception 'authentication required'; end if;
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
    insert into public.study_groups(course_id, term_id, creator_id, status)
    values (p_course_id, v_term, v_actor, 'forming') returning id into v_group;
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
  if v_actor is null then raise exception 'authentication required'; end if;
  if p_accept is null then raise exception 'accept/decline choice is required'; end if;
  select i.group_id, i.course_id, i.term_id, i.sender_id, i.recipient_id
    into v_group, v_course, v_term, v_sender, v_recipient
  from public.group_invitations i where i.id = p_invitation_id;
  if not found or v_sender is null or v_recipient is null then
    raise exception 'invitation not found';
  end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_sender, v_recipient);
  select g.status into v_group_status from public.study_groups g
    where g.id = v_group for update;
  if not found then raise exception 'group not found'; end if;
  select i.status into v_status from public.group_invitations i
    where i.id = p_invitation_id for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_recipient <> v_actor then raise exception 'only the recipient may respond'; end if;
  if v_status <> 'pending' then raise exception 'invitation is no longer pending'; end if;

  if not p_accept then
    update public.group_invitations
      set status = 'declined', responded_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'declined';
  end if;

  -- Expiry is committed by returning normally; raising here would roll it back.
  if v_group_status not in ('forming', 'active')
     or not private.is_current_term(v_term)
     or not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(v_sender, v_course)
     or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.status in ('open', 'considering')
     ) then
    update public.group_invitations
      set status = 'expired', responded_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'expired';
  end if;

  if v_group_status = 'forming' then
    if not exists (
      select 1 from public.study_groups g where g.id = v_group and g.creator_id = v_sender
    ) then raise exception 'forming group creator is no longer available'; end if;
    if exists (
      select 1 from public.group_memberships m
      where m.profile_id in (v_sender, v_actor) and m.course_id = v_course
        and m.term_id = v_term and m.membership_status = 'active'
    ) then raise exception 'a participant already belongs to a group for this course and term'; end if;
    select p.display_name into v_sender_name from public.profiles p where p.id = v_sender;
    select p.display_name into v_recipient_name from public.profiles p where p.id = v_actor;
    -- Both inserts are mandatory. Any race/conflict aborts the entire acceptance.
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values
      (v_group, v_course, v_term, v_sender,
       coalesce(v_sender_name, 'New CityLink member'), 'active'),
      (v_group, v_course, v_term, v_actor,
       coalesce(v_recipient_name, 'New CityLink member'), 'active');
    update public.study_groups set status = 'active',
      activated_at = coalesce(activated_at, clock_timestamp()), updated_at = clock_timestamp()
    where id = v_group and status = 'forming';
  else
    if not private.is_active_group_member(v_group, v_sender) then
      raise exception 'invitation sender is no longer an active member of this group';
    end if;
    if exists (
      select 1 from public.group_memberships m where m.profile_id = v_actor
        and m.course_id = v_course and m.term_id = v_term and m.membership_status = 'active'
    ) then raise exception 'you already belong to a group for this course and term'; end if;
    select p.display_name into v_recipient_name from public.profiles p where p.id = v_actor;
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values (
      v_group, v_course, v_term, v_actor,
      coalesce(v_recipient_name, 'New CityLink member'), 'active'
    );
  end if;

  update public.group_invitations
    set status = 'accepted', responded_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_invitation_id;
  return 'accepted';
end;
$function$;

create or replace function public.cancel_group_invitation(p_invitation_id uuid)
returns void
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
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  select i.group_id, i.course_id, i.term_id, i.sender_id, i.recipient_id
    into v_group, v_course, v_term, v_sender, v_recipient
  from public.group_invitations i where i.id = p_invitation_id;
  if not found or v_sender is null then raise exception 'invitation not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_sender, v_recipient);
  perform 1 from public.study_groups g where g.id = v_group for update;
  select i.status into v_status from public.group_invitations i
    where i.id = p_invitation_id for update;
  if not found or v_status <> 'pending' then raise exception 'invitation is no longer pending'; end if;
  if v_sender <> v_actor then raise exception 'only the sender may cancel'; end if;
  update public.group_invitations set status = 'cancelled', cancelled_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = p_invitation_id;
  perform private.maybe_abandon_empty_forming_group(v_group);
end;
$function$;

create or replace function public.cancel_group_join_request(p_request_id uuid)
returns void
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
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  select r.group_id, r.course_id, r.term_id, r.requester_id
    into v_group, v_course, v_term, v_requester
  from public.group_join_requests r where r.id = p_request_id;
  if not found or v_requester is null then raise exception 'join request not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profile(v_course, v_term, v_requester);
  perform 1 from public.study_groups g where g.id = v_group for update;
  select r.status into v_status from public.group_join_requests r
    where r.id = p_request_id for update;
  if not found or v_status <> 'pending' then raise exception 'join request is no longer pending'; end if;
  if v_requester <> v_actor then raise exception 'only the requester may cancel'; end if;
  update public.group_join_requests set status = 'cancelled',
    cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id;
end;
$function$;

alter table public.study_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_join_requests enable row level security;

drop policy if exists "authenticated read eligible groups" on public.study_groups;
create policy "authenticated read eligible groups"
  on public.study_groups for select to authenticated
  using (private.can_view_group(id, (select auth.uid())));

drop policy if exists "members read group memberships" on public.group_memberships;
create policy "members read group memberships"
  on public.group_memberships for select to authenticated
  using (
    private.is_active_group_member(group_id, (select auth.uid()))
    or profile_id = (select auth.uid())
  );

drop policy if exists "participants read group invitations" on public.group_invitations;
create policy "participants read group invitations"
  on public.group_invitations for select to authenticated
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or private.is_active_group_member(group_id, (select auth.uid()))
  );

-- This is the original 2026-11-02 policy name and body. The later
-- authority_and_succession migration drops it and replaces it with the
-- current-leader-only policy, so a fresh Main apply stays in order.
drop policy if exists "requester and members read join requests" on public.group_join_requests;
create policy "requester and members read join requests"
  on public.group_join_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or private.is_active_group_member(group_id, (select auth.uid()))
  );

revoke all on table public.study_groups from anon, authenticated;
revoke all on table public.group_memberships from anon, authenticated;
revoke all on table public.group_invitations from anon, authenticated;
revoke all on table public.group_join_requests from anon, authenticated;
grant select on table public.study_groups to authenticated;
grant select on table public.group_memberships to authenticated;
grant select on table public.group_invitations to authenticated;
grant select on table public.group_join_requests to authenticated;

revoke execute on function public.create_group_and_invite(uuid, uuid) from public, anon;
revoke execute on function public.respond_to_group_invitation(uuid, boolean) from public, anon;
revoke execute on function public.cancel_group_invitation(uuid) from public, anon;
revoke execute on function public.cancel_group_join_request(uuid) from public, anon;
grant execute on function public.create_group_and_invite(uuid, uuid) to authenticated;
grant execute on function public.respond_to_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.cancel_group_invitation(uuid) to authenticated;
grant execute on function public.cancel_group_join_request(uuid) to authenticated;

-- Least privilege: Test grants authenticated EXECUTE on only six helpers.
-- The locking and abandonment helpers stay postgres-only.
revoke execute on function private.is_enrolled(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.both_enrolled_in_course(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.is_current_term(uuid) from public, anon, authenticated;
revoke execute on function private.lock_current_term(uuid) from public, anon, authenticated;
revoke execute on function private.lock_course_profile(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.lock_course_profiles(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.is_active_group_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_view_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.maybe_abandon_empty_forming_group(uuid) from public, anon, authenticated;
revoke execute on function private.recipient_can_receive_invitation(uuid) from public, anon, authenticated;
revoke execute on function private.shares_course_with(uuid) from public, anon, authenticated;
grant execute on function private.is_enrolled(uuid, uuid) to authenticated;
grant execute on function private.both_enrolled_in_course(uuid, uuid, uuid) to authenticated;
grant execute on function private.is_active_group_member(uuid, uuid) to authenticated;
grant execute on function private.can_view_group(uuid, uuid) to authenticated;
grant execute on function private.recipient_can_receive_invitation(uuid) to authenticated;
grant execute on function private.shares_course_with(uuid) to authenticated;

commit;
