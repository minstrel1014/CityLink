# CityLink 雲端硬碟 API 比較：免費容量與串接難度

- **資料核對日期：** 2026-11-23
- **用途：** 比較可由 App 以 API 整合的常見個人免費雲端硬碟，供 Adam、技術負責人及 Role 6 評估。本文不選定 CityLink 的 provider、Storage、資料庫、API 或權限架構。

## 比較摘要

| 服務與免費方案                                                       |                                              免費儲存空間 |                                                     官方單檔上傳能力 | 接入難度（評估）                   | 主要難點                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------: | -------------------------------------------------------------------: | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Drive 個人 Google 帳戶                                        |            最多 15 GB，與 Gmail、Google Photos 等共用 [1] |        Drive API 公布每檔最高 5 TB；實際可用總量仍受帳戶配額限制 [2] | **中等**                           | OAuth 與 scope 選擇；使用較廣的敏感／受限制 scope 可能需要 Google OAuth 驗證；受限制資料若存到或經過伺服器，可能還需安全評估。若只用 `drive.file` 和 Picker，範圍較小，但使用者需選取／分享給 App 的檔案 [3]                                                                                    |
| OneDrive 個人 Microsoft 帳戶                                         | 5 GB，與 OneDrive 檔案／相片及 Outlook.com 附件等共用 [4] |       Graph 單次直接上傳支援至 250 MB；更大檔案用 upload session [5] | **中等**                           | 需設 Microsoft Entra 應用、Graph delegated permissions 與 OAuth；不同 permission 對個人帳戶的支援不同。`Files.ReadWrite.AppFolder` 可把 App 範圍限制在使用者 OneDrive 的 App 資料夾，但配額仍算在該使用者帳戶 [6]                                                                               |
| Dropbox Basic                                                        |                                                  2 GB [7] | 單次 `/files/upload` 適合 150 MB 以下；超過建議用 upload session [8] | **低至中等**                       | OAuth 流程文件清楚，但需註冊 App、定義 scopes 和 redirect URI，安全保存授權；每位使用者仍需授權自己的 Dropbox。免費容量是三者中最低 [9]                                                                                                                                                         |
| Box 免費 Developer plan（開發者方案，不等同一般個人免費 Drive 方案） |                                                     10 GB |                                                          250 MB [10] | **原型試作低；正式產品評估中至高** | 免費方案明確為 build/test/prototype；雖提供完整 API 類別及 OAuth 2.0，文件也說並非每個 endpoint 都在免費方案開放。正式多使用者管理、支援與額度要另查付費方案。免費 developer account 可自動建立並授權一個預設 CCG app，適合快速測 API，但不等於已驗證 CityLink 所需的多使用者群組權限 [10] [11] |

難度是以一個已熟悉網頁 App、OAuth 及伺服器端秘密管理的開發者，完成安全原型所需工作量作相對估計；不是供應商的官方分級。實際上，四家都不是「只貼一條分享連結」就能完成群組共享。

## 對 CityLink 100 MB 單檔要求的含義

從公開 API 規格看，四個候選都有可支援 100 MB 單檔的上傳方式：Google Drive API 的公布檔案上限遠高於 100 MB；OneDrive Graph 直接上傳上限是 250 MB；Dropbox 單次上傳建議上限 150 MB；Box 免費 developer plan 的單檔上限是 250 MB。[2] [5] [8] [10] 但這只表示單檔 API 規格可容納 100 MB，不表示免費帳戶能長期存很多此類檔案：帳戶總配額分別只有 15 GB、5 GB、2 GB、10 GB，而且 Google、Microsoft 配額會與同帳戶其他服務共用。[1] [4] [7] [10]

## 串接難度與 CityLink 的權限需求

### Google Drive

**適合的情境：** 快速做使用者選取 Drive 檔案的 prototype，或讓使用者把特定檔案授權給 App。Google 官方建議採最小必要 OAuth scope；`drive.file` 只處理 App 建立或使用者透過 Picker／檔案選擇器交給 App 的檔案。要求讀取使用者整個 Drive 的 scope 屬 restricted，可能需要額外 OAuth verification；若受限制資料在伺服器儲存或傳輸，Google 文件指出可能需安全評估。[3]

**難點：** 若 CityLink 要讓伺服器不經使用者逐次選取，就要仔細定義誰授權、檔案放在哪個 Drive／資料夾及是否符合 Google scope 政策。15 GB 是單一 Google 帳戶共享配額，不是群組配額。[1]

### OneDrive

**適合的情境：** 使用者透過 Microsoft 帳戶連接自己的 OneDrive，或採 App Folder 讓 App 檔案隔離在每位使用者自己的 OneDrive 內。Microsoft Graph 支援 delegated permissions，即 App 代表登入使用者工作，但 App 不可超過該使用者本身能存取的範圍。[6]

**難點：** 需建立 Entra App、設定正確的帳戶類型、redirect URI 和 Graph 權限。若用個人 Microsoft 帳戶，必須逐項確認所選 permission 是否支援該帳戶類型。App Folder 雖可縮小權限，檔案仍占用各使用者自己的 OneDrive 配額，使用者也能自行刪改其中檔案。[6]

### Dropbox

**適合的情境：** 個人帳戶授權及檔案操作的原型。Dropbox API 使用 OAuth 2.0；供應商文件說明要在 Developer Console 建立 App、設定 scopes 和 redirect URI，再讓每位使用者登入並授權。對無法安全保存 client secret 的前端／單頁 App，Dropbox 建議使用 PKCE。[9]

**難點：** 2 GB 個人配額較易耗盡。100 MB 單檔低於 Dropbox 建議的 150 MB 單次上傳界線，但未來如支援更大檔案或網路不穩，需實作 upload sessions 和重試。[7] [8]

### Box

**適合的情境：** 開發者快速試驗 API。Box 免費 developer plan 公布 10 GB 儲存、250 MB 單檔、OAuth 2.0 等 API；可在 Developer Console 建立 app。Box OAuth 會把使用者導至 Box 登入授權，再將授權碼換成 access/refresh token。[10] [11]

**難點：** 這是免費開發者方案，不宜把它與可直接供整個 CityLink 群組使用的免費團隊儲存方案混為一談。Box 說明免費方案主要用於 build/test/prototype，而且不是每個 endpoint 都開放；若要正式服務，需先確認帳戶類型、使用者／群組管理、API endpoint 權利與商業條款。[10]

## 所有方案共同的限制

1. **個人免費容量不是群組共享額度。** 若由單一帳戶集中持有，容量會由該帳戶支付／承擔，並帶來帳戶持有人離開、配額耗盡及存取憑證管理等風險。若每位學生各連自己的 Drive，群組檔案會分散在不同帳戶，成員退出 CityLink 時還得同步撤銷 provider 權限。
2. **Provider sharing 和 CityLink membership 是兩套權限。** App 必須每次在自己的伺服器端核對群組成員，再決定是否呼叫外部 API；不能只依賴分享 URL 或隱藏前端按鈕。
3. **聊天記錄不等於雲端硬碟檔案。** Drive API 可存放或下載檔案，但聊天室訊息通常還需要結構化資料、排序、查詢、群組權限與即時更新。不能因硬碟有免費容量就推論它可取代 CityLink 聊天服務資料庫。
4. **刪除與期限需由 CityLink 控制並測試。** CityLink 最新產品決定是學期 A 自 9 月 1 日、學期 B 自 1 月 10 日起，聊天室目前檔案各保留五個月；替換或刪除的內容不保留。第三方雲端可能另有回收桶、版本或已發連結行為，因此技術負責人須確認能否滿足「刪除後不保留」及既有連結規則；不可只看帳戶配額。
5. **AI 讀取不是免費雲端 API 自動提供。** Drive API 讓 App 取得檔案內容，不代表 AI 可讀懂每種檔案，也不代表可把資料交給第三方模型。Provider、處理地點、告知／同意和支援格式仍需獨立審查。

## 結論與下一步

若目標只是**最快驗證 API 呼叫**，Box 免費 Developer plan 文件中提供最明確的 prototype 資源，但不應因此直接將它定為 CityLink production 儲存。若目標是讓學生連自己的帳戶，Google Drive 的 `drive.file` + Picker 和 OneDrive 的 App Folder 可較好地限制 scope；Dropbox 的 OAuth 文件也清楚，但免費容量最低。這些是「原型便利性」的比較，不是安全性／成本／合約的最終排名。

Adam 於 2026-11-23 選擇以**由 App 集中管理檔案**作為下一步評估方向。這只確定比較模式，不代表已選定 provider、儲存帳戶、OAuth/API、正式服務條款或技術架構。現有容量比較中的個人免費帳戶數字不能直接當成 CityLink 可用的集中式配額；需再核對候選服務是否允許 App 代表集中帳戶管理群組檔案，以及帳戶持有人、多人存取、OAuth、配額和正式使用條款是否適合。

下一步由技術負責人與 Role 6 在此方向下審查 OAuth scope、檔案所有權、伺服器端現任成員授權、容量與限流、到期清理、刪除後連結和 AI 資料流。本文沒有建立 OAuth app、連結帳戶、修改 Supabase、選定架構或核准實作。

## References

[1]: https://support.google.com/googleone/answer/9312312?hl=en "How your Google storage works"
[2]: https://developers.google.com/workspace/drive/api/guides/limits "Google Drive API usage limits"
[3]: https://developers.google.com/workspace/drive/api/guides/api-specific-auth "Choose Google Drive API scopes"
[4]: https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs "Microsoft storage FAQs"
[5]: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0 "Upload or replace the contents of a OneDrive driveItem"
[6]: https://learn.microsoft.com/en-us/graph/permissions-overview "Overview of Microsoft Graph permissions"
[7]: https://www.dropbox.com/basic "Dropbox Basic free account"
[8]: https://developers.dropbox.com/dbx-performance-guide "Dropbox API performance and upload guide"
[9]: https://docs.dropboxapi.com/dropbox-api/docs/oauth "Dropbox API OAuth"
[10]: https://developer.box.com/guides/getting-started/free-developer-plan "Box free developer plan"
[11]: https://developer.box.com/guides/authentication/oauth2 "Box OAuth 2.0 authentication"
