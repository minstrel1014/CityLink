# Stage 6 plan — master checklist

**Recorded:** 2026-11-18, by the project/integration lead task for the CityLink lead (Adam). This is the single list to track Stage 6, the Stage 5 promotion to Main, and the demo. Status is updated as each step is completed.

## Status legend

`Done` · `In progress` · `Waiting` · `Blocked`

## A. Code merges

| Step                                                                                                                                                                                                | Owner              | Gate                                                                                                                                                            | Status  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A1. Shell PR built by the repair task, then reviewed and merged                                                                                                                                     | Repair task + lead | [PR #9](https://github.com/minstrel1014/CityLink/pull/9) open and mergeable at `d0a77b8`; desktop Preview verified; mobile and multi-account checks outstanding | Waiting |
| A2. Jeffery merges latest `main` into `feature/jeffery-group-chat-recruitment` (no rebase, no force-push), resolves conflicts keeping both sides, re-runs `pnpm check` / `pnpm test` / `pnpm build` | Jeffery            | A1 merged                                                                                                                                                       | Waiting |
| A3. Re-review and merge PR #5                                                                                                                                                                       | Lead task          | A2 checks pass                                                                                                                                                  | Waiting |
| A4. Merge PR #8 (merge-order decision + this plan, docs only)                                                                                                                                       | Lead               | None                                                                                                                                                            | Waiting |
| A5. Decide PR #3 (fictional classmate list) and merge PR #4 (Role 6 handoff docs)                                                                                                                   | Lead               | None                                                                                                                                                            | Waiting |

**Shell PR note (2026-11-18):** the repair task reports PR #9 (`feature/adam-ux-shell`) is open, mergeable and unmerged at `d0a77b8`. A signed-in desktop Preview of Invitations loaded with no console output; no actions were submitted. Signed-in mobile, other routes and multi-account creator-authorization checks are still outstanding. The branch does not enforce Test-only URL/key itself, so the launch environment must be checked before any future Test Preview.

## B. Stage 5 → Main promotion (do before Stage 6 reaches Main)

| Step                                                                                                                                          | Owner                            | Gate                          | Status                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| B1. Rebuild the two missing Stage 5 migrations from Test (`20261102_stage5_groups`, `20261102_stage5_course_roster_rpc`) and open a review PR | Lead task (Test read-only)       | None                          | Done — [PR #10](https://github.com/minstrel1014/CityLink/pull/10), 2026-11-18                                    |
| B2. Role 6 reviews the complete five-file Stage 5 migration set                                                                               | Role 6                           | B1 PR                         | Waiting                                                                                                          |
| B3. Read-only schema comparison of Main vs Test                                                                                               | Lead / authorized task           | B2                            | Done — 2026-11-18: Main lacks `academic_terms`, `citylink_settings`, `courses.term_id` and all four group tables |
| B3a. Reconstruct the **term-model** migration (`academic_terms`, `citylink_settings`, `courses.term_id` backfill, `courses_id_term_id_uidx`)  | Lead task                        | Adam decides the current term | Done — PR #10 @ `d1d451d`; current term **2026-Fall**; waiting Role 6 re-review                                  |
| B4. Back up Main (Supabase → Database → Backups)                                                                                              | Lead                             | B3                            | Waiting                                                                                                          |
| B5. Apply the five Stage 5 migrations in order to Main                                                                                        | Lead (Manus never accesses Main) | B4 + explicit approval        | Waiting                                                                                                          |
| B6. Verify Main: tables, RPCs, RLS, one signed-in smoke test                                                                                  | Lead + Eunice                    | B5                            | Waiting                                                                                                          |
| B7. Tighten `list_course_classmates` (remove `student_id`, `status`) + client update, before Stage 6 launch                                   | Roy + Eunice                     | Lead chose A on 2026-11-18    | Waiting                                                                                                          |

**Known risk:** Role 6 flagged that `list_course_classmates` returns `student_id` and `status`, and the profiles policy allows any shared-course peer across terms. Decide whether to tighten before B5 or track as a follow-up.

**Comparison result (2026-11-18, read-only catalog on Main):** Main has only `profiles`, `courses`, `enrolments`, `invitations`. Its `courses` table has `semester` but **no `term_id`**; `academic_terms` and `citylink_settings` do not exist; no group tables or group functions exist. Main already has `private.both_enrolled_in_course`, `private.shares_course_with`, `private.recipient_can_receive_invitation`, `public.enforce_invitation_integrity` (identical to Test) and `visible_course_enrolments`. The five Stage 5 files therefore cannot run on Main until a preparatory term-model migration is written, reviewed and applied.

## C. Stage 6 migration to Test

| Step                                                                                                                     | Owner                     | Gate         | Status  |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------ | ------- |
| C1. Role 6 reviews the corrected Stage 6 draft (abandoned-group join requests `expired`, recorded in `reviewed_at`)      | Role 6                    | PR #5 merged | Waiting |
| C2. Lead separately approves applying the migration to Test                                                              | Lead                      | C1           | Waiting |
| C3. Apply the migration to Test only                                                                                     | Lead task (with approval) | C2           | Waiting |
| C4. Signed-in multi-account tests on Test (chat send/read, former-member read-only, recruitment create/edit/close/apply) | Eunice + Jeffery          | C3           | Waiting |

## D. Demo

| Step                                                                           | Owner     | Gate | Status  |
| ------------------------------------------------------------------------------ | --------- | ---- | ------- |
| D1. Sync latest `main` into the Webdev project, run checks, save a checkpoint  | Lead task | C4   | Waiting |
| D2. Publish to the public demo (Auto Publish is on) and verify the live bundle | Lead task | D1   | Waiting |

**Rule:** never sync the demo before the Stage 6 migration is applied, or chat/recruitment pages will show “API unavailable”.

## E. Other open items

| Item                                                                                        | Owner         | Status  |
| ------------------------------------------------------------------------------------------- | ------------- | ------- |
| PR #6 notification icon backlog: needs answers on group-only v1 and browser-only read state | Lead + Eunice | Waiting |
| PR #3 fictional classmate list: keep-and-adapt or close                                     | Lead          | Waiting |
| PR #4 Role 6 handoff docs: merge                                                            | Lead          | Waiting |

## Update rule

When a step is done, change its status here and add a one-line note with the date, the commit or PR, and the check result. Do not delete finished rows; they are the project record.
