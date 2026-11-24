-- CityLink — 群組檔案：下一次 SQL 修訂（兩個唯讀函式，v2）
--
-- 狀態：**草案，尚未套用**。套用需要 (1) Role 6 對本檔 exact blob 的審查、
--   (2) Adam 指名本檔 blob 與 Launch ref 的授權、(3) 套用前緊接的 Launch 唯讀 preflight。
--   三者缺一不可；本檔存在不代表任何一項已完成。
--
-- v2 相對 v1（commit ed9a1dd, sha256 b1760d0b…）的變更，逐項對應 Adam 2026-11-24 的決定
-- 與 Role 6 的靜態審查：
--   B-1（阻擋）`uploaded_by <> v_actor` → `uploaded_by is distinct from v_actor`。
--     NULL 時舊寫法求值為 NULL，IF 不進入分支，函式會把別人的 pending 列回傳給任何登入者。
--   Adam 決定 2（成員資格）新增 `private.can_access_group_files(v_row.group_id)`，
--     非該群組的 active 成員一律拒絕；這是 N-6 指出的缺口。
--   Adam 決定 1（配額範圍）`group_file_usage` 不再回傳全域位元組總量，只回傳本群組的
--     用量與上限；跨群組的總量不再對任何成員揭露（N-5）。
--   Adam 決定 3 / N-2 / N-3 `group_file_upload_target` 不再回傳 `declared_mime`。
--     該值是客戶端自填的 JSON 欄位，不是位元組的屬性；一旦被當成簽名用的 Content-Type，
--     等於讓呼叫端決定瀏覽器之後如何解讀該物件。`returns table` 的形狀套用後無法用
--     create or replace 修改，所以必須現在就拿掉，不能留給下一次。
--   N-1 修正第 74 行原本「回傳值不含 group_id」的錯誤註解：object_key 的格式就是
--     `groups/<group_id>/<file_id>`，那句話會誤導後續審查者。
--
-- 內容（兩個都是新增的唯讀函式，不改動 P1 的任何物件）：
--   1. public.group_file_usage(uuid)         — 本群組的配額用量，讓 UI 能顯示「用了多少 / 上限多少」
--   2. public.group_file_upload_target(uuid) — 取回本人 pending 列的 object_key，供 P2 簽名端點使用
--
-- 為什麼合併：兩者都是 P1 之後才發現的缺口的補丁，都只讀、都只給 authenticated、
--   都依賴同一組 P1 私有函式，且都需要同一輪 Role 6 審查與同一次授權窗口。
--
-- **刻意不包含**：F-P1-1 的具名錯誤 token（重複 replace 的 23505 → 可辨識訊息）。
--   Adam 2026-11-24 決定先以客戶端映射處理，該 token 留給之後獨立的一次修訂。
--
-- 已知但不在本檔處理（Role 6 N-4 / N-9 / N-10）：
--   * 上限常數 1073741824 / 8589934592 與 P1 判斷式各自硬編。今日一致；漂移時 UI 與實際
--     判斷會不一致。收斂成 private.group_files_limits() 需重寫 P1 的判斷式，屬另一次修訂。
--   * revoke ... from public 不會收回「直接授予某個自訂角色」的權限。目前無此類角色。
--   * 若 Launch 上已存在同名但不同回傳型別的函式，第一次會以 42P13 失敗（preflight 應檢查）。
--
-- 兩個函式都是 create or replace，重跑安全；本檔不動任何資料列、不改 P1 的六個 RPC、
--   不改任何資料表、政策或權限，除了自己這兩個函式的 revoke/grant。
begin;
-- 與 P1 相同的 fail-closed 目標守衛：marker 不存在或指到別的 ref 就中止整個交易。
-- 這一層驗證的是 cluster 血緣（45M03），不是「這個專案叫什麼名字」。
select private.assert_citylink_target('pijslbchvstkoweslymr');
-- ---------------------------------------------------------------------------
-- public.group_file_usage(p_group_id uuid) → jsonb
--
-- 只回傳本群組的數字，不回傳任何名稱、路徑或 object_key，也不回傳跨群組的總量。
-- 授權沿用 P1 的 active-only predicate：被移除者與非成員一律 group_files_no_permission，
-- 與檔案本身的可見性一致。
--
-- global_limit_reached 是一個布林值，不是用量：P1 除了 1 GiB 的群組上限，還有一道 8 GiB
-- 的全域上限，觸頂時上傳會被 group_files_storage_limit_reached 拒絕。若完全不透露這一
-- 位元，使用者會遇到無法解釋的失敗。它只揭露「是否已觸頂」，不揭露任何群組的用量，
-- 也不隨時間提供可側寫的數字。若 Adam 要求嚴格只回群組數字，刪掉這一行即可，jsonb
-- 的形狀可以自由演進，不需要另一次 migration。
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
    'group_limit_bytes', 1073741824,          -- 1 GiB，必須與 request/replace 的判斷式一致
    'global_limit_reached', v_global_used >= 8589934592  -- 8 GiB，同上
  );
end;
$$;
revoke all on function public.group_file_usage(uuid) from public, anon, authenticated, service_role;
grant execute on function public.group_file_usage(uuid) to authenticated;
-- ---------------------------------------------------------------------------
-- public.group_file_upload_target(p_file_id uuid)
--   → table (object_key text, original_name text)
--
-- 為什麼需要：P2 簽名端點必須自己取得 object_key，不能接受客戶端傳入（否則任何登入者
--   都能取得指向別人檔案的合法簽名 PUT）。但 P1 的六個 RPC 沒有任何一個能回傳
--   **pending** 列的 object_key：
--     * request_group_file_upload 在建立列的同時回傳 key，但端點收到的是既有的 file_id；
--     * request_group_file_download 對非 current 的列一律 raise group_files_not_current；
--     * 其餘四個是寫入路徑。
--   少了本函式，端點只能改用 service_role 直讀資料表——那正是設計明文禁止的事。
--
-- 安全邊界：只回傳「本人所有、仍為 pending、且呼叫者仍是該群組 active 成員」的列。
--   不是上傳者、不是 pending、不存在，一律同一個 token，避免用錯誤訊息探測他人檔案是否存在。
--   注意 object_key 的格式是 `groups/<group_id>/<file_id>`，它本身包含群組 id；這對呼叫者
--   不是新資訊（他在 request_group_file_upload 已收過同一個 key），但端點不得把它寫進日誌。
-- ---------------------------------------------------------------------------
create or replace function public.group_file_upload_target(p_file_id uuid)
returns table (object_key text, original_name text)
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
  -- `is distinct from` 而不是 `<>`：uploaded_by 可為 NULL（on delete set null），
  -- 而 NULL <> x 求值為 NULL，IF 不成立，舊寫法會 fail-open。
  if not found
     or v_row.uploaded_by is distinct from v_actor
     or v_row.status <> 'pending'
     or v_row.deleted_at is not null then
    raise exception 'group_files_not_pending';
  end if;
  -- 被移除的成員不再有任何檔案權限，即使那列是他自己建立的。
  if not private.can_access_group_files(v_row.group_id) then
    raise exception 'group_files_no_permission';
  end if;
  -- pending 列若已過保留期，簽名只是浪費一次往返。
  if v_row.retention_expires_at <= now() then
    raise exception 'group_files_expired';
  end if;
  return query select v_row.object_key, v_row.original_name;
end;
$function$;
revoke all on function public.group_file_upload_target(uuid) from public, anon, authenticated, service_role;
grant execute on function public.group_file_upload_target(uuid) to authenticated;
commit;
