# Which commit is which version — and what Launch looks like today

Prepared 2026-11-23 14:05 at Adam's request. Every head was read from the remote at that time; nothing is inferred from memory.

## 1. Head → version

| Head                                             | Where it lives                                                                                                       | What it actually is                                                                                                                                                                                                                                  | Usable against Launch today?                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `1a583e30c019733d1880d2614ca853481509fdad`       | `main`                                                                                                               | Repository baseline. Client calls the **three**-argument creation RPC; no capacity code anywhere.                                                                                                                                                    | **No.** Launch has only the two-argument function.                                     |
| `344c1058e78fd2cccfde89574e226f3e65a1457c`       | `feature/capacity-integration-20261119-v2`; head of PR #37 (OPEN, draft, base `main`, 92 files) and of merged PR #47 | **C1, the capacity client.** Calls four-argument creation with `p_max_members`, reads the three `*_capacity` functions, renders `Group is full` / `Group maximum is not set`.                                                                        | **Not yet** — needs S3 applied first. This is the only client that will work after S3. |
| `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`       | `feature/group-capacity-migration`; base of PR #34, #41, #51                                                         | The SQL staging branch. Contains no client code.                                                                                                                                                                                                     | n/a (branch, not a deployable)                                                         |
| `65058a8077ad89f5796151e7eeb539ba7b616d0c`       | PR #41 (OPEN, draft)                                                                                                 | **S3, the reviewed capacity blob**, plus its review documents. Blob `supabase/migrations/20261119090000_group_hard_max.sql`, git blob `a04048e9…`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.                       | Not applicable — this is the migration itself.                                         |
| `551da907305ca07e17e44903858cea1c5f2765f5`       | PR #51 (OPEN, draft)                                                                                                 | The successor **instrument**: six SELECT-only preflight pages plus the Launch-scoped apply gate (frozen Prototype refused with 45003, Launch authorised). Not shipped to users.                                                                      | n/a (evidence tooling)                                                                 |
| `2377046d25509c0c07b0aa2df05196ea20919963`       | PR #52 (OPEN, draft, base the successor branch)                                                                      | **S2 reconciliation** `20261119080000_preblob_reconcile_list_group_recruitment_posts.sql` (blob `2816e842…`, SHA-256 `c4ccc85b…`), the target-relative `A-RPL-06`, the F9 pin record, and the F18/F20 findings. Blob at this head still `5cf0a66a…`. | n/a (contingency migration + tooling)                                                  |
| `a2d041d6a038d3962d98d0280e9e36049d37e33f`       | PR #50 (OPEN, draft)                                                                                                 | The **retired** F2 build-marker client. Superseded by Adam's "new client only" decision; not part of the release.                                                                                                                                    | No — retired.                                                                          |
| `4a493a9a4…`                                     | PR #53 (OPEN, draft, base `main`)                                                                                    | A **second** copy of `docs/team/DECISIONS.md` recording Adam's 13:34/13:44 decisions. Documentation only, no `supabase/` change.                                                                                                                     | n/a (docs)                                                                             |
| `331b7c88429eb8f442a43d4bb18b634431d13b68`       | `docs/citylink-coordinator-evidence-20261122`; head of PR #48                                                        | The coordinator's evidence record: this file, the runbook, the release candidate, the catalog snapshots, every erratum.                                                                                                                              | n/a (docs)                                                                             |
| `6b886bf009d6b103733250b65083ffcdde7b376b`       | **Not on any branch** — the prototype bundle handed to the professor                                                 | Pre-capacity client, three-argument creation, pointed at the Prototype. Not an ancestor of `main`.                                                                                                                                                   | **No.** After S3 it would receive the fail-closed upgrade token.                       |
| `index-VN34B96y.js`, SHA-256 `64688e23a00a8764…` | The live site `clinkdemo-z7jrfxui.manus.space`                                                                       | The bundle actually being served today. Bakes `wkzclgmhrtecnpexfesr`, calls three-argument creation, contains zero capacity markers, and serves no `/version.json`. Its source commit is **not identifiable** from the deployment — that is F22.     | **No.** It points at the Prototype, not Launch.                                        |

**The short answer to "which commit is the release":** the release is a combination, not a single commit — C1 `344c1058` for the client, S1 `20261118083000_stage6_people_page_naming.sql` (blob `70cb7871…`, SHA-256 `75aee3a1…`) from `main`, and S3 `5cf0a66a…4887` from PR #41. S2 `c4ccc85b…` is a contingency that does nothing if S1 runs first.

## 2. Launch today, measured read-only

| Metric                            | Value  | Meaning                                                                          |
| --------------------------------- | ------ | -------------------------------------------------------------------------------- |
| public tables                     | 12     | Full Stage 5/6 schema present                                                    |
| migration ledger rows             | 7      | One short of the repository's 8 — `stage6_people_page_naming` is the missing one |
| `auth.users`                      | 2      | Effectively empty                                                                |
| `profiles`                        | 2      | Effectively empty                                                                |
| `courses`                         | 10     | Seeded                                                                           |
| `study_groups`                    | 0      | No group data at all                                                             |
| `group_memberships`               | 0      | No group data at all                                                             |
| `*_capacity` functions            | 0      | S3 never applied                                                                 |
| `study_groups.max_members`        | absent | S3 never applied                                                                 |
| `group_recruitment_posts.subject` | absent | S1 never applied                                                                 |

So Launch is a clean, empty, pre-row-8 database. There is no user data to preserve, no group to migrate, and nothing that a failed release could destroy — which is the one genuinely favourable fact in this whole plan.

## 3. What "environment and deployment ready" has to mean

Nothing is deployed against Launch today, so this is not a configuration tweak; it is a first deployment. To call the environment ready:

1. **A named hosting target** for the client, separate from the Prototype demo, so the professor's demonstration keeps working untouched.
2. **A build-time configuration** for Launch: `VITE_SUPABASE_URL=https://pijslbchvstkoweslymr.supabase.co` plus the publishable key, supplied through the secure path.
3. **A build from C1 `344c1058`** that demonstrably bakes the Launch ref and `p_max_members` — checkable by grepping the built bundle exactly as I grepped the live one.
4. **A version marker** so the deployed build is identifiable. The live site serves no `/version.json`, which is precisely why F22 could not be answered from the deployment; a release that repeats that mistake will leave the same blind spot.
5. **A smoke test that does not write**: sign in, load the course list, open a group page, confirm the People card renders.

## 4. Cutover timing, as Adam set it

Adam's instruction of 2026-11-23 14:04 is recorded: cutover happens only after the environment is ready and confirmed releasable, and then proceeds in the runbook order with Role 6's re-review. So the sequence is:

1. Environment ready (section 3 items 1–2, plus a C1 build that passes items 3–5 against a preview target if one exists).
2. Role 6 re-review at the exact heads named in section 1.
3. One authorization naming S1, S3, C1 and the QA window.
4. Runbook steps 1–7.

## 5. Two coordination risks I have to flag

**The decision record has forked.** PR #53 carries its own `docs/team/DECISIONS.md` based on `main`, while the evidence branch carries a much longer one. Both are legitimate records of different conversations, but they will conflict when merged, and a reviewer reading only one will see a partial history. This needs one reconciliation pass before either merges — not now, but before release.

**PR #52 moved after I verified it.** I verified `587dec7`; it is now `2377046`, with two documentation commits (the authorised Launch capture, F18 closure, F20, and the pin decision). I re-checked that the blob is still `5cf0a66a…` at the new head, but the new content — in particular the pin values `f150f880…` and `7d50da9e…` recorded as measured on Launch, and F20's statement that the earlier canonical digests do not reproduce — has not been independently verified by me. It should be treated as reported, not confirmed.
