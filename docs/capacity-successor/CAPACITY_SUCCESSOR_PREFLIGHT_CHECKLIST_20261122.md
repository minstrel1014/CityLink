# CityLink — successor capacity preflight and application record template

**Status: blank template for a future, separately authorized run. Do not fill it
in retroactively from memory, and do not treat a completed template as
authorization for anything. It has never been filled in: Role 6's authorized
read-only _identity capture_ has since run against the frozen Prototype (package
doc §11.4), but no page has been executed against any project. A connector being
enabled does not authorize a run.**

- Instrument of record: `docs/capacity-successor/preflight/` pages 00–05 plus
  `90_apply_gate_wrapper_DRAFT.sql`. Design rationale and finding dispositions
  live in
  `docs/capacity-successor/CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md`
  ("the package doc").
- Retired instrument: the DO-block guard
  `20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql` was deleted,
  not repaired. It is recoverable at `bc6a6d5` and must not be run.
- Prepared by: Role 6 continuity task (human name TBD; no human authorship is
  attributed to this document).

## 0. Preconditions for using this page at all

| Condition            | Requirement                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval recorded    | Adam's 2026-11-22 helper policy and the 22:04 instrument-shape decision (option b: SELECT-only pages plus a thin refusal wrapper)                                                                                                                  |
| Exact SQL head       | `supabase/migrations/20261119090000_group_hard_max.sql` blob `a04048e90d6b64c692f03c722b9eea2849058aab`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`                                                                |
| Exact successor head | the PR #51 head recorded in §1, which must contain these pages unchanged                                                                                                                                                                           |
| Recipe pinned        | §2 complete; while `P-H1-DIG`/`P-H2-DIG` read `UNPINNED`, no application may be requested                                                                                                                                                          |
| Target               | CityLink Launch `pijslbchvstkoweslymr` only (F14, Adam 2026-11-23 01:50). The frozen Prototype `wkzclgmhrtecnpexfesr` is out of scope and the wrapper refuses it with `group_capacity_gate_target_out_of_scope` (45003); any other ref draws 45004 |
| Engine major         | 17 on the target (Adam's 22:04 decision: Test 17.11.0.011, Main 17.11.0.003); page 00 `C-MAJ-01` and page 05 `P-ENG-01` must agree                                                                                                                 |
| Authorization        | a separate, explicit Adam authorization naming the exact SQL head and the exact target, recorded before execution                                                                                                                                  |
| Fresh review         | exact-head Role 6 review still current for the pages, the wrapper and the reviewed blob, plus Roy/Jeffery client-contract confirmation and Eunice's independent read                                                                               |

## 1. Run header (operator fills in)

| Field                                                 | Value                                    |
| ----------------------------------------------------- | ---------------------------------------- |
| Run id (declare as `citylink.capacity_run_id`)        |                                          |
| Date and time, start and end (with timezone)          |                                          |
| Executor task and human lead                          |                                          |
| Adam authorization reference                          |                                          |
| Authorized target ref                                 | `pijslbchvstkoweslymr` (CityLink Launch) |
| Target ref read from the tool's own response          |                                          |
| Target display name / status as reported              |                                          |
| Connector/tool used (no credential value recorded)    |                                          |
| Successor branch head                                 |                                          |
| Reviewed blob object id re-verified                   |                                          |
| Engine major / full version (`C-MAJ-01` / `C-MAJ-02`) |                                          |
| Database (`C-DB-03`)                                  |                                          |
| Session user / current user (`C-USR-04` / `C-USR-05`) |                                          |
| Locale collate / ctype (`C-LOC-07`)                   |                                          |
| Encoding (`C-ENC-08`)                                 |                                          |
| Session `search_path` verbatim (`C-CFG-06`)           |                                          |
| Transaction form actually used                        |                                          |
| Raw output storage location for every page            |                                          |

## 2. Recipe pinning (must be complete before any application request)

The recipe is published in package doc §6 and echoed by page 05 rows
`P-RCP-06`/`P-RCP-07`: strip `--.*` with flags **`gn`**, collapse whitespace, drop
spaces around `( ) , ;`, `lower`, `btrim`, then
`encode(sha256(convert_to(<normalized>, 'utf8')), 'hex')`. Do not substitute
another recipe; a different recipe is a different pin.

| Item                                                                  | Value                                                   | Observed |
| --------------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| Input scope declared                                                  | `pg_get_functiondef(<helper oid>)` on the target        |          |
| browse helper OID (`P-H1-OID`)                                        | recorded                                                |          |
| browse `pg_get_functiondef` chars / octets (`P-H1-LEN`)               | recorded                                                |          |
| browse normalized digest (`P-H1-DIG`)                                 | recorded verbatim, never rounded or abbreviated         |          |
| browse empty-`search_path` verdict (`P-H1-CFG`)                       | PASS required                                           |          |
| browse ACL posture (`P-H1-ACL`)                                       | recorded                                                |          |
| manage helper OID (`P-H2-OID`)                                        | recorded                                                |          |
| manage `pg_get_functiondef` chars / octets (`P-H2-LEN`)               | recorded                                                |          |
| manage normalized digest (`P-H2-DIG`)                                 | recorded verbatim                                       |          |
| manage empty-`search_path` verdict (`P-H2-CFG`)                       | PASS required                                           |          |
| manage ACL posture (`P-H2-ACL`)                                       | recorded                                                |          |
| Two consecutive executions identical?                                 | yes required (pages write nothing, so this is expected) |          |
| Value declared into `citylink.capacity_pinned_digests`                | `<browse hex>,<manage hex>`                             |          |
| Coordinator canonical values (`5991901a…` / `5e88d56b…`) still match? | yes / no / recipe-differs                               |          |
| If "recipe-differs": recorded reconciliation                          |                                                         |          |

Rules for this section:

- A `UNPINNED` digest row is **not** a pass and must never be transcribed as one.
- Do not mix digest families (package doc §6.2). The coordinator's canonical live
  values, the historical checked-in-file values (`9206e208…` / `1158da30…`) and
  Role 6's local fixture values (`f150f880…` / `7d50da9e…`) are three different
  input scopes. Only a digest produced by page 05 **on the authorized target**
  with the published recipe may be declared here.
- If the target's digests differ from a previously recorded pin, stop and record
  the pair; that is drift evidence for review, not a licence to relax the recipe.
  A recipe change that makes a mismatch disappear is exactly the failure mode this
  page exists to prevent. Record the rejected variant if one is tried.
- Main may be compared only inside its existing read-only boundary and only under
  the same pinned recipe; agreement under two different recipes proves nothing.

## 3. Preflight run (authorised target)

Run each page as its own statement batch, in this order, and attach the raw
output rather than summarising it.

| Page | File                                     | Required?           | Rows                        | FAIL | UNPINNED | Raw output at |
| ---- | ---------------------------------------- | ------------------- | --------------------------- | ---- | -------- | ------------- | --- |
| 00   | `00_target_identity_and_engine.sql`      | yes                 | 18                          |      |          |               |
| 01   | `01_track_a_capacity_prerequisites.sql`  | yes                 | 56                          |      |          |               |
| 02   | `02_track_b_row8_promotion.sql`          | if Track B in scope | 17                          | n/a  |          |               |
| 03   | `03_track_c_grant_posture_survey.sql`    | if Track C in scope | 33                          | n/a  |          |               |
| 04   | `04_track_d_ledger_identity_capture.sql` | if Track D in scope | 4 (+1 per recorded version) |      |          |               |     |
| 05   | `05_helper_pinning_record.sql`           | yes                 | 17                          |      |          |               |

Page 04 note: run statement 2 **only** if statement 1 reports the ledger table
present; statement 2 is parse-time dependent on that table existing.

Page 01 stop conditions (any one stops the run):

- [ ] `A-TAB-*` any `FAIL` — term-model or study-group objects missing.
- [ ] `A-COL-01`/`A-COL-02` any `FAIL` — row-8 dependency absent (Track B).
- [ ] `A-COL-03` any `FAIL` — `study_groups.max_members` already present, so this
      is not a first forward application.
- [ ] `A-HLP-*` any `FAIL` — helper existence, ownership, `SECURITY DEFINER`,
      empty `search_path` or browser/service-role `EXECUTE` posture differs from
      the reviewed state.
- [ ] `A-CAP-*` any `FAIL` — a capacity object already exists; do not re-apply.
- [ ] `A-RPL-01..05` any `FAIL`, or `A-RPL-06` `FAIL` — the replaced-signature set
- [ ] `A-RPL-01..05` any `FAIL`, or `A-RPL-06` `FAIL` — the replaced-signature set
      is not what the blob expects. **Caveat for the re-scoped target (F16):**
      these expectations were derived from the frozen Prototype's state. Per the
      reported project state the two-argument create is _absent_ on the Prototype
      and _present_ on CityLink Launch, while `A-RPL-06` asserts absence — so on
      the authorised target that row is expected to FAIL. Treat it as a question
      to re-derive from the target's own captured rows, never as a row to relax in
      place, and never as a licence to edit the expectation to match.
- [ ] `A-LGC-01/03/05` any `FAIL` — a legacy read result shape is not the released
      shape the blob re-declares.
- [ ] `A-RUN-01/02` any `FAIL` — the executing role cannot legally replace or
      create what the reviewed file needs.
- [ ] `A-TRG-01` any `FAIL` — the reviewed guard function is not present at all.
- [ ] `A-TRG-02` any `FAIL` — the invitation-integrity guard is **not exactly the one
      attachment recorded in the pin** (package doc §14). The observed string says
      which case applies: `count=0` is a dropped guard, `count=2` or more is a
      re-attachment or duplicate, and `count=1` with a mismatched identity is a
      rename, retarget or retiming. Every one of these is a stop for review. Do not
      edit the pin to make the row pass: the pin is evidence-derived, and a target
      that disagrees with it is a finding for Adam, not an inconvenience.
- [ ] `A-TRG-03` differs between the pre-apply capture and the post-apply re-run —
      a trigger change across the apply. Stop and record both strings verbatim.

Marker declaration (same session, copied from the captured output only):

| Marker                                | Value declared | Source row |
| ------------------------------------- | -------------- | ---------- |
| `citylink.capacity_run_id`            |                | §1         |
| `citylink.capacity_target_ref`        |                | §1         |
| `citylink.capacity_pages_run`         |                | §3         |
| `citylink.capacity_preflight_verdict` |                | §3         |
| `citylink.capacity_pinned_digests`    |                | §2         |
| `citylink.capacity_engine_major`      |                | `C-MAJ-01` |
| `citylink.capacity_blob_identity`     |                | §0         |

Gate call: `select private.citylink_capacity_apply_gate();`

- [ ] Returned `group_capacity_gate_satisfied run=… target=…` — record the **whole
      message** verbatim. Per Adam's 2026-11-23 rule, a record that drops the
      `target=` context is not evidence and cannot support an apply request.
- [ ] Refused — record token, SQLSTATE **and the emitted `target=` context**
      verbatim (45001 and 45002 carry no ref, because none was declared); do not
      re-declare markers until the underlying cause is understood: `_____________`

## 4. Decision point

| Outcome                                         | Required action                                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any page row `FAIL`                             | **Stop.** No capacity DDL. Report which track owns the failure (capacity DDL / row-8 promotion / grant normalization / ledger repair). Never "fix" it inside capacity work |
| Any row `UNPINNED` in pages 00, 01 or 05        | **Stop.** Return to §2 or declare the marker from evidence. Do not substitute a whitespace-insensitive comparison for the pinning step                                     |
| Wrapper refused                                 | **Stop.** The refusal token is the finding; a re-declaration that makes it disappear is not a fix                                                                          |
| Every required row PASS/CAPTURE and §2 complete | The application may be _requested_, only under a separate Adam authorization naming the exact SQL head and the exact target (now CityLink Launch)                          |
| Anything unexpected during the run              | **Stop** and record it. An unexplained difference is a finding, not noise to average away                                                                                  |

## 5. Application (only after an explicit Adam authorization)

| Field                                                                       | Value |
| --------------------------------------------------------------------------- | ----- |
| Pages re-run immediately before, same session, same target                  |       |
| Wrapper returned satisfaction in that same session                          |       |
| Application started (timestamp, local + UTC)                                |       |
| Exact file applied, byte-identical, blob id re-verified first               |       |
| `--single-transaction` used? (**must be NO** — F10)                         |       |
| Outer `BEGIN`/`COMMIT` added? (**must be NO** — F10)                        |       |
| Reason: the file carries its own `begin;` at `:39` and `commit;` at `:1756` |       |
| Runner and exact command line                                               |       |
| Exit status                                                                 |       |
| Application completed (timestamp, local + UTC)                              |       |
| Elapsed time                                                                |       |
| Runner output tail (errors, warnings, notices) quoted separately            |       |
| Transaction outcome (committed or aborted)                                  |       |
| Any statement that behaved differently from the review                      |       |
| Intervening manual change to the target between §3 and §5? (must be none)   |       |

## 6. Post-application verification

Re-run pages 00, 01 and 05 in the same session, and record before/after:

| Check                                                    | Expected after application                                                                                                  | Before | After |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `A-COL-03` (`max_members` clean slate)                   | now reports the column present; the FAIL becomes the reviewed state                                                         |        |       |
| `A-CAP-01..09` (capacity functions absent)               | now present with the reviewed signatures                                                                                    |        |       |
| `A-CAP-11`/`A-CAP-12` (capacity table/constraint absent) | now present (`group_removal_context`, `study_groups_max_members_chk`)                                                       |        |       |
| `A-RPL-01..06` (replacement signatures)                  | four-argument `create_group_and_invite(uuid,uuid,text,integer)` exists; three-argument stub still fails closed              |        |       |
| `A-LGC-01/03/05` (legacy read shapes)                    | five, six and fourteen columns as reviewed                                                                                  |        |       |
| Three `_capacity` read names                             | `list_course_group_summaries_capacity`, `list_current_term_course_groups_capacity`, `list_group_recruitment_posts_capacity` |        |       |
| Three-argument create behaviour                          | `group_capacity_upgrade_required`, SQLSTATE `45000` — unchanged                                                             |        |       |
| `A-TRG-02` (invitation guard identity)                   | still `PASS` against the same pin; identity string unchanged                                                                |        |       |
| `A-TRG-03` (attachment set capture)                      | **byte-identical** to the pre-apply capture: no addition, no removal                                                        |        |       |
| `P-H1-DIG` / `P-H2-DIG`                                  | identical to §2                                                                                                             |        |       |
| `D-LDG-10` (recorded ledger versions)                    | recorded and compared against package doc §13 — **recorded, not repaired** (Track D needs its own Adam authorization)       |        |       |

- [ ] No new `FAIL` row appeared anywhere.
- [ ] Raw output of every re-run stored at: `______________________`

Runtime behaviour (real calls, signed-in sessions, concurrency, full/pending
transitions) is **Eunice's separately authorized signed-in Test QA** and is never
inferred from this table.

## 7. What this template never establishes

- Not that Test or Main was touched: this template is blank by design, and Role 6
  contacted no project database while writing it.
- Not that any migration was applied.
- Not that RLS, Auth, ACLs, concurrency or client behaviour work.
- Not merge, ready, deployment, publication or release.
- Not permission to remove the compatibility stub or the legacy read wrappers;
  cleanup needs new explicit Adam approval after the reviewed evidence conditions
  are met, and elapsed time alone never authorizes it.
- The wrapper is an operator-facing record, not a security control. It reads only
  operator-declared markers, performs no catalog observation, and must never be
  described as a substitute for RLS, ownership or Adam's authorization.
- A locally reproduced digest is not a Test pin (package doc §6.2).
- A locally derived trigger identity is not a target-verified pin: `A-TRG-02`'s pin
  comes from `supabase/schema.sql` and a disposable 17.12 rehearsal, and the trigger
  on Test or Main has only ever been **counted** (1 and 1), never named. Confirm the
  identity read-only on the authorized target before treating the pin as verified
  (package doc §11.4, §14).

## 8. Fail-closed token quick reference

Token names and message shapes below are the strings measured from the wrapper on
PostgreSQL 17.12 (package doc §10.8). They previously omitted the `_gate_` segment
from 45002 onward — finding F15 — which would have made every recorded refusal
disagree with the runner output.

| Token                                     | SQLSTATE | Meaning as emitted                                                                                                  |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `group_capacity_gate_run_undeclared`      | 45001    | no run id declared (no ref to carry yet, so the message is bare)                                                    |
| `group_capacity_gate_target_undeclared`   | 45002    | no target ref declared (the message cannot name a ref that was never declared)                                      |
| `group_capacity_gate_target_out_of_scope` | 45003    | `target=<ref>`: declared target is the frozen Prototype (out of scope since F14)                                    |
| `group_capacity_gate_target_unauthorized` | 45004    | `target=<ref>`: declared target is not CityLink Launch, the only authorised target                                  |
| `group_capacity_gate_pages_incomplete`    | 45005    | `target=<ref>`: pages 00, 01 or 05 not declared as run                                                              |
| `group_capacity_gate_verdict_unsatisfied` | 45006    | `target=<ref>`: declared verdict is not a satisfaction statement                                                    |
| `group_capacity_gate_pin_unrecorded`      | 45007    | `target=<ref>`: pin missing, malformed, or an `UNPINNED` placeholder                                                |
| `group_capacity_gate_engine_unconfirmed`  | 45008    | `target=<ref>`: declared engine major is not 17                                                                     |
| `group_capacity_gate_artifact_unverified` | 45009    | `target=<ref>`: declared blob identity is not the reviewed pair                                                     |
| `group_capacity_gate_satisfied`           | —        | `run=<id> target=<ref>`: the satisfaction row; the ref has been carried here since the reshape head                 |
| `group_capacity_upgrade_required`         | 45000    | **client-facing** stale-contract signal inside the reviewed blob; never a preflight signal and never to be remapped |

## Adam's next action(s):

1. **[Action — first blocker] Enable the Supabase connector on the task that must
   record §2**, so the two helper digests can be pinned on the authorized target
   instead of staying `UNPINNED`.
2. **[Decision] Confirm this template matches the run you intend to authorize** —
   required pages, marker vocabulary, the gate call, the F10 transaction
   prohibition and the two application timestamps are all load-bearing here.
3. **[Confirmation — no action if you agree] Confirm Main stays outside the
   capacity plan** until row-8 promotion (Track B) and grant normalization
   (Track C) are each separately decided.
