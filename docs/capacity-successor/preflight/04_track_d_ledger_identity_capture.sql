-- =============================================================================
-- CityLink capacity successor — preflight page 04: Track D ledger capture
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only capture page. Not a migration, not
-- authorization, raises nothing, and repairs nothing.
--
-- Track served: D — reconciling recorded migration-ledger versions with
--   repository files. This page captures; reconciliation, and any
--   `supabase migration repair`, are separate decisions with their own
--   authorization. Ledger versions written by the CLI are execution
--   timestamps, so a filename is not a portable identity and this page never
--   treats one as such.
--
-- Two statements, deliberately:
--   Statement 1 is safe on every engine, including one with no Supabase
--   migration schema at all, because it only asks catalog questions.
--   Statement 2 reads ledger ROWS, which cannot be expressed without naming the
--   table — and a query over an absent table is a parse-time error, not a
--   reportable row. Run statement 2 only when statement 1 reports the table as
--   present. That is a real limit of a DO-free, SELECT-only instrument and it is
--   recorded rather than hidden.
--
-- SAFE TO RUN TWICE; identical rows are the expected outcome.
-- =============================================================================

-- Statement 1: shape of the ledger object, catalog-only, always runnable.
select '04' as page,
       'D-LDG-01' as check_id,
       'ledger table identity' as subject,
       'present on a project whose migrations were applied by the Supabase CLI'
         as expected,
       coalesce(to_regclass('supabase_migrations.schema_migrations')::text,
                '<absent>') as observed,
       'CAPTURE' as verdict

union all
select '04', 'D-LDG-02', 'ledger table columns as this engine sees them',
       'recorded; column sets differ across CLI versions',
       coalesce((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod),
                                   ', ' order by a.attnum)
                   from pg_attribute a
                  where a.attrelid = to_regclass('supabase_migrations.schema_migrations')
                    and a.attnum > 0 and not a.attisdropped
                  limit 40), '<table absent>'),
       'CAPTURE'

union all
select '04', 'D-LDG-03', 'ledger schema present',
       'recorded',
       coalesce(to_regnamespace('supabase_migrations')::text, '<absent>'),
       'CAPTURE'

union all
select '04', 'D-LDG-04', 'repository migration files are NOT readable from SQL',
       'this page states the limit instead of inventing a comparison',
       'compare D-LDG-10 against the repository inventory recorded in '
       || 'docs/capacity-successor/CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md §13',
       'CAPTURE'

 order by check_id
 limit 10;

-- Statement 2: ledger ROWS. Run only if D-LDG-01 reported the table present.
-- On an engine without the Supabase migration schema this statement errors at
-- parse time; that error is the expected behaviour of an out-of-scope engine,
-- not a finding about Test or Main. Column names are pinned to the two that
-- every CLI generation has carried: version and name.
select '04' as page,
       'D-LDG-10' as check_id,
       'recorded ledger versions (capture only)' as subject,
       'recorded verbatim; no identity, ordering or completeness is assumed'
         as expected,
       m.version || ' | ' || coalesce(m.name, '<unnamed>') as observed,
       'CAPTURE' as verdict
  from supabase_migrations.schema_migrations m
 order by m.version
 limit 100;
