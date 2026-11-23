# CityLink Launch release runbook — prepared 2026-11-23 13:56

Everything here is prepared and nothing is executed. Each step names its exact identity, its expected output, and the condition that stops the run. The authorization block at the end is deliberately narrow enough to be signed without ambiguity.

## Step 0 — two preconditions that do not exist yet

**0a. A deployment target for the client.** Nothing is deployed against Launch today; the only live site is bound to the Prototype with the ref compiled into the bundle. Until a target is named, C1 cannot be deployed anywhere, and the release cannot finish — the SQL steps would leave Launch in a state where the deployed client cannot create groups.

**0b. Browser-safe Launch configuration.** `VITE_SUPABASE_URL=https://pijslbchvstkoweslymr.supabase.co` plus the publishable key for that project, supplied through the secure configuration path. The build bakes them in, exactly as the current live bundle bakes the Prototype ref in. The key is publishable, not secret, but it still must not be pasted into a chat message.

Both are Adam's decisions. Neither can be substituted by the coordinator.

## Step 1 — S1, row 8

Apply `supabase/migrations/20261118083000_stage6_people_page_naming.sql`, git blob `70cb7871…`, SHA-256 `75aee3a19a7910cf24c52e945bb8d38f2676aad387c709eda70e9ff90ac80362`, 747 lines, to `pijslbchvstkoweslymr`.

Expected: exit 0. `group_recruitment_posts` gains `subject` (not null) and `group_recruitment_posts_subject_length_chk`; `list_group_recruitment_posts` returns 14 columns; `create_group_and_invite(uuid,uuid)` is gone and a three-argument form exists; `create_group_recruitment_post` and `edit_group_recruitment_post` become three-argument.

Stop if: any statement errors, or the post-check shows the function still returning 13 columns. Do not continue to Step 3 on a partial state.

## Step 2 — S2, only if Step 1 was skipped

`20261119080000_preblob_reconcile_list_group_recruitment_posts.sql`, blob `2816e842…`, SHA-256 `c4ccc85b0a343fb7…`. After a successful Step 1 this is an idempotent no-op. Include it only if there is a reason Step 1 might not have applied.

## Step 3 — pin capture, inside the window

Capture `P-H1-DIG` and `P-H2-DIG` against Launch now, after Step 1 and before Step 4, because the target's final pre-apply state exists only at this point. Record the values under the run id that will be used for the gate call.

Stop if: the capture cannot be reproduced twice with the same values. An unstable digest is not a pin.

## Step 4 — S3, the reviewed blob, exactly as reviewed

Apply `supabase/migrations/20261119090000_group_hard_max.sql`, blob `a04048e9…`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.

Rules, unchanged and non-negotiable: no `--single-transaction`, no outer `BEGIN`, both timestamps recorded, applied in the same authorized session that produced the Step 3 pin.

Expected: exit 0, zero errors. `study_groups.max_members` exists; three `*_capacity` functions exist; `create_group_and_invite` has both three- and four-argument forms; calling the three-argument form raises `group_capacity_upgrade_required`; public table count unchanged apart from intended additions.

Stop if: any error, or the three-argument call does not raise the upgrade token. A silent success there would mean the fail-closed contract is missing.

## Step 5 — gate call

Call `private.citylink_capacity_apply_gate()` with the declared markers for run id, target `pijslbchvstkoweslymr`, the three pages run, the verdict summary, the Step 3 pins, engine major 17, and the blob identity.

Expected: `group_capacity_gate_satisfied run=… target=pijslbchvstkoweslymr`.

Stop if: any 45001–45009 refusal. Each refusal names its cause; do not proceed and do not retry blindly.

## Step 6 — deploy C1

Build the client from PR #37 head `344c1058e78df2cccfde89574e226f3e65a1457c` with the Step 0b configuration, and deploy to the Step 0a target.

Expected: the deployed bundle calls the four-argument creation RPC and the three `*_capacity` reads.

Stop if: the built bundle contains the Prototype ref, or lacks `p_max_members`.

**Why this step cannot be reordered before Step 4:** the client needs the `*_capacity` functions, which Step 4 creates. **Why it cannot be delayed after Step 4:** Step 4 turns the three-argument creation function into a fail-closed stub, so every pre-capacity client loses group creation the moment it lands. The window between Steps 4 and 6 is the only interval in which nobody can create a group, and it should be minutes, not hours.

## Step 7 — signed-in multi-account QA

Run on Launch, with existing authorized accounts, covering: creation at the 2–19 boundaries; a full group refusing new invitations while pending ones stay pending; the exact labels `Group is full` and `Group maximum is not set`; the two invitation checks in `RELEASE_QA_MINIMUM_CHECKLIST_20261123.md`; and the old-client failure mode — a pre-capacity bundle must see the upgrade message and must not create anything.

Stop if: any write succeeds that the contract says must fail, or any capacity count disagrees between the grouped People card and the roster.

## Rollback stance, stated honestly

There is no rollback. Step 1 and Step 4 are forward-only shape changes; the blob's own design assumes no reverse migration. The only mitigation is that Step 4 is fail-closed: if it errors, it rolls back its own transaction and Launch remains at the Step 1 state, where the deployed old client still works. That is the reason the order is SQL-then-client rather than the reverse.

## Authorization block

> I authorize the CityLink Launch capacity release exactly as set out in `docs/team/RELEASE_RUNBOOK_20261123.md`:
>
> 1. S1 `20261118083000_stage6_people_page_naming.sql` at SHA-256 `75aee3a1…`, applied to `pijslbchvstkoweslymr`.
> 2. S3 `20261119090000_group_hard_max.sql` at SHA-256 `5cf0a66a…4887`, applied exactly as reviewed, after S1, in the same session as the pin capture.
> 3. The pin capture between them, on the same target.
> 4. Client C1 at PR #37 head `344c1058e78df2cccfde89574e226f3e65a1457c`, deployed immediately after S3 to the target named in Step 0a, built with the configuration from Step 0b.
> 5. Signed-in multi-account QA on Launch in the same window.
>
> This authorizes no merge, no publication of the Prototype, and no change to `wkzclgmhrtecnpexfesr`.

## Addendum 2026-11-23 16:00 — revised sequence after Role 6's combined verdict

This addendum supersedes the step order in the body above. It does not change any file fingerprint.
Read it as the operative order; the original text is kept for history.

| #   | Step                          | Exact artefact                                                                                                         | Stop condition                                                                        |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0   | Session preflight             | page 00 identity + engine                                                                                              | target is not `pijslbchvstkoweslymr` or engine is not 17                              |
| 1   | **Data preflight (new, F23)** | the two SELECTs in Role 6 §8, run in this same session                                                                 | either count is non-zero                                                              |
| 2   | S1                            | `20261118083000_stage6_people_page_naming.sql`, blob `70cb7871…`, 747 lines                                            | non-zero exit; S1 is a single transaction so an abort leaves the target unchanged     |
| 3   | Pin capture (F9)              | pages 01/05 evidence, declared values `f150f880…db57`, `7d50da9e…b4d9`                                                 | any declared value empty                                                              |
| 4   | S3                            | blob `a04048e9…` / SHA-256 `5cf0a66a…4887`, applied verbatim, no `--single-transaction`, no outer `BEGIN`              | any error                                                                             |
| 5   | **Gate install (changed)**    | `supabase/migrations/20261123120000_capacity_apply_gate.sql` from PR #54 head — replaces installing the draft document | PR #54 not accepted by Role 6, or migration absent from the ledger afterwards         |
| 6   | Gate call                     | `select private.citylink_capacity_apply_gate();`                                                                       | anything other than `group_capacity_gate_satisfied run=… target=pijslbchvstkoweslymr` |
| 7   | Client                        | the published Launch frontend built from `344c1058e78fd2cccfde89574e226f3e65a1457c`                                    | build id not matching that head                                                       |
| 8   | Signed-in QA                  | QA account `citylink.qa.20261123@example.com` on Launch                                                                | —                                                                                     |

Notes that must survive into execution:

- Step 1 is a **fresh** measurement. The 15:56 result (0 blocking profiles of 3, 0 groups of 0) is
  evidence that the target was clean then, not permission to skip the check.
- Step 5 is now visible to the ledger; the previous plan installed the wrapper from a document, which no
  audit would ever show (Role 6 F24).
- The gate itself only checks declarations; it does not verify the target, the engine or the pin. The
  evidence that this is Launch, on engine 17, with the pinned helpers still comes from pages 00/01/05.
- S2 is **not** in this sequence. It lives on PR #52 head and is a measured no-op once S1 has run; it is
  needed only if S3 were ever applied to a target that had not had S1.
