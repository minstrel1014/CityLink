**存檔說明。** 本檔為 Role 6 於 2026-11-23 對 draft PR #59 的正式書面審查回覆原文，由 Adam 提供，內容未改動。審查標的為 `feature/kayk-ai-project-room-files` head `79063cd10139a956fdee85f9c9d35e48ab69ca17`；審查性質為技術意見，不是批准，也不是 migration、Storage、OAuth 或實作授權。Kayk 已據此撰寫 `KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md`。

# Role 6 審查回覆：群組聊天室 AI 作業分析與檔案

**審查標的（唯讀）：** repository `minstrel1014/CityLink`；分支 `feature/kayk-ai-project-room-files`；head `79063cd10139a956fdee85f9c9d35e48ab69ca17`；draft PR #59；base `main`。
**變更範圍：** 5 個檔案、+313／−0，全部為文件（`docs/team/DECISIONS.md`、`docs/stage6/KAYK_AI_FILE_TECHNICAL_REVIEW_PROPOSAL.md`、`KAYK_CLOUD_DRIVE_API_COMPARISON.md`、`KAYK_CLOUD_STORAGE_RESEARCH.md`、`KAYK_FREE_TIER_CAPACITY_AND_RATE_LIMITS.md`）。無程式碼、migration、schema、Storage 或 RLS 變更。
**審查者：** Role 6（database security and migration review；人名仍待 Adam 提供）。
**審查性質：** 正式書面技術審查意見。不是批准，也不是 migration、Storage、OAuth 或實作授權。

**邊界實際遵守情況：** 全程唯讀靜態審查。未存取 Supabase Test 或 Main、未執行任何 SQL、未查詢 catalog、未建立 bucket 或 migration、未套用任何變更、未 merge／deploy／publish、未指定 provider 或帳戶類型。所有 repo 事實均以 `79063cd` 的檔案內容為依據；Storage 限制引用 Supabase 官方文件（非專案內資料）。

**一個前置更正：** 提案內文第 3 行寫審查 head 為 `6804fdc`，但分支實際 head 是 `79063cd`（該 commit 只新增本審查請求與 PR 狀態刷新，未改動其餘內容）。本回覆以 `79063cd` 為準。

---

## 總體結論

**功能方向可行，但目前不可進入實作。** 有 **2 項技術修改要求**（其中 1 項是安全性的硬性要求）與 **6 項必須先由 Adam 決定的阻擋項**。最關鍵的一條是：**檔案與共用計畫絕不可重用聊天室現有的可讀權限**，因為該 predicate 明確允許已離開與已被移除的成員讀取。這一條若被誤用，等於把檔案開放給前成員，而且是靜默的。

值得指出的是：這個功能需要的授權原語**已經存在於 repo**，不需要新發明。`private.is_active_group_member(group_id, profile_id)` 已定義於 `supabase/migrations/20261102131343_stage5_groups.sql:281-296`，語意正好是「現任成員」——`membership_status = 'active'`、`SECURITY DEFINER`、`search_path = ''`。檔案功能應建立在這之上，而不是建立新的 membership 判斷。

---

## 逐題回覆

### 1. 身分與授權 — **需修改**（若沿用聊天室可讀權限）／其餘 **可行**

**Repo 事實（必須先講清楚）：**

| 既有 predicate                               | 位置                                                | 允許的 membership_status                    | 對本功能的意義                          |
| -------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| `private.can_read_group_chat(uuid)`          | `20261118050000_stage6_chat_recruitment.sql:95-111` | `'active'`, `'left'`, `'removed'`           | **不可重用** — 前成員與被移除者都能通過 |
| `private.can_send_group_chat(uuid)`          | 同上 `:113-130`                                     | 僅 `'active'`，且 `g.status <> 'abandoned'` | 語意接近，但綁在聊天室寫入              |
| `private.is_active_group_member(uuid, uuid)` | `20261102131343_stage5_groups.sql:281-296`          | 僅 `'active'`                               | **建議的基礎原語**                      |

提案第 43 行正確觀察到「現有聊天室授權允許部分已離開群組的前成員查看歷史訊息」。我確認此事屬實，並補上精確位置：`can_read_group_chat` 的 `m.membership_status IN ('active', 'left', 'removed')`。因此該 predicate 對檔案是**不安全**的，不可直接沿用。

**建議的授權邊界（技術提案，非實作授權）：**

1. 新增單一 predicate `private.can_access_group_files(p_group_id uuid) returns boolean`，語意為「`auth.uid()` 非空 且 `private.is_active_group_member(p_group_id, auth.uid())` 且 該 group 的 `status <> 'abandoned'`」。群組狀態值域為 `('forming','active','abandoned')`（`20261102131343_stage5_groups.sql:35`）；`abandoned` 必須排除，理由與 `can_send_group_chat:67` 相同。
2. **所有**檔案與計畫的 RPC 第一行檢查此 predicate，並以 `RAISE EXCEPTION` 帶固定 token 失敗關閉（沿用現有慣例，例如 `group_capacity_upgrade_required` 這種穩定 token 做法）。
3. Storage 端的 `storage.objects` RLS policy 使用**同一個** predicate，並綁定路徑前綴（物件路徑必須以該 `group_id` 開頭）。這樣即使前端被繞過，直接呼叫 Storage API 也拿不到別的群組的物件。
4. 下載一律「先驗證、再換短效簽名 URL」，不在清單回應中直接回傳 URL，也不使用 `getPublicUrl`（私有 bucket）。

**每次請求都驗證，而不是信任前端：** RPC 為 `SECURITY DEFINER` 且 `search_path = ''`，actor 一律取自 `auth.uid()`，不接受呼叫端傳入的 profile id——這與 repo 現有慣例一致（見 `20261118050000:92-95` 的註解：「Private helpers use auth.uid() rather than a caller-supplied actor ID」）。

**移除後如何拒絕新請求：** 不需要額外的撤銷動作。成員被移除時 `membership_status` 由 `'active'` 改變，predicate 立刻為 false，下一個請求即被拒。這是**即時**的，且不依賴任何快取失效。

**既有連結在有效期內仍可用（Adam 已決定）之風險與建議有效期：** 見第 2 題——技術上無法個別撤銷簽名 URL，所以「不立即失效」不是妥協而是現況；可控的只有 TTL。建議 **60–300 秒**，每次請求重簽；風險窗口即等於 TTL。

### 2. 檔案流程 — **需修改**（替換策略）／其餘 **可行**

**建議的 RPC 契約（技術提案）：**

| 步驟     | 契約                                                                                                                         | 授權與行為                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 上傳意圖 | `request_group_file_upload(p_group_id, p_original_name, p_mime_type, p_byte_size)` → `(file_id, storage_path, upload_token)` | 驗 predicate、驗 `p_byte_size <= 104857600`、配置不可猜測的新路徑；回傳後由用戶端直傳 Storage |
| 完成確認 | `confirm_group_file_upload(p_file_id, p_sha256)`                                                                             | 以 Storage 物件的實際 metadata 核對大小與內容類型，才算建立成功；未確認的列不得出現在清單     |
| 清單     | `list_group_files(p_group_id)`                                                                                               | 只回 metadata，**不回 URL**                                                                   |
| 下載     | `request_group_file_download(p_file_id)` → 短效簽名 URL                                                                      | 每次呼叫重驗 predicate，重簽 TTL                                                              |
| 替換     | `replace_group_file(p_file_id, p_original_name, p_mime_type, p_byte_size)`                                                   | 寫入**新路徑**、把 `uploaded_by` 改為替換者、刪除舊物件                                       |
| 刪除     | `delete_group_file(p_file_id)`                                                                                               | 僅「目前版本的上傳者」可刪；刪除 Storage 物件與列                                             |

**替換必須寫新路徑、不可原地覆寫（`x-upsert`）。** 理由是 Supabase 官方文件明確說明覆寫會有 CDN 傳播延遲，導致邊緣節點短時間回傳舊內容（`resumable-uploads` 文件「Overwriting files」段：建議上傳到新路徑以避免 stale content）。若原地覆寫，舊連結在傳播期間仍可能取到舊內容，這與「替換不保留被替換內容」的產品要求直接衝突。

**「已發出連結在物件替換／刪除後不得再取到內容」如何達成：** 靠**刪除物件**，而不是靠撤銷 URL。簽名 URL 指向一個路徑；物件被刪除後該 URL 取不到內容。請注意兩個限制：

1. **簽名 URL 無法個別撤銷。** 官方文件寫明「You can't revoke individual signed URLs. To revoke all signed URLs, rotate your project's URL signing key」。旋轉簽名金鑰是**全域**動作，會讓所有未到期連結同時失效，不能當成個別成員的處置手段。
2. CDN 傳播需要時間，因此刪除後可能有短暫窗口仍取得到。若要求嚴格即時，需在 `request_group_file_download` 內再查一次列的狀態（`status='current'`），把「已刪除」的列直接拒絕簽發。

**兩個例外必須嚴格分開，不可互相延伸：**

- **成員被移除** → 物件仍在（產品要求不刪檔），已發出連結在原 TTL 內仍可用。這是 Adam 的決定，機制上是 TTL，不是撤銷。
- **檔案被替換或刪除** → 物件必須消失，任何連結都不得再取到內容。此處**不套用**成員移除的例外。

### 3. 任意檔案與限制 — **需修改**（100 MB 在目前方案不可行）

**100 MB 是硬性環境限制，不是設計選擇：**

- Supabase Storage 的 _Global file size limit_：**Free 方案上限 50 MB**；Pro 及以上可設到 500 GB。per-bucket 限制必須低於全域限制。（來源：Supabase 官方 `storage/uploads/file-limits`）
- 標準上傳路徑建議僅用於 6 MB 以下；超過需用 **resumable／TUS**，chunk size 固定 6 MB。（來源：`storage/uploads/resumable-uploads`）

**結論：** 在 Free 方案上「單檔 100 MB」**不可能實作**。要嘛升到 Pro 以上並把全域限制設到 ≥100 MB、bucket 限制設 100 MB，要嘛把產品上限下修。這需要 Adam 決定（見阻擋項 1）。同時，100 MB 上傳**必須**走 resumable 路徑，不能只用 `storage.from().upload()`。

**伺服器端如何落實：**

1. 意圖階段檢查 `byte_size`（不得超過上限），並限制每位成員／每群組的併發未完成上傳數，避免以意圖佔位耗盡配額。
2. 完成確認階段以 Storage 物件的實際大小與 `content_type` 為準，不信任用戶端宣告。
3. 副檔名與實際內容不符：以 **magic byte 嗅探**判斷真實類型，儲存時以嗅探結果為準，並保留用戶端宣告值供稽核比對；不一致時不阻擋上傳（產品要求接受所有類型），但**不得**以宣告類型決定呈現方式。
4. 惡意檔案：私有 bucket、下載一律 `Content-Disposition: attachment` 加 `X-Content-Type-Options: nosniff`、絕不在本站 origin inline 呈現 HTML／SVG／PDF。是否加做 AV 掃描（ClamAV 或雲端掃描）屬額外成本與延遲，**待 Adam 決定**。
5. 檔名淨化：Supabase 對物件名稱有字元限制（僅允許英數與 `_ - . ' , ! * & $ @ = ; : + ? ( )` 與空白），因此 `original_name` 只作為資料庫欄位保存供顯示，實際物件路徑必須使用產生的識別碼，不可直接使用使用者檔名。

**「接受所有檔案」與「AI 能分析」必須分開呈現：** 這是兩個獨立狀態，不是同一個布林值。建議檔案列同時保存 `upload_status`（`pending`／`current`）與 `analysis_status`（`not_requested`／`processing`／`ready`／`unsupported_format`／`failed`）。上傳成功但格式無法解析時，UI 顯示「已上傳，此格式目前無法分析」並允許下載，**不得**拒絕上傳，也**不得**把「接受所有類型」表述成「所有格式都能分析」。可分析的格式清單應由 AI adapter 宣告，而不是散落在 UI。

### 4. 保留與移除成員 — **待 Adam 決定**（3 項）／機制 **可行**

**學期起始日的權威來源：存在，但目前資料不足。** 權威鏈為 `public.citylink_settings.current_term_id` → `public.academic_terms.starts_on`（`20261102090000_stage5_term_model.sql:20-36`）。問題是：

- `academic_terms.starts_on` 是 **nullable**；
- 現行 migration 只以 `insert ... select distinct btrim(c.semester)` 建 term，**只填 `code`，不填 `starts_on`**（同檔 `:40-46`）。

因此在目前的資料狀態下，**9 月 1 日與 1 月 10 日無法被計算出來**。這不是設計問題，是資料要求：要嘛要求 `starts_on` 必須被填寫（含 backfill 與 NOT NULL 約束），要嘛定義 fallback 規則。**待 Adam 決定**。

**五個月如何計算：待 Adam 決定。** 日曆月（`starts_on + interval '5 months'`）與 150 天在跨月時不同；到期時刻與時區也未定（建議固定為該日 `23:59:59` 於專案時區）。這會直接影響 `retention_expires_at` 的語意，必須先定。

**到期如何執行與驗證：** 建議 `group_files.retention_expires_at` 於建立時以 term 計算並寫入（不可每次查詢時動態算，否則 term 改動會追溯改變歷史）。實際刪除需定期 job——`pg_cron` 或外部排程皆可，但**這屬於部署層決定，目前未授權**，且需與「不得自動刪除目前群組檔案」的界線區分：到期刪除是保留政策，成員移除**不**觸發刪除。

**成員被移除時：**

- 目前檔案**保留**（產品要求），不刪任何物件；
- 該成員的新檔案／API 請求即刻被拒（predicate 即時為 false）；
- 共用計畫的讀寫同樣被拒（同一 predicate）。
- repo 已有可直接仿效的先例：`private.close_recruitment_posts_on_membership_end()` 與其 trigger（`20261118050000:851-882`）在 `membership_status` 由 `active` 改變時做事。若共用計畫需要在成員離開時遞增 revision 或標記，應沿用這個 trigger 模式，而不是在每個 RPC 裡散落地處理。

### 5. AI 資料流 — **待 Adam 決定**

**伺服器端邊界（可行）：** 分析工作以 `(group_id, file_id)` 建立；伺服器只讀取該 `file_id` 對應的物件，且在讀取前重驗該檔案仍屬該群組且 `status='current'`。查詢一律帶 `group_id` 條件，不得出現「以 file_id 單獨查詢」的路徑。AI **不讀取聊天訊息**、不跨群組讀取——這兩點應寫進 RPC 的註解與測試，而不是只寫在文件。

**是否向第三方傳送檔案：這正是需要 Adam 決定的核心。** 若採外部 LLM provider，檔案內容（可能含個資、未發表教材）會出境至第三方。此時需要：(a) 對使用者的資料處理揭露，或 (b) 明確同意，或 (c) 選擇不將內容外傳的處理方式。產品文件第 37 行已正確指出「處理時只需告知正在處理」不免除實際適用的隱私與第三方告知義務。**我不在審查中指定 provider**，也不假設哪一種揭露方式足夠——這需要 Adam 作產品與法務層面的決定。

**建議的降低風險做法：** 先把「無 provider 的契約與狀態機」做完（上傳、狀態、UI 呈現、權限、計畫儲存），provider 決定後只替換一個 adapter 介面。這樣 provider 選擇不會阻塞前面的工作，也不會讓契約被特定 provider 綁死。

### 6. 共同計畫 — **待 Adam 決定**（版本策略）／儲存與授權 **可行**

**儲存與授權：** `public.group_analysis_plans(group_id uuid primary key references study_groups, content jsonb not null, revision bigint not null default 1, updated_by uuid, updated_at timestamptz)`。讀寫皆經 predicate 檢查；所有現任成員可讀可寫，符合產品要求。RLS 啟用且僅允許經 RPC 存取（與現有 chat／recruitment 表的做法一致）。

**併發處理——三個選項與影響（不代為選擇）：**

| 選項                                                  | 行為                                                   | 影響                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| A. 最後寫入覆蓋（LWW）                                | 後儲存者勝出                                           | 實作最簡單；兩人同時編輯時前者內容靜默消失，無提示                             |
| B. 樂觀鎖（`revision` 比對）                          | 儲存時帶 `expected_revision`；不符則拒絕並回傳目前版本 | 不會靜默遺失；需 UI 提示「內容已更新」並讓使用者合併或重載；多一個錯誤路徑要測 |
| C. 序列化（`SELECT ... FOR UPDATE` 或 advisory lock） | 同一時間僅一人可儲存，其餘等待                         | 保證一致但會阻塞；長交易風險；對「多人同時編輯」體驗最差                       |

**成員在儲存期間被移除：** 交易內重驗 predicate，失敗則整個儲存回滾並回傳權限錯誤——不可「先寫入再檢查」。

**舊頁面覆寫新內容：** 只有選項 B 能偵測。若 Adam 選 A 或 C，需明確接受該風險並寫入文件，而不是留給實作自行決定。

### 7. 錯誤與 QA — **可行**

**可由 mock／單元測試驗證（不需要資料庫授權）：**

1. predicate 的四種身分：非成員、前成員（`left`）、被移除者（`removed`）、現任成員——前兩者與被移除者必須全部被拒。**這一組是本功能最重要的測試**，且必須包含「前成員不得因聊天室可讀而取得檔案」的回歸案例。
2. 上傳者 vs 非上傳者：非上傳者現任成員可替換、不可刪除；替換後原上傳者失去刪除權、替換者取得。
3. 大小上限：`104857600` 通過、`104857601` 拒絕；未完成確認的上傳不出現在清單。
4. 格式：可分析格式進入 `processing`；不可分析格式為 `unsupported_format` 但仍可下載。
5. 已刪除／已替換的檔案：`request_group_file_download` 拒絕簽發。
6. 計畫併發：依所選策略驗證對應行為（B 需驗證 `expected_revision` 不符時的拒絕與回傳內容）。
7. 群組 `abandoned` 時拒絕所有檔案與計畫操作。

**必須等 Test 授權後才能做的 live QA（本階段不執行）：**

1. 真實 Storage RLS：以非成員 token 直呼 Storage API 上傳／下載他組物件，必須被拒——這只能對真實 Storage 驗證。
2. 簽名 URL 的實際 TTL 與刪除後的行為（含 CDN 傳播窗口實測）。
3. 100 MB 實際上傳（需 resumable）與中斷續傳。
4. 多帳號同時編輯計畫（真正的併發，不是 mock）。
5. 成員移除後以該帳號重放舊請求與舊連結。
6. 保留到期 job 的實際執行（需排程環境）。

---

## 技術提案（草案，未套用、未經最終審查）

以下僅為輪廓，供 Kayk 撰寫技術合約時參考；**不是 migration，未經 Role 6 最終審查，未套用至任何環境**。正式草案需另開分支與獨立 review。

- **新表：** `public.group_files`（`id`、`group_id`、`uploaded_by`、`storage_path` unique、`original_name`、`detected_mime`、`declared_mime`、`byte_size`、`sha256`、`status ∈ ('pending','current')`、`analysis_status`、`retention_expires_at`、`created_at`、`replaced_at`、`deleted_at`）；`public.group_analysis_plans`（見第 6 題）；`public.group_analysis_jobs`（`id`、`group_id`、`file_id`、`status`、`error_code`、`started_at`、`finished_at`）。
- **新 predicate：** `private.can_access_group_files(uuid)`，建立於 `private.is_active_group_member` 之上並排除 `abandoned`。
- **RPC：** 第 2 題表格中的六個函式，全部 `SECURITY DEFINER`、`search_path = ''`、`revoke all from public, anon`、`grant execute to authenticated`（與現有 Stage 6 函式一致，見 `20261118050000:929-930` 的 revoke 慣例）。
- **Storage：** 單一私有 bucket；`storage.objects` 的 select／insert policy 綁定路徑前綴與同一 predicate；不使用 public bucket、不使用 `getPublicUrl`。

---

## 會阻止實作的項目

| #   | 阻擋項                                                                                                                                              | 性質       | 需要誰           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- |
| 1   | **100 MB 在 Free 方案不可能**（上限 50 MB）；需 Pro 以上並設定全域與 bucket 限制                                                                    | 環境／成本 | Adam             |
| 2   | **簽名 URL 無法個別撤銷**；「移除後舊連結仍可用」只能靠 TTL 控制，需定 TTL 政策                                                                     | 產品／安全 | Adam             |
| 3   | **儲存位置未決**：Supabase Storage vs 外部硬碟（Google Drive）。後者需 service account／OAuth、refresh token 保管、共享磁碟配額與完全不同的權限模型 | 架構       | Adam             |
| 4   | **AI provider 與資料揭露／同意**未決                                                                                                                | 產品／法務 | Adam             |
| 5   | **`academic_terms.starts_on` 為 nullable 且現行資料未填** → 保留期無法計算                                                                          | 資料要求   | Adam／資料負責人 |
| 6   | **保留到期需要排程執行**（pg_cron 或外部），屬部署決定，目前未授權                                                                                  | 部署       | Adam             |

另有 2 項**技術修改要求**（不是 Adam 的決定，是實作必須遵守）：

- **不可重用 `private.can_read_group_chat`** 作為檔案或計畫的授權（它允許 `left` 與 `removed`）。
- **替換不得原地覆寫物件**，必須寫新路徑並刪除舊物件（CDN 傳播會讓舊內容在舊連結上存活）。

---

## 與既有 contract 的相容性

- 本功能不修改任何既有 RPC 的簽名或回傳形狀，因此不觸發 capacity 相容性那套舊客戶端保護需求。
- 新增 predicate 與 RPC 應沿用現有慣例：`SECURITY DEFINER` + `search_path = ''` + `auth.uid()` 取值 + `revoke`/`grant authenticated`。若新函式未比照，會在未來的 security review 被退回。
- `private` schema 內的 helper 一律 `revoke all ... from public, anon, authenticated`（見 `20261118050000:929-930`），新 predicate 必須比照，否則會成為 PostgREST 可呼叫的授權旁路。

---

## 我沒有做的事（避免誤解）

未選定 provider 或帳戶類型；未假設 100 MB 在現行方案可行（事實相反）；未把本文件或先前唯讀審查當成已批准合約；未撰寫或套用 migration；未存取 Test 或 Main；未修改 PR #59 任何檔案、未 merge、未改變 draft 狀態。

---

## Adam's next action(s):

1. **決定儲存方案與配額（阻擋項 1、3）。** 目的：100 MB 在 Free 方案不可能，且 Supabase Storage 與外部硬碟（Google Drive）是兩套完全不同的權限與憑證模型，選錯會讓整份技術合約重寫。目標：PR #59 討論串或 `docs/team/DECISIONS.md`。需要的決定：採用哪個儲存後端、方案等級、以及是否授權建立 bucket 或 OAuth 應用程式。可見結果：Kayk 可以開始寫定稿技術合約。解鎖：技術合約草案撰寫（目前唯一前置卡點）。
2. **決定簽名 URL 有效期（阻擋項 2）。** 目的：技術上無法個別撤銷簽名 URL，「移除成員後舊連結仍可用」的風險窗口完全等於 TTL。需要的決定：TTL 數值（建議 60–300 秒）。可見結果：風險窗口有了明確數字，而不是「不會立即失效」這句描述。
3. **決定保留期的兩個細節（阻擋項 5，以及五個月的定義）。** 目的：`academic_terms.starts_on` 目前是 nullable 且未被填寫，9 月 1 日／1 月 10 日算不出來；且「五個月」是日曆月還是 150 天、到期時刻與時區都未定。需要的決定：是否要求 `starts_on` 必填並 backfill、以及月／日與時區的精確定義。可見結果：`retention_expires_at` 可以被計算與測試。
4. **決定 AI provider 與資料揭露方式（阻擋項 4）。** 目的：若檔案內容會送至第三方，需要揭露或同意；這不是技術團隊可以代替產品決定的事。需要的決定：是否允許外傳、以及揭露或同意的形式。可見結果：AI 資料流可以定稿；在此之前建議只做「無 provider」的契約與狀態機。
5. **確認保留到期的執行機制（阻擋項 6）。** 目的：到期刪除需要排程，屬部署層決定且目前未授權。需要的決定：`pg_cron` 或外部排程，以及由誰維運。可見結果：保留政策從「規則」變成「會實際執行的機制」。

**Coordinator/owner next action:** 本回覆為唯讀審查意見，未改動 PR #59、未 merge、未套用任何變更。Kayk 收到後可據此撰寫技術合約草案；若需要我對草案做獨立 review，那是另一個 finite assignment，需要指定分支與 exact head。本任務在交付此回覆後停止。
