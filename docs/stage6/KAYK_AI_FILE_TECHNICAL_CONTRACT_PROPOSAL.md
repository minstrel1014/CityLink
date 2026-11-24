# CityLink 群組聊天室 AI 作業分析與檔案：技術合約提案（草案）

- **日期：** 2026-11-23
- **Human owner：** Kayk（base role：Role 4 — Group Invitation Feature Owner，保留原角色）
- **分支：** `feature/kayk-ai-project-room-files`
- **狀態：** 草案，供 Adam 與 Role 6 審查。**不是 migration、不是已批准合約、不是實作授權。**
- **依據：** Adam 2026-11-23 的產品決定（`docs/team/DECISIONS.md`）；Role 6 正式審查回覆（`docs/stage6/KAYK_ROLE6_REVIEW_REPLY_20261123.md`）。
- **不包含：** provider 選擇、帳戶類型、migration 檔、Storage bucket、部署或排程設定、任何 Supabase Test／Main 操作。

本文件把 Role 6 的審查意見轉成可逐項審查的合約條目。凡屬產品或成本取捨的項目，一律保留為「待 Adam 決定」，不以技術預設值代替。

## 1. 六項決定（Adam 已於 2026-11-23 決定）

| #   | 決策         | 決定值                                                                                                                                          | 影響章節 |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | 儲存後端     | **Cloudflare R2 私有 bucket**（`citylink-group-files`）。詳見 `KAYK_R2_ADAPTER_DESIGN.md`                                                       | 5、6     |
| 2   | 簽名連結 TTL | **300 秒**，每次請求重簽；因 Drive 無簽名 URL，改由 CityLink 自行以 HMAC 簽發                                                                   | 5        |
| 3   | 保留期定義   | **日曆月**：`starts_on + interval '5 months'`，到期時刻 23:59:59（Asia/Hong_Kong）；`starts_on` 未填時以 term code 推導並記錄 `retention_basis` | 8        |
| 4   | AI provider  | **OpenRouter + DeepSeek**（預設 `deepseek/deepseek-v3.2`）；只傳抽取後文字，使用者觸發並顯示第三方揭露                                          | 9        |
| 5   | 到期清理機制 | **先做 lazy expiry**；`pg_cron` 或外部排程列為後續選項                                                                                          | 8        |
| 6   | 惡意檔案掃描 | **初期不做**；保留 attachment 下載與 `nosniff`                                                                                                  | 7        |

六項已定稿。Adam 同時授權 Kayk 在此功能範圍內決定同類技術與產品細節；涉及新增付費、建立帳戶或憑證、部署、發布、GitHub 合併或 Main 寫入者，仍須回到 Adam。

**因第 1 項改為 Cloudflare R2，第 5 章原 Supabase Storage bucket 與 `storage.objects` policy 設計作廢**，改以 `KAYK_R2_ADAPTER_DESIGN.md` 第 4、5 節為準。第 2 至 4 章（授權模型、資料模型、RPC 契約）仍然有效，僅 `storage_path` 改為 `object_key`。

## 2. 授權模型

**單一 predicate。** 新增 `private.can_access_group_files(p_group_id uuid) returns boolean`，語意為：`auth.uid()` 非空、`private.is_active_group_member(p_group_id, auth.uid())` 為真、且該群組 `status <> 'abandoned'`。

**明確禁止重用 `private.can_read_group_chat`。** 該 predicate 允許 `active`、`left`、`removed` 三種狀態，用於檔案等於靜默地對前成員與被移除者開放。此為 Role 6 的硬性技術要求，不是可選優化。

**呼叫慣例。** 所有檔案與計畫 RPC 皆為 `SECURITY DEFINER`、`search_path = ''`，actor 一律取自 `auth.uid()`，不接受呼叫端傳入 profile id。函式權限比照現有 Stage 6 慣例：`revoke all from public, anon`，`grant execute to authenticated`；`private` schema 內的 helper 另需 `revoke all ... from public, anon, authenticated`，否則會成為 PostgREST 可呼叫的授權旁路。

**失敗關閉。** predicate 不通過時以固定錯誤 token 拋出例外，前端據 token 顯示「無權限」訊息，不提供聯絡 leader 或申請加入的引導。

**成員移除的即時性。** 不需要額外撤銷動作：`membership_status` 由 `active` 改變後 predicate 立即為 false，下一個請求即被拒，不依賴任何快取失效。

## 3. 資料模型（草案，未建立）

**`public.group_files`**：`id`、`group_id`、`uploaded_by`、`storage_path`（unique）、`original_name`、`detected_mime`、`declared_mime`、`byte_size`、`sha256`、`status ∈ ('pending','current')`、`analysis_status ∈ ('not_requested','processing','ready','unsupported_format','failed')`、`retention_expires_at`、`created_at`、`replaced_at`、`deleted_at`。

**`public.group_analysis_plans`**：`group_id`（primary key）、`content jsonb`、`revision bigint`、`updated_by`、`updated_at`。

**`public.group_analysis_jobs`**：`id`、`group_id`、`file_id`、`status`、`error_code`、`started_at`、`finished_at`。

兩張對外表皆啟用 RLS，只允許經 RPC 存取，與現有 chat／recruitment 表一致。`original_name` 只作顯示用途；實際物件路徑使用產生的識別碼，因為 Supabase 物件名稱有字元限制，不可直接使用使用者檔名。

## 4. RPC 契約（草案，未建立）

| 函式                          | 輸入                                                          | 輸出／行為                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `request_group_file_upload`   | `p_group_id`、`p_original_name`、`p_mime_type`、`p_byte_size` | 驗 predicate、驗大小上限、限制每位成員與每群組的併發未完成上傳數，配置不可猜測的新路徑，回傳 `file_id`、`storage_path`、`upload_token` |
| `confirm_group_file_upload`   | `p_file_id`、`p_sha256`                                       | 以 Storage 物件實際 metadata 核對大小與 content type 後才建立為 `current`；未確認的列不得出現在清單                                    |
| `list_group_files`            | `p_group_id`                                                  | 只回 metadata，**不回任何 URL**                                                                                                        |
| `request_group_file_download` | `p_file_id`                                                   | 每次重驗 predicate 與列的 `status='current'`，回傳短效簽名 URL                                                                         |
| `replace_group_file`          | `p_file_id`、`p_original_name`、`p_mime_type`、`p_byte_size`  | 寫入**新路徑**、`uploaded_by` 改為替換者、刪除舊物件；不保留舊版本                                                                     |
| `delete_group_file`           | `p_file_id`                                                   | 僅目前版本的上傳者可刪；刪除 Storage 物件與列                                                                                          |

**替換不得原地覆寫。** 覆寫會因 CDN 傳播延遲讓舊內容在舊連結上短暫存活，與「替換不保留被替換內容」直接衝突，因此一律寫新路徑再刪舊物件。

## 5. 儲存與連結

> **本節已由 Adam 的儲存決定取代。** 不再使用 Supabase Storage bucket 與 `storage.objects` policy；改為 Cloudflare R2 私有 bucket，下載以原生 presigned URL 簽發 300 秒有效，無需代理。實作細節見 `KAYK_R2_ADAPTER_DESIGN.md` 第 4、5 節。以下原文保留作為歷史記錄。

單一私有 bucket；`storage.objects` 的 select／insert policy 使用同一個 predicate 並綁定路徑前綴，物件路徑必須以該 `group_id` 開頭，確保繞過前端直呼 Storage API 也取不到他組物件。不使用 public bucket，不使用 `getPublicUrl`。下載一律「先驗證、再換短效簽名 URL」，清單回應不夾帶 URL。

**TTL 已定為 300 秒**，每次請求重簽。

**兩種例外必須嚴格分開。** 成員被移除時物件仍在、已發出連結在原 TTL 內可用，這是 Adam 的決定，機制上就是 TTL，不是撤銷。檔案被替換或刪除時物件必須消失，任何連結都不得再取到內容，此處不套用成員移除的例外。若要求更嚴格的即時性，`request_group_file_download` 需再檢查列的 `status` 並拒絕簽發已刪除或已替換的列。

## 6. 大小與格式

大小上限定為 `104857600` bytes（100 MB）。在 R2 方案下，單檔大小不是限制，真正的限制是免費額度的 **10 GB 總量**，因此必須以資料庫統計實作配額檢查與每群組軟上限；100 MB 以單次 presigned `PUT` 直傳，不經過我們的伺服器。

伺服器端以 Storage 物件的實際大小與 content type 為準，不信任用戶端宣告；以 magic byte 嗅探真實類型，保留宣告值供稽核比對。不一致時不阻擋上傳（產品要求接受所有類型），但不得以宣告類型決定呈現方式。

**「接受所有檔案」與「AI 能分析」是兩個獨立狀態**，不可合併為單一布林值。上傳成功但格式無法解析時，顯示「已上傳，此格式目前無法分析」並允許下載，不拒絕上傳，也不把「接受所有類型」表述成「所有格式都能分析」。可分析格式清單由 AI adapter 宣告。

## 7. 惡意檔案處理

下載一律 `Content-Disposition: attachment` 與 `X-Content-Type-Options: nosniff`；絕不在本站 origin inline 呈現 HTML、SVG 或 PDF。**掃描服務初期不做**（Adam 2026-11-23 決定），此為已接受的殘餘風險。

## 8. 保留與到期

`retention_expires_at` 於建立檔案時依學期計算並寫入，不在查詢時動態計算，否則學期資料變動會追溯改變歷史紀錄。

到期先以 **lazy expiry** 實作：清單與下載都加 `retention_expires_at > now()` 條件，R2 物件的實際刪除延後處理（Adam 2026-11-23 決定）。這代表過期檔案會停止可見，但**不會自動釋放 R2 空間**，配額檢查因此不可省略。到期刪除是保留政策，**成員移除不觸發刪除**，兩者不可混為一談。`academic_terms.starts_on` 目前 nullable 且現行資料未填，處理方式見 `KAYK_R2_ADAPTER_DESIGN.md` 第 7 節。

## 9. AI 資料流

分析工作以 `(group_id, file_id)` 建立；伺服器只讀取該 `file_id` 的物件，讀取前重驗該檔案仍屬該群組且 `status='current'`；查詢一律帶 `group_id` 條件，不得出現以 `file_id` 單獨查詢的路徑。AI 不讀取聊天訊息、不跨群組讀取，這兩點應寫進 RPC 註解與測試，而不是只寫在文件。

若採外部 provider，檔案內容會出境至第三方，需要揭露、同意，或選擇不外傳的處理方式；此為 Adam 的產品與法務決定（第 1 章第 4 項）。**建議先完成不依賴 provider 的部分**（上傳、狀態機、權限、UI 呈現、計畫儲存），provider 確定後只替換一個 adapter。

## 10. 併發策略（不代為選擇）

| 選項                            | 行為                     | 影響                                                         |
| ------------------------------- | ------------------------ | ------------------------------------------------------------ |
| A 最後寫入覆蓋                  | 後儲存者勝出             | 實作最簡單；同時編輯時前者內容靜默消失                       |
| B 樂觀鎖（`expected_revision`） | 不符則拒絕並回傳目前版本 | 不會靜默遺失；需 UI 提示與重載／合併流程，多一個錯誤路徑要測 |
| C 序列化鎖                      | 同一時間僅一人可儲存     | 保證一致但會阻塞，對多人編輯體驗最差                         |

成員在儲存期間被移除時，交易內重驗 predicate，失敗則整個儲存回滾並回傳權限錯誤，不可先寫入再檢查。舊頁面覆寫新內容只有選項 B 能偵測；若選 A 或 C，需明確接受該風險並寫入文件。

## 11. 錯誤 token（草案）

沿用 repo 現有穩定 token 慣例，前端以 token 對應訊息，不以訊息文字比對。建議集合：`group_files_no_permission`、`group_files_upload_too_large`、`group_files_upload_unconfirmed`、`group_files_not_current`、`group_files_not_uploader`、`group_analysis_plan_conflict`、`group_files_group_abandoned`。完整清單待實作前定稿。

## 12. 測試矩陣

**可用 mock／單元測試驗證：** 四種身分的 predicate（非成員、`left`、`removed`、現任成員全部行為正確，並包含「前成員不得因聊天室可讀而取得檔案」的回歸案例）；上傳者與非上傳者的替換／刪除權；大小邊界 `104857600` 通過與 `104857601` 拒絕；未確認上傳不出現在清單；格式不可分析時仍可下載；已刪除或已替換檔案拒絕簽發；計畫併發依所選策略的行為；`abandoned` 群組拒絕所有操作。

**必須等 Test 授權才能做：** 真實 Storage RLS（以非成員 token 直呼 Storage API）；簽名 URL 的實際 TTL 與刪除後行為含 CDN 傳播窗口；100 MB 實際上傳與中斷續傳；多帳號真正同時編輯；成員移除後重放舊請求與舊連結；保留到期 job 的實際執行。

## 13. 建議實作順序

先做不依賴 provider 與部署的部分：predicate 與 RPC 契約、狀態機、錯誤 token、UI 呈現、共用計畫的儲存與併發選項實作，以及第 12 章的 mock 測試。待 Adam 決定儲存後端、TTL、保留定義、AI 揭露與排程機制後，才接真實 Storage 與 AI，並在 Test 授權下做 live QA。任何 migration 都需另開分支、經 Role 6 exact-head 審查、再取得獨立的 Test-only 授權。

## 14. Test preflight finding: Supabase default privileges (2026-11-24)

Section 2's posture — tables unreachable directly, six RPCs the only entry point, `authenticated` the only grantee — is achieved by explicit statements in the migration, not by the project's defaults. the frozen Prototype `wkzclgmhrtecnpexfesr` was measured to carry `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` that auto-grants new tables, functions and sequences to `anon`, `authenticated` and `service_role`, and `service_role` holds `BYPASSRLS`. A revoke that omits `service_role` therefore leaves it effective on a real project even though it measures correctly on a plain local PostgreSQL. Every revoke in the P1 proposal names `service_role` for that reason, and `docs/stage6/scripts/KAYK_P1_DEFAULT_PRIVILEGE_PROBE.sql` reproduces both the leak and the fix. That read predates the F14 correction and describes the Prototype, not the authorized apply target `pijslbchvstkoweslymr`, whose `pg_default_acl` has **not** been read; the rule is written to be safe either way, and the target's own state must be re-measured before any apply. Any later migration in this feature must name `service_role` in every revoke for the same reason.
