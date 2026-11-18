# Stage 5 → Main promotion handoff (term model + reconstructed migrations)

**Prepared:** 2026-11-18 by the project/integration lead task for the CityLink lead (Adam).
**Status:** SQL approved by Role 6 at `e4f77db` from the database/security side; this document was corrected on 2026-11-18 to match. **Nothing has been applied to Main and no SQL was executed.** Main changes still need a verified backup and the lead's separate approval.

## Why this exists

Test (`CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`) records five Stage 5 migrations, but two were applied directly in the dashboard and never saved. Main is also missing the earlier **term model** that Test already has (`courses.term_id`, `academic_terms`, `citylink_settings`). The complete Main recipe is therefore **six files**:

| Order | Source              | Repo file                                                                                     |
| ----- | ------------------- | --------------------------------------------------------------------------------------------- |
| 1     | new — term model    | `supabase/migrations/20261102090000_stage5_term_model.sql`                                    |
| 2     | reconstructed       | `supabase/migrations/20261102131343_stage5_groups.sql`                                        |
| 3     | reconstructed       | `supabase/migrations/20261102140927_stage5_course_roster_rpc.sql`                             |
| 4     | already in the repo | `supabase/migrations/20261114163512_20261114162301_stage5_group_authority_and_succession.sql` |
| 5     | already in the repo | `supabase/migrations/20261117043100_stage5_course_group_invite_candidates.sql`                |
| 6     | already in the repo | `supabase/migrations/20261117205600_stage5_course_detail_group_views.sql`                     |

Files 2 and 3 were rebuilt on 2026-11-18 from Test's catalog only: `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `pg_class` (RLS flags), `information_schema.role_table_grants`, and `pg_get_functiondef`. No application rows were read, no function was invoked, and no database object was changed.

## What each file contains

**File 1 — term model (`20261102090000`).** Creates `academic_terms` and `citylink_settings` exactly as on Test, creates one term per distinct `courses.semester`, backfills `courses.term_id`, inserts the lead-approved current term **`2026-Fall`** (Main's only semester string), and aborts if any course has no term or no course is linked to `2026-Fall`. Then adds the `term_id` foreign key, `courses_id_term_id_uidx`, `courses_term_id_idx`, RLS and the two SELECT policies. It writes course data.

**File 2 — groups baseline (`20261102131343`).** The four tables `study_groups`, `group_memberships`, `group_invitations`, `group_join_requests` with their columns, defaults, checks, foreign keys and composite unique key; all indexes (including the partial unique ones); RLS plus four SELECT policies. The join-request policy here is the **original 2026-11-02** policy `"requester and members read join requests"`; the later authority migration (file 4) drops it and creates the current-leader-only policy. Table grants are SELECT-only for `authenticated`. The file also defines 11 private helpers and 5 public functions (`enforce_invitation_integrity`, `create_group_and_invite`, `respond_to_group_invitation`, `cancel_group_invitation`, `cancel_group_join_request`). `authenticated` gets EXECUTE on only the six helpers Test allows; the locking helpers and `maybe_abandon_empty_forming_group` stay `postgres`-only. `enforce_invitation_integrity` has no trigger on Test or Main; it is kept for parity and documented as unused.

**File 3 — roster RPC (`20261102140927`).** `public.list_course_classmates(p_course_id uuid)` exactly as on Test, with `authenticated`-only EXECUTE. Per the lead's decision A, it keeps `student_id` and `status` for this release; tightening is a follow-up before Stage 6 launch.

**Files 4–6.** Already checked in and unchanged. File 4 also creates the two membership triggers, which is why they are not in file 2.

## How to apply (after approval)

1. Role 6 database/security approval — **done** at `e4f77db`.
2. Read-only Main vs Test comparison — **done 2026-11-18**: Main has only `profiles`, `courses`, `enrolments`, `invitations`; it lacks the term model and all group objects.
3. **Back up Main.** The Free plan has no automated backups, so export with the Supabase CLI or `pg_dump` and keep the files encrypted.
4. Apply the six files in order, one at a time, verifying after each and stopping at the first error.
5. Verify: four group tables, all indexes, RLS and policies, function list, and one signed-in smoke test.

## Known risks and open decisions

- **Roster privacy (decided A):** `list_course_classmates` keeps `student_id` and `status` during this release. A follow-up migration before Stage 6 launch removes them together with the client update; the interim exposure is documented in `docs/team/DECISIONS.md`.
- **Term string dependency:** the term model aborts if no course is linked to `2026-Fall`, so a mismatch fails loudly instead of misconfiguring current-term checks.
- **Fidelity:** file 2 reproduces the **2026-11-02 baseline**, not today's Test state; files 4–6 bring it to the current Test state. Applying all six in order produces the same final schema as Test.
- **No SQL executed:** Role 6 parsed the files statically (80, 5 and 25 statements) with no syntax errors. Execution still requires the backup and the lead's separate approval.

## Owner ledger

- Human owner: Adam (project lead).
- Prepared by: project/integration lead task (Manus).
- Reviewers: Role 6 (database security), Eunice (verification).
- Manus accesses Main only under a written, recorded authorization. Applying the migrations needs a new, explicit authorization after the backup.

## Revision history

- **2026-11-18 (a):** Role 6 review — fixed duplicate policy name, added `courses_id_term_id_uidx`, limited helper grants to the six Test allows; added the term model.
- **2026-11-18 (b):** current term corrected to `2026-Fall`; lead chose option A for the roster RPC.
- **2026-11-18 (c):** documentation corrections after Role 6 re-review at `e4f77db` — six-file runbook, original policy name, baseline fidelity wording, decision A recorded, `2026-Fall` everywhere.
