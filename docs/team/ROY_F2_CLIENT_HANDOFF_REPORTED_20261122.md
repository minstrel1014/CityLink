# Roy — F2 cached-client group-creation implementation handoff

Date: 2026-11-22 · Human role: **Roy — group creation/management, invitations and join requests** · Executed by: Roy continuity task `BZbzfvBk76tWP5HkPYqxXT` (this task-generated code is **not** authored by the human Roy) · Coordinator task: `HeZwm7CA7Y3rDtYBounkVC`

## 1. Assignment and delivery state

Finite assignment received 2026-11-22 19:02: from exact accepted integration head `344c1058e78fd2cccfde89574e226f3e65a1457c`, implement **only the stable group-creation F2 deliverables** — verifiable build/version marker (no browser-cache-time inference), the unchanged approved create-path message, user-triggered manual refresh, explicit `index.html` no-store/equivalent control where repository-controllable — on assigned branch, push, open a draft PR, hand off as an attachment, stop.

| Item                                | Exact value                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                          | `minstrel1014/CityLink`                                                                                                                                                           |
| Base (requested and used)           | `feature/capacity-integration-20261119-v2` @ `344c1058e78fd2cccfde89574e226f3e65a1457c` (unchanged before and after this work)                                                    |
| Assigned branch                     | `feature/roy-capacity-f2-client-20261122` (new; did not exist locally or remotely)                                                                                                |
| Committed head                      | `951bb89052751ebd2d182cf4004d5d40f5f3893d`                                                                                                                                        |
| Pushed remote head                  | `951bb89052751ebd2d182cf4004d5d40f5f3893d` — verified with `git ls-remote`                                                                                                        |
| Draft PR                            | **#50** `https://github.com/minstrel1014/CityLink/pull/50` — `OPEN`, `isDraft: true`, base `feature/capacity-integration-20261119-v2`, `mergeable: MERGEABLE` (6 files, +652/−11) |
| `main`                              | `1a583e30c019733d1880d2614ca853481509fdad` — untouched                                                                                                                            |
| Jeffery branches observed unchanged | `feature/jeffery-capacity-compat-client-20261121` `abb1839`, `feature/jeffery-refresh-queue-20261121` `d5b8515`, `feature/jeffery-group-chat-recruitment` `e2d7f76`               |
| Working location                    | `/home/ubuntu/roy-f2-client` — **separate `git worktree`** created for this assignment; the coordinator checkout was not opened or edited                                         |

Delivery verbs, kept distinct: **implemented, committed, pushed and PR-opened** by this agent. **Not** merged, **not** marked ready, **not** deployed, **not** published, **not** live-verified against any backend.

## 2. Actual changed files (exactly six)

1. `client/src/lib/appBuildMarker.ts` — **new** (marker module, 165 lines)
2. `client/src/lib/appBuildMarker.test.ts` — **new** (12 tests, 204 lines)
3. `client/src/lib/supabaseGroups.ts` — marker import; stale-build guard in `createGroupAndInvite`; exported approved string constant used by the existing handler
4. `client/src/lib/supabaseGroups.capacity.test.ts` — marker module mocked; 3 new tests
5. `vite.config.ts` — build-id resolution, `version.json` emission, dev `no-store` behaviour
6. `server/_core/vite.ts` — production Express cache headers

No other file changed (`git status --short` clean at commit; PR file list above confirmed from GitHub). `client/index.html`, routes, `manus-routes.json`, migration SQL, Supabase configuration, `/demo` data and every Stage 6 / recruitment-post read-path file (including `supabaseStage6.ts`) are **untouched** — no boundary crossing occurred, so no stop-and-report was needed.

## 3. Marker design (as built)

- Two identifiers only: the one **baked into the running bundle** (`import.meta.env.VITE_APP_BUILD_ID`, set by `vite.config.ts` from `CITYLINK_BUILD_ID` → else `git rev-parse HEAD` with a `-dirty` suffix for an uncommitted tree → else empty) and the one **published next to the deployment** (`/version.json`, emitted at build time by a Vite plugin and served in dev by the same plugin).
- `probeAppBuildFreshness()` returns `fresh` | `stale` | `unknown`. Comparison is identifiers only — **no** browser cache time, `Date.now()`, tab age, header date or storage read. The running bundle is never re-derived from the network; only `/version.json` is re-read.
- Fail-closed to inert, not to a block: no loaded identifier ⇒ `unknown` **without any fetch**; missing/blank/over-long/parse-failed/malformed-shape/non-OK/transport-error ⇒ `unknown`. `unknown` behaves exactly like the pre-F2 path (server remains sole authority), so unverifiable evidence is never presented as an upgrade problem.
- The default probe is memoized per bundle load; only a **manual browser refresh** loads a different bundle and re-evaluates it. `resetAppBuildFreshnessProbe()` is a test seam only.
- `createGroupAndInvite` flow: existing `validateGroupMaxMembers` 2–19 check → marker check → only if `stale`, throw the stable Role 6 Option A token `group_capacity_upgrade_required` **before any dispatch**; otherwise dispatch the single supported four-argument `create_group_and_invite` request verbatim (trimmed name, explicit maximum). The user-facing sentence exists in exactly one place, `GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE` in `supabaseGroups.ts`, reused by the existing handler.
- Explicitly **not** implemented (out of approved scope): no automatic reload, no forced refresh, no background retry, no storage/`localStorage`/`sessionStorage` draft preservation (an unsaved group-creation draft may be lost on manual refresh), no default/unlimited maximum fallback, no new refresh-control wording, no proactive second string. The three-argument fail-closed `create_group_and_invite` compatibility stub and the legacy read wrappers remain in place as Adam's rollout contract requires.

## 4. Cache evidence class and unresolved limitation

- **Evidence class: repository-controllable only.** Locally observed with `curl -I` on `localhost` (dev server and a temporary Express instance hosting the committed static path; no Supabase, no deployment):
  - dev: `/`, `/dashboard`, `/version.json` → `Cache-Control: no-store` (Vite's own `no-cache` on the document is pinned to `no-store` by the new plugin);
  - production serving path (`server/_core/vite.ts`): `index.html`, `/version.json`, SPA fallback `/dashboard`, `/404` → `no-store`; hashed asset `/assets/index-k6E8fa15.js` → `public, max-age=31536000, immutable`.
- **Unresolved limitation (must not be read as verified):** any hosting layer placed in front of the built output may add, rewrite or drop these response headers. **No deployment-level or public-demo header behaviour was tested or claimed.** `index.html` was intentionally not touched, because a `<meta http-equiv>` pragma cannot prove server response caching and would have been an unprovable assertion; if Adam requires header guarantees at the hosting edge, that is a separate hosting-configuration decision outside this repository.
- **Marker build evidence (independently produced here, post-commit):** `dist/public/version.json` = `{"buildId":"951bb89052751ebd2d182cf4004d5d40f5f3893d","version":null}` and that same identifier string is present in the emitted bundle `dist/public/assets/index-fphA3-dW.js`. Pre-commit the same build yielded `...-dirty`, demonstrating the uncommitted-tree guard. `version` is `null` rather than guessed because no release label was supplied.

## 5. Exact checks, results and warnings (recorded separately)

All run in `/home/ubuntu/roy-f2-client` with the pinned toolchain (Corepack pnpm 10.18.0, Node v22).

| Command                                                                                                         | Exit | Result                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                                       | 0    | Lockfile and `package.json` unmodified                                                                                                                                                                                                                                                       |
| `corepack pnpm vitest run client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.capacity.test.ts` | 0    | 2 files / **104 tests passed** (12 marker + 92 capacity)                                                                                                                                                                                                                                     |
| `corepack pnpm check` (`tsc --noEmit`)                                                                          | 0    | No diagnostics (re-run after Prettier: still 0)                                                                                                                                                                                                                                              |
| `corepack pnpm test` (`vitest run`)                                                                             | 0    | **41 files / 652 tests passed**, 0 failed/skipped. Base `344c105` had 637 in 40 files; delta = +1 file, +15 tests (12 marker, 3 capacity). One pre-existing benign `stderr` line from `server/platform.test.ts` (`[Auth] Session payload missing required fields`), unrelated to this change |
| `corepack pnpm build:static` (`vite build`)                                                                     | 0    | `dist/public` emitted incl. `version.json`; **1 warning**, the pre-existing rollup chunk-size (>500 kB) notice                                                                                                                                                                               |
| `git diff --check`                                                                                              | 0    | No whitespace errors                                                                                                                                                                                                                                                                         |
| `corepack pnpm exec prettier --check` then `--write` (six changed files only)                                   | 0    | 4 files reformatted; re-validation re-run (table above)                                                                                                                                                                                                                                      |
| `git ls-remote` after push                                                                                      | 0    | Assigned branch = `951bb890…`; integration = `344c1058…`; `main` = `1a583e30…`                                                                                                                                                                                                               |
| `gh pr view 50`                                                                                                 | 0    | Fields in §1                                                                                                                                                                                                                                                                                 |

Approved string integrity: the message in `supabaseGroups.ts` is byte-for-byte `CityLink needs an update. Refresh before creating a group.` — extracted SHA-256 `f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610`, identical to the hash verified in assignment 3. A unit test now pins it so a future edit cannot silently reword it. The pending 2026-11-22 example strings (`CityLink needs an update.`, `CityLink needs an update before group creation continues.`, `Please refresh this page before creating a group.`) were **not** added anywhere.

## 6. Preserved contracts

2–19 hard maximum with manual-only removal; `Group is full` / `Group maximum is not set` exact labels and the over-limit / maximum-too-low guidance still ahead of the upgrade handler; fail-closed invitation behaviour on a loading/failed/unavailable/unknown roster; narrow forming-creator count-as-one only; current-leader authority and succession tie-order `joined_at`, `created_at`, `id`; server-side authority unchanged (the client guard can only withhold a dispatch, never widen permission); old three-argument create stub and `_capacity` read wrappers preserved.

## 7. Authorization, environment limits and blockers

- Performed under Adam's 2026-11-22 F2 rollout-direction authorization plus the coordinator's exact finite assignment. GitHub-only: clone/worktree, edit, local validation, commit, push assigned branch, draft PR.
- **Not** done and not authorized: any Supabase call, Test/Main access, SQL or catalog inspection, migration application, signed-in or multi-account QA, merge, mark-ready, deployment, publication, GitHub visibility/permission change, `main` push, force-push, toolchain/lockfile change. No secret was read, printed or committed; no `.env` was added.
- Test-only local servers were used on localhost ports 3000/3011 for header observation and were stopped; the temporary header-check script was deleted and never committed.
- Blockers: none inside the assignment. Outstanding dependencies are **reviews, not defects**: Role 6 client/server-contract and compatibility review of this exact head, Eunice independent exact-head QA, and Adam's separate authorization for any later integration of PR #50. PR #37 was not touched.

## 8. Next action

Coordinator should dispatch PR #50's exact head `951bb890…` for fresh Role 6 review (marker/cache contract) and Eunice independent evidence reconciliation, then report Adam's decisions on the pending proactive wording and any hosting-edge header requirement. This task stops here: no polling, no monitoring, no self-redispatch.

Adam's next action(s):

1. **Read PR #50 (`https://github.com/minstrel1014/CityLink/pull/50`, exact head `951bb89052751ebd2d182cf4004d5d40f5f3893d`, base `344c1058e78fd2cccfde89574e226f3e65a1457c`, still draft).** Purpose: confirm the F2 stable deliverables are the ones you approved. Expected visible result: six files, marker comparison, one unchanged approved string, no auto-reload/retry/storage recovery. Unblocks: owner review dispatch.
2. **Decide the hosting-edge header question (product/security decision, currently blocking any no-store claim beyond this repository).** Purpose: this branch can only prove the headers the repository asks Node/Express and the Vite dev server to emit; a hosting layer in front may override them, and `index.html` deliberately has no `meta http-equiv` because it would be an unprovable claim. Required decision: accept repository-controllable evidence only, or name the exact hosting configuration/owner so header behaviour can be verified where the demo is actually served. Unblocks: an honest deployment-level cache claim and any F2 completion note.
3. **Confirm or defer the pending proactive wording (5a/5b) — one decision.** Purpose: the three example strings you sketched on 2026-11-22 are not implemented, as instructed. Expected result: either a new finite wording assignment or an explicit record that the single approved string stays the only create-path message. Unblocks: F2 UI completion and closes the "Remaining F2 wording confirmation" boundary in the PR #48 evidence summary.
4. **Authorize the next reviewer, not a merge.** Purpose: route PR #50's exact head to Role 6 (client/server-contract + cache policy) and Eunice (independent exact-head QA). Required approval: name the target tasks and scope; nothing else unlocks. Note: passing tests and `MERGEABLE` grant no merge or release approval.
5. Informational, no action needed: integration head stayed `344c1058…`, `main` stayed `1a583e30…`, Jeffery's three branch heads were unchanged, and no Supabase/Test/Main resource was touched.
