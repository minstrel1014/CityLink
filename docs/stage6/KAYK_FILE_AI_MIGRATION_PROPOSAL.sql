-- CityLink — 群組聊天室檔案：P1 migration 提案
--
-- 狀態：草案，供 Role 6 exact-head 審查。**尚未套用**。
-- 套用需要 Adam 另行授權，並指名本檔的確切 blob。
--
-- 設計依據：docs/stage6/KAYK_R2_ADAPTER_DESIGN.md、KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md
-- 已套用的決定：300 秒 presigned TTL、日曆月 5 個月保留、8 GiB 全域上限、
--   替換限現行版本上傳者（R6）、刪除允許上傳者或 leader（R6）、lazy expiry、不做掃描。
--
-- 刻意不用 private.can_read_group_chat：該 predicate 允許 left 與 removed，
-- 而檔案的產品規則是被移除者立即失去權限。此差異是刻意的，不可「統一」。

-- ---------------------------------------------------------------------------
-- 1. 資料表
-- ---------------------------------------------------------------------------

create table if not exists public.group_files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  object_key text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  declared_mime text,
  detected_mime text,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 104857600),
  content_hash text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  replaces_file_id uuid references public.group_files (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'current')),
  analysis_status text not null default 'not_requested'
    check (analysis_status in ('not_requested', 'processing', 'ready', 'unsupported_format', 'failed')),
  retention_expires_at timestamptz not null,
  retention_basis text not null check (retention_basis in ('term_start', 'derived')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists group_files_group_current_idx
  on public.group_files (group_id, created_at desc)
  where status = 'current' and deleted_at is null;

create index if not exists group_files_pending_idx
  on public.group_files (uploaded_by, created_at desc)
  where status = 'pending';

create table if not exists public.group_analysis_plans (
  group_id uuid primary key references public.study_groups (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  file_id uuid not null references public.group_files (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.group_files enable row level security;
alter table public.group_analysis_plans enable row level security;
alter table public.group_analysis_jobs enable row level security;

-- 不建立任何 policy：唯一入口是 SECURITY DEFINER RPC。即使端點出錯也讀不到表。
revoke all on table public.group_files from public, anon, authenticated;
revoke all on table public.group_analysis_plans from public, anon, authenticated;
revoke all on table public.group_analysis_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. private helpers
-- ---------------------------------------------------------------------------

-- 保留期：starts_on 有值就用它；否則由 term code 推導。
-- 現行 term code 格式為 'YYYY-Fall'（見 20261102090000 的 seed），Spring 同理。
-- 無法辨識的格式一律拋錯，不猜測日期。
create or replace function private.group_file_retention_expiry(p_term_id uuid)
returns table (expires_at timestamptz, basis text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

-- 檔案存取 predicate：active-only，且群組不得為 abandoned。
-- active-only 的實作在 private.is_active_group_member 內（membership_status = 'active'）；
-- 此處刻意不呼叫 private.can_read_group_chat。
create or replace function private.can_access_group_files(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select p_group_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.study_groups g
      where g.id = p_group_id
        and g.status <> 'abandoned'
    )
    and private.is_active_group_member(p_group_id, auth.uid());
$function$;

create or replace function private.group_files_bytes(p_group_id uuid)
returns bigint
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(sum(f.byte_size), 0)
  from public.group_files f
  where f.status = 'current'
    and f.deleted_at is null
    and f.retention_expires_at > now()
    and (p_group_id is null or f.group_id = p_group_id);
$function$;

revoke all on function private.group_file_retention_expiry(uuid) from public, anon, authenticated;
revoke all on function private.can_access_group_files(uuid) from public, anon, authenticated;
revoke all on function private.group_files_bytes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC
-- ---------------------------------------------------------------------------

-- 8 GiB 全域上限、1 GiB 每群組上限（皆為 GiB，非 GB）。
-- 軟上限：併發請求可能同時通過；DB 統計不含未確認的孤兒物件。

create or replace function public.request_group_file_upload(
  p_group_id uuid,
  p_original_name text,
  p_declared_mime text,
  p_byte_size bigint
)
returns table (file_id uuid, object_key text)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- 以 HeadObject 的實測值確認；不符即拒絕，不盲目放行。
create or replace function public.confirm_group_file_upload(
  p_file_id uuid,
  p_byte_size bigint,
  p_detected_mime text
)
returns table (replaced_object_key text)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function public.list_group_files(p_group_id uuid)
returns table (
  id uuid,
  original_name text,
  declared_mime text,
  detected_mime text,
  byte_size bigint,
  uploaded_by uuid,
  analysis_status text,
  retention_expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select f.id, f.original_name, f.declared_mime, f.detected_mime, f.byte_size,
         f.uploaded_by, f.analysis_status, f.retention_expires_at, f.created_at
  from public.group_files f
  where f.group_id = p_group_id
    and f.status = 'current'
    and f.deleted_at is null
    and f.retention_expires_at > now()
    and private.can_access_group_files(p_group_id)
  order by f.created_at desc;
$function$;

-- 回傳 object_key 供簽名端點使用；RPC 本身不簽名、不回傳 URL。
create or replace function public.request_group_file_download(p_file_id uuid)
returns table (object_key text, original_name text, detected_mime text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

-- R6：只有現行版本的上傳者可以替換。leader 可以刪除，但不得無聲覆寫他人內容。
-- 新檔先建立為 pending，確認成功後才把舊檔標記刪除，避免上傳失敗造成資料遺失。
create or replace function public.replace_group_file(
  p_file_id uuid,
  p_original_name text,
  p_declared_mime text,
  p_byte_size bigint
)
returns table (file_id uuid, object_key text)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- R6：上傳者本人或群組 leader 可以刪除。
-- 已核對 Stage 5 authority/succession 模型（20261114163512）：repo 沒有獨立的
-- leader 欄位，leader 就是 study_groups.creator_id；succession 會直接把該欄位
-- 改寫成最早加入的現任成員，因此 creator_id = auth.uid() 就是現任 leader 判定，
-- 與 public.review_group_join_request 的既有寫法一致。
create or replace function public.delete_group_file(p_file_id uuid)
returns table (object_key text)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 4. 權限：只給 authenticated，不給 service_role
-- ---------------------------------------------------------------------------

revoke all on function public.request_group_file_upload(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.confirm_group_file_upload(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.list_group_files(uuid) from public, anon, authenticated;
revoke all on function public.request_group_file_download(uuid) from public, anon, authenticated;
revoke all on function public.replace_group_file(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.delete_group_file(uuid) from public, anon, authenticated;

grant execute on function public.request_group_file_upload(uuid, text, text, bigint) to authenticated;
grant execute on function public.confirm_group_file_upload(uuid, bigint, text) to authenticated;
grant execute on function public.list_group_files(uuid) to authenticated;
grant execute on function public.request_group_file_download(uuid) to authenticated;
grant execute on function public.replace_group_file(uuid, text, text, bigint) to authenticated;
grant execute on function public.delete_group_file(uuid) to authenticated;
