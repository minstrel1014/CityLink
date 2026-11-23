# Evidence appendix — Eunice independent PR #50 exact-head review (2026-11-22)

All commands ran in my own sandbox. Review checkout: a new detached `git worktree` at the exact head. No repository file was created, edited, staged or committed; `/tmp` held every harness.

## A. Artifact verification (independently run)

```text
git fetch origin --prune                                   # integration moved d4558a7..344c105 (my own F1b head)
git show -s 951bb89052751ebd2d182cf4004d5d40f5f3893d       # parents=344c1058e78fd2cccfde89574e226f3e65a1457c
                                                            # subject=feat(client): make the F2 build marker verifiable and gate stale group creation
git rev-parse 951bb890^ = 344c1058e78fd2cccfde89574e226f3e65a1457c   # single parent == base
git log -1 --oneline origin/main  = 1a583e3 (origin/main, origin/HEAD, main) Merge pull request #29 ...
git ls-remote origin:
  344c1058e78fd2cccfde89574e226f3e65a1457c  refs/heads/feature/capacity-integration-20261119-v2
  951bb89052751ebd2d182cf4004d5d40f5f3893d  refs/heads/feature/roy-capacity-f2-client-20261122
  1a583e30c019733d1880d2614ca853481509fdad  refs/heads/main
  (no refs/heads/feature/role6-capacity-successor-draft-20261122 on origin at review time)
git diff --name-status 344c1058..951bb890:
  A client/src/lib/appBuildMarker.test.ts
  A client/src/lib/appBuildMarker.ts
  M client/src/lib/supabaseGroups.capacity.test.ts
  M client/src/lib/supabaseGroups.ts
  M server/_core/vite.ts
  M vite.config.ts
git diff --stat 344c1058..951bb890 → 6 files changed, 652 insertions(+), 11 deletions(-)

gh pr view 50 → PR#50 state=OPEN draft=true mergeable=MERGEABLE mergeState=CLEAN
  base=feature/capacity-integration-20261119-v2@344c1058e78fd2cccfde89574e226f3e65a1457c
  head=feature/roy-capacity-f2-client-20261122@951bb89052751ebd2d182cf4004d5d40f5f3893d
  +652/-11 files=6
gh pr view 50 --json files → 204+/0- appBuildMarker.test.ts · 165+/0- appBuildMarker.ts ·
  61+/0- supabaseGroups.capacity.test.ts · 25+/2- supabaseGroups.ts ·
  52+/4- server/_core/vite.ts · 145+/5- vite.config.ts
```

## B. Command results (exit statuses and warnings recorded separately)

| Command                                                                                                                      | Exit | Result                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                                                    | 0    | `package.json`/`pnpm-lock.yaml` unchanged (`git status --short` empty afterwards)                                                                                                                                             |
| `corepack pnpm check`                                                                                                        | 0    | `tsc --noEmit`, no diagnostics                                                                                                                                                                                                |
| `CI=true corepack pnpm exec vitest run client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.capacity.test.ts` | 0    | 2 files / **104 tests** (12 + 92), no warnings                                                                                                                                                                                |
| `CI=true corepack pnpm test`                                                                                                 | 0    | 41 files / **652 tests**, 0 failures/skips; pre-existing `stderr`: `[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured!` and `[Auth] Session payload missing required fields`                                               |
| `corepack pnpm build:static`                                                                                                 | 0    | **1760 modules transformed**; two warning classes: `<script src="/api/platform/config.js"> in "/index.html" can't be bundled without type="module" attribute` and `(!) Some chunks are larger than 500 kB after minification` |
| `corepack pnpm exec prettier --check` (six changed files)                                                                    | 0    | All matched files use Prettier code style (3.6.2)                                                                                                                                                                             |
| `git diff --check HEAD~1 HEAD`                                                                                               | 0    | No whitespace errors                                                                                                                                                                                                          |
| Marker lifecycle harness                                                                                                     | 0    | Observations in §C                                                                                                                                                                                                            |
| Cache-classification harness                                                                                                 | 0    | Observations in §D                                                                                                                                                                                                            |

Neither the build nor the test run required a network call beyond the pinned install; no server was started, and no listener or lingering node process remained (`ss -ltnp` and `ps` checked).

## C. F2-M1 harness — verbatim observations

Method: repository esbuild 0.25.10 transformed `client/src/lib/appBuildMarker.ts` **unmodified** (`--bundle --format=esm --platform=neutral --define:import.meta.env='{"VITE_APP_BUILD_ID":"build-A"}'`), loaded in Node v22.23.4 with a local `globalThis.fetch` mock holding a mutable published build id; one fresh module instance per scenario; a 40 ms race window distinguished a pending promise from a verdict. `expected…` fields are my stated expectation for a correct marker, not a claim about the code.

```json
{"scenario":"exact-head | fresh then later deployment A->B","first":"fresh","second":"fresh","fetchCalls":1,"expectedSecondVerdict":"stale"}
{"scenario":"exact-head | unknown then deployment recovers","first":"unknown","second":"unknown","fetchCalls":1,"expectedSecondVerdict":"stale"}
{"scenario":"exact-head | two concurrent probes","a":"fresh","b":"fresh","fetchCalls":1,"expectedFetchCalls":1}
{"scenario":"exact-head | hung marker request then later attempt","first":"PENDING (no verdict)","second":"PENDING (no verdict)","fetchCalls":1}
{"scenario":"exact-head | explicit-option probes are not memoized","one":"fresh","two":"stale","defaultStillCached":2}
```

F2-M1 **confirmed**: the later deployment is missed and no second reading is taken. F2-M2 **confirmed**: an unsettled request leaves both this and the later attempt without a verdict, with the same promise memoized.

A first harness version ran all scenarios inside a single module instance; scenarios 2-4 then returned the first cached verdict with 0 further fetches. That is corroborating evidence of lifetime memoization but not a valid isolated measurement, so the isolated-instance run above is the one this verdict rests on.

Repair prototype (a `/tmp` copy only, never written into the repository; memoized entry replaced by an in-flight entry cleared on settle):

```json
{"scenario":"proto | fresh then later deployment A->B","first":"fresh","second":"stale","fetchCalls":2,"expectedSecondVerdict":"stale"}
{"scenario":"proto | unknown then deployment recovers","first":"unknown","second":"stale","fetchCalls":2,"expectedSecondVerdict":"stale"}
{"scenario":"proto | two concurrent probes","a":"fresh","b":"fresh","fetchCalls":1,"expectedFetchCalls":1}
{"scenario":"proto | hung marker request then later attempt","first":"PENDING (no verdict)","second":"PENDING (no verdict)","fetchCalls":1}
{"scenario":"proto | explicit-option probes are not memoized","one":"fresh","two":"stale","defaultStillCached":2}
```

The prototype detects the later deployment and keeps one request per concurrent wave, but still has no bound on a hung request — hence the separate F2-M2 decision.

## D. Marker build and cache-classification evidence

```text
corepack pnpm build:static                       # clean detached worktree, no explicit id
  dist/public/version.json → {"buildId":"951bb89052751ebd2d182cf4004d5d40f5f3893d","version":null}
  grep -l 951bb890… dist/public/assets/*.js → dist/public/assets/index-fphA3-dW.js
CITYLINK_BUILD_ID=eunice-review-explicit-id corepack pnpm build:static
  dist/public/version.json → {"buildId":"eunice-review-explicit-id","version":null}
  grep -l eunice-review-explicit-id dist/public/assets/*.js → dist/public/assets/index-CJZWWwes.js
  (CITYLINK_VERSION had no effect: the version label input is VITE_APP_VERSION — informational only)
git status --porcelain | wc -l → 0               # bare SHA, no "-dirty" suffix on a clean tree
```

`applyBuiltAssetCacheHeaders` copied verbatim from `server/_core/vite.ts` into `/tmp`, bundled with esbuild, then exercised against the real emitted names:

```json
{"case":"index.html","cacheControl":"no-store"}
{"case":"version.json","cacheControl":"no-store"}
{"case":"hashed js (real emitted name)","cacheControl":"public, max-age=31536000, immutable"}
{"case":"hashed css (real emitted name)","cacheControl":"public, max-age=31536000, immutable"}
{"case":"explicit-id hashed js","cacheControl":"public, max-age=31536000, immutable"}
{"case":"favicon","cacheControl":"(none -> express/etag default)"}
{"case":"source map under assets","cacheControl":"(none -> express/etag default)"}
```

This is repository-side classification only; it is not a hosting, CDN, browser-cache or deployment measurement.

## E. Boundary and string checks

```text
git diff --name-only 344c1058..951bb890 -- supabase/ client/index.html \
  client/public/manus-routes.json package.json pnpm-lock.yaml \
  client/src/data/sampleData.ts client/src/lib/supabaseStage6.ts
  → unchanged (no output for every path)
git ls-files | grep -E '(^|/)\.env' → no .env tracked;  find . -maxdepth 2 -name '.env*' → none
commit additions credential scan (api[_-]?key|secret|service_role|password|sb_secret|token =)
  → "No credential-like additions (token matches are the approved machine identifier only)"

python extraction of GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE →
  repr: 'CityLink needs an update. Refresh before creating a group.'
  sha256: f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610   # matches Roy §5
grep -rn "CityLink needs an update" client/src → only supabaseGroups.ts:1063 and the test constant/assertion
grep for the three pending 2026-11-22 example strings in client/src, server, vite.config.ts → absent
grep -E "location\.reload|localStorage|sessionStorage|setInterval|setTimeout|indexedDB|serviceWorker|retry"
  appBuildMarker.ts vite.config.ts server/_core/vite.ts → comment lines only

Key line references verified at the exact head:
  appBuildMarker.ts:132 module-scope memo · :141-150 probe and memo logic · :146 reuse ·
  :148 store-before-settle · :162-165 test-seam reset
  supabaseGroups.ts:895 no-argument probe in createGroupAndInvite · :896 token throw ·
  :1062-1063 the single approved string · :1104-1105 mapper reuse
  appBuildMarker.test.ts:154-167 test that pins one-probe-per-load
  GroupWorkflows.tsx:408/422/447 actionBusy single-flight gate
  Callers: AuthenticatedCoursePeers.tsx:678 · CoursemateProfilePage.tsx:486 · GroupWorkflows.tsx:472
  PeopleCapacity.tsx:83-98 capacity branches ahead of fall-through to getGroupWorkflowErrorMessage
```

## F. Checkout isolation proof

```text
git worktree list
  /home/ubuntu/citylink-eunice-f1b-20261122  344c105 [docs/capacity-f2-wording-corrections-20261122]
  /home/ubuntu/eunice-pr50-review            951bb89 (detached HEAD)
Final: git status --short --branch → "## HEAD (no branch)" with no file lines; git rev-parse HEAD → 951bb890…
find (repo, excluding node_modules) for harness/run2.mjs → nothing
```

Cross-sandbox paths above are provenance only, not transfers; the harness scripts themselves are not part of the repository and were not attached as deliverables.
