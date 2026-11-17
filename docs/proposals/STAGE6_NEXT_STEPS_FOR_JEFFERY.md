# Stage 6 next steps for Jeffery — client work guide

**Date:** 2026-11-17
**Owner ledger:** Jeffery retains the existing Group Chat and Recruitment Posts task/role; no reassignment or replacement task. Role 6 remains the shared database/security/QA reviewer (human owner TBD).

This is a client guide, not approval to apply SQL. The current proposal is in [PR #5](https://github.com/minstrel1014/CityLink/pull/5). The database migration is not approved or applied. Do not connect the client to Main or rely on live Test behavior until the migration, Test plan, and Adam's separate approval are complete.

## 1. Start safely on your existing feature branch

Git saves changes locally; GitHub hosts the shared branch and pull-request review. Before editing, check the existing checkout and branch so you do not overwrite another contributor's work:

```sh
git status --short --branch
git fetch origin
git switch feature/jeffery-group-chat-recruitment
git pull --ff-only
```

Expected result: a clean worktree on the branch already used by PR #5, updated from its remote. If the worktree has changes you do not recognize, or the branch cannot fast-forward, stop and coordinate; do not discard files, create a replacement task, push to `main`, force-push, or edit Role 6's checkout.

## 2. Implement the agreed UI/API behavior

Use the API proposal in PR #5 as the contract. The following decisions are already explicit; do not replace them with guesses:

- **Private group chat:** show chat only inside a student's own group workspace; there is no all-student/public chat page. Active members can read and send. Former members can read existing history but cannot send. Pending invitees and join-requesters get no chat access. If a group is `abandoned`, freeze chat to read-only. Active members may still send in an `archived` group.
- **Course-detail groups:** show only current-term groups with at least two actual active memberships. A pending invitation does not count as membership. Do not add a group-size cap. Group/profile UUIDs are hidden selectors, not display text.
- **Roster audience and fields:** the approved member-list audience follows the existing any-shared-course profile access (no current-term filter for the profile-sharing relationship). Keep the existing direct profile access unchanged. The proposed roster returns only `profile_id` as a non-display selector plus `display_name`, `major`, `year`, `bio`, and `skills`; do not display `profile_id`, and do not add `student_id` or account `status`.
- **Recruitment posts:** coursemates eligible for the course may read posts. Posts on archived/abandoned groups stay readable but are read-only: no Apply, edit, or close action. If the author leaves/is removed, the post auto-closes and remains read-only.
- **Apply:** use the server-provided, viewer-specific `apply_enabled` result. It accounts for an open post/current-term active group, viewer course/profile eligibility, existing membership, and pending invite/request conflicts. On click, reuse Roy's existing join-request service/RPC. Do not insert a request or membership from the page and do not approve anything in Jeffery's UI. Preserve first-pending-action-wins and the approved current-active-leader review rule.
- **Pagination:** use the proposal defaults: posts 20, course-detail groups 25, members 50; maximum 100 per call. These are page sizes, not group capacity. Use the returned keyset cursor values and `has_more`; do not show cursor UUIDs to students. Provide a visible “load more” or infinite-scroll behavior and stop when `has_more` is false. An empty page means there are no later rows.

## 3. Update and test the client

The PR already includes the Stage 6 client/service/test surface (`client/src/lib/supabaseStage6.ts`, `client/src/lib/supabaseStage6.test.ts`, and the group/chat pages). Keep the existing owner/task and PR #5; make your changes on the same assigned branch. Update the service types/calls and UI states together so the client matches the final reviewed API contract.

Cover at minimum:

- first page, next page, end of list, and empty list for posts/groups/members;
- loading, error, retry, and unauthenticated/denied responses;
- active member, former member, pending invitee/requester, and unrelated coursemate access;
- private per-group chat; abandoned read-only state; archived active-member send state;
- Apply enabled/disabled reasons, existing request/invitation conflict, and success from Roy's existing service;
- archived/abandoned and former-author posts remaining visible but with no interaction;
- no group displayed for an invite-only group with fewer than two active members.

Do not make real Test requests or use real student data as part of client development. Use mocks/unit tests now. End-to-end authenticated Test checks come later, after the exact migration and Test-only plan are separately approved.

## 4. Run the repository checks

The checked-in root `package.json` defines these scripts. Run them from the repository root after dependencies are installed (`pnpm install --frozen-lockfile` if `node_modules` is absent):

```sh
pnpm check
pnpm test
pnpm build
pnpm exec prettier --check <each-changed-file>
git diff --check
```

- `pnpm check` runs TypeScript without emitting files; exit 0 means the type check passed.
- `pnpm test` runs Vitest; exit 0 means all tests passed. Investigate failures rather than removing tests.
- `pnpm build` runs the Vite and server bundle build; exit 0 means the app bundles successfully.
- Prettier `--check` reports formatting problems without rewriting files; exit 0 means the listed files are formatted. Avoid `pnpm format` for this change unless you intend to rewrite formatting across the whole repository.
- `git diff --check` catches whitespace errors; no output and exit 0 means it passed.

If any command fails, include the exact command and relevant error in the PR; do not claim the check passed.

## 5. Save and share the work correctly

After the code and checks are ready, review `git diff`, stage only the intended files, and commit a meaningful local checkpoint on `feature/jeffery-group-chat-recruitment`. A commit is saved locally. Then push **that feature branch only** to GitHub; push is the upload for shared backup/review, not a merge. Verify the remote branch SHA matches your local commit, then update PR #5 with the summary and results. Do not push directly to `main`, force-push, or merge without lead approval.

## 6. What still blocks live integration

Role 6 and Roy must finish the migration/security review, reconcile any proposal differences, verify Test metadata read-only, and prepare a final timestamped migration under `supabase/migrations/` plus a Test-only execution plan. Adam must separately approve those exact artifacts before anyone changes Test. Until then, keep UI work mock/test driven and do not treat this proposal or PR approval as permission to execute SQL.
