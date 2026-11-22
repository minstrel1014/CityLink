# Role 6 successor package（PR #51）與 Eunice F2 獨立審查 — 協調任務核對報告

日期：2026-11-22 20:08 HKT。角色：協調任務（Project／Integration／Release 協調）。人類負責人為 Adam；本檔作者為 Manus，不代表任何人類撰寫。

## 1. 本節要記錄的兩件事

這輪同時收到兩份 finite handoff，兩者都改變目前狀態，但都沒有一個解鎖任何發布閘門：

1. Role 6 交付 forward-only successor capacity package（draft PR #51）。
2. Eunice 完成 PR #50 的獨立 exact-head 審查，確認 F2-M1，並新增 F2-M2。

## 2. PR #51 精確狀態（協調任務獨立核對）

| 項目               | 值                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 分支               | `feature/role6-capacity-successor-draft-20261122`                                                                         |
| Head               | `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`（local=remote）                                                                |
| 唯一父提交         | `65058a8077ad89f5796151e7eeb539ba7b616d0c`（PR #41 docs head）                                                            |
| PR                 | #51，OPEN／draft／MERGEABLE／CLEAN，base `feature/group-capacity-migration`（`5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`） |
| 本 commit 實際新增 | `git diff 65058a8…bc6a6d5 --name-status` 恰好 3 個 `docs/capacity-successor/` 新檔，+1090 行                              |
| 受審 SQL blob      | `a04048e90d6b64c692f03c722b9eea2849058aab`／SHA-256 `5cf0a66a…4887`，`git diff 65058a8…bc6a6d5 -- supabase` = 0 bytes     |

這裡必須区分兩種 diff 範圍，日後文件不得混用：PR #51 對 base 的 diff 另外顯示 `supabase/migrations/20261119090000_group_hard_max.sql`（+227/−17）與兩個 `docs/team/` 檔，那是它從 PR #41 head 繼承的內容，不是 successor commit 的改動。Role 6 沒有改動 `main`（`1a583e30c019733d1880d2614ca853481509fdad`）、integration（`344c1058e78fd2cccfde89574e226f3e65a1457c`）或 Roy head（`951bb89052751ebd2d182cf4004d5d40f5f3893d`）。

## 3. 設計方向：wrap 而非複製

Role 6 選擇讓 successor「包住」已審查的 capacity blob，而不是把 1,756 行 DDL 複製成新檔。這個方向與 Adam 的 Option A 決定一致：同一份 DDL 只能有一個權威來源，否則過去所有 exact-head review 都會失效。guard 放在 `docs/capacity-successor/` 而非 `supabase/migrations/`，避免在兩個 ledger 尚未調和前擴大 blind-replay 面，也是穩健的取態。四軌分離（capacity DDL／Main row-8 promotion／Main grant 正規化／ledger identity repair）在文件與 guard 內容中都維持乾淨。

Main 今日結構上不適合此 DDL 的推論（14 欄 legacy read 依賴 Main 缺少的 `subject`；`list_group_recruitment_posts_capacity` 是 plpgsql 且選 `p.subject`，屬建立時不驗證的相依；blob 的 `drop function if exists public.create_group_and_invite(uuid, uuid)` 會刪掉 Main 唯一的 create RPC）與既有 coordinator metadata parity 記錄相符，屬於計畫輸入，不是授權。

## 4. 但 guard 草稿目前無法執行 — 本機 parser 實測

協調任務在自己沙箱安裝一次性 PostgreSQL 16.15（僅 unix socket、無網路監聽，用畢即停止並刪除；**未**連線 Supabase Test `wkzclgmhrtecnpexfesr`，也**未**連線 Main `pijslbchvstkoweslymr`）執行驗證，原始輸出存於 `ROLE6_SUCCESSOR_GUARD_OFFLINE_PARSER_PROBE_20261122.md`。結論如下：

| 編號 | 缺陷                                                  | 實測結果                                                                       | 影響                                                                                |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| S-1  | guard 最後一個 `RAISE NOTICE`（約 `:604`–`:606`）以 ` |                                                                                | ` 串接字串常數                                                                      | `syntax error at or near "                                                                        |                                                               | "`，整個 `do` 區塊無法 parse | 連 G1 的 Main 拒絕檢查都不會執行；檔案目前不是可執行工具 |
| S-2  | `to_regfunction(text)`                                | `function to_regfunction(unknown) does not exist`（42883），guard 內 19 處使用 | 所有 regfunction 查照皆失敗；`to_regclass(text)` 正常                               |
| S-3  | `pg_proc.proallargnames`                              | `column p.proallargnames does not exist`（42703），見 `:376`／`:390`／`:409`   | 正確欄位為 `proargnames`；改名的同時須保留「`proargmodes` 為 null 即 mismatch」語意 |
| S-4  | `pg_default_acl.roleid`                               | 本機欄位為 `oid, defaclrole, defaclnamespace, defaclobjtype, defaclacl`        | G11 雖為 capture-only，仍會讓整個 block 中止                                        |
| S-5  | `v_fail := v_fail                                     |                                                                                | '字串'`（44 處，無任何 `array_append`）                                             | 每種測試形式都 `malformed array literal`（22P02），含有 text 變數參與者；只有 `array_append` 正確 | 第一個累加行（`:171`）即失敗，guard 無法回報任何一個 mismatch |

這些失敗都是 fail-closed（丟例外、不會誤報通過），所以不是安全繞過，也不是謊報綠燈；但它們代表「prerequisite guard」目前只是設計稿，還沒有真的被任何 PostgreSQL 解析器接受過。Role 6 自己的驗證也誠實聲明「從未經過 parser 解析或執行」，並把 ad-hoc 結構檢查器標示為非 PostgreSQL parser，因此本報告是補上它缺的那一步，不是推翻其方法論。

G4（helper 正規化 body 等值）的自我阻斷判斷仍然成立：canonical digests 來自未記錄的正規化 recipe 與輸入範圍，repository 內無法誠實釘住，所以在一次授權的唯讀 dry run 記錄 recipe 之前，任何套用請求都不該提出。

## 5. 已派的後續有限工作

- **Role 6 fresh exact-head review（Stage 4）**：已用既有任務 `9KfXkHmMqAxUkRMsbpxEwA`、profile Standard 派出，附本報告依據的離線證據、其 own successor handoff 與 Adam 19:09 授權。要求它對每項 finding 給 confirm／refute、覆蓋 Stage 4 全部面向，並就「G4 能否不靠 live dry run 誠實釘住」「兩步 vs 單一原子 successor」「PL/pgSQL guard 是否根本就是錯的工具（或許該改成經審查的 SELECT-only checklist）」給出立場。明確要求它区分自己 re-derive 的結論與沿用自身草稿的說法。
- **Roy 有限 F2-M1 修復**：見下一節，於既有 `feature/roy-capacity-f2-client-20261122` 進行。
- 兩者皆 read-only／assigned-branch only，不得觸碰資料庫、merge、ready、部署或發布；交付後即停止，不輪詢、不自動續派。

## 6. Eunice F2 獨立 verdict（接受為證據）

Eunice 在自己沙箱新建 detached worktree（未開協調任務或 Roy 的 checkout），重跑 frozen install、`pnpm check`、focused 104 tests、full 652 tests、`build:static`（1760 modules）、六檔 Prettier 與 `git diff --check`，全部 exit 0，並用未修改的 exact-head 模組獨立重現：

- `first=fresh, second=fresh, fetchCalls=1`（正確行為應為 `stale`）；
- `unknown` 之後-marker 恢復也永遠保持 `unknown`；
- 兩個同時 probe 共用一次請求（防 stampede 本來就正確）；
- 明確傳入 `fetch`／`loaded` 選項的路徑不會被 memoize。

她另外確認 `appBuildMarker.test.ts:154`–`:167` 把「一次載入只探測一次」寫成預期行為（也就是該測試把 defect 釘住），而 `supabaseGroups.capacity.test.ts` 整個 mock 掉 marker 模組，因此服務層測試永遠看不到此問題。其餘 bounded checks 全數通過：marker 可驗證性（clean tree 時 emit 的 `version.json` buildId 與 bundle 內 buildId 一致，顯式 ID 路径亦正確）、auth／dispatch／capacity 順序未被改變（2–19 → marker → `callGroupRpc` 的 session verify + `assertDispatchAllowed`）、approved 字串 byte-for-byte 一致（SHA-256 `f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610`）、無任何禁止機制實作、六檔範圍外無變更。她也很明確地說：倉庫端 header 政策只證明倉庫要求 Node/Express 發出的內容，不等同 hosting／CDN／瀏覽器快取實測。

**F2-M2（新增、同一 defect 家族）**：因為 memoize 的物件是 promise 本身且全無 timeout，一個永不 settle 的 `/version.json` 請求會讓後來的每次 default probe 都卡在同一個 pending promise；`createGroupAndInvite` 在 dispatch 前 await 它，而 `GroupWorkflows.tsx` 的 `actionBusy`（`:408`／set `:422`／只在 `:447` finally 清除）會一直維持 true，使該分頁後續所有群組操作無聲失效。這是可用性問題，不是安全問題（fail-closed，不 dispatch、不繞過）。要修它需要一個有界等待，也就是 timer，而 Adam 的 F2 contract 目前禁止 timer，所以本輪**不**實作，列為 Adam 的決定。

## 7. 這輪沒有發生的事

沒有資料庫存取（本機一次性 PostgreSQL 不是 Supabase，也未使用任何專案連線或憑證）；沒有 migration 套用；沒有 signed-in QA；沒有 merge、ready、部署、發布或權限／可見度變更；`main`、integration、PR #37／#41／#51 的 head 完全未動；PR #50 未整合；相容性 stub 與 legacy read wrappers 未移除；未新增任何使用者可见字串。Eunice 與 Role 6 的 handoff 都是 owner 交付，不等於 Adam 批准；通過的測試或 `MERGEABLE/CLEAN` 也不構成發布許可。

## Adam's next action(s):

1. **決定 F2-M2 是否有界等待**（一句話即可）。目的：Eunice 已重現「marker 請求不 settle 會永久卡住建立群組與該分頁後續群組操作」。選項為「允許一次有界等待，逾時判定 `unknown`、絕不 retry」或「明確接受此殘餘風險並記錄」。預期結果：Roy 的 F2 修復範圍不再含糊，marker 可用性的那一半才能結案或被有意識地延後。
2. **授權一次唯一產出為正規化 recipe／輸入範圍的唯讀 dry run**（Test `wkzclgmhrtecnpexfesr`，SELECT only，不讀 application row）。目的：解除 successor package 的 G4 自我阻斷。預期結果：兩個 helper 在 `pg_get_functiondef` 輸出上的 digest 與其計算方式被記錄，之後才談得上真正的 Test preflight。
3. **決定 successor 形狀**：維持「read-only guard + 位元組未變的 blob」兩步序列，或改為把 guard 內聯成單一原子 successor SQL head（後者代表新的 SQL head 與再一次 full exact-head review）。預期結果：未來套用 runbook 不再含糊。
4. **確認 Main 維持在 capacity 計畫之外**（直到 Track B row-8 promotion 與 Track C grant 正規化各自單獨決定）。目的：把 Role 6 的結構性發現轉成明確範圍表述，讓 owner review 不再需要逐次加註。
5. **拍板剩餘兩段 client 措辭，或明確延後**（既有建立路径字句 `CityLink needs an update. Refresh before creating a group.` 不變）。
6. （資訊性）提供 Role 6 的人類姓名，或確認維持 TBD。不阻塞任何工作。

### Coordinator/owner next action

等待 Roy 修復後的 head 與 Role 6 的 fresh review 兩份實際附件 handoff，不輪詢、不自動續派。Roy 交付後需再一次 fresh exact-head 證據 review（含 F2-M1 生命週期與「不得聲稱 hosting 層已驗證」的界限）；Role 6 verdict 回來後才談 successor／client-pair 聯合 review。其後才是有條件的 Test preflight，以及需要 Adam 另行明確核准（點名確切 SQL head 與 Test target）的 capacity migration。本機 parser 證據不能取代在實際 Test 引擎上的驗證，目標 PostgreSQL 大版本仍未確認。
