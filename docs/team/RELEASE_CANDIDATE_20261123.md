# Coordinated release candidate — assembled 2026-11-23 13:48

Assembled by the coordinator at Adam's request: client PR #37 plus row 8, the reconciliation and the blob. This is a candidate and a proposed order, not an authorisation. Every fingerprint below was read from the remote at assembly time.

## Components

| #   | Component                    | Exact identity                                                                                                                    | What it is                                                                                                                                                             |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Client                       | PR #37 head `344c1058e78df2cccfde89574e226f3e65a1457c` (OPEN, draft, base `main`, 92 files, MERGEABLE)                            | Capacity-aware client: calls four-argument creation with `p_max_members`, reads the three `*_capacity` functions, renders `Group is full` / `Group maximum is not set` |
| S1  | Row 8                        | `supabase/migrations/20261118083000_stage6_people_page_naming.sql`, blob `70cb7871…`, SHA-256 `75aee3a19a7910cf…`, 747 lines      | Adds `subject` + `subject_length_chk`, drops and recreates `list_group_recruitment_posts` with 14 columns, drops two-argument `create_group_and_invite`                |
| S2  | Reconciliation (contingency) | `20261119080000_preblob_reconcile_list_group_recruitment_posts.sql`, blob `2816e842…`, SHA-256 `c4ccc85b0a343fb7…`                | Idempotent no-op after S1; only does work if S1 was skipped                                                                                                            |
| S3  | Reviewed blob                | `20261119090000_group_hard_max.sql`, blob `a04048e9…`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` | The reviewed capacity migration: `max_members`, three `*_capacity` functions, four-argument creation, fail-closed three-argument stub                                  |

## Proposed order, and why each step depends on the last

1. **S1 — row 8.** Everything downstream assumes the 14-column read shape and the `subject` column. Without it, S3 aborts with 42P13.
2. **S2 — optional.** After S1 it is a no-op. Schedule it only if S1 might be skipped; otherwise keep it as a documented contingency and leave it out of the window.
3. **Pin capture — inside the window, after S1 and before S3.** `P-H1-DIG`/`P-H2-DIG` are `UNPINNED`, so the gate refuses with 45007 by design. The pin must be taken on the target's final pre-apply state, which only exists at this point.
4. **S3 — the reviewed blob, exactly as reviewed.** No `--single-transaction`, no outer `BEGIN`; record both timestamps. The Launch-scoped wrapper should then return `group_capacity_gate_satisfied run=… target=pijslbchvstkoweslymr`.
5. **C1 — deploy the client immediately afterwards.** This ordering is forced, not stylistic: S3 makes the three-argument function a fail-closed stub, so every pre-capacity client loses group creation the moment S3 lands, and only C1 can use the four-argument path and the `*_capacity` reads. Browsing survives on the legacy wrappers; creation does not.
6. **Signed-in multi-account QA on Launch**, including the two invitation checks recorded in `RELEASE_QA_MINIMUM_CHECKLIST_20261123.md`.

## What must be true before this can run

- **A hosting target for Launch.** None exists. The live site is bound to the Prototype with the ref compiled into the bundle, and `/version.json` is 404 there, so even the marker mechanism is not deployed anywhere.
- **Browser-safe Launch configuration.** `VITE_SUPABASE_URL` and the publishable key for `pijslbchvstkoweslymr` have never been recorded. The build needs them; they must be supplied through the secure configuration path, never pasted into chat.
- **Fresh exact-head reviews** of C1, S1 and S3 at the heads named above, and of the Launch-scoped gate at PR #51 head `551da90`.
- **One authorization that names all four**: the SQL heads (S1, S3, and S2 only if used), the client head (C1), the target ref (Launch), and the QA window.

## Explicit non-claims

Nothing here is merged, applied, deployed or published. PR #37 and PR #51 are both draft. The blob has not been applied to any project. The candidate exists so that the release review has exact identities to review rather than a description of intent.
