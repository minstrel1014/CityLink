-- CityLink — 群組 AI 對話：migration 提案 **部署 2 / 2**（草案，未套用）
--
-- 狀態：**提案，未套用**。未经 Role 6 對本 blob 的 exact-head 複查；任何真實資料庫都
--   沒有這裡新增的函式。套用需要 Adam 另行書面授權**並指名本檔與部署 1 那一份確切 blob**。
-- 前提：**部署 1 已經 commit**。本檔假設 Section 1/2/3 的兩張表、同意欄位、三個新欄位與
--   五條 `not valid` 約束都已存在；它不重建它們，只驗證它們並補上讀寫路徑與授權。
--   如果部署 1 沒跑，本檔會在第 3.1 節的 foreach 裡找不到約束而（刻意地）不驗證任何東西,
--   後面的函式則会在引用 group_ai_requests 時失敗——所以請先確認部署 1 成功再跑本檔。
--
-- 為什麼本檔要**再跑一次**目標斷言（Adam 對 S-9 裁決 (b) 的硬性條件）：拆成兩次部署等於
--   多出第二次人工選擇目標的機會，而 2026-11-24 的事故正是「在錯的專案上執行」。第二次
--   部署如果沒有自己的斷言，它就在沒有目標驗證的情況下改線上權限與建函式。斷言在同一
--   個 begin 之內、在任何寫入之前；觸發時本檔一個物件都不建立、一條權限都不改。
-- 本檔的鎖形態（這是拆點選在這裡的原因）：`validate constraint` 只需 SHARE UPDATE
--   EXCLUSIVE，寫入仍可進行；函式建立與 grant 只改目錄。所以本檔不會像合在一起那樣
--   把聊天室鎖住。它仍然要在 preflight 裡記錄實際掃描時間與鎖等待，而不是假設為零。
--
-- 本輪依 Adam 2026-11-25 裁決改動的內容（Role 6 的條件項）：
--   S-1 (a)  finish_group_ai_request 的記錄參數預設改為 null，並以 coalesce 保留 begin 已
--            算出的 chat_chars／dropped_context／files_used ⇒ 只呼叫 finish(id, body) 不再
--            把那些值歸零。
--   S-2 (b)  新增 public.get_group_ai_request_status(uuid)：揭露（檔案未能擷取）的送達路徑。
--   S-3      accept_ai_disclosure() 只在欄位仍是 NULL 時寫入，之後回傳既有值 ⇒ 這一欄重新
--            具備「何時第一次接受」的證據語意（F-11）。
--   S-4      檔頭 SQLSTATE 清單補 45N11，並由測試解析這份清單，而不是只查字串存在。
--   S-9 (b)  拆成兩次部署，本檔是第 2 次，且**重跑第 0 節的目標斷言**。
--
-- 套用目標（唯一；依 Adam 的 F14 決定 2026-11-23 01:50 與其 2026-11-25 規則）：
--   CityLink Launch ref pijslbchvstkoweslymr。Prototype wkzclgmhrtecnpexfesr 依 F14 凍結、
--   不得 migrate；本地 PostgreSQL 只是測試場，不是套用對象，綠燈不等於已套用。
-- 為什麼第 0 節要先斷言：2026-11-24 有人把 preflight 與套用打算做在錯的專案上，文件挡不住，
--   只有 SQL 自己能辨識實體叢集。它是**最後**一道防線，不是第一道：Adam 的五關（Role 6
--   無 blocker → 協調任務確認無其他分支改同一批物件 → Launch 唯讀 preflight → 指名 blob 的
--   書面授權 → 同窗口套用）仍是必須，斷言不能取代它們。
-- 觸發時會看到：45M01 marker 缺、45M02 ref 不符、45M03 叢集不同（restore／clone）、
--   45M04 讀不到 pg_control_system()；unknown 一律不是通過。任一項都讓本檔一個物件都不建立。
-- 正確執行方式：同部署 1（保留空行的檔案傳輸、ON_ERROR_STOP=1、VERBOSITY=verbose、
--   逐函式 md5(prosrc) 比對、先套用後 promote）。本檔路徑：
--     psql "$LAUNCH_URI" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f \
--        docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql
--
-- 依賴（必須已存在；本檔不建立、不修改、不刪除它們）：
--   * private.citylink_target 與 private.assert_citylink_target(text)
--     —— 2026-11-24 經核准的 P1 套用建立，pin 了 Launch 的 system_identifier。
--   * public.group_chat_messages / public.study_groups / public.profiles
--     / public.group_files（P1）
--   * private.can_send_group_chat(uuid) / private.can_read_group_chat(uuid)
--     —— supabase/migrations/20261118050000_stage6_chat_recruitment.sql
--   * 部署 1 的物件（本部署不重建它們，但第 3.1 節要驗證它們留下的約束）。
--
-- SQLSTATE 登記表（45N01、45N03–45N11）。刻意不借用 capacity 的 45003、P1 的 45K0x、
--   marker 的 45M0x：一碼一因，log 才能說出是哪條線拒絕。**這份清單由
--   server/stage6AiChatSqlContract.test.ts 解析**：兩檔檔頭聲明的碼必須恰好等於兩檔本體
--   實際 raise 的碼，且與測試內的 token 配對表一致；新增一支 raise 卻忘了登記，測試即失敗
--   （Role 6 的 S-4：45N11 曾在本體存在、檔頭缺席，而舊測試只查字串所以沒擋住）。
--   45N01 group_ai_no_permission        未登入、非 active 成員、或群組 abandoned
--   45N03 group_ai_question_empty       提問空白
--   45N11 group_ai_question_too_long    提問超過 4,000 字元（與空白分開，一碼一因）
--   45N04 group_ai_file_not_eligible    檔案非本群組、非 current、已刪除或已過期
--   45N05 group_ai_too_many_files       一次選取超過 2 個
--   45N06 group_ai_rate_limited         超出每日或 in-flight 上限；DETAIL 帶 retry_after
--   45N07 group_ai_idempotency_conflict 同一 key 但 question／file_ids 不同
--   45N08 group_ai_request_unknown      finish 指向不存在的 request
--   45N09 group_ai_disclosure_required  提問者從未在伺服器端接受揭露（Adam F-11）
--   45N10 group_ai_answer_empty         finish 帶回成功卻沒有回答文字
--   （45N02 保留：清空成功是回傳值而不是錯誤，所以沒有對應碼。）

--   本檔（部署 2）本體 raise 45N01、45N03–45N10、45N11；45N09 在 begin 的同意檢查、
--   45N11 在提問長度檢查。兩檔聲明的聯集與兩檔 raise 的聯集由測試比對。

begin;

-- ===========================================================================
-- Section 0（重跑）— fail-closed 目標斷言
-- ===========================================================================
-- 必須在本檔任何寫入之前、且在同一個 begin 之內。看到任一 45M0x 請停止：不要修改本節
--   讓它過去，也不要「先套再修」。
select private.assert_citylink_target('pijslbchvstkoweslymr');

-- Section 3.1 — 驗證五條約束（拆成第二次部署時，從這裡開始）
-- 每一條都要全表掃描一次；group_chat_messages 是 live 表，所以這一步的耗時要在
-- preflight 裡量過，而不是套用當下才發現。
do $kayk_ai_validate$
declare
  c text;
begin
  foreach c in array array[
    'group_chat_messages_author_kind',
    'group_chat_messages_ai_has_no_sender',
    'group_chat_messages_ai_name',
    'group_chat_messages_ai_request_only_for_ai',
    'group_chat_messages_ai_request_fkey'
  ] loop
    if exists (
      select 1 from pg_constraint
      where conname = c
        and conrelid = 'public.group_chat_messages'::regclass
        and not convalidated
    ) then
      execute format('alter table public.group_chat_messages validate constraint %I', c);
    end if;
  end loop;
end
$kayk_ai_validate$;

-- finish 的冪等回傳要能找到既有訊息（F-3、N-5）。
create index if not exists group_chat_messages_ai_request
  on public.group_chat_messages (ai_request_id)
  where ai_request_id is not null;

-- ===========================================================================
-- Section 4 — 共用的分頁實作與新的讀取函式（F-5、B-2）
-- ===========================================================================
-- 驗證、predicate 與排序只有這一份。既有的 public.list_group_chat_messages 本檔
-- 不動；新客戶端改用 list_group_chat_messages_ai。走舊函式的客戶端看不到
-- author_kind，會把 AI 回答顯示成一般成員訊息——這是選擇 B-2 的代價，已寫成
-- P2 驗收項（合約 §11 的 F-6）。
create or replace function private.list_group_chat_messages_page(
  p_group_id uuid,
  p_before_created_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns table (
  message_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  author_kind text,
  truncated boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  -- 讀取沿用聊天 predicate（active、left、removed 可讀，非成員不可），
  -- 所以前成員仍可讀取 AI 回答（合約 §5）。
  if not private.can_read_group_chat(p_group_id) then
    raise exception 'not authorized to read this group chat';
  end if;

  return query
    select m.id, m.sender_name_snapshot, m.body, m.created_at, m.author_kind,
           m.truncated
    from public.group_chat_messages m
    where m.group_id = p_group_id
      and (p_before_created_at is null
        or (m.created_at, m.id) < (p_before_created_at, p_before_id))
    order by m.created_at desc, m.id desc
    limit p_limit;
end;
$function$;

create or replace function public.list_group_chat_messages_ai(
  p_group_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  message_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  author_kind text,
  truncated boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.message_id, r.sender_name, r.body, r.created_at, r.author_kind,
         r.truncated
  from private.list_group_chat_messages_page(
    p_group_id, p_before_created_at, p_before_id, p_limit) as r;
$function$;

-- ===========================================================================
-- Section 5 — begin_group_ai_request（authenticated）
-- ===========================================================================
create or replace function public.begin_group_ai_request(
  p_group_id uuid,
  p_question text,
  p_file_ids uuid[] default '{}'::uuid[],
  p_idempotency_key uuid default gen_random_uuid()
)
returns table (
  request_id uuid,
  question text,
  turns jsonb,
  files jsonb,
  dropped_context boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_question text := btrim(coalesce(p_question, ''));
  v_files uuid[];
  v_file_count integer;
  v_missing integer;
  v_existing public.group_ai_requests%rowtype;
  v_found_existing boolean := false;
  v_start timestamptz;
  v_budget integer := 4000;
  v_chat_chars integer := 0;
  v_ai_kept integer := 0;
  v_kept uuid[] := '{}';
  v_dropped boolean := false;
  v_turns jsonb;
  v_files_json jsonb;
  v_group_today integer;
  v_user_today integer;
  v_in_flight integer;
  v_retry_after integer;
  v_stale interval := interval '120 seconds';
  v_day_start timestamptz;
  r record;
begin
  if v_actor is null then
    raise exception 'group_ai_no_permission'
      using errcode = '45N01', detail = 'no authenticated actor';
  end if;

  -- 一個 predicate 涵蓋「active 成員」與「群組未 abandoned」，與發送訊息同一條規則。
  if not private.can_send_group_chat(p_group_id) then
    raise exception 'group_ai_no_permission'
      using errcode = '45N01',
            detail = 'caller is not an active member of a non-abandoned group';
  end if;

  -- F-11：沒有接受記錄就 refuse。前端勾選不再是唯一防線。
  if (
    select p.ai_disclosure_accepted_at from public.profiles p where p.id = v_actor
  ) is null then
    raise exception 'group_ai_disclosure_required' using errcode = '45N09';
  end if;

  if char_length(v_question) < 1 then
    raise exception 'group_ai_question_empty' using errcode = '45N03';
  end if;
  if char_length(v_question) > 4000 then
    -- 一個 code 只講一件事（與 45N10 同一原則）：空問與超長問是兩種修法。
    raise exception 'group_ai_question_too_long'
      using errcode = '45N11', detail = 'question exceeds 4000 characters';
  end if;

  -- file_ids 一律排序後比較與儲存，重試才會穩定（F-2）。
  select coalesce(array_agg(f.file_id order by f.file_id), '{}'::uuid[])
    into v_files
  from unnest(coalesce(p_file_ids, '{}'::uuid[])) as f(file_id);

  select count(*) into v_file_count from unnest(v_files) as f(file_id);
  if v_file_count > 2 then
    raise exception 'group_ai_too_many_files' using errcode = '45N05';
  end if;

  -- 檔案資格在伺服器驗，不信任客戶端傳來的清單（合約 §8）。
  if v_file_count > 0 then
    select count(*) into v_missing
    from unnest(v_files) as f(file_id)
    where not exists (
      select 1
      from public.group_files gf
      where gf.id = f.file_id
        and gf.group_id = p_group_id
        and gf.status = 'current'
        and gf.deleted_at is null
        and gf.retention_expires_at > now()
    );
    if v_missing > 0 then
      raise exception 'group_ai_file_not_eligible' using errcode = '45N04';
    end if;
  end if;

  -- 兩把鎖，順序固定為群組→成員（G-2）。
  perform pg_advisory_xact_lock(hashtextextended('ai-group:' || p_group_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || v_actor::text, 0));

  -- 冪等：同 key 且內容相同才回傳既有列；不同是誤用，不是重試（F-2）。
  select * into v_existing
  from public.group_ai_requests q
  where q.group_id = p_group_id
    and q.idempotency_key = p_idempotency_key;
  v_found_existing := found;

  if v_found_existing then
    if v_existing.question <> v_question or v_existing.file_ids <> v_files then
      raise exception 'group_ai_idempotency_conflict' using errcode = '45N07';
    end if;
    return query
      select v_existing.id, v_existing.question, v_existing.turns,
             v_existing.files, v_existing.dropped_context;
    return;
  end if;

  -- 限流（G-3 口徑：从未被接手的過期 queued 列不計入每日配額）。
  v_day_start := date_trunc('day', now());

  select count(*) into v_group_today
  from public.group_ai_requests q
  where q.group_id = p_group_id
    and q.created_at >= v_day_start
    and (q.status in ('processing', 'ready', 'failed')
      or q.created_at > now() - v_stale);

  select count(*) into v_user_today
  from public.group_ai_requests q
  where q.asked_by = v_actor
    and q.created_at >= v_day_start
    and (q.status in ('processing', 'ready', 'failed')
      or q.created_at > now() - v_stale);

  select count(*) into v_in_flight
  from public.group_ai_requests q
  where q.group_id = p_group_id
    and q.status in ('queued', 'processing')
    and q.created_at > now() - v_stale;

  -- PL/pgSQL 不允許同時給訊息文字與 MESSAGE 選項（42601），所以 msg 恆為 token，
  -- retry_after 與原因放 DETAIL。客戶端自己也有 retryAfterSeconds(now)（同一個 UTC
  -- 日界，见 shared/aiRateLimit.ts），兩邊算法一致；伺服器的值是權威。
  if v_in_flight >= 1 then
    -- in-flight 先報：幾秒內就會解除，不該叫成員等到隔天。
    raise exception 'group_ai_rate_limited'
      using errcode = '45N06',
            detail = format('retry_after=15 reason=in_flight in_flight=%s',
                            v_in_flight);
  end if;
  if v_group_today >= 20 or v_user_today >= 10 then
    v_retry_after := greatest(1, floor(
      extract(epoch from ((v_day_start + interval '1 day') - now()))
    )::int);
    raise exception 'group_ai_rate_limited'
      using errcode = '45N06',
            detail = format('retry_after=%s reason=%s group_today=%s user_today=%s',
                            v_retry_after,
                            case when v_group_today >= 20 then 'group_daily'
                                 else 'user_daily' end,
                            v_group_today, v_user_today);
  end if;

  -- Context 組裝，四條規則（合約 §3）。規則 1：提問永遠保留、不計入 4,000。
  v_start := coalesce(
    (select c.context_starts_at from public.group_ai_context c
      where c.group_id = p_group_id),
    to_timestamp(0)
  );

  -- 規則 2：最多 2 則最近的 AI 回答，與成員訊息共用同一個 4,000 額度，超出從最舊丟。
  for r in
    select m.id as mid, char_length(m.body) as cost
    from public.group_chat_messages m
    where m.group_id = p_group_id
      and m.author_kind = 'ai'
      and m.created_at > v_start
    order by m.created_at desc, m.id desc
    limit 10
  loop
    if v_ai_kept < 2 and v_chat_chars + r.cost <= v_budget then
      v_kept := v_kept || r.mid;
      v_chat_chars := v_chat_chars + r.cost;
      v_ai_kept := v_ai_kept + 1;
    else
      v_dropped := true;
    end if;
  end loop;

  -- 規則 3：剩餘額度才給成員聊天，取最近的部分。
  for r in
    select m.id as mid, char_length(m.body) as cost
    from public.group_chat_messages m
    where m.group_id = p_group_id
      and m.author_kind = 'member'
      and m.created_at > v_start
    order by m.created_at desc, m.id desc
    limit 200
  loop
    if v_chat_chars + r.cost <= v_budget then
      v_kept := v_kept || r.mid;
      v_chat_chars := v_chat_chars + r.cost;
    else
      v_dropped := true;
    end if;
  end loop;

  -- 規則 4 的條件在回答端加（notice），這裡只記錄 dropped_context。
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'authorKind', m.author_kind,
           'authorName', m.sender_name_snapshot,
           'body', m.body,
           'createdAt', m.created_at
         ) order by m.created_at, m.id), '[]'::jsonb)
    into v_turns
  from public.group_chat_messages m
  where m.id = any (v_kept);

  -- 檔案只帶 id 與名稱；文字由伺服器擷取，本檔不儲存文字。
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', gf.id, 'name', gf.original_name)
         order by gf.created_at), '[]'::jsonb)
    into v_files_json
  from public.group_files gf
  where gf.id = any (v_files);

  insert into public.group_ai_requests as q (
    group_id, asked_by, idempotency_key, question, file_ids, turns, files,
    status, dropped_context, chat_chars, file_chars, files_used
  ) values (
    p_group_id, v_actor, p_idempotency_key, v_question, v_files, v_turns,
    v_files_json, 'queued', v_dropped, v_chat_chars, 0, v_file_count
  )
  returning q.id, q.question, q.turns, q.files, q.dropped_context
  into v_existing.id, v_existing.question, v_existing.turns, v_existing.files,
       v_existing.dropped_context;

  return query
    select v_existing.id, v_existing.question, v_existing.turns,
           v_existing.files, v_existing.dropped_context;
end;
$function$;

-- ===========================================================================
-- Section 6 — claim 與 finish（僅 service_role）
-- ===========================================================================
-- F-3／G-4：processing 必須有人寫，否則它是不可達枚举值，殭屍規則的一半永遠不生效；
-- 而 finish 被重複呼叫（逾時重試最常見）會插入兩則 AI 訊息。
create or replace function public.claim_group_ai_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  update public.group_ai_requests q
    set status = 'processing', claimed_at = now()
  where q.id = p_request_id and q.status = 'queued'
  returning q.id into v_id;

  return v_id is not null;
end;
$function$;

-- S-1（Adam 2026-11-25 採選項 (a)）：下面五個記錄參數原本是 `default false`／`default 0`,
--   而 update 無條件覆寫 ⇒ 只呼叫 finish(p_request_id, p_body) 就會把 begin 已經算好的
--   chat_chars、dropped_context、files_used 靜靜歸零，正好抹掉這張 log 表存在的理由；
--   files_used 同時是 F-8 的揭露判據，所以同一個旗標既可假陰也可假陽。改成預設 null 並在
--   update 裡 coalesce 到既有值：省略參數的語意從「歸零」變成「沿用」,失敗方向是安全的。
create or replace function public.finish_group_ai_request(
  p_request_id uuid,
  p_body text,
  p_truncated boolean default null,
  p_dropped_context boolean default null,
  p_chat_chars integer default null,
  p_file_chars integer default null,
  p_files_used integer default null,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_message uuid;
  v_truncated boolean;
  v_state text;
begin
  -- 授權依據是 request 列的存在與狀態，不是 auth.uid()（F-4）。service_role 呼叫時
  -- auth.uid() 是 NULL；照「actor 取自 auth.uid()」的字面在此加檢查會讓它永遠失敗。
  if p_error_code is null and char_length(btrim(coalesce(p_body, ''))) < 1 then
    raise exception 'group_ai_answer_empty'
      using errcode = '45N10', detail = 'a successful finish needs answer text';
  end if;

  -- 只從非終止狀態轉換：這一次更新成功與否，就是「有沒有第二則訊息」的開關。
  update public.group_ai_requests q
    set status = case when p_error_code is null then 'ready' else 'failed' end,
        error_code = p_error_code,
        truncated = coalesce(p_truncated, q.truncated),
        dropped_context = coalesce(p_dropped_context, q.dropped_context),
        chat_chars = coalesce(p_chat_chars, q.chat_chars),
        file_chars = coalesce(p_file_chars, q.file_chars),
        files_used = coalesce(p_files_used, q.files_used),
        finished_at = now()
  where q.id = p_request_id
    and q.status in ('queued', 'processing')
  returning q.id, q.truncated into v_message, v_truncated;

  if v_message is null then
    -- 已是終止狀態：回傳既有訊息，不插入第二則（冪等）。
    select m.id into v_message
    from public.group_chat_messages m
    where m.ai_request_id = p_request_id;

    if v_message is not null then
      return v_message;
    end if;

    select q.status into v_state
    from public.group_ai_requests q where q.id = p_request_id;

    if v_state is null then
      raise exception 'group_ai_request_unknown'
        using errcode = '45N08', detail = p_request_id::text;
    end if;
    -- 終止且沒有訊息：之前失敗過，沒有可顯示的內容。
    return null;
  end if;

  if p_error_code is not null then
    return null;
  end if;

  insert into public.group_chat_messages as m (
    group_id, sender_id, sender_name_snapshot, body, author_kind,
    ai_request_id, truncated
  )
  select q.group_id, null, 'CityLink AI',
         left(btrim(p_body), 4000), 'ai', q.id, v_truncated
  from public.group_ai_requests q
  where q.id = p_request_id
  returning m.id into v_message;

  return v_message;
end;
$function$;

-- ===========================================================================
-- Section 7 — clear_group_ai_context（authenticated；只移動時間戳）
-- ===========================================================================
create or replace function public.clear_group_ai_context(p_group_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_at timestamptz;
begin
  if v_actor is null then
    raise exception 'group_ai_no_permission'
      using errcode = '45N01', detail = 'no authenticated actor';
  end if;
  -- 與提問同一條成員資格規則（abandoned 群組不可再操作）。
  if not private.can_send_group_chat(p_group_id) then
    raise exception 'group_ai_no_permission'
      using errcode = '45N01',
            detail = 'caller is not an active member of a non-abandoned group';
  end if;

  insert into public.group_ai_context as c (
    group_id, context_starts_at, updated_by, updated_at
  ) values (p_group_id, now(), v_actor, now())
  on conflict (group_id) do update
    set context_starts_at = excluded.context_starts_at,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning c.context_starts_at into v_at;

  -- 沒有任何 delete。清空只移動時間戳，成員無法摧毀彼此的文字。
  return v_at;
end;
$function$;

-- ===========================================================================
-- Section 7.5 — get_group_ai_request_status（S-2 採 Adam 的選項 (b)：揭露的送達路徑）
-- ===========================================================================
-- 問題（Role 6 S-2）：begin 記的是「有通過資格的選取數」，真正知道幾個檔案擷取失敗的是
--   finish 之後的那一列，而 finish 只回傳 message id、group_ai_requests 對任何人都不可讀
--   ——F-8 那句「有些檔案沒能讀到」原本沒有到達客戶端的路徑。
-- 這一支就是那條路徑：只回傳**狀態與計數**，不回傳 question、不回傳 turns、不回傳檔案名稱，
--   所以它是揭露信道而不是內容信道。判據寫進合約：files_used < files_requested ⇒ 至少有
--   一個選取的檔案沒有被讀取（擷取失敗的檔案由 worker 在 finish 以 p_files_used 如實回報）。
-- 可讀範圍沿用 private.can_read_group_chat（與「前成員仍可讀 AI 回答」同一條規則）。查不到、
--   request id 不存在、或caller 讀不到該群組 ⇒ **回傳 0 列而不是報錯**：區分「不存在」與
--   「無權」會洩漏該 request 屬於哪個群組，這一輪刻意不換那個資訊量。
create or replace function public.get_group_ai_request_status(p_request_id uuid)
returns table (
  request_id uuid,
  group_id uuid,
  status text,
  asked_at timestamptz,
  finished_at timestamptz,
  message_id uuid,
  error_code text,
  dropped_context boolean,
  truncated boolean,
  files_requested integer,
  files_used integer,
  chat_chars integer,
  file_chars integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select q.id,
         q.group_id,
         q.status,
         q.created_at,
         q.finished_at,
         m.id,
         q.error_code,
         q.dropped_context,
         q.truncated,
         coalesce(array_length(q.file_ids, 1), 0)::int,
         q.files_used,
         q.chat_chars,
         q.file_chars
  from public.group_ai_requests q
  left join public.group_chat_messages m on m.ai_request_id = q.id
  where q.id = p_request_id
    and auth.uid() is not null
    and private.can_read_group_chat(q.group_id);
$function$;

-- ===========================================================================
-- Section 8 — 授權
-- ===========================================================================
-- 函式一律先 revoke 全部（含 service_role），再只授與需要的角色。
revoke all on function private.list_group_chat_messages_page(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_group_chat_messages_ai(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_group_ai_request(uuid, text, uuid[], uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_group_ai_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_ai_disclosure()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_group_ai_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_group_ai_request(uuid, text, boolean, boolean, integer, integer, integer, text)
  from public, anon, authenticated, service_role;

grant execute on function public.list_group_chat_messages_ai(uuid, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.begin_group_ai_request(uuid, text, uuid[], uuid)
  to authenticated;
grant execute on function public.clear_group_ai_context(uuid) to authenticated;
grant execute on function public.accept_ai_disclosure() to authenticated;
grant execute on function public.claim_group_ai_request(uuid) to service_role;
grant execute on function public.finish_group_ai_request(uuid, text, boolean, boolean, integer, integer, integer, text) to service_role;

revoke all on function public.get_group_ai_request_status(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_group_ai_request_status(uuid)
  to authenticated;

-- 部署步驟（不是 SQL 正確性問題，但漏掉會看不到新函式）：
--   新增 public 函式後需要 PostgREST schema cache 重載 ——
--   notify pgrst, 'reload schema';

-- 本檔刻意不做的事：
--   * 不動 public.list_group_chat_messages、public.send_group_chat_message，
--     也不動 group_chat_messages 現有的 4,000 字元 CHECK（2,500 是應用層政策）。
--   * 不動 group_analysis_plans / group_analysis_jobs（Adam 2026-11-24：不刪、不改、
--     只停用）。
--   * 不建立 provider 相關物件：資料庫不持有 key，也不呼叫 provider。
--   * 不建立群組級 AI 開關、不建立成員級退出（Adam F-12 選項 c）。
--   * 不把限流數字搬進設定表（G-1 採 (c)：字面值 + 釘住測試）。

commit;
