-- Minimal stand-ins for the Supabase objects the P1 proposal depends on.
--
-- This is NOT the CityLink schema. It exists only so the proposal can be parsed
-- and applied against a disposable PostgreSQL instance, which catches syntax
-- errors, misspelled columns and return-shape mismatches that a text-only test
-- cannot see. Behaviour is not exercised here: auth.uid() always returns NULL
-- and is_active_group_member() always returns false.

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
  select null::uuid;
$function$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  starts_on date,
  ends_on date
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  term_id uuid references public.academic_terms (id)
);

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id),
  term_id uuid references public.academic_terms (id),
  creator_id uuid references public.profiles (id),
  status text not null default 'forming'
);

create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.study_groups (id),
  profile_id uuid references public.profiles (id),
  membership_status text not null default 'active'
);

create or replace function private.is_active_group_member(
  p_group_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
as $function$
  select false;
$function$;
