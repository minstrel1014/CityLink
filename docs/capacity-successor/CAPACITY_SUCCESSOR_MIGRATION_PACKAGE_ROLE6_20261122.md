# CityLink — Role 6 successor capacity-migration package (draft for review)

**Status: DRAFT REVIEW ARTIFACT. Nothing in this package is a migration that may
be applied, and nothing here is authorization.**

- Prepared by: Role 6 continuity task (database security and migration review;
  the human name for Role 6 is still TBD — no human authorship is attributed to
  this document).
- Prepared on: 2026-11-22, from the independently verified PR #41 docs head
  `65058a8077ad89f5796151e7eeb539ba7b616d0c`.
- Authority implemented: Adam's 2026-11-22 decisions (helper policy, Stage 6
  Main option C, file-5 supersession, "no live client uses Main", F2 owner/QA
  split) and the finite successor-drafting assignment.
- Live evidence used: the coordinator's authorized metadata-only parity record
  `docs/team/CITYLINK_TEST_MAIN_METADATA_PARITY_COORDINATOR_20261122.md`.
  Role 6 performed **zero** database access while drafting this package.
- Companion artifacts in this package:
  - `docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql`
  - `docs/capacity-successor/CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md`

---

## 1. What this package is, and the one thing it deliberately is not

The reviewed capacity DDL stays exactly where it is. The single forward-only
capacity migration remains:

| Property        | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| File            | `supabase/migrations/20261119090000_group_hard_max.sql`            |
| Git blob        | `a04048e90d6b64c692f03c722b9eea2849058aab`                         |
| Content SHA-256 | `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` |
| Structure       | one explicit transaction: `begin;` at `:39`, `commit;` at `:1756`  |

This successor package adds the **per-target prerequisite guard and the ordered
application procedure** around that unchanged blob. It is deliberately _not_ a
second copy of the capacity DDL. Duplicating 1,756 reviewed lines into a new
migration file would create two authorities for the same schema and would make
every future review ambiguous about which copy is canonical — that would weaken,
not strengthen, the reviewed Option A contract. If a reviewer ever needs a
single-file "successor migration" that also contains the DDL, that is a new
design decision for Adam, and it requires a fresh exact-head Role 6 review of
the copy, because a copied DDL is a new DDL.

Consequently this package changes no `supabase/` byte. That is provable and is
recorded in §9.

## 2. Evidence classes used in this document

| Class                       | Meaning in this package                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Reported live               | Coordinator-performed SELECT-only catalog results quoted from the parity record. Not re-verified here.                             |
| Statically reviewed         | Facts read from the exact head `65058a8` in this task's own worktree (line anchors, signatures, transaction structure, languages). |
| Independently computed here | Deterministic offline normalizations and statement scans run in this sandbox (no database).                                        |
| Draft engineering           | Guard logic, procedure order and check inventory. Unexecuted; not verified against any target.                                     |

No item in this package is "live-verified by Role 6", "applied", "tested",
"merged" or "released".

## 3. Four tracks stay separate (Adam's approved constraint)

| Track                                                 | Content                                                                                       | This package                                                             | Gate that must come first                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| A — capacity DDL                                      | The reviewed `20261119090000` blob and its Option A contracts                                 | Kept byte-identical; guarded, never restated                             | Exact-head review, recipe pinning, authorized Test preflight, separate Test-only application authorization              |
| B — historical Main row-8 / people-page promotion     | `20261118083000_stage6_people_page_naming.sql` objects that Main never received               | Asserted as a _prerequisite_, never promoted here                        | Adam decision naming the exact target and SQL head                                                                      |
| C — Main RPC grant and broader security normalization | `anon`/`service_role` effective-grant drift, `handle_new_user()` service-role execute on Main | Detected and reported; never remedied inside capacity DDL                | Fresh exact-head security review plus a new explicit Main-write authorization (Main is read-only until official launch) |
| D — migration-ledger identity repair                  | Reconciling recorded ledger versions with repository files                                    | Read-only capture only; no `supabase migration repair` in any draft here | Explicit Adam authorization; it is metadata work, not capacity work                                                     |

The guard refuses to bundle B, C or D: it contains no DDL, no `grant`, no
`revoke`, no `alter`, no `drop`, no `comment`, no data statement. Its only side
effect on a target is raising an exception.

## 4. Per-target eligibility

### 4.1 Disposable Test `wkzclgmhrtecnpexfesr` — designable now, not authorized

Per the reported parity facts, Test already satisfies the prerequisites the
reviewed blob depends on: the two Stage 6 private helpers exist with
`postgres` ownership, `SECURITY DEFINER`, empty `search_path`, and no browser
or `service_role` `EXECUTE`; the row-8 subject contract and the
`(uuid,uuid,text)` create overload exist; no capacity object exists yet. The
guard's Test profile asserts each of those again immediately before any future
application.

### 4.2 Main `pijslbchvstkoweslymr` — structurally ineligible for this blob

Two static findings, both derived from the exact head plus the reported Main
state, mean the reviewed blob must not be applied to Main:

1. **Return-type collision.** Main's released
   `list_group_recruitment_posts(uuid, timestamptz, uuid, integer)` result
   includes no `subject` column (it is the Stage 6 shape, defined without
   `subject`). The reviewed blob re-declares that same name with an extra
   `subject text` output column (`:1714`) and selects `legacy.subject`
   (`:1735`). PostgreSQL does not allow `CREATE OR REPLACE FUNCTION` to change a
   function's return type, so that statement fails on Main. The file is one
   transaction (`:39`/`:1756`), so the failure aborts the whole application —
   fail-closed, but not usable.
2. **Deferred plpgsql dependency.** The capacity read
   `list_group_recruitment_posts_capacity` is `language plpgsql` (`:1510`) and
   its body selects `p.subject` (`:1532`) from
   `public.group_recruitment_posts`, a column Main does not have. plpgsql bodies
   are not validated against the schema at creation, so this specific statement
   would not protect Main by itself; the failure would surface only at first
   call. That asymmetry is exactly why the guard pins the read _shapes_ rather
   than trusting a successful creation.

Also relevant: the blob drops the two-argument
`create_group_and_invite(uuid, uuid)` at `:245`. Main still has exactly that
overload, so application to Main would delete the only create RPC Main
currently has. Test already dropped it through row 8, so the same statement is
a no-op there.

Conclusion: the successor sequence is **Test-only**. Any Main capacity path
first requires Track B (row-8 promotion) and Track C (grant normalization)
decisions by Adam. Under the current boundary Main is read-only, and the guard
aborts immediately if it is pointed at Main's ref.

## 5. The prerequisite guard: design

File: `20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql`.

Operating principles:

- **Target pinning is mandatory and refuses Main.** The operator must set
  `citylink.capacity_preflight_target` to the exact disposable Test ref named in
  Adam's authorization. An unset value fails closed; Main's ref fails with a
  distinct token, because a copy-paste of a ref must never silently retarget a
  write.
- **Unpinned checks fail rather than pass.** Several checks compare a live value
  against a constant that Role 6 cannot honestly fix from the repository alone.
  Until an authorized dry run pins them, the guard raises
  `group_capacity_prerequisite_unpinned` instead of reporting success. A guard
  that is green by omission is worse than no guard.
- **All failures are reported at once.** Checks accumulate, then a single
  `RAISE EXCEPTION 'group_capacity_prerequisite_mismatch'` with the full detail
  list, so one preflight pass produces one complete record.
- **Read-only by construction.** Only catalog `SELECT`s, `RAISE NOTICE` capture
  and the final `RAISE EXCEPTION`. No application row, secret, credential or
  setting _value_ is read; only existence and structural properties.

Check inventory (IDs are used by the checklist):

| ID  | Class        | Asserts                                                                                                                                                                                |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | pinned       | Session is pointed at the authorized disposable Test ref; Main refuses                                                                                                                 |
| G2  | pinned       | Term-model objects exist (`academic_terms`, `citylink_settings`, `courses.term_id` NOT NULL)                                                                                           |
| G3  | pinned       | Both private helpers exist with exactly one implementation, `postgres` owner, `SECURITY DEFINER`, empty `search_path`, and `EXECUTE` false for `anon`, `authenticated`, `service_role` |
| G4  | **unpinned** | Normalized helper body digest equals the operator-supplied expected pair (see §6)                                                                                                      |
| G5  | pinned       | Capacity objects are absent (this is a first forward application, not a double apply)                                                                                                  |
| G6  | pinned       | Row-8 dependency present: `group_recruitment_posts.subject` NOT NULL, and the three legacy read result shapes equal the shapes the blob re-declares                                    |
| G7  | pinned       | The four replaced write RPCs and the three-argument create overload exist with the expected argument types                                                                             |
| G8  | pinned       | The executing role can legally replace every function the blob replaces (ownership/membership)                                                                                         |
| G9  | pinned       | `private` schema exists and its owner/usage posture is captured without change                                                                                                         |
| G10 | pinned       | Invitation-integrity guard state matches the reviewed assumption (the reviewed draft leaves `enforce_invitation_integrity()` unattached; an attached trigger is a stop for review)     |
| G11 | capture-only | Recorded migration-ledger versions and default-privilege posture are printed for the record; no identity is assumed and nothing is repaired (Track D)                                  |

## 6. The normalization-recipe gap, stated plainly

The parity record gives canonical SHA-256 values for the two helper bodies:

```text
can_browse_current_term_group: 5991901a35dcf8480e807091a105dde3cd8f88a3881a032f1820bd1d3a61b3fc
can_manage_recruitment_post:   5e88d56bce2d575a5df97a39bd609746499b0fa4981e6632af6ebbfb25d2d1b5
```

They were produced by normalizing `pg_get_functiondef` output — comments,
whitespace and token spacing. The exact implementation of that normalization
(comment-stripping rule, case folding, spacing set, trailing semicolon handling)
is **not recorded in the packet**, so it cannot be re-executed from the
repository alone.

To show why that matters, this task applied a drafted candidate recipe to the
checked-in statement text of the same two helpers:

```text
can_browse_current_term_group: 9206e208b5632b094e42a2f1ecb52e787639fc45f8c3e3e48aed37757c7f7a2a
can_manage_recruitment_post:   1158da30dd4461e43e1f2b8eff2d3cde6084f25183a5b1bf9a8ac6f4f9e70f64
```

These differ from the canonical values, and that difference is **expected and is
not evidence of drift**: the hashed input scope differs (checked-in statement
text vs `pg_get_functiondef` output, which reformats and re-quotes). The lesson
is that a digest assertion is only meaningful when the recipe _and its input
scope_ are pinned. Therefore:

- the candidate recipe above is recorded as a starting point, not as a gate;
- the guard's G4 check requires the operator to pass the expected digests
  explicitly and fails closed when they are not pinned;
- pinning is a bounded, read-only dry-run task for the coordinator (or whoever
  Adam authorizes), performed on both targets so the comparison is
  target-to-target and target-to-checked-in-source, and recorded in the
  checklist before any application is requested.

Until G4 is pinned, no capacity application should be requested.

## 7. Sequence decision and why it is safe

Chosen arrangement: the guard lives under `docs/capacity-successor/`, carries a
migration-style timestamp (`20261122180000`) so its intended order is legible,
and is **not** added to `supabase/migrations/`.

Why a later timestamp but no `supabase/migrations/` placement:

1. **Fresh Test capacity application.** The only migration that changes schema
   is the reviewed `20261119090000` blob. Application is a named, explicit
   sequence — guard first, then that one file — not a directory push. Ordering
   by filename is therefore irrelevant to correctness, and the guard is not
   recorded as if it were DDL.
2. **Test's existing Stage 6 helpers and row-8 state.** The guard _asserts_ that
   state (G3, G6, G7) and never redefines it. Had the guard been promoted as
   `20261119085959` to sort before the blob, it would have created an
   out-of-order ledger version — Supabase records versions as execution
   timestamps, and introducing a version older than an already-applied one is
   exactly the kind of ledger ambiguity that Track D exists to clean up, not to
   grow.
3. **Main's existing Stage 6 state and absent row-8 state.** Because the guard
   is not in the replay set, no tool can pull it into an unintended Main
   operation, and §4.2 keeps Main out of the plan entirely. Adding any new file
   to `supabase/migrations/` while both targets' ledgers are unreconciled would
   enlarge the blind-replay surface that this project has already ruled unsafe
   for both targets.
4. **Rollback-free forward-only behavior.** The package contains no
   `drop`/`rollback`/undo logic. A failed guard raises and applies nothing; a
   failed capacity application aborts inside the blob's own single transaction
   (`:39`/`:1756`). Nothing needs to be reversed, and the guard's forward-only
   precondition (G5: capacity objects absent) makes a second application attempt
   stop rather than silently "fix" a half-applied target.

Residual sequencing limit, recorded honestly: the guard and the capacity DDL are
two steps, not one atomic statement, because the reviewed blob may not be
modified to embed them. The compensating controls are that the guard is
read-only, the DDL is self-contained in one transaction, and the checklist
requires the guard result and the application to be recorded in the same
authorized run with no intervening manual change. If Adam prefers a single
atomic unit, that means a new successor SQL head (a copy of the DDL with the
guard inlined) plus a fresh exact-head review — a decision, not a draft detail.

Recommended name if and when a separately authorized successor ever needs a
migration filename: keep the capacity file's name unchanged and record the guard
as an executed script, not a version. There is intentionally no pending
migration file to replay.

## 8. Option A preservation

Adam's approved Option A semantics are unchanged by this package, and the guard
actively protects them:

| Approved contract                                                    | Where it lives                                                                                                                                        | How the successor protects it                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Three-argument `create_group_and_invite` fails closed                | blob `:387`, `raise exception 'group_capacity_upgrade_required'` with `errcode '45000'` at `:398`–`:399`, `security invoker`, `set search_path to ''` | Not restated, not weakened; the stub keeps its current shape while capacity work waits                                                     |
| Hard maximum 2–19, never unlimited                                   | blob `:46` column, `:57`–`:58` constraint, `:178`–`:179` and `:215`–`:224` leader checks                                                              | Guard G5 requires capacity objects absent, so a partial or duplicate state can never be mistaken for the reviewed one                      |
| Manual removal only, never auto-remove                               | blob `:1056` `remove_group_member`, `:989` cancellation helper                                                                                        | Untouched                                                                                                                                  |
| Old read names keep released shapes                                  | blob `:1289` (5 columns), `:1448` (6 columns), `:1704` (14 columns incl. `subject`)                                                                   | Guard G6 compares live `pg_get_function_result` shapes before application, and §4.2 shows how a shape mismatch blocks an ineligible target |
| New capacity data only through `_capacity` names                     | blob `:1187`, `:1318`, `:1484`                                                                                                                        | Names and signatures unchanged; no new read name introduced by this package                                                                |
| Stale-client message and refresh posture                             | approved string `CityLink needs an update. Refresh before creating a group.`                                                                          | Client-side and owned by Roy; this package adds no reload, retry or storage recovery                                                       |
| Full/unset block invitations and applications, pending stays pending | blob `:100` `assert_group_has_capacity`, `:141`–`:147`                                                                                                | Unchanged; server authority stays mandatory                                                                                                |

The distinct guard tokens (`group_capacity_prerequisite_mismatch`,
`group_capacity_prerequisite_unpinned`, `group_capacity_main_out_of_scope`) are
operator-facing preflight signals. They are not client contracts and must not be
mapped to the upgrade-required affordance.

## 9. Validation actually performed for this package

- `git status --short --branch` on a fresh worktree at exactly `65058a8…`;
  `git fetch origin`; `git log -1 --oneline origin/main` (`1a583e3`);
  `git ls-remote` confirmed the required start head and that no successor branch
  existed beforehand.
- `git diff 65058a8… HEAD -- supabase` → zero bytes; the reviewed blob is still
  `a04048e90d6b64c692f03c722b9eea2849058aab` with SHA-256
  `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.
- `git diff --check` → clean. Prettier 3.6.2 → pass on the Markdown files in
  this package.
- Static offline scan of the guard draft: statement/dollar-quote structure,
  and confirmation that it contains no `create`, `alter`, `drop`, `grant`,
  `revoke`, `insert`, `update`, `delete`, `truncate`, `call` or `select into`
  outside its read-only catalog queries and RAISE statements.
- Not done, and not claimed: any parse or execution against PostgreSQL, any
  Supabase call, any Test or Main inspection, and therefore any proof that the
  guard compiles or behaves as intended on a target.

## 10. What this package cannot prove

- It does not prove the guard is syntactically valid PL/pgSQL; only a real
  (authorized, read-only) dry run can.
- It does not prove the live state of either target; §4 restates reported
  coordinator findings plus static repository analysis.
- It does not establish signed-in behavior, RLS outcomes, concurrency, PostgREST
  error mapping or client recovery; those belong to Eunice's separately
  authorized multi-account Test QA.
- It does not authorize anything: not application, not Test write, not Main
  write, not merge, not ready, not deployment, not publication, not stub or
  legacy-wrapper cleanup.

## 11. Open items for the coordinator and owners

1. Pin the G4 normalization recipe and expected digests through one authorized
   read-only dry run, then record them in the checklist.
2. Confirm how the future application will be executed (single named file
   versus directory push) and record the transaction assumption.
3. Roy: confirm the group-creation client path still matches the reviewed
   four-argument call and the fail-closed stub mapping, with no new token added
   by this package.
4. Jeffery: confirm the recruitment and group-card read paths still use only the
   reviewed legacy names plus `_capacity` names, and that the `subject`
   dependency in §4.2 is acceptable for the Test-only plan.
5. Eunice: confirm the checklist's stop conditions are independently checkable
   and that G10's trigger assumption is testable in her future QA scope.
6. Adam: the two real decisions are whether to pin G4 by authorizing a read-only
   dry run, and whether a single atomic successor head is wanted instead of the
   guarded two-step sequence in §7.

## Adam's next action(s):

1. **[Decision — first blocker] Authorize one bounded read-only dry run to pin
   the helper normalization recipe and expected digests (G4).** Target:
   disposable Test `wkzclgmhrtecnpexfesr` (and optionally the same SELECT-only
   expression on Main under its read-only boundary). Expected: the two canonical
   digests reproduced from a stated recipe plus input scope, recorded in
   `docs/capacity-successor/CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md`.
   Unblocks: any Test capacity preflight or application request.
2. **[Decision] Choose the sequencing shape:** keep the two-step guarded
   sequence that leaves the reviewed blob byte-identical (§7, recommended), or
   order a new atomic successor SQL head that inlines the guard, which requires a
   fresh exact-head Role 6 review of the copied DDL. Unblocks: the successor
   review request and PR #37 alignment.
3. **[Decision — Main path] Confirm that Main stays out of the capacity plan**
   until Track B (row-8 promotion) and Track C (grant normalization) are each
   separately decided, since §4.2 shows the reviewed blob cannot apply to Main
   as written.
4. **[Confirmation — no action if you agree] Confirm the Test-only application
   executor and its transaction assumption** (§11 item 2) so the application
   record can state exactly how the guard and the single named migration run.
5. **[Delegable] Direct the coordinator to route §11 items 3–5 to Roy, Jeffery
   and Eunice** as finite read-only reviews of this package at its exact head.
