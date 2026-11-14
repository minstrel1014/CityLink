# Stage 5 group authority and leadership — handoff

## Status

Implementation is prepared on `feature/roy-group-workflows`; the Test migration has **not yet been applied**. This document will be updated with exact validation, GitHub PR, and post-application results before handoff.

## Approved behavior

Approved by the CityLink project lead on 2026-11-15:

- Groups have no capacity or maximum size.
- Only the current group leader may review join requests. The current leader is the active student named by `study_groups.creator_id`.
- For the same student and group, a pending invitation and pending join request must not coexist. Keep the first action; reject the later opposite action with an understandable error.
- When a leader leaves or is removed, transfer `creator_id` to the earliest-joined remaining active member. Resolve equal `joined_at` values by `created_at ASC`, then membership `id ASC`.
- When no active member remains, dismiss the group: set `status='abandoned'`, set `creator_id=NULL`, and expire pending invitations and join requests in the same transaction.
- The existing profile-deletion history trigger must keep anonymization behavior while applying succession/dismissal. Membership updates/deletes also need database-level handling; no new client leave/remove RPC is introduced just for this.

The shared record is `docs/team/DECISIONS.md`.

## Test-only preflight

Project: `CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`. Main was not accessed. The inspection was metadata-only, plus aggregate counts; no application identities or message content were read.

- Existing group workflow: `public.send_group_invitation`, `public.request_to_join_group`, `public.review_group_join_request`; internal membership helper: `private.is_active_group_member`.
- Current faulty join-request SELECT policy: `requester and members read join requests`.
- Existing profile deletion trigger: `profiles_archive_citylink_history_before_delete`, calling `private.archive_deleted_profile_citylink_history()`. It anonymizes deleted profiles, sets their active memberships to `account_deleted`, cancels their pending invitations/requests, and clears `creator_id`; for an active group it did not transfer leadership.
- Authenticated users have SELECT grants on group tables; trusted definer RPC/trigger paths own coordinated writes. No membership leave/remove RPC or membership-table trigger existed.
- Counts immediately before preparation: pending invite/request conflict pairs **0**; forming/active groups with no active profile membership **0**; active groups whose creator was not an active member **0**.
- Test migration history already contains `20261102131343 / 20261102_stage5_groups` and `20261102140927 / 20261102_stage5_course_roster_rpc`; their source files are absent from GitHub `main`. This correction migration assumes that existing Stage 5 schema and is not a fresh-database baseline.

## Prepared migration

`supabase/migrations/20261114162301_stage5_group_authority_and_succession.sql` is forward-only and contains:

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

- `supabase/migrations/20261114162301_stage5_group_authority_and_succession.sql` — forward-only Test correction.
- `supabase/tests/stage5_group_authority_catalog.sql` — read-only catalog regression checks to run after application; does not create test data.
- `docs/team/DECISIONS.md` — lead-approved behavior and API/data implications.
- `docs/stage5/GROUP_AUTHORITY_HANDOFF.md` — this handoff.

Public function signatures and return types stay unchanged:

- `send_group_invitation(uuid, uuid) returns uuid`
- `request_to_join_group(uuid) returns uuid`
- `review_group_join_request(uuid, boolean) returns text`

The two conflict paths raise clear PostgREST-visible exceptions; UI owners should map these messages to actionable feedback. Table grants and RPC execute grants are not widened.

## Checks and test plan

Pending before application:

- `git diff --check` — whitespace/conflict-marker check.
- `corepack pnpm check` — TypeScript check; a pass means the existing application types still compile.
- `corepack pnpm test` — repository unit tests; a pass means the existing tests remain green, not that database behavior was functionally exercised.
- `corepack pnpm build` — production app build; a pass means the source still builds.
- After applying only to Test, run `supabase/tests/stage5_group_authority_catalog.sql`; every `passed` value must be true, then re-list migration history and re-read the policy/function/trigger catalog.

Manual multi-account behavior tests (creator versus ordinary active member, conflicting concurrent invitation/request attempts, leader departure, equal-time ordering, final-member departure, and profile deletion) still require dedicated disposable Test accounts/fixtures and must be run by the project before release. No such records were created as part of this change.

## Git/GitHub workflow and next steps

Git is the local branch/commit history; GitHub is the remote branch and PR review service. Work is on `feature/roy-group-workflows`, based on the clean approved-decision branch, whose base is current `main` `da135199`. The repository `main` will not be pushed to or merged by this task.

Next: run the listed checks; commit only these migration/test/decision/handoff files on the feature branch; push that branch; verify its remote SHA; open/update a PR for review; apply the reviewed migration only to Test; run the read-only catalog checks; update this file with exact results and the PR URL. Do not reset, roll back, or access Supabase Main.
