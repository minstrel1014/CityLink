-- CityLink — 群組 AI 對話：migration 提案 **部署 1 / 2**（草案，未套用）
--
-- 狀態：**提案，未套用**。未经 Role 6 對本 blob 的 exact-head 複查；任何真實資料庫都
--   沒有這些物件。套用需要 Adam 另行書面授權**並指名本檔與 DEPLOY2 兩份確切 blob**
--   （依 P1 先例與其 2026-11-25 規則）。
-- 設計依據：docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md。兩者不一致時，SQL 能表達的部分
--   以本檔為準，產品行為以合約為準。
-- 驗證方式：server/stage6AiChatMigrationApplies.test.ts 把**兩檔依序**套到一個可丟棄的
--   本地 PostgreSQL（不是任何 Supabase 專案），並跑權限、限流、冪等、狀態機與清空的
--   行為檢查；server/stage6AiChatSqlContract.test.ts 讀兩檔文字，釘住常數、授權形態，
--   並解析兩檔檔頭的 SQLSTATE 清單。
--
-- 為什麼是兩個檔案而不是兩個章節（Adam 對 Role 6 S-9 的裁決 (b)）：
--   Section 3 的 `alter table ... add column` 取 ACCESS EXCLUSIVE 並持有到 commit。若與
--   後面的驗證、函式建立同處一個交易，線上聊天室的寫入會被整段擋住，而 preflight 只能
--   估算掃描時間、不能保證它。拆點落在 Section 3 與 3.1 之間：本檔只做**建表、加欄位、
--   建立未驗證約束與同意欄位**；DEPLOY2 做驗證、索引、讀寫路徑與全部授權。
--   拆開的代價必須講明，不要假裝沒有：
--     * 兩次部署之間存在「欄位已在、約束未驗證、函式尚未建立」的中間態。它不會讓既有
--       寫入變壞——成員聊天走 send_group_chat_message，author_kind 用預設 'member'，
--       而唯一能寫 author_kind='ai' 的 finish 要到部署 2 才存在——所以中途失敗重跑是安全的。
--     * 只完成部署 1 等於 AI 功能**不存在**，不是半套上線：沒有讀取函式、沒有 request
--       寫入路徑，客戶端看不到任何新行為。兩檔必須都跑，才算這輪部署完成。
--     * 部署 2 若失敗，部署 1 不回滾（它已 commit）；處置方式是修好部署 2 再跑一次，
--       兩檔都用 create or replace／if not exists／DO 守衛，重跑不會 abort。
--   順序與窗口依 docs/team/DECISIONS.md 的「2026-11-25 — Group AI chat: the apply target,
--   the transfer method, the five gates and the window」：第 3–5 關同一窗口、不在 demo 或
--   live QA 前夕、加欄位那段排在離峰（它會鎖聊天表）。
--
-- 本輪依 Adam 2026-11-25 裁決改動的內容（Role 6 的條件項）：
--   S-1 (a)  finish_group_ai_request 的記錄參數預設改為 null，並以 coalesce 保留 begin 已
--            算出的 chat_chars／dropped_context／files_used ⇒ 只呼叫 finish(id, body) 不再
--            把那些值歸零。
--   S-2 (b)  新增 public.get_group_ai_request_status(uuid)：揭露（檔案未能擷取）的送達路徑。
--   S-3      accept_ai_disclosure() 只在欄位仍是 NULL 時寫入，之後回傳既有值 ⇒ 這一欄重新
--            具備「何時第一次接受」的證據語意（F-11）。
--   S-4      檔頭 SQLSTATE 清單補 45N11，並由測試解析這份清單，而不是只查字串存在。
--   S-9 (b)  拆成兩次部署，本檔是第 1 次（建表、加欄位、未驗證約束）；第 2 次重跑斷言。
--   S-10     error_code 加 CHECK，只准合約 §9 的兩個值（本檔是唯一寫入這張表的建表處）。
--   S-5／S-6／S-7／S-8 的改動都落在部署 2（限流口徑、context 迴圈、字面值釘選、truncated），
--            本檔不受影響；這裡列出是為了讓人知道**兩檔都要跑**才算這輪改完。
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
-- 正確執行方式（兩檔相同）：用**保留空行與格式**的檔案傳輸，不要在對話裡人工貼上——
--   P1 曾因貼上吃掉空行，使兩個函式的 prosrc 與授權檔不符，事後要補 create or replace。
--     psql "$LAUNCH_URI" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f \
--        docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql
--   本檔（部署 1）回傳成功後才輪到 DEPLOY2；套用後照 Adam 規則逐函式比對 md5(prosrc) 並貼出
--   結果，再把同一份 bytes 复制為 supabase/migrations/<timestamp>_kayk_ai_chat*.sql
--   並補一列 ledger（比照 P1 的 20261124064100：只指向檔案）。**先套用、後 promote**。
--
-- 依賴（必須已存在；本檔不建立、不修改、不刪除它們）：
--   * private.citylink_target 與 private.assert_citylink_target(text)
--     —— 2026-11-24 經核准的 P1 套用建立，pin 了 Launch 的 system_identifier。
--   * public.group_chat_messages / public.study_groups / public.profiles
--     / public.group_files（P1）
--   * private.can_send_group_chat(uuid) / private.can_read_group_chat(uuid)
--     —— supabase/migrations/20261118050000_stage6_chat_recruitment.sql
--   * 本檔不依賴部署 2 的任何物件：順序只能是 1 → 2。反向執行時 DEPLOY2 會在 Section 3.1
--     找不到約束（刻意不報錯的那段）並在引用 group_ai_requests 時失敗。
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

--   本檔（部署 1）本體只會 raise 45N01；其餘碼由部署 2 觸發。清單寫兩份是為了讓每一檔
--   都能獨立讀懂，測試比的是**兩檔聲明的聯集**與**兩檔實際 raise 的聯集**相同。

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
  -- S-10（Role 6 建議加 CHECK）：合約 §9 只定義 provider_timeout／provider_failed 兩個值，
  -- 自由文字會讓 log 的聚合口徑跟著寫入者漂移。建表時的 CHECK 不掃表、建立即驗證，所以放在
  -- 部署 1 而不是部署 2。要新增錯誤碼時，改這裡、改合約 §9、改檔頭 SQLSTATE 表，三處一起。
  error_code text
    check (error_code is null
      or error_code in ('provider_timeout', 'provider_failed')),
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

  -- S-3（Adam 2026-11-25 核准）：只寫第一次。原本這裡無條件覆寫，等於把「何時開始接受」
  --   改成「最後一次點勾」，F-11 要的證據語意就沒了。合約 §7 第 5 項要求每題重新勾選，所以
  --   「每次呼叫」是預期的接法，更不能讓它動時間戳。
  update public.profiles p
    set ai_disclosure_accepted_at = now()
  where p.id = v_actor
    and p.ai_disclosure_accepted_at is null
  returning p.ai_disclosure_accepted_at into v_at;

  if v_at is null then
    -- 已記過：回傳既有值，不覆寫；或根本沒有 profile 列 → 下面區分。
    select p.ai_disclosure_accepted_at into v_at
    from public.profiles p where p.id = v_actor;
  end if;

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
--   * 拆點就在這裡：第 3.1 節屬於**部署 2**（docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_
--     DEPLOY2.sql），依 Adam 2026-11-25 對 S-9 的裁決 (b)。本檔的 commit 一落地，上面那
--     個 ACCESS EXCLUSIVE 就釋放；部署 2 的驗證只需要 SHARE UPDATE EXCLUSIVE，寫入仍可進行。
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

-- ACL（S-9 拆點的直接結果）：本檔建立的函式必须在本檔內完成撤與授，
--   不能等部署 2，否則兩次部署之間它會帶著 Postgres 預設的 PUBLIC EXECUTE 存在。
revoke all on function public.accept_ai_disclosure()
  from public, anon, authenticated, service_role;

grant execute on function public.accept_ai_disclosure() to authenticated;

commit;
