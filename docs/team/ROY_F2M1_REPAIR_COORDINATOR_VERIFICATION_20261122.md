# Roy F2-M1 修復 — 協調任務獨立驗證（2026-11-22 20:22 HKT）

人類角色：Roy — 群組建立／管理、邀請與加入申請。交付任務：`BZbzfvBk76tWP5HkPYqxXT`（Roy 連續性任務，assignment 5）。驗證者：協調任務 `HeZwm7CA7Y3rDtYBounkVC`。本報告由 Manus 撰寫與執行，**不是**人類 Roy 或人類 Adam 的寫作。

## 1. 精確 ref 核對（全部由本協調任務自己執行，非轉述）

| 項目                                     | 結果                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 指派分支                                 | `feature/roy-capacity-f2-client-20261122`                                                                                                               |
| 新 head                                  | `a2d041d6a038d3962d98d0280e9e36049d37e33f`（`git ls-remote` 與本地一致）                                                                                |
| 父提交                                   | 恰好 `951bb89052751ebd2d182cf4004d5d40f5f3893d`，區間只有 1 個提交，歷史未重寫                                                                          |
| 修復 delta（父→新 head）                 | 只有 2 檔：`client/src/lib/appBuildMarker.ts` +45/−12、`client/src/lib/appBuildMarker.test.ts` +112/−3（共 +157/−15）                                   |
| 累積 PR 範圍（base `344c1058…`→新 head） | 仍為原先 6 檔、+794/−11；`package.json`、`pnpm-lock.yaml`、`supabase/`、`server/`、`vite.config.ts` 在父→新 head 之間**零變動**                         |
| PR #50 回讀                              | `OPEN`、`isDraft true`、`MERGEABLE`、`CLEAN`、base `344c1058e78fd2cccfde89574e226f3e65a1457c`、head `a2d041d6…`、6 檔 +794/−11（`gh pr view` 實際欄位） |
| 其他 ref                                 | `main` `1a583e30c019733d1880d2614ca853481509fdad`、integration `344c1058…`、PR #41 head `65058a8…`、PR #51 head `bc6a6d5…` 皆未變動                     |

**歸屬揭露**：Roy 的沙箱全域 git 身分也是 Adam 的 GitHub 帳號，因此 `951bb89` 與 `a2d041d` 的 author/committer 都顯示 `minstrel1014`，兩者在 commit 內文都有 `Co-authored-by: Manus <dev-agent@manus.ai>` trailer。這是所有 owner 任務沙箱的共通現象，不是Roy 或 Adam 人類撰寫的證據。协调提交 `471d4c3` 有相同問題，已在 PR #48 與 ledger 揭露；本輪起協調任務改用顯式 `Manus <dev-agent@manus.ai>` 身分（見第 6 節）。

## 2. 修復機制（我讀原始碼確認，不只信報告）

`appBuildMarker.ts` 在新 head 的實際做法：

- `:151` 宣告 `inFlightDefaultProbe`，只保存「**目前正在跑**」的預設讀取；已 settle 的判定不再被保留，因此同一 bundle 生命週期凍結判定的舊缺陷消失。
- `:169` 若已有執行中的讀取就共用，保留「同時發出的 probe 只打一次 `/version.json`」的防轟炸性質。
- `:173`–`:176` 用 `.finally()` 在 settle（成功或拋出）時清除，且只在「自己仍是那個執行中的讀取」時清除；`.finally` 不是計時器，未引入 `setTimeout`／`setInterval`。
- `:163`–`:169` 明確選項（caller 傳入 `loaded`／`fetch`）的 probe 一律不去重，避免測試或呼叫端證據被生產路徑污染。
- `:196`–`:198` `resetAppBuildFreshnessProbe()` 仍存在，但語意改寫為「忘記執行中的讀取」，且我 grep 全倉確認**除測試檔外無人呼叫**（只有 `appBuildMarker.ts` 自己的定義）。
- 標頭註解 `:9`–`:19` 刪掉了「每個 load 只有一次 freshness 答案」的舊承諾，並新增「不得有計時器／interval／visibility／route hook／背景重掃」的明文界線。

`client/src/lib/supabaseGroups.ts` 完全沒被這次修復改動：服務呼叫點仍是 `:895` 的 `if ((await probeAppBuildFreshness()) === "stale")`，也就是走預設路徑；`validateGroupMaxMembers`（2–19）→ marker → `callGroupRpc`（含 `verifyRequestSession`／`assertDispatchAllowed`）的順序與中間無 await 的性質保持不變。

**禁止機制掃描（我自己執行）**：兩檔中 `setTimeout|setInterval|location\.reload|localStorage|sessionStorage|indexedDB|serviceWorker|Date\.now|retry|AbortController|signal` 的命中全部是註解或測試用的 tracking stub（`:297`–`:298` stub 兩個 storage 以證明未被使用），無任何實作。批准字串在此 head 依然是 `CityLink needs an update. Refresh before creating a group.`，SHA-256 `f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610`，未變；未新增任何使用者可見字串，三段待定範例字串仍不存在。

## 3. 我重跑的指令與結果（新 head 的乾淨 detached worktree `wt-roy-f2-a2d041d`）

| 指令                                                                                           | 退出碼 | 結果                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                      | 0      | Done in 3.5s（pnpm 10.18.0，Node v22.23.4）；`git status` 僅 `HEAD (no branch)`，無樹變動                                           |
| `corepack pnpm check`（`tsc --noEmit`）                                                        | 0      | 無诊断                                                                                                                              |
| `CI=true corepack pnpm exec vitest run appBuildMarker.test.ts supabaseGroups.capacity.test.ts` | 0      | 2 files / **109 tests**（17 marker + 92 capacity）                                                                                  |
| `CI=true corepack pnpm test`                                                                   | 0      | 41 files / **657 tests**、0 failed、0 skipped；僅兩類既有 stderr 各 1 次（OAuth 未設定、`Session payload missing required fields`） |
| `corepack pnpm build:static`                                                                   | 0      | **1760 modules transformed**；既有兩項 advisory（`/api/platform/config.js` non-module、>500 kB chunk）                              |
| `corepack pnpm exec prettier --check`（兩檔）                                                  | 0      | All matched files use Prettier code style（未修改樹）                                                                               |
| `git diff --check`                                                                             | 0      | 無 whitespace 錯誤                                                                                                                  |
| `cat dist/public/version.json`                                                                 | —      | `{"buildId":"a2d041d6a038d3962d98d0280e9e36049d37e33f","version":null}`，與 bundle buildId 一致                                     |

測試從 652 → 657 的差異可由「marker 測試 12 → 17」完全解釋；`appBuildMarker.test.ts` 現在 17 個 `it()`，其中 `:160` 直接命名「deplyment 落地而分頁未刷新時要重讀」、`:177` 驗證 unknown 不再凍結、`:220` 明確把 F2-M2 殘留寫成「保持殘留」的測試、`:278` 保留「不得 reload／不得用 web storage」斷言。

## 4. 我自己的外部 module harness（不含計時器）

方法與 Eunice/Roy 同類但獨立撰寫：用倉庫自備 esbuild 把**新 head 的真實 `appBuildMarker.ts`** 打成 ESM bundle（`--define:import.meta.env='{"VITE_APP_BUILD_ID":"build-A"}'`），每個情境用 `import(url?query)` 取用**全新 module 實例**，以可變的 published buildId 模擬部署落地；pending 偵測只用 `setImmediate` 雙層 microtask/turn 推進，**不使用計時器**，腳本存於倉庫外（`coord-f2m1-repair-harness-20261122.mjs`，本分支附檔為證據副本）。零網路、零 Supabase。

| 情境                             | 觀察                                                            | 判定                                               |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| 同實例、部署落地 A→B             | `first=fresh`、`second=stale`、`fetchCalls=2`                   | **通過**（舊 head 是 `fresh`/`fresh`/1，即 F2-M1） |
| 初次 unknown（fetch 拋出）後可讀 | `first=unknown`、`second=stale`、`fetchCalls=2`                 | **通過**（舊 head 會永久凍結 unknown）             |
| 兩支同時 probe，之後再試一次     | 同波 `fresh`/`fresh` 共用 1 次讀取；下一次 `stale`；總 2 次讀取 | **通過**（防轟炸性質未被犧牲）                     |
| 明確傳入 `loaded` 的 probe       | `stale`/`stale`、`fetchCalls=2`                                 | **通過**（不去重 caller 證據）                     |
| `/version.json` 永不 settle      | 兩支都 `PENDING(no verdict)`、`fetchCalls=1`                    | **通過**（如實重現 F2-M2 仍開放）                  |

第 5 個情境第一次跑顯示 `pass:false`，原因是我斷言了 promise 物件相等；但 `probeAppBuildFreshness` 宣告為 `async`，回傳時必然包一層新 promise，所以「物件相同」不是有效斷言。底層仍是同一支未 settle 的讀取（只打 1 次、兩者皆 pending），與 F2-M2 的描述一致。修正斷言後為 **5/5 通過**，此調整只發生在倉庫外 harness，未碰任何應用碼。

## 5. 結論與界線（誠實措辭）

- 我在此 head 以**獨立來源**同意：F2-M1 已修復，且防同時轟炸、2–19 先行、marker 後 session verify 再 dispatch guard 的順序、批准字串、無禁止機制等項目仍然成立。
- 這些仍是**靜態／mock／本機 build 證據**。尚未建立：真實部署的 `/version.json` 往返、hosting edge／CDN 的 `index.html` 快取實測、瀏覽器實測、live Auth/RLS/併發、任何 migration 套用。因此**還不能**宣告 F2 完成；需要 Eunice 在此 head 的 fresh exact-head 獨立複驗、Role 6 的 successor／client-pair review、以及另行核准的 Test preflight＋授權 Test QA。
- **F2-M2 依然開放且未實作修復**：永不 settle 的讀取會讓該分頁後續建立群組嘗試與 My Groups 的 `actionBusy` 單飛閂鎖一直卡住（fail-closed，無派單、無容量或安全繞過，僅可用性）。關閉它需要有界等待／abort 並回 `unknown`（也就是計時器），屬 Adam 決定；Roy 的指派單明確禁止，他也确实沒做。
- 无資料庫存取：本輪沒有 Supabase 連線、SQL 執行、`.env` 輸出或憑證讀取；Test `wkzclgmhrtecnpexfesr` 與 Main `pijslbchvstkoweslymr` 完全未被接觸。無 merge、無 ready 轉換、無部署、無發布、無可見度或權限變更。

## 6. 本輪協調提交的署名方式

自本提交起，協調任務的證據 commit 顯式使用 `Manus <dev-agent@manus.ai>`（不依賴沙箱全域 `minstrel1014` 身分），並在必要時保留 `Co-authored-by` trailer。已推送的 `471d4c3` 因未經授權不做 force-push／改寫，其歸屬問題以揭露方式處理，交由 Adam 決定是否保留。

Adam's next action(s):
接受或挑戰 `a2d041d6…` 的 F2-M1 修復（僅確認方向，不代表核准 merge／migration／部署）；決定 F2-M2 要授權有界等待回 `unknown`，還是明確接受此 fail-closed 殘留；其餘五項 queued 決定見 owner ledger。目前無須你即刻行動 — 等待 Eunice 在此 head 的 fresh exact-head 獨立複驗與 Role 6 的 PR #51 fresh review。
