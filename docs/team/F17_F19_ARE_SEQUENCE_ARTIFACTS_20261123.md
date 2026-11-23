# F17 and F19 are artefacts of skipping step 1, not properties of Launch

Coordinator finding, 2026-11-23 13:13. Role 6's work on PR #52 is careful and its 42P13 reproduction is genuine — but it reproduced a failure that only exists when the recorded release order is not followed. This note records why, with the evidence, so the release plan is not enlarged on the strength of a simulation of a state that will never occur.

## What Role 6 measured

On a target shaped like CityLink Launch — repository schema, the checked-in migrations, but **not** `20261118083000_stage6_people_page_naming.sql` — the reviewed blob aborts at `:1749` with 42P13 and the transaction rolls back (F17). After adding the reconciliation file, the blob applies at exit 0, but the first call fails with `column p.subject does not exist` (F19). From those two results Role 6 concluded that Launch needs row-8 promotion authorised before the capacity release, and that a reconciliation migration is required.

## What the recorded release order already does

Adam's recorded release sequence is: apply `20261118083000_stage6_people_page_naming.sql`, **then** the reviewed blob. That first file, which is already checked in on `main`, does exactly the work whose absence produced both findings:

- `:510` `alter table public.group_recruitment_posts add column subject text;`
- `:519-520` adds `group_recruitment_posts_subject_length_chk` (`char_length(subject) between 1 and 120`)
- `:636` `drop function public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer);` and then recreates it with **14** output columns, `subject` fourth
- `:85` drops `create_group_and_invite(uuid, uuid)`, and `:525`/`:589` replace `create_group_recruitment_post` and `edit_group_recruitment_post` with three-argument forms

So after step 1, the function is already 14 columns, the blob's `create or replace` matches the existing result type, and `subject` exists as a column. F17 and F19 both dissolve.

## The evidence that this is not a theory

The coordinator's own rehearsal at 00:16 applied the full repository sequence — `supabase/schema.sql`, the fictional seed, then **8/8** checked-in migrations including `stage6_people_page_naming`, then the reviewed blob as reviewed — and got **exit 0, zero errors**, ending with `max_members`, three `*_capacity` functions, both `create_group_and_invite` signatures, and 12 public tables intact. That is the recorded release order, executed, and it works.

Role 6's harness removed step 1 and then reported that step 2 fails. Both results are correct about their own inputs; only one of them corresponds to the plan.

## What this changes

1. **No Track B sequencing decision is needed beyond confirming the order already recorded.** Row 8 is not a new prerequisite to authorise; it is step 1 of the existing plan.
2. **The reconciliation migration is not required under that order.** Applied after row 8 it is an idempotent no-op (already 14 columns, so it does nothing). It is therefore harmless but also pointless in the release window, and adding an unneeded migration to a release is a cost rather than a safety gain. Keeping it in the repository as a documented contingency is reasonable; scheduling it into the release is not.
3. **The real remaining Launch blockers are unchanged**: the F9 helper digests are `UNPINNED` so the gate refuses with 45007 by design, and `A-RPL-06` had to become target-relative. Neither is affected by this note.

## What Role 6 should do differently next time

Its harness should model the **release sequence**, not the current state of the target. "Launch-shaped" meant "Launch as it is today", which is a state the release never applies against. A harness that skips a planned step will keep discovering failures that the plan already prevents, and each one costs a review cycle.

## F18, closed on the coordinator side

Role 6 reported that ten of seventeen identities could not be judged because the Launch snapshot lacked `pg_get_function_result`. That was my snapshot's fault, not the database's: I abbreviated several column lists without types. A second read-only query returns the full result for all 25 public functions on Launch, with complete types, and is now attached as `LAUNCH_CATALOG_SNAPSHOT_20261123.md` (revised). F18 is therefore a documentation gap I created, and it is closed; no new authorisation is needed to enumerate types that are already enumerable.

One correction worth carrying into the matrix: the blob contains **17** `create or replace` statements across **13** distinct function names, which is why my earlier "thirteen functions" count and Role 6's "seventeen statements" count are both right about different things.
