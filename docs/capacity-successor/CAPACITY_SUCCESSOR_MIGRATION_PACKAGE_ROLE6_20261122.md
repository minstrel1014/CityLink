# CityLink — Role 6 successor capacity-migration package (draft for review)

**Status: DRAFT REVIEW ARTIFACT. Nothing in this package is a migration that may
be applied, and nothing here is authorization. The instrument described here has
been executed only against Role 6's own disposable, data-free local PostgreSQL 17
cluster. It has never been run against Test or Main.**

- Prepared by: Role 6 continuity task (database security and migration review;
  the human name for Role 6 is still TBD — no human authorship is attributed to
  this document).
- Prepared on: 2026-11-22, from the independently verified PR #41 docs head
  `65058a8077ad89f5796151e7eeb539ba7b616d0c`; this revision is the reshape
  directed by Adam's 2026-11-22 22:04 decisions and is delivered as a normal
  fast-forward child of `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`.
- Authority implemented: Adam's 2026-11-22 decisions (helper policy, Stage 6
  Main option C, file-5 supersession, "no live client uses Main", F2 owner/QA
  split), the finite successor-drafting assignment, Adam's Stage 4 adversarial
  review findings, and the 22:04 instrument-shape decision: **option (b)** —
  SELECT-only preflight pages plus a thin refusal wrapper, not a PL/pgSQL
  DO-block guard.
- Live evidence used: the coordinator's authorized metadata-only parity record
  `docs/team/CITYLINK_TEST_MAIN_METADATA_PARITY_COORDINATOR_20261122.md`.
  Role 6 performed **zero** access to Supabase Test or Main while drafting and
  validating this package.
- Companion artifacts in this package:
  - `docs/capacity-successor/preflight/README.md` — index, verdict vocabulary,
    construction rules, run order.
  - `docs/capacity-successor/preflight/00_target_identity_and_engine.sql`
  - `docs/capacity-successor/preflight/01_track_a_capacity_prerequisites.sql`
  - `docs/capacity-successor/preflight/02_track_b_row8_promotion.sql`
  - `docs/capacity-successor/preflight/03_track_c_grant_posture_survey.sql`
  - `docs/capacity-successor/preflight/04_track_d_ledger_identity_capture.sql`
  - `docs/capacity-successor/preflight/05_helper_pinning_record.sql`
  - `docs/capacity-successor/preflight/90_apply_gate_wrapper_DRAFT.sql`
  - `docs/capacity-successor/CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md`
- Retired by this revision: the 608-line DO-block guard
  `docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql`
  is deleted rather than repaired. It is not a reviewed artifact, was never
  executed against any project target, and remains recoverable verbatim at
  `bc6a6d5`. Its eleven checks are carried forward as the observation rows and
  wrapper markers listed in §5, with the traceability map in §5.4.

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

This successor package adds the **per-target prerequisite observation pages and
the ordered application procedure** around that unchanged blob. It is
deliberately _not_ a second copy of the capacity DDL. Duplicating 1,756 reviewed
lines into a new migration file would create two authorities for the same schema
and would make every future review ambiguous about which copy is canonical — that
would weaken, not strengthen, the reviewed Option A contract. If a reviewer ever
needs a single-file "successor migration" that also contains the DDL, that is a
new design decision for Adam, and it requires a fresh exact-head Role 6 review of
the copy, because a copied DDL is a new DDL.

Consequently this package changes no `supabase/` byte. That is provable and is
recorded in §10.

## 2. Evidence classes used in this document

| Class                       | Meaning in this package                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reported live               | Coordinator-performed SELECT-only catalog results quoted from the parity record. Not re-verified here.                                                                                                   |
| Statically reviewed         | Facts read from the exact head in this task's own worktree (line anchors, signatures, transaction structure, languages).                                                                                 |
| Independently computed here | Deterministic offline normalizations and statement scans run in this sandbox (no database).                                                                                                              |
| Executed locally on PG 17   | Every page and the wrapper were run twice against a data-free, disposable local PostgreSQL 17.12 cluster. Proves parse validity, syntax, determinism and fail-closed behaviour of the instrument itself. |
| Not executed                | Any run against Test `wkzclgmhrtecnpexfesr` or Main `pijslbchvstkoweslymr`. The authorized read-only Test dry run was **blocked**: the Supabase connector is not enabled in this task (§11.1).           |

No item in this package is "live-verified by Role 6", "applied", "tested against
a project target", "merged" or "released".

## 3. Four tracks stay separate (Adam's approved constraint)

| Track                                                 | Content                                                                                       | This package                                                            | Gate that must come first                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A — capacity DDL                                      | The reviewed `20261119090000` blob and its Option A contracts                                 | Kept byte-identical; observed, never restated                           | Exact-head review, recipe pinning, authorized Test preflight, separate Test-only application authorization              |
| B — historical Main row-8 / people-page promotion     | `20261118083000_stage6_people_page_naming.sql` objects that Main never received               | Observed on page 02, never promoted here                                | Adam decision naming the exact target and SQL head                                                                      |
| C — Main RPC grant and broader security normalization | `anon`/`service_role` effective-grant drift, `handle_new_user()` service-role execute on Main | Observed on page 03 (capture only), never remedied inside capacity DDL  | Fresh exact-head security review plus a new explicit Main-write authorization (Main is read-only until official launch) |
| D — migration-ledger identity repair                  | Reconciling recorded ledger versions with repository files                                    | Observed on page 04 (capture only); no `supabase migration repair` here | Explicit Adam authorization; it is metadata work, not capacity work                                                     |

Each track has its own page and its own check-id prefix (`A-`, `B-`, `C-`,
`D-`), so one track's result can never be read as another's. The pages contain no
DDL, no `grant`, no `revoke`, no `alter`, no `drop`, no `comment`, no data
statement and no writing function call. Their only output is a result set. The
single raising instrument in this package is the operator-facing refusal wrapper
(§5.3), which by design performs no catalog reads of its own.

## 4. Per-target eligibility

### 4.1 Disposable Test `wkzclgmhrtecnpexfesr` — designable now, not authorized

Per the reported parity facts, Test already satisfies the prerequisites the
reviewed blob depends on: the two Stage 6 private helpers exist with `postgres`
ownership, `SECURITY DEFINER`, empty `search_path`, and no browser or
`service_role` `EXECUTE`; the row-8 subject contract and the `(uuid,uuid,text)`
create overload exist; no capacity object exists yet. Pages 00, 01 and 05 observe
each of those again immediately before any future application, and the wrapper
refuses to report satisfaction unless the operator declares them.

### 4.2 Main `pijslbchvstkoweslymr` — structurally ineligible for this blob

Two static findings, both derived from the exact head plus the reported Main
state, mean the reviewed blob must not be applied to Main:

1. **Return-type collision.** Main's released
   `list_group_recruitment_posts(uuid, timestamptz, uuid, integer)` result
   includes no `subject` column (it is the Stage 6 shape, defined without
   `subject`). The reviewed blob re-declares that same name with an extra
   `subject text` output column (`:1714`) and selects `legacy.subject` (`:1735`).
   PostgreSQL does not allow `CREATE OR REPLACE FUNCTION` to change a function's
   return type, so that statement fails on Main. The file is one transaction
   (`:39`/`:1756`), so the failure aborts the whole application — fail-closed,
   but not usable.
2. **Deferred plpgsql dependency.** The capacity read
   `list_group_recruitment_posts_capacity` is `language plpgsql` (`:1510`) and its
   body selects `p.subject` (`:1532`) from `public.group_recruitment_posts`, a
   column Main does not have. plpgsql bodies are not validated against the schema
   at creation, so this specific statement would not protect Main by itself; the
   failure would surface only at first call. That asymmetry is exactly why page
   01 observes the read _shapes_ (`A-LGC-01/03/05` gate on them, `A-LGC-02/04/06`
   capture the full rendering) rather than trusting a successful creation.

Also relevant: the blob drops the two-argument `create_group_and_invite(uuid,
uuid)` at `:245`. Main still has exactly that overload, so application to Main
would delete the only create RPC Main currently has. Test already dropped it
through row 8, so the same statement is a no-op there. Page 01 checks both sides
of that: `A-RPL-01..05` require the expected overloads present, `A-RPL-06`
requires the two-argument overload absent.

Conclusion: the successor sequence is **Test-only**. Any Main capacity path first
requires Track B (row-8 promotion) and Track C (grant normalization) decisions by
Adam. Under the current boundary Main is read-only, and the wrapper refuses
outright with `target_out_of_scope` if its declared target ref is Main's.

## 5. The instrument: SELECT-only pages plus a thin refusal wrapper

### 5.1 Construction rules the pages obey

These are the rules Adam's 22:04 decision set, restated as the shipped contract,
and each one was checked mechanically (§10.5) on every page:

- **SELECT-only.** No `INSERT`/`UPDATE`/`DELETE`/`MERGE`, no DDL, no
  `GRANT`/`REVOKE`, no `CALL`, no writing function call, no `SET`, no
  `SECURITY DEFINER` creation. Statement-leading banned keywords: zero.
- **No `DO` block and no `RAISE`** anywhere in pages 00–05. A page that cannot
  decide reports a verdict label in a row; it never aborts, so one pass always
  produces one complete record instead of the first failure hiding the rest.
- **No temporary object.** Nothing is created, so nothing can be left behind and
  every page is safe to run twice (§10.4 shows byte-identical output).
- **No `::regclass` cast.** Presence tests use the NULL-returning
  `to_regclass` / `to_regprocedure` / `to_regnamespace` / `to_regrole`, so a
  missing object yields NULL rather than an error. Occurrences: zero.
- **No comparison against a hard-coded `search_path` literal.** Settings are
  captured verbatim, and `proconfig` entries are compared only after splitting
  each entry at its first `=` and stripping quoting, so the empty-`search_path`
  case is decided by the normalization contract in §6, not by string shape.
  `SELECT … INTO`: zero; literal `search_path='…'` comparisons: zero.
- **Every query is one runnable statement with an explicit `LIMIT`** and selects
  only the columns the row needs. No `select *`, no unbounded scan.
- **Catalog and privilege metadata only** (`pg_proc`, `pg_class`,
  `pg_constraint`, `pg_index`, `pg_attrdef`, `pg_namespace`, `pg_roles`,
  `pg_db_role_setting`, `pg_default_acl`, `pg_policy`,
  `pg_seclabel`/`shseclabel`, `pg_auth_members`, `pg_shdepend`,
  `pg_get_functiondef`, `pg_get_function_result`, `has_*_privilege`,
  `current_setting`, `version()`). No application row is read by any page.
- **Shared output shape**, so pages can be concatenated into one record:
  `page, check_id, subject, expected, observed, verdict`.
- **Verdict vocabulary:** `PASS` (a stated expectation is met), `FAIL` (a stated
  expectation is not met), `CAPTURE` (value recorded for the operator, no
  expectation to assert), `UNPINNED` (an expectation exists but Role 6 could not
  honestly fix its constant from the repository, or the operator has not declared
  it). **`UNPINNED` is never a `PASS`,** and the wrapper treats it as unsatisfied.
- Check ids are unique within each page and do not collide across pages
  (measured in §10.3); the `page` column makes every label globally unambiguous.

### 5.2 Page inventory

| Page | File                                     | Rows | Prefix | Observes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------- | ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00   | `00_target_identity_and_engine.sql`      | 18   | `C-`   | Engine major (`C-MAJ-01` expects 17), full version, database, `session_user`/`current_user`, collate/ctype/encoding, Supabase-shape rows (`C-SBA-*`), and a verbatim echo of each of the seven operator markers (`C-MRK-12..18`) — `UNPINNED` when a marker is undeclared.                                                                                                                                                                                             |
| 01   | `01_track_a_capacity_prerequisites.sql`  | 55   | `A-`   | Track A gating observations: ten term-model/study-group tables (`A-TAB-*`), three column facts (`A-COL-*`), the two helper postures in seven fields each (`A-HLP-1-*`, `A-HLP-2-*`), nine capacity-absence signatures plus table and constraint (`A-CAP-*`), six replaced-signature checks (`A-RPL-*`), six legacy read-shape checks and renderings (`A-LGC-*`), three runner-legality/ownership rows (`A-RUN-*`), and the invitation-trigger premise (`A-TRG-01/02`). |
| 02   | `02_track_b_row8_promotion.sql`          | 17   | `B-`   | Row-8 objects as the engine renders them (`B-FUN-*`), the overload inventory (`B-INV-*`), column rendering including defaults (`B-COL-*`), the subject CHECK list (`B-CHK-01`) and the create-overload count (`B-CNT-01`). Capture-only: Track B is Adam's decision, not this package's.                                                                                                                                                                               |
| 03   | `03_track_c_grant_posture_survey.sql`    | 33   | `C-`   | Per-object ACL rendering (`C-FUN-*`), role identity (`C-ROL-*`), ten effective-EXECUTE rows (`C-EXE-*`), schema posture (`C-SCH-*`), default-ACL rendering and count (`C-DFA-*`), RLS policy counts and `relrowsecurity` flags (`C-POL-*`). Deliberately capture-only; `aclexplode` is not used, because a mis-read ACL expansion must not become a silent gate.                                                                                                       |
| 04   | `04_track_d_ledger_identity_capture.sql` | 5    | `D-`   | Statement 1 (4 rows, runnable anywhere): ledger table identity, its columns as this engine sees them, its schema, and the explicit limit note that repository filenames are **not** readable from SQL. Statement 2 (1 row per recorded version, `limit 100`): verbatim recorded versions — run only when statement 1 reports the table present, because the second statement is parse-time dependent.                                                                  |
| 05   | `05_helper_pinning_record.sql`           | 17   | `P-`   | The G4 pinning instrument: engine major, locale/ctype, encoding, identity fields, session `search_path` capture, the recipe identity and input-scope declaration (`P-RCP-06/07`), and per helper the OID, `pg_get_functiondef` length in chars and octets, the normalized digest, the empty-`search_path` proconfig verdict and the ACL posture (`P-H1-*`, `P-H2-*`). Digits are compared only against the operator-declared pin; no pin is baked in.                  |
| 90   | `90_apply_gate_wrapper_DRAFT.sql`        | n/a  | n/a    | The refusal wrapper (§5.3). The only raising instrument in the package.                                                                                                                                                                                                                                                                                                                                                                                                |

Row totals were measured, not estimated: 145 observation rows across the six
pages.

### 5.3 The thin refusal wrapper

`private.citylink_capacity_apply_gate()` (one screen, `language plpgsql`,
security invoker, `set search_path = ''`). It is a **reader of operator
declarations, not an observer of the schema**: it re-derives no prerequisite and
performs no catalog check, so it cannot drift out of agreement with the pages, and
it cannot be satisfied by a schema that merely looks convenient. Absent,
malformed or unparseable declarations all refuse.

Markers read (each `citylink.*` custom GUC, declared in the same authorized
session that ran the pages):

| Marker                                | Declares                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `citylink.capacity_run_id`            | this preflight run's identifier, echoed back on success                  |
| `citylink.capacity_target_ref`        | the exact project ref the operator believes they are on                  |
| `citylink.capacity_pages_run`         | comma-separated page numbers executed, and must include `00`, `01`, `05` |
| `citylink.capacity_preflight_verdict` | the operator's summary verdict for the declared run                      |
| `citylink.capacity_pinned_digests`    | `<browse hex>,<manage hex>` — the §6 pin                                 |
| `citylink.capacity_engine_major`      | the engine major confirmed by page 00/05, expected `17`                  |
| `citylink.capacity_blob_identity`     | `<blob id>:<sha256>` of the SQL actually about to be applied             |

Refusal tokens, each with its own SQLSTATE — distinct by design from the
client-facing `group_capacity_upgrade_required` (blob `:398`–`:399`, `45000`), so
an operator-facing preflight signal can never be mapped onto the stale-client
affordance:

| Token                                | SQLSTATE | Refuses when                                                            |
| ------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `group_capacity_gate_run_undeclared` | 45001    | no run id declared                                                      |
| `group_capacity_target_undeclared`   | 45002    | no target ref declared                                                  |
| `group_capacity_target_out_of_scope` | 45003    | declared target is Main's ref                                           |
| `group_capacity_target_unauthorized` | 45004    | declared target is any other ref than the authorized Test ref           |
| `group_capacity_pages_incomplete`    | 45005    | pages 00, 01 or 05 not declared as run                                  |
| `group_capacity_verdict_unsatisfied` | 45006    | declared verdict is not a satisfaction statement                        |
| `group_capacity_pin_unrecorded`      | 45007    | pin missing, malformed, or an `UNPINNED` placeholder                    |
| `group_capacity_engine_unconfirmed`  | 45008    | declared engine major is not 17                                         |
| `group_capacity_artifact_unverified` | 45009    | declared blob identity is not the reviewed `a04048e9…`/`5cf0a66a…` pair |

Success returns the single row
`group_capacity_gate_satisfied run=<id> target=<ref>`. It is not a security
control and not a substitute for RLS or for Adam's authorization; it is the
fail-closed record that the declared preflight happened, on the declared target,
against the declared artifact.

### 5.4 Traceability to the retired guard

| Retired guard check              | Carried forward as                                                           |
| -------------------------------- | ---------------------------------------------------------------------------- |
| G1 target pinning                | page 00 `C-DB-03`, `C-USR-04/05`, `C-MRK-12..18` + wrapper 45002/45003/45004 |
| G2 term-model objects            | page 01 `A-TAB-01..10`, `A-COL-01/02`                                        |
| G3 helper posture                | page 01 `A-HLP-1-*`, `A-HLP-2-*`                                             |
| G4 digest pinning                | page 05 `P-H1-DIG`, `P-H2-DIG` + wrapper 45007                               |
| G5 capacity absent               | page 01 `A-CAP-01..09`, `A-CAP-11`, `A-CAP-12`                               |
| G6 row-8 dependency              | page 01 `A-COL-02`, `A-LGC-01/03/05` (gate) and `A-LGC-02/04/06` (capture)   |
| G7 replaced signatures           | page 01 `A-RPL-01..06`                                                       |
| G8 runner legality               | page 01 `A-RUN-01..03`                                                       |
| G9 `private` posture             | page 00 `C-SBA-11`, page 03 `C-SCH-01/02`                                    |
| G10 trigger premise              | page 01 `A-TRG-01/02`                                                        |
| G11 ledger + default ACL capture | page 04 `D-LDG-*`, page 03 `C-DFA-01/02`                                     |

## 6. The published normalization contract

Adam's Stage 4 finding F6 was that a digest assertion is meaningless unless the
recipe **and its input scope** are pinned. The recipe is now published, in SQL,
inside page 05, and echoed by `P-RCP-06/07`.

**Input scope:** the `pg_get_functiondef(p.oid)` text of the helper as returned by
the authorized target engine at that session's defaults — not the file bytes, not
a `pg_dump` excerpt.

**Five rules, in this order:**

1. `regexp_replace(src, '--.*', '', 'gn')` — remove `--` comments. **The `n` flag
   is mandatory** (see F12 below).
2. `regexp_replace(x, '[[:space:]]+', ' ', 'g')` — collapse every whitespace run
   to one space.
3. `regexp_replace(x, ' *([(),;]) *', '\1', 'g')` — drop spaces around `( ) , ;`.
4. `lower(x)` — case-fold.
5. `btrim(x)` — remove the leading/trailing space that rule 1 can expose when a
   comment line is stripped.

Digest: `encode(sha256(convert_to(normalized, 'utf8')), 'hex')`.

**When a legitimate change will not trip the pin:** added or removed `--`
comments, indentation and line breaks, keyword case, spaces around `(`, `)`, `,`
and `;`.

**When it will trip the pin (correctly):** any changed or added token —
identifiers, quoted literals, operators other than the four listed, a changed
return type, an added `SET` clause, a redefined body — because all of those
survive into the normalized text.

### 6.1 F12 — the finding this reshape produced itself

On PostgreSQL, in `regexp_replace(src, '--.*', '', 'g')` the `.` **does match a
newline** unless the `n` flag is set. Without `n`, the first `--` inside a body
silently removes everything after it from the hashed input, producing a stable,
reproducible, **wrong** digest: two functions with different bodies can share a
digest, and one function can hash differently from itself depending on whether a
comment appears above the interesting code.

Measured on 17.12 by re-creating one function name in three states (identical
name is deliberate; the name is part of the pinned input):

| State | Body                                 | `gn` (published)              | `g` only (the drafted mistake) |
| ----- | ------------------------------------ | ----------------------------- | ------------------------------ |
| A     | comment line plus irregular spacing  | `3a9b59cb…e07677`             | truncated-input digest         |
| B     | same code, no comment, plain spacing | `3a9b59cb…e07677` — same as A | same as A and B                |
| C     | one token changed                    | `f1746022…b83bb` — differs    | differs                        |

Under the published flags A and B hash identically (a comment cannot trip the
pin) and C differs (a token change does trip it). Under `g`-only, A hashes apart
from B purely because its comment swallowed the rest of the body — exactly the
silent failure this package must not ship. Rule 5 was added for the same reason:
comment removal plus collapse can leave a leading or trailing space, which also
moves the digest.

### 6.2 Three input scopes, three digest families — do not mix them

| Class                        | Source of hashed input                                                                                                                     | browse helper digest | manage helper digest | Status                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | -------------------- | -------------------------------------------------------------------- |
| Canonical live (coordinator) | `pg_get_functiondef` on Test and Main, recipe not recorded                                                                                 | `5991901a…1b3fc`     | `5e88d56b…d2d1b5`    | Reported live; recipe unpublishable, so not re-executable by Role 6. |
| Checked-in file text         | repository statement text, candidate recipe                                                                                                | `9206e208…7a2a`      | `1158da30…70f64`     | Historic illustration of the F6 gap only.                            |
| Fixture-engine rendering     | `pg_get_functiondef` on Role 6's local PG 17.12, published recipe, helpers created from the verbatim Stage 6 text (`:133–156`, `:160–191`) | `f150f880…c6db57`    | `7d50da9e…68b4d9`    | **Local instrument validation only. Not a Test pin.**                |

The Test pin is the fourth value that does not exist yet: it must be produced by
an authorized read-only run of page 05 **on Test itself**, recorded verbatim with
its engine version, locale, encoding, `session_user`, lengths and digests, and
then declared through `citylink.capacity_pinned_digests`. Until then page 05's
`P-H1-DIG`/`P-H2-DIG` rows read `UNPINNED — no expected digest declared` and the
wrapper refuses with `group_capacity_pin_unrecorded`. That is the intended state,
not a defect.

## 7. Sequence decision and why it is safe

Chosen arrangement: the pages and the wrapper live under
`docs/capacity-successor/preflight/`, are **not** added to
`supabase/migrations/`, and the reviewed blob stays the only file that changes
schema.

Why pages carry no migration-style timestamp and no `supabase/migrations/`
placement:

1. **Fresh Test capacity application.** The only migration that changes schema is
   the reviewed `20261119090000` blob. Application is a named, explicit sequence —
   pages first, the wrapper second, that one file third — not a directory push.
   Ordering by filename is therefore irrelevant to correctness, and observation
   queries are never recorded as if they were DDL.
2. **Test's existing Stage 6 helpers and row-8 state.** The pages _observe_ that
   state (`A-HLP-*`, `A-LGC-*`, `A-RPL-*`) and never redefine it. Had any
   prerequisite artifact been promoted with an out-of-order version such as
   `20261119085959`, Supabase would have recorded a version older than an
   already-applied one — exactly the ledger ambiguity Track D exists to clean up,
   not to grow.
3. **Main's existing Stage 6 state and absent row-8 state.** Because the pages are
   not in the replay set, no tool can pull them into an unintended Main operation,
   and §4.2 keeps Main out of the plan entirely. Adding any new file to
   `supabase/migrations/` while both targets' ledgers are unreconciled would
   enlarge the blind-replay surface this project has already ruled unsafe for both
   targets.
4. **Rollback-free forward-only behavior.** The package contains no
   `drop`/`rollback`/undo logic. The pages write nothing, so a failed observation
   needs no reversal; a failed capacity application aborts inside the blob's own
   single transaction (`:39`/`:1756`); and `A-CAP-*` makes a second application
   attempt stop rather than silently "fix" a half-applied target.

Residual sequencing limit, recorded honestly: preflight and application are two
steps, not one atomic statement, because the reviewed blob may not be modified to
embed them. The compensating controls are that the pages are read-only, the DDL is
self-contained in one transaction, and §9 requires the page record, the wrapper
result and the application to be recorded in the **same authorized session** with
no intervening manual change. If Adam prefers a single atomic unit, that means a
new successor SQL head (a copy of the DDL with the checks inlined) plus a fresh
exact-head review — a decision, not a draft detail.

## 8. Option A preservation

Adam's approved Option A semantics are unchanged by this package, and the pages
actively protect them:

| Approved contract                                                    | Where it lives                                                                                                                                        | How the successor protects it                                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-argument `create_group_and_invite` fails closed                | blob `:387`, `raise exception 'group_capacity_upgrade_required'` with `errcode '45000'` at `:398`–`:399`, `security invoker`, `set search_path to ''` | Not restated, not weakened; the stub keeps its current shape while capacity work waits. The wrapper's tokens are separate (§5.3).                           |
| Hard maximum 2–19, never unlimited                                   | blob `:46` column, `:57`–`:58` constraint, `:178`–`:179` and `:215`–`:224` leader checks                                                              | `A-CAP-11`/`A-CAP-12` require the capacity table and constraint absent, so a partial or duplicate state can never be mistaken for the reviewed one          |
| Manual removal only, never auto-remove                               | blob `:1056` `remove_group_member`, `:989` cancellation helper                                                                                        | Untouched; `A-CAP-*` records the removal-context and cancellation signatures as absent prerequisites only                                                   |
| Old read names keep released shapes                                  | blob `:1289` (5 columns), `:1448` (6 columns), `:1704` (14 columns incl. `subject`)                                                                   | `A-LGC-01/03/05` gate live `pg_get_function_result` shapes against those exact column sets, and §4.2 shows how a shape mismatch blocks an ineligible target |
| New capacity data only through `_capacity` names                     | blob `:1187`, `:1318`, `:1484`                                                                                                                        | Names and signatures unchanged; this package introduces no read name other than the clearly non-client wrapper function                                     |
| Stale-client message and refresh posture                             | approved string `CityLink needs an update. Refresh before creating a group.`                                                                          | Client-side and owned by Roy; this package adds no reload, retry or storage recovery, and no new user-facing string                                         |
| Full/unset block invitations and applications, pending stays pending | blob `:100` `assert_group_has_capacity`, `:141`–`:147`                                                                                                | Unchanged; server authority stays mandatory                                                                                                                 |

## 9. Apply runbook (revised for F10)

Every step below is a future, separately authorized action. Nothing here is
authorization.

1. **Preflight, in the session that will apply.** Run pages 00, 01, 05 (required)
   and 02, 03, 04 (per-track scope) in that order, each as its own statement
   batch, capturing every result set verbatim into the checklist. Record the
   engine version row and both pin rows.
2. **Declare the markers** listed in §5.3 in that same session, from the captured
   output — not from memory, and not from a previous run.
3. **Call the gate.** `select private.citylink_capacity_apply_gate();` must
   return `group_capacity_gate_satisfied`. Any refusal token stops the run; the
   token text is recorded in the checklist and investigated, never skipped.
4. **Apply the reviewed blob exactly as reviewed** — the same named file, verified
   by blob id and SHA-256 against `citylink.capacity_blob_identity`, in the same
   authorized session.
   - **Run it without `--single-transaction` and without wrapping it in an outer
     `BEGIN`/`COMMIT`.** The file already contains its own `begin;` at `:39` and
     `commit;` at `:1756`; nesting a second transaction raises
     `there is no transaction in progress` / `BEGIN already called` class errors
     and a `--single-transaction` wrapper would send its own `BEGIN` first.
     This is Adam's Stage 4 finding F10 and it is a legal requirement of the
     file, not a style preference.
   - **Record both timestamps**: the moment the application command started and
     the moment it returned, plus the exit status. A partially applied capacity
     state must be locatable in time.
5. **Post-application verification** per the checklist §6: re-run pages 00, 01 and
   05 and confirm that the `A-CAP-*` absence rows now report the reviewed
   presence, that no `FAIL` row appeared, and that the pin rows still match. Do
   not re-declare markers from the pre-application run.
6. **Stop conditions:** any `FAIL`, any `UNPINNED`, any refusal token, any engine
   major other than 17, any target other than the authorized Test ref, any blob
   identity mismatch, or a Main write request without a new recorded Adam decision
   in `docs/team/DECISIONS.md`.

## 10. Validation actually performed for this reshape

### 10.1 Engine and cluster

- Install route (as documented in the coordinator's
  `docs/team/PG17_SPOTCHECK_OF_ROLE6_CLAIMS_20261122.md`, branch
  `docs/citylink-coordinator-evidence-20261122`): PGDG APT repository, key
  `ACCC4CF8.asc`, suite `noble-pgdg`, `postgresql-17` + `postgresql-client-17`.
  Exit status 0.
- `postgres --version` → `postgres (PostgreSQL) 17.12 (Ubuntu 17.12-1.pgdg24.04+1)`
  — same major as the authorized target family (Test 17.11.0.011, Main
  17.11.0.003 per Adam's 22:04 decision text), same minor series as the
  coordinator's own 17.12 measurement.
- `initdb -U postgres -A trust --no-sync -E UTF8` exit 0; server started with
  `-c listen_addresses=''` so only a unix-socket path existed. **Measured TCP
  listeners on 54xx: 0**, before and after the run.
- Teardown: `pg_ctl -m fast -w stop` exit 0; data directory and socket directory
  deleted; `remaining postgres processes: 0`; `leftover data dir: gone`;
  `leftover socket dir: gone`. No cluster remains in this sandbox.
- Database locale/encoding: `C.UTF-8 | C.UTF-8 | UTF8`.

### 10.2 Commands and results

Harness: `docs`-external script `run_validation.sh` (kept in this task's scratch
area, not committed, because it installs packages and creates a cluster). Phases,
all exit 0 unless stated:

| Phase | Action                                                                                                                                         | Result                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0     | version, initdb, socket-only start, listener count                                                                                             | 17.12; `tcp listeners on 54xx: 0`                                               |
| 1     | negative control: run all six pages against a **bare** engine (no fixture)                                                                     | 43 `FAIL` rows, 19 legitimate `PASS` rows, 0 errors                             |
| 2     | create data-free fixture (helpers from the verbatim Stage 6 text, term-model/row-8 tables, `auth` schema, Supabase-shaped roles, ledger table) | exit 0                                                                          |
| 3     | run each page twice                                                                                                                            | 145 rows total per pass; **every page byte-identical across runs**              |
| 4     | mechanical banned-construct scan of all six pages                                                                                              | 0 for each of the four measures on every page (§10.5)                           |
| 5     | recipe churn probe (states A/B/C, `gn` vs `g`)                                                                                                 | §6.1                                                                            |
| 6     | create the wrapper; exercise each refusal state and the satisfied state                                                                        | all nine tokens observed; success row observed (§10.6)                          |
| 7     | marker echo states                                                                                                                             | page 00 reports 7 × `UNPINNED` with no markers, verbatim echo with all declared |
| 8     | teardown                                                                                                                                       | §10.1                                                                           |

### 10.3 Per-page outcome on the shaped fixture

| Page | Rows | PASS | FAIL | CAPTURE | UNPINNED | Unique check ids |
| ---- | ---- | ---- | ---- | ------- | -------- | ---------------- |
| 00   | 18   | 4    | 0    | 7       | 7        | 18               |
| 01   | 55   | 51   | 0    | 4       | 0        | 55               |
| 02   | 17   | 0    | 0    | 17      | 0        | 17               |
| 03   | 33   | 0    | 0    | 33      | 0        | 33               |
| 04   | 5    | 0    | 0    | 5       | 0        | 5                |
| 05   | 17   | 3    | 0    | 12      | 2        | 17               |

Page 01's four `CAPTURE` rows are the deliberate full-rendering rows
(`A-LGC-02/04/06`) plus the `private` schema owner capture (`A-RUN-03`). Page 00's
seven `UNPINNED` rows are the seven undeclared markers. Page 05's two `UNPINNED`
rows are `P-H1-DIG`/`P-H2-DIG`, the Test pin that Part A could not record (§11.1).

No cross-page check-id collision: page 00 and page 03 share the `C-` prefix but
use disjoint families (`C-MAJ/DB/USR/LOC/ENC/CFG/SBA/MRK` versus
`C-ROL/FUN/EXE/SCH/DFA/POL`), verified by set intersection = empty.

### 10.4 Discrimination check (why the pages are not vacuous)

The same six pages run against a bare engine produced 43 `FAIL` rows including
`A-TAB-01..10`, `A-COL-01/02`, all fourteen `A-HLP-*`, `A-RPL-01..05`,
`A-TRG-01`, `A-LGC-01..03`, `C-SBA-09`, `C-SBA-11`, and `P-H1/P-H2-OID/CFG/DIG`.
The 19 `PASS` rows on a bare engine are the ones that legitimately describe it
(capacity-absence and clean-slate rows). Two drafting defects were caught here
rather than on a target: `A-LGC-*` originally used an inner join that silently
emitted **no row** when a legacy read was missing — a fail-open shape — and was
changed to a left join so absence reports `FAIL`; and duplicate `A-LGC-04` labels
were replaced by derived unique ids `A-LGC-01..06`.

### 10.5 Banned-construct scan (mechanical, all six pages)

Statement-leading banned keywords `0`, `::regclass` occurrences `0`,
`SELECT … INTO` occurrences `0`, hard-coded `search_path='…'` comparison literals
`0`.

### 10.6 Wrapper behaviour observed

Nine refusal states each raised once, with their intended token and SQLSTATE:
`run_undeclared`, `target_undeclared`, `target_out_of_scope`,
`target_unauthorized`, `pages_incomplete`, `verdict_unsatisfied`,
`pin_unrecorded`, `engine_unconfirmed`, `artifact_unverified`. The fully declared
state returned `group_capacity_gate_satisfied run=local-17-validate
target=wkzclgmhrtecnpexfesr`. Page 05's digest rows were additionally exercised
through four branches: no marker → `UNPINNED`; well-formed correct pin → `PASS`;
a 64-hex wrong pin → `FAIL`; malformed `abc,def` → `UNPINNED` with
`malformed pin field 1/2`. Never a silent `PASS`. On the bare engine the wrapper
call refused before execution as `ERROR: schema "private" does not exist` —
absence of the instrument is itself a refusal.

### 10.7 Repository-side checks

Recorded in the handoff for this commit: pre-edit `git status --short --branch`,
`git fetch origin`, `git log -1 --oneline origin/main`,
`git branch --show-current`, PR #51 start head `bc6a6d5…`,
`git diff --name-only bc6a6d5..HEAD`, `git diff bc6a6d5..HEAD -- supabase` = 0
bytes, blob id `a04048e90d6b64c692f03c722b9eea2849058aab` and SHA-256
`5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` unchanged,
`git diff --check` clean, and Prettier 3.6.2 `--check` on the changed Markdown
(Prettier has no SQL parser, so the SQL is covered by the real-parser run in
§10.2, not by formatting checks).

## 11. What could not be verified

### 11.1 The authorized Test dry run was blocked

Part A of the assignment authorized exactly one read-only, SELECT-only dry run on
Test `wkzclgmhrtecnpexfesr` whose sole output would have been the G4 pinning
record. It was **not executed**, because this task has no Supabase route:

- `manus-config connector search supabase` lists `Supabase`
  (uid `84ab78ef-139c-48ff-acd4-cba718b8a484`) and `Supabase API`
  (uid `86a04f98-35cf-4099-9044-ab851a473cf5`), both `"enabled": false`, and
  `manus-config config load --search supabase` shows the same two disabled entries
  in this session's selections.
- The session's MCP server list contains no Supabase server.
- Following the packet's own instruction — "If the connector is not enabled in
  your task, report that as a blocker and continue with Part B rather than
  improvising another route" — Role 6 did **not** substitute another route: no
  `psql` connection to Test, no project listing, no secret or `.env` handling.
  **No database outside the local disposable cluster was contacted.**

Consequence: the Test pin remains `UNPINNED`, the wrapper therefore refuses any
future application attempt until an authorized run records it, and page 05 is
delivered ready for that run rather than partially guessed.

### 11.2 Supabase-only schema is locally unvalidated in substance

Pages 00, 03 and 04 read objects that exist only in a Supabase-managed project:
the `auth` schema and `anon`/`authenticated`/`service_role` roles,
`citylink_settings`, and `supabase_migrations.schema_migrations`. To keep the
promise that **every** shipped statement is parsed and executed, the local fixture
reproduced those objects' **names and catalog shapes** — nothing else. That proves
parser validity, column-set validity and expression legality of those rows; it
does **not** validate their expected values, and their `CAPTURE`/`PASS` verdicts
locally say nothing about the real project posture. Rows that depend on
live-only values (`C-SBA-*`, `C-ROL-*`, `C-DFA-*`, `D-LDG-10`) must be treated as
unvalidated-in-substance until the authorized Test run. Page 04's second statement
is additionally documented as parse-time dependent and is to be run only when its
first statement reports the table present.

### 11.3 Nothing else

This package does not prove: the live state of Test or Main; signed-in behaviour,
RLS outcomes, PostgREST error mapping, concurrency or client recovery (Eunice's
separately authorized Test QA); the correctness of any product decision; or any
authorization. It does not authorize application, Test write, Main access of any
kind, merge, ready transition, deployment, publication, or stub/legacy-wrapper
cleanup.

## 12. Disposition of the Stage 4 findings

Adam's Stage 4 review produced F1–F11. Under option (b) the guard is retired, so
their disposition is stated explicitly rather than left to inference.

| ID  | Finding (as reviewed)                                                                                                                | Disposition now                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Guard line 605 concatenates with `\|\|` inside `RAISE NOTICE`; block does not compile                                                | **Moot by construction** — no `DO` block and no `RAISE` ships. Closed by deletion of the guard.                                                                           |
| F2  | `to_regfunction(text)` does not exist (19 call sites)                                                                                | **Moot by construction** — presence tests use `to_regprocedure`/`to_regclass`/`to_regrole`.                                                                               |
| F3  | `pg_proc.proallargnames` does not exist                                                                                              | **Moot by construction** — OUT/TABLE names come from `proargnames` with `proargmodes in ('t','o')`.                                                                       |
| F4  | `pg_default_acl.roleid` does not exist                                                                                               | **Moot by construction** — page 03 reads `defaclrole`/`defaclobjtype`/`defaclacl` and captures only.                                                                      |
| F5  | Every `v_fail := v_fail \|\| 'literal'` accumulator raises `malformed array literal`                                                 | **Moot by construction** — there is no accumulator; verdicts are rows.                                                                                                    |
| F6  | Normalization recipe and input scope unpinned                                                                                        | **Closed by publication** — §6's five rules, executed on 17.12, with F12's mandatory `n` flag.                                                                            |
| F7  | Comparing `proconfig` against a rendered `search_path=''` literal is brittle                                                         | **Moot by construction** — entries are split at the first `=` and unquoted; §10 confirms the empty case normalizes to `<empty>` and PASSes by contract.                   |
| F8  | Guard output was a single accumulated exception, so one failure hid the rest                                                         | **Moot by construction** — pages emit one row per check; the wrapper raises only for declarations.                                                                        |
| F9  | Digest honesty: the pinned values were not reproducible from the repository                                                          | **Remains open** — and is now recorded as open: `P-H1-DIG`/`P-H2-DIG` are `UNPINNED` pending the blocked Test dry run (§11.1).                                            |
| F10 | The blob's own `begin;`/`commit;` makes `--single-transaction` or an outer `BEGIN` illegal                                           | **Moved to runbook obligation** — §9 step 4 states the prohibition and the two-timestamp requirement.                                                                     |
| F11 | Instrument-shape question: guard versus reviewed SELECT-only checklist                                                               | **Decided by Adam as option (b)** and implemented here; the residual obligation is reviewer confirmation that row-level observation plus the wrapper is adequate control. |
| F12 | New, found by this reshape's own 17.12 run: `.` matches a newline, so comment stripping without the `n` flag hashes a truncated body | **Fixed and published** — Rule 1 uses flags `gn`; Rule 5 (`btrim`) added; evidence in §6.1.                                                                               |

## 13. Checked-in migration inventory (for the D-LDG-10 comparison)

Page 04 states that repository filenames are not readable from SQL. This is the
inventory it must be compared against, taken from this branch's exact head
(`git ls-tree supabase/migrations`, 9 files):

| Version          | File                                                       |
| ---------------- | ---------------------------------------------------------- |
| `20261102090000` | `stage5_term_model.sql`                                    |
| `20261102131343` | `stage5_groups.sql`                                        |
| `20261102140927` | `stage5_course_roster_rpc.sql`                             |
| `20261114163512` | `20261114162301_stage5_group_authority_and_succession.sql` |
| `20261117043100` | `stage5_course_group_invite_candidates.sql`                |
| `20261117205600` | `stage5_course_detail_group_views.sql`                     |
| `20261118050000` | `stage6_chat_recruitment.sql`                              |
| `20261118083000` | `stage6_people_page_naming.sql`                            |
| `20261119090000` | `group_hard_max.sql` ← the reviewed blob                   |

The recorded Test and Main ledger versions quoted in the coordinator's
reconciliation notes match **neither** this list **nor each other**, which is the
three-way mismatch that stopped PR #41; that remains reported-live, not something
Role 6 can repair here (Track D). Page 04 exists so a future run records all three
identities in one document instead of three.

## Adam's next action(s):

1. **[Action — unblocks the pin] Enable the Supabase connector on this Role 6
   task** (or name the task that should run it). Part A was blocked, not failed:
   with the connector enabled, one authorized read-only run of page 05 on
   `wkzclgmhrtecnpexfesr` produces the G4 record (engine version, locale,
   encoding, expression source, `pg_get_functiondef` source length,
   `session_user`, both digests, stability across two executions) and turns
   `P-H1-DIG`/`P-H2-DIG` from `UNPINNED` into a value you can hold the wrapper to.
   Unblocks: any Test capacity preflight or application request.
2. **[Decision] Accept or redirect the reshape shape** — this commit is option
   (b) as directed: six SELECT-only pages, one thin refusal wrapper, guard deleted
   (recoverable at `bc6a6d5`). Silence here would leave PR #51 open/draft and
   nothing proceeds.
3. **[Decision — sequencing] Confirm the two-step sequence** (pages → wrapper →
   the unchanged blob in the same authorized session, §7 and §9) rather than a new
   atomic successor head that copies the DDL and requires a fresh exact-head
   review.
4. **[Decision — Main path] Confirm Main stays out of the capacity plan** until
   Track B and Track C are each separately decided, since §4.2 shows the reviewed
   blob cannot apply to Main as written.
5. **[Delegable] Direct the coordinator to route this exact head to Eunice and
   Roy** for independent read-only confirmation that the row-level observation
   plus wrapper is an adequate control (F11's residual obligation) and that no
   client contract changed.
