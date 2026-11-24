# Role 6 審查：P1 migration 草案（2026-11-24）

> 本檔為 Role 6 回覆的原文存檔，僅加入本段前言。原文由 Adam 於 2026-11-24 轉交。
> 對照基準：`origin/main` `3514630`。性質：唯讀靜態審查。

---

# Role 6 審查：`KAYK_FILE_AI_MIGRATION_PROPOSAL.sql`（P1 migration 草案）

**收到：** 2026-11-24 11:01，附件 `KAYK_FILE_AI_MIGRATION_PROPOSAL.sql`（511 行，檔頭標記「草案，尚未套用」）。
**對照基準：** canonical repo `minstrel1014/CityLink` `origin/main` `3514630`。
**性質：** 唯讀靜態審查。未連線任何資料庫或 R2、未執行 SQL、未套用 migration、未修改任何檔案。

---

## 總體判斷

**這是一份品質很好的草案。** 我上一輪對設計文件提出的四個阻擋項，這份 SQL 全部吸收了：

| 設計審查的阻擋項 | 這份草案的處理 |
|---|---|
| R1 不要用 service role | §4 明確只 grant 給 `authenticated`，並註明「不給 service_role」✓ |
| R2 presigned 只能由 `file_id` 推導 | RPC 只回 `object_key` 給簽名端點，不回 URL；`object_key` 從資料庫產生，不接受用戶端輸入 ✓ |
| R3 confirm 需要實測值 | `confirm_group_file_upload(p_file_id, p_byte_size, p_detected_mime)` ✓ |
| R4 predicate 必須 active-only | `can_access_group_files` 只走 `is_active_group_member`，並用註解寫明「此差異是刻意的，不可統一」✓ |

R6 也照建議落地了：替換限現行版本上傳者、刪除允許上傳者或 leader。R5 在檔頭記錄為「日曆月 5 個月保留」——若那是你確認過的，R5 就關閉了（但仍應進 `DECISIONS.md`）。

**沒有阻擋級缺陷。** 有 3 個建議在套用前修的小項，以及幾個非阻擋觀察。

---

## 一、回答草案自己標記的「必查點」：leader 判定是正確的

草案 451–453 行寫：

> R6：上傳者本人或群組 leader 可以刪除。leader 的判定需與 Stage 5 的 authority/succession 模型核對（若 leadership 可轉移，此處應改用對應 helper，而非 creator_id）。此為 Role 6 審查時的必查點。

**答案是：`g.creator_id = v_actor` 正確，不需要改。** 依據是 succession 函式本身會改寫 `creator_id`：

- `20261114163512:118` — `set creator_id = v_successor_id`（領導者離開時把 `creator_id` 交給繼任者）
- 同檔 63、90 行 — 沒有繼任者時 `set creator_id = null`

也就是說，`study_groups.creator_id` 這個欄位名雖然叫 creator，**在現行模型裡它就是「現任 leader 指標」**，由 `group_memberships` 上的 trigger 維護。這與專案指示記載的「current leader `study_groups.creator_id`」一致。

兩個附帶性質都是 fail-closed，很好：

- `creator_id` 可以是 NULL（無繼任者），此時 `= v_actor` 為 false，沒有人被當成 leader。
- leader 判定在 `can_access_group_files` 之後，所以「已離開的 leader」也不能刪除。

**建議：** 把這個結論寫進 migration 的註解（引用 `20261114163512:118`），否則下一個人會再問一次同樣的問題，甚至「順手」改成一個不存在的 helper。

## 二、term code 格式：regex 與 seed 相符，但有一個營運前提

草案假設 term code 是 `YYYY-Fall`。我確認了：`20261102090000:65, 87` 的 seed 用的就是 `'2026-Fall'`，與 `^[0-9]{4}-Fall$` 相符。所以 **Fall 學期不會出錯**。

但有兩個要寫進文件的點：

1. `academic_terms.code` 的 schema 只限制長度 1–80（`20261102090000:22`），**不限制格式**。任何非 Fall/Spring 的 code（例如未來的 `2027-Summer`）都會讓該學期的**所有檔案上傳**以 `group_files_term_code_unrecognised` 失敗。
2. 這是刻意的 fail-closed（「無法辨識的格式一律拋錯，不猜測日期」），我同意這個選擇。但它意味著**新增學期命名時必須同步改這個函式**，否則功能會靜默地對整個學期不可用。建議在 `DECISIONS.md` 或學期建立的文件裡寫明這條依賴。

另外確認：`starts_on` 至今沒有任何 migration 填入，所以實務上**所有** term 都會走 `derived` 分支。這不是備援路徑，是唯一路徑。

## 三、建議在套用前修的三項

### A-1 使用者可控的文字欄位沒有長度限制

`declared_mime`、`detected_mime`、`content_hash` 都是 `text` 且無 `check`。`declared_mime` 由用戶端提供，`content_hash` 也是。一個已登入使用者可以送進任意長度的字串，佔用儲存、撐大列表回應。

建議加：

```sql
check (declared_mime is null or char_length(declared_mime) <= 255),
check (detected_mime is null or char_length(detected_mime) <= 255),
check (content_hash is null or char_length(content_hash) <= 128)
```

一行一個，成本近乎零。`original_name` 已經有 1–255 的檢查，這三個是漏掉的同類。

### A-2 `detected_mime` 與 `declared_mime` 不一致時靜默接受

288–291 行把 `detected_mime = coalesce(p_detected_mime, declared_mime)` 直接寫入，**沒有比對**。既然已決定不做掃描，這個不一致就是唯一能察覺「內容與宣告不符」的訊號，卻被無聲吞掉。

兩個選項，我建議第二個：

1. 不一致就拒絕（`group_files_mime_mismatch`）——嚴格，但正常瀏覽器在綁定 `Content-Type` 的前提下不該發生。
2. 寫入 `detected_mime` 但同時記一個 `mime_mismatch boolean`，讓列表與稽核看得到。

因為下載端有 `Content-Disposition: attachment` + `nosniff`，不一致的實際危害有限，所以我把它列為「建議」而非阻擋。但至少不要靜默。

### A-3 缺交易包裹

整份檔案沒有 `begin;`／`commit;`。repo 其他 migration（DM 那支）有。若有人逐句貼進 psql，中途失敗會留下「有表、沒有 RPC」的半套狀態——而三個表都已 `revoke all`，那個狀態下功能完全不可用且難以察覺。

建議在最前與最後各加一行。`create table if not exists` 與 `create or replace function` 讓這份檔案本身是冪等的，加交易包裹就完整了。

---

## 四、非阻擋觀察

**B-1 待確認的列不佔配額，但有上限。** `group_files_bytes` 只算 `status='current'`，所以 pending 列不計入。搭配「每群組每使用者最多 5 個 pending」的檢查（222–230 行），單一使用者單一群組最多可在配額外暫存 5 × 100 MB。因為還受「每課程每學期一個群組」限制，總量有界，可接受；但要曉得配額不是即時精確的。

**B-2 過期列不佔 DB 配額，但仍佔 R2 空間。** `group_files_bytes` 有 `retention_expires_at > now()`，所以過期列一到期就從 DB 統計消失，但 R2 物件要等清理排程才刪。這與設計文件 §6 的說明一致，只是提醒：**DB 顯示的用量會系統性低於 R2 帳單**，清理上線前尤其明顯。

**B-3 `list_group_files` 沒有 LIMIT 或分頁。** 每群組 1 GiB 上限搭配 100 MB 單檔，理論上最多十幾個大檔；但小檔可以很多。建議加一個上限（例如 200）或游標分頁，避免單次回應過大。

**B-4 同一個檔案可以被兩個 pending 替換同時指向。** `confirm_group_file_upload` 用 `deleted_at is null` 篩選舊檔，所以第二個替換確認時 `found` 為 false、回傳 NULL，不會崩；但結果是同一個「位置」出現兩個 current 檔案。建議加唯一部分索引：

```sql
create unique index ... on public.group_files (replaces_file_id)
  where replaces_file_id is not null and status = 'pending';
```

**B-5 `group_analysis_jobs` 沒有 `group_id` 的索引。** 目前沒有 RPC 用它，P4 再補即可，但屆時若要按群組列出任務會全表掃描。

**B-6 群組刪除會 cascade 掉資料列，但不會刪 R2 物件。** `group_id ... on delete cascade` 讓列消失，R2 上的 `groups/<group_id>/...` 會全部變成孤兒。這不是本草案的錯（清理排程本來就未授權），但值得在設計文件裡列為已知債。

**B-7 `replace_group_file` 的配額檢查把舊檔也計入。** 428–434 行用的是 `group_files_bytes(...) + p_byte_size`，而舊檔要到 confirm 才釋放。所以「替換」在接近上限時會被拒絕，即使淨變化為零。保守方向正確，只是要知道這個行為。

**B-8 `confirm_group_file_upload` 沒有重驗 retention 視窗。** 一個在上限內建立的 pending 列，可以在到期後才被確認，結果是一列 `current` 但 `retention_expires_at < now()`——被列表與配額過濾掉，等於死列。無害，但可以在 confirm 時補一個 `if v_row.retention_expires_at <= now() then raise ...` 讓行為更乾淨。

**B-9 RPC 會把 `object_key` 回給 `authenticated`。** 這在設計上必要（端點要用），但意味著瀏覽器也拿得到 key。key 本身不是憑證（bucket 私有），所以不是漏洞；**但簽名端點仍必須以 `file_id` 重新推導 key，絕不接受前端傳來的 key**，否則就回到上一輪 R2 的問題。建議在端點實作說明裡把這句寫死。

---

## 五、我確認過沒問題的部分

- 三個表都 `enable row level security` + `revoke all` + 不建 policy ✓ 與 repo 既有模式一致，即使端點出錯也讀不到表。
- `can_access_group_files` 的 fail-closed 完整：`p_group_id` 為 NULL、`auth.uid()` 為 NULL、群組 `abandoned`、非 active 成員，四種情況都回 false ✓。
- `confirm_group_file_upload` 的權限順序正確：先 `for update` 鎖列、再驗上傳者、再驗 pending、再驗 predicate、再驗大小 ✓。
- 大小比對用嚴格相等（284–286 行）是對的——它同時防住「宣告 1 byte 卻上傳 100 MB」與「宣告 100 MB 卻上傳 1 byte」，而且讓資料庫存的值必然等於實測值。
- `replace_group_file` 用「先建 pending、確認後才標記舊檔刪除」的順序，上傳失敗不會造成資料遺失 ✓ 與設計文件一致。
- `object_key` 由 `gen_random_uuid()` 產生、不含使用者檔名 ✓。
- 保留期計算 `((v_start + interval '5 months')::date + time '23:59:59') at time zone 'Asia/Hong_Kong'` 語意正確：先算日曆月、取當日、補到 23:59:59，再以香港時區解讀 ✓。
- 六個 RPC 的 `revoke` / `grant` 成對、簽名與定義相符 ✓。

---

## 六、套用前的 preflight 與實測建議

**Preflight（唯讀）：**

1. 三個表名、六個函式名在目標庫是否已存在（本草案用 `create table if not exists`，若已存在但形狀不同會靜默跳過）。
2. `academic_terms` 的實際 code 值清單——確認每個在用學期都符合 `^[0-9]{4}-(Fall|Spring)$`，否則該學期的上傳會全部失敗。
3. `study_groups.term_id` 是否 NOT NULL（若是 NULL，`group_file_retention_expiry` 會拋 `group_files_term_missing`）。

**套用後實測（PL/pgSQL 的錯誤常延到第一次執行才出現）：**

1. 正常上傳 → confirm → 出現在列表。
2. 宣告大小與實測不符 → `group_files_size_mismatch`。
3. 非成員／已離開成員 → `group_files_no_permission`（這是本次最重要的產品規則）。
4. 群組 `abandoned` → 拒絕。
5. 達每群組上限 → `group_files_group_limit_reached`。
6. 替換：新檔確認後舊檔從列表消失，且回傳舊 `object_key` 供端點刪除。
7. leader 刪除非自己上傳的檔案 → 允許；非 leader 非上傳者 → 拒絕。

---

## 我沒有做的事

未連線任何資料庫或 R2、未執行 SQL、未建立任何物件、未修改草案或 repo。所有關於 repo 的陳述都來自 `origin/main` `3514630` 的 checked-in SQL；本文件沒有 runtime 驗證。

---

## Adam's next action(s):

1. **確認保留期 5 個月已定案並記入 `DECISIONS.md`（R5 收尾）。** 目的：草案檔頭已把「日曆月 5 個月」寫成已套用的決定，但先前記錄是 4 個月。需要的動作：若確實是 5 個月，記一筆；若不是，退回修改。可見結果：保留期只有一個數字。解鎖：套用授權。
2. **請 Kayk 補 A-1（三個文字欄位的長度檢查）、A-2（MIME 不一致不要靜默）、A-3（交易包裹）。** 目的：A-1 是使用者可控的無界文字欄位、A-3 避免半套套用。需要的動作：同檔修訂。可見結果：草案可套用。解鎖：preflight。
3. **確認目標庫的在用學期 code 全部符合 `YYYY-Fall`／`YYYY-Spring`（preflight 項）。** 目的：不符合的學期會讓該學期所有上傳失敗。可見結果：retention 推導在每個在用學期都成立。
4. **確認 leader 判定的結論已寫進註解（我的第一節）。** 目的：`creator_id` 就是現任 leader 指標，這點不定下來，下一個人會再問一次或改錯。
5. **安排套用後的七項實測（需要你指定執行者）。** 目的：第 3 項（被移除成員立即失去權限）是本次最重要的產品規則，靜態無法證明。

**Coordinator/owner next action:** 若 Kayk 只補 A-1／A-2／A-3 這三項（不觸碰 RPC 邏輯與 predicate），我不要求再審；若 predicate、RPC 簽名或表結構有任何改動，請以新的 finite assignment 指定 head，我再審一次。本任務在此停止，不輪詢、不自行重派。
