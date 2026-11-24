# Role 6 審查：Cloudflare R2 adapter 設計（2026-11-24）

> 本檔為 Role 6 回覆的原文存檔，僅加入本段前言。原文由 Adam 於 2026-11-24 轉交。
> 對照基準：`origin/main` `3514630`。性質：唯讀靜態審查，未連線資料庫或 R2。

---

> **後續處理（2026-11-24）：** 本檔原文保留，不修改。其中 R5（保留期 4 個月）已被 Adam 2026-11-23 的五個月決定取代，該句標為 superseded，不再是有效規則；R6 已定案為「替換限現行版本上傳者，leader 可刪除但不得無聲覆寫」。R1 至 R4 已在設計與 P1 SQL 中修正。

# Role 6 審查：群組聊天室檔案 — Cloudflare R2 adapter 設計

**收到：** 2026-11-24 01:38，附件 `CityLink群組聊天室檔案：CloudflareR2adapter設計.md`（Kayk，branch `feature/kayk-ai-project-room-files`，狀態：設計文件）。
**對照基準：** canonical repo `minstrel1014/CityLink` `origin/main` `3514630`。
**性質：** 唯讀靜態審查。未連線任何資料庫或 R2、未執行 SQL、未套用 migration、未修改任何檔案。

---

## 總體判斷

**設計方向是對的，而且比 Drive 版明顯乾淨**——沒有 HMAC 代理、沒有垃圾桶規避、沒有 OAuth 續期，這三段的複雜度確實消失了。安全要點（§8）寫得比多數設計文件好：物件鍵用 `file_id` 不用檔名、綁定 `Content-Type`、presigned URL 當 bearer token 對待、bucket 私有、不開 `r2.dev`、CORS 不用 `*`。

但有 **四個必須在 P1 之前解決的項目**，其中 R1 會讓端點直接失敗，R2 是安全漏洞，R3 是流程與簽名不一致。

| #      | 問題                                                                                   | 嚴重度                   |
| ------ | -------------------------------------------------------------------------------------- | ------------------------ |
| **R1** | 「用 service role 呼叫 predicate」與 repo 的權限姿態衝突，且會摧毀 `auth.uid()` 契約   | **阻擋（端點無法運作）** |
| **R2** | presigned PUT／GET 若接受用戶端傳來的 `object_key`，等於任意覆寫 bucket 內物件         | **阻擋（安全）**         |
| **R3** | `confirm_group_file_upload(p_file_id)` 沒有接收實測大小／型別，但文件說 RPC 要「核對」 | **阻擋（設計不自洽）**   |
| **R4** | `can_access_group_files` 必須是 **active-only**，文件未寫明                            | **必須明訂**             |
| R5     | 保留期 5 個月 vs 先前記錄的 4 個月，直接衝突                                           | 需 Adam 裁決             |
| R6     | 「任何成員可替換」與「只有上傳者可刪除」語意衝突                                       | 需 Adam 裁決             |
| R7     | 配額是軟上限，併發可超賣；且 DB 統計與 bucket 實際用量會漂移                           | 記錄即可                 |
| R8     | `starts_on` 從未由任何 migration 填入，推導規則是新決定                                | 需記錄                   |

---

## R1（阻擋）— 不要用 service role 呼叫 predicate

§2 寫：「與資料庫同專案，可直接用使用者的 JWT 驗身分，**再用 service role 呼叫 predicate**」。

這句話有兩個問題，第二個比較嚴重。

**問題一：service_role 根本沒有 EXECUTE。** repo 裡每一個 RPC 的權限姿態都是 `REVOKE ALL ... FROM PUBLIC, anon, authenticated` 之後只 `GRANT EXECUTE ... TO authenticated`。我查過 `create_group_and_invite`、`list_group_chat_messages`、五個 DM RPC、`get_direct_thread_state`，全部一樣。**沒有任何一個 RPC 授權給 `service_role`。** 所以端點用 service role 去呼叫，會直接得到 permission denied。

**問題二（更重要）：service role 會讓 `auth.uid()` 變成 NULL。** repo 的 private helpers 全部以 `auth.uid()` 判斷身分，而且 `20261102131343` 裡有一句明確的設計註解：

> Private helpers use auth.uid() rather than a caller-supplied actor ID.

`auth.uid()` 讀的是 PostgREST 為該 session 設定的 JWT claim。service_role 呼叫時沒有使用者 JWT，`auth.uid()` 回 NULL → predicate 一律回 false → **fail-closed，功能不會動**。

真正危險的是「修好它」的方式：如果為了讓 service role 能判斷身分，而把 predicate 改成接受 `p_actor_id` 參數，那就**正好推翻了上面那句設計註解所防範的東西**——呼叫端可以自稱任何身分。那會是整個檔案功能最嚴重的一個漏洞。

**建議：端點一律以使用者的 JWT 呼叫 RPC，不用 service role。** 端點的工作只有三件：驗 JWT、把 JWT 原樣轉給 Postgres、拿回結果去簽名。授權完全留在資料庫，而且 `auth.uid()` 契約不變，所有既有 helper 可以直接重用。這比文件現在寫的做法更簡單，也更安全。

（若確實有某一步非得用 service role——例如寫回 `HeadObject` 的實測大小——那一步應該是**另一個明確的 RPC**，用 `auth.uid()` 驗身分後寫入，而不是讓端點直接改表。見 R3。）

## R2（阻擋，安全）— presigned URL 必須由 `file_id` 推導，不能接受用戶端給的 key

§4 第 1 步說 `request_group_file_upload` 回傳 `file_id` **與 `object_key`**。回傳給前端顯示無妨，但**端點在簽名時絕不能採用用戶端傳來的 key**。

若端點接受 `object_key` 參數並照著簽，任何已登入的使用者都可以要求一個指向 `groups/<別人的 group_id>/<別人的 file_id>` 的 presigned PUT，然後覆寫別人的檔案。bucket 私有、CORS 嚴格都擋不住這件事——因為那是合法簽名的請求。

**規則：** 簽名端點的輸入只有 `p_file_id`（下載則是 `p_file_id`）。端點以使用者 JWT 呼叫 RPC 取得該列的 `object_key`，predicate 通過才簽。`object_key` 永遠是**輸出**，不是輸入。§5 的下載流程同理。

## R3（阻擋）— 確認流程與簽名不自洽

§4 第 4 步：「`confirm_group_file_upload(p_file_id)`：端點以 `HeadObject` 讀回實際大小與 content-type，RPC 核對後才把列改為 `current`」。

但這個 RPC 的簽名**沒有任何參數可以帶入實測值**，那 RPC 要拿什麼「核對」？目前只剩兩種可能，兩者都不好：

- 端點用 service role 直接 UPDATE 該列 → 繞過了資料庫的信任邊界（而且與 R1 衝突）。
- RPC 根本無法核對，只能盲目把列改成 `current` → 「以上傳後 `HeadObject` 回報為準」（§3）這句就沒有兌現。

**建議改成：**

```sql
confirm_group_file_upload(
  p_file_id uuid,
  p_byte_size bigint,
  p_content_type text
) returns void
```

RPC 內部用 `auth.uid()` 驗上傳者、比對 `p_byte_size` 與宣告值（不一致就拒絕或記錄）、確認不超過 100 MB、再寫入實測值並轉 `current`。這樣「以 HeadObject 為準」與「授權留在 Postgres」兩件事同時成立，端點也不需要 elevated 權限。

順帶一提：`byte_size` 用 `bigint` 比 `integer` 妥當（雖然 100 MB 用 integer 也夠）。

## R4（必須明訂）— `can_access_group_files` 應該是 active-only

這點文件沒寫，但它決定了整個功能的權限語意，而且與既有的聊天 predicate **不同**。

`private.can_read_group_chat` 允許 `active`／`left`／`removed`——離開或被移除的成員仍可讀歷史訊息。但檔案的產品規則是「移除組員時保留檔案，但**被移除者不再有檔案權限**」。

所以 `can_access_group_files` **不能**沿用 `can_read_group_chat`，必須只允許 `membership_status = 'active'`。這是刻意的差異，不是疏漏，建議在 migration 註解裡寫明理由，否則日後很容易被「統一一下」而改錯。

同理要確認：**上傳、下載、替換、刪除是否共用同一個 predicate**。若共用，則「只有上傳者可刪除」必須在 RPC 內額外判斷 `uploaded_by = auth.uid()`，不能只靠 predicate。

## R5（需裁決）— 保留期 5 個月，但先前記錄是 4 個月

§7 寫 `starts_on + interval '5 months'`。但先前給我的產品規則寫的是「從學期開始日起保存**四個月**」。兩者直接衝突。

我不會替你選。但無論哪個是對的，**都必須在 `docs/team/DECISIONS.md` 記錄下來**，否則下一份文件又會出現第三個數字。若確實改成 5 個月，也請一併說明為什麼（例如覆蓋整個學期加上緩衝）。

## R6（需裁決）— 「任何成員可替換」與「只有上傳者可刪除」互相抵銷

產品規則是「群組成員可上傳、查看、下載及替換，只有上傳者可刪除」。但 §5 說替換的做法是「`DeleteObject` 舊物件再寫新物件」。

也就是說：**任何成員都可以透過「替換」把別人上傳的檔案內容刪掉**，而「只有上傳者可刪除」這條規則形同虛設。

兩種可能的意圖，需要你確認：

- 若「替換」是指**用自己的新檔案取代整個項目**（舊內容確實消失），那「只有上傳者可刪除」應該改成「只有上傳者可刪除紀錄，但任何成員可替換內容」——語意要寫清楚。
- 若「替換」只應限於**上傳者本人**，那 RPC 必須檢查 `uploaded_by`。

這是產品語意問題，不是實作細節，值得在 P1 之前定案。

## R7（記錄即可）— 配額是軟上限，且統計會漂移

§6 的配額判斷是在**簽發上傳 URL 之前**統計 `sum(byte_size) where status='current'`。併發請求會各自看到同一個總和，因此可以同時通過並超賣。因為是軟上限（8 GB 留 2 GB 餘裕），這是可接受的取捨，但要寫明「不是硬性保證」。

另一個漂移點：**資料庫統計的是資料列，bucket 實際用量還包含孤兒物件**（上傳完成但未 confirm、或 confirm 失敗）。文件說孤兒由 lazy cleanup 處理，但清理尚未授權，所以在清理上線前，R2 實際用量會高於 DB 統計。建議在配額頁或維運筆記裡標明這個差異，避免「DB 顯示 3 GB、R2 帳單顯示 6 GB」時找不到原因。

## R8（需記錄）— `starts_on` 從未由任何 migration 填入

我確認了：`academic_terms.starts_on date` 是 nullable（`20261102090000:23`），且**沒有任何 migration 寫入它**（全 repo 只有定義與 `starts_on <= ends_on` 的 check）。所以 §7 說的「`starts_on` 未填時由 term code 推導（A 學期 9 月 1 日、B 學期 1 月 10 日）」不是補救措施，而是**唯一會走的路徑**。

這代表推導規則是實質的產品規則，必須記錄在 `DECISIONS.md`。另外要接受一個後果：§7 說「建立檔案時一次寫定」，所以 `retention_expires_at` 是**快照**——日後若有人補上或修正 `starts_on`，既有檔案的到期日不會跟著改。這是可接受的設計，但要知道它是有意的。

## 其他觀察（非阻擋）

**`group_files` 的 RLS 姿態沒寫。** 建議明確採用 repo 既有模式：RLS 啟用、不給任何 policy、`REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`，唯一入口是 SECURITY DEFINER RPC。這樣即使端點出錯，也無法直接讀表。

**CORS 尚未設定**是已知的營運前置條件（文件 §8 與「已知資源」都提到）。需要允許正式前端 origin、`PUT`、`content-type`。這不是 SQL 問題，但沒設好 P2 一定失敗。

**100 MB 單次 PUT、不支援續傳**是明確接受的取捨，寫得清楚，我沒有異議。

**`content_hash` 只作稽核**（§3）是對的。只要它不被當成去重或完整性驗證的唯一依據就好。

**物件鍵可預測**（`groups/<group_id>/<file_id>`）在私有 bucket + presigned 的前提下不是問題，因為存取必須先過 predicate。但這再次強調 R2：**key 不能當成授權憑證**。

---

## 建議的 P1 前置清單

在寫 P1 migration 之前：

1. 端點改為**以使用者 JWT** 呼叫 RPC，移除 service role（R1）。
2. 簽名端點輸入只收 `file_id`，`object_key` 永遠由資料庫回傳（R2）。
3. `confirm_group_file_upload` 加入 `p_byte_size`、`p_content_type`（R3）。
4. 明訂 `can_access_group_files` 為 active-only，且刪除需另判 `uploaded_by`（R4）。
5. 裁決保留期 4 或 5 個月（R5），並記錄。
6. 裁決「替換」的權限語意（R6），並記錄。

---

## 我沒有做的事

未連線 Supabase 或 Cloudflare、未執行 SQL、未建立任何物件、未修改文件或 repo。所有關於 repo 的陳述都來自 `origin/main` `3514630` 的 checked-in SQL。**R1 的權限結論是靜態推導**（我讀了每一個 RPC 的 grant 區塊，沒有任何一個授權 `service_role`），仍應在 P2 之前用一次真實呼叫確認：以 service role 呼叫任一 RPC 應得到 permission denied。

---

## Adam's next action(s):

1. **裁決保留期是 4 個月還是 5 個月（R5，需你的決定）。** 目的：文件寫 5 個月，先前記錄是 4 個月，兩者衝突；不定案就會出現第三個數字。需要的決定：採用哪一個，並寫入 `DECISIONS.md`。可見結果：`retention_expires_at` 的計算有單一依據。解鎖：P1 migration。
2. **裁決「替換」的權限語意（R6，需你的決定）。** 目的：若任何成員都能替換，就等於任何成員都能刪掉別人上傳的內容，「只有上傳者可刪除」形同虛設。需要的決定：替換限上傳者本人，或允許全體成員但改寫規則文字。可見結果：RPC 的權限判斷有依據。
3. **要求 Kayk 修正 R1／R2／R3（阻擋項，技術性）。** 目的：R1 會讓端點直接失敗、R2 是任意覆寫漏洞、R3 是流程與簽名不一致。需要的動作：端點改用使用者 JWT、簽名只收 `file_id`、confirm RPC 加入實測大小與型別。可見結果：P1／P2 的介面定案。解鎖：實作。
4. **確認 `can_access_group_files` 為 active-only（R4，技術確認）。** 目的：與 `can_read_group_chat` 的 left/removed 不同，這是刻意差異。可見結果：被移除者確實失去檔案權限。
5. **確認 CORS 與 bucket 設定（營運前置）。** 目的：CORS 未設定時 P2 必定失敗。可見結果：上傳可通。

**Coordinator/owner next action:** 第 1、2 項有答案後，把修正版設計或 P1 draft migration 以新的 finite assignment 指定 head，我做 exact-head 審查。本任務在此停止，不輪詢、不自行重派。
