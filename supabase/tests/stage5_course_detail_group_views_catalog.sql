-- Read-only catalog audit for
-- 20261117205600_stage5_course_detail_group_views.sql.
-- Run only against disposable CityLink Test after the lead separately approves
-- applying the migration. This file reads pg_catalog only; it touches no rows.

do $catalog$
declare
  v_count oid := pg_catalog.to_regprocedure(
    'public.list_current_course_enrolment_counts()'
  );
  v_summary oid := pg_catalog.to_regprocedure(
    'public.list_course_group_summaries(uuid)'
  );
  v_rename oid := pg_catalog.to_regprocedure(
    'public.rename_study_group(uuid,text)'
  );
  v_definition text;
  v_result text;
begin
  if v_count is null then
    raise exception 'missing public.list_current_course_enrolment_counts()';
  end if;
  if v_summary is null then
    raise exception 'missing public.list_course_group_summaries(uuid)';
  end if;
  if v_rename is null then
    raise exception 'missing public.rename_study_group(uuid,text)';
  end if;

  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_function_result(v_count)),
    '[[:space:]]+', '', 'g'
  ) into v_result;
  if v_result <> 'table(course_iduuid,enrolled_countbigint)' then
    raise exception 'course-count RPC returns unexpected columns: %', v_result;
  end if;
  select pg_catalog.pg_get_functiondef(v_count) into v_definition;
  if v_definition not like '%auth.uid()%'
     or v_definition not like '%current_term_id%'
     or v_definition not like '%count(%'
     or v_definition not like '%public.enrolments%' then
    raise exception 'course-count RPC is missing its auth/current-term/aggregate scope';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid = v_count
      and (
        not function_row.prosecdef
        or function_row.provolatile <> 's'
        or not coalesce(
          function_row.proconfig @> array['search_path=""']::text[],
          false
        )
      )
  ) then
    raise exception 'course-count RPC must be stable SECURITY DEFINER with an empty search_path';
  end if;
  if has_function_privilege('anon', v_count, 'EXECUTE')
     or not has_function_privilege('authenticated', v_count, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc as function_row
       cross join lateral pg_catalog.aclexplode(
         coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f'::"char", function_row.proowner)
         )
       ) as privilege
       where function_row.oid = v_count
         and privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
     ) then
    raise exception 'course-count RPC execute grants are not authenticated-only';
  end if;

  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_function_result(v_summary)),
    '[[:space:]]+', '', 'g'
  ) into v_result;
  if v_result <> 'table(profile_iduuid,group_iduuid,group_nametext,group_statustext,group_sizebigint)' then
    raise exception 'group-summary RPC returns unexpected columns: %', v_result;
  end if;
  select pg_catalog.pg_get_functiondef(v_summary) into v_definition;
  if v_definition not like '%auth.uid()%'
     or v_definition not like '%current_term_id%'
     or v_definition not like '%private.is_active_group_member%'
     or v_definition not like '%creator_id%'
     or v_definition not like '%group_memberships%'
     or v_definition not like '%count(%'
     or v_definition not like '%not exists%'
     or v_definition not like '%forming%' then
    raise exception 'group-summary RPC is missing current-term or peer/group association scope';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid = v_summary
      and (
        not function_row.prosecdef
        or function_row.provolatile <> 's'
        or not coalesce(
          function_row.proconfig @> array['search_path=""']::text[],
          false
        )
      )
  ) then
    raise exception 'group-summary RPC must be stable SECURITY DEFINER with an empty search_path';
  end if;
  if has_function_privilege('anon', v_summary, 'EXECUTE')
     or not has_function_privilege('authenticated', v_summary, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc as function_row
       cross join lateral pg_catalog.aclexplode(
         coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f'::"char", function_row.proowner)
         )
       ) as privilege
       where function_row.oid = v_summary
         and privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
     ) then
    raise exception 'group-summary RPC execute grants are not authenticated-only';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_function_result(v_rename)) into v_result;
  if v_result <> 'void' then
    raise exception 'group-rename RPC must return void, got %', v_result;
  end if;
  select pg_catalog.pg_get_functiondef(v_rename) into v_definition;
  if v_definition not like '%auth.uid()%'
     or v_definition not like '%creator_id%'
     or v_definition not like '%is_current_term%'
     or v_definition not like '%char_length%'
     or v_definition not like '%is_active_group_member%'
     or v_definition not like '%for update%' then
    raise exception 'group-rename RPC is missing auth, leader, term, name-length or locking checks';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid = v_rename
      and (
        not function_row.prosecdef
        or not coalesce(
          function_row.proconfig @> array['search_path=""']::text[],
          false
        )
      )
  ) then
    raise exception 'group-rename RPC must be SECURITY DEFINER with an empty search_path';
  end if;
  if has_function_privilege('anon', v_rename, 'EXECUTE')
     or not has_function_privilege('authenticated', v_rename, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc as function_row
       cross join lateral pg_catalog.aclexplode(
         coalesce(
           function_row.proacl,
           pg_catalog.acldefault('f'::"char", function_row.proowner)
         )
       ) as privilege
       where function_row.oid = v_rename
         and privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
     ) then
    raise exception 'group-rename RPC execute grants are not authenticated-only';
  end if;

  raise notice 'PASS: all three course-detail RPCs have the reviewed signatures, search_path, security mode, scope and execute grants';
end;
$catalog$;
