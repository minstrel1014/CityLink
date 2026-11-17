# Stage 5 group authority and leadership — handoff

## Status

The forward-only migration was applied to **CityLink-Stage5-Test** (`wkzclgmhrtecnpexfesr`) on 2026-11-15. Supabase records it as version `20261114163512`, name `20261114162301_stage5_group_authority_and_succession`. The source file is named to match that record. The source branch is `feature/roy-group-workflows`; [PR #2](https://github.com/minstrel1014/CityLink/pull/2) is open against `main`, its description reflects the applied status, and it is not merged.

The Test catalog regression query returned **12/12 checks passed**. The three public workflow RPCs remain `SECURITY DEFINER`, executable by `authenticated`, and not executable by `anon`. Preflight and post-apply aggregate checks found no pending invitation/request conflict pairs. No application rows were created, deleted, or otherwise changed by the migration or checks. Supabase Main was not accessed.

## Approved behavior

Approved by the CityLink project lead on 2026-11-15:

- Groups have no capacity or maximum size.
- Only the current group leader may review join requests. The current leader is the active student named by `study_groups.creator_id`.
- For the same student and group, a pending invitation and pending join request must not coexist. Keep the first action; reject the later opposite action with an understandable error.
- When a leader leaves or is removed, transfer `creator_id` to the earliest-joined remaining active member. Resolve equal `joined_at` values by `created_at ASC`, then membership `id ASC`.
- When no active member remains, dismiss the group: set `status='abandoned'`, set `creator_id=NULL`, and expire pending invitations and join requests in the same transaction. This is the currently applied Stage 5 behavior; the later 2026-11-17 PR #5 decision changes pending join requests to `cancelled` only when a reviewed forward migration is applied.
- The existing profile-deletion history trigger must keep anonymization behavior while applying succession/dismissal. Membership updates/deletes also need database-level handling; no new client leave/remove RPC is introduced just for this.

The shared record is `docs/team/DECISIONS.md`.

## Forward PR #5 integration decision — 2026-11-17 (not yet applied)

The team has accepted Jeffery’s PR #5 approach for the join-request integration points. This is a forward contract only; it does not change the applied Stage 5 migration or Test data yet.

- Succession is reaffirmed: the active `study_groups.creator_id` holder reviews join requests; if that leader leaves or is unavailable, the earliest remaining active member becomes leader and inherits review authority.
- When a group is abandoned, pending join requests will become `cancelled` with `cancelled_at`, while pending invitations continue to expire. The currently applied Stage 5 migration still records `expired` for pending join requests; a reviewed forward migration is required before Test behavior changes.
- PR #5 must integrate with Role 5’s existing RPCs and keep using `requestToJoinGroup` / `request_to_join_group`; no duplicate join service and no direct `group_memberships` insert. First-pending-action-wins remains authoritative.
- Open implementation checks: confirm `private.maybe_abandon_empty_forming_group` is invoked or wire it; decide whether `reviewed_at`/`reviewed_by` are set on abandonment; verify trigger ordering, grants, and RLS with Role 6. No migration is prepared or applied by this note.

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

## Frontend implementation — 2026-11-15

**Owner ledger:** Human owner Roy; base role retained: Join-Request and Membership Feature Owner; assigned scope includes group invitation and group creation/management. The lead later added authenticated course detail/classmate data and its Invite entry point (see [Course Detail handoff](COURSE_DETAIL_HANDOFF.md)). This implementation covers group creation, group invitations, and join requests. It does not implement chat, recruitment posts, AI, project-room files, or unrelated features.

The authenticated page is `/my-groups`, linked from the real Supabase My Courses page. It uses the existing authenticated course catalogue and the Test RPC `list_course_classmates(p_course_id uuid)` to offer eligible coursemates. Group, membership, invitation, and request reads use the browser Supabase client and the existing Test table SELECT policies/RLS; no sample repository, local storage, service-role key, SQL write, schema change, or test fixture is used. When no Supabase session/configuration is available, the page shows a sign-in/configuration screen rather than falling back to fictional demo data.

The page calls the existing public RPCs with the inspected parameter names: `create_group_and_invite(p_course_id,p_recipient_id)`, `send_group_invitation(p_group_id,p_recipient_id)`, `respond_to_group_invitation(p_invitation_id,p_accept)`, `cancel_group_invitation(p_invitation_id)`, `request_to_join_group(p_group_id)`, `review_group_join_request(p_request_id,p_approve)`, and `cancel_group_join_request(p_request_id)`. The frontend verifies that its current Supabase user matches the signed-in user before invoking mutations; the database RPC/RLS remains authoritative. Join-request review buttons are rendered only for a pending request from another student when the signed-in user is both the active member and current `creator_id` leader. RLS continues to allow requesters to read their own request/status and to restrict other requests to the current active leader. The page maps both first-pending-action-wins conflicts to explicit explanations that the earlier invitation/request remains in force.

Files changed for this frontend slice:

- `client/src/pages/citylink/GroupWorkflows.tsx` and `GroupWorkflows.css` — authenticated, mobile-responsive group workflow UI.
- `client/src/lib/supabaseGroups.ts` and `supabaseGroups.test.ts` — authenticated RPC/read service, response validation, user-friendly errors, and focused unit tests.
- `client/src/App.tsx` — registers `/my-groups`.
- `client/src/pages/citylink/MyCourses.tsx` — reuses/exports the authenticated account header and adds the page link; the fictional `/invitations` flow is unchanged.
- `client/public/manus-routes.json` — declares the new route.
- `docs/stage5/GROUP_AUTHORITY_HANDOFF.md` — this implementation record.

Validation results after the final source formatting: `corepack pnpm check` **PASS**; `corepack pnpm test` **PASS, 8 files / 52 tests**; `corepack pnpm build` **PASS**; Prettier check on all changed TS/TSX/CSS/JSON **PASS**; route-manifest JSON parsing **PASS**; `git diff --check` **PASS**. The existing test output still prints the OAuth configuration diagnostic, and the build prints the known `/api/platform/config.js` module notice; neither caused a failure. A read-only independent review found no blocker in authorization or RPC arguments.

Assumptions and remaining limits: the RPC creates the group using its database-defined default name because its signature accepts only the course and first invitee; no separate name field was invented. The UI adds no maximum-size behavior. Group/request/invitation snapshot reads are RLS-filtered but not yet paginated, so a very large history could reach the normal PostgREST row limit. No signed-in two-account browser test has yet exercised the RPCs against Test; the current automated tests cover response mapping and important error messages, not live account workflows or every RPC argument. Do not report end-to-end testing as complete.

### Beginner verification steps for the next owner

Do these in order, one at a time. The goal is to confirm the app is connected to the approved disposable Test project and each action reaches the existing database RPC. Do not use Main, do not paste keys into chat or source code, and do not create synthetic records unless the lead explicitly approves the fixture plan.

1. **Confirm the right local branch.** Open a terminal in the repository root and run `git status --short --branch`. Expected: branch `feature/roy-group-workflows`; changes may appear if work is underway. If another branch is shown or unexpected edits belong to someone else, stop and ask the lead rather than switching or overwriting files. Next, proceed only after the lead confirms this is the intended checkout.
2. **Check prerequisites.** Confirm the repo's normal development dependencies are installed (`corepack pnpm install --frozen-lockfile` if needed) and that the local environment already has the approved Test URL and browser-safe publishable key. Keep the environment file private; never add service-role credentials to frontend variables. Expected: install completes from the committed lockfile. If configuration is absent, the page will explain that Supabase is not configured; ask the lead for the approved secure setup instead of guessing.
3. **Run the code checks.** From the repository root, run `corepack pnpm check`, then `corepack pnpm test`, then `corepack pnpm build`. Expected: TypeScript has no errors, tests report all passing, and Vite/esbuild produce the build. An existing OAuth environment diagnostic and the known `/api/platform/config.js` bundling notice do not by themselves mean failure; a non-zero command exit or a failed test does. Stop at the first actual failure, copy the exact error (not secrets), and ask for help.
4. **Start the app.** Run `corepack pnpm dev` from the repository root and leave that terminal open. Expected: the server reports a ready/listening message. Open the local URL printed by the app in a browser. If startup reports an error, stop and share its exact non-secret text rather than changing ports or config at random.
5. **Sign in with approved test accounts.** Use only disposable CityLink Test student accounts supplied or approved by the lead. Click **My Courses**, then **My groups**. Choose a course listed under your own enrolments. Expected: page shows Supabase-backed coursemates/groups rather than fictional sample records. If the page displays the sign-in/configuration gate, verify the approved local Test environment setup; do not substitute Main credentials.
6. **Check group creation and first invitation.** Choose an available coursemate and click **Create group and invite**. Expected: a success notice and a pending invitation in the sender's list. Sign into the recipient test account and verify the same invitation appears under **Received invitations**. The group is created by `create_group_and_invite`; there is no separate local/sample group record.
7. **Check invitation actions.** As recipient, click **Accept** or, in a separate test case, **Decline** and verify the final status updates. For a still-pending invitation, sign in as the sender and click **Cancel invitation**; verify the status is cancelled. Use separate disposable cases where a prior action is terminal.
8. **Check join requests and authority.** With a nonmember account, request to join an active group and verify the request appears for the requester and the current leader. The requester can click **Cancel my request**. Sign in as an ordinary active member who is not the current leader: that account must not see another student's request or approve/reject controls. Sign in as the active `creator_id` leader: that account should see **Approve/Reject**; verify each decision updates status and approval adds the requester as a member.
9. **Check first-pending-action feedback.** With a disposable student and group, try the later opposite action only when the other action is already pending. Expected: the existing first action stays pending and the UI explains whether to respond to an existing invitation or review an existing request. Stop and report any mismatch; do not try to repair it by changing database policies or RPCs.
10. **Record and hand off.** Write which approved test accounts were used without sharing passwords/tokens, which actions passed/failed, exact error text, and screenshots only if safe and useful. Update this handoff and tell the lead. If code or docs change, run the checks in step 3 plus `corepack pnpm exec prettier --check <changed files>`, then stage only intended files, commit on the feature branch, push that branch, verify the remote SHA, and update PR #2. A passing catalog test or build is not a substitute for these signed-in behavior checks.

## Git/GitHub workflow and next steps

Git is the local branch/commit history; GitHub is the remote branch and PR review service. Work is on `feature/roy-group-workflows`, descended from the approved-decision branch based on `main` `da135199`. Commit `6cb9613` saved the migration/test/docs before Test application; commit `3ce384c` recorded the exact applied version and results; commit `c0eec2116008fb1a6cef371779c932b864778ccc` added the frontend workflows. These commits were pushed, and the remote feature SHA was verified. PR #2 was updated to include the frontend scope and validation results; it is open, targets `main`, and points to the verified frontend commit. PR #1 also remains open. Neither PR has been merged, and this work does not push directly to `main`.

Next, the human lead should review PR #2 and decide whether to authorize disposable Test fixtures or provide test accounts for the manual behavior tests. Do not reset/delete Test or access Supabase Main. Do not merge either PR without the lead's approval.
