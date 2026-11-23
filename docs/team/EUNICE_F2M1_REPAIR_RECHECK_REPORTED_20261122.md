# Eunice finite handoff — F2-M1 repair exact-head independent recheck

Date: 2026-11-22 HKT  
Human role: Eunice — independent QA / live testing / documentation  
Coordinator task: `HeZwm7CA7Y3rDtYBounkVC`  
Assignment profile: Lite; bounded exact-head evidence reconciliation  
Repository: `minstrel1014/CityLink`

## 1. Target and evidence boundary

Target branch: `feature/roy-capacity-f2-client-20261122`  
Exact head: `a2d041d6a038d3962d98d0280e9e36049d37e33f`  
Exact parent: `951bb89052751ebd2d182cf4004d5d40f5f3893d` (single parent)  
Draft PR: #50  
Base: `feature/capacity-integration-20261119-v2` at `344c1058e78fd2cccfde89574e226f3e65a1457c`  
`main`: `1a583e30c019733d1880d2614ca853481509fdad`

This handoff reports requested checks, exact-head source inspection, independently rerun local/mock evidence, and non-live limitations separately. No statement below is live-verified.

I used a new detached worktree in my own sandbox: `/home/ubuntu/eunice-f2m1-repair-recheck`. The checkout remained clean at the exact head. The prior review checkout and coordinator/Roy checkouts were not switched or edited.

## 2. Verdict summary

| Item                   | Verdict                            | Evidence class                                                         | Result                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repair scope           | **CONFIRMED**                      | Independently rerun Git diff and PR metadata                           | Parent→head changes only the two marker files; required paths have zero delta.                                                                                                                                        |
| PR #50 metadata        | **CONFIRMED**                      | Independently rerun GitHub read-only inspection                        | OPEN, draft, MERGEABLE, CLEAN; base/head match the assignment; cumulative six-file scope is +794/−11.                                                                                                                 |
| F2-M1 lifecycle repair | **CONFIRMED**                      | Independently rerun real exact-head module harness                     | Same loaded module now returns fresh→stale and unknown→stale after two reads; concurrent probes still share one read; later attempt reads again.                                                                      |
| Retargeted tests       | **CONFIRMED**                      | Exact-head source read plus independently rerun focused/full tests     | 17 marker tests no longer pin the old whole-bundle verdict; lifecycle, explicit-option, seam, residual, and no-reload/no-storage assertions are present.                                                              |
| Contract boundaries    | **CONFIRMED**                      | Exact-head source/diff scans and independently rerun string/hash scans | No prohibited production mechanism, no new user-visible string, approved string unchanged, three-argument compatibility path untouched by this repair.                                                                |
| Reruns                 | **CONFIRMED**                      | Independently rerun local checks                                       | Frozen install, typecheck, focused/full tests, static build, Prettier, diff check all passed.                                                                                                                         |
| F2-M2 residual         | **CONFIRMED residual / NOT FIXED** | Independent pending harness plus source read                           | Never-settling marker read leaves later default attempts pending; `GroupWorkflows.tsx:408/422/445-448` leaves the single-flight action gate held until settle. Fail-closed availability only; no fix was implemented. |
| Hosting/live claims    | **NOT CHECKED**                    | Outside assignment boundary                                            | No hosting edge/CDN/browser deployment measurement, live Auth/RLS/concurrency QA, Test preflight, migration, or Test/Main access.                                                                                     |
| F2 overall completion  | **NOT CLAIMED**                    | Release gate remains open                                              | Role 6 successor/client-pair review, gated Test preflight and authorized Test QA remain outstanding.                                                                                                                  |

## 3. Scope and PR metadata evidence

Independently executed in the detached worktree:

```text
git fetch origin --prune                              exit 0
git show -s --format=... a2d041d6...                 parent=951bb890...; subject=fix(client): re-read the build marker for each later create attempt (F2-M1)
git rev-parse a2d041d6^                               951bb89052751ebd2d182cf4004d5d40f5f3893d
git ls-remote origin ...                               exit 0; assigned branch=a2d041d6..., base=344c1058..., main=1a583e30...
```

Read-only `gh pr view 50` returned:

```text
state=OPEN
isDraft=true
mergeable=MERGEABLE
mergeStateStatus=CLEAN
baseRefName=feature/capacity-integration-20261119-v2
baseRefOid=344c1058e78fd2cccfde89574e226f3e65a1457c
headRefName=feature/roy-capacity-f2-client-20261122
headRefOid=a2d041d6a038d3962d98d0280e9e36049d37e33f
url=https://github.com/minstrel1014/CityLink/pull/50
```

Parent→head diff:

```text
M  client/src/lib/appBuildMarker.test.ts     112 additions / 3 deletions
M  client/src/lib/appBuildMarker.ts           45 additions / 12 deletions
```

No parent→head delta was found in `package.json`, `pnpm-lock.yaml`, `supabase/`, `server/`, `vite.config.ts` or `client/src/lib/supabaseGroups.ts`. Cumulative base→head diff is exactly six files, 794 additions and 11 deletions:

```text
client/src/lib/appBuildMarker.test.ts          313 +
client/src/lib/appBuildMarker.ts               198 +
client/src/lib/supabaseGroups.capacity.test.ts  61 +
client/src/lib/supabaseGroups.ts                27 + 2 -
server/_core/vite.ts                             56 + 4 -
vite.config.ts                                  150 + 5 -
```

The newly fetched Role 6 branch ref exists as `origin/feature/role6-capacity-successor-draft-20261122` at `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`; I did not inspect its contents or claim its successor/client-pair review complete.

## 4. F2-M1 lifecycle harness — independently rerun

I wrote a fresh harness outside the repository at `/tmp/f2m1-eunice-recheck-20261122.mjs`. It bundled the real exact-head `client/src/lib/appBuildMarker.ts` with the repository's esbuild 0.25.10, supplied `VITE_APP_BUILD_ID=build-A`, used one fresh module instance per scenario, changed a local mocked published build ID between attempts, and made no network or Supabase calls. The valid final invocation exited 0:

```text
node -e 'esbuild.buildSync({entryPoints:["client/src/lib/appBuildMarker.ts"], bundle:true, format:"esm", platform:"neutral", outfile:"/tmp/eunice-f2m1-marker-bundle-20221122.mjs", define:{"import.meta.env":...}})'  exit 0
node /tmp/f2m1-eunice-recheck-20261122.mjs /tmp/eunice-f2m1-marker-bundle-20221122.mjs  exit 0
```

Verbatim final observations:

```json
{"scenario":"eunice | same instance fresh then later deployment A->B","first":"fresh","second":"stale","fetchCalls":2}
{"scenario":"eunice | same instance unknown then recovery","first":"unknown","second":"stale","fetchCalls":2}
{"scenario":"eunice | concurrent probes then later attempt","a":"fresh","b":"fresh","later":"stale","fetchCalls":2}
{"scenario":"eunice | never-settling marker residual","first":"PENDING (no verdict)","second":"PENDING (no verdict)","fetchCalls":1}
{"scenario":"eunice | explicit-option probes not deduplicated","one":"fresh","two":"stale","fetchCalls":2}
```

These independently confirm F2-M1 is closed at this head for the marker lifecycle: only an in-flight default reading is shared; it is cleared on settle; the next explicit create attempt re-reads. The harness also independently confirms the deliberate F2-M2 residual. A first attempt used a `.mjs.bundle` output and Node rejected that extension (exit 1); a second invocation accidentally targeted the bundle as the harness and produced no scenario output. Neither touched the repository or product code. The final correctly separated script/target invocation above is the only lifecycle result used for the verdict.

## 5. Source and test integrity

Exact-head `client/src/lib/appBuildMarker.ts` source inspection:

- `:137-149` documents the in-flight-only contract and the deliberate F2-M2 residual.
- `:151` declares `inFlightDefaultProbe`.
- `:163-177` bypasses deduplication for explicit options, shares only an existing running default promise, and clears that entry in `.finally()` on settle.
- `:190-198` keeps the test seam as a running-reading reset; production does not depend on it for re-evaluation.

Exact-head `client/src/lib/appBuildMarker.test.ts` source inspection:

- `:154-175` retargets the former one-probe-per-bundle test to fresh→stale with two reads.
- `:177-191` covers unknown→stale recovery.
- `:193-218` covers one shared concurrent read followed by a later re-read.
- `:220-239` honestly records the F2-M2 pending residual and no timeout.
- `:241-260` verifies explicit-option probes are not deduplicated.
- `:262-276` verifies the seam forgets only a running reading, not a settled verdict.
- `:278-312` preserves no reload/forced refresh and no web-storage assertions.

`client/src/lib/supabaseGroups.capacity.test.ts:19-25` still mocks the entire marker module. Therefore that file cannot prove service-level memoization/lifecycle behavior; its 92 tests remain valid for direct capacity/error/RPC contracts only. `client/src/lib/supabaseGroups.ts:889-908` is unchanged at the repair delta: 2–19 validation precedes the marker probe, then `callGroupRpc` performs session verification and dispatch guard. The repair does not claim live Auth/RLS or concurrency behavior.

`client/src/pages/citylink/GroupWorkflows.tsx:408-423` rejects actions while `actionBusy.current` is true and sets the flag before awaiting the action; `:445-448` clears it only in `finally` after the action settles and the context is still current. Combined with the never-settling harness result, this is the bounded F2-M2 availability observation. It is fail-closed: no RPC dispatch or capacity/security bypass was observed or inferred.

## 6. Contract and string checks

Independently rerun:

```text
approved string: CityLink needs an update. Refresh before creating a group.
SHA-256: f368208b8754fa2c2b6db6009e705efe3394bef0e9ae5865c0e6739909e44610
occurrences in client/src/lib/supabaseGroups.ts: 1
```

The repair does not modify `supabaseGroups.ts`; the three-argument compatibility stub remains outside this client repair delta. No default/unlimited fallback, cache-time inference, auto/forced refresh, draft recovery, retry, timer/interval, visibility hook, route hook, background re-check or new user-visible string was implemented in the two changed files. Grep hits for prohibited names in the marker files are comments or test tracking stubs only. The three pending example strings from the assignment were absent.

Build artifact evidence from the independent `build:static` rerun:

```text
dist/public/version.json = {"buildId":"a2d041d6a038d3962d98d0280e9e36049d37e33f","version":null}
head SHA found in emitted JS: dist/public/assets/index-CHIuT3o2.js
```

The clean detached tree produced the exact head build identifier. This proves the repository-side marker emission, not a hosting edge, CDN or browser cache property.

## 7. Independently rerun commands and results

Toolchain from exact-head manifest: Node v22.23.4, Corepack pnpm 10.18.0, Vitest 2.1.9, Prettier 3.6.2, esbuild 0.25.10.

| Command                                                                                                                      | Exit | Independently rerun result                         |
| ---------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                                                    |    0 | lockfile up to date; no tracked tree change        |
| `corepack pnpm check`                                                                                                        |    0 | `tsc --noEmit`, no diagnostics                     |
| `CI=true corepack pnpm exec vitest run client/src/lib/appBuildMarker.test.ts client/src/lib/supabaseGroups.capacity.test.ts` |    0 | 2 files; 109 tests (17 + 92) passed                |
| `CI=true corepack pnpm test`                                                                                                 |    0 | 41 files; 657 tests passed; 0 failures/skips       |
| `corepack pnpm build:static`                                                                                                 |    0 | 1760 modules transformed                           |
| `corepack pnpm exec prettier --check client/src/lib/appBuildMarker.ts client/src/lib/appBuildMarker.test.ts`                 |    0 | all matched files use Prettier style               |
| `git diff --check`                                                                                                           |    0 | no whitespace errors                               |
| exact-head esbuild bundle                                                                                                    |    0 | real marker module bundled outside repository      |
| final five-scenario module harness                                                                                           |    0 | observations in §4                                 |
| process/listener check                                                                                                       |    0 | no matching Vite/Node process or listener remained |

Pre-existing warnings were recorded separately and are not failures:

- Full tests emitted the existing OAuth configuration stderr and invalid-session payload stderr from `server/platform.test.ts`.
- Static build emitted the existing non-module `/api/platform/config.js` notice.
- Static build emitted the existing >500 kB chunk advisory.

## 8. Authorization, blockers and honest release wording

This was static/mock/local only. No Supabase connector call, SQL/catalog query, Test `wkzclgmhrtecnpexfesr` or Main `pijslbchvstkoweslymr` access, migration, signed-in/multi-account QA, repository edit, commit, push, PR mutation, merge, ready transition, deployment, publication, permission/visibility change, secret handling or `.env` read occurred. The detached review worktree remained clean at `a2d041d6…`.

F2-M1 stale-client detection can now be claimed for each explicit create attempt on this head, with simultaneous in-flight deduplication preserved. It cannot be expanded into a claim of hosting-edge/CDN/browser `index.html` cache behavior, live Auth/RLS/concurrency behavior, migration compatibility, or release readiness. Do not claim “F2 complete” while Role 6's successor/client-pair review, the gated Test preflight and separately authorized Test QA remain outstanding. PR #50 remains draft and release-blocked; PR #37 and other release gates remain untouched.

F2-M2 remains an open Adam decision, not a defect silently fixed by this repair: either authorize a separately scoped bounded wait/abort that resolves to `unknown` without retry, or explicitly accept the fail-closed hang residual. This assignment proposes no code change.

## Coordinator/owner next action

Send this handoff as an actual file attachment to coordinator task `HeZwm7CA7Y3rDtYBounkVC`, then stop. No polling, schedule, monitoring or self-redispatch.

Adam's next action(s):

1. **Accept or challenge F2-M1 at PR #50 head `a2d041d6a038d3962d98d0280e9e36049d37e33f`.** Purpose: record whether the bounded in-flight-only repair is accepted. Expected result: the exact-head lifecycle evidence is accepted or a specific contradiction is identified. This does not authorize merge, ready status, migration, Test QA, deployment or release.
2. **Decide F2-M2 in one sentence.** Target behavior: a never-settling `/version.json` read currently leaves later attempts waiting and holds `GroupWorkflows`' action gate; choose either a separately authorized bounded wait resolving to `unknown` without retry, or explicit acceptance of the fail-closed residual. Expected result: a recorded product/security decision and an unambiguous scope for any later work.
3. **Keep release gates and deployment claims blocked pending independent successor evidence.** Role 6 successor/client-pair review, gated Test preflight, authorized Test QA and hosting-edge/cache questions remain separate; no action here authorizes merge, migration, deployment or publication.
