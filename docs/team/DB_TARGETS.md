# CityLink — database target register

**This file overrides any conflicting statement in any other CityLink document.**
If another file says something different about which Supabase project is writable,
that other file is wrong and this register is right. Last verified 2026-11-24
against three independent sources (see §4).

## 1. The register

| ref | Supabase project name | Region | PostgreSQL | Status | Writable? |
|---|---|---|---|---|---|
| `pijslbchvstkoweslymr` | CityLink Launch (read-only until release) | ap-southeast-1 | 17.11.0.003 | **The only authorised target.** This is what the capacity documents call "Main". | **No** — read-only until release. A write needs Adam's explicit written authorization recorded in `docs/team/DECISIONS.md` *before* execution. |
| `wkzclgmhrtecnpexfesr` | CityLink Prototype (do not migrate) | eu-west-1 | 17.11.0.011 | **Frozen historical reference.** Out of scope since F14 (2026-11-23 01:50). The capacity gate refuses it with `45003 group_capacity_gate_target_out_of_scope`. | **No** — never. Read-only catalog inspection only where separately justified. |

Copy the ref from this table. Do not retype it: a single transposed letter
(`wkzglcm…` for `wkzclgm…`) produces a ref that exists nowhere and fails late.

## 2. The refs never changed — the writability did

This is the part that misleads readers of older documents.

- `pijslbchvstkoweslymr` has always been the same project. It was called **Main**;
  it is now named **CityLink Launch**.
- `wkzclgmhrtecnpexfesr` has always been the same project. It was called **Test**;
  it is now named **CityLink Prototype**, and it is **frozen**.

So the old documents name the right refs and draw the wrong conclusion. Any sentence
of the form "disposable Test `wkzclgmhrtecnpexfesr`" is a **writability claim** that
became false at 2026-11-23 01:50. The correct reading of pre-F14 text is:
"Test" → Prototype (frozen), "Main" → Launch (read-only until release).

**There is no project called Test any more.** The word survives only as history.

## 3. Before any write, in this order

1. Read this file and copy the target ref from §1.
2. Confirm the ref against the live project name returned by Supabase — the names
   carry their own warning ("do not migrate", "read-only until release").
3. Confirm a dated authorization exists in `docs/team/DECISIONS.md` naming the ref,
   the commit head and the exact SQL blob. An undated instruction paragraph is not
   an authorization.
4. Declare `target=<ref>` in the apply session and assert it against this register,
   aborting on mismatch. The capacity gate already does this; any new migration
   must do the same rather than rely on the operator remembering.

If step 3 fails, stop. There is no default target.

## 4. Why this file can be trusted

Three independent sources agree, and none of them is a summary written by the agent
that made the mistake:

1. `docs/capacity-successor/CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md`
   §4.1 (Prototype frozen, refused with 45003) and §4.2, which states outright:
   "'Main' in this document is the CityLink Launch project."
2. `supabase/migrations/20261119085000_capacity_apply_gate.sql:113` —
   `c_frozen constant text := 'wkzclgmhrtecnpexfesr'`, refused at line 139 with
   SQLSTATE `45003`.
3. The rename record in `OWNER_TASK_LEDGER.md` (2026-11-22 22:40), verified read-only
   at the time: both projects renamed, refs unchanged, "every earlier record calling
   Test 'the migration target' is superseded as historical."

## 5. Known documents that still carry the old mapping

Listed so a reader knows what to discount, not because they should be rewritten.
Historical records stay as history; they are annotated, never silently edited.

| Document | Status |
|---|---|
| `PROJECT_INSTRUCTIONS.md` §"Database, secrets and Preview" (Project shared file, not in this repo) | Correction block inserted 2026-11-24; original text retained and marked superseded. |
| `ENVIRONMENT_STATUS.md` §"Current permissions and blocked live environment" (Project shared file) | Corrected 2026-11-24; original sentence retained as a quote. |
| `CityLink-Handover-2026-11-21.md` (Project shared file) | Superseded banner and inline markers added 2026-11-24. |
| `CityLink-Whole-Project-Recreation-Prompt.md` (Project shared file) | Superseded banner and inline marker added 2026-11-24. |
| `TODO.md` (two unchecked QA items), `docs/stage6/CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql` | Corrected 2026-11-24 in this change; the TODO items are marked blocked rather than renamed, because there is no project called Test to run them against. |
| `supabase/migrations/20261118050000_stage6_chat_recruitment.sql` line 22 | **Deliberately not edited.** It is an applied migration; applied migrations are never rewritten, and editing it would change a file whose digest may be cited elsewhere. Recorded here as historical instead. |
| `docs/team/DECISIONS.md` | Had no F14 entry until 2026-11-24; one is added in this change. |
