# Role 6 複查：P1 migration 修訂版與 SQL 契約測試（2026-11-24）

> 本檔為 Role 6 回覆的原文存檔，僅加入本段前言。原文由 Adam 於 2026-11-24 轉交。
> 對照基準：`origin/main` `3514630`。性質：唯讀靜態審查。

---

# Role 6 複查：Kayk P1 migration 修訂版 + SQL 契約測試

**收到：** 2026-11-24 11:08，附件 `KAYK_FILE_AI_MIGRATION_PROPOSAL.sql`（529 行，較前版 511 行）與 `stage6GroupFilesSqlContract.test.ts`（176 行）。
**對照基準：** canonical repo `minstrel1014/CityLink` `origin/main` `3514630`。
**性質：** 唯讀靜態審查。未連線任何資料庫或 R2、未執行 SQL、未套用 migration、未修改任何檔案。

---

## 一、修訂版 SQL：三項建議全部正確落地，且沒有夾帶改動

我逐項核對，並確認沒有順手改到不該改的地方。

| 項目                                | 狀態                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A-1** 文字欄位長度限制            | ✓ `declared_mime` ≤ 255、`detected_mime` ≤ 255、`content_hash` ≤ 128（第 27、28、30 行）          |
| **A-2** MIME 不一致不再靜默         | ✓ 新增 `mime_mismatch boolean not null default false`（31 行），並在 confirm 時計算（301–305 行） |
| **A-3** 交易包裹                    | ✓ `begin;`（16 行）、`commit;`（529 行）                                                          |
| **B-4** 同檔不可有兩個 pending 替換 | ✓ 也順手加了 `group_files_one_pending_replacement_idx`（52 行）                                   |

**確認沒有回歸：**

- `private.can_access_group_files` 的本體一字未改（仍是 `p_group_id is not null` + `auth.uid() is not null` + `status <> 'abandoned'` + `is_active_group_member`）。
- 六個 RPC 的定義簽名與 REVOKE／GRANT 簽名**逐一相符**：`(uuid, text, text, bigint)`、`(uuid, bigint, text)`、`(uuid)`、`(uuid)`、`(uuid, text, text, bigint)`、`(uuid)`。這點很重要——簽名不一致會讓整份交易回滾，是這個 repo 最常見的失敗模式，這次沒有。
- 三個表的 RLS、`revoke all`、無 policy 全部維持。

**`mime_mismatch` 的實作比要求的更細。** 它用 `lower(btrim(...))` 比較，所以 `Text/Plain` 與 `text/plain ` 不會被誤判為不一致——這是我原本沒要求、但正確的處理。而且它選擇「記錄」而非「拒絕」，符合我建議的選項 2。

**一個小殘留：** `p_detected_mime` 為 NULL 時（端點無法判定），`mime_mismatch` 會是 `false`。也就是「未知」被記成「沒有不一致」，方向偏樂觀。若之後要嚴謹，可改成三態（`mime_mismatch boolean` 加 `detected_mime is null` 一起解讀），或直接拒絕沒有 detected 值的確認。非阻擋。

## 二、測試檔：好的靜態護欄，但有一個實質缺口

這份測試的定位寫得很誠實——檔頭就說「They cannot prove runtime behaviour」，只證明安全姿態。這一點值得肯定，因為大多數契約測試會讓人誤以為已經驗證了行為。

我逐條看過，覆蓋面合理：函式數量（9＝6 public + 3 private）、每個函式都 `security definer` + `search_path to ''`、沒有任何 grant 指向 `service_role`／`anon`／`public`、每個 public RPC 都 grant 給 authenticated、每個 private helper 都 revoke、三張表都 RLS 且無 policy、predicate 用 `is_active_group_member` 且不出現 `can_read_group_chat`、三個上限數字、錯誤 token 白名單、`creator_id` 作為 leader、交易包裹與文字長度、唯一部分索引、無破壞性語句。

**缺口：沒有驗證「REVOKE／GRANT 的簽名是否等於函式定義的簽名」。**

這是這個 repo 最常出錯、後果最嚴重的一類問題——簽名寫錯會讓 `revoke`／`grant` 找不到函式而整份交易回滾。而現有測試用的是 `grant execute on function public\.<name>\(` 這種前綴比對，**任何參數列都會通過**。所以即使 Kayk 把 `(uuid, bigint, text)` 寫成 `(uuid, text, bigint)`，測試照樣全綠。

建議補一個測試：從函式定義抓出參數型別序列，再對每個函式斷言存在**完全相同參數列**的 `revoke all on function <schema>.<name>(<同一串>)` 與 `grant execute on function <schema>.<name>(<同一串>)`。這正是把人工審查的那一眼自動化。

**其他較小的缺口：**

- 第 7 個測試只檢查 `104857600`／`8589934592`／`1073741824` 三個數字**出現在檔案某處**，沒有綁定到具體的 `check` 或判斷式。有人把上限寫在註解裡也會通過（雖然註解已被剝除，但寫在別的函式裡也會通過）。
- 第 6 個測試檢查 predicate 字串存在，但沒有斷言「所有六個 RPC 都只透過這個 predicate 授權」。未來新增一個走別條路的 RPC 不會被發現。
- 第 12 個測試擋 `drop table`／`truncate`／`delete from`，但沒擋 `drop function`、`alter table ... drop column`。
- 沒有斷言 `can_access_group_files` 含 `auth.uid() is not null`（fail-closed 的關鍵一半）。

**最重要的一點：這套測試不會發現 SQL 無法解析。** 一個 PL/pgSQL 函式體裡的語法錯誤、欄位名打錯、或 `returns table` 與 `return query` 欄數不符，**全部都會通過這 12 個測試**——因為它們只讀文字，不執行。這正是 PR #60 的 B1 那類「DDL 全綠、上線才炸」的失敗模式。

因此建議加一個真正執行的測試（協調任務已有可用的拋棄式 PostgreSQL 17）：把這份 SQL 套用到「repository schema state」的資料庫，斷言 exit 0，再跑一次斷言仍 exit 0（冪等）。這一個測試的價值高於其餘十二個的總和。

## 三、測試檔的一個維護細節

測試從 `../docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` 讀檔。草案目前放 `docs/`，正確（不會被 migration runner 套用）。但當它移進 `supabase/migrations/` 時，這個路徑必須同步更新，否則測試會以「找不到檔案」失敗。這是好事（會強迫更新），但值得在檔頭寫一句，避免有人以為是測試壞了而直接刪掉它。

另外 `expect(blocks.length).toBe(9)` 會在 P4／P5 新增函式時失敗。這是刻意的（強迫重新審查），但同樣值得註明。

---

## 四、結論

**修訂版 SQL 我沒有新的阻擋項。** 三項建議正確落地、唯一索引也補了、predicate 與六個簽名都沒有回歸。

**測試檔是有價值的護欄，但目前擋不住最常見的那類錯誤**（簽名不符、無法解析）。補上「簽名精確比對」與「真的套用一次」這兩項之後，它才足以支撐「可以進入 preflight」這句話；在那之前，它證明的是姿態而非正確性。

我上一輪的 preflight 與七項實測建議不變，仍然需要。

---

## 我沒有做的事

未連線任何資料庫或 R2、未執行 SQL 或測試、未建立任何物件、未修改任何檔案。所有關於 repo 的陳述都來自 `origin/main` `3514630` 的 checked-in SQL；本文件沒有 runtime 驗證。

---

## Adam's next action(s):

1. **請 Kayk 補兩個測試（非阻擋，但決定測試能否支撐 preflight）。** 目的：現有測試擋不住簽名不符與無法解析這兩類最常見的失敗。需要的動作：加「REVOKE／GRANT 簽名必須與函式定義完全相同」的斷言，以及「把 SQL 套用到拋棄式 PostgreSQL 17 應 exit 0」的執行測試。可見結果：測試從證明姿態變成證明正確性。解鎖：可以說「已驗證可套用」。
2. **確認保留期 5 個月已記入 `DECISIONS.md`（前次 R5 仍未關閉）。** 目的：草案檔頭寫 5 個月，先前記錄是 4 個月。需要的動作：記一筆或退回修改。可見結果：保留期只有一個數字。解鎖：套用授權。
3. **確認在用學期 code 全部符合 `YYYY-Fall`／`YYYY-Spring`（preflight 項）。** 目的：不符合的學期會讓該學期所有上傳失敗。
4. **安排套用後的七項實測（需要你指定執行者）。** 目的：其中「被移除成員立即失去權限」是本次最重要的產品規則，靜態與契約測試都無法證明。

**Coordinator/owner next action:** 若 Kayk 只補這兩個測試與檔頭註解（不觸碰 SQL 本體），我不要求再審 SQL；但若 SQL 本體有任何改動，請以新的 finite assignment 指定 head，我重新核對簽名與 predicate。本任務在此停止，不輪詢、不自行重派。
