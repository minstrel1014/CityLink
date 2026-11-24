# 群組 AI 對話：技術合約草案（2026-11-24 設計變更後）

- **日期：** 2026-11-24（Role 6 審查後修訂，見第 11 節）
- **分支：** `feature/kayk-ai-analysis`
- **狀態：** 草案。**未套用、不構成實作、migration、signed-in QA、merge、部署或發布授權。** Role 6 已做過三輪唯讀審查（完整 blob OID 與 sha256 見 §11）：第一輪 `73c9297732a4ceb87a3c2f6893aa10c734148be5`、第二輪 `bdb31785989507f593120d61bbffa21df68b1bf6`、第三輪 `aa93a5f543efea4b8add0bd65e8482b0a7b8d566`（commit `352e88b`）。B-1、B-2、C-3、C-4、F-11、F-12 已由 Adam 於 2026-11-24 裁決（§11）。
- **SQL 提案已寫出（未套用）：** `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql`。本節與第 2 節是該檔的設計說明；兩者若有出入，**以 SQL 檔為準**，並在本輪的 blob-level exact-head 審查中提出。
- **取代：** `KAYK_AI_PLANS_JOBS_CONTRACT_DELTA.md`（共用分析計畫，已因設計變更作廢）。舊檔保留作歷史，不刪除。
- **上層文件：** `KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md` 第 2、6、9、11、12 章仍然有效；第 3、4 章關於 `group_analysis_plans` 的部分作廢。

## 0. 這次改什麼

AI 由「每組一份共用分析計畫」改為「聊天室內的共用 AI 對話」：AI 不是真成員，只是像成員一樣參與；回答寫進群組聊天室，全組共用一條對話，每個群組聊天室是獨立 session。

`public.group_analysis_plans` 與 `public.group_analysis_jobs` **已套用於 Launch**。依 Adam 的指示，兩張表**不刪除、不改動**，只標記停用：不再有任何 RPC 讀寫，也不作為 AI 對話的儲存位置。

## 1. Schema 提案（未套用）

以下全部只是提案，需另開 migration、經 Role 6 exact-head 審查、再由 Adam 指名授權才可套用。

### 1.1 `public.group_chat_messages` 三個新欄位

```sql
-- 欄位與約束分開下（Role 6 N-4，已採納）
alter table public.group_chat_messages
  add column if not exists author_kind text not null default 'member',
  add column if not exists ai_request_id uuid,
  add column if not exists truncated boolean not null default false;

-- 五條約束各自 `add constraint … not valid`：只改目錄，不掃表。
--   group_chat_messages_author_kind             check (author_kind in ('member', 'ai'))
--   group_chat_messages_ai_has_no_sender        check (author_kind <> 'ai' or sender_id is null)
--   group_chat_messages_ai_name                 check (author_kind <> 'ai' or sender_name_snapshot = 'CityLink AI')
--   group_chat_messages_ai_request_only_for_ai  check (author_kind = 'ai' or ai_request_id is null)
--   group_chat_messages_ai_request_fkey         foreign key (ai_request_id)
--                                               references public.group_ai_requests (id) on delete set null

-- 之後逐條 `validate constraint`（SQL §3.1，刻意獨立成段，可拆成第二次部署）
create index if not exists group_chat_messages_ai_request
  on public.group_chat_messages (ai_request_id)
  where ai_request_id is not null;
```

**為什麼要拆（Role 6 N-4）。** `add column` 與 `check` 寫在同一條 `alter table` 裡，PostgreSQL 會在 **ACCESS EXCLUSIVE** 下全表掃描 `group_chat_messages`——那是一張 live 表（檔案功能已上線、聊天持續成長），掃描期間整個群組聊天室連讀取都被擋住。拆開之後：加欄位（PG11+ 的 `not null default` 不重寫表格）與 `add constraint … not valid` 只動目錄；`validate constraint` 只需 **SHARE UPDATE EXCLUSIVE**，寫入仍可進行。本檔是單交易（`begin`／`commit`），鎖仍持有到 commit，所以**要真正縮短鎖住時間，套用者應把 §3.1 拆成第二次部署**——這一節刻意把它獨立出來就是為了可拆。preflight 必須記錄實際數字（行數、`pg_total_relation_size`、鎖等待），而不是假設「應該很快」。**未套用前無法給出這些數字，本檔也沒有給。**

**索引（Role 6 N-5）。** `finish_group_ai_request` 的冪等路徑要能以 `ai_request_id` 找到既有訊息，沒索引就是掃表；因此加 **partial index**（`where ai_request_id is not null`）——一般成員訊息永遠是 NULL，全值索引只是在長尾巴。

**為什麼一定要 `author_kind`。** `sender_id` 在帳號刪除時因 `ON DELETE SET NULL` 變成 NULL，所以「`sender_id is null`」同時代表「AI」與「已刪除帳號」。單靠 NULL 無法區分，前端會把已刪除帳號的舊訊息標成 CityLink AI，等於替產品說出它沒說過的話。`author_kind` 讓兩者分開，而 `group_chat_messages_ai_has_no_sender` 只是把「AI 沒有 profile」寫成約束，不是用來辨識 AI。

**`ai_request_id` 的約束（Role 6 C-1）。** 上一版只在註解寫「只對 AI 有值」，那不是約束。現在有兩道：外鍵指向 `group_ai_requests`（`on delete set null`，避免刪 log 時連帶刪訊息），以及 `group_chat_messages_ai_request_only_for_ai` 擋掉「member 訊息帶 `ai_request_id`」。AI 訊息帶 NULL 仍可能，代表「這則 AI 回答找不到對應 request」——那是資料修復情境，不是常態，不另加 NOT NULL 約束，否則匯入歷史資料會卡住。

**名字不是身分（Role 6 C-2）。** `group_chat_messages_ai_name` 只保證「AI 訊息一定叫這個名字」，**不保證「叫這個名字的一定是 AI」**：現行發送 RPC 會把 `profiles.display_name` 複製成 `sender_name_snapshot`，任何把 display name 設成 `CityLink AI` 的成員，其訊息在只看名字的 UI 上就是一條 AI 訊息。約束無法從根本解決（那會變成全域限制 display name）。**因此前端一律以 `author_kind` 決定渲染，永不憑 `sender_name_snapshot` 判斷是否為 AI**，並列為 P2 驗收項。這也是 `author_kind` 存在的第二個理由。

把產品文案硬編進 CHECK，表示日後改名必須 drop/recreate 約束——可接受，記錄於此。

### 1.2 `public.group_ai_context`（每組一列）

```sql
create table public.group_ai_context (
  group_id uuid primary key references public.study_groups (id) on delete cascade,
  context_starts_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.group_ai_context enable row level security;
revoke all on table public.group_ai_context from public, anon, authenticated;
revoke all on table public.group_ai_context from service_role;
```

**清空 context 只移動 `context_starts_at`，不刪除任何訊息。** 任何成員都可以執行，包含剛加入的成員；這一條是產品行為，不是權限細節。

**那一列從哪來（Role 6 N-1）。** 上一版只有 `clear_group_ai_context` 的 `update`，但沒有任何地方**插入**這列——從未被清空的群組就沒有列，`update` 影響 0 列，靜靜失敗。SQL 採兩個做法並用：`clear_group_ai_context` 改用 `insert … on conflict (group_id) do update`（第一次清空就建立該列，並記 `updated_by`），`begin_group_ai_request` 則以 `coalesce((select context_starts_at …), to_timestamp(0))` 取 context 下界——**沒有列等於「從頭就有 context」**，這是產品語意而不是補救預設值。apply 測試實測：從未清空的群組確實無該列，且 `begin` 仍正常運作。

**這是共享狀態的破壞性操作（Role 6 C-3）。** 新加入者可以反覆清空，讓 AI 對話對所有人失去上下文，成本為零；`updated_by`／`updated_at` 只保留最後一次，沒有歷史。三種緩解（伺服器端頻率限制、append-only 稽核、限定 leader）都會改變產品行為，**Adam 於 2026-11-24 確認維持原設計**：任何成員可清空，不加頻率限制、不加稽核。文件明寫：這是任何成員都可反覆觸發的共享重置。

### 1.3 `public.group_ai_requests`（提問與 log）

```sql
create table public.group_ai_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete restrict,
  asked_by uuid references public.profiles (id) on delete set null,
  idempotency_key uuid not null,
  question text not null check (char_length(btrim(question)) between 1 and 4000),
  file_ids uuid[] not null default '{}'
    check (coalesce(array_length(file_ids, 1), 0) <= 2),
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
  constraint group_ai_requests_idempotent unique (group_id, idempotency_key)
);
create index group_ai_requests_group_recent
  on public.group_ai_requests (group_id, created_at desc);
create index group_ai_requests_asked_by_recent
  on public.group_ai_requests (asked_by, created_at desc);
alter table public.group_ai_requests enable row level security;
revoke all on table public.group_ai_requests from public, anon, authenticated;
revoke all on table public.group_ai_requests from service_role;
```

這張表是「同時記一筆 log」的落點：截斷、丟棄 context、用了幾個檔案與多少字元，都留在這裡，而不是只寫進伺服器日誌。`ai_request_id` 由訊息指向它，於是「這則回答為什麼被截斷」可以事後回答。

**`turns` 與 `files` 是實際欄位（本版更正）。** 前兩版只在 `begin` 的回傳型別裡出現這兩個名字，表上沒有對應欄位，於是「重放」只能重新組裝——而聊天在長大，重放就會拿到**不同的** context。SQL 現在把組裝好的 context snapshot （`turns jsonb`、`files jsonb`，含每則訊息的 author/字元數）與排序後的 `file_ids` 一起插入該列，冪等重放回傳的是**存進去的同一份 snapshot**，逐字不變。代價寫清楚：context 文字存在這张表裡，與 `group_chat_messages.body` 有重複；這是 log 表的既定用途（§1.3 標題），保留期同 §5（永久）。`file_ids` 的陣列長度另有 CHECK ≤ 2（Role 6 §1.3 備註：只靠 RPC 與 UI 驗，日後任何直接 insert 的路徑就能塞第三個檔案）。

**表權限全部收回，包含 `service_role`（Role 6 F-1）。** 上一版給 `service_role` `select, insert, update`，理由是「否則 log 永遠停在 `queued`」。那個理由對，但解法錯：`finish_group_ai_request` 是 `security definer`、owner 是 `postgres`，函式內部用的是 **owner 的權限**，呼叫者只需要 `EXECUTE`。多給表權限等於讓伺服器可以**繞過 RPC 直接寫**，而 B-1 要建立的性質正是「AI 寫入只有一個閘門」：直接寫可以把 request 標成 `ready`、填上 `finished_at`，**卻不插入對應的聊天訊息**——log 說答過了，聊天室裡什麼都沒有，沒有任何約束抓得到這種不一致。同一份設計裡 §1.2 對 `group_ai_context` revoke `service_role`、這裡卻 grant，本身就是訊號。**兩張表都只由 definer RPC 寫，兩張都不給表權限。**

**冪等要比對內容，不能只比 key（Role 6 F-2）。** 只靠「同 key 回傳既有列」，客戶端用同一把 key 問不同問題時會拿到舊的 `question`／`turns`／`files`，伺服器照舊 context 回答，使用者卻以為在問新問題——冪等就變成釘選舊答案。因此 `begin_group_ai_request` 在遇到既有 key 時**比對 `question` 與排序後的 `file_ids`**：相同才回傳既有列（`turns`／`files` 取自該列的 snapshot，不是重新組裝），不同則拋 `group_ai_idempotency_conflict`（45N07），要求換一把 key。比對用的是**排序後**的 `file_ids`（同一組檔案換順序不算不同請求），儲存也存排序後的結果——兩邊不一致的話重試就永遠對不上。

**unique 不含 `asked_by`（同一項）。** `asked_by` 是 `on delete set null`，而 unique 約束把 NULL 視為互不相同，profile 刪除後去重會悄悄失效。改為 `unique (group_id, idempotency_key)`：key 是客戶端每問一次產生一把的 UUID，群組內唯一已足夠，且不依賴一個會變成 NULL 的欄位。

**狀態機：`queued → processing → ready|failed`（Role 6 F-3）。** 上一版 `processing` 是不可達的枚举值，且 `finish` 可被重複呼叫——逾時重試會插入**兩則** CityLink AI 訊息回答同一個問題。現在：

- `claim_group_ai_request`（僅 `service_role`）以 `update ... set status='processing', claimed_at=now() where id = $1 and status = 'queued' returning id` 宣告接手；回傳 false 表示別人已接手或已完成，伺服器就不呼叫 provider。這讓「有沒有伺服器在做」變成可觀測的事實，而不是猜測。
- `finish_group_ai_request` 只從非終止狀態轉換：`update ... where id = $1 and status in ('queued','processing') returning id`。若更新不到任何列，代表已 `ready`／`failed`，此時**回傳既有 `message_id`**（以 `ai_request_id` 查），不插入第二則訊息。重試因此安全。
- 停在同一狀態超過 120 秒的 `processing` 由限流視為死亡（見 §2.1），可被重新接手。

**cascade 語意對齊（Role 6 C-8）。** 上一版 `group_id` 用 `on delete cascade`，但 `group_chat_messages.group_id` 是 `on delete restrict`；有聊天訊息的群組本來就刪不掉，cascade 永遠不會單獨觸發，卻讓兩張相關表語意相反。現改為 `restrict` 對齊。

## 2. RPC 提案（未建立）

**上一版的矛盾（Role 6 B-1）。** 文件同時說「provider 在資料庫外，伺服器把結果寫回」、「`ask_group_ai` 寫入 `author_kind='ai'` 的訊息並回傳 `body`」、「只 `grant execute to authenticated`」。三者不能同時成立：若 authenticated 能呼叫一個會寫 AI 訊息的 RPC，**任何登入者都能在自己加入的群組裡製造「CityLink AI」說的話**——`group_chat_messages` 對 `authenticated` 是 `REVOKE ALL` 且零 policy，RPC 授權就是唯一閘門。

**改為三段，寫回只在 `service_role`。**

| 函式                                            | 執行身分              | 輸入                                                                                                                                                      | 回傳                                                                                                                                                                                                                                                                                                                             | 行為                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `begin_group_ai_request`                        | `authenticated`       | `p_group_id uuid, p_question text, p_file_ids uuid[], p_idempotency_key uuid`                                                                             | `request_id uuid, question text, turns jsonb, files jsonb, dropped_context boolean`                                                                                                                                                                                                                                              | 驗證提問者是 `active` 成員且群組未 `abandoned`；驗證每個 `p_file_ids` 屬於本群組、`status='current'`、`retention_expires_at > now()`、最多 2 個；先做限流檢查（§2.1）；依第 3 節規則組 context；插入 `group_ai_requests`（`status='queued'`）。同 key 且內容相同回傳既有列，內容不同拋 `group_ai_idempotency_conflict`。**不寫訊息、不回傳 body。**                                                                                                                                                                                                                                                                                                                                                    |
| `claim_group_ai_request`                        | **僅 `service_role`** | `p_request_id uuid`                                                                                                                                       | `claimed boolean`                                                                                                                                                                                                                                                                                                                | `queued → processing`；更新不到列即 false。伺服器據此決定是否呼叫 provider，避免重複派工。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `finish_group_ai_request`                       | **僅 `service_role`** | `p_request_id uuid, p_body text, p_truncated boolean, p_dropped_context boolean, p_chat_chars int, p_file_chars int, p_files_used int, p_error_code text` | `message_id uuid`                                                                                                                                                                                                                                                                                                                | 只在 `queued`／`processing` 時轉換為 `ready`／`failed` 並填 `finished_at`；成功時插入 `group_chat_messages`（`author_kind='ai'`、`sender_id=null`、`sender_name_snapshot='CityLink AI'`、`ai_request_id`、`truncated`）。已是終止狀態則回傳既有 `message_id`，不插第二則。**S-1（Adam 2026-11-25 選項 a）：** `p_truncated`／`p_dropped_context`／`p_chat_chars`／`p_file_chars`／`p_files_used` 的預設由 `false`／`0` 改為 `null`，update 以 `coalesce(p_x, 舊值)` 覆寫 ⇒ 省略參數的語意從「歸零」變成「沿用 `begin` 已算出的值」；明確傳入的值照舊取勝（apply 測試两种都有實測）。插入 AI 訊息時用的也是解析後的值，所以 `group_chat_messages.truncated` 與 `group_ai_requests.truncated` 不會分岔。 |
| `clear_group_ai_context`                        | `authenticated`       | `p_group_id uuid`                                                                                                                                         | `context_starts_at timestamptz`                                                                                                                                                                                                                                                                                                  | 任何成員可執行；只 `update ... set context_starts_at = now()`，不動任何訊息。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `get_group_ai_request_status`（新，S-2 選項 b） | `authenticated`       | `p_request_id uuid`                                                                                                                                       | 只回傳狀態與計數： `status`、`asked_at`、`finished_at`、`message_id`、`error_code`、`dropped_context`、`truncated`、`files_requested`、`files_used`、`chat_chars`、`file_chars`。**不含 question、turns 或檔名**，所以它是揭露信道而不是內容信道。 判據：`files_used < files_requested` ⇒ 至少一個選取的檔案沒被讀到（§6 F-8）。 | 讀取範圍沿用 `private.can_read_group_chat`（前成員仍可讀，與 AI 回答的保留規則一致）；request id 不存在、或呼叫者讀不到該群組時**回傳 0 列而不是報錯**，避免洩漏「這個 request 存在於你看不到的群組」。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `list_group_chat_messages_ai`（新）             | `authenticated`       | 與 `list_group_chat_messages` 相同簽章                                                                                                                    | 既有四個欄位 + `author_kind text, truncated boolean`                                                                                                                                                                                                                                                                             | 委派給共用的 private helper，見下。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**逐支函式的授權（Role 6 R-2 要求，取代上一版那一句摘要）。** 上一版只對 `begin`／`clear`／`list_group_chat_messages_ai` 寫了 revoke，`claim` 與 `finish` 完全沒有——而 PostgreSQL 對新函式預設授與 **PUBLIC** `EXECUTE`，`authenticated` 是 PUBLIC 的成員。照那段字面寫出來的 migration 會讓**任何登入者**直接呼叫 `finish_group_ai_request`，自己插入一條 `author_kind='ai'`、署名 CityLink AI 的訊息，正好把 Adam 批准 B-1 時要建立的性質（AI 寫入只有一個閘門）重新打開。同一版也沒寫 `claim`／`finish` 是 `security definer`：表權限已全數 revoke，security invoker 版本在 `update`／`insert` 時會 permission denied，照文件寫不出能動的 SQL。因此本節改成逐支列出，且 SQL §8 一律「先 revoke 全部（指名 `public, anon, authenticated, service_role`）再 grant」：

| 函式（簽章）                                                                             | 執行身分           | `set search_path = ''` | revoke 對象                                 | grant `EXECUTE` 給    | actor 來源                           |
| ---------------------------------------------------------------------------------------- | ------------------ | ---------------------- | ------------------------------------------- | --------------------- | ------------------------------------ |
| `private.list_group_chat_messages_page(uuid,timestamptz,uuid,integer)`                   | `security definer` | 是                     | `public, anon, authenticated, service_role` | **無人**              | 內部委派，不對外                     |
| `public.list_group_chat_messages_ai(uuid,timestamptz,uuid,integer)`                      | `security definer` | 是                     | 同上                                        | `authenticated`       | `auth.uid()`                         |
| `public.begin_group_ai_request(uuid,text,uuid[],uuid)`                                   | `security definer` | 是                     | 同上                                        | `authenticated`       | `auth.uid()`                         |
| `public.clear_group_ai_context(uuid)`                                                    | `security definer` | 是                     | 同上                                        | `authenticated`       | `auth.uid()`                         |
| `public.accept_ai_disclosure()`                                                          | `security definer` | 是                     | 同上                                        | `authenticated`       | `auth.uid()`                         |
| `public.get_group_ai_request_status(uuid)`                                               | `security definer` | 是                     | 同上                                        | `authenticated`       | `auth.uid()` + `can_read_group_chat` |
| `public.finish_group_ai_request(uuid,text,boolean,boolean,integer,integer,integer,text)` | `security definer` | 是                     | 同上                                        | **僅 `service_role`** | 不看 `auth.uid()`（F-4）             |

三個重點：(1) **revoke 一定指名 `service_role`**——Supabase 的 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` 會把新物件自動授與 `anon`／`authenticated`／`service_role`（P1 preflight 實測過預設權限的存在），只寫 `from public, anon` 等於留下一條沒有人授權過卻確實存在的路徑；(2) 表（`group_ai_context`／`group_ai_requests`）**不授任何權限給任何角色**，寫入只透過上表的 definer 函式；(3) `private` 那支 helper 不給任何人 `EXECUTE`，只由兩支 public definer 函式委派。**apply 測試實測**：`set role authenticated` 呼叫 `claim`／`finish` 得到 `permission denied`，`set role service_role` 能 claim+finish 但對兩張表仍是 permission denied。

**`finish` 不看 `auth.uid()`（Role 6 F-4）。** `service_role` 呼叫時 `auth.uid()` 是 NULL；若照「actor 取自 `auth.uid()`」的字面在 `finish` 裡加一句 actor 檢查，這支 RPC 會永遠失敗。它的授權依據是**request 列的存在與狀態**，加上 `EXECUTE` 只給 `service_role`；不查提問者身分，也不比對任何使用者。

**讀取為什麼是新函式而不是改舊的（Role 6 B-2，Adam 2026-11-24 批准）。** `list_group_chat_messages` 的實際簽章是 `RETURNS TABLE (message_id uuid, sender_name text, body text, created_at timestamptz)`；PostgreSQL **不允許** `CREATE OR REPLACE` 改回傳型別，加兩個欄位必須 `DROP FUNCTION` 再 `CREATE`。那會一併移除授權（現行 revoke/grant 在 migration 第 942、952 行），漏補就是整個聊天室對所有客戶端壞掉；`DROP` 在有依賴物件時也會失敗。因此沿用本專案已核准的 `_capacity` 模式：**新增 `list_group_chat_messages_ai`，舊的 `list_group_chat_messages` 一字不動**。

**兩個讀取函式共用一份實作（Role 6 F-5）。** 現行函式內部有兩條驗證（兩個 cursor 欄位必須一起給、`p_limit` 限 1–100）與一段讀取 predicate。若新函式重抄一次，改一邊忘另一邊是必然的漂移。因此把驗證與 predicate 抽成 `private.list_group_chat_messages_page(p_group_id, p_before_created_at, p_before_id, p_limit)`，兩個 `public` 函式都只做欄位投影與授權，再委派給它。另：新增函式後需要 PostgREST schema cache 重新載入（`notify pgrst, 'reload schema'` 或重啟），這是部署步驟，不是 SQL 正確性問題。

**舊讀取路徑的過渡風險要寫成驗收條件（Role 6 F-6）。** 仍走舊函式的客戶端拿不到 `author_kind`，會把 AI 回答顯示成一般成員訊息。若這狀態變成常態，§7 第 3 項「回答會以 CityLink AI 名義寫進聊天室」對那些客戶端就不成立。**P2 驗收項：AI 回答正式上線前，所有讀取聊天室的介面都必須改用 `_ai` 版本**；舊函式只為未更新的舊客戶端保留。

**provider 呼叫不在資料庫內。** `begin_group_ai_request` 只做權限、資格、context 組裝與排隊；伺服器（Edge Function 或 Express，形狀已是 `server/ai/chat/answerQuestion.ts`）先 `claim`、呼叫 OpenRouter／DeepSeek、再以 `service_role` 呼叫 `finish_group_ai_request` 寫回。資料庫不持有 key。

**trigger 現況。** `group_chat_messages` 上沒有任何 trigger（該 migration 的三個 trigger 全在 `group_recruitment_posts`），所以插入 AI 列不會被成員資格 trigger 擋下。這一點 Role 6 要求寫進契約，已記錄。

### 2.1 限流：在 RPC 內、交易式（Adam 2026-11-24 決定）

在 `begin_group_ai_request` 寫入 request 列**之前**，於同一個交易內數三件事，任一超限即 `raise exception` 帶 `group_ai_rate_limited` 與 `retry_after`（秒）：

| 檢查               | 上限                        | 拒絕原因      |
| ------------------ | --------------------------- | ------------- |
| 本群組今日提問數   | 20（UTC 日界）              | `group_daily` |
| 本成員今日提問數   | 10（跨所有群組，UTC 日界）  | `user_daily`  |
| 本群組進行中請求數 | 1（`queued`／`processing`） | `in_flight`   |

**為什麼一定要在 RPC 內。** 前端再怎麼改都還是要經過這支函式，所以這是唯一無法繞過的位置；也不需要新服務。數字放在 `shared/aiRateLimit.ts`，SQL 與客戶端共用同一組常數，避免兩邊各自維護。

**併發必須加鎖。** 「先數再寫」在兩個並行呼叫下會同時通過——兩邊都數到 19，然後都插入。因此 `begin_group_ai_request` 在計數前先取 `pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0))`，交易結束自動釋放。沒有這把鎖，「交易式檢查」只是看起來安全。

**in-flight 不會被殭屍請求卡住。** `queued`／`processing` 超過 120 秒視為死亡、不計入 in-flight，否則伺服器一崩，該群組就卡到隔天。`retry_after` 對 `in_flight` 是「等這次跑完」的估計值（例如 15 秒），對每日上限則是到下一個 UTC 零時的秒數，且永不小於 1——不讓 UI 說出「0 秒後重試」。

**這是成本控制，不是安全邊界。** 20／10／1 是產品選擇，可由 Adam 隨時調整；真正的安全邊界仍是 `finish_group_ai_request` 只給 `service_role`。

**§2.1 的四個實作決定（Role 6 R-1 要求的 G-1／G-2／G-3／G-5，本輪定案）。**

- **G-1（常數怎麼「共用」）：採字面重複 + 釘住測試。** 上一版寫「數字放在 `shared/aiRateLimit.ts`，SQL 與客戶端共用同一組常數」——這句話做不到：migration 是 checked-in 的靜態 SQL，不會去 import TypeScript 常數。三個可行做法（build 期產生 SQL、把數字放設定表、SQL 寫字面值再加一支比對測試）裡採第三個：SQL 直接寫 `20`／`10`／`1`／`120`，由 `server/stage6AiChatSqlContract.test.ts` 逐字比對 `shared/aiRateLimit.ts` 的 `AI_RATE_LIMITS` 與 SQL 中的字面值，任一邊改動另一邊不變就紅。代價如實記錄：這仍是**兩份**數字，測試只能保證一致、不能讓 SQL 動態讀取設定；改數字要同時改兩處並重跑測試。
- **G-2（跨群組的 `user_daily`）：兩把鎖，固定順序 群組 → 成員。** 只有群組鎖時，同一個人同時在兩個群組提問會各自數到自己的群組、同時通過（兩邊都數到 9）。因此 `begin_group_ai_request` 依序取 `pg_advisory_xact_lock(hashtextextended('group:' || p_group_id::text, 0))` 再取 `pg_advisory_xact_lock(hashtextextended('user:' || v_actor::text, 0))`；順序固定，避免兩邊交叉死鎖（A 拿群組等成員、B 拿成員等群組）。鎖都是 transaction 級，交易結束自動釋放，不需要解鎖路徑。key 加 `'group:'`／`'user:'` 前綴，是為了不讓某個 uuid 的雜湊剛好撞上另一個空間的鍵。**代價：** 同一位成員在**不同**群組的並行提問會被序列化，這是精確計數的必要條件；`shared/aiRateLimit.ts` 的文件同步寫明「近似值」的說法已失效。
- **G-3（每日計數的口徑）：沒被接手過的 `queued` 不計入配額。** 「數今天所有列」會讓 provider 故障日悄悄燒光配額——列寫進去了但從沒跑，使用者什麼都沒得到，卻要等到隔天。計數因此排除 `status = 'queued' and claimed_at is null`，計入 `processing`／`ready`／`failed`（已接手即已花費），而 in-flight 仍是未過期的 `queued`／`processing`。apply 測試實測：五條永遠沒被 claim 的 `queued` 不會把該群組推到 45N06。
  **S-5（Adam 2026-11-25 第二批裁決）：** SQL 原本寫的是**另一句話**（計入 `processing`／`ready`／`failed`，或 `created_at > now() - 120s` 的列），兩者只在「120 秒內、尚未被 claim 的 queued」上有差（Role 6 S-5）。本輪把**程式對齊到這段決定**而不是相反：每日計數現在逐字是本節的說法——今天的列計入，唯獨 `status = 'queued' and claimed_at is null` 除外。`v_stale` 因此只剩 in-flight 一個用途，由靜態測試釘住（`now() - v_stale` 在兩檔本體中恰好出現一次）。新的 apply 測試實測：十條「現在寫入、從未 claim」的 queued 不再吃掉該成員的每日配額，而把它們 `claimed_at` 填上之後同一批又開始計數。
- **G-5（時間源）：全用交易開始的單一 `now()`。** 殭屍判定（`claimed_at < now() - interval '120 seconds'`）與 `retry_after` 的算式必須同源，否則同一次呼叫裡兩次 `now()` 就能算出「還有 -3 秒」之類的矛盾值。SQL 把 `now()` 取一次存進區域變數，所有比較與減法都用它；`retry_after` 以 `greatest(1, …)` 下限包住，且 `in_flight` 給 15 秒估計值、每日上限給到下一個 UTC 零時的秒數。
- **G-4（`claim` 是否需要）** 已隨 F-3 的 `claim_group_ai_request` 實作結案。

## 3. Context 預算與規則（產品行為，已定案）

| 項目            | 值                                      |
| --------------- | --------------------------------------- |
| 聊天記錄預算    | 4,000 字元                              |
| 檔案文字合計    | 10,000 字元                             |
| 檔案數量        | 一次最多 2 個                           |
| AI 回答納入數量 | 最多 2 則（最近的）                     |
| 單位            | 字元，不是英文單詞；CJK 與 emoji 各計 1 |

規則，依優先順序：

1. **本次提問永遠保留**，不計入 4,000 的聊天預算。
2. **最多 2 則最近的 AI 回答**，超出時從最舊的丟。
3. **剩餘額度才給成員聊天**，取最近的部分。
4. **任何一項被丟掉時**，回答開頭加「（本次未包含較早的對話）」。
   **「取最近的部分」到底怎麼取（Adam 2026-11-25 第二批裁決，S-6 採 Role 6 建議）。** 規則 2 與 3 在 SQL 裡是**嚴格前綴**：由最新往舊掃，遇到第一則裝不下的訊息就停止，不會跳過它再回頭撿更舊的小訊息。理由綁在規則 4——若允許跳過去撿更舊的，留下的是**中間有空洞**的視窗，而提示說的是「未包含較早的對話」，這句話的方向就錯了（Role 6 S-6 原話）。
   **兩個掃描上限不是產品規則。** SQL 掃 AI 回答 10 則、成員訊息 200 則，純粹為了不要在 live 表上無限回溯；命中 200 那個上限時 `dropped_context` 一樣設為 true，因為比第 200 則更舊的訊息從未檢視過（第二審查者 item 1 的兩個修法裡，採「設旗標」而非「拿掉上限」）。**已知差異：** `shared/aiChatContext.ts` 是純函式，它拿到的是呼叫端給的陣列，因此**沒有**這個掃描上限 —
   mock 與 live 在這一條上不同，屬**未裁決**的開放項，不是本版的隱瞞。

**計數方式（Role 6 C-5）。** 「CJK 與 emoji 各計 1」不能靠 JS 的 `String.length`——emoji 是 surrogate pair，`.length` 會算成 2。實作以 `Array.from(text).length`（codepoint）計數，測試以 CJK 與 emoji 覆蓋；若日後要改成 grapheme cluster（`Intl.Segmenter`），必須同時改文件與測試，不得默默分岔。字元不等於 token：4,000 + 10,000 的 CJK 對 token 約 1:1 至 1:2，屬 provider 成本而非正確性問題，記錄於此。

**哪一層算預算才算數（Role 6 F-7）。** 檔案文字只在伺服器擷取，所以客戶端那一輪計算裡每個檔案永遠貢獻 0 字元；兩層餵同一個純函式會得到不同結論（客戶端以為還有 10,000 額度，伺服器實際用滿）。**權威計算是伺服器**：`begin_group_ai_request` 用實際擷取到的文字組 context，並把 `chat_chars`／`file_chars`／`files_used` 寫進 request 列。客戶端那一輪**只是預覽**，不得用來顯示「剩餘額度」，也不得據此阻止送出；它唯一的用途是在送出前給使用者看「這次會包含哪幾則對話」。

實作位置：`shared/aiChatContext.ts`（純函式，兩層共用，已附測試）。

## 4. 回答長度

- 目標 1,200–1,500 字元；硬上限 2,500 字元。
- 超過即截斷，附「（回答過長，已截斷）」，並在 `group_ai_requests` 記一筆（`truncated = true`）。
- **截斷提示字串本身計入 2,500**（Role 6 C-6 的措辭），因此使用者看到的 body 不超過上限。
- `group_chat_messages.body` 現有的 4,000 字元 CHECK **不改動**；2,500 是應用層政策，不是資料庫約束。
- **資料庫端的鉗位也承認自己截斷（S-8，Adam 2026-11-25 第二批）：** `finish_group_ai_request` 插入訊息時用 `left(btrim(p_body), 4000)` 鉗住長度，所以 `truncated` 現在寫成 `coalesce(p_truncated, 舊值) or char_length(btrim(p_body)) > 4000`。這只會把旗標往「有截斷」的方向加，不會把呼叫端傳入的 `true` 改回 `false`。舊行為的實測證據（同一個 harness、改動前的 blob）：`finish(id, 4001 字元)` 留下 `request.truncated=false`、`message.truncated=false`、`message.len=4000`，也就是 log 宣稱未截斷而儲存的内容確實被剪過。

實作位置：`shared/aiChatReply.ts`。

## 5. 讀取權限與保留

- **前成員仍可讀取 AI 回答。** AI 訊息就是聊天訊息，讀取沿用聊天 predicate（`active`、`left`、`removed` 可讀，非成員不可）。這與檔案的 predicate 不同，必須在揭露文字裡明講。
- **保留：永久。** 成員退出後其提問與 AI 回答仍保留，不隨成員狀態改變。
- **`abandoned` 群組**：可讀、不可提問（與現有聊天頁的唯讀狀態一致）。

## 6. 抽屜 UI

- 位置：聊天室頂部工具列，**Files 按鈕旁**加一個 AI 按鈕；按下**由上滑出**抽屜（top-anchored，`translateY(-100%)` → `0`，180ms；`prefers-reduced-motion` 時不播放動畫）。每個群組聊天室是獨立 session，切換群組即重設。
- 內容：提問輸入框、可選檔案清單（只列 `current` 且未過期的本群組檔案，最多選 2 個）、同意區塊（首次提問前展開）、清空 context 按鈕、最近一則回答。
- **沒有自動送出**：開啟抽屜不會送出任何內容；必須按「送出提問」且同意全部勾選。
- 實作位置：`client/src/components/citylink/GroupAiDrawer.tsx`（純前端，接 `shared/aiChatMockReply.ts` 的 mock）。
- **檔案清單已接上（2026-11-24）。** 群組檔案功能已在 Launch 上線，`GroupChatPage.tsx` 以 `list_group_files(p_group_id)` 取得清單（該函式本身已過濾 `status='current'`、`deleted_at is null`、`retention_expires_at > now()` 與存取權），傳入 drawer 後再經 `isFileEligible` 二次過濾。清單讀取失敗不會擋住聊天：drawer 顯示「檔案清單暫時無法載入」，而不是假裝沒有檔案。
- **檔案文字由伺服器擷取，不在瀏覽器。** 前端只持有 `id`、檔名與到期日；`SelectableFile.text` 因此是 optional，缺文字時以 0 字元計入預算，而不是報錯。真正的文字擷取與 10,000 字元上限在伺服器（`server/ai/extraction/**`）與 provider 邊界（`server/ai/chat/answerQuestion.ts`）執行。
- **選了檔案卻沒有文字時要說出來（Role 6 F-8）。** 檔案可能 `unsupported_format`、擷取失敗，或文字為空。規則 4 的提示只覆蓋「對話被丟掉」，不覆蓋「你選的檔案其實沒被讀到」。客戶端**無法事先知道**哪個檔案沒有文字（文字只在伺服器擷取），所以這個判斷只能由伺服器做：`finish_group_ai_request` 收到 `p_files_used = 0`（或明顯少於 `file_ids` 的長度）時，回答開頭另加「（部分選取檔案沒有可讀文字）」，drawer 據此顯示。這是新增的揭露，不改動 Adam 定案的三句提示。
- **F-8 的送達路徑已定案（Adam 2026-11-25 選項 b）。** 擷取結果的計數由 `finish_group_ai_request` 寫進 `group_ai_requests`，客戶端以 `get_group_ai_request_status(request_id)` 讀回：`files_used < files_requested` 時在該則回答前加「（部分選取檔案沒有可讀文字）」。刻意不改 `finish` 的回傳型別（那是選項 a，角色 6 指出「現在改零成本、上線後要 DROP+CREATE」），也不讓客戶端去猜——`group_ai_requests` 對任何角色仍不可讀，唯一出口是那支 definer 函式。**目前沒有任何客戶端呼叫點**：本分支的 AI 對話仍走 mock（§6 第一項），所以這條路徑的實際接上屬於伺服器 Worker／P2 的範圍，老實列為未完成。
- **兩個提示同時出現時的順序（Role 6 N-6）。** 「（本次未包含較早的對話）」與「（部分選取檔案沒有可讀文字）」可能都適用——例如-budget 已滿、又選了一個掃不出文字的檔案。定案：**context 提示在前、檔案提示在後**，各最多一次，中間以換行分隔；兩個提示都算進 2,500 的硬上限之前附加（截斷發生在它之後，所以提示本身不會被截掉一半）。**逐字強制只涵蓋 §7 的第 1、4 項**，其餘字串（含這兩個提示）由本節的測試與 `shared/aiChatReply.ts` 釘住，不是 Adam 的逐字裁決——這句話是回應 Role 6 對第 189 行「逐字強制」範圍的質疑。
- **`author_kind` 的客戶端先行版（對應 Role 6 C-2）。** 讀取合約目前還沒有 `author_kind` 欄位（未套用），所以 `mapGroupChatMessages` 一律標記 `authorKind: "member"`，只有這個客戶端自己產生的 AI 回答標為 `"ai"`。前端**不再用 `sender_name_snapshot` 判斷是否為 AI**：把 display name 設成 `CityLink AI` 的成員，其訊息仍是成員訊息。schema 套用後，這個欄位改由伺服器回傳，渲染邏輯不變。

## 7. 揭露文字

**必須包含下列五項；其中第 1、4 項為逐字強制，測試以完全相等比對；其餘三項以包含比對（Role 6 C-7）。**

1. **「AI 會讀取本群組聊天記錄」**——逐字。本次提問、最近的對話、選取的檔案文字。
2. 內容會離開 CityLink，送到 OpenRouter 轉送的 DeepSeek，而 **DeepSeek 是中國大陸 provider**。
3. 回答會以「CityLink AI」名義寫進聊天室，全組可見。
4. **「前成員仍可讀取 AI 回答」**——逐字。退出或被移除後，聊天室歷史（含 AI 回答）仍可見。
5. 每次提問重新同意，不記住選擇。

**Adam 裁決後新增的兩項（本輪）：**

6. **其他成員無法單獨退出**——你的提問會把本群組**其他成員**的聊天記錄與本群組檔案文字一併送出，群組沒有 AI 開關、成員沒有個人退出選項（F-12 選項 c 的「明寫接受」）。
7. **接受只在伺服器記錄一次**——第一次接受會寫下時間戳（F-11），之後每次提問仍要求在介面再勾選；兩边的記錄不一致時以伺服器為準。

**第 5 項的含義變了（要講清楚，不是沿用舊措辭）：** F-11 之後「不記住選擇」只對**這個介面**成立。伺服器確實記住「這個帳號看過揭露」這一件事（一個時間戳，不記錄其他資料）。所以第 5 項現在是 UI 行為，第 7 項是伺服器行為，兩句並存而不是互相否定。

實作位置：`client/src/lib/aiChatConsent.ts`（**七條** statement；只有 `reads-chat`、`former-members` 兩條標為 `requiredPhrase`，測試逐字比對這兩句；其餘以 `toContain` 檢查 provider 路徑、「CityLink AI」、F-12 的「無法單獨退出」與 F-11 的伺服器記錄說法）。**兩句逐字強制只涵蓋第 1、4 項**（Role 6 第三輪對第 189 行的質疑，答案在此）。回答提示的字串（截斷、丟 context、檔案未讀）不屬 Adam 的逐字裁決，由 `shared/aiChatReply.ts`、`shared/aiChatContext.ts` 與 `AI_CHAT_COPY` 釘住，順序見 §6。

## 8. 檔案範圍

只有本群組、`status = 'current'`、`retention_expires_at` 未過期的檔案可以被選取。`pending`、已替換、已刪除、已過期、他組的檔案一律排除，且排除發生在 context 組裝層（`isFileEligible`），不是只靠 UI 過濾——UI 過濾會被繞過，這一層不會。伺服器端在 `begin_group_ai_request` 內再驗一次，不信任客戶端傳來的檔案清單。

## 9. 錯誤 token

**伺服器實際拋出的 token（SQL 裡逐支可查，每個 SQLSTATE 只對應一個原因）：**

| SQLSTATE | token                           | 觸發條件                                                            |
| -------- | ------------------------------- | ------------------------------------------------------------------- |
| `45N01`  | `group_ai_no_permission`        | 無 actor、無 profile 列、或非「active 成員且群組未 `abandoned`」    |
| `45N02`  | `group_ai_group_abandoned`      | **不在本 SQL 拋出**，保留給抽屜在載入群組狀態時先擋（純客戶端提示） |
| `45N03`  | `group_ai_question_empty`       | 提問為空白（全空白也算）                                            |
| `45N04`  | `group_ai_file_not_eligible`    | 選取的檔案非本群組、非 `current`、已過期或已刪除                    |
| `45N05`  | `group_ai_too_many_files`       | 選取超過 2 個                                                       |
| `45N06`  | `group_ai_rate_limited`         | 超出每日或 in-flight 上限；`retry_after`／`reason` 在 `DETAIL`      |
| `45N07`  | `group_ai_idempotency_conflict` | 同一 key 但 `question` 或排序後的 `file_ids` 不同（F-2）            |
| `45N08`  | `group_ai_request_unknown`      | `claim`／`finish` 指到一個不存在的 request id                       |
| `45N09`  | `group_ai_disclosure_required`  | 提問者沒有 AI 揭露接受記錄（Adam F-11，本輪新增）                   |
| `45N10`  | `group_ai_answer_empty`         | `finish` 以成功結案卻沒有回答文字（本輪新增，一個 code 只講一件事） |
| `45N11`  | `group_ai_question_too_long`    | 提問超過 4,000 字元（本輪從 45N03 拆出來，空問與超長是兩種修法）    |

**改動說明（Role 6 第三輪 §9）：**

- `group_ai_context_cleared` **刪除**：清空 context 是成功路徑，回傳 `context_starts_at` 即可，不需要一個偽 token。
- `group_ai_provider_failed` 移到**寫回路徑**：它不是 PostgreSQL token，而是 `finish_group_ai_request` 寫進 `group_ai_requests.error_code` 的值（`provider_timeout`／`provider_failed`），聊天室對使用者顯示一句普通失敗提示。列在這裡是因為它會出現在客戶端看到的 payload 中。
  **不是開放集合（S-10，Adam 2026-11-25 第二批）：** `group_ai_requests.error_code` 現在有 CHECK `group_ai_requests_error_code_check`，只准 `null`／`provider_timeout`／`provider_failed`。約束寫在部署 1 的 `create table` 裡，建表即驗證、不掃表。要新增錯誤碼就必須同時改三處：SQL 的 CHECK、本節、以及該檔檔頭的 SQLSTATE 登記表（後兩者由靜態測試比對，第一處由 apply 測試實測 `'provider_slow'` 得到 23514）。
- `group_ai_file_not_read` **改為旗標**而非 token：`files_used = 0` 才是判據（§6），拋錯會讓「提問仍然被回答」變成失敗。
- `ai_chat_consent_incomplete` 保留為**僅前端** token（勾選未完成時根本不送出）。
- 45M01／45M02／45M03／45M04 是**套用時期**的目標守衛（沿用 P1 的 `private.assert_citylink_target`），不是執行期 token。

## 10. 不在本草案範圍

- **套用這個提案。** SQL 檔已寫出（`docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql`，本輪新增，未套用）：它需要 Role 6 在 **blob 層級**做 exact-head 審查，再由 Adam 指名確切 blob 授權，才可對 Test/Launch 執行。本輪沒有對任何 Supabase 專案執行過任何 SQL。
- 本地套用證據的範圍：`server/stage6AiChatMigrationApplies.test.ts` 把本檔套在一個**仿製 schema**（`server/fixtures/aiChatStubSchema.sql`）上，能證明語法可套用、行為符合規格，**不能**證明 live 的 Auth、真實表上的 RLS、既有 grant、並發或 provider。
- provider 實作與 key（後續獨立指派）。
- 既有 `group_analysis_plans` / `group_analysis_jobs` 的處置：不刪、不改，只停用。
- 速率限制的 SQL 已寫進提案（§2.1 的 20／10／1／120 與兩把 advisory lock），但**未套用**，也未做並發壓測。
- 清空 context 的防濫用機制：Adam 已確認不做，維持任何成員可清空。

## 11. Role 6 審查處置

**審查史（完整 OID，Role 6 F-10／N-3）。** 本檔的 blob 鏈與實際被審查的是哪一份，逐段對齊：

| 輪次                 | 被審查的 commit | blob（完整 OID）                           | 大小             | sha256                                                             | 產出                      |
| -------------------- | --------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------------ | ------------------------- |
| 第一輪 exact-head    | `bd60b5c`       | `73c9297732a4ceb87a3c2f6893aa10c734148be5` | 163 行／12,017 B | `e709a4c1249fb4b6716c2f21ed77c6c06d290ce65e61d15aad14d7755b82de80` | B-1、B-2、C-1…C-8         |
| （未經審查的中間版） | `934ee78`       | `b4fed194958c0bbb89a4ffc890e23a060514cc91` | 220 行／25,224 B | `0618ee5272812c60b421e4b02ee6fd32b01baff936854286e60bd7a8e4f3693b` | 無（Role 6 審的是下一份） |
| 第二輪 focused       | `3a57556`       | `bdb31785989507f593120d61bbffa21df68b1bf6` | 239 行／27,729 B | `a19c79a2473de5a57c82b00279a068ef617827e857865504b6b3486a31f57050` | F-1…F-12、G-1…G-5         |
| 第三輪 focused       | `352e88b`       | `aa93a5f543efea4b8add0bd65e8482b0a7b8d566` | 277 行／36,679 B | `d361ab98ff73120f99de3367fc7c79ebd25b0b947d2e1bb8a39aebaca76b569c` | R-1、R-2、N-1…N-6         |

**必須如實寫的一件事（Role 6 N-3／F-9）。** 第二輪送審的那份（`bdb3178`）已經包含 §2.1 限流規格；修 F-1…F-10 的那次提交（`352e88b`）**把整節 §2.1 刪掉了**，卻沒有更新任何指向它的句子——這不是 Role 6 誤讀，是實際發生的回退（字串計數：`### 2.1` 1→0、`pg_advisory` 1→0、`hashtextextended` 1→0、`aiRateLimit` 1→0）。本版把該節**逐字還原**（來源為 `bdb3178` 第 121–137 行，未改寫、未重新措辭），並在後面補上四個實作決定。同一次提交也沒有把 `bdb3178` 寫進審查史，因此上表把四個 blob 全列出來。

| 項  | 內容摘要                                                           | 處置                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | 寫入路徑自相矛盾；任何成員可偽造 AI 訊息；log 表停在 `queued`      | **已改寫**：拆成 `begin_group_ai_request`（authenticated）＋ `claim_group_ai_request` ＋ `finish_group_ai_request`（後兩者僅 `service_role`）。**已由 Adam 2026-11-24 批准**（寫回只經 `service_role`）。表權限**連 `service_role` 一起 revoke**，寫入只透過 definer 函式（§1.3／F-1）；上一版這格寫的「`group_ai_requests` 不再 revoke `service_role`」是 F-1 修正前的舊文字，與 §1.3 第 91 行矛盾，依 Role 6 N-2 於本版改寫。 |
| B-2 | `RETURNS TABLE` 加欄位不是 additive，需 DROP+CREATE                | **已改寫**：新增 `list_group_chat_messages_ai`，舊函式一字不動（沿用 `_capacity` 先例）。**已由 Adam 2026-11-24 批准**（新增 `list_group_chat_messages_ai`，舊函式不動）。                                                                                                                                                                                                                                                      |
| C-1 | `ai_request_id` 只有註解、沒有約束                                 | **已修**：外鍵 + `group_chat_messages_ai_request_only_for_ai`。                                                                                                                                                                                                                                                                                                                                                                 |
| C-2 | 名稱 CHECK 只約束一半，成員可用 display name 冒充                  | **已修**：文件明定前端一律以 `author_kind` 渲染，並列為 P2 驗收項；CHECK 的 drop/recreate 成本已記錄。                                                                                                                                                                                                                                                                                                                          |
| C-3 | 任何成員可反覆清空共享 context，無頻率限制、無稽核                 | **Adam 2026-11-24 確認維持原設計**：任何成員可清空，不加頻率限制、不加稽核。文件明寫這是共享重置。                                                                                                                                                                                                                                                                                                                              |
| C-4 | 無冪等鍵、無速率限制                                               | **冪等已修**（`idempotency_key` + unique）；**限流已定案**：RPC 內交易式檢查，見 §2.1（`group_ai_rate_limited` + `retry_after`）。                                                                                                                                                                                                                                                                                              |
| C-5 | 字元 ≠ token；emoji 與 `.length` 不一致                            | **已修**：文件寫明以 `Array.from().length` 計數，並保留改為 `Intl.Segmenter` 時必須同步改測試的規定。                                                                                                                                                                                                                                                                                                                           |
| C-6 | 「提示字元計入 2,500」語意不明                                     | **已修**：改寫為「截斷提示字串本身計入 2,500」。                                                                                                                                                                                                                                                                                                                                                                                |
| C-7 | 標題說兩句、清單五項                                               | **已修**：改寫為五項，第 1、4 項逐字強制，其餘包含比對。                                                                                                                                                                                                                                                                                                                                                                        |
| C-8 | `group_ai_requests` cascade 與 `group_chat_messages` restrict 相反 | **已修**：改為 `on delete restrict`。                                                                                                                                                                                                                                                                                                                                                                                           |
| —   | `group_chat_messages` 無 trigger，插入 AI 列不會被擋               | **已記錄**於第 2 節。                                                                                                                                                                                                                                                                                                                                                                                                           |

### 11.1 第二輪（focused 複查）的發現

| 項   | 內容                                                              | 處置                                                                                                                                         |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | `grant select, insert, update ... to service_role` 多餘且削弱閘門 | **已刪**：`group_ai_requests` 對所有角色 revoke，只由 definer RPC 以 owner 權限寫。理由寫在 §1.3。                                           |
| F-2  | 冪等鍵不比對內容；`asked_by` 可 NULL 使 unique 失效               | **已修**：`begin` 比對 `question` 與排序後 `file_ids`，不同則拋 `group_ai_idempotency_conflict`；unique 改為 `(group_id, idempotency_key)`。 |
| F-3  | `processing` 不可達；`finish` 可重複呼叫會插兩則 AI 訊息          | **已修**：新增 `claim_group_ai_request`（`queued → processing`），`finish` 只從非終止狀態轉換，已終止則回傳既有 `message_id`。               |
| F-4  | `finish` 不能以 `auth.uid()` 判斷身分                             | **已寫明**：授權依據是 request 列狀態與 `EXECUTE` 只給 `service_role`，不查使用者。                                                          |
| F-5  | 兩個讀取函式會重複編排分頁與 predicate                            | **已改**：抽成 `private.list_group_chat_messages_page`，兩個 public 函式只做投影與授權；並記錄 PostgREST schema cache 需重載。               |
| F-6  | 走舊函式的客戶端會把 AI 回答顯示成成員訊息                        | **已寫成 P2 驗收項**：AI 回答上線前，所有讀取聊天室的介面必須改用 `_ai` 版本。                                                               |
| F-7  | 哪一層算預算沒寫清楚                                              | **已寫明**：伺服器權威，客戶端只做預覽，不得顯示剩餘額度或據此阻止送出。                                                                     |
| F-8  | 選了檔案卻 0 字元時沒有揭露                                       | **已加**：drawer 標示「沒有可讀文字」、`group_ai_file_not_read`、回答開頭另加「（部分選取檔案沒有可讀文字）」。                              |
| F-9  | 自述變動清單不完整                                                | **本版重寫**（§11.4）。先前那格自稱「已修」，但清單本身漏了整節 §2.1 的刪除，Role 6 判為「不只不完整，且含不實陳述」——本輪如實更正。         |
| F-10 | 引用只有 7 字元 blob、無 sha256                                   | **已修**：§11 審查史改用完整 OID＋sha256＋行數＋bytes，並列出中間未經審查的 `b4fed19`；檔頭第 5 行不再是 7 字元縮寫。                        |
| F-11 | 同意只在瀏覽器把關，伺服器無法驗證提問者看過揭露                  | **Adam 已裁決**（§11.2）：伺服器端記錄一次接受（`profiles.ai_disclosure_accepted_at`），`begin` 以 45N09 檢查。                              |
| F-12 | 其他成員的訊息與檔案由提問者一人同意即外送，無退出機制            | **Adam 已裁決**（§11.2）：選項 c——無群組開關、無成員退出，把接受寫明白。                                                                     |

### 11.2 Adam 的裁決（F-11／F-12／C-4，2026-11-24）

原本列為「待決」的兩個同意問題已由 Adam 裁決；原問題照原樣保留以便對照。

- **F-11 原問題：** `begin_group_ai_request` 無法知道提問者是否看過揭露文字。任何能構造請求的 active 成員，都能在不見揭露的情況下把群組對話與檔案內容送到中國大陸 provider。前端同意是 UI 承諾，不是可驗證的事實。
- **F-11 裁決：** 「在伺服器端記錄一次接受，並在 `begin` 檢查。」落點：`profiles.ai_disclosure_accepted_at timestamptz`（可為 NULL，**不 backfill**——既有使用者未曾看過新揭露文字，預設接受等於把未取得的同意寫進資料庫）；新 RPC `accept_ai_disclosure()` 由本人在抽屜勾選後呼叫；`begin_group_ai_request` 在任何寫入**之前**檢查該欄位，未接受即拋 `45N09 group_ai_disclosure_required`。**已知局限（記錄，不掩蓋）：** 它記錄的是「該帳號在該時點按過接受」，不是「讀過並理解」；它堵掉的是「繞過前端直接構造請求」，堵不掉想法改變。**與 §7 第 5 項的關係：** 同意只記一次（Adam 選擇），所以「每次提問重新同意」變成純 UI 行為——每次都要求勾選，伺服器只在第一次寫入時間戳。兩邊不一致時以伺服器為準，本檔不做修飾。
- **F-12 原問題：** context 含其他成員最多 4,000 字元訊息與 10,000 字元群組檔案文字，由提問者一人同意即外送，其他成員沒有退出機制，而 §5 規定保留永久。
- **F-12 裁決：** **選項 c**——既不做群組級 AI 開關，也不做成員級退出，而是**把接受寫明白**：揭露文字必須點出「你的提問會把本群組其他成員的聊天記錄與本群組檔案文字一併送給 OpenRouter 轉送的 DeepSeek（中國大陸 provider），其他成員無法單獨退出」。SQL 因此刻意**沒有** `ai_enabled`／opt-out 欄位或 trigger（本輪新增靜態測試擋住這類欄位出現）。這一項的合規判斷屬 Adam／產品；Kayk 不自行評估法律效果。
- **C-4 裁決（先前已定，連同數字入檔）：** 交易式檢查在 `begin_group_ai_request` 內、寫 request 列之前；上限 20／群組／UTC 日、10／成員／UTC 日、1 個並行；`queued`／`processing` 超過 120 秒視為死亡；拋 `group_ai_rate_limited`（45N06），`retry_after` 與 `reason` 放在 `DETAIL`。

### 11.3 第三輪（focused，2026-11-24）的發現與處置

| 項   | 內容                                                                                                                                                                   | 處置                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | §2.1 整節在 `aa93a5f` 被刪除，五處仍指向它；Adam 的 C-4 裁決在被審查的 blob 中不存在                                                                                   | **已還原**（逐字取自 `bdb3178` 第 121–137 行），並定稿 G-1／G-2／G-3／G-5，見 §2.1 末。                                                                                                 |
| R-2  | 第 124 行對 `claim`／`finish` 沒有 revoke（PostgreSQL 預設授 PUBLIC `EXECUTE`，`authenticated` 是 PUBLIC 成員）→ 任何登入者可偽造 AI 訊息；也未寫 definer／search_path | **已改寫**成逐支函式的 ACL 表（七支，含 `private` helper 與 `accept_ai_disclosure`）；SQL §8 一律先 revoke `public, anon, authenticated, service_role` 再 grant，並以 `set role` 實測。 |
| N-1  | `group_ai_context` 的列沒有人建立，`clear` 的 `update` 影響 0 列                                                                                                       | **已定案**：`clear` 用 `insert … on conflict (group_id) do update`；`begin` 以 `coalesce((select context_starts_at …), to_timestamp(0))` 取下界。見 §1.2。                              |
| N-2  | 第 251 行（B-1 處置列）仍寫「`group_ai_requests` 不再 revoke `service_role`」，與 §1.3／F-1 自相矛盾                                                                   | **已改寫**該列，並註明那是 F-1 修正前的舊文字（見上表）。                                                                                                                               |
| N-3  | 審查史只列兩個 blob、漏掉 `bdb3178` 那輪，把 `b4fed19` → 本版當成一步                                                                                                  | **已補**四段 blob 表（含未經審查的中間版）與 sha256／行數／bytes，並如實寫 §2.1「曾被加入又被刪除」。                                                                                   |
| N-4  | `ADD COLUMN`＋`CHECK` 同一語句在 ACCESS EXCLUSIVE 下全表掃描 live 聊天表，成本未記錄                                                                                   | **已採納**：先加欄位；五條約束各自 `not valid`；§3.1 逐條 `validate constraint`（刻意獨立成段，可拆成第二次部署）；preflight 須記錄行數、`pg_total_relation_size`、鎖等待。             |
| N-5  | `group_chat_messages.ai_request_id` 沒索引，`finish` 的冪等路徑會掃表                                                                                                  | **已加** partial index `group_chat_messages_ai_request`（`where ai_request_id is not null`），見 §1.1。                                                                                 |
| N-6  | 兩個提示可能同時出現、順序未定；第 189 行的逐字強制只涵蓋第 1、4 項                                                                                                    | **已定案**：context 提示在前、檔案提示在後，各最多一次；§6 並寫明逐字強制只涵蓋 §7 第 1、4 項。                                                                                         |
| 補充 | `file_ids uuid[]` 沒有陣列長度約束，≤2 只在 RPC 與 UI 驗                                                                                                               | **已加** `check (coalesce(array_length(file_ids, 1), 0) <= 2)`（建表時的 CHECK，不掃表）。                                                                                              |

### 11.4 本版實際改了哪些節（F-9、N-3）

- `73c9297`（第一輪審查的對象）→ `b4fed19`（commit `934ee78`，**未經審查**）：檔頭、§1.1、§1.2、§1.3、§2、§3、§4、§6、§7、§8、§10、§11。
- `b4fed19` → `bdb3178`（第二輪審查的對象）：新增 **§2.1**（Adam 的 C-4 裁決）、§1.2（C-3 確認）、§1.3、§2、§3、§6、§9、§11。
- `bdb3178` → `aa93a5f`（第三輪審查的對象）：§1.1／§1.2／§1.3／§2／§3／§6／§9／§11 多處，**並誤刪 §2.1**（R-1）。
- `aa93a5f` → **本版**（回應第三輪）：檔頭（完整 OID、SQL 檔已存在）；§1.1（N-4 拆段＋N-5 索引）；§1.2（N-1 列來源）；§1.3（`turns`／`files` 是實際欄位的更正、`file_ids` 長度 CHECK、F-2 措辭改為 snapshot 重放）；§2（R-2 逐支函式 ACL 表）；§2.1（逐字還原＋G-1／G-2／G-3／G-5 定稿）；§6（N-6 提示順序、F-8 改為旗標）；§9（加 45N09／45N10／45N11、刪 `group_ai_context_cleared`、`group_ai_file_not_read` 改為旗標、標出純客戶端 token、補 SQLSTATE 欄）；§10（改掉「不含任何 SQL 檔」，寫明本地證據的範圍）；§11（審查史四 blob 表、B-1 列更正、F-9／F-10 更正、11.2 裁決、11.3 第三輪表、本節重寫）。§0、§3、§4、§5、§7、§8 本輪未改動；§7 第 5 項與 F-11 的關係在 §11.2 說明，未改該節文字。

**目前狀態：** B-1、B-2、C-3、C-4、F-11、F-12 已由 Adam 裁決；R-1、R-2、N-1…N-6 已在本版處理。**SQL 提案檔已寫出但未套用**，附本地套用／行為測試（16 項）與靜態釘住測試（22 項），全數通過。依 Role 6 本輪明確指示**不做第四輪文件複查**：Role 6 先對本版新 blob 做「確認還原」短查（§2.1、ACL 段、§11），隨後在 **SQL blob 上做 exact-head 審查**。本檔與該 SQL 都不構成任何 migration、signed-in QA、merge、部署或發布授權。

### 11.5 SQL 層級 exact-head 審查（2026-11-25，Role 6）與第二審查者的目錄核對

**被審查的物件**：`docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql`，blob
`1a4f6c84441cfc6886a826c75e82cd94da734136`，788 行／34,119 bytes，sha256
`2931d19b97d337e04b33d866a80168294cae6e638cf51c285012db329584812d`，commit `01ae739`。
**裁定：核准，附條件（approve with conditions）；未發現阻擋性安全缺陷。** 上一輪的 R-1／R-2 與 N-1／N-4／N-5
在 SQL 層被逐段確認結案（守衛在任何寫入之前且同交易、七支函式全 definer＋`set search_path = ''`＋revoke 指名
`service_role`、`group_ai_context` 的 upsert、約束 `not valid`＋另段 validate、partial index）。性質仍是**靜態審查**：
Role 6 未連任何資料庫、未執行本檔任何敘述、未跑兩個測試檔，並把這點寫在第 5 節自己列出的八項未驗證清單裡。

**本節刻意不改 SQL 文字**：下面 S-1／S-2／S-3／S-4 會改變檔案，而改變後就是一個**新的 blob**，授權必須指名那個新
SHA（Adam 2026-11-25 的規則亦如此要求）。所以要等 Adam 裁決後才動。

| 項   | 位置               | 一句話                                                                                                                   | 狀態                                                                                          |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| S-1  | 633–637／660–664   | `finish` 的五個記錄參數有預設值且無條件覆寫 ⇒ `finish(id, body)` 會把 `chat_chars`／`dropped_context`／`files_used` 歸零 | 待 Adam 選修法（建議預設 `null` + `coalesce`）                                                |
| S-2  | 595／637／664／640 | F-8 的揭露沒有送達客戶端的路徑：`begin` 記的是選取數、`finish` 只回傳 `message_id`、該表誰都讀不到                       | 待 Adam 選 (a) 改 `finish` 回傳型別／(b) 新狀態 RPC／(c) 接受僅供稽核並同步改 §9 與 §11.1 F-8 |
| S-3  | 159–162            | `accept_ai_disclosure()` 每次覆寫時間戳，與 F-11 的**證據語意**和本檔 §11.2「只記第一次」矛盾                            | 修法明確（`where … is null`），仍待授權，因為會改 blob                                        |
| S-4  | 21–32 vs 425–428   | 檔頭 SQLSTATE 清單漏 **45N11**（檔內實走 10 個碼、檔頭列 9 個）；靜態測試沒擋住檔頭                                      | 同上；並把該測試改為同時解析檔頭清單                                                          |
| S-5  | 487–488／494–495   | SQL 的每日計數口徑與本合約 §2.1 末 G-3 的寫法差一類（120 秒內未 claim 的 `queued`）                                      | 待裁：改 SQL 或改文件，兩者必須同一句話                                                       |
| S-6  | 543–549／562–568   | 迴圈遇到放不下的一則只設旗標再**繼續** ⇒ 保留的訊息可能不連續，此時規則 4 的提示會說錯方向                               | 待 Adam 裁：嚴格前綴 `exit`，或改不承諾順序的措辭                                             |
| S-7  | 388／437／541／560 | 只有 20／10／1／120 被釘住；`4000`、`2`、`10`、`200` 也在 SQL 重複出現                                                   | 建議同批擴大釘住範圍（不改產品值）                                                            |
| S-8  | 700＋660           | `left(btrim(p_body), 4000)` 截了卻不設 `truncated` ⇒ log 可能宣稱未截斷                                                  | 待 Adam 裁：DB 截斷是否寫進 `truncated`                                                       |
| S-9  | 66／186／252／775  | **套裝方式**：單交易下第 186 行的 ACCESS EXCLUSIVE 持有到 commit ⇒ 186–788 行之間聊天室完全停寫                          | 待 Adam 選 (a) 單交易離峰／(b) 3.1 拆兩次部署**並重跑守衛**（Role 6 建議）／(c) 拆三交易      |
| S-10 | 658                | `error_code` 是自由文字，未限制為 §9 寫的兩個正規值                                                                      | 非阻擋；建議加 CHECK 或明寫開放集合                                                           |

**第二審查者的核對（屬回報，不是我在本沙盒實測）**：他宣稱對 Launch 做過唯讀目錄查詢，結果是本檔假設的依賴
**狀態更新（兩批裁決之後）：** 上表的「待 Adam 裁決」是 Role 6 當時的原話，保留為審查紀錄，不改寫。S-1、S-2、S-3、S-4、S-9 的實作見 §11.6；S-5、S-6、S-7、S-8、S-10 的實作見 §11.7。Adam 對第二批給的是通令式裁決——「一句話裁決這五條：全部照 Role 6 建議改」（2026-11-25），因此每條的落點就是 Role 6 在該列寫的建議修法；Role 6 未指明方向的（S-5「改 SQL 或改文件」），我選了**改 SQL 對齊已核准的決定**，並在 §11.7 交代理由，請 Role 6 在複查時確認這個選擇。
（`can_send_group_chat`、`can_read_group_chat`、`list_group_chat_messages(uuid,timestamptz,uuid,integer)`、
`sender_name_snapshot` 與 `group_chat_messages_body_check`、`group_files` 的三個欄位）都存在；七支新函式與兩張新表
都不存在 ⇒ 無衝突；`profiles.ai_disclosure_accepted_at` 確實尚未建立。他另外提出五點，與上表重疊：
`limit 200` 會讓提示在最該出現時不出現（且 TS assembler 無此上限 ⇒ mock 與 live 不一致）、`finish` 可抹掉
`dropped_context`（S-1）、4,000 clamp 不承認截斷（S-8）、日界依賴 session timezone（建議 `date_trunc('day', now(), 'UTC')`，
本檔第 481 行確實是兩參數版）、檔頭在 45N03 上與程式矛盾（S-4）。**一條新事實**：Launch 的 `group_chat_messages`
目前 **4 列**，所以這次的 `VALIDATE` 幾乎即時；本檔的自我量測義務保留，因為那張表會成長。

**Adam 2026-11-25 的規則已入檔**：`docs/team/DECISIONS.md` 的
`2026-11-25 — Group AI chat: the apply target, the transfer method, the five gates and the window`
——唯一目標 Launch `pijslbchvstkoweslymr`；Prototype 依 F14 凍結不得 migrate；本地 PG 只是測試不是套用對象；
`assert_citylink_target` 是**最後**一道防線；傳送必須保留空行（P1 曾因貼上吃掉空行導致 prosrc 與授權檔不符，
事後補一次 `create or replace`）；套用後逐函式比對 `md5(prosrc)` 並貼出結果；**先套用、後 promote** 成
`supabase/migrations/<timestamp>_kayk_ai_chat.sql` 並比照 P1 的 `20261124064100` 補一列 ledger（只指向檔案）；
五關依序（Role 6 無 blocker → 協調任務確認無其他分支改同一批物件 → Launch 唯讀 preflight → Adam 指名 ref/blob/
行數/sha256 的書面授權 → 同一交易套用後驗證）；第 3–5 關必須同窗口，隔日 preflight 作廢；不在 demo 或 live QA
前夕套用；`author_kind` 是對 live 表的 `ALTER`，排在離峰。

### 11.6 Adam 的四項裁決已實作（2026-11-25），SQL 變成兩份檔案

Adam 在 2026-11-25 裁決：**S-1 選項 (a)**、**S-2 選項 (b)**、**S-3 核准**、**S-4 核准**、**S-9 選項 (b)**。
本節記錄實作結果與**新的 blob**；上一節 §11.5 的 S 表仍是那份被審查的單檔（blob `1a4f6c84…4136`），
兩節合起來才是完整歷史，不改寫、不刪除。

**新的物件是兩個檔案，不是一個。** `KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` 現在是**部署 1**，
`KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql` 是**部署 2**，拆點在原 Section 3 與 3.1 之間：

| 檔案                                         | blob（完整 OID）                           | 行數／大小       | sha256                                                             |
| -------------------------------------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------------ |
| 部署 1 `KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` | `33e5589e6ee5ddd0ed88b101be42d1f1700675df` | 290 行／17,703 B | `294ab3e6c9d671c591b8aad46cdb77f36b9ca6f8202cd4eaa0793f8bbec90b98` |
| 部署 2 `..._DEPLOY2.sql`                     | `045546fd5068cd1216f90490e8a0dac8b5e03c33` | 681 行／29,726 B | `5da292dfacda973a39ad96750e739554e34a2a4d81d708207aeb953717e02213` |

**部署 1**：目標斷言、兩張新表、`profiles.ai_disclosure_accepted_at` 與 `accept_ai_disclosure()`（含 **S-3** 的
寫一次語意）、`group_chat_messages` 的三個新欄位與五條 `not valid` 約束，最後**在本檔內**完成 `accept_ai_disclosure()`
的 revoke/grant。為什麼授權跟著拆：若把这支函式的 ACL 留給部署 2，兩次部署之間它會帶著 PostgreSQL 預授的 **PUBLIC
`EXECUTE`** 存在——那正是 R-2 要消滅的形態，所以「部署 1 建立的物件，授權在部署 1 結清」是本輪新增的結構性規則。
它的 commit 一落地，Section 3 那個 `ALTER TABLE … add column` 的 `ACCESS EXCLUSIVE` 就釋放。

**部署 2**：**重跑同一條目標斷言**（S-9(b) 的硬性條件——第二次部署是第二次人工選錯專案的機會，2026-11-24 的事故就是這一類）、
`validate constraint` 五條、partial index、兩支讀取函式與 private helper、`begin`／`claim`／`finish`（含 **S-1** 的
`null` 預設 + `coalesce`）、**新增 `get_group_ai_request_status`（S-2(b)）**、`clear`，以及這些物件的全部 revoke/grant。
驗證只需 `SHARE UPDATE EXCLUSIVE`，寫入仍可進行，所以這段不會像合在一起那樣鎖住聊天室。

**兩檔之間的中间態要誠實列出**：欄位已在、約束未驗證、AI 的寫入路徑與讀取函式**還不存在**。所以只跑部署 1 等於功能不存在
（不是半套上線），而既有成員聊天不受影響——唯一能寫 `author_kind='ai'` 的 `finish` 要到部署 2 才建立，成員列走 `'member'`
預設。**兩檔都跑完才算這輪部署完成**，且兩檔都是冪等的（`if not exists`／DO 守衛／`create or replace`），部署 2 失敗就修好重跑，
不回滾部署 1。

**檔頭也改了（S-4）**：兩檔各帶同一份 SQLSTATE 登記表（含 `45N11 group_ai_question_too_long`），
而 `stage6AiChatSqlContract.test.ts` 現在**解析那張表本身**：兩檔聲明的碼聯集必須恰好等於兩檔本體實際 raise 的碼聯集，
且每個碼對應的 token 必須與測試內配對表一致。舊測試只查「字串有出現」，所以 45N11 曾在檔頭缺席而測試仍綠——這是那句教訓的
機制版本。同一支測試另外檢查：兩檔各自只有一個 `begin;`／`commit;`、斷言位於該檔**去註解後**的第一條敘述之前（用註解文字
通過順序檢查是不行的，所以量測時先把 `--` 行剔除）、以及八支函式全部有 revoke。

**測試狀態（本地實測，非推測）**：`stage6AiChatMigrationApplies.test.ts` 由 16 個增至 **22** 個，新增的六個正是這一輪的結構主張——
「約束只在第二次部署被驗證」（部署 1 後五條仍是 not valid、部署 2 後 0 條）、「部署 1 之後 AI 寫入路徑不存在（`to_regprocedure`
全為 NULL）且 `accept_ai_disclosure()` 已是最終 ACL」、「部署 2 在叢集身分改變後被拒且 7 支函式一列未落地、修正後可成功」、
「`finish(id, body)` 兩參數呼叫不再抹掉 `begin` 算出的 `true/4000`，而明確傳 200 仍會覆寫」、
「同意時間戳只記第一次（重呼叫回傳同一值）」、「狀態 RPC 交出計數、不交出提問與檔名，外人得 0 列、未知 id 得 0 列、`null` 得 0 列」。
兩個 SQL 測試檔合計 **45** 個（23 靜態 + 22 行為）；整套 `corepack pnpm test` 是 54 檔／817 測試全綠。
本檔 §11.5 那八項「Role 6 自己沒驗證的」裡，**套用到引擎 17** 這一项現在有證據：harness 已改用 PGDG PostgreSQL **17.12**
（與 Test／Launch 的 17.11 同引擎、非同一版本）重跑一次，22 全過；同時 16.15 也跑過一次（預設叢集），兩次都綠。

### 11.7 第二批裁決（S-5／S-6／S-7／S-8／S-10）已實作，兩份 blob 再度改號

Adam 2026-11-25 以一句話裁決剩下的五項：「**全部照 Role 6 建議改**」（他同時說明這是「最省事」）。因此這五項沒有一項是新的產品選擇，落點如下（逐項對應 Role 6 在其審查中寫的建議）：

| 項   | Role 6 的建議                                                  | 本版落點                                                                                                           |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| S-5  | 檔頭與程式必須同一句話（未指定改哪一側）                       | 改 **SQL**：兩個每日計數變成 §2.1 G-3 的字面實作（決定本身是 2026-11-24 已核准的，不動）                           |
| S-6  | 裝不下就 `exit`（嚴格前綴），或改成不承諾順序的措辭            | 改 **SQL**：兩個迴圈 `exit`，措辭保留；另按第二審查者 item 1 的第二修法，命中 200 列掃描上限時設 `dropped_context` |
| S-7  | 同批擴大釘住範圍（`4000`／`2`／`10`／`200`）                   | 改 **測試**：靜態測試新增一支，逐字釘住上述全部重複字面值與 `error_code` 的閉合集合                                |
| S-8  | `truncated = p_truncated or char_length(btrim(p_body)) > 4000` | 改 **SQL**：照該式，前面再套 S-1 的 coalesce                                                                       |
| S-10 | 加 CHECK（或在合約明寫開放集合）                               | 改 **SQL**：部署 1 的建表加 `group_ai_requests_error_code_check`；§9 同時改寫為「不是開放集合」                    |

**新的兩份 blob（Role 6 複查請指名這兩個，舊的一律作廢）：**

- 部署 1 `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` — blob `57e4c5265da487073683436fa385a4ce79a06403`、299 行、18,653 bytes、sha256 `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`
- 部署 2 `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql` — blob `de5eb18f238d2c6f0f6776e47dee7e19c1eacc86`、711 行、32,724 bytes、sha256 `4f50aba080d93a7653b58ef11ec2ec65dd87f00fbbda8c1be64051e5c30e575c`

上一輪的 `33e5589e…`／`045546fd…` 已被本版取代；Role 6 最初審的單檔 `1a4f6c84…`（788 行）同樣已被取代。本合約自己的 blob 與 sha256 記在 `docs/team/DECISIONS.md` 與 PR #67 的 body（一份檔案無法寫自己的雜湊）。

**順便修掉的一处我自己的錯誤（不是新決定）**：部署 1 的檔頭有一段是從部署 2 抄來的，寫著「本檔是第 2 次」與「依賴部署 1 的物件」——對第 1 份檔案來說是錯的，會誤導照檔頭下指令的人。現已改為「本檔是第 1 次（建表、加欄位、未驗證約束）」，依賴那一条改寫成「本檔不依賴部署 2 的任何物件，順序只能是 1 → 2」。同一檔頭現在也列出 S-10 與「S-5／S-6／S-7／S-8 在部署 2」，讓只看一份檔案的人知道**兩檔都要跑**。

**新增的行為測試（apply 套件 22 → 27）**：嚴格前綴（3,000／1,500／10 三則，只留最新一則，且舊 blob 在同一場景下留下 `turns=2`、`first_chars="tb"` 的空洞——這是改動前後各跑一次的實測，不是推論）、200 列掃描上限必須記 `dropped_context`（`200/true`）、每日配額只計已 claim 的列（未 claim 十條仍可提問；補上 `claimed_at` 後同一腳本得到 45N06 `reason=user_daily`）、4,000 鉗位要讓 `truncated` 變 true 且訊息長度恰為 4,000、`error_code` 非合約值得到 23514 `group_ai_requests_error_code_check`。靜態套件 23 → 24（S-7 的字面值釘選，含 §9 兩個 token 必須同時出現在合約裡）。

**仍未裁的一項（屬第二審查者、不在 S 編號內）**：日界 `date_trunc('day', now())` 依 session timezone；他量到 Launch `TimeZone = UTC` 所以今天兩種寫法等值，建議改成 `date_trunc('day', now(), 'UTC')`。我**沒有**動它——那不在「這五條」的裁決範圍內，而擅自改 blob 正是被警告過的行為。列在此處請 Adam 一句話裁決。
