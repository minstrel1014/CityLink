-- CityLink — group AI usage read RPC
--
-- 目的：讓 AI drawer 在成員「還沒提問」之前就能顯示今天的額度用量，而不是只能等
-- 45N06 拒絕之後、從錯誤 detail 裡把 group_today / user_today 撿回來顯示。這是一個
-- 唯讀函式：不寫任何資料列、不建立 request、不觸發 executor。
--
-- 這個檔案的套用狀態與歷史不寫在這裡，寫在 docs/team/DECISIONS.md 與
-- supabase_migrations.schema_migrations。檔案本身在套用後會原樣 promote 進
-- supabase/migrations/，所以 header 不能帶著「草案、尚未套用」這種會隨時間變成
-- 假話的字樣——那會讓已套用的 blob 與 repo 裡的檔案對不上。
--
-- 三個數字必須與 public.begin_group_ai_request 的判定逐字一致，否則 UI 會顯示
-- 「還有額度」但送出時被拒，或反過來。對齊的三點：
--   1. 日界 date_trunc('day', now(), 'UTC')，不是 session timezone 的今天。
--   2. 從未被人接手過的 queued 列不計入（沒有 provider 呼叫、沒有花錢）。
--   3. 每人上限跨群組累計：user_today 只按 asked_by 過濾，沒有 group_id 條件。
-- in_flight 用的是 begin 的同一個 120 秒 stale 窗，避免把早已死掉的列算成「正在回答」。
--
-- 權限：只有該群組的 active member 能讀。非成員拿到 42501，不洩漏群組是否存在、
-- 也不洩漏任何計數。execute 只給 authenticated；public / anon 一律撤銷。

create or replace function public.get_group_ai_usage(p_group_id uuid)
returns table (
  group_today integer,
  group_limit integer,
  user_today integer,
  user_limit integer,
  in_flight integer,
  retry_after_seconds integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_day_start timestamptz;
  v_group_today integer;
  v_user_today integer;
  v_in_flight integer;
  v_retry_after integer;
  -- 與 begin_group_ai_request 相同的字面值。改這裡就要改那裡，反之亦然；
  -- server/stage6AiChatSqlContract.test.ts 會把兩邊釘在一起。
  c_group_limit constant integer := 20;
  c_user_limit constant integer := 10;
  c_stale constant interval := interval '120 seconds';
begin
  if v_actor is null then
    raise exception 'not authorized to read group ai usage'
      using errcode = '42501';
  end if;
  if p_group_id is null
     or not private.is_active_group_member(p_group_id, v_actor) then
    -- 同一個錯誤、同一個 SQLSTATE：非成員不該能從錯誤碼反推群組存不存在。
    raise exception 'not authorized to read group ai usage'
      using errcode = '42501';
  end if;

  v_day_start := date_trunc('day', now(), 'UTC');

  select count(*) into v_group_today
  from public.group_ai_requests q
  where q.group_id = p_group_id
    and q.created_at >= v_day_start
    and not (q.status = 'queued' and q.claimed_at is null);

  select count(*) into v_user_today
  from public.group_ai_requests q
  where q.asked_by = v_actor
    and q.created_at >= v_day_start
    and not (q.status = 'queued' and q.claimed_at is null);

  select count(*) into v_in_flight
  from public.group_ai_requests q
  where q.group_id = p_group_id
    and q.status in ('queued', 'processing')
    and q.created_at > now() - c_stale;

  -- 與 begin 的 retry_after 同一個算式：到下一個 UTC 日界的秒數，至少 1。
  v_retry_after := greatest(1, floor(
    extract(epoch from ((v_day_start + interval '1 day') - now()))
  )::int);

  return query
  select v_group_today,
         c_group_limit,
         v_user_today,
         c_user_limit,
         v_in_flight,
         v_retry_after;
end;
$function$;

revoke all on function public.get_group_ai_usage(uuid) from public, anon;
grant execute on function public.get_group_ai_usage(uuid) to authenticated;

comment on function public.get_group_ai_usage(uuid) is
  'Read-only daily AI quota usage for one group and the calling member. Mirrors begin_group_ai_request predicates (UTC day boundary, unclaimed queued rows excluded, per-user count spans all groups). Active members only.';
