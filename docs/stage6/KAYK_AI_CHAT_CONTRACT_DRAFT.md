# 群組 AI 對話：技術合約草案（2026-11-24 設計變更後）

- **日期：** 2026-11-24
- **分支：** `feature/kayk-ai-analysis`
- **狀態：** 草案。**不是 migration、未套用、未經 Role 6 審查、不構成實作授權。**
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
  add column ai_request_id uuid,          -- 只對 author_kind = 'ai' 有值
  add column truncated boolean not null default false;

alter table public.group_chat_messages
  add constraint group_chat_messages_ai_has_no_sender
    check (author_kind <> 'ai' or sender_id is null),
  add constraint group_chat_messages_ai_name
    check (author_kind <> 'ai' or sender_name_snapshot = 'CityLink AI');
```

**為什麼一定要 `author_kind`。** `sender_id` 在帳號刪除時因 `ON DELETE SET NULL` 變成 NULL，所以「`sender_id is null`」同時代表「AI」與「已刪除帳號」。單靠 NULL 無法區分，前端會把已刪除帳號的舊訊息標成 CityLink AI，等於替產品說出它沒說過的話。`author_kind` 讓兩者分開，而 `group_chat_messages_ai_has_no_sender` 只是把「AI 沒有 profile」寫成約束，不是用來辨識 AI。

`truncated` 記錄該則回答是否被截斷，讓前端可以重畫提示，而不必靠 body 結尾的字串比對。

### 1.2 `public.group_ai_context`（每組一列）

```sql
create table public.group_ai_context (
  group_id uuid primary key references public.study_groups (id) on delete cascade,
  context_starts_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.group_ai_context enable row level security;
revoke all on table public.group_ai_context from public, anon, authenticated, service_role;
```

**清空 context 只移動 `context_starts_at`，不刪除任何訊息。** 任何成員都可以執行，包含剛加入的成員；這一條是產品行為，不是權限細節。

### 1.3 `public.group_ai_requests`（提問與 log）

```sql
create table public.group_ai_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  asked_by uuid references public.profiles (id) on delete set null,
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
  finished_at timestamptz
);
alter table public.group_ai_requests enable row level security;
revoke all on table public.group_ai_requests from public, anon, authenticated, service_role;
```

這張表是「同時記一筆 log」的落點：截斷、丟棄 context、用了幾個檔案與多少字元，都留在這裡，而不是只寫進伺服器日誌。`ai_request_id` 由訊息指向它，於是「這則回答為什麼被截斷」可以事後回答。

## 2. RPC 提案（未建立）

全部 `security definer`、`set search_path to ''`、actor 取自 `auth.uid()`、`revoke all ... from public, anon` 後只 `grant execute to authenticated`。

| 函式                               | 輸入                                                  | 回傳                                                                                      | 行為                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask_group_ai`                     | `p_group_id uuid, p_question text, p_file_ids uuid[]` | `request_id uuid, message_id uuid, body text, truncated boolean, dropped_context boolean` | 驗證提問者是 `active` 成員且群組未 `abandoned`；驗證每個 `p_file_ids` 屬於本群組、`status='current'`、`retention_expires_at > now()`；組 context（規則見第 3 節）；寫入 `group_ai_requests`；把回答以 `author_kind='ai'`、`sender_id=null`、`sender_name_snapshot='CityLink AI'` 寫進 `group_chat_messages`；回傳該訊息。 |
| `clear_group_ai_context`           | `p_group_id uuid`                                     | `context_starts_at timestamptz`                                                           | 任何成員可執行；只 `update ... set context_starts_at = now()`，不動任何訊息。                                                                                                                                                                                                                                             |
| `list_group_chat_messages`（既有） | 不變                                                  | 需新增 `author_kind`、`truncated` 兩個欄位                                                | 舊客戶端只讀 `senderName`/`body` 時仍可運作；新增欄位是 additive，但依 repo 慣例仍需 Role 6 確認舊客戶端相容性。                                                                                                                                                                                                          |

**provider 呼叫不在資料庫內。** `ask_group_ai` 只負責權限、context 組裝、寫入；實際呼叫 OpenRouter/DeepSeek 由伺服器端（Edge Function 或 Express）完成，再把結果寫回。資料庫不持有 key。

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

實作位置：`shared/aiChatContext.ts`（純函式，已附測試）。

## 4. 回答長度

- 目標 1,200–1,500 字元；硬上限 2,500 字元。
- 超過即截斷，附「（回答過長，已截斷）」，並在 `group_ai_requests` 記一筆（`truncated = true`）。
- 提示字元計入 2,500，所以使用者看到的 body 不會超過上限。
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
- **已知限制（Adam 2026-11-24 批准接受）**：這個分支還沒有群組檔案清單，所以 `GroupChatPage.tsx` 以 `files={[]}` 傳入，檔案選擇只在測試中被驗證。drawer 與 context 組裝層已接受檔案並執行「最多 2 個、合計 10,000 字元」的限制；接上真實檔案清單是獨立工作，不在本草案範圍。

## 7. 揭露文字（必須包含兩句）

1. **「AI 會讀取本群組聊天記錄」**——本次提問、最近的對話、選取的檔案文字。
2. 內容會離開 CityLink，送到 OpenRouter 轉送的 DeepSeek，而 **DeepSeek 是中國大陸 provider**。
3. 回答會以「CityLink AI」名義寫進聊天室，全組可見。
4. **「前成員仍可讀取 AI 回答」**——退出或被移除後，聊天室歷史（含 AI 回答）仍可見。
5. 每次提問重新同意，不記住選擇。

實作位置：`client/src/lib/aiChatConsent.ts`（測試逐字檢查這兩句）。

## 8. 檔案範圍

只有本群組、`status = 'current'`、`retention_expires_at` 未過期的檔案可以被選取。`pending`、已替換、已刪除、已過期、他組的檔案一律排除，且排除發生在 context 組裝層（`isFileEligible`），不是只靠 UI 過濾——UI 過濾會被繞過，這一層不會。

## 9. 錯誤 token

| token                        | 觸發條件                                  |
| ---------------------------- | ----------------------------------------- |
| `group_ai_no_permission`     | 非成員、或非 `active` 成員嘗試提問        |
| `group_ai_group_abandoned`   | 群組已 `abandoned`                        |
| `group_ai_context_cleared`   | 成功清空 context（非錯誤，回傳用）        |
| `group_ai_file_not_eligible` | 選取的檔案非本群組、非 `current` 或已過期 |
| `group_ai_too_many_files`    | 選取超過 2 個                             |
| `group_ai_question_empty`    | 提問空白                                  |
| `group_ai_provider_failed`   | provider 回錯或逾時                       |
| `ai_chat_consent_incomplete` | 客戶端同意未完成（僅前端）                |

## 10. 不在本草案範圍

- 任何 SQL 檔或 migration；schema 變更需 Role 6 exact-head 審查與 Adam 指名授權。
- provider 實作與 key（後續獨立指派）。
- 既有 `group_analysis_plans` / `group_analysis_jobs` 的處置：不刪、不改，只停用。
