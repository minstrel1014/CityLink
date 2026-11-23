# CityLink 協調報告 — Role 6 的 PR #51 Stage 4 對抗性複審、Eunice 的 F2-M1 複驗，與本輪 Adam 決定項（2026-11-22 20:33 HKT）

本檔由 Manus（協調任務 `HeZwm7CA7Y3rDtYBounkVC`）撰寫與執行，不是人類 Adam、Roy、Eunice 或 Role 6 的寫作。它**取代**前一份 `ROLE6_SUCCESSOR_EUNICE_F2_COORDINATOR_REVIEW_20261122.md` 的「決定清單」部分；該檔舊內容保留作為歷史，不刪除。

## 一、結論先講（三句話）

1. **F2 的 client 端 blocker 已解除**：F2-M1（marker 生命週期）在 PR #50 新 head `a2d041d6…` 由 Roy 修復，我與 Eunice **各自獨立**用不同 harness 重現 `fresh→stale`、`unknown→stale`、同波共用 1 次讀取但之後會重讀；657 個測試、typecheck、static build（1760 modules）、Prettier 全部 exit 0。**但 F2 仍未完成**，因為 F2-M2 是 Adam 的决定，不是 Roy 能修的缺陷。
2. **Role 6 推翻了我自己對 guard 的信心**：他證實我先前那 5 項發現全部成立（含更精確的修正），並在我看不到的地方（因為我的執行死在第一個語法錯誤）又找到 **兩個新的阻塞缺陷 F7、F8**，與一項會直接影響操作單的 **F10**。我用自己的本機引擎把 F7、F8、F10、C6 全部重現成功。
3. **現在卡在一個形狀决定**：guard 究竟是「修好 608 行的 DO block」還是「改成 SELECT-only preflight（每軌約一頁）＋一個只負責拒絕的薄 wrapper」。Role 6 明確**改變自己立場**建議後者，理由是 DO block 全有或全無，一個語法瑕疵或一個硬 casting 就讓整台儀器失能且不留部分證據 —— 這正是 5 個缺陷能在「純文字审查」下存活的原因。

## 二、Ref 與範圍核對（本協調任務自己執行）

| 項目             | 值                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role 6 受審 head | `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`，父 `65058a80…`；分支 `feature/role6-capacity-successor-draft-20261122` 未變                                                                                                                                                                            |
| PR #51           | 我複讀：OPEN／isDraft true／MERGEABLE／CLEAN／base `5537baa4…`；`5537baa→bc6a6d5` 共 6 檔 +1842/−32，其中 `supabase/migrations/20261119090000_group_hard_max.sql` +227/−17 與 2 個 `docs/team/` 檔屬 **PR #41 繼承**；`65058a8→bc6a6d5` 才是 successor 自己的 3 檔 +1090/−0，且 `-- supabase` 為 0 |
| 受審 SQL blob    | `a04048e90d6b64c692f03c722b9eea2849058aab`／SHA-256 `5cf0a66a…4887`（我與 Role 6 各自在 head 重算，一致）                                                                                                                                                                                          |
| Roy 修復 head    | `a2d041d6a038d3962d98d0280e9e36049d37e33f`（父 `951bb890…`）；修復 delta 僅 2 檔 +157/−15；`package.json`／`pnpm-lock.yaml`／`supabase/`／`server/`／`vite.config.ts`／`supabaseGroups.ts` 零變動；PR #50 OPEN／draft／MERGEABLE／CLEAN，base `344c1058…`，累積 6 檔 +794/−11                      |
| 其他 ref         | `main` `1a583e30…`、integration `344c1058…`、PR #41 `65058a8…`、證據分支 `d75236e0…`（本輪會再前進一次）皆未被人類動過                                                                                                                                                                             |

## 三、Role 6 對我那 5 項發現的判定（他逐項 confirm 並加修正）

| 我的發現                    | 判定                        | 他的關鍵修正（我已重現）                                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 guard 無法 parse        | CONFIRMED                   | 全檔只有 **1 處** raise 語法違規：`:604` 用 `\|\|` 串接字串當 RAISE format；另外 4 個 `raise exception` 的 `\|\|` 都在 `USING detail/hint` 內，那是合法的。因為 PL/pgSQL 先 parse 整個 block，這一處讓 G1 的 Main 拒絕與其他全部檢查一起失效                                       |
| S-2 `to_regfunction` 不存在 | CONFIRMED（並移除版本疑慮） | 它**從來不是** PostgreSQL 的識別字（PG16 列表有 `to_regprocedure`、`to_regproc` 等，無 `to_regfunction`）；正確替換是 `to_regprocedure(text)`，且 19 個呼叫點全部帶括號簽名所以替換安全 —— 但「不帶括號會靜音讀成 object missing」必須寫進檔案，不能靠慣例                         |
| S-3 `proallargnames` 不存在 | CONFIRMED                   | 用 `proargnames`+`proargmodes` 正確；全 IN 函式的 `proargmodes` 為 NULL，所以「NULL 即 mismatch」必須保留（guard 已用 `coalesce(...,'<unreadable>')` 做到）                                                                                                                        |
| S-4 `pg_default_acl.roleid` | CONFIRMED                   | 正確欄位是 `defaclrole`（`:568`）。另提醒：同列若漏了 `::text` 會撞到 `text \|\| "char"` operator is not unique（42725）——他自己在探測時踩到，屬他的探測瑕疵不是工件瑕疵                                                                                                           |
| S-5 44 處累加器全部失敗     | CONFIRMED（範圍修正）       | 我先前說「只有 array_append 可用」太窄：`v \|\| array['…']` 也可用；失败的是 `text[] \|\| <unknown literal>` 解析成 array_cat 再被當陣字面量。他仍建議統一 `array_append`（單一用途、可跨多行、不會被重新選成 array_cat）。第一條累加是 `:163`（v_note），`:171` 才是第一條 v_fail |

他也補了兩項次要：`:114` 的 `v_sig regprocedure` 完全未使用（但刪它會移位所有行錨點，建議與其他修復同一次提交），以及標頭 `:45` 宣稱「無 select-into-table」技術上正確但易誤導 —— 檔內有 13 處 row-into-variable 的 `SELECT … INTO v_*`，他建議改措辭。這兩點我重數後全部與他一致（含 13 條行號）。

## 四、他新增的兩個阻塞缺陷 + 操作單發現（我已用自己的引擎重現）

- **F7（阻塞）**：G3 的 `search_path` 判斷寫成 `v_config <> 'search_path='`，但引擎把 `set search_path to ''` 渲染成 `search_path=""`。因此**每一次正確的 Test preflight 都會被回報成 mismatch**。我的重現：正確 pin 的函式 → `guard_rule_says_mismatch=YES(false positive)`，而他驗證過的 split_part 版本 → `passes`。這不只是小錯：它會訓練操作者不信 guard，甚至誘使有人去「修 helper」而破壞「不得重定義 helper」的規則。
- **F8（阻塞）**：5 處 `'public.xxx'::regclass` 硬 casting（`:187 :324 :360 :501 :512`），其中 3 處藏在 `to_regclass(...) is not null and …` 之後假設短路求值。PostgreSQL 不保證短路；我的重現在空庫直接 `ERROR: relation "public.courses" does not exist`，而 `:512` 的約束計數完全沒被保護 → 若目標沒有 `public.study_groups`，block 會中止而不是回報。改成 `to_regclass` 比較後才回 0 列並走累卡路徑（也重現）。
- **F9**：G4 未 pin 前，成功路徑 `:604` 那条 notice **從未執行過**，必須標為未測代碼，不能默信。
- **F10（影響操作單）**：受審 blob 自帶 `begin;`（`:39`）與 `commit;`（`:1756`）。我用 `psql --single-transaction` 重現：兩個 WARNING 都出現，而且 `tables_surviving=f10_a,f10_b` —— 檔案內部的 `commit;` 提前結束外層交易，後面的語句在 autocommit 下執行。所以「用 `--single-transaction` 把 guard 與 DDL 綁成原子單位」在機制上**不成立**；blob 只有照原樣跑才有它自己的原子性（他的 `begin;…rollback;` 探測確認內部回滚有效）。
- **F11（資訊性）**：G3 對 `service_role` 呼叫 `has_function_privilege`，但角色存在性檢查只列 `anon`/`authenticated`；他預期會 abort，實際回 NULL 並正常累加 → 不主張缺陷，只把不對稱記錄下來。
- 他同時**更正自己先前的措辭**：上輪 handoff 把「G1 會拒絕 Main」「一次回報所有 mismatch」講得像已運作行為，實際上檔案當時根本無法 parse。這是負責任的自我更正，我也以同樣標準修正了 S-5 的「只有 array_append」說法。

## 五、三個立場（Role 6 正式表態，我需要 Adam 裁決）

1. **G4 能否不靠 live dry run 誠實 pin 住？不能。** 摘要定義在 live catalog 渲染出的函式本體上，用倉庫文字算出來的是不同 scope（他的候選 `9206e208…`/`1158da30…` vs canonical `5991901a…`/`5e88d56b…`）。他提出 pin 記錄的**最低內容量**（不是只寫兩個 hash）：`version()`＋`lc_collator`／`lc_ctype`／`server_encoding`／session `search_path`；normalization 表達式原碼＋輸入來源明確為 `pg_get_functiondef(oid)`（不是倉庫語句文字）；兩個 digest 加上 normalised 輸入的字元長度；target ref、db 名、時間戳、`session_user`；以及 `proconfig` 渲染成 `search_path=""` 的觀察（同一次 run 把 F7 也記錄下來）；並明文聲明 digest 是由同一次 run 中 item 2 的表達式產出。**改进**：guard 自己的表達式在真實引擎可編譯並產出 64 hex，所以正解是讓 guard 用「自己公布的表達式」算 observed，只 pin 在 Test 上用同一表達式算出的 expected，徹底消除「兩個 scope 一個數字」這類錯誤。
2. **兩步驟 vs 單一原子 successor → 保留兩步驟。** 理由（依代價排序）：原子化等於把 1,756 行受審 DDL 複製成新檔，等於同一段 DDL 出現第二個權威，會讓既有 exact-head review（含 Adam 已結的那一份）作廢，需要兩檔 byte 級對照＋新的 Role 6 review＋依 Adam packet 新的 Eunice 證據 pass；而且好處是幻覺 —— blob 本身已是一個交易，F10 顯示外面再包 `--single-transaction` 反而破壞原子性；他的 F1–F8 修復全部是區域性機械替换（73 处 ＋1 個判斷式），完全不必碰 blob。兩步驟的殘留風險是程序性且有界：guard 唯讀、只取 catalog `ACCESS SHARE`、同一個授權 session 內連續執行並記錄兩個時間戳、checklist 禁止中間手動變更。
3. **PL/pgSQL guard 是否正確工具？不是。** 建議把前置斷言改成 **SELECT-only checklist**（每軌一頁、每條檢查一行 `check_id/subject/expected/observed/verdict`），只保留一個薄 DO wrapper 負責「有 MISMATCH 就 raise」以維持不可跳過。理由正是 F1–F8：DO block 全有或全無，一條語法瑕疵或一個硬 cast 就摧毀整台儀器且**不會留下部分證據**；而需要程序性行為的三處（OUT/TABLE 名稱擷取、`proconfig` 解析、ACL 擷取）都能乾淨地用 `unnest`/`split_part`/`has_function_privilege` 寫成 SELECT，他已在本機驗證可行。608 行的版本集中了 73 個缺陷且無法解析，不是「記錄用儀器」該有的形狀。建議 PR #51 保留設計文件與 checklist，把 guard 檔替換成 SELECT-only preflight，之後再做一次 fresh exact-head review；DO-block 版本只在不具權威性的便利工具位置保留，且**必須先通過真實 parser 門檻**。

## 六、Eunice 的 F2-M1 複驗（独立接受為證據）

她在 `a2d041d6…` 用自己的 esbuild 0.25.10 bundle 與自己的 `/tmp` harness，得到與我逐字一致的結果：fresh→stale／2 reads、unknown→stale／2 reads、同波 1 讀取＋之後重讀、明確選項不去重、永不 settle 時兩者皆 PENDING／1 讀取。她也逐檔核對來源錨點（`appBuildMarker.ts:151`、`:163-177`、`:190-198`；測試 `:154-175`、`:177-191`、`:193-218`、`:220-239`、`:241-260`、`:262-276`、`:278-312`），確認 `supabaseGroups.capacity.test.ts:19-25` 仍整包 mock marker 模組，因此該檔**不可能**證明服務層生命週期；並把 `GroupWorkflows.tsx:408-423`／`:445-448` 的 `actionBusy` 閂鎖與 F2-M2 對齊成具體證據。她的界線聲明和我一致：不得擴充成 hosting edge／CDN／瀏覽器快取、live Auth/RLS/併發或「F2 完成」的宣稱。她也誠實記錄自己前兩次 harness 呼叫失敗（`.mjs.bundle` 副檔名被 Node 拒絕；第二次誤把 bundle 當 harness），只有第三次才算數。

## 七、界線與誠實聲明

本輪**零資料庫連線**：沒有 Supabase connector 呼叫、沒有對 Test `wkzclgmhrtecnpexfesr` 或 Main `pijslbchvstkoweslymr` 的任何存取、沒有 SQL 套用到任何托管目標、沒有讀取或輸出憑證、沒有 `.env`。本機 PostgreSQL 16.15 只在 unix socket 下操作（`TCP_LISTENERS=0`），用完 `-m fast` 停止並刪除資料與 socket 目錄，殘留程序 0。無 edit（應用碼）、無 commit 到任何 owner 分支、無 merge、無 ready 轉換、無部署、無發布、無 repo 可見度或權限變更。靜態／本機引擎證據不等於 live 驗證；沉默不是批准。

歸屬：Role 6 與 Roy 的沙箱全域 gitconfig 都以 Adam 的 GitHub 帳號為預設身分，因此 `a2d041d`、`bc6a6d5` 上的提交作者顯示 `minstrel1014`（commit 內文含 `Co-authored-by: Manus <dev-agent@manus.ai>`）；這是所有 owner 任務沙箱的共通預設，不是人類撰寫的證據。協調任務本輪起的提交顯式使用 Manus 身分。

## Adam's next action(s):

依依賴順序，前兩項是阻塞項：

1. **裁決儀器形狀（blocking）**：(a) 依 F1–F8 修復 608 行 DO-block guard 並先過真實 parser 門檻，或 (b) 依 Role 6 建議改為 SELECT-only preflight（每軌一頁）＋薄拒絕 wrapper。目標產物：PR #51 的下一個 commit 是「修復」還是「重塑」；這决定我能否派下一個 Role 6 assignment。未核准前我不派任何實作工作。
2. **核准把「真實 parser 門檻」寫進 Stage 4 驗收措辭**：建議文字「任何意作為記錄用儀器的 SQL，在被接受前必須先在免數據的一次性本機 PostgreSQL 實際執行過」。預期中間產物：`docs/team/DECISIONS.md` 新增一筆決策紀錄（我可以在核准後才寫入）。解鎖：重做後的 successor 材料能被接受。
3. **確認 F10 操作單禁令**：批准或修正「受審 blob 照原樣、不包 `--single-transaction`、不加外層 `BEGIN`，在 preflight 之後於同一授權 session 執行，並記錄兩個時間戳」。解鎖：可信的 Test 套用計畫（目前 checklist 暗示的機械原子性是錯的）。
4. **核准一次唯讀 Test dry run（SELECT-only，無寫入、不碰 application rows），其唯一產出是 §8.1 规格的 G4 pinning 記錄**，目標 `wkzclgmhrtecnpexfesr`，同一次 run 一併確認 Test 引擎大版本與 `proconfig` 渲染。解鎖：G4 可 pin、guard/preflight 不再自我阻塞。請與第 1、2 項一起裁決（彼此重疊）。
5. **F2-M2 一句話決定**：授權「有界等待／abort 後回 `unknown`、不 retry」，或明確接受「永不 settle 即卡住該分頁後續建立群組動作」的 fail-closed 殘留。仍未授權自動 reload、自動 retry、web storage 草稿保存、default/unlimited fallback 或快取時間推測。
6. **兩項延續性確認（先前已 queued）**：確認 Main 在 Track B／C 完成前排除於 capacity 計畫（Role 6 現在有 parser 級證據支持）；以及剩下兩段 client 字串（D5a／D5b）批准或明確延後 —— 本審查未動任何新字串。
7. **資訊性，無需行動**：PR #50 修復已被三方獨立確認、PR #51 的 guard 已被證明不可執行且找到兩個新阻塞缺陷；以及上述提交歸屬揭露。Role 6 的人類姓名若尚未提供，我繼續以 TBD 記錄。

### Coordinator/owner next action（agent 工作，不需要 Adam 決定）

- Role 6 的報告與 raw 引擎證據、Eunice 的複驗 handoff 已歸檔進證據分支；我的本機重現結果見 `ROLE6_P51_CLAIMS_COORDINATOR_LOCAL_REPROBE_20261122.md`。
- 等 Adam 裁決第 1 項後才派下一個 Role 6 assignment（重塑或修復）；Eunice 已結束本轮 assignment，不輪詢、不自動續派。
- successor／client-pair 聯合 review、有條件的 Test preflight、點名確切 SQL head 與 Test target 的新明確核准、forward-only 套用＋catalog 驗證、Eunice signed-in 多帳號／併發 QA、7 天證據窗口、cleanup 決定 —— 門檻維持不變；hosting-edge 快取證據仍不可用，不會以「接受 repo 證據」取代。
