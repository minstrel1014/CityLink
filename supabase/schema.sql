-- CityLink Supabase baseline schema
--
-- NOT A LIVE SNAPSHOT. `supabase/migrations/` is authoritative for the applied
-- schema; this file is a skeleton for a fresh project. A rebuild from this file
-- alone cannot reproduce Launch: four applied migrations currently live on
-- draft branches rather than main. "Function not found" after such a rebuild is
-- not evidence of a regression. See docs/team/DECISIONS.md, 2026-11-25,
-- "`supabase/migrations/` is authoritative".
--
-- Apply this file in the Supabase SQL Editor as the project owner, or place an
-- unchanged copy in a timestamped Supabase migration before `supabase db push`.
-- It is a fresh-project baseline. Review normal migration practices before
-- applying any destructive change to a non-empty production database.
--
-- Scope: fictional CityLink demo data only. This creates no CityU, Canvas,
-- institutional SSO, LMS, or student-record integration.

begin;

-- `private` is intentionally not an exposed PostgREST schema. The small,
-- SECURITY DEFINER helpers below let RLS and triggers check shared-course
-- relationships without exposing every student's enrolments or profile.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  student_id text unique,
  display_name text not null default 'New CityLink member'
    check (char_length(display_name) between 1 and 120),
  major text,
  year smallint not null default 1,
  bio text not null default '' check (char_length(bio) <= 2_000),
  skills text[] not null default '{}'::text[],
  -- Matches client `GroupStatus`; no arbitrary status strings are accepted.
  status text not null default 'open',
  -- Reserved for a future image-capable UI. The current Avatar renders initials.
  avatar_url text,
  color text not null default 'blue' check (char_length(color) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep a re-application of this baseline aligned with the current client
-- contract. For a non-empty production database, review these normalisations
-- as a migration before applying them.
update public.profiles
set status = 'open'
where status is null or status not in ('open', 'considering', 'full');

update public.profiles
set year = 1
where year is null or year not between 1 and 6;

alter table public.profiles
  alter column year set default 1,
  alter column year set not null,
  alter column status set default 'open',
  alter column status set not null;

alter table public.profiles
  drop constraint if exists profiles_status_check,
  drop constraint if exists profiles_status_group_status_check,
  drop constraint if exists profiles_year_check,
  drop constraint if exists profiles_year_1_to_6_check;

alter table public.profiles
  add constraint profiles_status_group_status_check
    check (status in ('open', 'considering', 'full')),
  add constraint profiles_year_1_to_6_check
    check (year between 1 and 6);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) between 1 and 32),
  title text not null check (char_length(title) between 1 and 200),
  department text not null check (char_length(department) between 1 and 120),
  credits numeric(4, 1) not null check (credits >= 0 and credits <= 99.9),
  semester text not null check (char_length(semester) between 1 and 80),
  description text not null default '' check (char_length(description) <= 4_000),
  color text not null default 'blue' check (char_length(color) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (code, semester)
);

-- There is deliberately no browser insert/update/delete grant on this table.
-- A project owner, server-side admin job, or controlled SQL import manages
-- enrolments. The composite primary key prevents duplicate membership.
create table if not exists public.enrolments (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

-- Supports the peer check by course and gives the admin import a useful index.
create index if not exists enrolments_course_student_idx
  on public.enrolments (course_id, student_id);

create index if not exists invitations_sender_idx
  on public.invitations (sender_id, created_at desc);

create index if not exists invitations_recipient_idx
  on public.invitations (recipient_id, created_at desc);

-- CityLink defines an active pair as a pending or accepted invitation. Declined
-- and cancelled records are terminal and do not prevent a later invitation.
-- This prevents same- or reverse-direction duplicates for an unordered pair in
-- one course, matching the client repository's active-record check.
do $$
begin
  if exists (
    select 1
    from public.invitations
    where status in ('pending', 'accepted')
    group by course_id, least(sender_id, recipient_id), greatest(sender_id, recipient_id)
    having count(*) > 1
  ) then
    raise exception
      'cannot enforce one active invitation per pair/course: resolve duplicate pending or accepted invitations first';
  end if;
end;
$$;

drop index if exists public.invitations_one_pending_per_pair_course_idx;
drop index if exists public.invitations_one_active_per_pair_course_idx;
create unique index invitations_one_active_per_pair_course_idx
  on public.invitations (
    course_id,
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  )
  where status in ('pending', 'accepted');

-- These functions are called from RLS policies and integrity triggers.
-- SECURITY DEFINER is necessary because a member can directly SELECT only their
-- own enrolments, while the checks must inspect shared-course relationships.
-- Every relation is schema-qualified and search_path is empty by design.
create or replace function private.shares_course_with(p_other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.both_enrolled_in_course(
  p_left_profile_id uuid,
  p_right_profile_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

-- This helper returns only a boolean. It lets invitation enforcement reject a
-- recipient whose group is already formed without making profiles a directory.
create or replace function private.recipient_can_receive_invitation(
  p_recipient_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_recipient_profile_id is not null
    and exists (
      select 1
      from public.profiles as recipient
      where recipient.id = p_recipient_profile_id
        and recipient.status in ('open', 'considering')
    );
$$;

-- Direct reads of `enrolments` remain own-row-only. This deliberately scoped
-- RPC returns just the identifiers needed to render classmates for courses the
-- caller is enrolled in; it exposes no enrolment timestamps or other columns.
create or replace function public.visible_course_enrolments()
returns table (student_id uuid, course_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select enrolment.student_id, enrolment.course_id
  from public.enrolments as enrolment
  where (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrolments as mine
      where mine.student_id = (select auth.uid())
        and mine.course_id = enrolment.course_id
    );
$$;

-- The `private` schema remains outside the Data API. These grants only let
-- authenticated policy/trigger evaluation invoke internal helpers; do not add
-- `private` to Supabase's exposed schemas list.
grant usage on schema private to authenticated;
revoke all on function private.shares_course_with(uuid) from public, anon, authenticated;
revoke all on function private.both_enrolled_in_course(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.recipient_can_receive_invitation(uuid) from public, anon, authenticated;
grant execute on function private.shares_course_with(uuid) to authenticated;
grant execute on function private.both_enrolled_in_course(uuid, uuid, uuid) to authenticated;
grant execute on function private.recipient_can_receive_invitation(uuid) to authenticated;

-- `public.visible_course_enrolments` is intentionally the one narrow roster RPC
-- surface. Anonymous callers receive no execute grant.
revoke all on function public.visible_course_enrolments() from public, anon, authenticated;
grant execute on function public.visible_course_enrolments() to authenticated;

-- Every Supabase Auth sign-up gets a profile. The minimal default avoids relying
-- on an institutional directory. The display name is just user-entered metadata
-- and can be edited later by the owner under RLS.
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
      120
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- This trigger makes invitation identities immutable, stamps timestamps on the
-- server, enforces membership and recipient availability at creation, and
-- permits only the state machine below. It is SECURITY INVOKER, so auth.uid()
-- is the caller authenticated by Supabase rather than a privileged owner.
create or replace function public.enforce_invitation_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_invitation_integrity() from public, anon, authenticated;

drop trigger if exists invitations_enforce_integrity on public.invitations;
create trigger invitations_enforce_integrity
  before insert or update on public.invitations
  for each row execute procedure public.enforce_invitation_integrity();

-- Explicit grants are intentionally narrow. RLS decides which rows a user may
-- access; profile column grants also limit which fields the owner may edit.
-- `service_role` is left for trusted server-side administration only; never
-- put its key in a web bundle.
revoke all on table public.profiles from PUBLIC, anon, authenticated;
revoke update (
  id, student_id, display_name, major, year, bio, skills, status,
  avatar_url, color, created_at, updated_at
) on table public.profiles from PUBLIC, anon, authenticated;
revoke all on table public.courses from anon, authenticated;
revoke all on table public.enrolments from anon, authenticated;
revoke all on table public.invitations from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (major, year, bio, skills, status)
  on table public.profiles to authenticated;
grant select on table public.courses to authenticated;
grant select on table public.enrolments to authenticated;
grant select, insert, update on table public.invitations to authenticated;
grant all privileges on table public.profiles, public.courses, public.enrolments, public.invitations to service_role;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.enrolments enable row level security;
alter table public.invitations enable row level security;

-- Profiles are not a public directory. Signed-in users can read their own
-- profile and profiles of people who share at least one course. A user can edit
-- only their own row, including their own valid group status. Inserts happen
-- through the Auth trigger, not the browser.
drop policy if exists "profiles visible to self and course peers" on public.profiles;
create policy "profiles visible to self and course peers"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.shares_course_with(id)
  );

drop policy if exists "profiles editable by owner" on public.profiles;
create policy "profiles editable by owner"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Choice made for CityLink: authenticated-only fictional demo catalog. There is
-- no anonymous catalog policy and no browser-side course management policy.
drop policy if exists "authenticated users read demo course catalog" on public.courses;
create policy "authenticated users read demo course catalog"
  on public.courses
  for select
  to authenticated
  using (true);

-- A direct table query can rehydrate only the caller's own enrolments. The
-- public.visible_course_enrolments() RPC is the sole roster read and returns
-- only IDs for courses where that caller is enrolled.
drop policy if exists "users read own enrolments" on public.enrolments;
create policy "users read own enrolments"
  on public.enrolments
  for select
  to authenticated
  using (student_id = (select auth.uid()));

-- Participants can read an invitation. The sender must be the authenticated
-- user, cannot self-invite, must start pending, both people must share the
-- selected course, and a recipient whose group is full cannot receive a new
-- invitation. The trigger repeats the structural checks.
drop policy if exists "invitation participants read" on public.invitations;
create policy "invitation participants read"
  on public.invitations
  for select
  to authenticated
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

drop policy if exists "enrolled sender creates pending invitation" on public.invitations;
create policy "enrolled sender creates pending invitation"
  on public.invitations
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_id <> recipient_id
    and status = 'pending'
    and private.both_enrolled_in_course(sender_id, recipient_id, course_id)
    and private.recipient_can_receive_invitation(recipient_id)
  );

-- Policy and trigger both enforce the transition matrix:
-- pending -> accepted | declined (recipient); pending -> cancelled (sender).
drop policy if exists "recipient responds to pending invitation" on public.invitations;
create policy "recipient responds to pending invitation"
  on public.invitations
  for update
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    recipient_id = (select auth.uid())
    and status in ('accepted', 'declined')
  );

drop policy if exists "sender cancels pending invitation" on public.invitations;
create policy "sender cancels pending invitation"
  on public.invitations
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    sender_id = (select auth.uid())
    and status = 'cancelled'
  );

commit;

-- Expected client-visible state transitions:
--   pending --recipient--> accepted | declined
--   pending --sender-----> cancelled
-- No browser delete policy exists. All terminal states are final.
