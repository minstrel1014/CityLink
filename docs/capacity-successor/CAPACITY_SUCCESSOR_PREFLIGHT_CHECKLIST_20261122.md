# CityLink — successor capacity preflight and application record template

**Status: blank template for a future, separately authorized run. Do not fill it
in retroactively from memory, and do not treat a completed template as
authorization for anything.**

This is the record format that makes Adam's helper policy enforceable: the
guard in
`docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql`
either passes or stops the application, and this page is what "stopped" and
"passed" have to look like in writing.

## 0. Preconditions for using this page at all

| Condition            | Requirement                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval recorded    | Adam's 2026-11-22 helper policy, as integrated in the PR #48 evidence branch Section 18                                                                                             |
| Exact SQL head       | `supabase/migrations/20261119090000_group_hard_max.sql` blob `a04048e90d6b64c692f03c722b9eea2849058aab`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` |
| Exact successor head | the branch head recorded in §1, which must contain this page unchanged                                                                                                              |
| Recipe pinned        | §2 shows a pinned normalization recipe and expected digests; while G4 is unpinned, no application may be requested                                                                  |
| Target               | disposable Test `wkzclgmhrtecnpexfesr` only. Main is out of scope and the guard refuses it                                                                                          |
| Authorization        | a separate, explicit Adam authorization naming the exact SQL head and the exact target, recorded before execution                                                                   |
| Fresh review         | exact-head Role 6 review still current for the guard and the reviewed blob, plus Roy/Jeffery client-contract confirmation and Eunice's independent read                             |

## 1. Run header (operator fills in)

| Field                                                      | Value                  |
| ---------------------------------------------------------- | ---------------------- |
| Date and time (with timezone)                              |                        |
| Executor task and human lead                               |                        |
| Adam authorization reference                               |                        |
| Authorized target ref                                      | `wkzclgmhrtecnpexfesr` |
| Connector/target identity confirmed out-of-band (who, how) |                        |
| Successor branch head                                      |                        |
| Reviewed blob object id re-verified                        |                        |
| Runner used (session, tool, role)                          |                        |
| Transaction form actually used                             |                        |
| Session user returned by the catalog                       |                        |

## 2. Recipe pinning (must be complete before any application request)

| Item                                                          | Value                                                     | Pinned by |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| Normalization input scope                                     | `pg_get_functiondef(<helper oid>)`                        |           |
| Comment-stripping rule                                        |                                                           |           |
| Whitespace rule                                               |                                                           |           |
| Token-spacing rule                                            |                                                           |           |
| Case folding                                                  |                                                           |           |
| Trailing-semicolon handling                                   |                                                           |           |
| Digest encoding                                               | `encode(sha256(convert_to(<normalized>, 'utf8')), 'hex')` |           |
| Pinned browse digest (Test)                                   |                                                           |           |
| Pinned manage digest (Test)                                   |                                                           |           |
| Same values observed on Main (read-only, for comparison only) |                                                           |           |
| Coordinator canonical values still match?                     | yes / no / recipe-differs                                 |           |
| If "recipe-differs": recorded reconciliation                  |                                                           |           |

Rules for this section:

- Both targets must agree with each other **under the same pinned recipe**.
  Agreement under two different recipes proves nothing.
- If the pinned value differs from the coordinator's canonical value, that is
  an unresolved discrepancy and a stop, not a licence to relax the recipe.
- A recipe change that makes a mismatch disappear is exactly the failure mode
  this page exists to prevent. Record the rejected variant if one is tried.

## 3. Guard run (Test)

Run the guard first, inside the authorized read-only path. Record the outcome.

| Check | Meaning if it fails                                                                                                  | Result | Observed evidence |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| G1    | target not pinned, unknown, or Main                                                                                  |        |                   |
| G2    | term model or a base table missing                                                                                   |        |                   |
| G3    | helper signature, ownership, `SECURITY DEFINER`, empty `search_path`, or browser/service-role revoke posture differs |        |                   |
| G4    | normalized helper body does not match the pinned digest                                                              |        |                   |
| G5    | capacity objects already partly present                                                                              |        |                   |
| G6    | row-8 subject contract or a legacy read output set differs from the reviewed shape                                   |        |                   |
| G7    | a signature the reviewed file replaces is missing, or the two-argument create is still present                       |        |                   |
| G8    | runner cannot legally replace or create what the reviewed file needs                                                 |        |                   |
| G9    | `study_groups` posture or the max-member constraint is in an unexplained state                                       |        |                   |
| G10   | invitation-integrity guard attachment state contradicts the reviewed premise                                         |        |                   |
| G11   | capture only: ledger versions, default privileges, explicit ACL count                                                |        | n/a               |

Token returned on failure: `group_capacity_prerequisite_mismatch` /
`group_capacity_prerequisite_unpinned` / `group_capacity_main_out_of_scope`.

## 4. Decision point

| Outcome                                  | Required action                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any pinned check failed                  | **Stop.** No capacity DDL. Report which track owns the failure (capacity DDL / row-8 promotion / grant normalization / ledger repair). Never "fix" it inside capacity work |
| G4 unpinned                              | **Stop.** Return to §2. Do not substitute a whitespace-insensitive comparison for the pinning step                                                                         |
| All pinned checks passed and §2 complete | The application may be _requested_, only under Adam's separate Test-only authorization naming the exact SQL head                                                           |
| Anything unexpected during the run       | **Stop** and record it. An unexplained difference is a finding, not noise to average away                                                                                  |

## 5. Application (only after an explicit Adam authorization)

| Step                                                          | Record |
| ------------------------------------------------------------- | ------ |
| Guard re-run immediately before, same session, same target    |        |
| Application started (timestamp)                               |        |
| Exact file applied, byte-identical, blob id re-verified first |        |
| Runner output tail (errors, warnings, notices)                |        |
| Transaction outcome (committed or aborted)                    |        |
| Elapsed time                                                  |        |
| Any statement that behaved differently from the review        |        |

## 6. Post-application verification

| Verification                                               | Expected                                                                                                                    | Result |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| Three `_capacity` names exist with the reviewed signatures | `list_course_group_summaries_capacity`, `list_current_term_course_groups_capacity`, `list_group_recruitment_posts_capacity` |        |
| Three legacy read names keep their reviewed output sets    | five, six and fourteen columns as in G6                                                                                     |        |
| Three-argument create still fails closed                   | `group_capacity_upgrade_required`, SQLSTATE `45000`                                                                         |        |
| Four-argument create exists                                | `create_group_and_invite(uuid,uuid,text,integer)`                                                                           |        |
| `max_members` column and 2–19 check exist                  | nullable column, guarded check constraint                                                                                   |        |
| Invitation/request/accept/approve paths enforce capacity   | per Option A contracts                                                                                                      |        |
| Helper posture unchanged from §3 G3/G4                     | identical                                                                                                                   |        |
| No unexpected object created or dropped                    |                                                                                                                             |        |
| Client build/version marker path still matches F2 contract |                                                                                                                             |        |

Runtime behaviour (real calls, sessions, concurrency) is **Eunice's separately
authorized signed-in Test QA** and is never inferred from this table.

## 7. What this template never establishes

- Not that Test or Main was touched: this template is blank by design.
- Not that any migration was applied.
- Not that RLS, Auth, ACLs, concurrency or client behavior work.
- Not merge, ready, deployment, publication or release.
- Not permission to remove the compatibility stub or legacy wrappers; cleanup
  needs new explicit Adam approval after the reviewed evidence conditions, and
  elapsed time alone never authorizes it.

## Adam's next action(s):

1. **[Decision] Authorize the bounded read-only recipe-pinning dry run** (this
   page §2) against disposable Test `wkzclgmhrtecnpexfesr`, with Main compared
   only inside its existing read-only boundary. Expected: pinned normalization
   scope plus the two helper digests recorded here. Unblocks: any Test capacity
   preflight and every later application request.
2. **[Decision] Confirm the two-step guarded sequence** (read-only guard, then
   the byte-identical reviewed file) instead of a new atomic successor head that
   inlines the guard and would need a fresh exact-head SQL review.
3. **[Decision] Confirm Main stays outside the capacity plan** until row-8
   promotion and grant normalization are each separately decided.
