-- Minimal stand-ins for the objects KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql depends on.
--
-- This is NOT the CityLink schema. It exists so the proposal can be applied to a
-- disposable PostgreSQL instance and so its behaviour (membership checks, the rate
-- limit, idempotency, the claim/finish state machine, clearing) can be exercised
-- without touching any Supabase project.
--
-- Unlike the P1 stub, auth.uid() here is controllable: it reads the
-- "citylink.test_uid" setting so a test can act as a specific member. The two chat
-- predicates are real (membership-table based) rather than constant, because the
-- whole point of the write path is who is allowed to call it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin';
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists private;

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('citylink.test_uid', true), '')::uuid;
$function$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text
);

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles (id),
  status text not null default 'active'
);

create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.study_groups (id),
  profile_id uuid references public.profiles (id),
  membership_status text not null default 'active'
);

-- Shape mirrors supabase/migrations/20261118050000_stage6_chat_recruitment.sql:
-- author_kind, ai_request_id and truncated deliberately ABSENT, so the proposal's
-- Section 2/3 ALTER has to do the work.
create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete restrict,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_name_snapshot text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Shape mirrors the applied P1 table (subset the chat proposal reads).
create table if not exists public.group_files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  original_name text not null,
  declared_mime text,
  detected_mime text,
  byte_size bigint,
  analysis_status text not null default 'none',
  status text not null default 'current',
  deleted_at timestamptz,
  retention_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Mirrors private.can_send_group_chat: active member, group not abandoned.
-- The pre-existing read contract (four columns, no author_kind). The proposal must
-- leave this function untouched: B-2 was "add list_group_chat_messages_ai", not
-- "DROP + CREATE" the old one, so old clients keep working. The paired test asserts
-- this function still exists with the same arity after the migration runs.
create or replace function public.list_group_chat_messages(
  p_group_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (message_id uuid, sender_name text, body text, created_at timestamptz)
language sql
stable
set search_path = ''
as $function$
  select m.id, m.sender_name_snapshot, m.body, m.created_at
  from public.group_chat_messages m
  where m.group_id = p_group_id
  order by m.created_at desc
  limit p_limit;
$function$;

-- The pre-existing send RPC. The proposal must not touch it either.
create or replace function public.send_group_chat_message(
  p_group_id uuid,
  p_body text
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select null::uuid;
$function$;

create or replace function private.can_send_group_chat(p_group_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.group_memberships gm
    join public.study_groups sg on sg.id = gm.group_id
    where gm.group_id = p_group_id
      and gm.profile_id = auth.uid()
      and gm.membership_status = 'active'
      and sg.status <> 'abandoned'
  );
$function$;

-- Mirrors private.can_read_group_chat: any former or current member may read.
create or replace function private.can_read_group_chat(p_group_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.profile_id = auth.uid()
  );
$function$;

-- Mirrors the applied target marker (docs/stage6/CITYLINK_TARGET_MARKER_DRAFT.sql,
-- codes 45M01-45M04). The recorded system_identifier is a placeholder here; the test
-- overwrites it with this cluster's own value so a matching marker passes and a wrong
-- ref still refuses.
create table if not exists private.citylink_target (
  only_row boolean primary key default true,
  project_ref text not null,
  system_identifier text not null,
  declared_by text,
  note text
);

create or replace function private.assert_citylink_target(p_expected_ref text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_ref text;
  v_recorded text;
  v_observed text;
begin
  begin
    select t.project_ref, t.system_identifier
      into v_ref, v_recorded
    from private.citylink_target t;
  exception
    when undefined_table then
      raise exception 'citylink_target_marker_missing'
        using errcode = '45M01',
              detail = 'private.citylink_target does not exist';
  end;
  if v_ref is null then
    raise exception 'citylink_target_marker_missing'
      using errcode = '45M01',
            detail = 'private.citylink_target has no row';
  end if;
  if v_ref <> p_expected_ref then
    raise exception 'citylink_target_mismatch'
      using errcode = '45M02',
            detail = format('marker names %s, caller expected %s', v_ref, p_expected_ref);
  end if;
  begin
    select c.system_identifier::text into v_observed from pg_control_system() c;
  exception
    when others then
      raise exception 'citylink_target_unverifiable'
        using errcode = '45M04',
              detail = 'pg_control_system() could not be read';
  end;
  if v_observed <> v_recorded then
    raise exception 'citylink_target_cluster_changed'
      using errcode = '45M03',
            detail = format('recorded %s, observed %s', v_recorded, v_observed);
  end if;
end;
$function$;
