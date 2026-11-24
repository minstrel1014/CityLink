# 群組分析計畫與工作：合約增補（草案）

- **日期：** 2026-11-24
- **分支：** `feature/kayk-ai-analysis`
- **狀態：** 草案。**不是 migration、未套用、未經 Role 6 審查、不構成實作授權。**
- **上層文件：** `KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md` 第 3、4、11 章。本文件只補它沒寫的兩張表，不改已定案的部分。

## 0. 這份增補為什麼存在

P1 已建立 `public.group_analysis_plans` 與 `public.group_analysis_jobs`，但**沒有任何 RPC 讀寫它們**。兩張表啟用了 RLS、零政策、並對 `public, anon, authenticated, service_role` 全部 revoke，所以現況是：任何角色都無法透過 PostgREST 直接讀寫，唯一合法的存取路徑是新的 `SECURITY DEFINER` RPC。若沒有這層 RPC，兩張表就是死資料。

本文件把 RPC 形狀、錯誤 token 與三項待決事項寫成可審查的條目。**不含任何 SQL 檔**；若之後要落地，需另開 migration、經 Role 6 exact-head 審查、再由 Adam 書面授權指名 ref、commit head 與 blob。

## 1. 兩張表的既有形狀（事實，非提案）

```sql
public.group_analysis_plans (
  group_id   uuid primary key references public.study_groups (id) on delete cascade,
  content    jsonb not null default '{}'::jsonb,
  revision   bigint not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
)

public.group_analysis_jobs (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  file_id    uuid not null references public.group_files (id) on delete cascade,
  status     text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
)
```

三個直接影響契約的事實：

1. **`revision` 由誰遞增沒有定義。** 表只有 `default 1`，沒有 trigger。任何「更新」都必須由 RPC 自己 `revision = revision + 1` 並寫 `updated_at`、`updated_by`，否則修訂號永遠停在 1，樂觀鎖就沒有意義。
2. **`group_analysis_jobs` 沒有唯一約束。** 同一 `(group_id, file_id)` 可以同時存在多筆 `queued`，也就是同一個檔案可以被重複排隊、重複計費。這不是提案可以自行修補的缺口，見 §5 第 1 項。
3. **`status` 沒有 `cancelled`。** 使用者取消分析只能刪列或留在 `failed`，兩者語意都不對；見 §5 第 2 項。

## 2. 計畫的 RPC 形狀

所有函式：`security definer`、`set search_path to ''`、actor 取自 `auth.uid()`、進入點先呼叫 `private.can_access_group_files(p_group_id)`，失敗即拋 token。`revoke all ... from public, anon` 後只 `grant execute to authenticated`。

| 函式                       | 輸入                                                           | 回傳                                                                      | 行為                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `get_group_analysis_plan`  | `p_group_id uuid`                                              | `content jsonb, revision bigint, updated_at timestamptz, updated_by uuid` | 沒有列時回 `content = '{}'`、`revision = 0`、其餘 NULL，**不建立列**。讓「尚未建立計畫」與「空計畫」在讀取端可區分（`revision = 0`）。 |
| `save_group_analysis_plan` | `p_group_id uuid, p_content jsonb, p_expected_revision bigint` | `revision bigint, updated_at timestamptz`                                 | 見 §3：行為取決於 Adam 的併發決定。交易內先重驗 predicate，再寫入，最後才回傳。                                                        |

`p_content` 的大小需有上限（建議 64 KiB），否則 jsonb 可以當成免費儲存使用；上限值待定，不在本文件自行決定。

## 3. 併發：三種形狀，一種實作

`p_expected_revision` 的語意隨 Adam 的選擇而變。三者的差異**只在 `save_group_analysis_plan` 的函式體內**，對外簽名相同，所以客戶端可以先寫成同一支呼叫：

| 模式           | `p_expected_revision` | 函式行為                                           | 失敗時                                                                |
| -------------- | --------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| A 最後寫入覆蓋 | 忽略（可傳 NULL）     | 直接覆寫並 `revision + 1`                          | 不會失敗                                                              |
| B 樂觀鎖       | 必填                  | `where revision = p_expected_revision`，0 列即拒絕 | `group_analysis_plan_conflict`，並回傳目前 `revision` 與 `updated_by` |
| C 序列化鎖     | 忽略                  | `select ... for update` 後再寫                     | 阻塞，不失敗                                                          |

客戶端目前**拒絕送出任何存檔請求**：`shared/groupAnalysisPlan.ts` 的 `PLAN_CONCURRENCY_MODE` 是 `"undecided"`，`buildSavePlanRequest()` 會拋 `group_analysis_plan_concurrency_undecided`。這是刻意的——選項 A 會靜默吃掉一位成員的內容，不能由先寫客戶端的人代為決定。

## 4. 工作的 RPC 形狀

| 函式                         | 輸入                              | 回傳                                                                   | 行為                                                                                                                                                         |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enqueue_group_analysis_job` | `p_group_id uuid, p_file_id uuid` | `job_id uuid, status text`                                             | 驗 predicate；驗該檔屬於該群組且 `status = 'current'`；若已有同檔的 `queued`/`processing` 工作則回傳既有 `job_id`（冪等），不新增第二筆；否則插入 `queued`。 |
| `get_group_analysis_job`     | `p_job_id uuid`                   | `id, file_id, status, error_code, started_at, finished_at, created_at` | 以 `group_id` 一併過濾，查詢一律帶群組條件，**不得出現只用 `file_id` 或 `job_id` 的路徑**（合約第 9 章）。                                                   |
| `list_group_analysis_jobs`   | `p_group_id uuid`                 | setof 同上                                                             | 只回該群組，依 `created_at desc`。                                                                                                                           |

「冪等」是函式內先查後插，**不是**資料庫約束；在併發呼叫下兩個交易仍可能都通過檢查。真正的解法是唯一部分索引（§5 第 1 項），在它存在之前，這個冪等性只是盡力而為，文件必須這樣寫，不能寫成保證。

## 5. 三個必須由 Adam 或 Role 6 決定的項目

1. **是否為 `group_analysis_jobs` 加唯一部分索引** `(group_id, file_id) where status in ('queued','processing')`。不加，則重複排隊靠應用層運氣；加，則需要一個新的錯誤 token（`group_analysis_already_queued`）與一次 SQL 修訂。這是 P1 的缺口，不是本增補能補的。
2. **是否需要 `cancelled` 狀態。** 目前 `status` 的 check 沒有它。使用者按下取消後，列要嘛刪除（失去稽核），要嘛留 `failed`（語意錯誤）。
3. **分析結果是否寫回資料列。** `group_analysis_jobs` 沒有 `result jsonb` 欄位。若結果要保存，需要新欄位與保留期規則（與檔案保留期是否共用？過期後結果是否一併刪除？）；若不保存，則結果只在回應中出現一次，重新整理即消失。這是 Adam 的產品決定，列在回報的問題清單中。

## 6. 錯誤 token（本增補新增）

沿用「前端以 token 對應訊息，不比對文字」的慣例。以下為本增補提出的集合，**尚未寫進任何 SQL**：

| token                                       | 觸發條件                                                  | 前端行為                                             |
| ------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `group_files_no_permission`                 | predicate 不通過（非成員、`left`、`removed`、無 session） | 顯示無權限，不引導聯絡 leader                        |
| `group_files_group_abandoned`               | 群組 `status = 'abandoned'`                               | 顯示群組已解散                                       |
| `group_analysis_plan_conflict`              | 樂觀鎖修訂號不符                                          | 顯示目前版本與自己的版本，讓使用者選擇               |
| `group_analysis_plan_concurrency_undecided` | 客戶端尚未取得併發決定                                    | 開發期錯誤，不應出現在正式介面                       |
| `group_analysis_file_not_current`           | 檔案已刪除、已替換或不是 `current`                        | 重新載入清單                                         |
| `group_analysis_already_queued`             | 同檔已有進行中的工作（若採 §5 第 1 項的唯一索引）         | 顯示「已排隊」，不重複送出                           |
| `group_analysis_unsupported_format`         | 抽取結果為 `unsupported_format`                           | 顯示「已上傳，此格式目前無法分析」，**下載連結保留** |
| `group_analysis_job_not_found`              | `job_id` 不存在或不屬於該群組                             | 重新載入                                             |

## 7. 不在本增補範圍

- 任何 SQL 檔或 migration。若要把 §2、§4 落地，需新檔案、Role 6 exact-head 審查、Adam 指名授權。
- provider 選擇與呼叫方式（Adam 已定 OpenRouter + DeepSeek，但 adapter 是後續獨立指派）。
- 保留期與結果保存（§5 第 3 項）。
- 前端實際呼叫路徑：目前只有 `shared/groupAnalysisPlan.ts` 的請求建構與 `GroupAnalysisConsent.tsx` 的同意畫面，兩者都不連網。
