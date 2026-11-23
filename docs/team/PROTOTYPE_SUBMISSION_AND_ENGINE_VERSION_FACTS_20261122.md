# 原型交付與引擎版本 — 唯讀事實紀錄（2026-11-22 20:50 HKT）

本檔由 Manus（協調任務）執行與撰寫，不是人類撰寫。目的：回答 Adam 的實際問題「交給教授的 prototype 是否需要舊 client 能用」，並記錄兩項在此之前未被記錄的**唯讀事實**。全程只讀：沒有寫入、沒有 migration、沒有 merge、沒有部署、沒有輸出任何金鑰或 `.env` 內容。

## 1. Main 目前的 RPC 清單（唯讀 SELECT，`pg_proc`＋`pg_namespace`，LIMIT 30）

| proname                        | identity arguments                                                               | 意義                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `create_group_and_invite`      | `p_course_id uuid, p_recipient_id uuid`                                          | Main 上唯一的建立群組 RPC，**兩參數舊形狀**；capacity 套用的受審 blob 會在 `:245` 將它 drop |
| `list_group_recruitment_posts` | `p_course_id uuid, p_after_created_at timestamptz, p_after_id uuid, p_limit int` | 舊四參數招募讀取仍在（Option A 的 legacy read 對照點）                                      |
| `can_manage_recruitment_post`  | `p_post_id uuid`                                                                 | 招募帖的真實 server 權限來源（F4 文件所述）                                                 |
| `*_capacity` 任何一組          | 查無                                                                             | **capacity migration 從未套用到 Main**                                                      |

結論：Main 仍是 capacity 之前的狀態。Adam 交付給教授的原始碼（`main` HEAD `1a583e30…`，只有 8 個 Stage 5/6 migration 檔，`supabase/migrations` 內無 `max_members` DDL）與 Main 的實際資料庫是**一致的一對**，所以教授的副本 today 沒有被我们的 capacity 計畫影響。

## 2. 交付碼本身不含任何憑證（只看存在性，未印值）

- 倉庫根**沒有** `.env*` 檔案；`.gitignore` 第 11–15 行排除 `.env`、`.env.local`、`.env.development.local`、`.env.test.local`、`.env.production.local`。
- 追蹤中的 blob 裡**找不到**任何 publishable key 或 JWT 開頭字串（`sb_publishable`、`eyJhbGciOi`）：0 檔命中。
- Main 的 project ref 只出現在 3 個檔案（`TODO.md` 1 次、`docs/team/DECISIONS.md` 4 次、`supabase/migrations/20261102090000_stage5_term_model.sql` 1 次），Test ref 出現在 18 個文件／交接檔；這些是**識別字**而非金鑰。
- 因此教授必須自行設定 `VITE_SUPABASE_URL`／`VITE_SUPABASE_PUBLISHABLE_KEY`（`client/src/lib/supabaseClient.ts`、`docs/SUPABASE_SETUP.md` 描述此要求），並執行 `pnpm db:migrate` 套用那 8 個 check-in migration（README 第 5–8 行）。除非 Adam 另外把 Main 的 URL＋publishable key 給教授，教授的執行不會碰到 Main。

## 3. 新事實：兩座資料庫都是 PostgreSQL **17.11**（先前所有本機證據用的是 16.15）

由唯讀 `list_projects` 取得（未連線資料庫）：

| project                | name                     | region         | postgres engine         | status         |
| ---------------------- | ------------------------ | -------------- | ----------------------- | -------------- |
| `wkzclgmhrtecnpexfesr` | CityLink-Stage5-Test     | eu-west-1      | **17**（`17.11.0.011`） | ACTIVE_HEALTHY |
| `pijslbchvstkoweslymr` | CityLink Project（Main） | ap-southeast-1 | **17**（`17.11.0.003`） | ACTIVE_HEALTHY |

影響，必須誠實處理：

1. Role 6 blocker 清單第 4 項「Test 引擎大版本未確認」與協調任務反覆聲明的保留條件，**現在已由授權的唯讀管道回答**：目標是 **PG 17**，不需要再用一次 dry run 去問版本。
2. 因此本輪全部「本機 16.15」證據（F1 parse 失敗、F7 `search_path=""` 渲染、F8 短路不保證、F5 array 解析、F2 `to_regprocedure` 語意、F10 begin/commit 抵觸 `--single-transaction`）在正式用作「記錄用儀器」判準之前，**必須在 17 上重新抽測**；這些都是 catalog／語法層行為，16 與 17 大概率一致，但這是假設而非證據。受影響的只有 `sha256(convert_to(...))`（PG15+ 即可，17 沒問題）與 `proconfig` 渲染形式這一類「依賴實際引擎實作」的觀察。
3. 這對「先修 guard 再跑 preflight」的順序沒有改變，只是把抽測目標從「未定版本」釘成 17。

## 4. 對 Adam 問題的直接回答（證據版）

- 「舊 client 相容」保護的對象是：**資料庫已經升級、但分頁裡還留著升級前載入的舊 JS bundle** 的重返使用者。它保護的不是拿到原始碼的人。
- 教授拿到的是 source＋啟動碼：他 build 出來的就是與那 8 個 migration 配對的 client，**不存在舊 bundle 打新資料庫的情境**。加上交付碼不含憑證，他預設也不會連到 Main。
- 唯一真實風險：**若後來把 capacity migration 套到 Main，而教授當時仍用你交付的舊版程式碼連著 Main**，建立群組會因為 `create_group_and_invite(uuid,uuid)` 被 drop 而失敗（受審 blob 的設計如此）。避免方式三擇一：(a) 保持 Main 不在 capacity 計畫內（這是已經排定的決定項）；(b) 給教授一個屬自己的 Supabase 專案或資料庫快照，不共用 Main；(c) 在遷移前後明確記錄「交付中的原型在此期間不得接 Main」。
- 因此：**不需要**為了教授的交付而保留舊 client 相容機制；需要的是「不要在他的展示期間動 Main」這個排程約束。

## 5. 關於顧問提出的 F2 取代方案（尚未核准，僅記錄）

顧問的文字會把 F2 contract 從「保守的舊快取 client 相容」改為「只支援新 client、使用者自行重新整理、不投入舊 client 相容工作」。若 Adam 以那段文字明確核准，被退役的是：build/version marker 的**必要性**（PR #50 的 marker 生命週期工作與 F2-M1／F2-M2 兩輪 review 循環）、`index.html` no-store 作為 rollout 要求、以及「舊 client 不再需要 stub 為止」的相容期門檻；保留的是：精確字串 `CityLink needs an update. Refresh before creating a group.` 在舊快取 client 打到 server 時的 fail-closed 回應、三參數 stub 與 legacy read wrappers 的存廢**一次決定**、以及 Role 6 SQL／security review、Test preflight、授權 signed-in QA 與發布檢查。此紀錄不代表任何授權：migration、Main 寫入、merge、部署、發布仍各需 Adam 另行決定。

## Adam's next action(s):

1. 決定是否用顧問那段文字**明確**取代現行 F2 contract（一句「批准／不批准」即可）；核准後我才把取代紀錄寫入 `docs/team/DECISIONS.md` 並據此縮小 Roy／Eunice 的範圍。
2. 決定教授的展示期間是否要完全凍結 Main（建議：是，並把「展示期間不得動 Main」寫進 Main 排除決定）；或改給教授自己的資料庫／快照。
3. 其餘已 queued 的決定維持不變：successor 儀器形狀、真實 parser 門檻（現在應寫成「在 17 上抽測」）、F10 操作單禁令、G4 pinning dry run、兩段 client 字串、Role 6 人類姓名。
