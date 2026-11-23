-- DRAFT ONLY — NOT APPLIED, NOT REVIEWED, NOT AUTHORIZED.
-- Feature: 1:1 direct messages (CityLink), per Adam's 2026-11-23 decisions:
--   P1 same current-term course classmates only · instant delivery (Realtime) ·
--   no block/report in v1 · read receipts shown · independent of /my-groups.
-- Target: pijslbchvstkoweslymr (CityLink Launch). Requires a NEW Adam decision recorded in
--   docs/team/DECISIONS.md authorising new tables in this database, a Role 6 exact-head review
--   on a fixed branch head, a preflight, and an explicit target+SQL-head authorisation.
--   The capacity apply gate does NOT cover this change and must not be cited as evidence.
-- Product decisions resolved by Adam on 2026-11-23 19:51:
--   D1 = threads persist after the course/term ends (participants keep reading and writing);
--   D3 = 30 messages per sender per thread per rolling minute;
--   D5 = no retention limit in v1; D6 = /messages placeholder is replaced on the same day.

begin;

-- 1. Participation predicate --------------------------------------------------------------
-- Role 6 finding: private.shares_course_with(uuid) matches ANY historical enrolment and does
-- not consider the term, so it is WIDER than P1. This predicate is deliberately strict:
-- there must exist a course C where both are enrolled AND C belongs to the current term.
create or replace function private.shares_current_term_course_with(p_other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.courses as c
    where private.is_current_term(c.term_id)
      and private.both_enrolled_in_course((select auth.uid()), p_other_profile_id, c.id)
  );
$function$;

revoke all on function private.shares_current_term_course_with(uuid) from public, anon, authenticated;

-- 2. Tables -------------------------------------------------------------------------------
create table public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint direct_threads_ordered_participants check (user_a < user_b),
  constraint direct_threads_distinct_participants check (user_a <> user_b),
  constraint direct_threads_pair_key unique (user_a, user_b)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_name_snapshot text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index direct_threads_user_a_recent_idx on public.direct_threads (user_a, last_message_at desc);
create index direct_threads_user_b_recent_idx on public.direct_threads (user_b, last_message_at desc);
create index direct_messages_thread_page_idx on public.direct_messages (thread_id, created_at desc, id desc);
create index direct_messages_unread_idx on public.direct_messages (thread_id, sender_id, read_at);

alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;
-- No policies on purpose: the only entry point is the SECURITY DEFINER RPCs below.
revoke all on table public.direct_threads from public, anon, authenticated;
revoke all on table public.direct_messages from public, anon, authenticated;

-- 3. last_message_at maintenance -----------------------------------------------------------
create or replace function private.touch_direct_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.direct_threads
     set last_message_at = new.created_at
   where id = new.thread_id
     and last_message_at < new.created_at;
  return new;
end;
$function$;

create trigger direct_messages_touch_thread
after insert on public.direct_messages
for each row execute function private.touch_direct_thread_last_message();

-- 4. RPCs ----------------------------------------------------------------------------------
create or replace function public.start_direct_thread(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_a uuid;
  v_b uuid;
  v_thread uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if p_other_profile_id is null or p_other_profile_id = v_me then
    raise exception 'invalid conversation partner';
  end if;
  if not private.shares_current_term_course_with(p_other_profile_id) then
    raise exception 'direct messages are limited to classmates in a current-term course';
  end if;
  v_a := least(v_me, p_other_profile_id);
  v_b := greatest(v_me, p_other_profile_id);
  insert into public.direct_threads (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;
  select id into v_thread from public.direct_threads where user_a = v_a and user_b = v_b;
  return v_thread;
end;
$function$;

create or replace function public.send_direct_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'message body must be between 1 and 2000 characters';
  end if;
  -- D1 (Adam, 2026-11-23): an existing thread stays usable after the course or term ends,
  -- so sending requires participation only, never a current enrolment.
  -- D3 (Adam, 2026-11-23): 30 messages per sender per thread per rolling minute.
  if (
    select count(*)
    from public.direct_messages m
    where m.thread_id = p_thread_id
      and m.sender_id = v_me
      and m.created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'rate limit reached: at most 30 messages per minute in this conversation';
  end if;
  select coalesce(display_name, 'Student') into v_name from public.profiles where id = v_me;
  insert into public.direct_messages (thread_id, sender_id, sender_name_snapshot, body)
  values (p_thread_id, v_me, coalesce(v_name, 'Student'), v_body)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_direct_threads(p_limit integer default 50)
returns table(
  thread_id uuid,
  other_profile_id uuid,
  other_display_name text,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  return query
    select
      t.id,
      case when t.user_a = v_me then t.user_b else t.user_a end,
      coalesce(p.display_name, 'Student'),
      lm.body,
      t.last_message_at,
      (select count(*) from public.direct_messages m
        where m.thread_id = t.id and m.sender_id <> v_me and m.read_at is null)
    from public.direct_threads t
    join public.profiles p
      on p.id = case when t.user_a = v_me then t.user_b else t.user_a end
    left join lateral (
      select m.body from public.direct_messages m
       where m.thread_id = t.id
       order by m.created_at desc, m.id desc
       limit 1
    ) lm on true
    where t.user_a = v_me or t.user_b = v_me
    order by t.last_message_at desc, t.id desc
    limit p_limit;
end;
$function$;

create or replace function public.list_direct_messages(
  p_thread_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table(
  message_id uuid,
  sender_id uuid,
  sender_display_name text,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  return query
    select m.id, m.sender_id, m.sender_name_snapshot, m.body, m.created_at, m.read_at
    from public.direct_messages m
    where m.thread_id = p_thread_id
      and (p_before_created_at is null
           or (m.created_at, m.id) < (p_before_created_at, p_before_id))
    order by m.created_at desc, m.id desc
    limit p_limit;
end;
$function$;

create or replace function public.mark_direct_thread_read(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_rows integer;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  -- Role 6 finding: a sender must never mark their own message as read.
  update public.direct_messages
     set read_at = now()
   where thread_id = p_thread_id
     and sender_id <> v_me
     and read_at is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

revoke all on function public.start_direct_thread(uuid) from public, anon, authenticated;
revoke all on function public.send_direct_message(uuid, text) from public, anon, authenticated;
revoke all on function public.list_direct_threads(integer) from public, anon, authenticated;
revoke all on function public.list_direct_messages(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_direct_thread_read(uuid) from public, anon, authenticated;
grant execute on function public.start_direct_thread(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.list_direct_threads(integer) to authenticated;
grant execute on function public.list_direct_messages(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;

-- 5. Instant delivery (Adam: "yes, instant message") --------------------------------------
-- Clients never get SELECT on the tables, so postgres_changes subscriptions are impossible.
-- Delivery therefore uses Realtime BROADCAST from a trigger on a per-thread private topic,
-- authorised by a policy on realtime.messages that checks thread participation.
create or replace function private.broadcast_direct_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform realtime.broadcast_changes(
    'thread:' || new.thread_id::text,
    'INSERT',
    'INSERT',
    'direct_messages',
    'public',
    'direct_messages',
    new,
    null
  );
  return new;
end;
$function$;

create trigger direct_messages_broadcast
after insert on public.direct_messages
for each row execute function private.broadcast_direct_message();

-- Realtime authorisation: only the two participants may subscribe to a thread topic.
create policy "direct thread participants can read topic"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'thread:%'
  and exists (
    select 1
    from public.direct_threads t
    where 'thread:' || t.id::text = realtime.topic()
      and ((select auth.uid()) = t.user_a or (select auth.uid()) = t.user_b)
  )
);

-- D5 (Adam, 2026-11-23): no retention limit in v1; messages are kept indefinitely.
-- The rate limit for D3 lives inside send_direct_message above (30 per sender per thread
-- per rolling minute) and is backed by direct_messages_thread_page_idx.

commit;
