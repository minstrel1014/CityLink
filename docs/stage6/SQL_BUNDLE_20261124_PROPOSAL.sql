-- CityLink — 群組檔案：下一次 SQL 修訂（兩個唯讀函式合併為單一交易）
--
-- 狀態：**草案，尚未套用**。套用需要 (1) Role 6 對本檔 exact blob 的審查、
--   (2) Adam 指名本檔 blob 與 Launch ref 的授權、(3) 套用前緊接的 Launch 唯讀 preflight。
--   三者缺一不可；本檔存在不代表任何一項已完成。
--
-- 內容（兩個都是新增的唯讀函式，不改動 P1 的任何物件）：
--   1. public.group_file_usage(uuid)         — 配額用量，讓 UI 能顯示「用了多少 / 上限多少」
--   2. public.group_file_upload_target(uuid) — 取回本人 pending 列的 object_key，供 P2 簽名端點使用
--
-- 為什麼合併：兩者都是 P1 之後才發現的缺口的補丁，都只讀、都只給 authenticated、
--   都依賴同一組 P1 私有函式，且都需要同一輪 Role 6 審查與同一次授權窗口。
--   分成兩次只會把同一個審查做兩次、把同一個窗口開兩次。
--
-- **刻意不包含**：F-P1-1 的具名錯誤 token（重複 replace 的 23505 → 可辨識訊息）。
--   Adam 2026-11-24 決定先以客戶端映射處理，該 token 留給之後獨立的一次修訂，
--   屆時需自行取得審查與授權，不得順手夾帶進本檔。
--
-- 兩個函式都是 create or replace，重跑安全；本檔不動任何資料列、不改 P1 的六個 RPC、
--   不改任何資料表、政策或權限，除了自己這兩個函式的 revoke/grant。
begin;
-- 與 P1 相同的 fail-closed 目標守衛：marker 不存在或指到別的 ref 就中止整個交易。
select private.assert_citylink_target('pijslbchvstkoweslymr');
-- ---------------------------------------------------------------------------
-- public.group_file_usage(p_group_id uuid) → jsonb
--
-- 只回傳數字，不回傳任何名稱、路徑或 object_key。授權沿用 P1 的 active-only
-- predicate：被移除者與非成員一律 group_files_no_permission，與檔案本身的可見性一致。
-- 全域用量是跨所有群組的總和，所以呼叫端必須同時拿到兩個上限才不會誤導使用者。
-- ---------------------------------------------------------------------------
create or replace function public.group_file_usage(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_used bigint;
  v_global_used bigint;
begin
  if auth.uid() is null then
    raise exception 'group_files_no_permission';
  end if;
  if not private.can_access_group_files(p_group_id) then
    raise exception 'group_files_no_permission';
  end if;
  v_group_used := private.group_files_bytes(p_group_id);
  v_global_used := private.group_files_bytes(null);
  return jsonb_build_object(
    'used_bytes', v_group_used,
    'group_limit_bytes', 1073741824,   -- 1 GiB，必須與 request/replace 的判斷式一致
    'global_used_bytes', v_global_used,
    'global_limit_bytes', 8589934592   -- 8 GiB，必須與 request/replace 的判斷式一致
  );
end;
$$;
revoke all on function public.group_file_usage(uuid) from public, anon, authenticated, service_role;
grant execute on function public.group_file_usage(uuid) to authenticated;
-- ---------------------------------------------------------------------------
-- public.group_file_upload_target(p_file_id uuid)
--   → table (object_key text, original_name text, declared_mime text)
--
-- 為什麼需要：P2 簽名端點必須自己取得 object_key，不能接受客戶端傳入（否則任何登入者
--   都能取得指向別人檔案的合法簽名 PUT）。但 P1 的六個 RPC 沒有任何一個能回傳
--   **pending** 列的 object_key：
--     * request_group_file_upload 在建立列的同時回傳 key，但端點收到的是既有的 file_id；
--     * request_group_file_download 對非 current 的列一律 raise group_files_not_current；
--     * 其餘四個是寫入路徑。
--   少了本函式，端點只能改用 service_role 直讀資料表——那正是設計明文禁止的事。
--
-- 安全邊界：只回傳「本人所有、且仍為 pending」的列。不是上傳者、不是 pending、
--   不存在，一律同一個 token，避免用錯誤訊息探測他人檔案是否存在。
--   回傳值不含 group_id 或 uploaded_by，呼叫端不需要，也不該藉此取得可拼路徑的資訊。
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
