# Role 6 最終確認：P1 migration（2026-11-24）

> 本檔為 Role 6 回覆的原文存檔，僅加入本段前言。原文由 Adam 於 2026-11-24 轉交。
> 審查對象為 PR #59 head `8aa3f9f`，pinned blob SHA-256 `b762bb2737bc2ef9930226becdbb50404b624784a628c316fabe28ed6c9bf50a`。
> **存檔時的結論仍成立**：該輪無新阻擋項。但 blob 之後因 Test preflight 發現 K-1（本檔未涵蓋，Role 6 的本地
> harness 無法觀察到）而改為 `82d6870b…`；第四、五節涉及該 blob 的敘述與第六節「service_role 為 f」的實測
> 僅適用於真實 Supabase 之外的環境，套用到 Test 前需以新 head 複查。

---

# Role 6 最終確認：P1 migration（PR #59 head `8aa3f9f`）

**審查對象：** `minstrel1014/CityLink`，PR #59 `feature/kayk-ai-project-room-files`，head `8aa3f9fe0cde4e0e76cf4c257edfde6075bdd166`，base `main`，draft，17 檔、+2374／−0。
**SQL blob：** `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql`，SHA-256 `b762bb2737bc2ef9930226becdbb50404b624784a628c316fabe28ed6c9bf50a`，與我上一輪審查的 529 行版本**位元相同**。
**性質：** GitHub 唯讀審查 + 我自己沙箱內的拋棄式 PostgreSQL 17.12 執行驗證。**未連線 Supabase Test 或 Main、未執行任何 migration 到真實專案、未修改 repo、未 push、未 merge、未改 PR 狀態。**

---

## 一、結論先講

**本輪沒有新的阻擋項。P1 SQL 這一輪可以關閉。**

這是這個 repo 少見的情況：SQL 不只是「靜態看起來對」，而是**真的套用得起來、權限姿態在執行期正確、未認證與非成員都確實被擋住**。我獨立重跑並加測了真實 schema 情境，全部通過。

剩下的不是 SQL 審查問題，是三件與 SQL 無關的事（見第四節）。

---

## 二、我上一輪的兩項建議：都做了，而且做得對

### 1. 簽名精確比對（`stage6GroupFilesSqlContract.test.ts` 第 159–189 行）

Kayk 實作了 `matches every revoke/grant signature to the function definition`：從每個函式定義抽出參數型別序列，組成 `schema.name(args)`，再斷言存在**完全相同**的 `revoke all on function …` 與 `grant execute on function …`。這正是把人工審查的那一眼自動化，實作正確。

我實測驗證了它的有效性：資料庫裡六個 RPC 的實際 identity 參數是
`request_group_file_upload(uuid, text, text, bigint)`、`confirm_group_file_upload(uuid, bigint, text)`、`list_group_files(uuid)`、`request_group_file_download(uuid)`、`replace_group_file(uuid, text, text, bigint)`、`delete_group_file(uuid)`——與 SQL 中的 REVOKE／GRANT 字串逐一相符。

### 2. 真的套用一次的測試（`server/stage6GroupFilesMigrationApplies.test.ts` + `server/fixtures/groupFilesStubSchema.sql`）

這是真的 `psql` 執行，不是模擬：建立臨時資料庫 → 套 stub → 套提案兩次 → 斷言 3 張表、≥6 個函式、3 個 RLS、0 個 policy → `finally` 刪除資料庫。寫法乾淨。

**我原本擔心 stub 會掩蓋真實 schema 的不相容，實測結果是：不會。** 見下一節。

---

## 三、我獨立重跑的證據（這是本輪新增的部分）

環境：`/tmp` 下全新 `initdb` 的 PostgreSQL 17.12，unix socket only、`listen_addresses=''`，無網路監聽。全程未接觸任何 Supabase 專案。

### 3.1 stub 情境（複製 Kayk 的測試步驟）

| 步驟                                    | 結果                                       |
| --------------------------------------- | ------------------------------------------ |
| 套 `groupFilesStubSchema.sql`           | exit 0                                     |
| 套提案第 1 次                           | exit 0                                     |
| 套提案第 2 次（冪等）                   | exit 0，僅 `already exists, skipping` 通知 |
| 3 張表／6 個函式／3 個 RLS／0 個 policy | `3 / 6 / 3 / 0` ✓                          |

### 3.2 真實 repo schema 情境（stub 的關鍵對照）

依序建立：最小 Supabase 形狀骨架（`anon`／`authenticated`／`service_role`、`auth.users`、`auth.uid()`）→ 真實 `supabase/schema.sql`（exit 0）→ 真實 `seed_citylink_fictional_courses.sql`（exit 0）→ **真實 11 個 migration 全部 exit 0**（含 `20261119090000_group_hard_max.sql`）。

然後套這份提案：

- 第 1 次 **exit 0**
- 第 2 次 **exit 0**（冪等）
- 六個 RPC 的實際 identity 參數與 SQL 宣告完全一致

**也就是說：提案對真實的 `study_groups`、`group_memberships`、`academic_terms`、`private.is_active_group_member` 定義完全相容，stub 沒有掩蓋任何東西。** 我上一輪對 stub 漂移的顧慮，實測後不成立。

### 3.3 執行期權限姿態（靜態測試只能近似的那部分）

| 檢查                                                  | 結果                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| 六個 public RPC 對 `authenticated`                    | 全部 `t` ✓                                                          |
| 六個 public RPC 對 `anon`                             | 全部 `f` ✓                                                          |
| 六個 public RPC 對 `service_role`                     | 全部 `f` ✓                                                          |
| 三個 private helper 對 `anon`／`authenticated`        | 全部 `f` ✓                                                          |
| 三張表對 `anon`／`authenticated`／`PUBLIC` 的直接授權 | 無（實測 `select` 得到 `permission denied for table group_files`）✓ |
| RLS 啟用／policy 數                                   | 3 張全開／0 ✓                                                       |

### 3.4 功能與 fail-closed（插入一筆真實資料後）

我建了一個 `active` 群組、一筆 `active` 成員、一筆 `current` 檔案，再用 `set role authenticated` 加可替換的 `auth.uid()` 測三種身分：

| 身分                | `list_group_files` | `request_group_file_download`        | `delete_group_file`           |
| ------------------- | ------------------ | ------------------------------------ | ----------------------------- |
| 現任成員            | 看到 1 筆 ✓        | 回傳 `object_key`／`original_name` ✓ | 成功，回傳 `object_key` ✓     |
| `auth.uid()` = NULL | 0 筆 ✓             | `group_files_no_permission` ✓        | `group_files_no_permission` ✓ |
| 非成員              | 0 筆 ✓             | `group_files_no_permission` ✓        | `group_files_no_permission` ✓ |

三種錯誤都走設計好的 token，沒有原生 PostgreSQL 錯誤外洩。

---

## 四、需要修正我自己上一輪的一項說法

我上一輪寫「確認保留期 5 個月已記入 `DECISIONS.md`（前次 R5 仍未關閉）」。**這個前提是錯的，R5 其實已經關閉。**

Adam 已於 2026-11-23 決定：A 學期自 9 月 1 日、B 學期自 1 月 10 日起算，**保留五個月**。PR 內的 `KAYK_ROLE6_REVIEW_R2_20261124.md` 第 8 行已明確把「四個月」標為 superseded。所以 SQL 的 `interval '5 months'` 是**正確**的，不是待決項。

但有一個真實的記錄缺口：**這個五個月的決定沒有進 `docs/team/DECISIONS.md`。** 我在該檔（508 行、含多筆 2026-11-23 條目）搜尋 retention／保留／month 皆無結果；決定目前只存在於 `docs/stage6/` 的工作文件中。依專案規則，Adam 的決定應記在 `docs/team/DECISIONS.md`，否則未來的審查會再次把它當成未決項（我這輪就差點如此）。

---

## 五、剩下的項目（都不是 SQL 阻擋項）

**N-1（建議處理，非阻擋）：apply 測試在沒有 PostgreSQL 的環境會靜默跳過。**
`describe.skipIf(!available)` 讓 `corepack pnpm test` 在普通 checkout 上完全得不到這個訊號，套件仍然全綠。檔案註解有誠實說明，但實務上「已驗證可套用」會變成一句沒有紀錄支撐的話。建議至少在有 PG 的環境跑一次並把輸出記進 PR，或在跳過時 `console.warn` 一行，避免下一個人以為它跑過了。

**N-2（記錄缺口）：把五個月保留期補進 `docs/team/DECISIONS.md`。** 一行即可，附 2026-11-23 的日期與來源。

**N-3（未來維護）：簽名測試的參數解析取每個參數的最後一個 token。** 目前正確，但若未來出現 `p_size bigint default 0`（會取到 `0`）或 `numeric(10,2)`（逗號會被誤切），測試會給出誤導性的失敗。建議在該測試加一行註解說明此限制。

**N-4（產品／UX，非安全）：`list_group_files` 無權限時回傳 0 筆，寫入 RPC 則拋 `group_files_no_permission`。** 讀取 fail-closed 是對的（實測確認不會洩漏），但客戶端無法區分「沒有檔案」與「沒有權限」。若希望 UI 能給出正確提示，需另外定義；不影響安全性。

**N-5（小事）：PR 標題是 `docs: record group-chat AI and file-storage decisions`，但內容含 SQL 與測試。** 不影響審查，只是日後追溯時標題與內容不符。

---

## 六、邊界與我沒有做的事

- 未連線 Supabase Test `wkzclgmhrtecnpexfesr` 或 Main `pijslbchvstkoweslymr`，未列舉任何專案。
- 未對任何真實專案套用 migration；所有執行都在我沙箱 `/tmp` 的拋棄式 PostgreSQL 17.12，結束後已停止。
- 未修改 repo、未 commit／push、未改 PR #59 狀態、未 merge、未 deploy、未 publish。
- 我的骨架是手寫的最小 Supabase 形狀（`auth.users` 只有三欄），所以 3.2 的結論是「對真實 CityLink schema 相容」，**不是**「對真實 Supabase 專案已驗證」。後者仍需 Test 上的 preflight 與七項行為實測。

---

## Adam's next action(s):

1. **決定 P1 SQL 審查是否就此關閉。** 目的：這輪的唯一目的是關掉 P1 SQL 審查。需要的動作：你確認接受本報告的「無新阻擋項」。可見結果：P1 SQL 由「未定案」改為「技術面定案，待 preflight 與實測」。解鎖：可以開始安排 Test preflight 與 client／adapter 實作。
2. **請 Kayk 把五個月保留期補進 `docs/team/DECISIONS.md`（一行）。** 目的：這個 2026-11-23 的決定目前只存在於 `docs/stage6/`，不在專案決策帳本；我這輪就因此一度誤判為未決。需要的動作：在協調任務派一個 docs-only 的小 assignment。可見結果：檢索 `DECISIONS.md` 就能找到保留期，未來審查不會重問。
3. **指定誰在 Test 上跑七項行為實測（含「被移除成員立即失去權限」）。** 目的：我這輪證明的是「未認證與非成員被擋住」，尚未證明「移除後立刻失效」與替換／刪除的完整流程。需要的動作：指定執行者並給出 Test 授權範圍。可見結果：產品規則在真實環境被驗證。解鎖：P1 可以進入實作與上線評估。
4. **（選配）決定 apply 測試要不要納入固定流程。** 目的：目前它在沒有 PostgreSQL 的環境靜默跳過。需要的動作：若你要它成為 gate，需指定一個提供 PostgreSQL 的執行環境。可見結果：「已驗證可套用」有可重複的紀錄。

**Coordinator/owner next action:** 本任務在 P1 這一輪結束後停止。若後續 SQL blob 有任何變更（SHA-256 不再是 `b762bb27…`），請以新的 finite assignment 指定確切 head，我重新核對；純 docs 變更不需再審 SQL。不輪詢、不自行重派。
