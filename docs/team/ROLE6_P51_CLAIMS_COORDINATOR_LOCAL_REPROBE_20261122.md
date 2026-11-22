# Role 6 PR #51 claims — coordinator local-engine re-probe (2026-11-22 20:31 HKT)

Purpose: do not accept Role 6's two NEW blocking findings (F7, F8) or his runbook finding (F10) on trust. Script `probe-role6-claims-20261122.sh` in this task's scratch directory, re-run here. Engine: the same disposable PostgreSQL **16.15** binaries already present in this sandbox (`/usr/lib/postgresql/16/bin`), a fresh cluster under `/tmp`, `initdb -A trust --no-sync`, `listen_addresses=''`, socket-only; **TCP_LISTENERS=0**; cluster stopped with `-m fast` and deleted, `procs=0`.

**Zero Supabase contact.** Test `wkzclgmhrtecnpexfesr` and Main `pijslbchvstkoweslymr` were not contacted; no connector call, no credential read, no `.env` output. All objects below are synthetic single-user objects in a throwaway cluster created by the `postgres` OS superuser, so they carry no CityLink ACL meaning and cannot express RLS or grant conclusions — they exist only to test parser, identifier, operator-resolution and transaction-boundary behaviour.

## C1 — Role 6 F7: G3's `search_path` predicate is a guaranteed false positive — REPRODUCED

Created with the blob's own `set search_path to ''` syntax, then read the way guard `:224`–`:226` reads it (`coalesce((select string_agg(c, ',' order by c) from unnest(p.proconfig) c), '<none>') <> 'search_path='`):

```text
 rendered=search_path=""
 guard_rule_says_mismatch=YES(false positive on a correctly pinned helper)
 validated_predicate_a=passes
```

My reading matches his: the engine renders the element as `search_path=""`, never `search_path=`, so the drafted rule fails a **correctly** pinned helper, while his parsed predicate (split_part on `=`, quote-stripped empty value) passes on the same object. Guard `:224` confirmed in source: `if v_config <> 'search_path=' then`.

## C2 — Role 6 F8: five hard `'name'::regclass` casts abort the block — REPRODUCED

```text
ERROR:  relation "public.courses" does not exist      -- from the `to_regclass(...) is not null and 'public.courses'::regclass is not null` form
ERROR:  relation "public.study_groups" does not exist  -- from the unguarded pg_constraint count form
 to_regclass_form  = 0                                 -- the to_regclass-only comparison is safe and yields "no rows"
```

So short-circuit evaluation is **not** relied upon safely: the hard cast was evaluated even though `to_regclass('public.courses') is not null` was false. His site list matched my grep exactly: `:187`, `:324`, `:360`, `:501`, `:512` (5 sites). `:512` is unguarded, i.e. a target without `public.study_groups` aborts instead of reporting.

## C3 — Role 6 F5 refinement: which array forms actually work — REPRODUCED

```text
ERROR:  malformed array literal: "a, with comma"   -- v := v || '<literal>'
NOTICE:  array_cat form {ok-array-cat}             -- v := v || array['…']
NOTICE:  append form {ok-append}                   -- v := array_append(v, '…')
```

Both `array_append` **and** `v || array['…']` work, so my earlier statement that "only array_append worked" was too narrow; his refinement is correct and his recommendation (use `array_append`, because it cannot silently re-select `array_cat` in a multi-line chain) is sound.

## C4 — Role 6 F2 refinement: `to_regprocedure` semantics — REPRODUCED

```text
 absent_parenthesized = NULL-no-abort    -- to_regprocedure('public.definitely_absent_fn(uuid)')
 bare_name            = NULL-no-abort    -- to_regprocedure('now')  (silently "missing", hence his constraint note)
 ERROR: function to_regfunction(unknown) does not exist
```

The mechanical swap is safe **only** while every site passes a fully parenthesized signature; a bare name reads as "object missing" without error. That must be written into the file, as he says.

## C5 — Role 6 F10: the reviewed blob's own `begin;`/`commit;` defeats `--single-transaction` — REPRODUCED with a clean capture

File style taken from the blob itself (`begin;` at blob `:39`, `commit;` at blob `:1756`, both anchors confirmed here):

```text
psql:<stdin>:1: WARNING: there is already a transaction in progress
BEGIN / CREATE TABLE / COMMIT / CREATE TABLE
WARNING: there is no transaction in progress
tables_surviving=f10_a,f10_b
```

Both tables survived a `psql --single-transaction` run, i.e. the file's internal `commit;` ended the wrapper and the statement after it ran in autocommit. Therefore any runbook that claims mechanical atomicity by wrapping the blob is wrong; the blob is atomic only when run as-is (his own `begin; … rollback;` probe showed the internal rollback works). This is a checklist instruction, and it sharpens the two-step residual: the two steps cannot be bound by `--single-transaction`.

## C6 — Main-ineligibility legs re-derived on a Main-shaped local database — REPRODUCED

```text
ERROR:  column g.subject does not exist        -- language sql wrapper declaring subject: fails AT CREATION
plpgsql_created_ok                             -- language plpgsql read referencing p.subject: creates fine
ERROR:  column g.subject does not exist        -- and fails only when first called (silent landmine)
```

Together with his third leg (dropping `create_group_and_invite(uuid,uuid)` leaves 0 create RPCs), the claim "Main cannot host this DDL as drafted" is now reproduced by two independent engines rather than inference.

## Anchor and count reconciliation at `bc6a6d5`

| Claim                                 | Role 6                                                                  | Coordinator recount                                                                    | Status                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| raise sites total / offending         | 7 / one at `:604`                                                       | 4 `raise exception` (`:127 :136 :153 :594`) + 3 `raise notice` (`:587 :590 :604`)      | agrees; my earlier "line 605" was the continuation line of the same statement            |
| `to_regfunction` call sites           | 19                                                                      | 19 with `to_regfunction(` + 1 comment mention at `:198` = 20 lines                     | agrees; my earlier "19 uses" stands                                                      |
| `pg_proc.proallargnames`              | 3 (`:376 :390 :409`)                                                    | 3                                                                                      | agrees                                                                                   |
| `d.roleid`                            | 1 (`:568`)                                                              | 1, and `defaclrole` appears 0 times                                                    | agrees                                                                                   |
| accumulators / `array_append`         | 44 / 0                                                                  | 44 / 0                                                                                 | agrees                                                                                   |
| hard `::regclass`                     | 5                                                                       | 5 (`:187 :324 :360 :501 :512`)                                                         | agrees                                                                                   |
| row-into-variable `SELECT … INTO v_*` | 13 (`:216 :296 :374 :388 :407 :450 :461 :498 :510 :527 :551 :571 :576`) | 13, same anchors                                                                       | agrees (my first grep pattern was too strict and said 7 — corrected, no artifact change) |
| `v_sig regprocedure` unused           | declared `:114`, 1 occurrence                                           | present at `:114` as column-aligned `v_sig      regprocedure;`, 0 references elsewhere | agrees (my first grep missed it because of the alignment spaces)                         |
| guard/blob sizes                      | 608 / 1756 lines                                                        | 608 / 1756                                                                             | agrees                                                                                   |

## What this does and does not establish

Reproduced here: parser behaviour, catalog column/function existence, operator resolution, `proconfig` rendering, and transaction-boundary semantics on PostgreSQL 16.15. **Not** established: anything about the actual Test engine's major version, its catalog state, CityLink ACL/RLS, or the production data shape — the Test engine version is still unverified, and Role 6's own boundary says the same. Both engines agreeing on 16.15 raises confidence in the defect classes, not in the target's state.

No repository file was modified by this probe; the guard and blob were read from the detached review tree at `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`. Repair material, if Adam chooses option (a), belongs to a future Role 6 assignment, not to this record.

## Adam's next action(s):

The instrument-shape decision (repair the DO-block guard versus replace it with a SELECT-only preflight plus a thin refusal wrapper) is now the blocking item, because it determines the content of the next Role 6 assignment; the real-parser acceptance gate and the F10 runbook prohibition are the two wording approvals that follow from it. Nothing here requests migration, Test access, signed-in QA, merge, ready transition, deployment or publication approval.
