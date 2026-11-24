# 群組 AI 對話：技術合約草案（2026-11-24 設計變更後）

- **日期：** 2026-11-24（Role 6 審查後修訂，見第 11 節）
- **分支：** `feature/kayk-ai-analysis`
- **狀態：** 草案。**不是 migration、未套用、不構成實作授權。** Role 6 已於 2026-11-24 對前一版（`bd60b5c`，blob `73c9297`）做過 exact-head 審查，本版是其修訂；B-1、B-2、C-3、C-4 已由 Adam 於 2026-11-24 裁決（第 11 節）。
- **取代：** `KAYK_AI_PLANS_JOBS_CONTRACT_DELTA.md`（共用分析計畫，已因設計變更作廢）。舊檔保留作歷史，不刪除。
- **上層文件：** `KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md` 第 2、6、9、11、12 章仍然有效；第 3、4 章關於 `group_analysis_plans` 的部分作廢。

## 0. 這次改什麼

AI 由「每組一份共用分析計畫」改為「聊天室內的共用 AI 對話」：AI 不是真成員，只是像成員一樣參與；回答寫進群組聊天室，全組共用一條對話，每個群組聊天室是獨立 session。

`public.group_analysis_plans` 與 `public.group_analysis_jobs` **已套用於 Launch**。依 Adam 的指示，兩張表**不刪除、不改動**，只標記停用：不再有任何 RPC 讀寫，也不作為 AI 對話的儲存位置。

## 1. Schema 提案（未套用）

以下全部只是提案，需另開 migration、經 Role 6 exact-head 審查、再由 Adam 指名授權才可套用。

### 1.1 `public.group_chat_messages` 三個新欄位

```sql
alter table public.group_chat_messages
  add column author_kind text not null default 'member'
    check (author_kind in ('member', 'ai')),
  add column ai_request_id uuid
    references public.group_ai_requests (id) on delete set null,
  add column truncated boolean not null default false;

alter table public.group_chat_messages
  add constraint group_chat_messages_ai_has_no_sender
    check (author_kind <> 'ai' or sender_id is null),
  add constraint group_chat_messages_ai_name
    check (author_kind <> 'ai' or sender_name_snapshot = 'CityLink AI'),
  add constraint group_chat_messages_ai_request_only_for_ai
    check (author_kind = 'ai' or ai_request_id is null);
```

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

**這是共享狀態的破壞性操作（Role 6 C-3）。** 新加入者可以反覆清空，讓 AI 對話對所有人失去上下文，成本為零；`updated_by`／`updated_at` 只保留最後一次，沒有歷史。三種緩解（伺服器端頻率限制、append-only 稽核、限定 leader）都會改變產品行為，因此**不在本草案自行決定**，列為 Adam 待決（第 11 節）。現階段文件明寫：這是任何成員都可反覆觸發的共享重置。

### 1.3 `public.group_ai_requests`（提問與 log）

```sql
create table public.group_ai_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete restrict,
  asked_by uuid references public.profiles (id) on delete set null,
  idempotency_key uuid not null,
  question text not null check (char_length(btrim(question)) between 1 and 4000),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed')),
  error_code text,
  dropped_context boolean not null default false,
  truncated boolean not null default false,
  chat_chars integer not null default 0,
  file_chars integer not null default 0,
  files_used integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint group_ai_requests_idempotent unique (group_id, asked_by, idempotency_key)
);
create index group_ai_requests_group_recent
  on public.group_ai_requests (group_id, created_at desc);
alter table public.group_ai_requests enable row level security;
revoke all on table public.group_ai_requests from public, anon, authenticated;
grant select, insert, update on table public.group_ai_requests to service_role;
```

這張表是「同時記一筆 log」的落點：截斷、丟棄 context、用了幾個檔案與多少字元，都留在這裡，而不是只寫進伺服器日誌。`ai_request_id` 由訊息指向它，於是「這則回答為什麼被截斷」可以事後回答。

**為什麼這一張不 revoke `service_role`（Role 6 B-1 第二半）。** provider 在資料庫外，結果是非同步回到伺服器；回來時要寫 `status`、`error_code`、`truncated`、`chat_chars`、`file_chars`、`files_used`、`finished_at`。若連 `service_role` 都 revoke，這張表只能被建立、永遠停在 `queued`。上一版把 P1 的 K-1 反射動作套錯地方：K-1 revoke `service_role` 是為了擋客戶端繞過授權，而本表客戶端本來就沒有路徑（`authenticated` 已 revoke，且無 policy）。**`service_role` 是這張表唯一的合法寫入者，不是被擋的對象。**

**冪等與成本（Role 6 C-4）。** `unique (group_id, asked_by, idempotency_key)` 讓客戶端重試不會產生重複列；`(group_id, created_at desc)` 供日後計數查詢。**但速率限制仍無落點**：每次呼叫最多送 4,000（聊天）+ 10,000（檔案）字元到付費 provider，目前任何成員都能無限迴圈；檔案線的 8 GiB 上限沒有對應物。限流落點（伺服器端或每組每日計數）屬產品決定，列為 Adam 待決。

**cascade 語意對齊（Role 6 C-8）。** 上一版 `group_id` 用 `on delete cascade`，但 `group_chat_messages.group_id` 是 `on delete restrict`；有聊天訊息的群組本來就刪不掉，cascade 永遠不會單獨觸發，卻讓兩張相關表語意相反。現改為 `restrict` 對齊。

## 2. RPC 提案（未建立）

**上一版的矛盾（Role 6 B-1）。** 文件同時說「provider 在資料庫外，伺服器把結果寫回」、「`ask_group_ai` 寫入 `author_kind='ai'` 的訊息並回傳 `body`」、「只 `grant execute to authenticated`」。三者不能同時成立：若 authenticated 能呼叫一個會寫 AI 訊息的 RPC，**任何登入者都能在自己加入的群組裡製造「CityLink AI」說的話**——`group_chat_messages` 對 `authenticated` 是 `REVOKE ALL` 且零 policy，RPC 授權就是唯一閘門。

**改為兩段，寫回只在 `service_role`。**

| 函式                                | 執行身分              | 輸入                                                                                                                                                      | 回傳                                                                                | 行為                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `begin_group_ai_request`            | `authenticated`       | `p_group_id uuid, p_question text, p_file_ids uuid[], p_idempotency_key uuid`                                                                             | `request_id uuid, question text, turns jsonb, files jsonb, dropped_context boolean` | 驗證提問者是 `active` 成員且群組未 `abandoned`；驗證每個 `p_file_ids` 屬於本群組、`status='current'`、`retention_expires_at > now()`、最多 2 個；先做限流檢查（見下）；依第 3 節規則組 context；插入 `group_ai_requests`（`status='queued'`，同 key 重送回傳既有列）。**不寫訊息、不回傳 body。** |
| `finish_group_ai_request`           | **僅 `service_role`** | `p_request_id uuid, p_body text, p_truncated boolean, p_dropped_context boolean, p_chat_chars int, p_file_chars int, p_files_used int, p_error_code text` | `message_id uuid`                                                                   | 更新 request 列（`ready`／`failed`、`finished_at`）；成功時插入 `group_chat_messages`（`author_kind='ai'`、`sender_id=null`、`sender_name_snapshot='CityLink AI'`、`ai_request_id`、`truncated`）。`revoke all ... from public, anon, authenticated`，只 `grant execute to service_role`。        |
| `clear_group_ai_context`            | `authenticated`       | `p_group_id uuid`                                                                                                                                         | `context_starts_at timestamptz`                                                     | 任何成員可執行；只 `update ... set context_starts_at = now()`，不動任何訊息。                                                                                                                                                                                                                     |
| `list_group_chat_messages_ai`（新） | `authenticated`       | 與 `list_group_chat_messages` 相同簽章                                                                                                                    | 既有四個欄位 + `author_kind text, truncated boolean`                                | 新增的讀取函式，見下。                                                                                                                                                                                                                                                                            |

全部 `security definer`、`set search_path to ''`、actor 取自 `auth.uid()`；除 `finish_group_ai_request` 外 `revoke all ... from public, anon` 後 `grant execute to authenticated`。

**讀取為什麼是新函式而不是改舊的（Role 6 B-2）。** `list_group_chat_messages` 的實際簽章是 `RETURNS TABLE (message_id uuid, sender_name text, body text, created_at timestamptz)`；PostgreSQL **不允許** `CREATE OR REPLACE` 改回傳型別，加兩個欄位必須 `DROP FUNCTION` 再 `CREATE`。那會一併移除授權（現行 revoke/grant 在 migration 第 942、952 行），漏補就是整個聊天室對所有客戶端壞掉；`DROP` 在有依賴物件時也會失敗。因此沿用本專案已核准的 `_capacity` 模式：**新增 `list_group_chat_messages_ai`，舊的 `list_group_chat_messages` 一字不動**。這樣才是真正的 additive，不需要 DROP、不需要重發授權，也沒有舊客戶端風險——本專案對「舊客戶端會忽略額外欄位」有反例（PR #41 的 `can_create_post` 就是為嚴格 allowlist 而保留），不能假設。

**provider 呼叫不在資料庫內。** `begin_group_ai_request` 只做權限、資格、context 組裝與排隊；伺服器（Edge Function 或 Express，形狀已是 `server/ai/chat/answerQuestion.ts`）呼叫 OpenRouter／DeepSeek，再以 `service_role` 呼叫 `finish_group_ai_request` 寫回。資料庫不持有 key。

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

**計數方式（Role 6 C-5）。** 「CJK 與 emoji 各計 1」不能靠 JS 的 `String.length`——emoji 是 surrogate pair，`.length` 會算成 2。實作以 `Array.from(text).length`（codepoint）計數，測試以 CJK 與 emoji 覆蓋；若日後要改成 grapheme cluster（`Intl.Segmenter`），必須同時改文件與測試，不得默默分岔。字元不等於 token：4,000 + 10,000 的 CJK 對 token 約 1:1 至 1:2，屬 provider 成本而非正確性問題，記錄於此。

實作位置：`shared/aiChatContext.ts`（純函式，已附測試）。

## 4. 回答長度

- 目標 1,200–1,500 字元；硬上限 2,500 字元。
- 超過即截斷，附「（回答過長，已截斷）」，並在 `group_ai_requests` 記一筆（`truncated = true`）。
- **截斷提示字串本身計入 2,500**（Role 6 C-6 的措辭），因此使用者看到的 body 不超過上限。
- `group_chat_messages.body` 現有的 4,000 字元 CHECK **不改動**；2,500 是應用層政策，不是資料庫約束。

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
- **`author_kind` 的客戶端先行版（對應 Role 6 C-2）。** 讀取合約目前還沒有 `author_kind` 欄位（未套用），所以 `mapGroupChatMessages` 一律標記 `authorKind: "member"`，只有這個客戶端自己產生的 AI 回答標為 `"ai"`。前端**不再用 `sender_name_snapshot` 判斷是否為 AI**：把 display name 設成 `CityLink AI` 的成員，其訊息仍是成員訊息。schema 套用後，這個欄位改由伺服器回傳，渲染邏輯不變。

## 7. 揭露文字

**必須包含下列五項；其中第 1、4 項為逐字強制，測試以完全相等比對；其餘三項以包含比對（Role 6 C-7）。**

1. **「AI 會讀取本群組聊天記錄」**——逐字。本次提問、最近的對話、選取的檔案文字。
2. 內容會離開 CityLink，送到 OpenRouter 轉送的 DeepSeek，而 **DeepSeek 是中國大陸 provider**。
3. 回答會以「CityLink AI」名義寫進聊天室，全組可見。
4. **「前成員仍可讀取 AI 回答」**——逐字。退出或被移除後，聊天室歷史（含 AI 回答）仍可見。
5. 每次提問重新同意，不記住選擇。

實作位置：`client/src/lib/aiChatConsent.ts`（五條 statement，兩條標為 `requiredPhrase`，測試逐字比對這兩句；其餘三項以 `toContain` 檢查 provider 路徑與「CityLink AI」）。

## 8. 檔案範圍

只有本群組、`status = 'current'`、`retention_expires_at` 未過期的檔案可以被選取。`pending`、已替換、已刪除、已過期、他組的檔案一律排除，且排除發生在 context 組裝層（`isFileEligible`），不是只靠 UI 過濾——UI 過濾會被繞過，這一層不會。伺服器端在 `begin_group_ai_request` 內再驗一次，不信任客戶端傳來的檔案清單。

## 9. 錯誤 token

| token                        | 觸發條件                                       |
| ---------------------------- | ---------------------------------------------- |
| `group_ai_no_permission`     | 非成員、或非 `active` 成員嘗試提問             |
| `group_ai_group_abandoned`   | 群組已 `abandoned`                             |
| `group_ai_context_cleared`   | 成功清空 context（非錯誤，回傳用）             |
| `group_ai_file_not_eligible` | 選取的檔案非本群組、非 `current` 或已過期      |
| `group_ai_too_many_files`    | 選取超過 2 個                                  |
| `group_ai_question_empty`    | 提問空白                                       |
| `group_ai_provider_failed`   | provider 回錯或逾時                            |
| `group_ai_rate_limited`      | 超出每日或 in-flight 上限；附 `retry_after` 秒 |
| `ai_chat_consent_incomplete` | 客戶端同意未完成（僅前端）                     |

## 10. 不在本草案範圍

- 任何 SQL 檔或 migration；schema 變更需 Role 6 exact-head 審查與 Adam 指名授權。
- provider 實作與 key（後續獨立指派）。
- 既有 `group_analysis_plans` / `group_analysis_jobs` 的處置：不刪、不改，只停用。
- 速率限制的 SQL 實作本身（設計已定案於 §2.1，尚未寫成 migration）。
- 清空 context 的防濫用機制：Adam 已確認不做，維持任何成員可清空。

## 11. Role 6 審查處置（2026-11-24，對 `bd60b5c` / blob `73c9297`）

| 項  | 內容摘要                                                           | 處置                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | 寫入路徑自相矛盾；任何成員可偽造 AI 訊息；log 表停在 `queued`      | **已改寫**：拆成 `begin_group_ai_request`（authenticated）與 `finish_group_ai_request`（僅 `service_role`）；`group_ai_requests` 不再 revoke `service_role`。**已由 Adam 2026-11-24 批准**（寫回只經 `service_role`）。 |
| B-2 | `RETURNS TABLE` 加欄位不是 additive，需 DROP+CREATE                | **已改寫**：新增 `list_group_chat_messages_ai`，舊函式一字不動（沿用 `_capacity` 先例）。**已由 Adam 2026-11-24 批准**（新增 `list_group_chat_messages_ai`，舊函式不動）。                                              |
| C-1 | `ai_request_id` 只有註解、沒有約束                                 | **已修**：外鍵 + `group_chat_messages_ai_request_only_for_ai`。                                                                                                                                                         |
| C-2 | 名稱 CHECK 只約束一半，成員可用 display name 冒充                  | **已修**：文件明定前端一律以 `author_kind` 渲染，並列為 P2 驗收項；CHECK 的 drop/recreate 成本已記錄。                                                                                                                  |
| C-3 | 任何成員可反覆清空共享 context，無頻率限制、無稽核                 | **Adam 2026-11-24 確認維持原設計**：任何成員可清空，不加頻率限制、不加稽核。文件明寫這是共享重置。                                                                                                                      |
| C-4 | 無冪等鍵、無速率限制                                               | **冪等已修**（`idempotency_key` + unique）；**限流已定案**：RPC 內交易式檢查，見 §2.1（`group_ai_rate_limited` + `retry_after`）。                                                                                      |
| C-5 | 字元 ≠ token；emoji 與 `.length` 不一致                            | **已修**：文件寫明以 `Array.from().length` 計數，並保留改為 `Intl.Segmenter` 時必須同步改測試的規定。                                                                                                                   |
| C-6 | 「提示字元計入 2,500」語意不明                                     | **已修**：改寫為「截斷提示字串本身計入 2,500」。                                                                                                                                                                        |
| C-7 | 標題說兩句、清單五項                                               | **已修**：改寫為五項，第 1、4 項逐字強制，其餘包含比對。                                                                                                                                                                |
| C-8 | `group_ai_requests` cascade 與 `group_chat_messages` restrict 相反 | **已修**：改為 `on delete restrict`。                                                                                                                                                                                   |
| —   | `group_chat_messages` 無 trigger，插入 AI 列不會被擋               | **已記錄**於第 2 節。                                                                                                                                                                                                   |

Role 6 的審查對象是 `bd60b5c`（163 行、blob `73c9297`）；本版在其後修改了 §6（抽屜方向、`files={[]}` 限制）與 §1–§4、§7、§11。**因此需要一次 focused 複查**，範圍如 Role 6 自己所述：§1.3 的 revoke、§2 的兩段式 RPC、§2 的讀取函式，另加本節。
