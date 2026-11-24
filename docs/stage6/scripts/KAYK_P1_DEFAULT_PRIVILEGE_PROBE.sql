-- CityLink — P1 default-privilege probe (evidence tooling, NOT application SQL)
--
-- Purpose: a Supabase project applies migrations as role `postgres`, and `postgres`
-- has ALTER DEFAULT PRIVILEGES that auto-grant on newly created objects. The P1
-- proposal revokes from `public, anon, authenticated` but never names
-- `service_role`, so on a real Supabase project those auto-grants survive.
-- A plain local PostgreSQL has no such default ACLs, which is why both the Kayk
-- harness and Role 6's harness measured service_role = false. Before any apply, re-read
-- pg_default_acl on the actual target.
--
-- This probe reproduces Test's measured default privileges on a disposable
-- PostgreSQL 17 cluster, applies the reviewed blob as `postgres`, and then reads
-- the effective ACLs. It writes nothing outside its own temporary database.
--
-- Run from the repository root against the disposable harness:
--   PGHOST=/tmp/citylink-pg17/run PGPORT=5499 psql -X -q -v ON_ERROR_STOP=1 \
--     -d postgres -f docs/stage6/scripts/KAYK_P1_DEFAULT_PRIVILEGE_PROBE.sql

\set ON_ERROR_STOP on

-- Supabase ships a login superuser called `postgres`; migrations run as it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login superuser;
  end if;
end
$$;

drop database if exists citylink_p1_defpriv_probe;
create database citylink_p1_defpriv_probe;
\c citylink_p1_defpriv_probe

-- Same stand-in schema the vitest apply test uses.
\i server/fixtures/groupFilesStubSchema.sql

-- Mirror of the default privileges read from wkzclgmhrtecnpexfesr (frozen
-- Prototype, out of scope since F14) in pg_default_acl on 2026-11-24:
-- FOR ROLE postgres -> relations ALL, functions EXECUTE, sequences USAGE/SELECT/UPDATE
-- to anon, authenticated and service_role; private schema usable by authenticated.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;

-- Apply the reviewed blob exactly as Supabase does: as role postgres.
\c - postgres
\i docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql

-- Effective posture after the migration, which is what actually decides access.
select
  r.rolname                                          as role,
  n.nspname || '.' || p.proname                      as function,
  has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_roles r
join pg_proc p on p.proname like '%group_file%'
join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
where r.rolname in ('anon', 'authenticated', 'service_role')
order by n.nspname, p.proname, r.rolname
limit 60;

select
  r.rolname                                       as role,
  t.tablename                                     as table_name,
  has_table_privilege(r.rolname, 'public.' || t.tablename, 'select') as can_select,
  has_table_privilege(r.rolname, 'public.' || t.tablename, 'insert') as can_insert
from pg_roles r
join pg_tables t on t.schemaname = 'public'
  and t.tablename in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')
where r.rolname in ('anon', 'authenticated', 'service_role')
order by t.tablename, r.rolname
limit 20;

select rolname, rolbypassrls
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role', 'postgres')
order by rolname
limit 10;

-- Leave nothing behind (must disconnect from the probe database first).
\c postgres -
drop database if exists citylink_p1_defpriv_probe;
