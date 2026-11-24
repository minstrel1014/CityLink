-- CityLink — 群組檔案：pending 列的 object_key 查詢（P2 簽名端點的前置）
--
-- 狀態：**草案，尚未套用**。套用需要 Role 6 exact-head 審查、Adam 指名本檔 blob 的授權、
--   以及套用前的 Launch preflight。本檔應與 F-P1-1 的具名 token 及 group_file_usage
--   合併為同一次 SQL 修訂，共用一次審查與一次授權。
--
-- 為什麼需要：P2 簽名端點必須自己取得 object_key，不能接受客戶端傳入（否則任何登入者
--   都能取得指向別人檔案的合法簽名 PUT）。但 P1 的六個 RPC 沒有任何一個能回傳
--   **pending** 列的 object_key：
--     * request_group_file_upload 在建立列的同時回傳 key，但端點收到的是既有的 file_id；
--     * request_group_file_download 對非 current 的列一律 raise group_files_not_current；
--     * 其餘四個是寫入路徑。
--   因此簽名端點目前無法以使用者身分解析 key，只能改用 service_role 直讀資料表——
--   那正是設計明文禁止的事。本檔補上缺的那一個唯讀查詢。
--
-- 安全邊界：只回傳「本人所有、且仍為 pending」的列。不是上傳者、不是 pending、
--   不存在，一律同一個 token，避免用錯誤訊息探測他人檔案是否存在。

begin;

select private.assert_citylink_target('pijslbchvstkoweslymr');

-- ---------------------------------------------------------------------------
-- public.group_file_upload_target(p_file_id uuid)
--   → table (object_key text, original_name text, declared_mime text)
--
-- 只給 authenticated。回傳值不含 group_id 或 uploaded_by，呼叫端不需要，
-- 也不該藉此取得可用來拼路徑的資訊。
-- ---------------------------------------------------------------------------
create or replace function public.group_file_upload_target(p_file_id uuid)
returns table (object_key text, original_name text, declared_mime text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_row public.group_files;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'group_files_no_permission';
  end if;

  select * into v_row from public.group_files where id = p_file_id;

  -- 不存在、不是本人的列、已不是 pending：同一個 token。
  if not found
     or v_row.uploaded_by <> v_actor
     or v_row.status <> 'pending'
     or v_row.deleted_at is not null then
    raise exception 'group_files_not_pending';
  end if;

  -- pending 列若已過保留期，簽名只是浪費一次往返。
  if v_row.retention_expires_at <= now() then
    raise exception 'group_files_expired';
  end if;

  return query select v_row.object_key, v_row.original_name, v_row.declared_mime;
end;
$function$;

revoke all on function public.group_file_upload_target(uuid) from public, anon, authenticated, service_role;
grant execute on function public.group_file_upload_target(uuid) to authenticated;

commit;
