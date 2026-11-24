-- CityLink — 群組 AI 對話：migration 提案（草案，未套用）
--
-- 狀態：**提案**。未經 Role 6 對本 blob 的 exact-head 審查；未套用；任何真實資料庫都
--   沒有這些物件。套用需要 Adam 另行書面授權並指名本檔的確切 blob（依 P1 先例）。
-- 設計依據：docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md。兩者不一致時，SQL 能表達的
--   部分以本檔為準，產品行為以合約為準。
-- 驗證方式：server/stage6AiChatMigrationApplies.test.ts 把本檔套用到一個可丟棄的本地
--   PostgreSQL（不是任何 Supabase 專案），並跑權限、限流、冪等、狀態機與清空的行為檢查；
--   server/stage6AiChatSqlContract.test.ts 讀文字，釘住常數與授權形態。
-- 套用目標（依 Adam 的 F14 決定，2026-11-23 01:50）：CityLink Launch
--   ref pijslbchvstkoweslymr。第 0 節先驗證目標，不符即中止整個交易。
-- 依賴（必須已存在；本檔不建立、不修改、不刪除它們）：
--   * private.citylink_target 與 private.assert_citylink_target(text)
--     —— 2026-11-24 經核准的 P1 套用建立，pin 了 Launch 的 system_identifier。
--   * public.group_chat_messages / public.study_groups / public.profiles
--     / public.group_files（P1）
--   * private.can_send_group_chat(uuid) / private.can_read_group_chat(uuid)
--     —— supabase/migrations/20261118050000_stage6_chat_recruitment.sql
--
-- ---------------------------------------------------------------------------
-- SQLSTATE（45N01、45N03–45N10）。刻意不借用 capacity 的 45003、P1 的 45K0x、marker 的
--   45M0x：一碼一因，log 才能說出是哪條線拒絕。
--   45N01 group_ai_no_permission        未登入、非 active 成員、或群組 abandoned
--   45N03 group_ai_question_empty       提問空白或超過 4,000 字元
--   45N04 group_ai_file_not_eligible    檔案非本群組、非 current、已刪除或已過期
--   45N05 group_ai_too_many_files       一次選取超過 2 個
--   45N06 group_ai_rate_limited         超出每日或 in-flight 上限；DETAIL 帶 retry_after
--   45N07 group_ai_idempotency_conflict 同一 key 但 question／file_ids 不同
--   45N08 group_ai_request_unknown      finish 指向不存在的 request
--   45N09 group_ai_disclosure_required  提問者從未在伺服器端接受揭露（Adam F-11）
--   45N10 group_ai_answer_empty        finish 帶回成功卻沒有回答文字
--   （45N02 保留：清空成功是回傳值而不是錯誤，所以沒有對應碼。）
--
-- ---------------------------------------------------------------------------
-- 常數的重複方式（Role 6 G-1，Adam 已定案採 (c)）。SQL 匯入不了 TypeScript 模組，
--   所以 20／10／1／120 在本檔是字面值，另一份在 shared/aiRateLimit.ts。
--   綁在一起的機制是靜態測試：stage6AiChatSqlContract.test.ts 解析本檔這四個數字並
--   與 AI_RATE_LIMITS 比較，不一致即失敗。代價明講：改 TS 忘了改 SQL 不會在執行期
--   被發现，只会在這個測試被發现。
--   數字：每群組每日 20 題、每成員每日 10 題（跨群組）、每群組同時 1 個進行中、
--   殭屍門檻 120 秒。
--
-- 鎖（Role 6 G-2）。群組鎖挡不住「同一人在兩個群組同時提問」，因為 user_daily 是
--   跨群組計數。本檔取兩把 advisory xact lock，取得順序固定為群組→成員，且只在
--   begin_group_ai_request 一個地方成對取得，因此沒有交叉順序造成的死鎖。
--
-- 每日計數口徑（Role 6 G-3）。provider 當機日不該燒光配額：从未被接手（status 仍為
--   'queued'）且已超過 120 秒的列不計入每日配額——它沒有產生任何 provider 呼叫。
--   processing／ready／failed 一律計入。
--
-- 時間源（Role 6 G-5）。日界、120 秒門檻與 retry_after 全部由同一個 now()（交易起始
--   時間）推出；retry_after 恆 >= 1。
--
-- 同意（Adam 2026-11-24，F-11 採「伺服器端記錄一次接受並在 begin 檢查」）。
--   profiles.ai_disclosure_accepted_at 由 accept_ai_disclosure() 寫入，
--   begin_group_ai_request 在它為 NULL 時以 45N09 拒絕。前端勾選不再是唯一防線：
--   任何人繞過 UI 直接構造請求，仍必須先有一次接受記錄。接受是**帳戶級、一次**，
--   不是每題一次；每題重新勾選仍然是前端行為（合約 §7 第 5 項）。
--
-- F-12 已定案為「兩者皆無並明寫接受」（Adam 2026-11-24，選項 c）：沒有群組級 AI
--   開關、沒有成員級退出。提問者一人同意即外送最多 4,000 字元的他人訊息與最多
--   10,000 字元的群組檔案文字，且保留為永久。這個事實必須出現在揭露文字裡，
--   而不是靠一個不存在的退出機制暗示可以撤回。
-- ---------------------------------------------------------------------------

begin;

-- ===========================================================================
-- Section 0 — fail-closed 目標斷言
-- ===========================================================================
-- 必須在本檔任何寫入之前、且在同一個 begin 之內。
--   45M01 marker 或該列不存在   → 這不是被驗證過的 CityLink Launch
--   45M02 marker 指向別的 ref   → 連線目標錯誤
--   45M03 ref 對但叢集不同      → restore／clone，不是同一實體
--   45M04 讀不到 pg_control_system() → 無法判定；unknown 一律不是通過
-- 看到任何一個請停止，不要修改本節讓它過。
select private.assert_citylink_target('pijslbchvstkoweslymr');

-- ===========================================================================
-- Section 1 — 兩張新表（只由 SECURITY DEFINER 函式寫，沒有任何表權限）
-- ===========================================================================
create table if not exists public.group_ai_context (
  group_id uuid primary key references public.study_groups (id) on delete cascade,
  context_starts_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_ai_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete restrict,
  asked_by uuid references public.profiles (id) on delete set null,
  idempotency_key uuid not null,
  question text not null check (char_length(btrim(question)) between 1 and 4000),
  -- 上限 2 個檔案寫成約束（Role 6 §1.3 備註）：只有 RPC 檢查的話，日後任何一條
  -- 直接 insert 的路徑都能塞進第三個檔案；建表時的 CHECK 不掃表，成本為零。
  file_ids uuid[] not null default '{}' check (coalesce(array_length(file_ids, 1), 0) <= 2),
  turns jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  error_code text,
  dropped_context boolean not null default false,
  truncated boolean not null default false,
  chat_chars integer not null default 0 check (chat_chars >= 0),
  file_chars integer not null default 0 check (file_chars >= 0),
  files_used integer not null default 0 check (files_used between 0 and 2),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  -- 冪等鍵不含 asked_by（F-2）：asked_by 是 on delete set null，而 unique 把 NULL
  -- 視為互不相同，profile 刪除後去重會悄悄失效。
  constraint group_ai_requests_idempotent unique (group_id, idempotency_key)
);

create index if not exists group_ai_requests_group_recent
  on public.group_ai_requests (group_id, created_at desc);
create index if not exists group_ai_requests_asked_by_recent
  on public.group_ai_requests (asked_by, created_at desc);

alter table public.group_ai_context enable row level security;
alter table public.group_ai_requests enable row level security;

-- 沒有 policy：這兩張表只由本檔的 definer 函式存取。
-- revoke 必須指名 service_role——Supabase 的 ALTER DEFAULT PRIVILEGES FOR ROLE
-- postgres 會把新物件自動授與 anon、authenticated 與 service_role（P1 preflight
-- 實測）。漏掉 service_role 就等於留下一條沒有人授權過、卻確實存在的路徑。
revoke all on table public.group_ai_context from public, anon, authenticated, service_role;
revoke all on table public.group_ai_requests from public, anon, authenticated, service_role;

-- F-1：這裡**沒有** grant ... to service_role。finish_group_ai_request 是
-- security definer、owner 為 postgres，它用 owner 的權限寫表，呼叫者只要 EXECUTE。
-- 給表權限等於允許繞過 RPC 直接寫 log：把列標成 ready、填上 finished_at，卻不插入
-- 對應的聊天訊息——log 說答過了，聊天室什麼都沒有，而沒有任何約束抓得到。

-- ===========================================================================
-- Section 2 — 帳戶級的揭露接受（Adam F-11）
-- ===========================================================================
-- profiles 是既有表；只加一個可為 NULL 的欄位，不动既有行為。沒有 backfill：
-- 沒读过揭露的人不應該被當成已同意。
alter table public.profiles
  add column if not exists ai_disclosure_accepted_at timestamptz;

create or replace function public.accept_ai_disclosure()
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

  update public.profiles p
    set ai_disclosure_accepted_at = now()
  where p.id = v_actor
  returning p.ai_disclosure_accepted_at into v_at;

  if v_at is null then
    raise exception 'group_ai_no_permission'
      using errcode = '45N01', detail = 'no profile row for the caller';
  end if;
  return v_at;
end;
$function$;

-- ===========================================================================
-- Section 3 — group_chat_messages 的三個新欄位與約束
-- ===========================================================================
-- 執行計畫（Role 6 N-4，已採納）：欄位與約束**分開下**，約束先 `not valid`，全部建好
--   後在第 3.1 節一次 `validate constraint`。理由：
--   * `add column ... not null default` 在 PG11+ 不重寫表格（只改目錄）。
--   * 同一語句裡附帶 `check` 會觸發全表掃描，且掃描是在 ACCESS EXCLUSIVE 下進行——
--     線上聊天表（group_files 已上線、聊天持續成長）會被完全擋住。
--   * `add constraint ... not valid` 只改目錄；`validate constraint` 只需要 SHARE
--     UPDATE EXCLUSIVE，寫入仍可進行。
--   * 本檔是單交易（begin／commit），所以鎖仍持有到 commit。要真正縮短鎖住時間，套用
--     者應把第 3.1 節拆成**第二次**部署（本節刻意把它獨立出來，就是為了可拆）。
--   * preflight 必須記錄實際數字而不是假設：行數、pg_total_relation_size、
--     `select max(txn_timeout)`／鎖等待。記錄進 DECISIONS.md 的套用條目。
alter table public.group_chat_messages
  add column if not exists author_kind text not null default 'member',
  add column if not exists ai_request_id uuid,
  add column if not exists truncated boolean not null default false;

do $kayk_ai_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_chat_messages_author_kind'
      and conrelid = 'public.group_chat_messages'::regclass
  ) then
    alter table public.group_chat_messages
      add constraint group_chat_messages_author_kind
      check (author_kind in ('member', 'ai')) not valid;
  end if;

  -- AI 沒有 profile，所以 sender_id 必為 NULL。這是把事實寫成約束，不是辨識 AI 的
  -- 方式：帳號刪除同樣會讓 sender_id 變 NULL，辨識只能靠 author_kind。
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_chat_messages_ai_has_no_sender'
      and conrelid = 'public.group_chat_messages'::regclass
  ) then
    alter table public.group_chat_messages
      add constraint group_chat_messages_ai_has_no_sender
      check (author_kind <> 'ai' or sender_id is null) not valid;
  end if;

  -- 這條只保證「AI 訊息一定叫這個名字」，不保證「叫這個名字的一定是 AI」。
  -- 成員可以把 display_name 設成 CityLink AI，因此前端一律以 author_kind 渲染（C-2）。
  -- 把產品文案硬編進 CHECK 的代價：日後改名要 drop／recreate 這個約束。
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_chat_messages_ai_name'
      and conrelid = 'public.group_chat_messages'::regclass
  ) then
    alter table public.group_chat_messages
      add constraint group_chat_messages_ai_name
      check (author_kind <> 'ai' or sender_name_snapshot = 'CityLink AI') not valid;
  end if;

  -- C-1：ai_request_id 不能只有註解。
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_chat_messages_ai_request_only_for_ai'
      and conrelid = 'public.group_chat_messages'::regclass
  ) then
    alter table public.group_chat_messages
      add constraint group_chat_messages_ai_request_only_for_ai
      check (author_kind = 'ai' or ai_request_id is null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'group_chat_messages_ai_request_fkey'
      and conrelid = 'public.group_chat_messages'::regclass
  ) then
    alter table public.group_chat_messages
      add constraint group_chat_messages_ai_request_fkey
      foreign key (ai_request_id)
      references public.group_ai_requests (id) on delete set null not valid;
  end if;
end
$kayk_ai_constraints$;

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

create or replace function public.finish_group_ai_request(
  p_request_id uuid,
  p_body text,
  p_truncated boolean default false,
  p_dropped_context boolean default false,
  p_chat_chars integer default 0,
  p_file_chars integer default 0,
  p_files_used integer default 0,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_message uuid;
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
        truncated = p_truncated,
        dropped_context = p_dropped_context,
        chat_chars = p_chat_chars,
        file_chars = p_file_chars,
        files_used = p_files_used,
        finished_at = now()
  where q.id = p_request_id
    and q.status in ('queued', 'processing')
  returning q.id into v_message;

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
         left(btrim(p_body), 4000), 'ai', q.id, p_truncated
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
