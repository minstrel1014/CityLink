# CityLink 雲端儲存服務研究備忘

- **日期：** 2026-11-23
- **用途：** 回答免費個人雲端硬碟能否連到 CityLink，以及大致整合步驟。本文是研究備忘，不是已批准的 provider、API、Storage、資料庫或權限架構。

## 免費個人方案（官方資料）

- **Google Drive：** Google 帳戶最多 15 GB，與 Gmail、Google Photos 共用；超過配額會限制多種 Drive 操作。[1]
- **OneDrive：** 沒有 Microsoft 365 訂閱的免費使用者有 5 GB Microsoft 雲端儲存，與 OneDrive 檔案／相片及 Outlook.com 附件等共用。[2]
- **Dropbox Basic：** 2 GB；官方頁也說明免費方案可建立分享連結，並提供 30 天內版本回復。[3]

這些都是個人帳戶配額，可能隨供應商政策變更；不是 CityLink 為所有群組提供的團隊配額，也不保證適合長期存放整個 App 的檔案與聊天資料。

## 「連結」不是把分享網址貼進 App

若只把 Drive／Dropbox 分享網址貼在聊天室，CityLink 不會因此取得安全的檔案 API 權限，也不能可靠執行群組授權、成員移除、刪除、版本保存或 AI 分析。Google Drive 官方說明，整合式 App 透過 Drive API 和 OAuth 2.0 存取檔案；Google Drive 的 My Drive 檔案由個別帳戶持有。[4] Microsoft 的做法是由 Microsoft Graph API 存取 OneDrive，並可透過 file picker 或 Graph API 連接檔案。[5] Dropbox API 也要求使用者透過 OAuth 授權 App 存取其 Dropbox 資料。[6]

OAuth 是「使用者在 Google／Microsoft／Dropbox 登入並授權 App」的流程。App 必須安全保存必要的授權憑證，不能把祕密或可長期使用的 token 放進前端程式碼、公開 repository 或聊天室。供應商的分享網址與登入授權也不是同一件事。

## 可能的整合方式與取捨

**A. 使用者連接自己的雲端硬碟。** App 透過 OAuth 讓每位使用者連接自己的帳戶，再由使用者挑選／上傳檔案。個人容量由各帳戶承擔，但組員可能各自連不同 provider；檔案所有權、共享權限、成員離組後的存取，以及 AI 能否讀取，都要另外設計和審查。若外部雲端分享權限與 CityLink 群組權限不同步，可能留下存取落差。

**B. App 經核准後集中存放在一個帳戶／雲端位置。** 群組成員透過 CityLink 使用，App 由伺服器端呼叫雲端 API。這樣 UI 可較一致，但免費帳戶容量仍由該帳戶承擔，還會有帳戶擁有人離職／失聯、配額耗盡、授權 token 管理、群組隔離、刪除、稽核與供應商規則等問題。它不是單純新增一條分享網址即可完成。

**C. App 使用自己的 Storage 和資料庫。** 這通常能讓群組權限和檔案／訊息資料更直接對齊，但方案、容量和技術設計都要由技術負責人確認；本備忘不替 CityLink 選定這條路，也不批准 Supabase 變更。

聊天記錄是有群組、發送者、時間、排序、權限及可能即時更新的結構化資料。一般 Drive 是檔案服務，不應只因它有免費容量就假設它是聊天資料庫。若要把聊天記錄另存成匯出檔案，可作另一項產品功能討論，但它不等於聊天室正常運作所需的資料服務。

## 若技術負責人核准以 Drive API 做原型，整合大致步驟

1. 先明確決定 provider、由誰持有雲端帳戶、群組資料放在哪裡、哪些成員能讀寫／刪除、成員移除後如何處理，以及 AI 是否可把檔案傳給第三方。這些是需 Adam／技術負責人確認的產品與安全合約，不是 Kayk 可自行決定的技術細節。
2. 技術負責人建立該 provider 的開發者專案並啟用對應 API，設定精確的 OAuth redirect URL 和最低必要權限。正式登入需使用供應商支援的 OAuth 流程；不要把任何帳戶密碼或長期 token 放入前端。
3. 由核准的後端安全處理 OAuth 回呼和檔案 API 操作，將憑證存放在伺服器端秘密管理機制。前端只要求自己的伺服器執行授權過的動作。
4. 建立一份明確的 App 檔案紀錄，保存 provider、雲端檔案 ID、群組 ID、目前版本／上傳者和到期資訊；每次操作仍由伺服器按 CityLink 現任群組權限判斷，不把猜不到網址當成授權。
5. 測試上傳、下載、替換、版本歷史、刪除、容量耗盡、撤銷 OAuth、成員移除及非成員存取；如 AI 會讀取內容，另外測試格式支援、資料披露與失敗處理。實際測試環境與資料庫修改仍須依 CityLink Test-only 授權流程處理。

## CityLink 現況與建議下一步

Adam 已指定下一步評估**由 CityLink App 集中管理檔案**的模式。Adam 也指定聊天記錄繼續存放 Supabase，而上傳檔案需評估連接外部雲端硬碟。這些是評估方向，不是已核准的 provider、帳戶類型、API／OAuth、檔案所有權或技術架構；Role 6 審查仍是風險建議，不是已批准 API／Storage／RLS 合約。不可因此建立 OAuth 憑證、連接 Drive、修改資料庫或開始真實上傳。下一步由技術負責人及 Role 6 在集中式方向下核對供應商條款、帳戶持有與接管、OAuth 權限、群組隔離、配額、AI 資料流及刪除／到期行為。

另，Adam 在 2026-11-23 確認學期 A 自 9 月 1 日開始，學期 B 自 1 月 10 日開始；聊天室目前存在的檔案從該學期起始日起保留五個月。被替換或刪除的內容不保留，僅保留聊天室中目前存在的檔案。這是產品規則，並不選定雲端 provider 或儲存架構。五個月的曆法計算方式、到期時區／時刻，以及到期後 metadata／稽核紀錄處理仍須技術負責人與 Adam 確認。

## References

[1]: https://support.google.com/googleone/answer/9312312?hl=en "How your Google storage works"
[2]: https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs "Microsoft storage FAQs"
[3]: https://www.dropbox.com/basic "Dropbox Basic free account"
[4]: https://developers.google.com/workspace/drive/api/guides/about-sdk "Google Drive API overview"
[5]: https://learn.microsoft.com/en-us/graph/onedrive-concept-overview "OneDrive file storage API overview"
[6]: https://docs.dropboxapi.com/dropbox-api/docs/oauth "Dropbox API OAuth"
