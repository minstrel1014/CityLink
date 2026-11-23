-- =============================================================================
-- CityLink capacity successor — preflight page 00: target identity and engine
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only observation page. Not a migration, not
-- authorization, and it raises nothing: refusals belong to
-- 90_apply_gate_wrapper_DRAFT.sql.
--
-- Prepared by : Role 6 continuity task (database security and migration
--               review; the human name for Role 6 is still TBD, so no human
--               authorship is claimed here).
-- Prepared on : 2026-11-22, in the reshape commit that is a fast-forward child
--               of PR #51 head bc6a6d557cba1d4a61c6cabd48ec181b4e3da098.
-- Reviewed DDL: supabase/migrations/20261119090000_group_hard_max.sql,
--               blob a04048e90d6b64c692f03c722b9eea2849058aab, SHA-256
--               5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887.
--               This page does not modify, restate or rebase it.
--
-- PURPOSE
--   Establish, before any other page, which engine and which session the
--   operator is actually talking to, and echo back the evidence markers the
--   operator has declared. Target identity is never inferred from a filename,
--   a ledger, or a repository default.
--
-- SAFE TO RUN TWICE. A repeat run whose rows differ is a finding.
--
-- Notes on two rows that are easy to misread:
--   * C-MAJ-01 fails on any engine that is not major 17. That is the intended
--     discrimination: Adam's real-parser gate targets 17 because Test reports
--     17.11.0.011 and Main reports 17.11.0.003.
--   * C-SBA-03/04/05 describe a Supabase-shaped target. A bare or
--     documentation-only engine legitimately reports FAIL there; that is a
--     true observation about that engine, not a Supabase defect.
-- =============================================================================

select '00' as page,
       'C-MAJ-01' as check_id,
       'server major version' as subject,
       '17' as expected,
       split_part(current_setting('server_version'), '.', 1) as observed,
       case
         when current_setting('server_version') is null then 'UNPINNED'
         when split_part(current_setting('server_version'), '.', 1) = '17' then 'PASS'
         else 'FAIL'
       end as verdict

union all
select '00', 'C-MAJ-02', 'full version string (capture)',
       'capture only', current_setting('server_version')
       || ' / num ' || current_setting('server_version_num')
       || ' / ' || substring(version() from 1 for 60), 'CAPTURE'

union all
select '00', 'C-DB-03', 'current database name (capture)',
       'whatever the connector reports for the authorized ref',
       current_database(), 'CAPTURE'

union all
select '00', 'C-USR-04', 'session_user (capture; pinning-record field)',
       'capture only', session_user::text, 'CAPTURE'

union all
select '00', 'C-USR-05', 'current_user in effect (capture)',
       'capture only', current_user::text, 'CAPTURE'

union all
-- Deliberately a capture, not a test: comparing the session search_path to any
-- literal is the mistake the retired guard made. Empty, quoted and
-- catalog-default renderings are all reported verbatim for the record.
select '00', 'C-CFG-06', 'session search_path rendering (capture, never compared)',
       'record verbatim', coalesce(current_setting('search_path', true), '<unset>'),
       'CAPTURE'

union all
select '00', 'C-LOC-07', 'database collation and ctype (pinning-record fields)',
       'capture only',
       coalesce(d.datcollate, '<unreadable>') || ' | ' || coalesce(d.datctype, '<unreadable>'),
       'CAPTURE'
  from pg_database d
 where d.datname = current_database()

union all
select '00', 'C-ENC-08', 'database encoding (pinning-record field)',
       'capture only',
       coalesce(pg_encoding_to_char(d.encoding), '<unreadable>'), 'CAPTURE'
  from pg_database d
 where d.datname = current_database()

union all
select '00', 'C-SBA-09', 'Supabase-shaped target: auth schema present',
       'present on a real Supabase project',
       coalesce(to_regnamespace('auth')::text, '<absent>'),
       case when to_regnamespace('auth') is null then 'FAIL' else 'PASS' end

union all
select '00', 'C-SBA-10', 'Supabase-shaped target: browser/API roles present',
       'anon, authenticated and service_role present',
       'anon=' || coalesce(to_regrole('anon')::text, '<absent>')
       || ' authenticated=' || coalesce(to_regrole('authenticated')::text, '<absent>')
       || ' service_role=' || coalesce(to_regrole('service_role')::text, '<absent>'),
       case
         when to_regrole('anon') is null
           or to_regrole('authenticated') is null
           or to_regrole('service_role') is null then 'FAIL'
         else 'PASS'
       end

union all
select '00', 'C-SBA-11', 'Supabase-shaped target: ledger table present',
       'present on a project managed by the Supabase CLI',
       coalesce(to_regclass('supabase_migrations.schema_migrations')::text, '<absent>'),
       case
         when to_regclass('supabase_migrations.schema_migrations') is null then 'FAIL'
         else 'PASS'
       end

union all
-- Evidence markers the operator declares for the gate in 90_ to consume. This
-- page only echoes them; it never decides whether they are adequate.
select '00', 'C-MRK-12', 'marker citylink.capacity_run_id',
       'non-empty operator-declared run id',
       coalesce(nullif(btrim(current_setting('citylink.capacity_run_id', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_run_id', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-13', 'marker citylink.capacity_target_ref',
       'the exact ref named in Adam''s authorization',
       coalesce(nullif(btrim(current_setting('citylink.capacity_target_ref', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_target_ref', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-14', 'marker citylink.capacity_pages_run',
       'comma-separated list of page ids executed in this session',
       coalesce(nullif(btrim(current_setting('citylink.capacity_pages_run', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_pages_run', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-15', 'marker citylink.capacity_preflight_verdict',
       'PASS or PASS_WITH_CAPTURED_OBSERVATIONS',
       coalesce(nullif(btrim(current_setting('citylink.capacity_preflight_verdict', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_preflight_verdict', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-16', 'marker citylink.capacity_pinned_digests',
       '<browse hex>,<manage hex> from page 05',
       coalesce(nullif(btrim(current_setting('citylink.capacity_pinned_digests', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_pinned_digests', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-17', 'marker citylink.capacity_engine_major',
       '17 (Adam''s real-parser gate target major)',
       coalesce(nullif(btrim(current_setting('citylink.capacity_engine_major', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_engine_major', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

union all
select '00', 'C-MRK-18', 'marker citylink.capacity_blob_identity',
       'a04048e90d6b64c692f03c722b9eea2849058aab:5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887',
       coalesce(nullif(btrim(current_setting('citylink.capacity_blob_identity', true)), ''),
                '<unset>'),
       case when btrim(coalesce(current_setting('citylink.capacity_blob_identity', true), '')) = ''
            then 'UNPINNED' else 'CAPTURE' end

 order by check_id
 limit 20;
