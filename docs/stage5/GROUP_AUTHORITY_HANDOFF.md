# Stage 5 group authority and leadership — handoff

## Status

The forward-only migration was applied to **CityLink-Stage5-Test** (`wkzclgmhrtecnpexfesr`) on 2026-11-15. Supabase records it as version `20261114163512`, name `20261114162301_stage5_group_authority_and_succession`. The committed SQL source has been renamed to match that recorded version/name. The source branch is `feature/roy-group-workflows`; [PR #2](https://github.com/minstrel1014/CityLink/pull/2) is open against `main` and is not merged.

The Test catalog regression query returned **12/12 checks passed**. The three public workflow RPCs remain `SECURITY DEFINER`, callable by `authenticated`, and not callable by `anon`. The preflight and post-apply aggregate check found no pending invitation/request conflict pairs. No application rows were created, deleted, or otherwise changed by the migration or checks. Supabase Main was not accessed.

## Approved behavior

Approved by the CityLink project lead on 2026-11-15:

- Groups have no capacity or maximum size.
- Only the current group leader may review join requests. The current leader is the active student named by `study_groups.creator_id`.
- For the same student and group, a pending invitation and pending join request must not coexist. Keep the first action; reject the later opposite action with an understandable error.
- When a leader leaves or is removed, transfer `creator_id` to the earliest-joined remaining active member. Resolve equal `joined_at` values by `created_at ASC`, then membership `id ASC`.
- When no active member remains, dismiss the group: set `status='abandoned'`, set `creator_id=NULL`, and expire pending invitations and join requests in the same transaction.
- The existing profile-deletion history trigger must keep anonymization behavior while applying succession/dismissal. Membership updates/deletes also need database-level handling; no new client leave/remove RPC is introduced just for this.

The shared record is `docs/team/DECISIONS.md`.

## Test-only preflight and result

Project: `CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`. Main was not accessed. Inspection and validation were metadata/catalog queries plus aggregate counts; no application identities or message content were read.

- Existing group workflow: `public.send_group_invitation`, `public.request_to_join_group`, `public.review_group_join_request`; internal membership helper: `private.is_active_group_member`.
- Before application, migration history contained the Stage 5 base entries `20261102131343 / 20261102_stage5_groups` and `20261102140927 / 20261102_stage5_course_roster_rpc`; no source files for those migrations exist on GitHub `main`. This correction assumes that existing Stage 5 schema and is not a fresh-database baseline.
- Before application, the exact correction version/name was absent from migration history and the pending invitation/request aggregate check returned `has_pending_conflict=false`. The migration also contains its own fail-closed preflight.
- After application, migration history recorded `20261114163512 / 20261114162301_stage5_group_authority_and_succession`.
- The committed catalog regression SQL returned 12 rows, all `passed=true`. It checked leader-only review, new/old SELECT policy names and predicates, conflict messages and group-row locks, succession ordering and empty-group handling, membership update/delete triggers, profile-delete integration, and absence of opposite pending pairs.
- Authenticated execute privilege remained true and anonymous execute privilege remained false for the three public RPCs. No grants were widened.

## Applied migration

`supabase/migrations/20261114163512_20261114162301_stage5_group_authority_and_succession.sql` is the applied forward-only correction. It contains:

1. A safety preflight that stops if an old pending invitation/request conflict has appeared; it does not choose a winner or rewrite rows.
2. A private, row-locking helper that preserves an active leader, transfers a departed/inactive leader using the approved deterministic order, or abandons an empty forming/active group and expires its pending actions.
3. Membership update/delete triggers to run that helper atomically when active membership ends.
4. An extension of the existing profile-deletion history function—not a competing profile trigger—so deletion retains existing anonymization/cancellation behavior and also transfers or dismisses groups.
5. A revised join-request reviewer check and SELECT policy: a requester sees their own request; only the current active leader sees other requests.
6. Revised invitation/request creation RPCs. Both lock the same group row before checking the opposing pending action, so concurrent attempts serialize. Existing same-action retries remain idempotent. New user-facing errors:
   - Invitation attempt: `student already has a pending join request for this group; review that request instead of sending an invitation`.
   - Join-request attempt: `you already have a pending invitation to this group; respond to that invitation instead of requesting to join`.

No capacity field, maximum, membership cap, reset, rollback, or application of Main is included.

## Files and interfaces

- `supabase/migrations/20261114163512_20261114162301_stage5_group_authority_and_succession.sql` — applied, forward-only Test correction.
- `supabase/tests/stage5_group_authority_catalog.sql` — read-only catalog regression checks; all 12 passed after application.
- `docs/team/DECISIONS.md` — lead-approved behavior and current Test implementation status.
- `docs/stage5/GROUP_AUTHORITY_HANDOFF.md` — this handoff.

Public function signatures and return types stay unchanged:

- `send_group_invitation(uuid, uuid) returns uuid`
- `request_to_join_group(uuid) returns uuid`
- `review_group_join_request(uuid, boolean) returns text`

The two conflict paths raise clear PostgREST-visible exceptions; UI owners should map these messages to actionable feedback. Table grants and RPC execute grants were not widened.

## Checks and results

- `git diff --check` — PASS.
- `corepack pnpm check` — PASS (`tsc --noEmit`).
- `corepack pnpm test` — PASS: 7 files, 47 tests. Test output includes the existing OAuth configuration diagnostic; all tests passed.
- `corepack pnpm build` — PASS. Vite printed a notice that `/api/platform/config.js` could not be bundled without `type="module"`; build completed successfully.
- Independent read-only static review — no definite blocker found; it noted that catalog assertions do not replace functional behavior tests.
- Test migration history, catalog assertions, and execute privileges — verified as above.

Manual multi-account behavior tests (creator versus ordinary active member, conflicting concurrent invitation/request attempts, leader departure, equal-time ordering, final-member departure, and profile deletion) have **not** been run. They need disposable Test accounts/fixtures; no such records were created. Do not claim the full behavior suite has passed until those scenarios are exercised.

## Git/GitHub workflow and next steps

Git is the local branch/commit history; GitHub is the remote branch and PR review service. Work is on `feature/roy-group-workflows`, descended from the approved-decision branch based on `main` `da135199`. Commit `6cb9613` saved the migration/test/docs before the Test application; a follow-up documentation/filename commit will record the exact applied version. The remote feature branch is verified. PR #2 is open for review; PR #1 also remains open. Neither PR has been merged, and this work does not push directly to `main`.

Next: push and verify the follow-up traceability update so PR #2 reflects the applied Test result. A human lead should review the open PR before any merge. Before running manual behavior tests, agree on disposable Test fixtures or provide test accounts; do not reset/delete Test. Never access Supabase Main.
