# CityLink 群組聊天室檔案：Cloudflare R2 adapter 設計

- **日期：** 2026-11-24
- **Human owner：** Kayk
- **分支：** `feature/kayk-ai-project-room-files`
- **狀態：** 設計文件，供 Role 6 與 Adam 審查。**不是實作、不是 migration、不是部署授權。**
- **取代：** `KAYK_DRIVE_ADAPTER_DESIGN.md`（Google Drive 路線）。Adam 2026-11-24 改選 Cloudflare R2。
- **已知資源：** bucket `citylink-group-files`；R2 API token 已建立（只限該 bucket、Object Read & Write）；CORS **尚未設定**；Account ID 待提供。

## 1. 為什麼 R2 比 Drive 適合

| 需求           | Drive                                         | R2                                          |
| -------------- | --------------------------------------------- | ------------------------------------------- |
| 300 秒有效連結 | 無簽名 URL，需自建 HMAC 代理並串流 100 MB     | 原生 presigned URL，`expiresIn` 1 秒至 7 天 |
| 刪除即消失     | 垃圾桶保留 30 天，必須精確使用 `files.delete` | `DeleteObject` 立即生效，且屬免費操作       |
| 憑證           | OAuth refresh token，Testing 狀態 7 天失效    | Access Key + Secret + Account ID，長期有效  |
| 100 MB 上傳    | resumable session 直傳                        | presigned `PUT` 單次即可                    |
| 容量與流量     | 15 GB，有配額                                 | 10 GB-month 免費，egress 免費               |

Drive 版最複雜的三段（HMAC 代理、垃圾桶規避、OAuth 續期）在 R2 全部消失。

## 2. 仍然需要一個「簽名端點」

presigned URL 必須用 SigV4 在伺服器端產生，而 `postgres` 內沒有合適的簽名工具。因此仍需要一個小型伺服器端點，這是 P2 唯一的部署依賴：

- **建議：Supabase Edge Function** `group-file-url`。與資料庫同專案，可直接用使用者的 JWT 驗身分，再用 service role 呼叫 predicate；secret 存在 Supabase 專案 secrets。
- **替代：Cloudflare Worker**。與 R2 同廠商，用 `aws4fetch` 簽名，無 egress 成本；但需另外驗 Supabase JWT，多一層信任邊界。

不論選哪個，**授權判斷一律留在 Postgres**：端點只負責「呼叫 predicate，通過才簽名」，不得自己實作成員判斷邏輯。

## 3. 資料模型

沿用技術合約第 3 章，只把儲存識別碼換成 R2 物件鍵：

**`public.group_files`**

| 欄位           | 說明                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `object_key`   | `groups/<group_id>/<file_id>`，unique；取代 `storage_path`                |
| `byte_size`    | 以上傳後 `HeadObject` 回報為準                                            |
| `content_hash` | 用戶端宣告的 SHA-256，供稽核；不作為唯一真實來源                          |
| 其餘           | `status`、`analysis_status`、`retention_expires_at`、`uploaded_by` 等不變 |

不需要 `group_storage_bindings`（R2 沒有資料夾概念，前綴即分組），比 Drive 版少一張表。

## 4. 上傳流程

1. `request_group_file_upload(p_group_id, p_original_name, p_mime_type, p_byte_size)`：驗 predicate、驗 100 MB 上限、驗每群組與全域配額、限制併發未完成上傳，建立 `pending` 列並回傳 `file_id` 與 `object_key`。
2. 前端向簽名端點索取 `PUT` presigned URL（`expiresIn` 建議 900 秒，足夠 100 MB 在慢網上傳完），並在簽名時**綁定 `Content-Type`**，否則用戶端可改類型。
3. 前端直接 `PUT` 到 R2。需要 bucket CORS 允許該 origin、`PUT` 與 `content-type` header。
4. `confirm_group_file_upload(p_file_id)`：端點以 `HeadObject` 讀回實際大小與 content-type，RPC 核對後才把列改為 `current`。**未確認的列不得出現在清單**，並由 lazy cleanup 刪除孤兒物件。

100 MB 用單次 presigned `PUT` 即可；不支援斷點續傳，若日後需要續傳才改用 multipart（每個 part 各自簽名）。這是明確接受的取捨。

## 5. 下載流程

1. `request_group_file_download(p_file_id)`：重驗 predicate、`status='current'`、`retention_expires_at > now()`。
2. 端點以 `GetObject` 簽發 `expiresIn: 300` 的 presigned URL 回傳。
3. 瀏覽器直接 GET。**不需要代理**，因此沒有 Edge Function 串流 100 MB 超時的風險。
4. 回應仍要求 `Content-Disposition: attachment` 與 `X-Content-Type-Options: nosniff`——presigned URL 無法附加自訂 response header，因此改用簽名時帶入 `response-content-disposition` 與 `response-content-type` 參數，讓 R2 回傳時附上。

**成員移除的處理：** 已簽發的 URL 在 300 秒內仍有效，這是 Adam 已定的例外，機制上就是 TTL。但每次**新**請求都會重驗 predicate，因此被移除者的下一個請求立即失敗。若要更嚴格（連未使用的舊連結都作廢），只能縮短 TTL，無法個別撤銷。

**替換與刪除：** 一律 `DeleteObject` 舊物件再寫新物件（或先寫新再刪舊），順序以「先寫新、確認成功、再刪舊」為準，避免中途失敗造成資料遺失。R2 沒有垃圾桶，刪除即消失，符合「不保留被替換內容」。若 bucket 日後開啟 versioning，需改為同時刪除舊版本，否則會保留歷史。

## 6. 配額

免費額度為 10 GB-month。以 100 MB 單檔計算約 100 個檔案，比 Drive 的 15 GB 少，因此配額控制更重要：

- 簽發上傳 URL 前，以資料庫統計 `sum(byte_size) where status='current'` 判斷是否超過全域軟上限（建議 8 GB，留 2 GB 餘裕）。
- 每群組軟上限建議 1 GB（比 Drive 版的 2 GB 保守，因為總量只有 10 GB）。
- 超過時回傳 `group_files_storage_full`，前端顯示明確訊息，不可靜默失敗。
- lazy expiry 不會自動釋放空間，實際刪除仍需後續排程；在那之前配額統計應只計算未過期的列。

## 7. 保留期

與技術合約第 8 章一致，不因換儲存而改變：`starts_on + interval '5 months'`，到期時刻 23:59:59（Asia/Hong_Kong），建立檔案時一次寫定。`starts_on` 未填時由 term code 推導（A 學期 9 月 1 日、B 學期 1 月 10 日），並在該列記錄 `retention_basis`。

lazy expiry 只影響可見性；R2 物件的實際刪除延後，屬後續排程工作，尚未授權。

## 8. 安全要點

- **只使用 bucket 層級、Object Read & Write 的 token**，不用帳號層級 key。Adam 已完成。
- Secret 只存在簽名端點的環境變數；不得進 repo、前端 bundle、`VITE_*` 或日誌。
- Presigned URL 視為 bearer token：不寫入日誌、不放入 `Referer` 可外流的頁面、不在清單 API 中預先產生。
- 物件鍵一律使用產生的 `file_id`，不使用使用者檔名（檔名只存資料庫作顯示）。
- Bucket 保持私有；**不啟用** `r2.dev` 公開存取。
- CORS 只允許正式前端 origin，不允許 `*`。

## 9. 與技術合約的差異

| 原合約                                                              | R2 版                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `storage_path`、Supabase Storage bucket 與 `storage.objects` policy | `object_key`、R2 私有 bucket；無 `storage.objects` policy |
| 下載需 HMAC 代理                                                    | 原生 presigned URL，無代理                                |
| 需要 `group_storage_bindings`（Drive 資料夾）                       | 不需要                                                    |
| 100 MB 需 Supabase Pro                                              | 10 GB 免費額度內可行                                      |
| 掃描、保留、AI 章節                                                 | 不變                                                      |

## 10. 實作順序（P1 起）

1. **P1**：資料表、`private.can_access_group_files`、6 個 RPC、migration 提案與 mock 測試。不依賴 R2 或 AI。
2. **P2**：簽名端點（Edge Function 或 Worker）、CORS 設定、上傳／確認／下載／刪除。
3. **P3**：`GroupChatPage` 的檔案 UI。
4. **P4**：文字抽取 + OpenRouter adapter。
5. **P5**：分析 UI、同意對話框、共用計畫。
6. **P6**：Test 環境多帳號 QA。

任何 migration 套用都需另開分支、Role 6 exact-head 審查與獨立的 Test-only 授權。
