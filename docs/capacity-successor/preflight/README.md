# Successor preflight pages — index and rules

**Status: DRAFT REVIEW ARTIFACTS. Nothing here is a migration, nothing here is
authorization, and no page has been run against Test or Main by Role 6.**

This directory replaces the retired `do $capacity_guard$` block. Adam's
2026-11-22 22:04 decision chose instrument shape option (b): observation pages
that only read, plus one thin wrapper that owns every refusal. The 608-line
guard was not repaired — see `../CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md`
§5 and §12 for what the reshape retires.

## Layout

| Page                                     | Track it serves                          | Gate value                                            |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `00_target_identity_and_engine.sql`      | identity for every track                 | engine major, target markers, locale/encoding capture |
| `01_track_a_capacity_prerequisites.sql`  | A — capacity DDL prerequisites           | gating: decides whether the reviewed blob may apply   |
| `02_track_b_row8_promotion.sql`          | B — row-8 / people-page promotion        | observation: what a target has or lacks               |
| `03_track_c_grant_posture_survey.sql`    | C — RPC grant and security normalization | capture-only: never asserts a repair                  |
| `04_track_d_ledger_identity_capture.sql` | D — migration-ledger identity            | capture-only: no repair, no identity claim            |
| `05_helper_pinning_record.sql`           | A (the G4 pinning obligation)            | produces the pinning record; values must be recorded  |
| `90_apply_gate_wrapper_DRAFT.sql`        | refuses the application, on every track  | the only file here that can raise                     |

## Shared output shape

Every page returns the same six columns so a reviewer can diff two runs:

`page, check_id, subject, expected, observed, verdict`

Verdict vocabulary (no page invents a new value):

| Verdict    | Meaning                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `PASS`     | the observed value satisfies the recorded expectation                       |
| `FAIL`     | the observed value contradicts it — a stop for the track that owns the item |
| `CAPTURE`  | recorded for the record; carries no gate value by design                    |
| `UNPINNED` | the expectation was never supplied, so the check cannot pass honestly       |

`UNPINNED` is deliberately not `PASS`. A page that is green by omission would
recreate the exact failure the retired guard was criticized for.

## Construction rules these pages obey

- `SELECT` only. No `INSERT`/`UPDATE`/`DELETE`, no DDL, no `CALL`, no
  `CREATE TEMPORARY`, no `SET`, no transaction control, no `DO` block, no
  `RAISE`, no `SELECT ... INTO`.
- No `::regclass` (or any other hard cast of a possibly-absent name). Presence
  is tested with `to_regclass`, `to_regprocedure`, `to_regnamespace`,
  `to_regrole`, or a `pg_proc` join, all of which return NULL instead of
  aborting.
- No comparison of a configuration value against a hard-coded rendering
  literal. `proconfig` entries are split into key and value and the value is
  normalized by the published recipe in §6 of the package document.
- Every statement carries an explicit `LIMIT` and selects only the columns the
  row needs.
- Safe to run twice: nothing is written, so a repeat run is a stability check,
  not a side effect.
- No application row is read by any page. Catalog and privilege metadata only.

## How a future authorized run uses them

1. Confirm the connected target out-of-band, then run page `00`.
2. Run the track page(s) that the authorization names; run `05` for the pin.
3. Record every row in
   `../CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md`.
4. Declare the evidence markers and call
   `select private.citylink_capacity_apply_gate();` from `90_...DRAFT.sql`.
   Absent, malformed, incomplete or unsatisfied evidence all refuse, each with
   its own stable token. From 45003 onward the refusal message also carries
   ` target=<ref>`, and the satisfaction row carries `run=<id> target=<ref>`: a
   verdict that does not name the target it was produced for is not evidence.
   Record the emitted message whole, not the token name alone.
5. Only then, and only under Adam's separate Test-only application
   authorization naming the exact SQL head, apply the byte-identical reviewed
   blob in the same session — no `--single-transaction`, no outer `BEGIN`.

Creating the gate function in step 4 is itself DDL. Until that DDL is applied
under an explicit authorization, the fail-closed state is "the gate does not
exist", so step 4 cannot silently pass.

## Rules this reshape learned by executing the pages on PostgreSQL 17

These came out of running every page twice on a disposable 17.12 cluster, not
from reading documentation, and each one is a fail-open risk if it is forgotten:

- **A check that emits no row when the object is missing is a fail-open check.**
  The legacy read-shape rows originally used an inner join and simply vanished
  when a function was absent, leaving a clean-looking page. They now use a left
  join so absence reports `FAIL`. Any future row must be structured to emit a
  verdict in both the present and the absent case.
- **`regexp_replace(src, '--.*', '', 'g')` is wrong.** In PostgreSQL `.` matches
  a newline unless the `n` flag is set, so without `gn` the first `--` in a body
  silently deletes the rest of the function from the hashed input and produces a
  stable, reproducible, wrong digest. Rule 1 of the published recipe uses `gn`
  (package doc §6.1, finding F12).
- **`pg_attrdef` columns are `adrelid`, `adnum`, `adbin`** — not `attrelid` or
  `defrelid`. Defaults are rendered with `pg_get_expr(d.adbin, d.adrelid)`.
- **`pg_get_functiondef` takes an `oid`.** Passing a possibly-absent name
  literal aborts with `invalid input syntax for type oid`, and casting a name
  with `::regprocedure` aborts when the object does not exist. Pages resolve the
  name once with `to_regprocedure(...)` and pass the resulting `oid`, which is
  NULL when absent and therefore yields a row, not an error.
- **Check ids must be unique within a page and non-colliding across pages.**
  Three rows once shared the label `A-LGC-04`; ids are now derived so each row is
  distinct, and the `page` column makes every label globally unambiguous.
- **An expectation copied from prose is an assumption, not a check.** Finding F13:
  page 01 asserted zero attached invitation-integrity triggers because the Stage 5
  header note and the reviewed blob's section 6 comment both described the guard as
  "currently unattached". `supabase/schema.sql:354-357` attaches it, so that row
  failed on every target that exists — including the correct one — while passing
  vacuously on a bare engine. `A-TRG-02` now asserts exactly one attachment whose
  identity equals a recorded pin, and `A-TRG-03` captures the whole set for the
  unchanged-across-apply comparison. Before writing any expectation about a live
  target, read it off a database in that state; package doc §14 is the erratum.
