-- CityLink — 群組檔案用量查詢：read-only RPC 提案（F-P1-2）
--
-- 狀態：**草案，尚未套用**。這不是已授權的 migration。套用需要：
--   Role 6 exact-head 審查、Adam 指名本檔 blob 的授權、以及套用前的 Launch preflight。
--
-- 為什麼需要：8 GiB 全域與 1 GiB 每群組上限目前只存在於 request_group_file_upload 與
--   replace_group_file 的判斷式中（8589934592 與 1073741824 各出現兩次），
--   private.group_files_bytes 對所有角色都撤銷，所以客戶端看不到用量，
--   額度對使用者與 UI 都是不可見的規則。本檔只新增一個唯讀函式，不改任何既有本體。
--
-- 已知債務（刻意不在本檔處理）：兩個上限值在本檔與四個既有判斷式中各有一份。
--   若日後有 SQL 修訂，應把常數收斂成單一來源，讓判斷式與查詢共用。
--   本檔套用後，兩邊若不一致會出現「UI 顯示還有空間、上傳卻被拒」的落差，
--   這是為什麼限制值直接寫在這裡並加註，而不是另建一個 private 函式再多一層。

begin;

-- 與 P1 相同的 fail-closed 目標守衛：marker 不存在或指到別的 ref 就中止整個交易。
select private.assert_citylink_target('pijslbchvstkoweslymr');

-- ---------------------------------------------------------------------------
-- public.group_file_usage(p_group_id uuid) → jsonb
--
-- 只回傳數字，不回傳任何名稱、路徑或 object_key。授權沿用 P1 的 active-only
-- predicate：被移除者與非成員一律 group_files_no_permission，與檔案本身的可見性一致。
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

commit;
