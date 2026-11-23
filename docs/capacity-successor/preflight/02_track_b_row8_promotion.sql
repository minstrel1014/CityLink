-- =============================================================================
-- CityLink capacity successor — preflight page 02: Track B row-8 observation
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only observation page. Not a migration, not
-- authorization, raises nothing.
--
-- Track served: B — promotion of the row-8 people-page / naming objects
--   supabase/migrations/20261118083000_stage6_people_page_naming.sql
--   (update_own_display_name, the three list_* reads, the subject column and
--   its length checks, and the posts read recreated with subject).
--
-- What this page is for: Adam keeps Main outside the capacity plan until
-- Tracks B and C complete. Before that promotion can even be proposed, a
-- reviewer needs to know what a specific target already has, in the target's
-- own engine-rendered words. This page never copies a definition, never
-- creates one, and never claims the row-8 text is present or absent as a fact
-- about a target it has not queried.
--
-- Verdict policy for this page: rows are CAPTURE unless the reviewed capacity
-- blob itself depends on the item (A-COL-02 and A-RPL-06 on page 01 are the
-- gating forms of that dependency). Naming an object "missing" here is a plan
-- input for Track B, not a capacity blocker.
--
-- SAFE TO RUN TWICE; identical rows are the expected outcome.
-- =============================================================================

with row8(id, label, sig) as (
  values
    ('B-FUN-01', 'row-8 own-name update RPC',
     'public.update_own_display_name(uuid,text)'),
    ('B-FUN-02', 'row-8 course-group list RPC',
     'public.list_current_term_course_groups(uuid,text,uuid,integer)'),
    ('B-FUN-03', 'row-8 group-member list RPC',
     'public.list_current_term_group_members(uuid)'),
    ('B-FUN-04', 'row-8 ungrouped-classmate list RPC',
     'public.list_course_ungrouped_classmates(uuid,text,uuid,integer)'),
    ('B-FUN-05', 'row-8 posts read recreated with subject',
     'public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)'),
    ('B-FUN-06', 'legacy two-argument create dropped by row 8',
     'public.create_group_and_invite(uuid,uuid)'),
    ('B-FUN-07', 'legacy three-argument create dropped by row 8',
     'public.create_group_and_invite(uuid,uuid,text)')
),
pronames(id, label, nsp, name) as (
  values
    ('B-INV-01', 'people-page naming RPCs by name', 'public', 'update_own_display_name'),
    ('B-INV-02', 'current-term course group reads by name', 'public', 'list_current_term_course_groups'),
    ('B-INV-03', 'current-term group member reads by name', 'public', 'list_current_term_group_members'),
    ('B-INV-04', 'ungrouped classmate reads by name', 'public', 'list_course_ungrouped_classmates'),
    ('B-INV-05', 'recruitment posts read by name', 'public', 'list_group_recruitment_posts'),
    ('B-INV-06', 'group create RPC overloads by name', 'public', 'create_group_and_invite')
),
cols(id, label, rel, col) as (
  values
    ('B-COL-01', 'subject column carrying the row-8 contract',
     'public.group_recruitment_posts', 'subject'),
    ('B-COL-02', 'display name column the row-8 RPC updates',
     'public.profiles', 'display_name')
),
languages(oid, lanname) as (
  select p.oid, l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
)
select '02' as page, r.id as check_id,
       r.label || ': ' || r.sig as subject,
       'rendered identity if present; <absent> is a Track B plan input' as expected,
       coalesce(r.sig || ' -> ' || pg_get_function_arguments(p.oid)
                || ' | returns ' || coalesce(pg_get_function_result(p.oid), 'void')
                || ' | lang ' || g.lanname
                || ' | definer ' || p.prosecdef::text,
               '<absent>') as observed,
       'CAPTURE' as verdict
  from row8 r
  left join pg_proc p on p.oid = to_regprocedure(r.sig)
  left join languages g on g.oid = p.oid

union all
select '02', n.id, n.label,
       'every overload listed with its own argument signature',
       coalesce((select string_agg('  overload ' || pg_get_function_arguments(p.oid), ' ;;'
                                   order by pg_get_function_arguments(p.oid))
                   from pg_proc p
                   join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = n.nsp and p.proname = n.name), '<none>'),
       'CAPTURE'
  from pronames n

union all
select '02', c.id, c.label || ' on ' || c.rel,
       'column exists with its engine-rendered type and nullability',
       coalesce((select a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                       || ' attnotnull=' || a.attnotnull::text
                       || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '<none>')
                   from pg_attribute a
                   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = to_regclass(c.rel)
                    and a.attname = c.col and a.attnum > 0 and not a.attisdropped
                  limit 1), '<column absent>'),
       'CAPTURE'
  from cols c

union all
select '02', 'B-CHK-01', 'row-8 length checks on the subject column',
       'capture: row 8 declares CHECK constraints bounding subject length',
       coalesce((select string_agg(k.conname || ' ' || pg_get_constraintdef(k.oid), ' ;;'
                                   order by k.conname)
                   from pg_constraint k
                  where k.conrelid = to_regclass('public.group_recruitment_posts')
                    and k.contype = 'c'), '<none>'),
       'CAPTURE'

union all
select '02', 'B-CNT-01', 'row-8 overload count for the create RPC',
       'capture: how many create_group_and_invite overloads live on this target',
       coalesce((select count(*)::text from pg_proc p
                   join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public'
                    and p.proname = 'create_group_and_invite'), '0'),
       'CAPTURE'

 order by check_id
 limit 40;
