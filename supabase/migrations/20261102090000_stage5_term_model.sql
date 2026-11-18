-- Term-model prerequisite for Stage 5 on Supabase Main
-- (project CityLink Project, ref pijslbchvstkoweslymr).
--
-- Reconstructed 2026-11-18 from the live Test catalog. Test already has this
-- model, but no repository file records it. Main still uses courses.semester
-- text and has neither academic_terms nor citylink_settings, so the five
-- Stage 5 files cannot run there until this migration is applied first.
--
-- Current term: the lead approved 2026-Fall on 2026-11-18 (confirmed as the
-- only semester string on Main). The migration
-- aborts if no course on Main is linked to that term, so a mismatched string
-- fails loudly instead of silently misconfiguring current-term checks.
--
-- This migration writes data (it backfills courses.term_id from semester).
-- It requires Role 6 review, a verified Main backup, and the lead's separate
-- approval. Not applied by this PR. Not for Test (already has the model).

begin;

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (char_length(code) between 1 and 80),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint academic_terms_code_key unique (code),
  constraint academic_terms_check check (
    starts_on is null or ends_on is null or starts_on <= ends_on
  )
);

create table if not exists public.citylink_settings (
  singleton boolean primary key default true check (singleton),
  current_term_id uuid not null references public.academic_terms (id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- One academic term per distinct semester string already used on Main.
insert into public.academic_terms (code)
select distinct btrim(c.semester)
from public.courses c
where c.semester is not null and btrim(c.semester) <> ''
on conflict (code) do nothing;

alter table public.courses add column if not exists term_id uuid;

update public.courses c
set term_id = t.id
from public.academic_terms t
where c.term_id is null and t.code = btrim(c.semester);

insert into public.academic_terms (code)
values ('2026-Fall')
on conflict (code) do nothing;

do $$
begin
  if exists (select 1 from public.courses where term_id is null) then
    raise exception 'courses.term_id backfill incomplete: some courses have no matching academic term';
  end if;
  if not exists (
    select 1
    from public.courses c
    join public.academic_terms t on t.id = c.term_id
    where t.code = '2026-Fall'
  ) then
    raise exception 'no course is linked to the approved current term 2026-Fall';
  end if;
end
$$;

alter table public.courses alter column term_id set not null;

alter table public.courses drop constraint if exists courses_term_id_fkey;
alter table public.courses
  add constraint courses_term_id_fkey
  foreign key (term_id) references public.academic_terms (id) on delete restrict;

create unique index if not exists courses_id_term_id_uidx
  on public.courses (id, term_id);
create index if not exists courses_term_id_idx
  on public.courses (term_id);

insert into public.citylink_settings (singleton, current_term_id)
select true, t.id
from public.academic_terms t
where t.code = '2026-Fall'
on conflict (singleton) do update
  set current_term_id = excluded.current_term_id,
      updated_at = clock_timestamp();

alter table public.academic_terms enable row level security;
alter table public.citylink_settings enable row level security;

drop policy if exists "authenticated read academic terms" on public.academic_terms;
create policy "authenticated read academic terms"
  on public.academic_terms for select to authenticated
  using (true);

drop policy if exists "authenticated read current term setting" on public.citylink_settings;
create policy "authenticated read current term setting"
  on public.citylink_settings for select to authenticated
  using (singleton = true);

revoke all on table public.academic_terms from anon, authenticated;
revoke all on table public.citylink_settings from anon, authenticated;
grant select on table public.academic_terms to authenticated;
grant select on table public.citylink_settings to authenticated;

commit;
