-- CityLink Launch - P1 and target marker, captured from the server
-- Captured: 2026-11-24 06:49:15.197823+00   cluster system_identifier: 7692131729119822239
-- Project: pijslbchvstkoweslymr (CityLink Launch, the F14 target).
--
-- WHAT THIS IS. A delta capture of the 2026-11-24 writes, taken by read-only catalog
-- queries after the apply. It is not a full database dump; the earlier full snapshot
-- lives in docs/backup/LIVE_SCHEMA_20261124.sql and predates these objects.
--
-- AUTHORITY. The authoritative text for the P1 objects is
-- supabase/migrations/20261124064100_kayk_p1_group_files.sql, sha256
-- 3c4986275d077aff72185f8bccc302225fa86a2505113e8919cf89cdef5d036b. The definitions
-- below are what the server reports; a divergence between the two is a finding, not a
-- formatting difference. All nine function bodies were checked by md5(prosrc) at capture
-- time and matched that file.

-- ==== target marker ====
-- Table private.citylink_target and function private.assert_citylink_target(text) were
-- created by docs/stage6/CITYLINK_TARGET_MARKER_DRAFT.sql (sha256 c71657d9...).
--   row: project_ref=pijslbchvstkoweslymr system_identifier=7692131729119822239 declared_by=Adam declared_at=2026-11-24 06:37:44.519214+00
--   note: F14 2026-11-23 01:50; first authorized Launch write under the 2026-11-24 target-control decision

-- ==== tables ====

-- group_analysis_jobs
--    1  id                     uuid                         null=NO  default=gen_random_uuid()
--    2  group_id               uuid                         null=NO  default=None
--    3  file_id                uuid                         null=NO  default=None
--    4  status                 text                         null=NO  default='queued'::text
--    5  error_code             text                         null=YES default=None
--    6  started_at             timestamp with time zone     null=YES default=None
--    7  finished_at            timestamp with time zone     null=YES default=None
--    8  created_at             timestamp with time zone     null=NO  default=now()

-- group_analysis_plans
--    1  group_id               uuid                         null=NO  default=None
--    2  content                jsonb                        null=NO  default='{}'::jsonb
--    3  revision               bigint                       null=NO  default=1
--    4  updated_by             uuid                         null=YES default=None
--    5  updated_at             timestamp with time zone     null=NO  default=now()

-- group_files
--    1  id                     uuid                         null=NO  default=gen_random_uuid()
--    2  group_id               uuid                         null=NO  default=None
--    3  object_key             text                         null=NO  default=None
--    4  original_name          text                         null=NO  default=None
--    5  declared_mime          text                         null=YES default=None
--    6  detected_mime          text                         null=YES default=None
--    7  byte_size              bigint                       null=NO  default=None
--    8  content_hash           text                         null=YES default=None
--    9  mime_mismatch          boolean                      null=NO  default=false
--   10  uploaded_by            uuid                         null=YES default=None
--   11  replaces_file_id       uuid                         null=YES default=None
--   12  status                 text                         null=NO  default='pending'::text
--   13  analysis_status        text                         null=NO  default='not_requested'::text
--   14  retention_expires_at   timestamp with time zone     null=NO  default=None
--   15  retention_basis        text                         null=NO  default=None
--   16  created_at             timestamp with time zone     null=NO  default=now()
--   17  confirmed_at           timestamp with time zone     null=YES default=None
--   18  deleted_at             timestamp with time zone     null=YES default=None

-- ==== row level security ====
--   group_analysis_jobs      rls=True
--   group_analysis_plans     rls=True
--   group_files              rls=True
--   policies: 0 (none created; the only entry point is a SECURITY DEFINER RPC)

-- ==== constraints ====
--   group_analysis_jobs      group_analysis_jobs_file_id_fkey               FOREIGN KEY (file_id) REFERENCES group_files(id) ON DELETE CASCADE
--   group_analysis_jobs      group_analysis_jobs_group_id_fkey              FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
--   group_analysis_jobs      group_analysis_jobs_pkey                       PRIMARY KEY (id)
--   group_analysis_jobs      group_analysis_jobs_status_check               CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'ready'::text, 'failed'::text])))
--   group_analysis_plans     group_analysis_plans_group_id_fkey             FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
--   group_analysis_plans     group_analysis_plans_pkey                      PRIMARY KEY (group_id)
--   group_analysis_plans     group_analysis_plans_updated_by_fkey           FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL
--   group_files              group_files_analysis_status_check              CHECK ((analysis_status = ANY (ARRAY['not_requested'::text, 'processing'::text, 'ready'::text, 'unsupported_format'::text, 'failed'::text])))
--   group_files              group_files_byte_size_check                    CHECK (((byte_size > 0) AND (byte_size <= 104857600)))
--   group_files              group_files_content_hash_check                 CHECK (((content_hash IS NULL) OR (char_length(content_hash) <= 128)))
--   group_files              group_files_declared_mime_check                CHECK (((declared_mime IS NULL) OR (char_length(declared_mime) <= 255)))
--   group_files              group_files_detected_mime_check                CHECK (((detected_mime IS NULL) OR (char_length(detected_mime) <= 255)))
--   group_files              group_files_group_id_fkey                      FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
--   group_files              group_files_object_key_key                     UNIQUE (object_key)
--   group_files              group_files_original_name_check                CHECK (((char_length(original_name) >= 1) AND (char_length(original_name) <= 255)))
--   group_files              group_files_pkey                               PRIMARY KEY (id)
--   group_files              group_files_replaces_file_id_fkey              FOREIGN KEY (replaces_file_id) REFERENCES group_files(id) ON DELETE SET NULL
--   group_files              group_files_retention_basis_check              CHECK ((retention_basis = ANY (ARRAY['term_start'::text, 'derived'::text])))
--   group_files              group_files_status_check                       CHECK ((status = ANY (ARRAY['pending'::text, 'current'::text])))
--   group_files              group_files_uploaded_by_fkey                   FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL

-- ==== indexes ====
--   CREATE UNIQUE INDEX group_analysis_jobs_pkey ON public.group_analysis_jobs USING btree (id)
--   CREATE UNIQUE INDEX group_analysis_plans_pkey ON public.group_analysis_plans USING btree (group_id)
--   CREATE INDEX group_files_group_current_idx ON public.group_files USING btree (group_id, created_at DESC) WHERE ((status = 'current'::text) AND (deleted_at IS NULL))
--   CREATE UNIQUE INDEX group_files_object_key_key ON public.group_files USING btree (object_key)
--   CREATE UNIQUE INDEX group_files_one_pending_replacement_idx ON public.group_files USING btree (replaces_file_id) WHERE ((replaces_file_id IS NOT NULL) AND (status = 'pending'::text))
--   CREATE INDEX group_files_pending_idx ON public.group_files USING btree (uploaded_by, created_at DESC) WHERE (status = 'pending'::text)
--   CREATE UNIQUE INDEX group_files_pkey ON public.group_files USING btree (id)

-- ==== function definitions (server-reported) ====

-- ---- private.assert_citylink_target
CREATE OR REPLACE FUNCTION private.assert_citylink_target(p_expected_ref text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref text;
  v_recorded text;
  v_observed text;
begin
  -- The table itself may be absent on a project where this file never ran. That is
  -- 45M01, not an undefined_table (42P01) leaking out as an unrelated code.
  begin
    select t.project_ref, t.system_identifier
      into v_ref, v_recorded
    from private.citylink_target t;
  exception
    when undefined_table then
      raise exception 'citylink_target_marker_missing'
        using errcode = '45M01',
              detail = 'private.citylink_target does not exist';
  end;

  if v_ref is null then
    raise exception 'citylink_target_marker_missing'
      using errcode = '45M01',
            detail = 'private.citylink_target has no row';
  end if;

  if v_ref <> p_expected_ref then
    raise exception 'citylink_target_mismatch'
      using errcode = '45M02',
            detail = format('marker names %s, caller expected %s', v_ref, p_expected_ref);
  end if;

  begin
    select c.system_identifier::text into v_observed from pg_control_system() c;
  exception
    when others then
      raise exception 'citylink_target_unverifiable'
        using errcode = '45M04',
              detail = 'pg_control_system() could not be read';
  end;

  if v_observed <> v_recorded then
    raise exception 'citylink_target_cluster_changed'
      using errcode = '45M03',
            detail = format('recorded %s, observed %s', v_recorded, v_observed);
  end if;
end;
$function$


-- ---- private.can_access_group_files
CREATE OR REPLACE FUNCTION private.can_access_group_files(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_group_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.study_groups g
      where g.id = p_group_id
        and g.status <> 'abandoned'
    )
    and private.is_active_group_member(p_group_id, auth.uid());
$function$


-- ---- private.group_file_retention_expiry
CREATE OR REPLACE FUNCTION private.group_file_retention_expiry(p_term_id uuid)
 RETURNS TABLE(expires_at timestamp with time zone, basis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_starts_on date;
  v_code text;
  v_start date;
  v_basis text;
begin
  select t.starts_on, t.code into v_starts_on, v_code
  from public.academic_terms t
  where t.id = p_term_id;

  if v_code is null then
    raise exception 'group_files_term_missing';
  end if;

  if v_starts_on is not null then
    v_basis := 'term_start';
    v_start := v_starts_on;
  else
    v_basis := 'derived';
    if v_code ~ '^[0-9]{4}-Fall$' then
      v_start := make_date(substring(v_code from 1 for 4)::int, 9, 1);
    elsif v_code ~ '^[0-9]{4}-Spring$' then
      v_start := make_date(substring(v_code from 1 for 4)::int, 1, 10);
    else
      raise exception 'group_files_term_code_unrecognised';
    end if;
  end if;

  -- 五個月後的同一日 23:59:59（Asia/Hong_Kong）
  return query
    select (((v_start + interval '5 months')::date + time '23:59:59')
      at time zone 'Asia/Hong_Kong'), v_basis;
end;
$function$


-- ---- private.group_files_bytes
CREATE OR REPLACE FUNCTION private.group_files_bytes(p_group_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(f.byte_size), 0)
  from public.group_files f
  where f.status = 'current'
    and f.deleted_at is null
    and f.retention_expires_at > now()
    and (p_group_id is null or f.group_id = p_group_id);
$function$


-- ---- public.confirm_group_file_upload
CREATE OR REPLACE FUNCTION public.confirm_group_file_upload(p_file_id uuid, p_byte_size bigint, p_detected_mime text)
 RETURNS TABLE(replaced_object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row public.group_files;
  v_old public.group_files;
begin
  select * into v_row from public.group_files where id = p_file_id for update;

  if not found then
    raise exception 'group_files_not_found';
  end if;

  if v_row.uploaded_by is distinct from v_actor then
    raise exception 'group_files_not_uploader';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'group_files_not_pending';
  end if;

  if not private.can_access_group_files(v_row.group_id) then
    raise exception 'group_files_no_permission';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 104857600 then
    raise exception 'group_files_upload_too_large';
  end if;

  if p_byte_size <> v_row.byte_size then
    raise exception 'group_files_size_mismatch';
  end if;

  update public.group_files
  set status = 'current',
      detected_mime = coalesce(p_detected_mime, declared_mime),
      mime_mismatch = (
        p_detected_mime is not null
        and declared_mime is not null
        and lower(btrim(p_detected_mime)) <> lower(btrim(declared_mime))
      ),
      confirmed_at = now()
  where id = p_file_id;

  if v_row.replaces_file_id is not null then
    select * into v_old from public.group_files
    where id = v_row.replaces_file_id and deleted_at is null
    for update;

    if found then
      update public.group_files set deleted_at = now() where id = v_old.id;
      return query select v_old.object_key;
      return;
    end if;
  end if;

  return query select null::text;
end;
$function$


-- ---- public.delete_group_file
CREATE OR REPLACE FUNCTION public.delete_group_file(p_file_id uuid)
 RETURNS TABLE(object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row public.group_files;
  v_is_leader boolean;
begin
  select * into v_row from public.group_files where id = p_file_id for update;

  if not found then
    raise exception 'group_files_not_found';
  end if;

  if not private.can_access_group_files(v_row.group_id) then
    raise exception 'group_files_no_permission';
  end if;

  if v_row.deleted_at is not null then
    raise exception 'group_files_not_current';
  end if;

  select exists (
    select 1 from public.study_groups g
    where g.id = v_row.group_id and g.creator_id = v_actor
  ) into v_is_leader;

  if v_row.uploaded_by is distinct from v_actor and not v_is_leader then
    raise exception 'group_files_not_uploader';
  end if;

  update public.group_files set deleted_at = now() where id = p_file_id;

  return query select v_row.object_key;
end;
$function$


-- ---- public.list_group_files
CREATE OR REPLACE FUNCTION public.list_group_files(p_group_id uuid)
 RETURNS TABLE(id uuid, original_name text, declared_mime text, detected_mime text, byte_size bigint, uploaded_by uuid, analysis_status text, retention_expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select f.id, f.original_name, f.declared_mime, f.detected_mime, f.byte_size,
         f.uploaded_by, f.analysis_status, f.retention_expires_at, f.created_at
  from public.group_files f
  where f.group_id = p_group_id
    and f.status = 'current'
    and f.deleted_at is null
    and f.retention_expires_at > now()
    and private.can_access_group_files(p_group_id)
  order by f.created_at desc;
$function$


-- ---- public.replace_group_file
CREATE OR REPLACE FUNCTION public.replace_group_file(p_file_id uuid, p_original_name text, p_declared_mime text, p_byte_size bigint)
 RETURNS TABLE(file_id uuid, object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_old public.group_files;
  v_id uuid := gen_random_uuid();
  v_key text;
  v_expires timestamptz;
  v_basis text;
  v_term_id uuid;
begin
  select * into v_old from public.group_files where id = p_file_id for update;

  if not found then
    raise exception 'group_files_not_found';
  end if;

  if v_old.status <> 'current' or v_old.deleted_at is not null then
    raise exception 'group_files_not_current';
  end if;

  if not private.can_access_group_files(v_old.group_id) then
    raise exception 'group_files_no_permission';
  end if;

  if v_old.uploaded_by is distinct from v_actor then
    raise exception 'group_files_not_uploader';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 104857600 then
    raise exception 'group_files_upload_too_large';
  end if;

  if p_original_name is null or char_length(btrim(p_original_name)) = 0 then
    raise exception 'group_files_name_required';
  end if;

  select g.term_id into v_term_id from public.study_groups g where g.id = v_old.group_id;

  select e.expires_at, e.basis into v_expires, v_basis
  from private.group_file_retention_expiry(v_term_id) e;

  if v_expires <= now() then
    raise exception 'group_files_retention_window_closed';
  end if;

  if private.group_files_bytes(null) + p_byte_size > 8589934592 then
    raise exception 'group_files_storage_limit_reached';
  end if;

  if private.group_files_bytes(v_old.group_id) + p_byte_size > 1073741824 then
    raise exception 'group_files_group_limit_reached';
  end if;

  v_key := 'groups/' || v_old.group_id::text || '/' || v_id::text;

  insert into public.group_files (
    id, group_id, object_key, original_name, declared_mime,
    byte_size, uploaded_by, replaces_file_id, status,
    retention_expires_at, retention_basis
  ) values (
    v_id, v_old.group_id, v_key, btrim(p_original_name), p_declared_mime,
    p_byte_size, v_actor, v_old.id, 'pending', v_expires, v_basis
  );

  return query select v_id, v_key;
end;
$function$


-- ---- public.request_group_file_download
CREATE OR REPLACE FUNCTION public.request_group_file_download(p_file_id uuid)
 RETURNS TABLE(object_key text, original_name text, detected_mime text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.group_files;
begin
  select * into v_row from public.group_files where id = p_file_id;

  if not found then
    raise exception 'group_files_not_found';
  end if;

  if not private.can_access_group_files(v_row.group_id) then
    raise exception 'group_files_no_permission';
  end if;

  if v_row.status <> 'current' or v_row.deleted_at is not null then
    raise exception 'group_files_not_current';
  end if;

  if v_row.retention_expires_at <= now() then
    raise exception 'group_files_expired';
  end if;

  return query select v_row.object_key, v_row.original_name, v_row.detected_mime;
end;
$function$


-- ---- public.request_group_file_upload
CREATE OR REPLACE FUNCTION public.request_group_file_upload(p_group_id uuid, p_original_name text, p_declared_mime text, p_byte_size bigint)
 RETURNS TABLE(file_id uuid, object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_term_id uuid;
  v_expires timestamptz;
  v_basis text;
  v_pending integer;
  v_key text;
begin
  if v_actor is null or not private.can_access_group_files(p_group_id) then
    raise exception 'group_files_no_permission';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 104857600 then
    raise exception 'group_files_upload_too_large';
  end if;

  if p_original_name is null or char_length(btrim(p_original_name)) = 0 then
    raise exception 'group_files_name_required';
  end if;

  select g.term_id into v_term_id
  from public.study_groups g
  where g.id = p_group_id;

  select e.expires_at, e.basis into v_expires, v_basis
  from private.group_file_retention_expiry(v_term_id) e;

  if v_expires <= now() then
    raise exception 'group_files_retention_window_closed';
  end if;

  if private.group_files_bytes(null) + p_byte_size > 8589934592 then
    raise exception 'group_files_storage_limit_reached';
  end if;

  if private.group_files_bytes(p_group_id) + p_byte_size > 1073741824 then
    raise exception 'group_files_group_limit_reached';
  end if;

  select count(*) into v_pending
  from public.group_files f
  where f.group_id = p_group_id
    and f.uploaded_by = v_actor
    and f.status = 'pending';

  if v_pending >= 5 then
    raise exception 'group_files_too_many_pending';
  end if;

  v_key := 'groups/' || p_group_id::text || '/' || v_id::text;

  insert into public.group_files (
    id, group_id, object_key, original_name, declared_mime,
    byte_size, uploaded_by, status, retention_expires_at, retention_basis
  ) values (
    v_id, p_group_id, v_key, btrim(p_original_name), p_declared_mime,
    p_byte_size, v_actor, 'pending', v_expires, v_basis
  );

  return query select v_id, v_key;
end;
$function$


-- ==== migration ledger ====
--   20261118033916  stage5_term_model                              t720527@gmail.com
--   20261118033944  stage5_groups                                  t720527@gmail.com
--   20261118034001  stage5_course_roster_rpc                       t720527@gmail.com
--   20261118034447  stage5_group_authority_and_succession          t720527@gmail.com
--   20261118034458  stage5_course_group_invite_candidates          t720527@gmail.com
--   20261118034505  stage5_course_detail_group_views               t720527@gmail.com
--   20261118080722  stage6_chat_recruitment                        t720527@gmail.com
--   20261118083000  stage6_people_page_naming                      citylink-coordinator-psql-20261123
--   20261119080000  preblob_reconcile_list_group_recruitment_posts citylink-coordinator-psql-20261123
--   20261119085000  capacity_apply_gate                            citylink-coordinator-psql-20261123
--   20261119090000  group_hard_max                                 citylink-coordinator-psql-20261123
--   20261124064100  kayk_p1_group_files                            citylink-coordinator-20261124-postapply

-- ==== end ====
