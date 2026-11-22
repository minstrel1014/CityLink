-- =============================================================================
-- CityLink group capacity successor - per-target prerequisite guard
-- DRAFT REVIEW MATERIAL ONLY. NOT A MIGRATION. DO NOT APPLY TO ANY DATABASE.
-- =============================================================================
--
-- Prepared by : Role 6 continuity task (database security and migration
--               review; the human name for Role 6 is still TBD, so no human
--               authorship is claimed for this file).
-- Prepared on : 2026-11-22, at PR #41 docs head
--               65058a8077ad89f5796151e7eeb539ba7b616d0c.
-- Reviewed DDL: supabase/migrations/20261119090000_group_hard_max.sql
--               blob a04048e90d6b64c692f03c722b9eea2849058aab,
--               sha256 5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887.
--               This guard does not modify, restate or rebase that file.
-- Companion  : docs/capacity-successor/CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md
--              docs/capacity-successor/CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md
--
-- PURPOSE
--   Adam's approved 2026-11-22 helper policy requires that, immediately before
--   any separately authorized application to a named target, a SELECT-only
--   preflight verify expected signatures, ownership, SECURITY DEFINER behavior,
--   empty search path, effective grants and normalized body equivalence, and
--   that a mismatch stops that application. This file is the draft form of that
--   gate for the disposable Test project only.
--
-- WHAT IT IS NOT
--   * Not authorization for anything: not application, not Test write, not
--     Main write, not merge, not ready transition, not deployment or publication.
--   * Not a blind replay of repository filenames, and not a ledger repair
--     (ledger identity is a separate track with its own authorization).
--   * Not a helper redefinition. 20261118050000_stage6_chat_recruitment.sql
--     stays authoritative for private.can_browse_current_term_group (declared at
--     :133) and private.can_manage_recruitment_post (declared at :160), with the
--     browser-role revocations at :931-:932. This file only asserts their state.
--   * Not Main-capable. Main is ineligible for the reviewed capacity DDL
--     (package document section 4.2) and is read-only under the current
--     boundary; check G1 refuses Main's ref outright.
--   * Never executed or even parsed by Role 6: this task had no database
--     access. Syntax and behavior are UNVERIFIED and must be dry-run under
--     explicit read-only authorization before anyone relies on them.
--
-- READ-ONLY BY CONSTRUCTION
--   Catalog reads, RAISE NOTICE capture and one final RAISE EXCEPTION only.
--   There is no create, alter, drop, grant, revoke, comment, insert, update,
--   delete, truncate, copy, call or select-into-table statement in this file.
--   No application row, secret, credential, token or setting value is read;
--   only object existence and structural properties. Requires PostgreSQL 15+
--   because it uses sha256(bytea).
--
-- HOW A FUTURE AUTHORIZED PREFLIGHT WOULD USE IT (illustration only)
--   begin;
--   set local citylink.capacity_preflight_target = 'wkzclgmhrtecnpexfesr';
--   set local citylink.capacity_preflight_expected_digests =
--     '<browse hex>,<manage hex>';           -- must be pinned first, see G4
--   \i docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql
--   -- Only if the guard finishes without raising, and only under Adam's
--   -- separate Test-only application authorization, continue in the same
--   -- session with the byte-identical reviewed capacity file.
--   rollback;                                 -- a dry run never commits
--
--   The guard and the capacity file are two steps, not one atomic unit, because
--   the reviewed file must not be edited. Mitigations: the guard is read-only;
--   the capacity file is already one explicit transaction (begin; at :39,
--   commit; at :1756) so a mid-file failure leaves nothing behind; and the
--   checklist requires the guard output and the application to be recorded in
--   the same authorized run.
--
-- STABLE OPERATOR TOKENS (never client contracts)
--   group_capacity_main_out_of_scope      guard pointed at Main's ref
--   group_capacity_prerequisite_unpinned  a required constant was not supplied,
--                                         so the check cannot pass honestly
--   group_capacity_prerequisite_mismatch  one or more pinned checks failed; the
--                                         detail lists every failure at once
--   These are preflight signals for the operator. They must not be mapped to
--   the approved stale-client upgrade message, and they are distinct from the
--   reviewed group_capacity_upgrade_required stub signal at blob :398-:399.
--
-- DRAFT-ONLY REVIEW NOTES
--   1. G6/G7 output-column extraction assumes proargmodes marks OUT/TABLE
--      parameters as 'o' or 't'. Confirm that against the live catalog during
--      the dry run; if the assumption is wrong the check reports a failure, not
--      a false pass, because a null extraction is treated as a mismatch.
--   2. G4 depends on the normalization recipe AND its input scope. The recipe
--      below hashes pg_get_functiondef output; the coordinator's canonical
--      values came from a normalization whose exact expression is not recorded
--      in the packet, so this candidate recipe is a starting point, not a gate.
--      Until it is pinned, G4 fails closed by design.
--   3. G8 assumes the migration runner can already replace the objects the
--      reviewed file creates or replaces. If it cannot, the correct outcome is
--      a stop for review, not a grant change inside capacity work.
--   4. G10 encodes the in-repo fact that public.enforce_invitation_integrity()
--      has no trigger on Test or Main (20261102131343_stage5_groups.sql:19-21,
--      restated at capacity blob :1171-:1175). A target where it IS attached
--      does not match the reviewed premise and must stop.
--   5. remove_group_member(uuid, uuid) is created by the capacity file
--      (blob :1056, returns text). It is therefore captured, not required, and
--      a pre-existing version with a different return type is a stop because
--      PostgreSQL cannot change a function's return type in place.

do $capacity_guard$
declare
  v_test_ref constant text := 'wkzclgmhrtecnpexfesr';
  v_main_ref constant text := 'pijslbchvstkoweslymr';

  v_target   text := btrim(coalesce(current_setting(
                 'citylink.capacity_preflight_target', true), ''));
  v_digests  text := btrim(coalesce(current_setting(
                 'citylink.capacity_preflight_expected_digests', true), ''));

  v_fail     text[] := '{}';
  v_note     text[] := '{}';
  v_item     text;
  v_oid      oid;
  v_sig      regprocedure;
  v_flag     boolean;
  v_config   text;
  v_owner    text;
  v_text     text;
  v_expected text;
  v_names    text[];
  v_count    integer;
begin
  -- -------------------------------------------------------------------------
  -- G1 target identity. Unnamed, unknown or Main all stop.
  -- -------------------------------------------------------------------------
  if v_target = '' then
    raise exception 'group_capacity_prerequisite_unpinned'
      using
        detail = 'citylink.capacity_preflight_target is not set. Set it to the '
              || 'exact disposable Test ref named in Adam''s authorization; '
              || 'the guard will not guess a target.',
        errcode = '45000';
  end if;

  if v_target = v_main_ref then
    raise exception 'group_capacity_main_out_of_scope'
      using
        detail = 'Main is read-only under the current Adam boundary, and the '
              || 'reviewed capacity file cannot apply to it as written: the '
              || 'legacy list_group_recruitment_posts wrapper re-declares a '
              || 'subject output column that Main''s released result does not '
              || 'have (a return-type change PostgreSQL rejects), Main has no '
              || 'group_recruitment_posts.subject for the plpgsql capacity '
              || 'read, and the reviewed file drops the two-argument '
              || 'create_group_and_invite that Main still relies on. Row-8 '
              || 'promotion and grant normalization are separate tracks.',
        hint = 'Do not retarget this guard. Any Main capacity path needs a new '
            || 'explicit Adam decision in docs/team/DECISIONS.md.',
        errcode = '45000';
  end if;

  if v_target <> v_test_ref then
    raise exception 'group_capacity_prerequisite_mismatch'
      using
        detail = 'target ref "' || v_target || '" is neither the authorized '
              || 'disposable Test ref nor Main; the guard cannot classify it',
        errcode = '45000';
  end if;

  -- A project ref is not reliably discoverable from inside a SQL session. The
  -- operator must confirm the connected project out-of-band first; this guard
  -- reads no project list and never enumerates any other project.
  v_note := v_note || 'G1 target ref pinned to the disposable Test project; '
    || 'connector/target identity was confirmed out-of-band by the operator '
    || 'and is recorded in the checklist, not by this query';

  -- -------------------------------------------------------------------------
  -- G2 objects the reviewed capacity file builds on.
  -- -------------------------------------------------------------------------
  if to_regclass('public.academic_terms') is null then
    v_fail := v_fail || 'G2 public.academic_terms missing';
  end if;
  if to_regclass('public.citylink_settings') is null then
    v_fail := v_fail || 'G2 public.citylink_settings missing';
  end if;
  foreach v_item in array array[
      'public.study_groups', 'public.group_memberships', 'public.group_invitations',
      'public.group_join_requests', 'public.group_recruitment_posts',
      'public.profiles', 'public.courses', 'public.enrolments'
    ] loop
    if to_regclass(v_item) is null then
      v_fail := v_fail || 'G2 ' || v_item || ' missing';
    end if;
  end loop;
  if to_regclass('public.courses') is not null and not exists (
        select 1 from pg_attribute
        where attrelid = 'public.courses'::regclass
          and attname = 'term_id' and attnum > 0 and not attisdropped
          and attnotnull
      ) then
    v_fail := v_fail || 'G2 courses.term_id is missing or nullable; current-term '
      || 'capacity logic assumes the term model is in place';
  end if;

  -- -------------------------------------------------------------------------
  -- G3 helper posture, asserted only, never redefined.
  -- -------------------------------------------------------------------------
  -- to_regfunction is used everywhere below because a text-to-regprocedure
  -- cast raises immediately when an object is absent, and this guard is meant
  -- to report every mismatch at once rather than abort on the first one.
  foreach v_item in array array[
      'private.can_browse_current_term_group(uuid)',
      'private.can_manage_recruitment_post(uuid)'
    ] loop
    v_oid := to_regfunction(v_item);
    v_flag := null;
    v_config := null;
    v_owner := null;
    if v_oid is null then
      v_fail := v_fail || 'G3 ' || v_item || ' missing';
    else
      select p.prosecdef,
             coalesce((select string_agg(c, ',' order by c)
                         from unnest(p.proconfig) c), '<none>'),
             r.rolname
        into v_flag, v_config, v_owner
        from pg_proc p
        join pg_roles r on r.oid = p.proowner
       where p.oid = v_oid;
      if not v_flag then
        v_fail := v_fail || 'G3 ' || v_item || ' is not SECURITY DEFINER';
      end if;
      if v_config <> 'search_path=' then
        v_fail := v_fail || 'G3 ' || v_item || ' search_path pin is not empty; '
          || 'observed proconfig "' || v_config || '"';
      end if;
      if v_owner <> 'postgres' then
        v_fail := v_fail || 'G3 ' || v_item || ' owner is "' || v_owner
          || '", expected "postgres"';
      end if;
    end if;
  end loop;

  if to_regrole('anon') is null or to_regrole('authenticated') is null then
    v_fail := v_fail || 'G3 role anon or authenticated is missing; ACL posture '
      || 'cannot be evaluated';
  else
    foreach v_item in array array[
        'private.can_browse_current_term_group(uuid)',
        'private.can_manage_recruitment_post(uuid)'
      ] loop
      v_oid := to_regfunction(v_item);
      if v_oid is not null then
        if has_function_privilege('anon', v_oid, 'execute') then
          v_fail := v_fail || 'G3 anon can EXECUTE ' || v_item
            || '; these helpers are not API entry points';
        end if;
        if has_function_privilege('authenticated', v_oid, 'execute') then
          v_fail := v_fail || 'G3 authenticated can EXECUTE ' || v_item;
        end if;
        if to_regrole('service_role') is not null
           and has_function_privilege('service_role', v_oid, 'execute') then
          v_fail := v_fail || 'G3 service_role can EXECUTE ' || v_item
            || '; recorded posture is false on both targets';
        end if;
      end if;
    end loop;
    v_note := v_note || 'G3 helper signature, single-implementation, owner, '
      || 'SECURITY DEFINER, empty search_path and browser/service-role revoke '
      || 'posture checked';
  end if;

  if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and p.proname in ('can_browse_current_term_group',
                          'can_manage_recruitment_post')) <> 2 then
    v_fail := v_fail || 'G3 more than one overload exists for the two helpers; '
      || 'an ambiguous call is a stop, not a preference';
  end if;

  -- -------------------------------------------------------------------------
  -- G4 normalized body equivalence. Fails closed until pinned.
  -- -------------------------------------------------------------------------
  if v_digests = '' then
    v_fail := v_fail || 'G4 citylink.capacity_preflight_expected_digests is '
      || 'unset, so normalized body equivalence cannot be asserted. Recorded '
      || 'coordinator canonical values are browse '
      || '5991901a35dcf8480e807091a105dde3cd8f88a3881a032f1820bd1d3a61b3fc and '
      || 'manage 5e88d56bce2d575a5df97a39bd609746499b0fa4981e6632af6ebbfb25d2d1b5; '
      || 'the normalization expression and input scope that produced them are '
      || 'not yet recorded, so this check must be pinned by an authorized '
      || 'read-only dry run before any application is requested';
  else
    foreach v_item in array array[
        'private.can_browse_current_term_group(uuid)',
        'private.can_manage_recruitment_post(uuid)'
      ] loop
      v_oid := to_regfunction(v_item);
      if v_oid is not null then
        select encode(sha256(convert_to(lower(btrim(
                 regexp_replace(regexp_replace(regexp_replace(
                   pg_get_functiondef(o.oid),
                   '--[^\n]*', '', 'g'), '\s+', ' ', 'g'),
                   '\s*([(),;])\s*', '\1', 'g'))), 'utf8')), 'hex')
          into v_text
          from pg_proc o where o.oid = v_oid;
        if v_item like 'private.can_browse%' then
          v_expected := lower(btrim(split_part(v_digests, ',', 1)));
        else
          v_expected := lower(btrim(split_part(v_digests, ',', 2)));
        end if;
        if v_text is null or v_text <> v_expected then
          v_fail := v_fail || 'G4 normalized body digest for ' || v_item
            || ' is ' || coalesce(v_text, '<unreadable>') || ', expected '
            || v_expected || '. Mismatch stops this target. If both targets '
            || 'agree with each other but not with the constant, suspect the '
            || 'recipe or its input scope rather than the data, and re-pin';
        else
          v_note := v_note || 'G4 ' || v_item || ' normalized digest matched';
        end if;
      end if;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- G5 capacity objects absent: a genuine forward-only first application.
  -- -------------------------------------------------------------------------
  if to_regclass('public.study_groups') is null then
    v_fail := v_fail || 'G5 public.study_groups missing, so the max_members '
      || 'clean-slate check cannot be evaluated';
  elsif exists (
        select 1 from pg_attribute
        where attrelid = 'public.study_groups'::regclass
          and attname = 'max_members' and attnum > 0 and not attisdropped
      ) then
    v_fail := v_fail || 'G5 study_groups.max_members already present; the '
      || 'target is not the clean-slate state the reviewed file was written '
      || 'against. Do not re-apply to make it look identical';
  end if;
  foreach v_item in array array[
      'public.set_group_max_members(uuid,integer)',
      'public.create_group_and_invite(uuid,uuid,text,integer)',
      'public.list_course_group_summaries_capacity(uuid)',
      'public.list_current_term_course_groups_capacity(uuid,text,uuid,integer)',
      'public.list_group_recruitment_posts_capacity(uuid,timestamptz,uuid,integer)',
      'public.remove_group_member(uuid,uuid)',
      'private.group_active_member_count(uuid)',
      'private.assert_group_has_capacity(uuid,integer)',
      'private.cancel_pending_invitations_from_removed_member(uuid,uuid)'
    ] loop
    if to_regfunction(v_item) is not null then
      v_fail := v_fail || 'G5 capacity object ' || v_item
        || ' already present; stop for review instead of assuming a repeat is '
        || 'harmless';
    end if;
  end loop;
  if to_regclass('private.group_removal_context') is not null then
    v_fail := v_fail || 'G5 private.group_removal_context already present';
  end if;

  -- -------------------------------------------------------------------------
  -- G6 row-8 dependency plus legacy read shapes. Track B owns promoting row 8;
  --    capacity DDL must never bundle it, so an ineligible target stops here.
  -- -------------------------------------------------------------------------
  if to_regclass('public.group_recruitment_posts') is null then
    v_fail := v_fail || 'G6 public.group_recruitment_posts missing';
  elsif not exists (
        select 1 from pg_attribute
        where attrelid = 'public.group_recruitment_posts'::regclass
          and attname = 'subject' and attnum > 0 and not attisdropped
          and attnotnull
      ) then
    v_fail := v_fail || 'G6 group_recruitment_posts.subject is missing or '
      || 'nullable; the reviewed reads select p.subject (blob :1494 and :1532), '
      || 'so this target lacks the row-8 subject contract. Promote it, or do '
      || 'not apply capacity here';
  end if;

  -- Output column sets the reviewed file re-declares for old-client
  -- compatibility: blob :1289 (five columns), :1448 (six columns), :1704
  -- (fourteen columns, including subject).
  v_names := null;
  select array_agg(a.nm order by a.ord) into v_names
    from pg_proc p,
         unnest(p.proallargnames, p.proargmodes)
           with ordinality as a(nm, md, ord)
   where p.oid = to_regfunction('public.list_course_group_summaries(uuid)')
     and a.md::text = any (array['o', 't']);
  if coalesce(v_names::text, '<unreadable>')
     <> '{profile_id,group_id,group_name,group_status,group_size}' then
    v_fail := v_fail || 'G6 list_course_group_summaries output columns are '
      || coalesce(v_names::text, '<unreadable>')
      || '; expected {profile_id,group_id,group_name,group_status,group_size}';
  end if;

  v_names := null;
  select array_agg(a.nm order by a.ord) into v_names
    from pg_proc p,
         unnest(p.proallargnames, p.proargmodes)
           with ordinality as a(nm, md, ord)
   where p.oid = to_regfunction(
         'public.list_current_term_course_groups(uuid,text,uuid,integer)')
     and a.md::text = any (array['o', 't']);
  if coalesce(v_names::text, '<unreadable>')
     <> '{group_id,group_name,group_status,active_member_count,can_create_post,has_more}' then
    v_fail := v_fail || 'G6 list_current_term_course_groups output columns are '
      || coalesce(v_names::text, '<unreadable>')
      || '; expected the released six-column set including can_create_post. '
      || 'Reminder: can_create_post is a legacy client allowlist compatibility '
      || 'field only and is never security authority; real server authority is '
      || 'private.can_manage_recruitment_post plus membership, and a false '
      || 'value must not be read as an actual denial';
  end if;

  v_names := null;
  select array_agg(a.nm order by a.ord) into v_names
    from pg_proc p,
         unnest(p.proallargnames, p.proargmodes)
           with ordinality as a(nm, md, ord)
   where p.oid = to_regfunction(
         'public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)')
     and a.md::text = any (array['o', 't']);
  if coalesce(v_names::text, '<unreadable>')
     <> '{post_id,group_id,group_name,subject,active_member_count,author_name,body,post_status,created_at,updated_at,closed_at,apply_enabled,can_manage,has_more}' then
    v_fail := v_fail || 'G6 list_group_recruitment_posts output columns are '
      || coalesce(v_names::text, '<unreadable>')
      || '; the reviewed legacy wrapper declares the fourteen-column subject '
      || 'shape, so any other live set is a stop rather than a silent reshape';
  end if;

  -- -------------------------------------------------------------------------
  -- G7 pre-existing signatures the reviewed file replaces.
  -- -------------------------------------------------------------------------
  foreach v_item in array array[
      'public.send_group_invitation(uuid,uuid)',
      'public.request_to_join_group(uuid)',
      'public.respond_to_group_invitation(uuid,boolean)',
      'public.review_group_join_request(uuid,boolean)',
      'public.create_group_and_invite(uuid,uuid,text)'
    ] loop
    if to_regfunction(v_item) is null then
      v_fail := v_fail || 'G7 ' || v_item || ' is missing; the reviewed '
        || 'create-or-replace would define it outside the state the review '
        || 'covered';
    end if;
  end loop;

  if to_regfunction('public.create_group_and_invite(uuid,uuid)') is not null then
    v_fail := v_fail || 'G7 the two-argument create_group_and_invite still '
      || 'exists; the reviewed file drops it at blob :245. That is a no-op on a '
      || 'target that already promoted row 8, but it deletes the only create '
      || 'RPC on a target that has not. Re-check the target fingerprint';
  end if;

  -- Recruitment write-path arity is captured, not asserted: capacity work must
  -- not depend on, or fix, it.
  select string_agg(p.proname || '(' || pg_get_function_arguments(p.oid) || ')',
                    ' | ' order by p.proname)
    into v_text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_group_recruitment_post', 'edit_group_recruitment_post');
  v_note := v_note || 'G7 recruitment write-path overloads captured: '
    || coalesce(v_text, '<none>');

  -- -------------------------------------------------------------------------
  -- G8 the runner must already be able to do what the reviewed file does.
  -- -------------------------------------------------------------------------
  select count(*) into v_count
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
   where p.oid in (
         to_regfunction('public.send_group_invitation(uuid,uuid)'),
         to_regfunction('public.request_to_join_group(uuid)'),
         to_regfunction('public.respond_to_group_invitation(uuid,boolean)'),
         to_regfunction('public.review_group_join_request(uuid,boolean)'),
         to_regfunction('public.create_group_and_invite(uuid,uuid,text)'),
         to_regfunction('public.list_course_group_summaries(uuid)'),
         to_regfunction('public.list_current_term_course_groups(uuid,text,uuid,integer)'),
         to_regfunction('public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)'))
     and not pg_has_role(session_user, r.oid, 'member');
  if v_count > 0 then
    v_fail := v_fail || 'G8 ' || v_count::text || ' functions the reviewed file '
      || 'replaces are owned by a role the session user is not a member of; '
      || 'application would abort partway. Stop for review instead of changing '
      || 'ownership inside capacity work';
  end if;

  if not has_schema_privilege(session_user, 'public', 'create') then
    v_fail := v_fail || 'G8 no CREATE on schema public for the runner';
  end if;
  if to_regnamespace('private') is null then
    v_note := v_note || 'G8 schema private does not exist yet; the reviewed '
      || 'file creates it at blob :971, so verify the runner can create it';
  elsif not has_schema_privilege(session_user, 'private', 'create') then
    v_fail := v_fail || 'G8 no CREATE on schema private for the runner';
  end if;

  -- -------------------------------------------------------------------------
  -- G9 table posture the reviewed file alters, captured for the record.
  -- -------------------------------------------------------------------------
  v_flag := null;
  v_owner := null;
  if to_regclass('public.study_groups') is not null then
    select c.relrowsecurity, r.rolname
      into v_flag, v_owner
      from pg_class c
      join pg_roles r on r.oid = c.relowner
     where c.oid = 'public.study_groups'::regclass;
  end if;
  v_note := v_note || 'G9 study_groups owner "'
    || coalesce(v_owner, '<unreadable>') || '", RLS currently '
    || case when v_flag is null then 'unreadable'
            when v_flag then 'enabled' else 'disabled' end
    || '; the reviewed file only adds a nullable column and a guarded check '
    || 'constraint, so a change here would be unexpected';

  select count(*) into v_count
    from pg_constraint
   where conrelid = 'public.study_groups'::regclass
     and conname = 'study_groups_max_members_chk';
  if v_count > 0 then
    v_fail := v_fail || 'G9 study_groups_max_members_chk already exists without '
      || 'the max_members column check at G5; the constraint set is in an '
      || 'unexplained state';
  end if;

  -- -------------------------------------------------------------------------
  -- G10 invitation-integrity guard state, which the reviewed file leaves alone.
  -- -------------------------------------------------------------------------
  if to_regfunction('public.enforce_invitation_integrity()') is null then
    v_fail := v_fail || 'G10 public.enforce_invitation_integrity() is absent; '
      || 'the reviewed draft assumed it exists but is unattached';
  else
    select count(*) into v_count
      from pg_trigger t
     where not t.tgisinternal
       and t.tgfoid = to_regfunction('public.enforce_invitation_integrity()');
    if v_count > 0 then
      v_fail := v_fail || 'G10 ' || v_count::text || ' trigger(s) attach '
        || 'enforce_invitation_integrity(), but the checked-in records say it '
        || 'has no trigger on Test or Main and the reviewed Option A draft '
        || 'deliberately does not replace or attach it. A premise mismatch on '
        || 'the invitation lifecycle is a stop for Role 6 re-review';
    else
      v_note := v_note || 'G10 invitation-integrity guard present and '
        || 'unattached, matching the reviewed assumption';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- G11 capture-only: ledger versions and default-privilege posture. Nothing
  --      here asserts ledger identity, and no repair happens in any capacity
  --      work. Repository filenames are not a portable ledger identity.
  -- -------------------------------------------------------------------------
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      select string_agg(m.version::text, ',' order by m.version::text)
        into v_text
        from supabase_migrations.schema_migrations m;
      v_note := v_note || 'G11 recorded ledger versions: '
        || coalesce(v_text, '<empty>');
    exception when insufficient_privilege then
      v_note := v_note || 'G11 ledger table exists but is not readable by the '
        || 'current role; capture ledger state through the authorized '
        || 'metadata path instead';
    end;
  else
    v_note := v_note || 'G11 supabase_migrations.schema_migrations not '
      || 'reachable in this session; capture ledger state through the '
      || 'authorized metadata path';
  end if;

  -- Captured as raw ACL text on purpose: aclexplode() column sets differ
  -- across PostgreSQL majors, and this is a record, not an assertion.
  select coalesce(string_agg('role ' || d.roleid::regrole::text
        || ' default ' || d.defaclobjtype::text || ' -> '
        || d.defaclacl::text, ' | '), '<none>')
    into v_text
    from pg_default_acl d;
  v_note := v_note || 'G11 default privilege posture captured (no assertion, '
    || 'no change): ' || v_text;

  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.proacl is not null;
  v_note := v_note || 'G11 functions carrying an explicit ACL in public or '
    || 'private: ' || v_count::text || ' (capture only; grant normalization is '
    || 'a separate track and must never ride inside capacity DDL)';

  -- -------------------------------------------------------------------------
  -- Outcome.
  -- -------------------------------------------------------------------------
  raise notice 'CityLink capacity prerequisite guard capture for target "%":',
    v_target;
  foreach v_item in array v_note loop
    raise notice '  %', v_item;
  end loop;

  if array_length(v_fail, 1) is not null then
    raise exception 'group_capacity_prerequisite_mismatch'
      using
        detail = array_length(v_fail, 1)::text || ' check(s) failed for target "'
              || v_target || '": ' || array_to_string(v_fail, ' || '),
        hint = 'A mismatch stops this target''s capacity application. Record '
            || 'every failed check, name the track that owns each one, and '
            || 'request no application until that owner decision exists.',
        errcode = '45000';
  end if;

  raise notice 'CityLink capacity prerequisite guard reported no pinned '
    || 'failure for target "%". G4 pinning and the application authorization '
    || 'are still separate requirements.', v_target;
end
$capacity_guard$;
