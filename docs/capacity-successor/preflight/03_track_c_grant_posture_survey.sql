-- =============================================================================
-- CityLink capacity successor — preflight page 03: Track C grant posture survey
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only capture page. Not a migration, not
-- authorization, raises nothing, and asserts nothing about what grants *should*
-- be.
--
-- Track served: C — RPC grant and broader security normalization (the
--   anon/authenticated/service_role effective-grant drift, and the service-role
--   EXECUTE posture on public.handle_new_user()).
--
-- Why this page refuses to assert: grant normalization is its own track, with
-- its own review and — for Main — its own future Adam decision. If a capacity
-- preflight quietly "expected" a grant state, a reviewer could mistake a
-- capacity pass for a security pass. So every posture row here is CAPTURE. The
-- only rows that can be FAIL are identity rows saying the survey itself could
-- not be evaluated on this target.
--
-- Normalization contract for privilege text on this page:
--   * proacl / nspacl / defaclacl are recorded as the engine's own text
--     rendering — reordered by nothing, rewritten by nothing.
--   * The comparison a reviewer should actually make role-by-role is through
--     has_function_privilege, which resolves the EFFECTIVE posture (membership,
--     PUBLIC grants, defaults) instead of pattern-matching ACL strings.
--   * aclexplode() is deliberately not used: its column set has differed across
--     majors, and an instrument of record must behave the same on 17 as it is
--     later asked to describe other engines.
--
-- SAFE TO RUN TWICE; identical rows are the expected outcome.
-- =============================================================================

with targets(id, label, sig) as (
  values
    ('C-FUN-01', 'helper EXECUTE surface', 'private.can_browse_current_term_group(uuid)'),
    ('C-FUN-02', 'helper EXECUTE surface', 'private.can_manage_recruitment_post(uuid)'),
    ('C-FUN-03', 'write RPC ACL', 'public.send_group_invitation(uuid,uuid)'),
    ('C-FUN-04', 'write RPC ACL', 'public.request_to_join_group(uuid)'),
    ('C-FUN-05', 'write RPC ACL', 'public.respond_to_group_invitation(uuid,boolean)'),
    ('C-FUN-06', 'write RPC ACL', 'public.review_group_join_request(uuid,boolean)'),
    ('C-FUN-07', 'write RPC ACL', 'public.create_group_and_invite(uuid,uuid,text)'),
    ('C-FUN-08', 'write RPC ACL', 'public.create_group_and_invite(uuid,uuid,text,integer)'),
    ('C-FUN-09', 'read RPC ACL', 'public.list_course_group_summaries(uuid)'),
    ('C-FUN-10', 'read RPC ACL', 'public.list_current_term_course_groups(uuid,text,uuid,integer)'),
    ('C-FUN-11', 'read RPC ACL', 'public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)'),
    ('C-FUN-12', 'read RPC ACL', 'public.list_course_ungrouped_classmates(uuid,text,uuid,integer)'),
    ('C-FUN-13', 'Track C named drift item', 'public.handle_new_user()')
),
rolelist(id, label, role_name) as (
  values
    ('C-ROL-01', 'browser role available for posture evaluation', 'anon'),
    ('C-ROL-02', 'browser role available for posture evaluation', 'authenticated'),
    ('C-ROL-03', 'server role available for posture evaluation', 'service_role'),
    ('C-ROL-04', 'owner role referenced by the reviewed records', 'postgres')
),
effective(id, ordinality, role_name, sig) as (
  values
    ('C-EXE-01', 1, 'anon', 'private.can_browse_current_term_group(uuid)'),
    ('C-EXE-02', 2, 'authenticated', 'private.can_browse_current_term_group(uuid)'),
    ('C-EXE-03', 3, 'service_role', 'private.can_browse_current_term_group(uuid)'),
    ('C-EXE-04', 4, 'anon', 'private.can_manage_recruitment_post(uuid)'),
    ('C-EXE-05', 5, 'authenticated', 'private.can_manage_recruitment_post(uuid)'),
    ('C-EXE-06', 6, 'service_role', 'private.can_manage_recruitment_post(uuid)'),
    ('C-EXE-07', 7, 'anon', 'public.create_group_and_invite(uuid,uuid,text)'),
    ('C-EXE-08', 8, 'authenticated', 'public.create_group_and_invite(uuid,uuid,text)'),
    ('C-EXE-09', 9, 'service_role', 'public.handle_new_user()'),
    ('C-EXE-10', 10, 'anon', 'public.handle_new_user()')
)
select '03' as page, t.id as check_id,
       t.label || ': ' || t.sig as subject,
       'recorded as the engine renders it; no assertion' as expected,
       coalesce('acl=' || p.proacl::text, '<default acl, none stored>')
       || ' | owner=' || coalesce(r.rolname, '<unreadable>')
       || ' | definer=' || coalesce(p.prosecdef::text, '<unreadable>') as observed,
       'CAPTURE' as verdict
  from targets t
  left join pg_proc p on p.oid = to_regprocedure(t.sig)
  left join pg_roles r on r.oid = p.proowner

union all
select '03', n.id, n.label, 'present on a Supabase-shaped target',
       n.role_name || ' = ' || coalesce(to_regrole(n.role_name)::text, '<absent>'),
       case when to_regrole(n.role_name) is null then 'FAIL' else 'CAPTURE' end
  from rolelist n

union all
-- Effective posture: what the role can really do, not what one ACL string
-- appears to say.
select '03', e.id, 'effective EXECUTE for ' || e.role_name || ' on ' || e.sig,
       'no assertion; compare target to target',
       coalesce(has_function_privilege(e.role_name, to_regprocedure(e.sig),
                                       'execute')::text,
                '<not evaluable: object or role absent>'),
       'CAPTURE'
  from effective e

union all
select '03', 'C-SCH-01', 'schema posture: public', 'recorded, not asserted',
       coalesce((select 'owner=' || r.rolname || ' acl=' || n.nspacl::text
                   from pg_namespace n join pg_roles r on r.oid = n.nspowner
                  where n.oid = to_regnamespace('public')), '<absent>'),
       'CAPTURE'

union all
select '03', 'C-SCH-02', 'schema posture: private', 'recorded, not asserted',
       coalesce((select 'owner=' || r.rolname || ' acl=' || n.nspacl::text
                   from pg_namespace n join pg_roles r on r.oid = n.nspowner
                  where n.oid = to_regnamespace('private')), '<absent>'),
       'CAPTURE'

union all
-- defaclobjtype is cast to text explicitly: concatenating it inside a text
-- chain is an unresolved-operator error, which is why the retired guard's
-- equivalent line never produced a record.
select '03', 'C-DFA-01', 'default ACL rows, engine-rendered',
       'recorded, not asserted',
       coalesce((select string_agg('role=' || d.defaclrole::regrole::text
                                   || ' type=' || d.defaclobjtype::text
                                   || ' acl=' || d.defaclacl::text, ' ;; '
                                   order by d.defaclrole::regrole::text)
                   from pg_default_acl d), '<none>'),
       'CAPTURE'

union all
select '03', 'C-DFA-02', 'default ACL row count', 'recorded, not asserted',
       coalesce((select count(*)::text from pg_default_acl), '0'), 'CAPTURE'

union all
select '03', 'C-POL-01', 'RLS policy count on capacity-relevant tables',
       'recorded, not asserted',
       coalesce((select string_agg(x.tbl || '=' || x.policies::text, ' ;; ' order by x.tbl)
                   from (
                     select n.nspname || '.' || c.relname as tbl,
                            (select count(*) from pg_policies pp
                              where pp.schemaname = n.nspname
                                and pp.tablename = c.relname) as policies
                       from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where c.relkind = 'r'
                        and n.nspname = 'public'
                        and c.relname in ('study_groups', 'group_memberships',
                                          'group_invitations', 'group_join_requests',
                                          'group_recruitment_posts')
                      limit 20
                    ) x), '<none>'),
       'CAPTURE'

union all
select '03', 'C-POL-02', 'RLS enabled flag on capacity-relevant tables',
       'recorded, not asserted',
       coalesce((select string_agg(c.relname || '=' || c.relrowsecurity::text, ' ;; '
                                     order by c.relname)
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public'
                    and c.relname in ('study_groups', 'group_memberships',
                                      'group_invitations', 'group_join_requests',
                                      'group_recruitment_posts')
                  limit 20), '<none>'),
       'CAPTURE'

 order by check_id
 limit 60;
