-- Simulates the capacity-era objects that the P1 proposal's section 0 target assertion
-- requires, so the apply test can exercise BOTH branches of that guard on a disposable
-- local database.
--
-- This is NOT evidence about any Supabase project. Nothing here contacts a real server;
-- it reproduces, inside a throwaway cluster, the three shapes that
-- supabase/migrations/20261119090000_group_hard_max.sql creates and that
-- docs/team/DECISIONS.md records as applied to CityLink Launch on 2026-11-23.
--
-- Applying this fixture is what makes a stub database look "Launch-shaped" to the guard.
-- Without it the guard must refuse with kayk_p1_target_out_of_scope (SQLSTATE 45K03),
-- which is the behaviour the paired test asserts.

-- 1. The capacity column on study_groups, with its named check constraint.
alter table public.study_groups
  add column if not exists max_members integer;

-- 2. The table the capacity release created in schema private.
create table if not exists private.group_removal_context (
  transaction_id bigint not null,
  group_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (transaction_id, group_id, profile_id)
);

-- 3. The three _capacity read functions. Bodies are placeholders returning empty
--    result sets; only their existence in pg_proc matters to the guard.
create or replace function public.list_course_group_summaries_capacity(p_course_id uuid)
returns table (id uuid)
language sql
stable
set search_path to ''
as $function$
  select null::uuid where false;
$function$;

create or replace function public.list_current_term_course_groups_capacity(p_term_id uuid)
returns table (id uuid)
language sql
stable
set search_path to ''
as $function$
  select null::uuid where false;
$function$;

create or replace function public.list_group_recruitment_posts_capacity(p_course_id uuid)
returns table (id uuid)
language sql
stable
set search_path to ''
as $function$
  select null::uuid where false;
$function$;
