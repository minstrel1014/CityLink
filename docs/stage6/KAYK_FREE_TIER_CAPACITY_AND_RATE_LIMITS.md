# CityLink 集中式雲端儲存：免費額度、API 限流與滿額處理

- **資料核對日期：** 2026-11-23
- **狀態：** 中立工程建議，供 Adam 與技術負責人評估；未選定 provider 或核准架構。

## 先把儲存容量換算成可規劃數字

若假設每個目前檔案都用滿 100 MB，並把 GB 按十進位估算，Google 個人帳戶的 15 GB 理論上約 150 個檔案；OneDrive 個人免費額度 5 GB 約 50 個；Dropbox Basic 的 2 GB 約 20 個；Box 免費 Developer plan 10 GB 約 100 個。[1] [2] [3] [4] 這些只是容量除法上限，不是安全可用數：Google／Microsoft 配額會與其他服務共用；實際帳戶可能已占用空間；還需為 metadata、其他檔案及未完成上傳留空間。Box 免費 developer plan 面向原型與測試，不應視作已核准的正式群組容量。[4]

CityLink 目前產品決定是檔案自學期起始日起保留五個月、替換或刪除的內容不保留。容量規劃應估算五個月內的**目前有效檔案**總量：

`預估保留容量 = 每月成功上傳的有效檔案總 bytes × 5 + 帳戶原有占用量 + 暫存／安全餘裕`

因單檔最多 100 MB，不能只用「每組可以存幾個檔案」作固定答案；每組檔案大小與數量會不同。若超過免費 quota，供應商可能拒絕後續上傳，或限制其他操作。Google 超過帳戶容量時，許多 Drive 操作會受限制；Microsoft 超額時不能上傳、編輯或同步新檔案；Dropbox API 可能回傳帳戶限制錯誤。[1] [2] [5]

## API 流量被限時如何處理

**收到 429／節流回應時排隊，不要立刻重送。** Microsoft Graph 回傳 429 及建議等待時間時，應按 `Retry-After` 等待；若仍失敗，繼續遵從新等待值，沒有該 header 時才用指數退避。[6] Dropbox 的 429 可能附 `Retry-After`，沒有時用指數退避，並建議用批次端點減少呼叫。[7] Box 回傳 429 與 `retry-after`；官方建議指數退避，Box SDK 會為受支援的情況自動處理。[8] Google Drive 在配額錯誤時建議截斷式指數退避，並對短時間配額與不同 API 方法的成本分別監控。[9]

**採用有上限的背景佇列。** 上傳或下載可進佇列並限制同一 provider／帳戶的同時工作數。重試次數必須有上限；超過上限就告知使用者處理未完成及可再次嘗試，不能把尚未寫入雲端的操作顯示成成功。對 100 MB 檔案採可續傳／分塊方式可降低網路中斷後從頭重傳的成本，但是否採用及其 API 合約仍交技術負責人決定。

**減少不必要呼叫。** 不要用短間隔輪詢整個雲端資料夾；使用 provider 支援的變更通知／delta 或 webhook。只要求必要 metadata 欄位，快取可安全快取的 token／metadata，避免每次畫面重繪都重讀清單。Box 特別建議快取 token、用 webhook／event stream 取代 polling，並以較大的頁面數減少列舉請求；Microsoft Graph 亦建議避免頻繁 polling 並使用 change tracking。[6] [8]

**AI 分析只需按受控流程取檔。** 一次分析可先確認檔案目前仍存在、群組仍符合權限、檔案未到期且格式可解析，再安排必要的下載／解析工作；若處理失敗，不應無限重試或重複傳送內容。具體 provider／AI 資料流尚待批准。

## 儲存接近或到達上限時

1. **監控實際容量和成長率。** 記錄 provider 回報的已用／剩餘 bytes，並以群組、學期及時間統計成功上傳總量。這是建議的工程控制；監控頻率、告警門檻與使用者顯示方式仍待決定。
2. **提前告警但不提早刪檔。** 可提出 70%／85%／100% 作工程告警門檻供 Adam 核准；它們不是已決定的產品門檻。為了維持目前的五個月保留承諾，不得在未到期時自動刪除仍在聊天室目前檔案清單中的內容來挪出容量。
3. **滿額時明確拒絕新上傳並提供可理解狀態。** 應先確認 quota 失敗，再回覆上傳未完成；不能回傳成功或留下不可見的半檔。是否提供管理員升級、等候或其他 storage 方案要 Adam 決定。容量滿載本身不能默默縮短五個月期限。
4. **只按已批准的期限清理到期檔案。** 到期後刪除物件的排程、失敗重試、清理紀錄與 metadata 留存需要技術設計與 Role 6 審查。未到期檔案不能提早清除。被使用者替換／刪除的內容按產品決定不保留，但已發出連結在實際刪除後如何處理仍須技術審查；不可將「成員移除後既有連結不必即時失效」自動解讀成已刪內容可繼續提供。
5. **準備超出免費額度的決策路徑。** 可比較購買容量、使用 App 自有 Storage，或調整產品額度等選項；這不是要求現在購買，也不代表哪個選項獲准。若服務正式供多群組使用，免費個人帳戶由單一人持有會形成容量、帳戶依賴和持續服務風險。

## 候選供應商的流量特性

- **Google Drive：** API quota 按 Cloud project 與使用者維度管理；不同方法消耗不同 quota units，超限可能回 403 或 429。文件建議指數退避。Google 官方目前也說標準 API 使用沒有額外費用，但超過 quota request limits 的收費將在 2026 年稍後開始，完整收費資訊尚待公告；因此不能假設 API 流量永遠免費。[9]
- **Microsoft Graph／OneDrive：** 沒有一個對所有 endpoint／操作通用的固定 request rate；限流取決於場景。429 會帶建議等待時間；照 `Retry-After` 等待是官方建議。[6]
- **Dropbox：** 不公開一般 API 的固定 rate limit 數字；429 可能附 `Retry-After`，同一 namespace 的併發寫入也可能造成 429。上傳大於 150 MB 時使用 upload session；CityLink 目前單檔 100 MB 可低於該建議界線，但重試和速率管理仍須做。[7] [10]
- **Box：** 文件指出一般 API 約每使用者每分鐘 1000 次，檔案上傳每使用者每分鐘 240 次；特定 endpoint 與服務品質限制可能不同。429 回應含 `retry-after`；免費 developer account 可用真實 API call 測試限流處理。[8]

上述是供應商公布的操作資訊，不是 CityLink 可承諾的服務容量或 SLA；版本、帳戶種類、API endpoint、租戶設定與 provider 政策都可能改變適用上限。

## CityLink 建議的決策順序

先由 Adam／lead 決定是否接受「免費個人帳戶只有個人配額，滿額可能阻止上傳」作原型限制，以及原型是否會用真實學生檔案。再由技術負責人針對候選 provider 核對免費方案的使用條款、配額、測試環境、OAuth scope、所有權與 API throttling。接著交 Role 6 審查伺服器端群組權限、節流重試、到期清理、替換／刪除後的連結處理和資料外傳。任何 Supabase Test 寫入或 migration 仍需單獨明確批准；不得接觸 Supabase Main。

## References

[1]: https://support.google.com/googleone/answer/9312312?hl=en "How your Google storage works"
[2]: https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs "Microsoft storage FAQs"
[3]: https://www.dropbox.com/basic "Dropbox Basic free account"
[4]: https://developer.box.com/guides/getting-started/free-developer-plan "Box free developer plan"
[5]: https://docs.dropboxapi.com/dropbox-api/docs/error-handling "Dropbox API error handling"
[6]: https://learn.microsoft.com/en-us/graph/throttling "Microsoft Graph throttling"
[7]: https://docs.dropboxapi.com/dropbox-api/docs/error-handling "Dropbox API error handling"
[8]: https://developer.box.com/guides/api-calls/permissions-and-errors/rate-limits "Box API rate limits"
[9]: https://developers.google.com/workspace/drive/api/guides/limits "Google Drive API usage limits"
[10]: https://developers.dropbox.com/dbx-performance-guide "Dropbox API performance guide"
