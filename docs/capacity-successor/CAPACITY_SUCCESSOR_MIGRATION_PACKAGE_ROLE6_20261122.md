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

| Class                       | Meaning in this package                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reported live               | Coordinator-performed SELECT-only catalog results quoted from the parity record. Not re-verified here.                                                                                                                                                                    |
| Statically reviewed         | Facts read from the exact head in this task's own worktree (line anchors, signatures, transaction structure, languages).                                                                                                                                                  |
| Independently computed here | Deterministic offline normalizations and statement scans run in this sandbox (no database).                                                                                                                                                                               |
| Executed locally on PG 17   | Every page and the wrapper were run twice against a data-free, disposable local PostgreSQL 17.12 cluster. Proves parse validity, syntax, determinism and fail-closed behaviour of the instrument itself.                                                                  |
| Not executed                | Any page set against CityLink Launch `pijslbchvstkoweslymr` or the frozen Prototype `wkzclgmhrtecnpexfesr`. The authorized read-only _identity capture_ has since run on the Prototype (§11.4); no page has been executed against either project and nothing was written. |

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

### 4.1 Frozen Prototype `wkzclgmhrtecnpexfesr` — out of scope, refused by the gate

The Prototype is kept as a historical reference and must not be migrated. Since
Adam's F14 decision (2026-11-23 01:50) the wrapper refuses it explicitly with
`group_capacity_gate_target_out_of_scope` (45003), so a run that declares this ref
stops before any later gate is consulted.

That is a scope decision, not a verdict on the project. The Prototype's reported
state is still the shape this package was first designed against — the two Stage 6
private helpers with `postgres` ownership, `SECURITY DEFINER`, empty `search_path`
and no browser or `service_role` `EXECUTE`; the row-8 subject contract and the
`(uuid,uuid,text)` create overload; no capacity object yet — and the authorized
read-only identity capture of §11.4 was taken there. What the Prototype can no
longer be is the application target.

### 4.2 CityLink Launch `pijslbchvstkoweslymr` — the authorised target, with blockers that scope does not clear

"Main" in this document is the CityLink Launch project. It is now the authorised
target and the wrapper accepts it (§11.5). Two static findings, both derived from
the exact head plus the reported Launch state, still mean the reviewed blob cannot
be applied there as it stands. Re-scoping the gate changed which ref the gate
accepts; it changed nothing about these:

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
of that, **relative to the declared target**: `A-RPL-01..05` require the expected
overloads present, `A-RPL-06` requires the two-argument overload present on
CityLink Launch and absent on the frozen Prototype, and `A-RPL-07` captures the
whole overload set so the expectation can be re-derived from a target's own rows
rather than from another target's (F16, closed 2026-11-23).

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

| Page | File                                     | Rows | Prefix | Observes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------- | ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00   | `00_target_identity_and_engine.sql`      | 18   | `C-`   | Engine major (`C-MAJ-01` expects 17), full version, database, `session_user`/`current_user`, collate/ctype/encoding, Supabase-shape rows (`C-SBA-*`), and a verbatim echo of each of the seven operator markers (`C-MRK-12..18`) — `UNPINNED` when a marker is undeclared.                                                                                                                                                                                                                                       |
| 01   | `01_track_a_capacity_prerequisites.sql`  | 56   | `A-`   | Track A gating observations: ten term-model/study-group tables (`A-TAB-*`), three column facts (`A-COL-*`), the two helper postures in seven fields each (`A-HLP-1-*`, `A-HLP-2-*`), nine capacity-absence signatures plus table and constraint (`A-CAP-*`), six replaced-signature checks (`A-RPL-*`), six legacy read-shape checks and renderings (`A-LGC-*`), three runner-legality/ownership rows (`A-RUN-*`), and the invitation-integrity attachment assertion strengthened for F13 (`A-TRG-01..03`, §14). |
| 02   | `02_track_b_row8_promotion.sql`          | 17   | `B-`   | Row-8 objects as the engine renders them (`B-FUN-*`), the overload inventory (`B-INV-*`), column rendering including defaults (`B-COL-*`), the subject CHECK list (`B-CHK-01`) and the create-overload count (`B-CNT-01`). Capture-only: Track B is Adam's decision, not this package's.                                                                                                                                                                                                                         |
| 03   | `03_track_c_grant_posture_survey.sql`    | 33   | `C-`   | Per-object ACL rendering (`C-FUN-*`), role identity (`C-ROL-*`), ten effective-EXECUTE rows (`C-EXE-*`), schema posture (`C-SCH-*`), default-ACL rendering and count (`C-DFA-*`), RLS policy counts and `relrowsecurity` flags (`C-POL-*`). Deliberately capture-only; `aclexplode` is not used, because a mis-read ACL expansion must not become a silent gate.                                                                                                                                                 |
| 04   | `04_track_d_ledger_identity_capture.sql` | 5    | `D-`   | Statement 1 (4 rows, runnable anywhere): ledger table identity, its columns as this engine sees them, its schema, and the explicit limit note that repository filenames are **not** readable from SQL. Statement 2 (1 row per recorded version, `limit 100`): verbatim recorded versions — run only when statement 1 reports the table present, because the second statement is parse-time dependent.                                                                                                            |
| 05   | `05_helper_pinning_record.sql`           | 17   | `P-`   | The G4 pinning instrument: engine major, locale/ctype, encoding, identity fields, session `search_path` capture, the recipe identity and input-scope declaration (`P-RCP-06/07`), and per helper the OID, `pg_get_functiondef` length in chars and octets, the normalized digest, the empty-`search_path` proconfig verdict and the ACL posture (`P-H1-*`, `P-H2-*`). Digits are compared only against the operator-declared pin; no pin is baked in.                                                            |
| 90   | `90_apply_gate_wrapper_DRAFT.sql`        | n/a  | n/a    | The refusal wrapper (§5.3). The only raising instrument in the package.                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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
affordance. The names below are the strings the wrapper actually emits, taken from
the measured 17.12 run in §10.8 rather than from a comment:

| Token                                     | SQLSTATE | Refuses when                                                            |
| ----------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `group_capacity_gate_run_undeclared`      | 45001    | no run id declared                                                      |
| `group_capacity_gate_target_undeclared`   | 45002    | no target ref declared                                                  |
| `group_capacity_gate_target_out_of_scope` | 45003    | declared target is Main's ref                                           |
| `group_capacity_gate_target_unauthorized` | 45004    | declared target is any other ref than the authorized Test ref           |
| `group_capacity_gate_pages_incomplete`    | 45005    | pages 00, 01 or 05 not declared as run                                  |
| `group_capacity_gate_verdict_unsatisfied` | 45006    | declared verdict is not a satisfaction statement                        |
| `group_capacity_gate_pin_unrecorded`      | 45007    | pin missing, malformed, or an `UNPINNED` placeholder                    |
| `group_capacity_gate_engine_unconfirmed`  | 45008    | declared engine major is not 17                                         |
| `group_capacity_gate_artifact_unverified` | 45009    | declared blob identity is not the reviewed `a04048e9…`/`5cf0a66a…` pair |

**F15 — a documentation defect found while making the verdicts ref-bearing.** This
table and the quick reference in checklist §8 previously spelled refusals
45002-45009 without the `_gate_` segment (for example
`group_capacity_target_undeclared`). The wrapper has never emitted those strings.
An operator copying a token from the document would have recorded a name that does
not exist, and every refusal record would have disagreed with the runner output.
Corrected here against measured behaviour; no SQL token name changed.

**Ref-bearing verdict rule (Adam's hard requirement, 2026-11-23 00:40).** A verdict
is evidence only if it names the target it was produced for. From 45003 onward every
message carries that ref after the token — `group_capacity_gate_pages_incomplete
target=wkzclgmhrtecnpexfesr` and so on, all observed in §10.8. `45001` and `45002`
are the two states where the ref is by definition not yet known (nothing declared,
or no target declared), so they stay bare and are identified by token and SQLSTATE
alone. The success row is

```
group_capacity_gate_satisfied run=<id> target=<ref>
```

which **already carried the ref at the reshape head `7114b96`** (§10.6 and the row
measured again in §10.8). F13's second half therefore changed the refusal messages,
not the success token, and changed no scope decision: whether the gate should scope
a real release target at all is F14 and remains Adam's.

The ref is operator-declared, so it is not proof of which database answered:
`current_database()` is `postgres` on both Supabase projects and cannot distinguish
them. Pair any returned token with the archived page 00 rows `C-MRK-13` (declared
ref), `C-DB-03` (`current_database()`) and `C-USR-04` (`session_user`) under the same
run id.

The gate is not a security control and not a substitute for RLS or for Adam's
authorization; it is the fail-closed record that the declared preflight happened, on
the declared target, against the declared artifact.

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
| G10 trigger premise              | page 01 `A-TRG-01..03`, strengthened for F13 (§14)                           |
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

### 10.8 F13 re-validation at the fix head

This is the run Adam's F13 assignment required as its evidence bar: a disposable
PostgreSQL 17 brought to **repository schema state**, page 01 and the wrapper
executed against it, raw output archived.

Engine `PostgreSQL 17.12 (Ubuntu 17.12-1.pgdg24.04+1)`; socket-only cluster with
`listen_addresses=''`, zero TCP listeners, destroyed at teardown (`pgrep -c
postgres` → 0, data and socket directories gone). Repository schema state was built
from the repository's own files — a harness-only `auth` stand-in, then
`supabase/schema.sql`, then `supabase/seed_citylink_fictional_courses.sql`, then the
eight pre-blob checked-in migrations, each exit 0, giving 12 public tables. The
reviewed blob was applied afterwards **as reviewed** (no `--single-transaction`, no
outer `BEGIN`), exit 0, with the file's SHA-256 recorded identical before and after.

Page 01, same database state, before and after the fix:

| Page 01 run                | Rows | PASS | FAIL | CAPTURE | UNPINNED | Distinct ids |
| -------------------------- | ---- | ---- | ---- | ------- | -------- | ------------ |
| expectation as shipped     | 55   | 50   | 1    | 4       | 0        | 55           |
| assertion after F13, run 1 | 56   | 51   | 0    | 5       | 0        | 56           |
| assertion after F13, run 2 | 56   | 51   | 0    | 5       | 0        | 56           |

The row-by-row diff between the shipped expectation and the fixed assertion is
exactly one verdict change — `A-TRG-02: FAIL → PASS` — plus the added `A-TRG-03`
capture row; the other 54 rows keep their verdicts, and runs 1 and 2 were
byte-identical. The shipped row's single failure reproduced independently of the
coordinator's rehearsal: `expected='0 — the reviewed draft leaves it unattached…'
observed='1'`.

Mutation controls, on the same disposable database, to prove the strengthened row
is not vacuous:

| State produced                               | `A-TRG-02` verdict                           | `A-TRG-03` observed               |
| -------------------------------------------- | -------------------------------------------- | --------------------------------- |
| repository DDL (baseline)                    | `PASS`                                       | the one pinned identity           |
| extra `before update` attachment added       | `FAIL`, `count=2 identity=<not-exactly-one>` | both identities, joined with `;;` |
| repository attachment dropped                | `FAIL`, `count=0 identity=<not-exactly-one>` | `<none>`                          |
| re-attached under a new name, `after update` | `FAIL`, `count=1` with identity mismatch     | the `_v2` identity                |
| repository DDL restored                      | `PASS`                                       | the one pinned identity           |

After the apply leg `A-TRG-02` was `PASS` and `A-TRG-03` was byte-identical to the
pre-apply capture, so "unchanged across the apply" is an observed result rather than
an assertion. The twelve other `FAIL` rows on that post-apply run are the documented
clean-slate rows (`A-CAP-01..09`, `A-CAP-11/12`, `A-COL-03`) reporting the objects
now present, which is the expected post-application state in checklist §6.

Other pages at repository state: page 00 → 18 rows with the single expected `FAIL`
`C-SBA-11` (a plain engine has no Supabase migration ledger); page 02 → 17
`CAPTURE`; page 03 → 33 `CAPTURE`; page 04 → 4 `CAPTURE` with statement 2 erroring on
the same absent ledger; page 05 → 17 rows, `PASS=3 CAPTURE=12 UNPINNED=2`, the two
`UNPINNED` being `P-H1-DIG`/`P-H2-DIG`, still unpinned (§11.1). The bare-engine
negative control still discriminates, and shows the inversion clearly: on a bare
engine the fixed page reports `rows=56 PASS=15 FAIL=36 CAPTURE=5` with
`A-TRG-02 FAIL count=0`. The shipped expectation reported `A-TRG-02 PASS` on that
same bare engine — §10.4's measured bare-engine FAIL list names `A-TRG-01` but not
`A-TRG-02` — while reporting `FAIL` on a correct repository state, as measured above.
The old row was wrong in both directions at once, which is the signature of an
expectation that was never read off a database.

Wrapper, installed in the repository-state database and called once per branch
(these observations predate F14's inversion; §11.5 records the re-scoped mapping):
satisfied `group_capacity_gate_satisfied run=f13-local-1 target=wkzclgmhrtecnpexfesr`;
then 45001 `group_capacity_gate_run_undeclared`, 45002
`group_capacity_gate_target_undeclared`, 45003
`group_capacity_gate_target_out_of_scope target=pijslbchvstkoweslymr`, 45004
`group_capacity_gate_target_unauthorized target=some-other-project`, 45005
`group_capacity_gate_pages_incomplete target=wkzclgmhrtecnpexfesr`, 45006
`group_capacity_gate_verdict_unsatisfied target=wkzclgmhrtecnpexfesr`, 45007
`group_capacity_gate_pin_unrecorded target=wkzclgmhrtecnpexfesr`, 45008
`group_capacity_gate_engine_unconfirmed target=wkzclgmhrtecnpexfesr`, 45009
`group_capacity_gate_artifact_unverified target=wkzclgmhrtecnpexfesr`. A
three-argument `create_group_and_invite` call on the same database still raised the
client-facing `group_capacity_upgrade_required`, confirming the two token families
stay distinct. Banned-construct scan on the changed page with SQL comments stripped:
`DO` 0, leading `RAISE` 0, `SELECT … INTO` 0, `::regclass` 0, `CREATE TEMP` 0,
hard-coded `search_path=` comparison 0, one terminating semicolon, 56 distinct ids.

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

### 11.4 The F13 trigger pin: measured on Test, unverified on Main

Page 01's `A-TRG-02` pin was derived from `supabase/schema.sql:354-357` and first
reproduced on a disposable PostgreSQL 17.12 cluster. That left it rehearsal-derived:
a rehearsal proves the instrument works, not that the real target looks like it.

Adam authorized a read-only identity capture on the disposable Test project on
2026-11-23, and it has now been performed. Against `wkzclgmhrtecnpexfesr`
("CityLink Prototype (do not migrate)", `ACTIVE_HEALTHY`, `server_version` 17.11), a
SELECT-only catalog read returned **exactly one** non-internal trigger attached to
`public.enforce_invitation_integrity()`, with identity:

```
invitations_enforce_integrity;public.invitations;before;insert+update;row;origin
```

`pg_get_triggerdef` agrees:
`CREATE TRIGGER invitations_enforce_integrity BEFORE INSERT OR UPDATE ON
public.invitations FOR EACH ROW EXECUTE FUNCTION enforce_invitation_integrity()`.
That is character-for-character the string the 17.12 rehearsal produced, so the pin
is now **measured on Test** rather than inferred, and the rehearsal is known to
reproduce the real target rather than a plausible one.

The same read settled the F13 attribution question: `public.invitations` carries 1
non-internal trigger of 7 total, while `public.group_invitations` carries **0**
non-internal triggers of 6 total (all six are internal foreign-key triggers). The
guard therefore attaches to the legacy table, exactly as `schema.sql:354-357` says.
Whether the capacity feature is still protected in practice is a signed-in QA
question this pin does not answer, and must not be read as answering.

What remains unverified, and must keep being said plainly:

- **Main is not measured by this task.** `pijslbchvstkoweslymr` holds no access for
  Role 6; the coordinator's report of one attachment there is reported-live, not
  re-derived here. The pin must not be described as a pin against CityLink Launch
  until an authorized capture names it there.
- Any future divergence between an authorized capture and this pin is a **finding for
  Adam**, not a reason to re-lower or silently re-record the expectation.
- This capture is evidence about a pin, not authorization to apply anything: no
  migration ran, no row was written, and the write boundary is unchanged.

### 11.5 F14 resolved: the gate accepts CityLink Launch and refuses the frozen Prototype

Adam decided F14 on 2026-11-23 01:50. The authorised target is CityLink Launch
`pijslbchvstkoweslymr`, which must pass the scope check. The frozen Prototype
`wkzclgmhrtecnpexfesr` is explicitly out of scope and draws the out-of-scope
refusal (45003), not the generic unauthorised one (45004) — the exact inversion of
the pre-F14 behaviour, in which the Prototype was the only accepted ref and Launch
drew 45003.

| Declared `citylink.capacity_target_ref`   | Token                                              | SQLSTATE |
| ----------------------------------------- | -------------------------------------------------- | -------- |
| `pijslbchvstkoweslymr` (CityLink Launch)  | passes the scope check; later gates then apply     | —        |
| `wkzclgmhrtecnpexfesr` (frozen Prototype) | `group_capacity_gate_target_out_of_scope target=…` | 45003    |
| any other value                           | `group_capacity_gate_target_unauthorized target=…` | 45004    |
| undeclared                                | `group_capacity_gate_target_undeclared`            | 45002    |

Everything else about the instrument is unchanged: 45001-45009 keep their
assignments and stay distinguishable from each other and from the client-facing
`group_capacity_upgrade_required` (45000); every refusal from 45003 onward carries
` target=<ref>`; 45001 and 45002 stay bare because no ref is known in those states;
the success token still carries both `run=` and `target=`.

**Measured on a disposable PostgreSQL 17.12** (`17.12-1.pgdg24.04+1`) brought to
repository schema state (auth stand-in, `supabase/schema.sql`, fictional seed, 8/8
pre-blob migrations, 12 public tables; the reviewed blob was never applied). The
wrapper was installed by the real parser (exit 0) and then called once per case, 13
calls, with the exact emitted message recorded:

| Case                                         | Declared ref and other markers                                           | Emitted                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| all markers valid                            | Launch                                                                   | `group_capacity_gate_satisfied run=f14-local-1 target=pijslbchvstkoweslymr`  |
| scope only                                   | frozen Prototype, everything else valid                                  | 45003 `…target_out_of_scope target=wkzclgmhrtecnpexfesr`                     |
| scope only                                   | `some-other-project`, everything else valid                              | 45004 `…target_unauthorized target=some-other-project`                       |
| target empty                                 | —                                                                        | 45002 `group_capacity_gate_target_undeclared`                                |
| run empty                                    | Launch                                                                   | 45001 `group_capacity_gate_run_undeclared`                                   |
| scope wins                                   | frozen Prototype **and** pages, verdict, pins, engine and blob all wrong | 45003 (scope short-circuits)                                                 |
| scope wins                                   | `some-other-project` **and** the same defects                            | 45004 (scope short-circuits)                                                 |
| later gates still fire on the authorised ref | Launch + pages `00,01`                                                   | 45005 `…pages_incomplete target=pijslbchvstkoweslymr`                        |
| "                                            | Launch + verdict `FAIL`                                                  | 45006 `…verdict_unsatisfied target=…`                                        |
| "                                            | Launch + no pin                                                          | 45007 `…pin_unrecorded target=…`                                             |
| "                                            | Launch + engine `16`                                                     | 45008 `…engine_unconfirmed target=…`                                         |
| "                                            | Launch + wrong blob identity                                             | 45009 `…artifact_unverified target=…`                                        |
| satisfied variant                            | Launch + `PASS_WITH_CAPTURED_OBSERVATIONS`                               | `group_capacity_gate_satisfied run=f14-local-13 target=pijslbchvstkoweslymr` |

Instrument properties re-checked in the same run: `provolatile = s` (stable),
`prosecdef = f` (security invoker), `proconfig = {search_path=""}`, owner
`postgres`, and `EXECUTE` withheld from `anon` and `authenticated`. The six page
files contain **zero** ref literals, so no page assumes either project. Teardown
left 0 postgres processes, 0 TCP listeners and no data directory.

**A local run declaring the Launch ref is a logic-path test, not a claim about
CityLink Launch.** Nothing here contacted either project. The gate reads
operator-declared markers and nothing else, so a passing call proves the operator
typed the expected ref — not which database answered. `current_database()` is
`postgres` on both projects, which is why the returned token must be paired with
page 00 rows `C-MRK-13` (declared ref), `C-DB-03` (`current_database`) and `C-USR-04`
(`session_user`) under the same run id.

**What F14's resolution does not establish.** Re-scoping the gate does not make the
apply safe, legal or authorised. §4.2's static blockers still stand between the
gate and a real application; F9's digests still read `UNPINNED`, so no application
may be requested at all; and no application authorization exists for any target.
Scope was the whole of F14.

## 12. Disposition of the Stage 4 findings

Adam's Stage 4 review produced F1–F11, this reshape's own 17.12 run produced F12, and
Adam's 2026-11-23 decision plus the F13 fix produced F13–F15. Under option (b) the
guard is retired, so their disposition is stated explicitly rather than left to
inference.

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

| F13 | Page 01 `A-TRG-02` expected zero invitation-trigger attachments while every target that exists has one — a false stop that would have failed the release apply with 45006 | **Fixed by strengthening, at Adam's direction** — exactly one attachment **and** an identity match against a recorded pin (`A-TRG-02`), plus an attachment-set capture for the unchanged-across-apply comparison (`A-TRG-03`). Erratum in §14, evidence in §10.8. The reviewed blob is untouched. The pin itself is now **measured on Test** by an authorized read-only capture and matched the rehearsal exactly; Main is still unverified by this task (§11.4). |
| F14 | The wrapper hard-coded the Prototype ref and structurally refused the release target (45003/45004), so as shipped it could never authorise the single real apply | **Decided by Adam 2026-11-23 01:50 and implemented (§11.5)** — CityLink Launch is the authorised target and must pass; the frozen Prototype draws 45003; any other ref draws 45004. Scope was the whole of F14: §4.2's static blockers are untouched, so a passing gate still does not make the apply possible, and this authorises no application. |
| F15 | New, produced by this fix: both token tables named refusals 45002-45009 without the `_gate_` segment, so a recorded refusal copied from the document matched nothing the wrapper emits | **Fixed** — tables corrected against measured 17.12 output (§5.3, checklist §8); no SQL token name changed. |
| F16 | Page 01's replaced-signature expectations were captured on the frozen Prototype, so `A-RPL-06` asserted the two-argument `create_group_and_invite` absent — true on the Prototype, false on CityLink Launch, where it is the only overload | **Fixed** — `A-RPL-06` is target-relative: it reads the declared ref and judges against that target's own expected state (Launch present, Prototype absent, undeclared `UNPINNED`), never against a Prototype-captured value. Six declarations measured, each producing the intended verdict; new `A-RPL-07` captures the whole overload set. Evidence: `PREBLOB_RECONCILIATION_AND_LAUNCH_MATRIX_20261123.md`, raw `f16-run/out/raw-f16-validation.txt`. |
| F17 | The reviewed blob `create or replace`s `list_group_recruitment_posts` with a 14-column result, which fails with `42P13` on any target still holding the 13-column Stage 6 definition — including CityLink Launch, which has no row 8 | **Fixed by a separate, earlier migration** — `20261119080000_preblob_reconcile_list_group_recruitment_posts.sql` drops only that identity, only when it is 13-column, and no-ops when absent or already 14. The blob is untouched at `5cf0a66a…4887`. Failure reproduced first, then the ordered apply proven at exit 0: `PREBLOB_RECONCILIATION_AND_LAUNCH_MATRIX_20261123.md` §3-§4. |
| F18 | The Launch snapshot records helper posture, row-8 objects and capacity absence, but no `pg_get_function_result`, so ten of the seventeen create-or-replace statements cannot be judged for a return-type collision | **Closed 2026-11-23 by the authorised Launch capture** — every remaining identity either matches the blob's declaration or is absent, so the blob creates it. No new mismatch: `list_group_recruitment_posts` stays the only collision (F17). Matrix §7. |
| F19 | Even after F17 the blob applies on a Launch-shaped target and fails at first call: `group_recruitment_posts.subject` does not exist there and both post reads project it | **Open, outside capacity DDL** — the `subject` column and its three `*_length_chk` constraints are row 8's objects and must exist before this release. Measured: apply at exit 0, first call errors, add the column alone and the read returns rows (matrix §4). |
| F20 | The coordinator's "canonical" helper digests (`5991901a…`, `5e88d56b…`) do not reproduce on CityLink Launch under the published recipe, nor under eight further plausible variants, while the raw body digests match exactly | **Resolved by decision 2026-11-23 13:34 — the measured Launch values are the pin; the canonical family is not used.** The underlying mismatch is a recipe/scope difference, not a body divergence. Declaring the canonical values would `FAIL` `P-H1-DIG`/`P-H2-DIG` on a correct database and close 45007 for the wrong reason. The measured Launch values are recorded in checklist §2.1 and F9 document §9; the canonical family needs its recipe published before it can be used. |

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

## 14. F13 erratum — the "unattached guard" premise was false

**What shipped.** Page 01 row `A-TRG-02` expected `0` non-internal triggers attached
to `public.enforce_invitation_integrity()` and treated any attached target as a stop.

**Why it was wrong.** The expectation was copied from prose in the repository rather
than observed on a database. Three checked-in places assert the guard is unattached:
the Stage 5 header note at `supabase/migrations/20261102131343_stage5_groups.sql:19-21`
("has no trigger on Test or Main"), the reviewed blob's section 6 at
`supabase/migrations/20261119090000_group_hard_max.sql:1167-1178` ("is currently
unattached … the removal helper below remains safe while the guard is unattached"),
and `docs/team/GROUP_CAPACITY_MIGRATION_DRAFT.md:57`. None of them is correct:
`supabase/schema.sql:354-357` attaches the trigger,

```sql
drop trigger if exists invitations_enforce_integrity on public.invitations;
create trigger invitations_enforce_integrity
  before insert or update on public.invitations
  for each row execute procedure public.enforce_invitation_integrity();
```

so a correct CityLink database reports **one** attachment. The consequence was a
false stop on the very gate meant to authorize the release: page 01 `FAIL`ed, the
declared verdict could not be a satisfaction statement, and the wrapper refused with
`group_capacity_gate_verdict_unsatisfied` (45006).

**The attribution, precisely.** The attachment comes from the **base schema file**,
not from a Stage 5 migration; Stage 5 only reproduces the guard _function_ at
`:385` for parity. The distinction matters because a project provisioned from
`supabase/schema.sql` has the trigger regardless of Stage 5, and because it is the
comment in Stage 5 that misled the drafting.

**The corrected assertion (strengthen, not lower).** `A-TRG-02` requires exactly one
non-internal attachment **and** an identity match against a recorded pin; `A-TRG-03`
captures the whole attachment set for the before/after comparison. Identity is the
six-field string `name;schema.table;timing;events;orientation;enabled`, so the pin is

```
invitations_enforce_integrity;public.invitations;before;insert+update;row;origin
```

It is decoded from `pg_trigger.tgtype` (`1` row, `2` before, `4` insert, `8` delete,
`16` update, `32` truncate, `64` instead of) plus `tgenabled`, and was cross-checked
against `pg_get_triggerdef` on 17.12: that function renders `CREATE TRIGGER
invitations_enforce_integrity BEFORE INSERT OR UPDATE ON public.invitations FOR EACH
ROW …` for `tgtype = 23` = 16 + 4 + 2 + 1, which is the decoded identity exactly.

**Why this is strictly stronger than `count = 0`.** The old row passed on a bare
engine and failed on a correct database. The new row fails on an addition (count 2),
on a removal (count 0) and on a rename, retarget or retiming (count 1, identity
mismatch); all three states were produced deliberately in §10.8 and observed to
`FAIL`, and the row returned to `PASS` when the repository DDL was restored. An
addition or removal across an apply is caught by `A-TRG-02` alone; `A-TRG-03` is what
makes the difference visible to a reviewer instead of inferred from a number.

**What was not touched.** No blob edit. The reviewed file is byte-identical at
SHA-256 `5cf0a66a…`, verified before and after the local apply leg, and
`git diff 7114b96..HEAD -- supabase` is empty, so no `supabase/` file changed at all.
The false prose stays where it was reviewed — in applied Stage 5 history and in the
reviewed blob — and is corrected here rather than silently rewritten in either.

**A nuance this finding does not settle.** The attachment is on the legacy
`public.invitations` table, not on `public.group_invitations`, which is what the
capacity RPCs and the removal helper write (page 01 `A-TAB-05`). Measured locally:
zero non-internal triggers on `group_invitations`. So the blob's _behavioural_
conclusion — the removal helper is not obstructed by this guard — may well still hold,
but its _stated reason_ ("the guard is unattached") is false and must never be quoted
as the basis of a security argument. Whether the guard's allowed transitions interact
with the capacity paths on a real target is live behaviour for the authorized
signed-in Test QA, not something static or local work can close.

**What remains open.**

1. The pin is now **measured on Test** (§11.4): an authorized read-only identity
   capture named the attachment and it matched the rehearsal exactly. It is still
   **not measured on CityLink Launch**, which has only ever had the trigger
   _counted_ (1) by the coordinator and never _named_ by this task, which holds no
   access there.
2. **F14 is decided and implemented (§11.5).** Adam chose the release-scoped variant:
   the wrapper accepts CityLink Launch and refuses the frozen Prototype with 45003.
   What that does _not_ do is make the apply possible or authorised — §4.2's static
   blockers still stand, F9's digests still read `UNPINNED`, no application
   authorization exists, and the declared ref remains operator-typed rather than
   proof of which database answered.
3. **New, F16:** page 01's replaced-signature expectations were derived from the
   frozen Prototype's state, and at least `A-RPL-06` asserts an absence that the
   reported Launch state contradicts (the two-argument create is expected present
   there). On the authorised target that row is expected to FAIL until the
   expectation is re-derived from Launch's own captured rows. It was left unrelaxed
   on purpose: re-deriving an expectation from evidence is the fix, editing it to
   match a guess is the defect.

## Adam's next action(s):
