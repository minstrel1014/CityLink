# CityLink — database target register

**This file overrides any conflicting statement in any other CityLink document.**
If another file says something different about which Supabase project is writable,
that other file is wrong and this register is right. Last verified 2026-11-24
against three independent sources (see §4).

## 1. The register

| ref | Supabase project name | Region | PostgreSQL | Status | Writable? |
|---|---|---|---|---|---|
| `pijslbchvstkoweslymr` | CityLink Launch (read-only until release) | ap-southeast-1 | 17.11.0.003 | **The only authorised target.** This is what the capacity documents call "Main". | **Read-only by default.** Two dated exceptions exist, both executed on 2026-11-24 under Adam's explicit authorization recorded in `docs/team/DECISIONS.md`: `create_group_alone` with the group-visibility widening, and `leave_group` with the one-time creator backfill. Any further write needs a new authorization recorded there *before* execution. |
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

## 5. Older text that still carries the pre-F14 mapping

**General rule — this overrides the list below, and the list is only an illustration.**
Any text written before 2026-11-23 01:50 that calls `wkzclgmhrtecnpexfesr` "disposable
Test", or otherwise implies that ref is writable, is superseded by this register. That
includes applied migration headers, historical handovers and stage documents. Read them
as history; never act on them.

An exhaustive list would be stale the moment it was written. At the time of writing the
repository contains **19 files** using the phrase and **5 applied migrations whose headers
read like apply instructions**. Those five are the real risk, because a header is exactly
the thing someone copies:

| Applied migration | Line | Wording |
|---|---|---|
| `20261117043100_stage5_course_group_invite_candidates.sql` | 3 | "approved applying this migration to disposable Test. Never apply to Main." |
| `20261117205600_stage5_course_detail_group_views.sql` | 3 | "separately approve applying it to disposable Test. Never apply to Main." |
| `20261118050000_stage6_chat_recruitment.sql` | 2, 22 | "Forward-only migration for the disposable Test project only." / "Target: … only; never Main." |
| `20261118083000_stage6_people_page_naming.sql` | 2 | "Authorized by Adam for the disposable Test project only (2026-11-18)." |
| `20261119090000_group_hard_max.sql` | 27 | "targets the disposable Test project only after the …" |

None of these is edited. They are applied migrations: rewriting them would change files
whose digests may be cited in apply records, and would not change anything already applied.
The correction lives here instead.

Documents corrected on 2026-11-24, kept for reference rather than because they still
mislead:

| Document | Treatment |
|---|---|
| `PROJECT_INSTRUCTIONS.md` §"Database, secrets and Preview" (Project shared file) | Correction block inserted; original paragraphs retained and marked superseded. |
| `ENVIRONMENT_STATUS.md` §"Current permissions and blocked live environment" (Project shared file) | Reversed sentence replaced; original retained as a quote. |
| `CITYLINK_RESTORE_GUIDE.md` (Project shared file) | "The Test database" corrected to the frozen Prototype. |
| `CityLink-Handover-2026-11-21.md`, `CityLink-Whole-Project-Recreation-Prompt.md` (Project shared files) | Superseded banner plus inline markers on the bullets that instruct a reader to use the frozen project. |
| `TODO.md` (two unchecked QA items) | Marked blocked, not renamed: there is no project called Test to run them against. |
| `docs/stage6/CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql` | Header replaced with a HISTORICAL note. |
| `docs/team/DECISIONS.md` | F14 entry added on 2026-11-24; the log previously had none. |

## 6. Open items that this register cannot close

1. **PR #59 records a false authorization.** Its `DECISIONS.md` entry states that Adam
   authorized applying the P1 migration to `wkzclgmhrtecnpexfesr`. That ref must never be
   migrated, so the entry has to be corrected before PR #59 merges: keep the fact (a
   preflight was run there), remove the authorization meaning. It is not a label error.
2. **PR #59 and PR #62 both append to `DECISIONS.md` at the same point.** Whichever merges
   second needs a conflict resolution that keeps both entries. Verified by merge simulation
   against `311f800`, not assumed.
3. **The Project shared folder is not shared.** Two tasks in the same Project were given
   different folder ids (`citylink-a4adfcac` and `citylink-4a664a02`) holding divergent
   copies of these governance files. Until that is settled, treat this repository's
   `docs/team/` as the authoritative channel and the shared folder as a convenience.
