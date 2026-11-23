# Role 6 審查提案：群組聊天室 AI 作業分析與檔案

**狀態：本文件已提交為 draft PR #59（分支 `feature/kayk-ai-project-room-files`，head `6804fdc8079b2ef04f155178b383b19b2b02cf5a`）。已收到 Role 6 唯讀技術／安全審查，其建議仍非已批准的 API／Storage／RLS 合約；逐題正式書面回覆仍待 Role 6。實作仍待決。**

- **日期：** 2026-11-23
- **Human owner：** Kayk
- **Base role：** Role 4 — Group Invitation Feature Owner（保留原角色）
- **Additional feature：** 群組聊天室 AI 作業分析與檔案分享
- **目前分支：** `feature/kayk-ai-project-room-files`
- **GitHub 基線與同步紀錄：** 初次檢查時 `main` 為 `1a583e30c019733d1880d2614ca853481509fdad`。2026-11-23 唯讀 fetch 後，本機 feature branch 以 `--ff-only` 快轉至 `origin/main` 的 `3514630896b96b7f7e0fa2239084071273335ecf`；目前本機分支與該 main 快照相同。GitHub 上現已存在同名遠端分支，head `6804fdc8079b2ef04f155178b383b19b2b02cf5a`，並以 draft PR #59 提交審查。

## 提案用途與界線

此文件供 Role 6 審查權限、資料流和所需技術合約。它不是資料庫 migration、API 實作規格或架構決定，也不代表已授權連接 AI provider、建立 Storage、修改 schema／RLS、套用 Test migration、部署或存取 Supabase Main。

請 Role 6 先指出需要的 API／資料／安全合約，以及任何產品決定與技術限制衝突之處。遇到未定選項，請列出選項及影響，交 Adam 決定；不要在本提案中替 Adam 選擇。

## 已核准的產品行為

### AI 作業分析與共用計畫

- 使用者上傳 lecture slide 後，AI 分析作業要求、佔分、工作項目、每項工作內容、交付期限及建議 internal deadline。
- 依**現任群組成員數**平均拆分工作，不按具名組員指派；提供工作崗位，讓成員自行選擇。分工計算不可用群組設定的最大人數代替實際成員數。
- 如投影片出現多個或互相矛盾的日期，全部列出並註明各自交付物；不由 AI 擅自決定哪個日期是最終期限。未提供期限時，要求組員補充含期限的來源，不可自行補日期。內容不清楚時明示需要更多資料。
- 若派發至交付的期間**超過七天**，建議 internal deadline 提早三天；期間為七天或以下，建議提早 24 小時。缺少或不確定必要日期時，不產生確定的 internal deadline。
- 所有現任群組成員可查看、修改及保存共用分析計畫。不得自行決定同時編輯時採用最後寫入覆蓋、版本表或其他衝突策略。
- AI 讀取範圍是目前群組上傳的檔案；此決定不授權 AI 閱讀聊天歷史或其他群組內容。

### 檔案行為

- 現任群組成員可上傳、查看／開啟、下載及替換檔案，不需 leader 逐項批准；目前版本僅由目前版本的上傳者刪除。替換時不保留舊版本；刪除的檔案內容不保留，也不能還原，需重新上傳。只保留聊天室目前存在的檔案，並依以下學期保留規則保存五個月。
- 接受所有檔案類型和所有圖片形式；單檔上限 100 MB。
- 學期 A 自 9 月 1 日起、學期 B 自 1 月 10 日起，各自的聊天室目前檔案從該學期起始日起保存五個月。成員離開或被移除時，不刪除目前的群組檔案；該成員隨即失去新的檔案/API 存取權。被替換或刪除的舊內容不保留。
- 無權限時，只顯示無權限訊息，不額外提示聯絡 leader 或申請加入。
- 處理期間向群組成員顯示「AI is processing」；檔案無法處理時，要求重新上載合適檔案。
- 產品偏好是尚未取得裝置檔案／相片存取同意前仍可看到原有頁面與上傳入口，並在每次上傳要求時再次請求權限，直到獲得權限。請確認此行為在 CityLink 網頁執行環境中可行；不要假設網頁能取得整部裝置的常駐存取權。
- Adam 表示處理時只需告知群組成員正在處理。這是產品偏好，不免除任何實際適用的隱私、安全或第三方資料處理告知要求；如有衝突，請指出並交 Adam 決定，不要靜默省略。

## 程式庫現況與相鄰工作

以下是初次檢查基線 `main` (`1a583e30c019733d1880d2614ca853481509fdad`) 的歷史觀察：`client/src/pages/citylink/GroupChatPage.tsx` 是純文字聊天室頁面；`client/src/lib/supabaseStage6.ts` 封裝現有 chat/recruitment RPC，當時未見檔案或 AI 服務。Stage 6 migration `20261118050000_stage6_chat_recruitment.sql` 是聊天室及招募貼文範圍，不是群組附件或 AI migration。本機分支之後已同步至 `main` `3514630896b96b7f7e0fa2239084071273335ecf`。2026-11-23 於該 main 重新只讀核對：`client/src/pages/citylink/GroupChatPage.tsx` 仍為 335 行純文字聊天頁；`client/src/lib/supabaseStage6.ts`（948 行）只有 chat／recruitment 的 RPC 封裝，未見檔案或 AI 函式；`supabase/migrations/` 沒有任何 storage 相關 migration；`supabase/schema.sql` 沒有附件表；`server/storage.ts` 是 Manus WebDev 樣板的 S3 helper，不屬 CityLink 上傳功能。以上是靜態檔案觀察，不代表已查驗 Supabase Test 即時 schema／Storage 或任何 RLS 行為。

現有聊天室授權允許部分已離開群組的前成員查看歷史訊息；檔案與共用分析計畫則必須遵守「僅現任成員」。因此不可直接重用聊天室的可讀權限作為檔案或計畫存取權限；請說明伺服器如何在每次存取時分別驗證身分與現任 membership。

PR #36 和 PR #33 都涉及聊天室頁或 Stage 6 client，需避免以整檔覆蓋方式整合。先前引用的 PR #37 OPEN draft 快照（head `344c1058e78fd2cccfde89574e226f3e65a1457c`）已經失效：PR #37、#33、#36 均於 2026-11-23T09:05Z 合併入 `main`，而該 head 就是 #37 的最終 head。合併是事實狀態，不代表本功能已取得任何 API／Storage／RLS 授權，也不改變「Kayk 不應覆蓋聊天室相關程式」這條界線。

## 請 Role 6 回覆的技術問題

1. **身分與授權：** 建議的檔案及共用計畫讀取／寫入授權邊界為何？如何確保伺服器每次驗證現任群組成員，而不是只信任前端隱藏控制項？移除後要如何拒絕新的檔案/API 請求？Adam 已決定不要求先前已發出的連結立即失效；請說明現有連結可用至其有效期屆滿時的風險與建議有效期。
2. **檔案流程：** 請審查上傳、查看／下載、替換及刪除所需的 API 行為及上傳者身分驗證。替換者成為目前版本上傳者並取得目前版本刪除權；替換不保留被替換的內容。使用者刪除檔案後不保留被刪除內容、不能還原。請確認如何讓已發出的連結在物件替換／刪除後符合這項「不保留已刪內容」產品要求，並與 Adam 對成員移除後既有連結可用至原有效期的決定區分；不要自行把成員移除的例外延伸到已刪除物件。
3. **任意檔案與限制：** 如何在伺服器端落實 100 MB、處理副檔名與實際內容不符、惡意檔案或不支援的解析格式？「接受所有檔案」和「AI 能分析檔案」須如何分開呈現？請勿將所有檔案類型等同於每種格式均可被 AI 解析。
4. **保留與移除成員：** 學期 A（9 月 1 日）與學期 B（1 月 10 日）的開始日期權威來源在哪裡？五個月到期如何執行與驗證？成員被移除時，如何保留仍在期限內的聊天室目前檔案、拒絕其新的檔案/API 請求及計畫讀寫？依 Adam 的決定，成員移除後已發出的連結不需要立即失效，可在原有效期內繼續使用；此例外不代表替換或刪除的舊檔案內容要保留。本項不授權成員移除時自動刪除目前群組檔案。
5. **AI 資料流：** 建議的伺服器端處理邊界如何限制為目前群組的上傳檔案？會否向第三方傳送檔案？若是，須向使用者披露哪些資料處理資訊或取得哪些同意？請標出需要 Adam 作產品決定的項目；不要在審查中自行指定 provider。
6. **共同計畫：** 建議如何儲存與授權共用分析結果，使所有現任成員可修改並保存？兩位成員同時修改、舊頁面覆寫新內容或成員在儲存期間被移除時，伺服器應如何處理？請列出選項與影響，不要先替團隊選擇版本策略。
7. **錯誤與 QA：** 需要哪些測試來證明非成員、前成員、現任非上傳者及上傳者的權限差異；全格式／大小上限、保留到期、AI 無法讀取、權限不足、移除成員後的新請求遭拒、既有連結可用至有效期屆滿，以及多人編輯行為？請分清可由 mock 測試驗證的項目和必須等 Test 授權後才能做的 live QA。

## 交付給 Role 6 的回覆格式

請以審查意見回覆，不需在本階段撰寫或套用 migration。逐題標記「可行／需修改／待 Adam 決定」，列明依據的 repo 檔案或 contract，並指出任何會阻止實作的項目。若建議變更 API、schema、Storage 或 RLS，請提供一份單獨標示為**技術提案**的差異或 migration 草案供 review；不要直接套用到 Test 或 Main。

收到 Role 6 意見後，Kayk／Adam 應將審查回覆帶回本 task，由 Adam 確認任何產品取捨；核對完成前不接真實上傳、AI、儲存或共用計畫 API。

## 2026-11-23 — Role 6 審查摘要與 Adam 決定

**審查來源：** Adam 提供的《Role 6 唯讀技術／安全審查：群組聊天室 AI 作業分析與檔案》。Role 6 判斷功能整體可行，但明確指出該文件是建議與風險審查，不是已批准的 API／RLS／Storage 合約，也不是可執行 migration；因此不代表可以開始接真實上傳、AI、儲存或共用計畫 API。

**Adam 決定 A（2026-11-23）：** 成員被移除後，新的檔案／API 請求應拒絕；先前已發出的下載連結不必立即失效，可以在原本有效期內繼續使用。檔案物件仍保留。此決定放寬了「既有連結須即時撤銷」要求，但沒有授權新的請求繼續讀取檔案，也不代表可使用永久或公開連結。已下載到個人裝置的副本無法遠端收回。Role 6 須建議安全的連結有效期與快取／記錄處理方式，不能把任意有效期當成 Adam 已批准。

**Adam 決定（檔案替換刪除權，選項 2；2026-11-23）：** 現任組員替換其他組員上傳的檔案後，替換者成為目前版本的上傳者，並取得刪除目前版本的權限；原上傳者不再能刪除目前版本。替換後舊內容如何處理後來由 Adam 更新，見下方最新決定。

**Adam 決定（檔案版本歷史，選項 2；2026-11-23，已被後續決定取代）：** 當時決定保留可查看及下載的舊版本。Adam 於 2026-11-23 後續明確改為「舊版本不保留；已刪除檔案不保留；只保留聊天室目前存在的檔案」，因此不得實作舊版本歷史、舊檔案復原或刪除後保留內容。

**Adam 最新決定（目前檔案保留；2026-11-23）：** 學期 A 自 9 月 1 日開始，聊天室目前存在的檔案從該日起保留五個月；學期 B 自 1 月 10 日開始，聊天室目前存在的檔案從該日起保留五個月。替換時不保留舊版本；任何被刪除的檔案內容均不保留；只保留目前仍存在於聊天室的檔案。若需要恢復被替換或刪除的內容，必須重新上傳。這取代前述保留版本歷史與「舊版本保存四個月」的決定。此產品決定不批准特定儲存架構或到期清理實作。

**Role 6 的技術建議（未批准）：** 每個伺服器操作重新驗證登入者及 active membership；使用私有 bucket，不使用公開 URL；採 upload intent、完成確認、隔離／掃描與可重試清理；大檔評估 TUS/resumable upload；以新版本替換檔案；AI 僅處理同群組、可用、未過期且經批准的檔案；共用分析計畫可評估版本號與 compare-and-swap，衝突時要求重載而非靜默覆寫。這些只是 Role 6 建議，不得當作已批准的技術決定或直接實作。[7] [8] [9] [10]

**尚待 Adam 決定或技術負責人提出可審查選項：** 5 個月是否按日曆月計及到期時區／具體到期時刻；群組為 archived／abandoned 時檔案與計畫是否仍可用；到期後 metadata／稽核紀錄的處理；檔案被替換或刪除後，已發出的連結是否須立即失效（成員移除時已發出連結不必立即失效的決定不自動延伸至被刪除內容）；100 MB 的 byte 換算與群組總配額；所有格式是否代表均可保存但僅支援格式可供 AI 解析；新加入組員能否查看既有分析；是否採用版本衝突提示；學期日期的年份／時區來源；以及使用第三方 AI／掃描服務時須如何告知或取得同意。Role 6 表示實際 100 MB 上限還取決於專案 Storage 設定與方案，本次未核對實際專案上限；不能先承諾所有部署環境均可用 100 MB。[8]

**網頁檔案選取限制：** 使用者可以透過瀏覽器／Android 檔案選擇器選取檔案；網頁不應假設可在使用者未選取時掃描整部裝置。是否以一般選檔器符合原產品預期，仍須在 UI 合約中確認。[11]

**實作狀態：** 尚未寫入 API／schema/RLS／Storage／AI 程式，未建立或套用 migration，未連接 Supabase Test 或 Main。repository 內仍無此功能的程式碼、migration 或 Storage 設定；本文件與同批研究只提供產品決定、審查提案與供應商研究。Role 6 報告提到曾有較早的 Test 只讀檢查，但本次未重新查驗；任何 migration 提案前仍須按授權重新檢查 disposable Test 的 schema、RLS、Storage 設定與學期日期來源。

## 2026-11-23 — 提交 Role 6 的正式審查請求

**審查標的（唯讀）：** repository `minstrel1014/CityLink`；分支 `feature/kayk-ai-project-room-files`；head `6804fdc8079b2ef04f155178b383b19b2b02cf5a`；draft PR #59；base `main` `3514630896b96b7f7e0fa2239084071273335ecf`。

**本請求涉及的檔案（全部為文件，+297／−0，無程式碼、migration、schema 或 Storage 變更）：** `docs/team/DECISIONS.md`、`docs/stage6/KAYK_AI_FILE_TECHNICAL_REVIEW_PROPOSAL.md`、`docs/stage6/KAYK_CLOUD_DRIVE_API_COMPARISON.md`、`docs/stage6/KAYK_CLOUD_STORAGE_RESEARCH.md`、`docs/stage6/KAYK_FREE_TIER_CAPACITY_AND_RATE_LIMITS.md`。

**請求性質：** 正式書面審查意見，不是批准，也不是 migration、Storage、OAuth 或實作授權。Role 6 只需回覆技術可行性與風險；任何 provider、架構或產品取捨留給 Adam 決定。

**請逐題回覆的七項問題：** 即上文「請 Role 6 回覆的技術問題」第 1–7 項（身分與授權、檔案流程、任意檔案與限制、保留與移除成員、AI 資料流、共同計畫、錯誤與 QA）。

**回覆格式：** 每題標記「可行／需修改／待 Adam 決定」，引用所依據的 repo 檔案或既有 contract，並明確列出任何會阻止實作的項目。若建議改動 API、schema、Storage 或 RLS，請另附一份單獨標示為技術提案的草案；不要套用到 Test 或 Main。

**審查時請不要做的事：** 不要選定 provider 或帳戶類型；不要假設 100 MB 在實際 Storage 方案可行；不要把本文件或先前唯讀審查當成已批准合約；不要執行 SQL、migration 或任何 Test／Main 寫入。

**交付路徑：** 本請求經協調任務轉交 Role 6；回覆帶回本 task，由 Adam 確認產品取捨後才進入技術合約定稿。

## Git 與範圍記錄

2026-11-23 分支保全紀錄：檢查時本機 feature branch 從 `1a583e30c019733d1880d2614ca853481509fdad` 落後 `origin/main` 79 commits，且沒有本機獨有提交。先將已修改的 `docs/team/DECISIONS.md` 與四份 `KAYK_*.md` 報告複製到 repository 外備份，再以 `git stash --include-untracked` 保存原工作狀態；之後確認本機 HEAD 是 `origin/main` 祖先，以 `git merge --ff-only origin/main` 快轉至 `3514630896b96b7f7e0fa2239084071273335ecf`。原決策檔仍在 stash／外部備份；其內容已另依最新 main 人工整理。四份報告已從備份還原。編寫本提案時沒有程式碼、schema、RLS、Storage 或 AI 實作，沒有 Test／Main 存取。文件已提交為 `6804fdc8079b2ef04f155178b383b19b2b02cf5a` 並推送同名遠端分支，以 draft PR #59 提交審查；Git 是本機版本／分支／提交追蹤，GitHub 是遠端分支與 PR 審查平台；絕不直接推 main、force-push 或未經 lead 批准合併。

## References

[1]: https://github.com/minstrel1014/CityLink/blob/main/client/src/pages/citylink/GroupChatPage.tsx "Current group chat page"
[2]: https://github.com/minstrel1014/CityLink/blob/main/client/src/lib/supabaseStage6.ts "Current Stage 6 client service"
[3]: https://github.com/minstrel1014/CityLink/blob/main/supabase/migrations/20261118050000_stage6_chat_recruitment.sql "Current Stage 6 chat and recruitment migration"
[4]: https://github.com/minstrel1014/CityLink/pull/36 "Draft PR 36 group capacity client"
[5]: https://github.com/minstrel1014/CityLink/pull/33 "PR 33 course People and navigation QA"
[6]: https://github.com/minstrel1014/CityLink/pull/37 "Draft PR 37 capacity integration"
[7]: https://supabase.com/docs/guides/storage/uploads/resumable-uploads "Supabase Storage resumable uploads"
[8]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase Storage upload limits"
[9]: https://supabase.com/docs/guides/storage/buckets/fundamentals "Supabase Storage bucket access models"
[10]: https://supabase.com/docs/guides/storage/serving/downloads "Supabase Storage private downloads and signed URL revocation"
[11]: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API "MDN File System API and user-selected file access"
