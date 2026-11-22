# Full preflight rehearsal on the local Supabase-shaped PostgreSQL 17 — results

Coordinator task `HeZwm7CA7Y3rDtYBounkVC`, 2026-11-23 00:16, executing Adam's 00:14 instruction: run the whole option-(b) preflight against the proven local rehearsal environment rather than against a frozen Prototype project. Nothing here touched any Supabase project; the two project queries at the end were read-only catalog counts.

## What was executed

A throwaway PostgreSQL **17.12** cluster (PGDG build, socket-only, `listen_addresses=''`, zero TCP listeners) was shaped like Supabase — schema `auth`, `extensions` with `pgcrypto`, roles `anon`/`authenticated`/`service_role`, minimal `auth.users`, and `auth.uid()`/`auth.role()`/`auth.jwt()` shims — then brought to repository schema state: `supabase/schema.sql` (exit 0), `supabase/seed_citylink_fictional_courses.sql` (exit 0), and all **8/8** checked-in migrations (exit 0), giving 12 public tables.

Then, from branch head `7114b9611294460c59721c04183d099f37ef145c`:

1. all six preflight pages, each run in a session with the `citylink.capacity_*` markers declared;
2. the draft wrapper installed and called eleven times to exercise every branch;
3. the reviewed blob `supabase/migrations/20261119090000_group_hard_max.sql` applied **exactly as reviewed** — no `--single-transaction`, no outer `BEGIN` — with timestamps recorded before and after;
4. post-apply catalog verification;
5. teardown (`pg_ctl -m fast`, directories deleted, `pgrep` 0).

## Page results

| Page                                 | exit | PASS | FAIL  | CAPTURE | UNPINNED |
| ------------------------------------ | ---- | ---- | ----- | ------- | -------- |
| `00_target_identity_and_engine`      | 0    | 4    | 1     | 11      | 3        |
| `01_track_a_capacity_prerequisites`  | 0    | 50   | **1** | 4       | 0        |
| `02_track_b_row8_promotion`          | 0    | 0    | 0     | 17      | 0        |
| `03_track_c_grant_posture_survey`    | 0    | 0    | 0     | 33      | 0        |
| `04_track_d_ledger_identity_capture` | 0    | 0    | 0     | 4       | 0        |
| `05_helper_pinning_record`           | 0    | 3    | 0     | 12      | 2        |

Page 00 confirmed the engine: `C-MAJ-01 = 17` (PASS), encoding `UTF8`, collation `C.UTF-8`, and captured the declared markers. Page 05 confirmed the F7 correction works in practice: `P-H1-CFG` and `P-H2-CFG` — the `proconfig` rendering of both helpers — come back **PASS**, where the retired guard reported a false mismatch for exactly these rows. `P-H1-DIG` and `P-H2-DIG` are `UNPINNED`, which is the honest state: no pin has ever been recorded.

Page 04 raised one error: `relation "supabase_migrations.schema_migrations" does not exist`. That is expected and is an environment limit rather than a defect — a plain PostgreSQL has no Supabase migration ledger, so Track D can only be exercised on a real project.

## F13 — the preflight contains a false stop that would block the release apply

`01_track_a_capacity_prerequisites` row `A-TRG-02` failed:

> subject: `invitation-integrity trigger attachments`
> expected: `0 — the reviewed draft leaves it unattached; an attached target is a stop`
> observed: `1`

The check counts non-internal triggers whose function is `public.enforce_invitation_integrity()`. It returned 1 here, so the page reports FAIL. The coordinator then counted the same thing on both real projects, read-only:

| Target                                     | attached triggers |
| ------------------------------------------ | ----------------- |
| local rehearsal, repository schema state   | 1                 |
| `wkzclgmhrtecnpexfesr` (Prototype, frozen) | **1**             |
| `pijslbchvstkoweslymr` (CityLink Launch)   | **1**             |

So the expectation is wrong about **every** target that exists: the repository's own Stage 5 migrations attach that trigger, both live projects have it attached, and therefore the shipped expectation of 0 can never be satisfied. As written, this row makes the preflight FAIL on CityLink Launch and the wrapper refuse with `group_capacity_gate_verdict_unsatisfied` (45006) — a false stop on the very gate that is supposed to authorize the release. Either the expectation should be 1, or the check should assert something meaningful such as "no duplicate attachment", or the draft genuinely intends to re-attach and the check should verify the _draft's own_ attachment after apply. That is a decision for Role 6, not something the coordinator may patch unilaterally.

This finding is only reachable by running the pages against a database in repository state; it would not have surfaced from reading the SQL, and it would have surfaced at the worst possible moment — during the release window, with Main already mid-sequence.

## F14 — the wrapper hard-codes the Prototype ref and structurally refuses the release target

The wrapper declares `c_test = 'wkzclgmhrtecnpexfesr'` and `c_main = 'pijslbchvstkoweslymr'` as constants. Declaring Main raises `group_capacity_gate_target_out_of_scope` (45003); declaring anything that is not the Prototype ref raises `group_capacity_gate_target_unauthorized` (45004). Under Adam's 00:08 decision the single real apply happens on **CityLink Launch**, so the wrapper as shipped cannot ever authorize the action it exists to gate. A release-scoped variant, or an explicit decision that the release runbook records page verdicts manually instead of calling the wrapper, is required before release.

All eleven wrapper calls behaved exactly as specified, in order: `run_undeclared` (45001), `target_undeclared` (45002), `target_out_of_scope` (45003), `target_unauthorized` (45004), `pages_incomplete` (45005), `verdict_unsatisfied` (45006), `pin_unrecorded` (45007), `engine_unconfirmed` (45008), `artifact_unverified` (45009), and a final call with every marker correct returned `group_capacity_gate_satisfied`. That last call required declaring the Prototype ref while running locally — a logic-path test of the branch, not a claim about any database, and it is recorded as such.

## The reviewed blob applies cleanly, and it demonstrably breaks the old client

Applied as reviewed: exit **0**, zero errors, local SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` — identical to the reviewed blob identity. Preflight and apply timestamps were both recorded (both `2026-11-22T16:15:41Z`; the harness records seconds, so they are indistinguishable, which is a limitation of this harness rather than of the blob).

Post-apply catalog: `study_groups.max_members` exists; **3** `*_capacity` functions exist; `create_group_and_invite` now has **two** signatures, `(uuid,uuid,text)` and `(uuid,uuid,text,integer)`; and calling the three-argument form returns `ERROR: group_capacity_upgrade_required`. That last line is the empirical proof of the whole risk chain the project has been reasoning about: after the blob, the three-argument function that the delivered prototype calls is the fail-closed stub, so the prototype's group creation would fail with a token its bundle cannot interpret. The base schema survived intact — 12 public tables before and after.

## What this rehearsal does not establish

It does not produce an authoritative pin: `P-H1-DIG`/`P-H2-DIG` remain `UNPINNED`, and a 17.12 rehearsal cannot pin a 17.11.0.003 target. It does not exercise Track D (no migration ledger locally), PostgREST, GoTrue sign-in, the browser client or hosting-edge caching. And it says nothing about RLS behaviour under real JWTs, because the claims here are simulated.

## Boundary

Local cluster only, created and destroyed in this sandbox. Two read-only catalog counts were made against the two real projects, both returning a single integer; no application row was read, no migration was applied to any project, no credential was used or printed, and no merge, deployment or publication occurred.

## Erratum — 2026-11-23 00:40, Adam's decision

The `A-TRG-02` row's expectation and its inline comment (`the reviewed draft leaves it unattached; an attached target is a stop`) are **wrong** and are recorded here as an erratum rather than repaired in place. The reviewed blob `supabase/migrations/20261119090000_group_hard_max.sql` stays byte-identical: it was reviewed at SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` and nothing in this finding justifies reopening it. What was wrong was the assumption behind the assertion, not the SQL.

The corrected assertion, as Adam directed, is: **exactly one** non-internal trigger on `public.enforce_invitation_integrity()`; its **identity matches** the recorded pin (name, target table, timing and event); and the set must be **unchanged** across the apply — no addition, no removal. That is a materially stronger check than "count is zero": it detects a silent re-attachment or a dropped guard, which the old expectation could not have detected even if it had passed.
