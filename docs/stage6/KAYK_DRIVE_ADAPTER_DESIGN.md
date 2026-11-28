# CityLink 群組聊天室檔案：外部雲端硬碟 adapter 設計（1C）

> **已被取代（2026-11-24）。** Adam 改選 Cloudflare R2，本文件僅保留為歷史記錄；
> 現行設計見 `KAYK_R2_ADAPTER_DESIGN.md`。以下內容不再代表採用的架構。

- **日期：** 2026-11-23
- **Human owner：** Kayk
- **分支：** `feature/kayk-ai-project-room-files`
- **狀態：** 設計文件，供 Role 6 與 Adam 審查。**不是實作、不是 migration、不是部署授權。**
- **依據：** Adam 2026-11-23 的六項決定（本文件第 1 節）；`KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md`；Role 6 正式審查回覆。

本文件把「外部雲端硬碟、由 CityLink 集中管理」這條路線寫成可執行步驟，並指出它與原 Supabase Storage 草案在哪些地方必須改寫。**第 5 節的下載設計是本次最重要的變更**：Google Drive 沒有簽名 URL，300 秒 TTL 必須由 CityLink 自己實作。

## 1. Adam 2026-11-23 的六項決定

| #   | 決策         | 決定值                                                                                      | 對合約的影響                                                                         |
| --- | ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | 儲存後端     | **外部雲端硬碟（Google Drive），由 CityLink 集中管理**（1C）                                | 第 5 章整章改寫；`storage_path` 改為 `drive_file_id`；不使用 Supabase Storage bucket |
| 2   | 簽名連結 TTL | **300 秒**，每次請求重簽                                                                    | 由 CityLink 自己的下載端點簽發，見第 5 節                                            |
| 3   | 保留期定義   | **日曆月**：`starts_on + interval '5 months'`，到期時刻 23:59:59（專案時區 Asia/Hong_Kong） | 第 8 章定稿；`starts_on` 未填時的 fallback 見第 8 節                                 |
| 4   | AI provider  | **OpenRouter，模型為 DeepSeek**                                                             | 第 9 章定稿；需 Adam 提供 OpenRouter API key 與小額額度                              |
| 5   | 到期清理     | **先做 lazy expiry**（讀取時過濾），暫不建排程                                              | 第 8 章定稿；`pg_cron` 列為後續選項                                                  |
| 6   | 惡意檔案掃描 | **初期不做**                                                                                | 第 7 章定稿；仍保留 attachment 下載與 `nosniff`                                      |

Adam 同時授權 Kayk 在此功能範圍內自行決定同類技術與產品細節；涉及新增付費、建立帳戶或憑證、部署、發布、GitHub 合併或 Main 寫入者，仍須回到 Adam。

## 2. 為什麼不能用 service account

Google 官方錯誤文件明確寫出：**service account 沒有儲存配額，也不能擁有檔案**，直接上傳會得到 `403 storageQuotaExceeded`，官方建議只有兩條路：上傳到 shared drive，或改用 OAuth 代表真實使用者。2025-04 之後新建的 service account 配額為 0，情況更明確。

因此可選的只有：

| 方案                                          | 條件                                                | 判斷                                   |
| --------------------------------------------- | --------------------------------------------------- | -------------------------------------- |
| A. Workspace + shared drive + service account | 需付費 Google Workspace，且要管理 shared drive 成員 | 成本與維運負擔最大，與「免費」初衷相反 |
| **B. 專用 Google 帳號 + OAuth refresh token** | 免費 15 GB，一次性人工授權                          | **採用**，見第 3 節                    |

## 3. 帳戶與 OAuth 設定（逐步）

**這一步需要 Adam 或授權人員以人手完成，因為涉及建立 Google 帳號與保存憑證。本任務不會代為建立帳號，也不會要求任何人在對話中貼出 token。**

1. **建立專用帳號**：例如 `citylink.storage@gmail.com`。只作儲存用途，不要與任何人的個人 Drive 混用。免費額度 15 GB，與 Gmail、Photos 共用。
2. **建立 Google Cloud 專案**，在 API 庫啟用 **Google Drive API**。
3. **設定 OAuth consent screen**：User type 選 External；只宣告一個 scope：`https://www.googleapis.com/auth/drive.file`。此 scope 屬 **non-sensitive**，只需基本驗證，不需要 restricted scope 的資安評估。
4. **建立 OAuth client**，類型選 **Web application**，加入授權 redirect URI（一次性授權用的本機或暫存 URI 即可）。
5. **把 publishing status 改為 In production。** 關鍵原因：External + Testing 狀態的 refresh token **只有 7 天**有效期，每週斷線不可接受。改為 In production 後 token 才會長期有效。因為只有我們這一個專用帳號會授權，即使出現「未驗證應用程式」警告，也只需人手按一次「進階 → 繼續」。
6. **以專用帳號完成一次授權**，取得 `refresh_token`（`access_type=offline`、`prompt=consent`）。
7. **保存**：只放 Supabase 專案 secrets（Edge Function 環境變數）或 Vault。**不得**寫入 repo、前端 bundle、`VITE_*` 變數或任何日誌。
8. **失效處理**：refresh token 可能因 6 個月未使用、帳號改密碼、超過 100 個 token 上限或被使用者撤銷而失效。需一段 runbook：偵測 `invalid_grant` → 標記功能不可用 → 由授權人員重做第 6 步。

`drive.file` 的語意是「只能存取本 app 建立或被使用者用本 app 開啟的檔案」，剛好符合「CityLink 自己管理所有檔案」的需求，也不會取得該帳號其他檔案。

## 4. 資料模型改動

原草案的 `group_files.storage_path` 改為 Drive 識別碼，並新增兩張小表：

**`public.group_files`（改動欄位）**

| 欄位            | 說明                                                           |
| --------------- | -------------------------------------------------------------- |
| `drive_file_id` | Drive 檔案 ID，unique；取代 `storage_path`                     |
| `byte_size`     | 以 Drive metadata 的 `size` 為準                               |
| `sha256`        | 若 Drive 只回 `md5Checksum`，則存 `content_hash` 並記錄演算法  |
| 其餘欄位        | 不變（`status`、`analysis_status`、`retention_expires_at` 等） |

**`public.group_storage_bindings`**：`group_id`（primary key）、`drive_folder_id`、`created_at`。首次上傳時由 Edge Function 建立資料夾並寫入，避免每次上傳都 `files.list`。

**`public.group_file_uploads`**（暫存，可為 `group_files` 的一個狀態）：記錄 `upload_session_uri` 的到期時間，用於併發上傳數限制與孤兒清理。session URI 本身是 bearer capability，**不可**回傳給非上傳者。

RLS 與 RPC 授權模型不變：對外表只允許經 RPC 存取，predicate 仍為 `private.can_access_group_files`。

## 5. 下載設計（本次最關鍵的改寫）

Google Drive **沒有** Supabase 那種「帶到期時間的簽名 URL」。`webContentLink` 要求檔案已對檢視者開放，`alt=media` 需要 `Authorization` header，兩者都不能直接丟給瀏覽器。因此 300 秒 TTL 必須由 CityLink 實作：

1. 前端呼叫 RPC `request_group_file_download(p_file_id)`：重驗 predicate、`status='current'`、`retention_expires_at` 未過。
2. RPC 以伺服器端密鑰對 `(file_id, auth.uid(), exp)` 做 HMAC-SHA256，回傳 `https://<project>.supabase.co/functions/v1/group-file-download?t=<payload>.<sig>`，`exp = now + 300s`。
3. 瀏覽器 GET 該 URL。Edge Function 驗簽、檢查 `exp`、**再驗一次 predicate**（不可只信簽章，否則成員在 300 秒內被移除仍可下載），然後以 `files.get(fileId, alt='media')` 串流回傳。
4. 回應標頭：`Content-Disposition: attachment`、`X-Content-Type-Options: nosniff`、`Cache-Control: private, no-store`。不 inline 呈現 HTML／SVG／PDF。

**已知風險，必須在實作前實測：** Edge Function 有執行時間與記憶體上限，單次串流 100 MB 可能超時。緩解方式：(a) 支援 HTTP `Range`，前端分塊下載，每次請求都是短請求；(b) 若仍不足，下載代理改放可長時間執行的 Node 服務。這點不改變 300 秒 TTL 的產品語意，只影響代理的部署位置。

**與「成員移除」例外的關係：** Adam 已定「成員移除不即時作廢已發出連結」。上例第 3 步的二次 predicate 檢查會讓「已簽發但未使用」的連結在成員被移除後失效——這比產品要求更嚴格，不違反產品規則，且更安全；若 Adam 要求嚴格照字面（300 秒內仍可下載），只需移除該次檢查。**預設採用較嚴格版本**，並在文件標明。

## 6. 上傳、替換、刪除

**上傳（不經過我們的伺服器轉發 100 MB）**

1. `request_group_file_upload`：驗 predicate、驗大小上限、驗每群組與全域配額、限制併發未完成上傳數，建立 `pending` 列。
2. Edge Function 以 `files.create` + `uploadType=resumable` 建立 session（metadata：`name` = 產生的識別碼、`parents` = 該群組資料夾、`mimeType`），回傳 session URI。
3. 瀏覽器直接 PUT 位元組到 session URI（不需 Authorization，URI 本身即能力憑證，Google 端有期限）。這條路避開了 Edge Function 的 request body 限制。
4. `confirm_group_file_upload`：Edge Function 以 `files.get` 讀回 `size`、`md5Checksum`、`mimeType` 核對後，RPC 才把列改為 `current`。**未確認的列不得出現在清單**，並由 lazy cleanup 刪除。

**替換**：一律建立**新檔案**（新 `drive_file_id`），成功後 `files.delete` 舊檔。**絕不使用 `files.update` 原地覆寫**——這正是 Role 6 的硬性要求，理由在 Drive 也成立（快取與 CDN 傳播）。

**刪除**：只用 `files.delete`（永久刪除），**絕不使用 `files.trash`**。原因：Drive 垃圾桶會保留 30 天，直接違反「刪除內容不保留、不可還原」。同理，因為我們從不覆寫，版本歷史不會累積；若日後有例外，需以 `revisions.delete` 清除。

## 7. 配額

15 GB 是這個方案的真正上限，比 Supabase Free 的 1 GB 好，但遠小於 100 GB。

- 發 session 前呼叫 `about.get`（fields：`storageQuota`），若 `limit - usage < byte_size` 則拒絕，錯誤 token `group_files_storage_full`。
- 另設每群組軟上限（建議 2 GB），避免單一群組吃光全域額度。
- lazy expiry 會讓過期檔案停止可見，但**不會自動釋放 Drive 空間**，這是選 lazy 的已知代價；配額檢查是唯一防線，因此必須實作，不能省略。

## 8. 保留期

`retention_expires_at` 於建立檔案時一次寫定（`starts_on + interval '5 months'`，23:59:59 Asia/Hong_Kong），不在查詢時動態計算，避免學期資料變動追溯改變歷史。

`academic_terms.starts_on` 目前 nullable 且未填。決定：

- 建立檔案時取 `coalesce(starts_on, 由 term code 推導)`；推導規則為 semester A → 該年 9 月 1 日、semester B → 次年 1 月 10 日。
- 使用 fallback 時寫入稽核欄位（`retention_basis ∈ ('term_start','derived')`），讓日後可回頭找出需要修正的紀錄。
- 把 `starts_on` 改為 NOT NULL 並 backfill 屬 schema 變更，需另開分支、Role 6 exact-head 審查與獨立授權，**不在本文件授權範圍**。

lazy expiry 的實作：`list_group_files` 與 `request_group_file_download` 都加 `retention_expires_at > now()` 條件；Drive 物件的實際刪除列為後續排程工作。

## 9. AI 資料流（OpenRouter + DeepSeek）

- **模型**：預設 `deepseek/deepseek-v3.2`（OpenRouter 上約 $0.26–0.30 / 百萬 input token、$0.38–0.96 / 百萬 output token，視路由 provider 而定）。一次作業分析約 6k input + 1.5k output，成本約 US$0.002，可忽略。
- **只傳文字**：伺服器先抽取文字（PDF、DOCX、PPTX、TXT），只把文字送出去；圖片與無法抽取的格式標記為 `unsupported_format`，仍可下載，並顯示「已上傳，此格式目前無法分析」。這樣也避開 vision 模型的額外成本與不確定性。
- **同意方式**：分析必須由使用者明確觸發，且第一次觸發時顯示對話框，說明「檔案內容將傳送給第三方 AI 服務（OpenRouter / DeepSeek）處理」，確認後才送出。不做背景自動分析，避免無聲外傳。
- **資料地域**：DeepSeek 為中國大陸服務商，內容會出境。這一點必須出現在揭露文字中，不能只寫「第三方」。
- **API key**：只放 Edge Function secrets。**需要 Adam 提供 OpenRouter API key 與少量額度**；本任務不會在對話中接收或顯示 key。
- **讀取範圍**：只讀該 `file_id` 的內容，查詢一律帶 `group_id`，不讀聊天訊息、不跨群組。

## 10. 與原草案的差異清單（給 Role 6 審查用）

| 原草案                                                  | 現在                                                       | 原因                 |
| ------------------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| Supabase Storage 私有 bucket + `storage.objects` policy | 不建立 bucket，改 Drive + Edge Function                    | Adam 選 1C           |
| `storage_path` unique                                   | `drive_file_id` unique                                     | Drive 以檔案 ID 識別 |
| 簽名 URL 由 Storage 簽發                                | 由 CityLink HMAC 簽發 300 秒連結                           | Drive 無簽名 URL     |
| `getPublicUrl` 禁用                                     | 同樣禁用；任何 Drive 分享連結都不得外流                    | 同上                 |
| 100 MB 需 Supabase Pro                                  | 100 MB 在 Drive 可行（單檔上限 5 TB），但受 15 GB 總量限制 | Drive 配額模型不同   |
| 到期刪除靠 `pg_cron`                                    | 先 lazy expiry，物件刪除延後                               | Adam 選 5            |
| AI provider 未定                                        | OpenRouter + DeepSeek v3.2，觸發式同意                     | Adam 選 4            |
| 掃描服務待決                                            | 不做                                                       | Adam 選 6            |

## 11. 實作順序

1. predicate、RPC 契約、狀態機、錯誤 token、mock 測試（完全不依賴 Drive 與 AI）。
2. Drive adapter（Edge Function）：資料夾建立、resumable session、確認、下載代理、永久刪除、配額檢查。
3. AI adapter：文字抽取、OpenRouter 呼叫、觸發式同意對話框。
4. Test 環境 live QA（需獨立授權）：多帳號權限、300 秒 TTL 實測、100 MB 上傳續傳、替換後舊連結失效、配額拒絕。

任何 schema 變更都需另開分支、經 Role 6 exact-head 審查，並取得獨立的 Test-only 授權後才可套用。
