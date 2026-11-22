# Roy — F2-M1 marker memo-scope repair handoff (assigned branch only)

Date: 2026-11-22 · Human role: **Roy — group creation/management, invitations and join requests** · Task: `BZbzfvBk76tWP5HkPYqxXT` (Roy continuity task; this task-generated code is **not** authored by the human Roy) · Coordinator task: `HeZwm7CA7Y3rDtYBounkVC` · Profile used: Standard, as assigned (escalated from the Lite default because the assignment changes code and test contracts).

## 1. What was assigned and what is now delivered

Finite assignment received 2026-11-22 20:07: repair **F2-M1 only** — the marker probe lifecycle defect in PR #50 — on the existing assigned branch, keep the PR draft, push, verify the remote SHA, update the PR body once without deleting history, hand off as an actual attachment, stop. F2-M2 and everything else were explicitly out of scope.

| Item                | Old                                        | New                                                                                                                                                                            |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch              | `feature/roy-capacity-f2-client-20261122`  | unchanged, same branch                                                                                                                                                         |
| Head                | `951bb89052751ebd2d182cf4004d5d40f5f3893d` | `a2d041d6a038d3962d98d0280e9e36049d37e33f` (single parent = `951bb890…`, so PR history is preserved)                                                                           |
| Remote verification | —                                          | `git ls-remote` returned `a2d041d6a038d3962d98d0280e9e36049d37e33f` for the assigned branch                                                                                    |
| Draft PR            | #50 (base integration)                     | #50 updated: `state OPEN`, `isDraft true`, `mergeable MERGEABLE`, `baseRefOid 344c1058e78fd2cccfde89574e226f3e65a1457c`, `headRefOid a2d041d6…`, cumulative 6 files `+794/−11` |
| PR body             | described `951bb890…`                      | original text retained verbatim; one appended "Update 2026-11-22 — F2-M1 memo-scope repair" section (single `gh pr edit`, exit 0)                                              |
| `main`              | `1a583e30c019733d1880d2614ca853481509fdad` | unchanged                                                                                                                                                                      |
| Integration branch  | `344c1058e78fd2cccfde89574e226f3e65a1457c` | unchanged                                                                                                                                                                      |

Verbs kept distinct: **implemented, committed, pushed, PR body updated** by this agent. **Not** marked ready, **not** merged, **not** deployed, **not** published, **not** live-verified. PR #37, #41, #48 and #51 were not touched; Role 6's newly visible `feature/role6-capacity-successor-draft-20261122` branch appeared during `git fetch` and was left untouched.

Pre-edit state recorded as required: `git status --short --branch` clean and tracking only the assigned branch; `git fetch origin` done; `git log -1 --oneline origin/main` = `1a583e3`; `git branch --show-current` = `feature/roy-capacity-f2-client-20261122`; `git stash list` empty; `git worktree list` shows this assignment in `/home/ubuntu/roy-f2-client` (mine, exclusively) and the earlier Roy branch checkout in `/home/ubuntu/roy-group-workflows` untouched. No coordinator path was opened; no concurrent edit or unexplained tree change was observed, so no stop condition was triggered.

## 2. Defect and repair (exactly two files)

Repair commit `a2d041d6…`: `client/src/lib/appBuildMarker.ts` **+45/−12**, `client/src/lib/appBuildMarker.test.ts` **+112/−3** (total 157 insertions, 15 deletions). No other file changed — verified with `git diff --numstat 951bb890 --` on the other four paths, which printed nothing.

Mechanism, confirmed twice before this repair: `probeAppBuildFreshness()` stored the settled default verdict for the whole bundle lifetime and `createGroupAndInvite` used exactly that no-argument path, so a deployment published while the same tab stayed open was never noticed (`first=fresh, second=fresh, fetchCalls=1` where a correct marker must answer `stale`), and an initial `unknown` froze identically.

Corrected behaviour (line numbers at the new head):

- `:151` now declares `inFlightDefaultProbe`, holding only a **currently running** default reading.
- `:169` returns an existing running reading, so simultaneous default probes still share exactly one request (anti-stampede preserved).
- `:173`–`:176` attach `.finally` that clears the entry **when it settles**, resolved or rejected, and only if that call is still the running one. A settled verdict is never retained and nothing here is a cache.
- `:163`–`:169` short-circuit explicit-option probes so caller-supplied evidence is never deduplicated.
- `:196`–`:198` `resetAppBuildFreshnessProbe()` remains a test seam, redocumented as forgetting a _running_ reading; production no longer depends on it to re-evaluate anything.
- Module header (`:9`–`:19`) and probe/ seam comments were corrected: the old comment promising "one freshness answer per load" is gone, and the header now states that each explicit create attempt takes its own reading while only simultaneous attempts share one.

`unknown` is still a pass-through to the server-authoritative path with no new hard block, and the ordering `validateGroupMaxMembers` (2–19) → marker → `callGroupRpc` plus `verifyRequestSession` / `assertDispatchAllowed` with no await between them is unchanged — `client/src/lib/supabaseGroups.ts` was **not modified at all** by this repair.

## 3. Tests

`appBuildMarker.test.ts` grew from 12 to 17 tests. The test that pinned the defect ("probes at most once per loaded bundle and re-arms after a manual refresh") was retargeted; the comments that treated the seam as the manual-refresh proxy were corrected. Added, all in one loaded module instance: same-instance later-deployment (`fresh` then `stale`, two readings), `unknown`-then-recovery (`unknown` then `stale`), concurrent probes sharing exactly one reading **and** proof that a follow-up attempt re-reads after settle, explicit-option non-deduplication, and a seam test showing only the running reading is forgotten. The genuinely valuable no-reload / no-web-storage assertions were kept unchanged, and the single-request concurrency assertion was kept.

Honest coverage statement, as the packet required: `supabaseGroups.capacity.test.ts` mocks the **entire** marker module, so it can never observe memoization; there is **no** service-level lifecycle claim from that file. Service-level behaviour is proven by the marker unit tests plus the independent module harness below. The pending/never-settling case is covered as a documented residual test, not as a fixed behaviour.

## 4. Independent lifecycle harness on the real repaired module (out of repository)

Same method class Eunice used, so the result is comparable: the repaired `appBuildMarker.ts` was transformed with the repository's own esbuild (`--bundle --format=esm --platform=neutral --define:import.meta.env='{"VITE_APP_BUILD_ID":"build-A"}'`), loaded in Node v22 with a mutable published identifier, **one fresh module instance per scenario**, and a 40 ms race to distinguish pending from a verdict. Everything lived in `/tmp` (`/tmp/f2m1-harness`); no harness file was created inside the repository, and `git status` stayed limited to the two intended files throughout. Zero network, zero Supabase. Exit 0.

```json
{"scenario":"repaired | fresh then later deployment A->B","first":"fresh","second":"stale","fetchCalls":2}
{"scenario":"repaired | unknown then marker becomes readable","first":"unknown","second":"stale","fetchCalls":2}
{"scenario":"repaired | two concurrent probes","a":"fresh","b":"fresh","fetchCalls":1}
{"scenario":"repaired | F2-M2 residual: hung marker request","first":"PENDING (no verdict)","fetchCalls":1}
{"scenario":"repaired | F2-M2 residual: later attempt while first is pending","second":"PENDING (no verdict)","fetchCalls":1}
{"scenario":"repaired | explicit-option probes are not deduplicated","one":"fresh","two":"stale","fetchCalls":2}
```

F2-M1 is therefore closed on this head, the anti-stampede property is unchanged, and F2-M2 is reproduced as still open — by design, because closing it needs a bounded wait.

## 5. Exact commands, exit statuses, counts and warnings

Pinned toolchain: Corepack pnpm 10.18.0, Node v22. No toolchain or lockfile change.

| Command                                                                                                                      | Exit                                               | Result                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm install --frozen-lockfile`                                                                                    | 0                                                  | `package.json` / `pnpm-lock.yaml` unmodified (`git status` limited to the two intended files)                                                                                                                                                                                              |
| `CI=true corepack pnpm exec vitest run client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.capacity.test.ts` | 0                                                  | 2 files / **109 tests** passed (17 marker + 92 capacity)                                                                                                                                                                                                                                   |
| `corepack pnpm check`                                                                                                        | 0                                                  | `tsc --noEmit`, no diagnostics                                                                                                                                                                                                                                                             |
| `CI=true corepack pnpm test`                                                                                                 | 0                                                  | 41 files / **657 tests** passed, 0 failures/skips. Prior head was 652; delta +5 (17 marker instead of 12). Pre-existing `stderr` classes each present once: `[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured!` and `[Auth] Session payload missing required fields` — not mine to fix |
| `corepack pnpm build:static`                                                                                                 | 0                                                  | **1760 modules transformed**; the two pre-existing advisories: `<script src="/api/platform/config.js"> in "/index.html" can't be bundled without type="module" attribute` and `(!) Some chunks are larger than 500 kB after minification`                                                  |
| `corepack pnpm exec prettier --check` (two changed files)                                                                    | 0 after one `--write` pass on those two files only | all changed files match Prettier 3.6.2 style; re-validation re-run afterwards                                                                                                                                                                                                              |
| `git diff --check`                                                                                                           | 0                                                  | no whitespace errors                                                                                                                                                                                                                                                                       |
| `git ls-remote origin …`                                                                                                     | 0                                                  | assigned branch `a2d041d6…`; integration `344c1058…`; `main` `1a583e30…`                                                                                                                                                                                                                   |
| `gh pr edit 50 --body-file …`                                                                                                | 0                                                  | body updated once, original text preserved                                                                                                                                                                                                                                                 |
| `gh pr view 50 …`                                                                                                            | 0                                                  | fields in §1                                                                                                                                                                                                                                                                               |

Approved-string integrity at this head: extracted from `supabaseGroups.ts` and hashed — `CityLink needs an update. Refresh before creating a group.` SHA-256 `f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610`, unchanged from assignment 3 and from Eunice's independent extraction. A grep scan for `setTimeout`, `setInterval`, `location.reload`, `localStorage`, `sessionStorage`, `indexedDB`, `serviceWorker`, `Date.now` and `retry` in the two changed files returns only comment text plus the test's own tracking stubs, i.e. **no prohibited mechanism was implemented**. The three pending 2026-11-22 example strings remain absent, and no new user-visible string was added anywhere.

## 6. Evidence classes and authorization boundary

Static/mock evidence: unit tests, esbuild module harness, typecheck, build. Locally observed earlier (not re-run in this assignment, still unverified at any hosting edge): dev and Express response-header readings on localhost. **Not** established by anything here: live Auth/RLS/concurrency behaviour, a real `/version.json` round-trip against a deployment, hosting-edge or CDN cache behaviour, migration application, or the Role 6 successor/client-pair review. A passing suite is not lifecycle proof and grants no merge or release approval.

Performed under Adam's 2026-11-22 19:09 packet Stage 2 plus general items 1, 2, 3, 4, 6 and 8, through this finite assignment only: read-only GitHub inspection, local/static work, documentation, PR-body update while draft, and a push to the explicitly assigned branch. **Not** done and not authorized: any Supabase call, Test `wkzclgmhrtecnpexfesr` or Main access, SQL/catalog inspection, migration, signed-in or multi-account QA, merge, mark-ready, deployment, publication, repository visibility or permission change, `main` push, force-push, toolchain or lockfile change. No secret was requested, read or printed; no `.env` exists or was created; the commit contains no credential-like addition.

## 7. Blockers and open items

No blocker prevented delivery; the repair is complete and the branch is pushed. Open items that are **decisions, not defects in this change**:

1. **F2-M2 residual remains open** (Adam's decision). An unsettled `/version.json` reading keeps later default probes waiting on it, blocking that create attempt and, on the My Groups page, the `actionBusy` single-flight gate. It fails closed — no dispatch, no capacity or security bypass — and closing it needs a bounded wait/abort resolving to `unknown` (never a retry), i.e. a timer that this assignment forbade. Nothing was implemented on it.
2. Marker-lifecycle claim: F2 stale-client detection can now be claimed for **each explicit create attempt** at this head, but only as static/mock evidence; an honest F2-complete statement still needs a fresh exact-head review of `a2d041d6…`, the Role 6 successor/client-pair review, the separately gated Test preflight and authorized Test QA.
3. Unchanged from before: the hosting-edge `index.html` header question and the two pending client-string decisions remain Adam's.

## 8. Next action

Coordinator: route `a2d041d6a038d3962d98d0280e9e36049d37e33f` back to Eunice for a fresh exact-head lifecycle re-check and to Role 6 if the marker/cache policy is inside the successor review scope; keep PR #50 draft and hold the Stage 5/6/8 gates. This task stops now — no polling, schedule, monitor or self-redispatch.

Adam's next action(s):

1. **Accept or challenge the F2-M1 repair at the new head.** Purpose: confirm the memo-scope fix is exactly what you approved. Target: PR #50, head `a2d041d6a038d3962d98d0280e9e36049d37e33f`, base `344c1058e78fd2cccfde89574e226f3e65a1457c`, still draft. Required decision: none beyond acceptance. Expected visible result: harness shows `fresh` then `stale` with two readings, `unknown` then `stale`, and one request per concurrent wave. Unblocks: a truthful F2 stale-client detection claim and Eunice's fresh exact-head pass.
2. **Decide F2-M2 in one sentence — still open.** Purpose: an unsettled marker read can permanently block group creation and later My Groups actions in that tab; the fix requires a bounded wait/abort that resolves to `unknown`, which is a timer and therefore forbidden until you say otherwise. Required decision: allow a bounded wait resolving to `unknown` with no retry, or explicitly accept the recorded hang residual with fail-closed behaviour. Expected result: a clean, separately scoped follow-up on this branch, or a recorded risk acceptance. Unblocks: closing the availability half of the marker lifecycle.
3. **Keep the two outstanding decisions parked; no agent action is needed now** (informational confirmation only): the hosting-edge `index.html` header question and the pending proactive/refresh wording mapping. Expected result: agents continue to claim no deployment-level cache guarantee and implement no new user-visible string. Unblocks: nothing yet; both stay prerequisites before any F2-complete or release statement.
4. **Authorize the next reviewer, not a merge.** Purpose: send `a2d041d6…` to Eunice and, if you want it, Role 6 for the marker/cache-policy part alongside the successor review. Required approval: name the target task and exact scope. Note: 657 passing tests and `MERGEABLE` grant no merge, ready, migration, Test, deployment or release approval, and PR #37/#41/#48/#51 stay untouched.
