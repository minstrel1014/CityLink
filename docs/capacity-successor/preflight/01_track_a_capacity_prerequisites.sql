-- =============================================================================
-- CityLink capacity successor — preflight page 01: Track A prerequisites
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only observation page. Not a migration, not
-- authorization, raises nothing. Refusal belongs to
-- 90_apply_gate_wrapper_DRAFT.sql.
--
-- Track served: A — the reviewed capacity DDL
--   supabase/migrations/20261119090000_group_hard_max.sql
--   blob a04048e90d6b64c692f03c722b9eea2849058aab, SHA-256
--   5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887.
--   This page observes the state that file was reviewed against. It never
--   restates, alters, re-applies or duplicates it.
--
-- Retired-guard traceability (option (b) reshape):
--   A-TAB-*, A-COL-*      replace guard G2 and G5's column portion
--   A-HLP-*               replaces G3 (helper posture, asserted never redefined)
--   A-CAP-*               replaces G5 (clean-slate forward application)
--   A-RPL-*               replaces G7 (signatures the reviewed file replaces)
--   A-LGC-*               replaces G6's legacy output-shape portion
--   A-RUN-*               replaces G8 and G9 (runner legality, schema posture)
--   A-TRG-*               replaces G10 (invitation-integrity attachment, F13)
--   G1 moved to page 00, G4 to page 05, G11 to pages 03 and 04.
--
-- Construction notes a reviewer should check:
--   * Presence uses to_regclass / to_regprocedure / to_regnamespace, which
--     return NULL for an absent name. There is no `::regclass` cast anywhere,
--     so an absent object is reported, never an abort.
--   * A helper's `search_path` pin is decided by the published normalization
--     contract: each proconfig entry is split at its first '=', quoting is
--     stripped, and the empty case is the empty normalized value. No
--     comparison against a hard-coded rendering such as 'search_path='.
--   * Output column sets use proargmodes ('t' table / 'o' out), not a comma
--     count of a rendered string, and not proallargnames, which does not exist.
--   * No application row, secret, or other project is read.
--
-- F13 ERRATUM (Adam's decision, 2026-11-23 00:40). As first shipped, the A-TRG
--   rows asserted that public.enforce_invitation_integrity() had NO attached
--   trigger, because the Stage 5 migration header note and the reviewed blob's
--   section 6 comment both describe the guard as "currently unattached". That
--   premise is wrong about every target that exists: supabase/schema.sql:354-357
--   attaches `invitations_enforce_integrity` as a BEFORE INSERT OR UPDATE, FOR
--   EACH ROW trigger on public.invitations, so the old expectation made this page
--   FAIL, and the wrapper refuse with 45006, on a correct database. The rows
--   below state the real condition, and more tightly than before: exactly one
--   non-internal attachment whose identity equals the recorded pin, plus a
--   capture of the whole attachment set so a silent re-attachment or a dropped
--   guard across an apply is visible rather than merely countable. An addition
--   fails the count, a removal fails the count, and a rename or retarget fails
--   the identity, so the strengthened row discriminates states the old row could
--   not have detected even when it passed. The reviewed blob is NOT edited here
--   or anywhere: its section 6 comment stands as reviewed, and the correction
--   lives in this instrument and in the package document's erratum section.
--   Pin evidence class: derived from repository DDL at this head and reproduced
--   on a disposable local PostgreSQL 17. It is a rehearsal pin. It is NOT a
--   value observed by Role 6 on Test or on Main, and must not be described as
--   target-verified until an authorized read-only run reproduces it.
--
-- SAFE TO RUN TWICE; identical rows are the expected outcome.
-- =============================================================================

with base(id, sig) as (
  values
    ('A-TAB-01', 'public.academic_terms'),
    ('A-TAB-02', 'public.citylink_settings'),
    ('A-TAB-03', 'public.study_groups'),
    ('A-TAB-04', 'public.group_memberships'),
    ('A-TAB-05', 'public.group_invitations'),
    ('A-TAB-06', 'public.group_join_requests'),
    ('A-TAB-07', 'public.group_recruitment_posts'),
    ('A-TAB-08', 'public.profiles'),
    ('A-TAB-09', 'public.courses'),
    ('A-TAB-10', 'public.enrolments')
),
helpers(ordinal, nsp, name, sig) as (
  values
    (1, 'private', 'can_browse_current_term_group',
     'private.can_browse_current_term_group(uuid)'),
    (2, 'private', 'can_manage_recruitment_post',
     'private.can_manage_recruitment_post(uuid)')
),
resolved(sig, ordinal, fid, impl_count, owner, secdef, cfg_rendered,
         sp_present, sp_normalized) as (
  select h.sig, h.ordinal, p.oid,
         (select count(*)
            from pg_proc q
            join pg_namespace n on n.oid = q.pronamespace
           where n.nspname = h.nsp and q.proname = h.name),
         r.rolname, p.prosecdef, c.cfg_rendered, c.sp_present, c.sp_normalized
    from helpers h
    left join pg_proc p on p.oid = to_regprocedure(h.sig)
    left join pg_roles r on r.oid = p.proowner
    cross join lateral (
      select coalesce(string_agg(e, ',' order by e), '<none>') as cfg_rendered,
             coalesce(bool_or(split_part(e, '=', 1) = 'search_path'), false)
               as sp_present,
             max(case when split_part(e, '=', 1) = 'search_path'
                      then btrim(replace(replace(substr(e, position('=' in e) + 1),
                              '"', ''), '''', ''))
                 end) as sp_normalized
        from unnest(coalesce(p.proconfig, array[]::text[])) as e
    ) c
),
capacity(id, sig) as (
  values
    ('A-CAP-01', 'public.set_group_max_members(uuid,integer)'),
    ('A-CAP-02', 'public.create_group_and_invite(uuid,uuid,text,integer)'),
    ('A-CAP-03', 'public.list_course_group_summaries_capacity(uuid)'),
    ('A-CAP-04', 'public.list_current_term_course_groups_capacity(uuid,text,uuid,integer)'),
    ('A-CAP-05', 'public.list_group_recruitment_posts_capacity(uuid,timestamptz,uuid,integer)'),
    ('A-CAP-06', 'public.remove_group_member(uuid,uuid)'),
    ('A-CAP-07', 'private.group_active_member_count(uuid)'),
    ('A-CAP-08', 'private.assert_group_has_capacity(uuid,integer)'),
    ('A-CAP-09', 'private.cancel_pending_invitations_from_removed_member(uuid,uuid)')
),
replaced(id, sig) as (
  values
    ('A-RPL-01', 'public.send_group_invitation(uuid,uuid)'),
    ('A-RPL-02', 'public.request_to_join_group(uuid)'),
    ('A-RPL-03', 'public.respond_to_group_invitation(uuid,boolean)'),
    ('A-RPL-04', 'public.review_group_join_request(uuid,boolean)'),
    ('A-RPL-05', 'public.create_group_and_invite(uuid,uuid,text)')
),
legacy(ord, sig, expect_names) as (
  values
    (1, 'public.list_course_group_summaries(uuid)',
     'profile_id,group_id,group_name,group_status,group_size'),
    (2, 'public.list_current_term_course_groups(uuid,text,uuid,integer)',
     'group_id,group_name,group_status,active_member_count,can_create_post,has_more'),
    (3, 'public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)',
     'post_id,group_id,group_name,subject,active_member_count,author_name,body,'
     || 'post_status,created_at,updated_at,closed_at,apply_enabled,can_manage,has_more')
),
legacy_resolved(ord, sig, expect_names, fid, out_names, rendered_result) as (
  select lg.ord, lg.sig, lg.expect_names, p.oid, o.out_names,
         pg_get_function_result(p.oid)
    from legacy lg
    left join pg_proc p on p.oid = to_regprocedure(lg.sig)
    cross join lateral (
      select coalesce(string_agg(nm, ',' order by ord), '<none>') as out_names
        from unnest(coalesce(p.proargnames, array[]::text[]))
             with ordinality as x(nm, ord)
       where p.proargmodes is not null
         and p.proargmodes[ord] = any (array['t', 'o'])
    ) o
),
foreign_owned(count) as (
  select count(*)
    from (select sig from replaced
          union all
          select 'public.create_group_and_invite(uuid,uuid,text,integer)'
          union all
          select sig from legacy) rp
    join pg_proc p on p.oid = to_regprocedure(rp.sig)
   join pg_roles r on r.oid = p.proowner
  where not pg_has_role(session_user, r.oid, 'member')
),
-- F13: every non-internal trigger attached to the reviewed guard function,
-- rendered as a six-field identity:
--   name;schema.table;timing;event(+event);orientation;enabled
-- pg_trigger.tgtype is a bit field: 1 row, 2 before, 4 insert, 8 delete,
-- 16 update, 32 truncate, 64 instead of; neither before nor instead-of means
-- after. tgenabled: 'O' origin, 'D' disabled, 'B' origin-unfired-backlink,
-- 'R' replica-only. The decoding was checked against pg_get_triggerdef() on
-- PostgreSQL 17.12 in the run recorded in the package document.
trg_rows(ident) as (
  select lower(t.tgname)
         || ';' || n.nspname || '.' || c.relname
         || ';' || case when t.tgtype & 2 <> 0 then 'before'
                        when t.tgtype & 64 <> 0 then 'instead-of'
                        else 'after' end
         || ';' || btrim(
              case when t.tgtype & 4  <> 0 then 'insert+'   else '' end
           || case when t.tgtype & 16 <> 0 then 'update+'   else '' end
           || case when t.tgtype & 8  <> 0 then 'delete+'   else '' end
           || case when t.tgtype & 32 <> 0 then 'truncate+' else '' end, '+')
         || ';' || case when t.tgtype & 1 <> 0 then 'row' else 'statement' end
         || ';' || case t.tgenabled
                     when 'O' then 'origin'
                     when 'D' then 'disabled'
                     when 'B' then 'origin-backlink'
                     else 'replica' end
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal
     and t.tgfoid = to_regprocedure('public.enforce_invitation_integrity()')
),
trg_obs(cnt, one, all_set) as (
  select count(*),
         case when count(*) = 1 then min(ident) else '<not-exactly-one>' end,
         coalesce(string_agg(ident, ' ;; ' order by ident), '<none>')
    from trg_rows
),
trg_pin(pin) as (
  values ('invitations_enforce_integrity;public.invitations;before;insert+update;'
          || 'row;origin')
)
select '01' as page, b.id as check_id,
       'base object present: ' || b.sig as subject,
       'present' as expected,
       coalesce(to_regclass(b.sig)::text, '<absent>') as observed,
       case when to_regclass(b.sig) is null then 'FAIL' else 'PASS' end as verdict
  from base b

union all
select '01', 'A-COL-01', 'current-term model: courses.term_id is NOT NULL',
       'attnotnull = true',
       coalesce((select case when a.attnotnull then 'true' else 'false' end
                   from pg_attribute a
                  where a.attrelid = to_regclass('public.courses')
                    and a.attname = 'term_id' and a.attnum > 0
                    and not a.attisdropped
                  limit 1), '<column absent>'),
       case when (select a.attnotnull from pg_attribute a
                    where a.attrelid = to_regclass('public.courses')
                      and a.attname = 'term_id' and a.attnum > 0
                      and not a.attisdropped
                    limit 1) then 'PASS' else 'FAIL' end

union all
select '01', 'A-COL-02', 'row-8 contract: group_recruitment_posts.subject NOT NULL',
       'attnotnull = true (the reviewed reads select p.subject at blob :1494/:1532)',
       coalesce((select case when a.attnotnull then 'true' else 'false' end
                   from pg_attribute a
                  where a.attrelid = to_regclass('public.group_recruitment_posts')
                    and a.attname = 'subject' and a.attnum > 0
                    and not a.attisdropped
                  limit 1), '<column absent>'),
       case when (select a.attnotnull from pg_attribute a
                    where a.attrelid = to_regclass('public.group_recruitment_posts')
                      and a.attname = 'subject' and a.attnum > 0
                      and not a.attisdropped
                    limit 1) then 'PASS' else 'FAIL' end

union all
select '01', 'A-COL-03', 'clean slate: study_groups.max_members absent',
       'absent before a first forward application',
       coalesce((select 'present, attnotnull=' || a.attnotnull::text
                   from pg_attribute a
                  where a.attrelid = to_regclass('public.study_groups')
                    and a.attname = 'max_members' and a.attnum > 0
                    and not a.attisdropped
                  limit 1), '<absent>'),
       case when (select count(*) from pg_attribute a
                    where a.attrelid = to_regclass('public.study_groups')
                      and a.attname = 'max_members' and a.attnum > 0
                      and not a.attisdropped) > 0 then 'FAIL' else 'PASS' end

union all
select '01', 'A-HLP-' || r.ordinal || '-CNT',
       'helper implemented exactly once: ' || r.sig,
       '1', coalesce(r.impl_count::text, '<unreadable>'),
       case when coalesce(r.impl_count, 0) = 1 then 'PASS' else 'FAIL' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-OWN',
       'helper owner: ' || r.sig,
       'postgres (the reported parity value, not an assumption of it)',
       coalesce(r.owner, '<absent or unreadable>'),
       case when r.owner = 'postgres' then 'PASS' else 'FAIL' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-DEF',
       'helper is SECURITY DEFINER: ' || r.sig,
       'true', coalesce(r.secdef::text, '<absent>'),
       case when r.secdef is true then 'PASS' else 'FAIL' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-PIN',
       'helper search_path pin present and empty: ' || r.sig,
       'a search_path entry exists and its normalized value is empty',
       'entries=' || r.cfg_rendered || ' | normalized='
       || coalesce(nullif(r.sp_normalized, ''), '<empty>'),
       case when r.fid is null then 'FAIL'
            when not r.sp_present then 'FAIL'
            when coalesce(r.sp_normalized, '') = '' then 'PASS'
            else 'FAIL' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-XAN',
       'anon EXECUTE posture: ' || r.sig,
       'false — these helpers are not API entry points',
       coalesce(has_function_privilege('anon', r.fid, 'execute')::text,
                '<not evaluable>'),
       case when r.fid is null then 'FAIL'
            when has_function_privilege('anon', r.fid, 'execute') then 'FAIL'
            else 'PASS' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-XAU',
       'authenticated EXECUTE posture: ' || r.sig,
       'false',
       coalesce(has_function_privilege('authenticated', r.fid, 'execute')::text,
                '<not evaluable>'),
       case when r.fid is null then 'FAIL'
            when has_function_privilege('authenticated', r.fid, 'execute') then 'FAIL'
            else 'PASS' end
  from resolved r

union all
select '01', 'A-HLP-' || r.ordinal || '-XSV',
       'service_role EXECUTE posture: ' || r.sig,
       'false (the recorded posture on both targets)',
       coalesce(has_function_privilege('service_role', r.fid, 'execute')::text,
                '<not evaluable>'),
       case when r.fid is null then 'FAIL'
            when has_function_privilege('service_role', r.fid, 'execute') then 'FAIL'
            else 'PASS' end
  from resolved r

union all
select '01', c.id, 'capacity object not yet present: ' || c.sig,
       'absent — a first forward application, not a repeat',
       coalesce(to_regprocedure(c.sig)::text, '<absent>'),
       case when to_regprocedure(c.sig) is null then 'PASS' else 'FAIL' end
  from capacity c

union all
select '01', 'A-CAP-11', 'capacity table not yet present: private.group_removal_context',
       'absent', coalesce(to_regclass('private.group_removal_context')::text, '<absent>'),
       case when to_regclass('private.group_removal_context') is null
            then 'PASS' else 'FAIL' end

union all
select '01', 'A-CAP-12', 'capacity constraint not yet present: study_groups_max_members_chk',
       '0 rows in pg_constraint',
       coalesce((select count(*)::text from pg_constraint k
                  where k.conrelid = to_regclass('public.study_groups')
                    and k.conname = 'study_groups_max_members_chk'), '0'),
       case when coalesce((select count(*) from pg_constraint k
                             where k.conrelid = to_regclass('public.study_groups')
                               and k.conname = 'study_groups_max_members_chk'), 0) > 0
            then 'FAIL' else 'PASS' end

union all
select '01', r.id, 'signature the reviewed file replaces is present: ' || r.sig,
       'present', coalesce(to_regprocedure(r.sig)::text, '<absent>'),
       case when to_regprocedure(r.sig) is null then 'FAIL' else 'PASS' end
  from replaced r

union all
-- F16 fix (Adam, 2026-11-23 02:25): the two-argument create_group_and_invite is
-- TARGET-RELATIVE, not universally absent. Recorded live parity (coordinator
-- metadata snapshot §5) says CityLink Launch still ships (uuid,uuid) — the
-- reviewed file drops it at blob :245 — while the frozen Prototype already moved
-- to (uuid,uuid,text) in Stage 5 and therefore has no (uuid,uuid) to drop.
-- Judging both targets against "absent" failed the release target for being
-- correct: F13's defect in the opposite direction.
--
-- The expectation therefore comes from the DECLARED ref, not from the project
-- this package was first designed against. `current_setting(..., true)` is a
-- read, not a SET, so the page stays SELECT-only and writes nothing. An
-- undeclared or unrecognised ref yields UNPINNED, never PASS: an unknown target
-- state must not be green by omission. A genuinely unexpected state still FAILs
-- — Launch without (uuid,uuid), or Prototype with it.
select '01', 'A-RPL-06',
       'two-argument create_group_and_invite matches the declared target',
       case coalesce(nullif(btrim(current_setting('citylink.capacity_target_ref', true)), ''), '')
         when 'pijslbchvstkoweslymr' then
           'present — CityLink Launch still ships (uuid,uuid); the reviewed file drops it at blob :245'
         when 'wkzclgmhrtecnpexfesr' then
           'absent — the frozen Prototype replaced it with (uuid,uuid,text) in Stage 5'
         else
           'unknown — no recognised target ref declared, so no expectation can be judged'
       end,
       coalesce(to_regprocedure('public.create_group_and_invite(uuid,uuid)')::text,
                '<absent>'),
       case coalesce(nullif(btrim(current_setting('citylink.capacity_target_ref', true)), ''), '')
         when 'pijslbchvstkoweslymr' then
           case when to_regprocedure('public.create_group_and_invite(uuid,uuid)') is not null
                then 'PASS' else 'FAIL' end
         when 'wkzclgmhrtecnpexfesr' then
           case when to_regprocedure('public.create_group_and_invite(uuid,uuid)') is null
                then 'PASS' else 'FAIL' end
         else 'UNPINNED'
       end
union all
-- A-RPL-07 (capture): the whole create_group_and_invite overload set for the
-- declared target. A verdict alone cannot show that a *different* overload
-- appeared or vanished, so the set is recorded for cross-run comparison — the
-- same capture-and-compare discipline as A-TRG-03.
select '01', 'A-RPL-07',
       'create_group_and_invite overload inventory for the declared target',
       'recorded for cross-run comparison; carries no gate value',
       coalesce((select string_agg(pg_get_function_identity_arguments(p.oid),
                                   ' ;; ' order by 1)
                   from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.proname = 'create_group_and_invite'),
                '<none>'),
       'CAPTURE'

union all
select '01', 'A-LGC-' || lpad((l.ord * 2 - 1)::text, 2, '0'),
       'legacy read output set matches the reviewed name list: ' || l.sig,
       l.expect_names,
       case when l.fid is null then '<function absent>'
            else coalesce(l.out_names, '<none>') end,
       case when l.fid is null then 'FAIL'
            when coalesce(l.out_names, '<none>') = l.expect_names then 'PASS'
            else 'FAIL' end
  from legacy_resolved l

union all
select '01', 'A-LGC-' || lpad((l.ord * 2)::text, 2, '0'),
       'legacy read result rendering (capture, not a gate): ' || l.sig,
       'recorded verbatim for the pinning appendix',
       case when l.fid is null then '<function absent>'
            else coalesce(substr(l.rendered_result, 1, 120), '<unreadable>') end,
       'CAPTURE'
  from legacy_resolved l

union all
select '01', 'A-RUN-01', 'runner can legally replace every object the file replaces',
       '0 objects owned by a role the session role is not a member of',
       coalesce(f.count::text, '<unreadable>'),
       case when coalesce(f.count, 0) = 0 then 'PASS' else 'FAIL' end
  from foreign_owned f

union all
select '01', 'A-RUN-02', 'runner has CREATE on schema public',
       'true on the authorized Supabase target',
       coalesce(has_schema_privilege(session_user, 'public', 'create')::text,
                '<unreadable>'),
       case when has_schema_privilege(session_user, 'public', 'create')
            then 'PASS' else 'FAIL' end

union all
select '01', 'A-RUN-03', 'schema private posture before application (capture)',
       'either state is legitimate; the reviewed file creates it at blob :971',
       coalesce((select 'owner=' || r.rolname from pg_namespace n
                   join pg_roles r on r.oid = n.nspowner
                  where n.oid = to_regnamespace('private')), '<absent>'),
       'CAPTURE'

union all
select '01', 'A-TRG-01', 'invitation-integrity function exists as reviewed',
       'present',
       coalesce(to_regprocedure('public.enforce_invitation_integrity()')::text,
                '<absent>'),
       case when to_regprocedure('public.enforce_invitation_integrity()') is null
            then 'FAIL' else 'PASS' end

union all
select '01', 'A-TRG-02',
       'invitation-integrity guard: exactly one attachment, identity = pin',
       (select 'count=1 identity=' || p.pin from trg_pin p),
       (select 'count=' || o.cnt || ' identity=' || coalesce(o.one, '<none>')
          from trg_obs o),
       case when (select cnt from trg_obs) = 1
             and (select one from trg_obs) is not null
             and (select one from trg_obs) = (select pin from trg_pin)
            then 'PASS' else 'FAIL' end

union all
-- F13, second half of Adam's instruction: the set must be UNCHANGED across the
-- apply. This page is stateless and cannot remember a previous run, so the
-- obligation is discharged by capture-and-compare: A-TRG-03 records the whole
-- attachment set, and the runbook requires the post-apply re-run to be
-- byte-identical to it. A-TRG-02 alone already fails on an addition (count 2)
-- and on a removal (count 0); A-TRG-03 is what makes the difference visible to a
-- reviewer instead of inferred from a number.
select '01', 'A-TRG-03',
       'invitation-integrity attachment set, for the unchanged-across-apply '
       || 'comparison',
       'identical to the pre-apply record for this run id; any addition or '
       || 'removal is a stop',
       (select all_set from trg_obs),
       'CAPTURE'

 order by check_id
 limit 63;
-- F16 (Adam, 2026-11-23 02:25). A-RPL-06 used to assert that the two-argument
--   create_group_and_invite was absent everywhere, because that is what the
--   frozen Prototype looks like after Stage 5. CityLink Launch still ships it —
--   the reviewed file drops it at blob :245 — so the row failed the release
--   target for being correct. The expectation is now read from the DECLARED
--   target ref: Launch expects it present, the frozen Prototype expects it
--   absent, and any other or undeclared ref yields UNPINNED rather than passing
--   by omission. This is the only place a page reads a marker, it is a read of
--   current_setting (never a SET), and nothing is written. A-RPL-07 captures the
--   whole overload set so a change in a *different* overload is visible across
--   runs instead of being inferred from one verdict.
--
-- SAFE TO RUN TWICE; identical rows are the expected outcome.
