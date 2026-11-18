# Stage 5 → Main promotion handoff (reconstructed migrations)

**Prepared:** 2026-11-18 by the project/integration lead task for the CityLink lead (Adam).
**Status:** proposal only. Nothing in this PR has been applied to Test or Main. No SQL was executed.

## Why this exists

The Test project (`CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`) records five Stage 5 migrations:

| Order | Test version                            | Repo file                                                                                  |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1     | `20261102_stage5_groups`                | **reconstructed here** — `supabase/migrations/20261102131343_stage5_groups.sql`            |
| 2     | `20261102_stage5_course_roster_rpc`     | **reconstructed here** — `supabase/migrations/20261102140927_stage5_course_roster_rpc.sql` |
| 3     | `stage5_group_authority_and_succession` | already in the repo                                                                        |
| 4     | `stage5_course_group_invite_candidates` | already in the repo                                                                        |
| 5     | `stage5_course_detail_group_views`      | already in the repo                                                                        |

Files 1 and 2 were applied directly in the Supabase dashboard in early November and were never saved, so the checked-in recipe was incomplete and could not be applied to Main. They were rebuilt on 2026-11-18 by reading Test's catalog only: `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `pg_class` (RLS flags), `information_schema.role_table_grants`, and `pg_get_functiondef`. No application rows were read, no function was invoked, and no database object was changed.

## What the reconstructed files contain

File 1 (`20261102131343_stage5_groups.sql`):

- the four tables `study_groups`, `group_memberships`, `group_invitations`, `group_join_requests`, with the exact columns, defaults, checks, foreign keys and the composite unique key used by the later files;
- all indexes, including the partial unique indexes that enforce one pending invitation/request per student and one active membership per student per course/term;
- RLS enabled on all four tables and the four SELECT policies, including the current-leader-only join-request policy;
- SELECT-only grants to `authenticated` (no direct writes; writes go through the RPCs);
- 11 private helper functions (`is_enrolled`, `both_enrolled_in_course`, `is_current_term`, `lock_current_term`, `lock_course_profile`, `lock_course_profiles`, `is_active_group_member`, `can_view_group`, `maybe_abandon_empty_forming_group`, `recipient_can_receive_invitation`, `shares_course_with`);
- 5 public functions that the later files do not define (`enforce_invitation_integrity`, `create_group_and_invite`, `respond_to_group_invitation`, `cancel_group_invitation`, `cancel_group_join_request`);
- EXECUTE grants: `authenticated` only, revoked from `public` and `anon`.

File 2 (`20261102140927_stage5_course_roster_rpc.sql`):

- `public.list_course_classmates(p_course_id uuid)` exactly as it exists on Test, with `authenticated`-only EXECUTE.

The two membership triggers (`group_memberships_leadership_after_update` / `_after_delete`) are **not** in file 1 because the already-checked-in authority migration creates them. They run after file 1.

## How to apply (after approval)

1. Role 6 reviews both files and confirms they match Test's catalog.
2. Read-only schema comparison of Main vs Test: confirm `profiles`, `courses`, `enrolments`, `academic_terms`, `citylink_settings` exist, and that `courses(id, term_id)` is unique (the composite foreign keys depend on it).
3. Back up Main.
4. Apply the five files in version order.
5. Verify: four tables, indexes, RLS, policies, function list, and one signed-in smoke test.

## Known risks and open decisions

- **Roster privacy:** `list_course_classmates` returns `student_id` and `status`. Role 6 flagged this against the later current-term field allowlist. Decide before step 4 whether to tighten it or accept it as-is with a follow-up.
- **Dependency check:** if Main lacks `courses(id, term_id)` uniqueness or `citylink_settings`, file 1 will fail. The schema comparison in step 2 must happen first.
- **Fidelity:** the reconstruction reproduces the **current** catalog state, not the original 2026-11-02 text. Because the later three migrations replace the functions they own, applying all five files in order produces the same final schema as Test.
- **No SQL execution in this task:** syntax was checked statically (balanced `$function$` blocks, statement counts). Role 6 must confirm before any application.

## Owner ledger

- Human owner: Adam (project lead).
- Prepared by: project/integration lead task (Manus).
- Reviewers: Role 6 (database security), Eunice (verification).
- Manus never accesses Main. Applying to Main is the lead's action.
