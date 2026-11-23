# Roy F2 client — coordinator 精確-head核對

**日期：**2026-11-22 19:35 HKT。**人類 lead：**Adam，Project / Integration / Release Lead。Roy 保留群組建立、管理、邀請與 join-request owner 角色；程式碼由其 continuity task `BZbzfvBk76tWP5HkPYqxXT` 產生，不據此宣稱人類 Roy 親自撰寫。協調任務：`HeZwm7CA7Y3rDtYBounkVC`。

## 1. 結論與證據等級

**交付確已 committed、pushed，draft PR 已存在；現有 checks 由 coordinator 獨立重跑通過，但 F2 不能判為完成。** Coordinator 重現 **F2-M1：整個 bundle 生命週期的 marker memoization 會漏掉之後發布的新版**。Eunice 已收到一輪有限、獨立靜態審查；她的 verdict 尚未收到。Role 6 仍在完成原本的 successor draft，沒有被中斷。

這是 cached-client 更新提示的缺口，不是已驗證的容量／權限 bypass。未連接真實 backend，server 仍是權限與容量的最終 authority。Passing tests、MERGEABLE、文件 push 均不等於 integration、migration、live QA、merge 或 release permission。

## 2. 精確 Git / PR 身分與六檔 scope

| 項目                          | Coordinator 獨立核對結果                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Canonical repository          | `minstrel1014/CityLink`                                                                   |
| Owner branch                  | `feature/roy-capacity-f2-client-20261122`                                                 |
| PR                            | [#50](https://github.com/minstrel1014/CityLink/pull/50)，OPEN / draft / MERGEABLE / CLEAN |
| Owner head / remote / PR head | `951bb89052751ebd2d182cf4004d5d40f5f3893d`                                                |
| 唯一 parent                   | `344c1058e78fd2cccfde89574e226f3e65a1457c`                                                |
| Base                          | `feature/capacity-integration-20261119-v2`，仍為上述 parent；沒有整合本輪 owner commit    |
| Main                          | `1a583e30c019733d1880d2614ca853481509fdad`，未變                                          |
| PR scope                      | 六檔，+652 / -11                                                                          |
| 原始 Roy handoff SHA-256      | `a1fb6b3c8e63972685aeb78afe1dadd4331c82b8c6bfcddb32d7f5b3d0be537d`                        |

實際檔案只有：

1. `client/src/lib/appBuildMarker.ts`（新增）
2. `client/src/lib/appBuildMarker.test.ts`（新增）
3. `client/src/lib/supabaseGroups.ts`
4. `client/src/lib/supabaseGroups.capacity.test.ts`
5. `vite.config.ts`
6. `server/_core/vite.ts`

Exact-parent diff 及 GitHub file list 一致。`supabase`、Stage 6 recruitment service、routes/manifest、Supabase 初始化、`/demo`、package / lockfile / docs 沒有本輪 delta。Review 在 coordinator 新建的獨立 detached worktree 完成，前後 clean；沒有開啟、切換或修改 Roy 的 sandbox checkout。Owner handoff 裡的本地路徑只是 provenance，不是跨 sandbox transfer。

原始 owner 報告保留不改；repository archive [`ROY_F2_CLIENT_HANDOFF_REPORTED_20261122.md`](ROY_F2_CLIENT_HANDOFF_REPORTED_20261122.md) 只做 Markdown formatting。該報告的「沒有 assignment 內 blocker」與 review/hosting 建議是 **owner-reported**，本文件記錄追加獨立 evidence，並不把來源建議提升成 Adam 的新授權。

## 3. 已重現的 F2-M1

`appBuildMarker.ts:132–149` 把 default probe promise 留到 bundle 結束；`supabaseGroups.ts:895` 每次建立群組呼叫此 default probe。測試 `appBuildMarker.test.ts:154–166` 驗證一次讀取及 test-seam reset，沒有測試「同一分頁已確認 fresh，之後 deployment 換版」。

Coordinator 對 exact-head **未修改的 module** 做 esbuild TypeScript-to-CJS transformation，只把測試 loaded marker 定為 `build-A`，使用 synthetic `globalThis.fetch`；沒有外部 network 或 Supabase 呼叫。兩個獨立 module instance 的結果：

| 情境                                   | 第一次    | Published marker 改為 B 後第二次使用者操作 | Fetch 次數 | 應依目前 marker 判定 |
| -------------------------------------- | --------- | ------------------------------------------ | ---------- | -------------------- |
| A 初次與 deployment A 相符，後來發布 B | `fresh`   | 仍為 `fresh`                               | 1          | `stale`              |
| 初次 marker 讀取失敗，後來恢復且發布 B | `unknown` | 仍為 `unknown`                             | 1          | `stale`              |

重現腳本 exit 0 只表示成功觀察上述結果，**不是 F2 pass**。原始 module/source/test 未改動。第一次 harness 缺少 CommonJS `module` container，報 `module is not defined`；初次 pipeline 未正確捕捉 node 單獨 exit，不計為通過。補齊 harness 後使用 `set -o pipefail`，才取得上表及 actual exit 0。

**Disposition：**目前 head 不能被接受為完整 stale-client detection。它只能對第一次探測已經是 stale 的 bundle 給出提示；第一次為 fresh/unknown 後的 later deployment/recovery 會被終身 memoization 隱藏。不能因為 server 仍 enforce capacity，就把此 UX/rollout requirement 缺口當作完成。

**最小修正方向供 owner review：**只共用仍在進行的 probe，settled 後清除結果；之後每次明確使用者建立群組操作重新讀 no-store marker。這不需要 timer、背景監測、自動 reload、RPC retry、storage、draft recovery 或新 wording。此處是 proposal，還沒有修正或派出 Roy repair。保留 unknown 的既有 server-authoritative normal path；不得偷偷加入 unknown-state hard block。

## 4. 保留的 approved contracts

Source review 確認：2–19 validation 仍在 marker 之前；stale 時丟出 `group_capacity_upgrade_required`，在 RPC dispatch 之前停止；fresh/unknown 仍只送原有四參數 `create_group_and_invite`。`callGroupRpc` 在 marker await 之後仍驗證捕捉的 session/token、auth generation 及 `shouldDispatch`，沒有把 client marker 當安全 authority。三個 production caller 仍是 People、portfolio、GroupWorkflows；沒有 route change。Eunice 需追加核對此 await 對晚到 auth/session 變化的 mocked evidence。

唯一已批准 create-path 文案仍精確為：

```text
CityLink needs an update. Refresh before creating a group.
```

新增 constant / unit assertion 沒有改其內容。沒有新增 Adam 的 proactive／browser-refresh example strings，沒有自動 reload/retry/forced refresh、草稿 storage/recovery、default/unlimited maximum 或 fallback creation。

本 client branch 沒有 SQL delta。三參數 fail-closed stub 與 legacy read wrappers 是另外的 reviewed draft／successor contract；不能把 owner 報告的「保留」讀成它們已在 Test/Main 安裝或 live-verified。Fresh successor/client pair review、Test preflight、migration、QA、cleanup 仍是各自 gates。

## 5. 獨立重跑 checks 與警告

Exact head `951bb890...`，Node v22.23.4、Corepack pnpm 10.18.0、TypeScript 5.9.3、Vitest 2.1.9、Prettier 3.6.2。檢查 scripts 後才執行，未跑 database scripts 或會全樹改檔的 format script。

| Exact command                                                                                                                                                                                                                    | Exit                 | 實際結果                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                                                                                                                                                        | 0                    | package / lockfile 未改；無 install warning                                |
| `corepack pnpm check`                                                                                                                                                                                                            | 0                    | 無 TypeScript diagnostics                                                  |
| `CI=true corepack pnpm exec vitest run client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.capacity.test.ts`                                                                                                     | 0                    | 2 files / 104 tests；12 marker + 92 capacity；無 focused warning           |
| `CI=true corepack pnpm test`                                                                                                                                                                                                     | 0                    | 41 files / 652 tests / 0 failures；現有 platform stderr 見下               |
| `corepack pnpm build:static`                                                                                                                                                                                                     | 0                    | 1760 modules；version.json 與 hashed assets emitted；兩類既有 warning 見下 |
| `corepack pnpm exec prettier --check client/src/lib/appBuildMarker.ts client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.ts client/src/lib/supabaseGroups.capacity.test.ts vite.config.ts server/_core/vite.ts` | 0                    | 六檔 pass，未跑 write                                                      |
| `git diff --check 344c1058e78fd2cccfde89574e226f3e65a1457c 951bb89052751ebd2d182cf4004d5d40f5f3893d`                                                                                                                             | 0                    | 無 whitespace error                                                        |
| `git diff --exit-code -- package.json pnpm-lock.yaml`                                                                                                                                                                            | 0                    | 工具鏈檔案未改                                                             |
| 本地 marker lifecycle observation                                                                                                                                                                                                | 0（修正 harness 後） | 重現 F2-M1，不是產品 pass                                                  |

Full-test stderr 實際包括 missing `MANUS_OAUTH_API_URL` 的 OAuth diagnostic，以及 deliberate invalid-session `Session payload missing required fields`。Static build 實際包括 non-module `/api/platform/config.js` notice，以及 >500 kB chunk advisory。Owner report 只列一項 stderr／一類 build warning；以上是補齊 **independently observed** 警告，不是新增測試或 build failure。

Clean build 的 `dist/public/version.json` 為 `buildId = 951bb89052751ebd2d182cf4004d5d40f5f3893d`、`version = null`，同一 ID 出現在 emitted JS。沒有猜 release label，也沒有印出 bundle/config/secret values。現有 tests 通過不能證明未覆蓋的 marker lifecycle、真實 browser、Auth/RLS、concurrency 或部署 cache。

## 6. Cache 證據的精確限制

Coordinator 在 localhost 透過真實 repository `serveStatic` function 觀察；development mode 只用來選取 build 的 dist directory，其 cache-header function 未修改：

- `/`、`/index.html`、`/dashboard`、`/version.json`、`/404`：`Cache-Control: no-store`。
- `/404`：HTTP 404。
- `/assets/index-fphA3-dW.js`：`public, max-age=31536000, immutable`。
- 真實 Vite dev 的 `/`、`/dashboard`、`/version.json`：no-store。

短暫 harness 在 header assertions 後關閉兩個 server。Vite shutdown 與 dependency scan 競速，產生 `server is being restarted or closed; Request is outdated`，另有 baseline-browser-mapping 資料過舊 advisory；關閉後仍有 process handle。Coordinator 檢查後停止該有限 harness，後續 process inspection 沒有剩餘 header harness。**不宣稱整個 header script clean exit 0**。上面是實際 HTTP header observation，不是完整 application smoke pass。

Repository cache controls 有 source / localhost evidence，但沒有 hosting edge、CDN、public demo 或 deployed client evidence。Static Vite output 本身不會替未指定的外部 static host 設定 headers；不能要求 Adam「接受 repository evidence」就把 edge gate 當 verified。實際 host/config 仍須在另行授權的 rollout/deployment scope 核對。

## 7. 有限 review 派工與未執行事項

2026-11-22 19:35 HKT，既有 Eunice 任務 `Vf6CvKBQkfUjdqFWDs9JWX` 收到 self-contained exact-head static packet、Roy 原始 handoff、Adam 19:09 原始授權三份 **實際附件**。Send response 成功，代表已送達／可 resume，不代表她已完成。

派工前讀取 Eunice 最新 public handoff / stopped status，並核對 Project task snapshot：Eunice stopped / Lite、Roy stopped / Standard；Role 6 running / Standard。Eunice 這輪用 Standard，理由是 F2-M1 與 owner completion assessment 有 source/test contradiction，需要獨立診斷而不只是定位證據。沒有改動正在執行的 Role 6 assignment。Jeffery 已接受並 stopped；Kayk outside scope。

Eunice 僅可 GitHub read / source inspection / pinned local/mock checks，不可 repository edit、commit、push、PR mutation、Supabase/SQL/catalog/application rows、signed-in QA、accounts/fixtures、migration、merge、ready、deployment/publication 或 Main change。她需獨立 reproduce/refute F2-M1，再附完整 handoff 直接回 coordinator，停止；沒有 polling、monitor 或 automatic redispatch。

這輪 coordinator 沒有 Supabase call、SQL execution、Test/Main operation、signed-in QA、source edit、PR #50/#37 integration、merge、ready、deployment/publication、visibility/permission change 或 compatibility cleanup。Evidence branch 只記錄文件；Main RPC/security debt 仍分開處理。Host Project-file suggestions 只提交一次，未有明確 host applied receipt 前保持 pending。

## Coordinator/owner next action

等待 Eunice 有限 exact-head verdict；若确认需修正，才向 Roy 既有 branch 派出一輪明確、有限 repair，不由 coordinator 直接改 owner code。Role 6 完成 successor draft 後，安排 fresh exact successor/client pair review，不能延用 PR #41 舊 verdict。PR #50／#37 維持 draft；F2-M1、final proactive/refresh wording、真實 hosting evidence 及全部 Test/release gates 未關閉。

## Adam's next action(s):

No action required now — waiting for Eunice's exact-head static verdict and Role 6's successor draft handoff. Final proactive/refresh wording、exact Test migration 與任何 merge/deployment 決定會在各自依賴準備好後另行提出；本文件不要求或暗示批准它們。
