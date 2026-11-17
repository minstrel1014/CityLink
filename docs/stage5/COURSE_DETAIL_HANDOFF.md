# Authenticated course detail and invite entry point — handoff

## Status and owner ledger

- **Status:** Source work is on `feature/roy-group-workflows`. The course detail uses the existing authenticated course directory and course-roster RPC. The read-only invitation-eligibility RPC is a migration proposal for review only; it has **not** been applied to Test. No sample Auth accounts/profiles/enrolments have been created. No PR update, merge, or public deployment is claimed until the checks and remote operations are verified.
- **Human owner:** Roy (as assigned by the lead; base role retained).
- **Base role:** Join-Request and Membership Feature Owner.
- **Additional assigned features, retained:** Study group creation/management and invitation workflows; authenticated Test-backed course detail/classmate roster and its Invite entry point (assigned 2026-11-17).
- **Assignment changes/handoffs:** The 2026-11-17 course-detail, Test-fixture, and demo-release request was added to this owner’s existing task. No base role was replaced. The Test migration must be coordinated with Role 6; messaging/task-management tools were unavailable in this session, so the migration remains clearly marked for review in the existing feature PR and handoff docs.

## Source discovery and verified behavior

- The React/Wouter app’s `/courses` directory and old `/courses/:courseId` detail used fictional records. The existing authenticated `/my-courses` screen loads the Test course catalogue and the current user’s own enrolments.
- The detail route is being split: `/courses/:courseId` is authenticated, while `/demo/courses/:courseId` preserves the prior fictional course detail. Fictional course cards and sample profile navigation now use the demo route. An enrolled course card links to the database-backed detail.
- `loadCourseDirectory(userId)` is the existing course source. `list_course_classmates(p_course_id)` is a `SECURITY DEFINER`, authenticated course-roster RPC; it requires the caller’s enrolment in a current-term course, returns profile fields for enrolled classmates, and excludes the caller. The UI does not call it until it verifies the user is enrolled.
- Test has a current-term catalogue of ten courses. Observed course codes: `BUS101`, `BUS220`, `COMM105`, `COMP101`, `COMP203`, `COMP215`, `DATA201`, `DATA310`, `FIN201`, and `MATH120`. These do not match the old fictional `IS3100`/`IS2200` sample-course codes; do not infer an enrolment mapping.
- **Confirmed current invite rule from the Test RPCs:** any active member may invite to a forming or active group. If a group is forming, its creator may also invite before having an active membership row; in the normal first-invite state there are no active members, so the creator is the available inviter until acceptance activates the group. The policy is not leader-only for active members. Acceptance adds the original inviter and invitee as active members, so the inviter is leader. There is no maximum group size. The mutation RPCs enforce enrolment, recipient availability, active membership, and first-pending-action conflicts.
- **API gap found:** `list_course_classmates` returns `profiles.status` but no active-group membership. The current invitation-acceptance RPC does not update `profiles.status`. Therefore `open`/`considering` alone cannot reliably determine that a student has no group. The UI must not show Invite based only on those profile values.

## Approved direction and review-only API proposal

On 2026-11-17 the CityLink lead selected the least-privilege eligibility-RPC option for migration review. The exact function SQL remains pending Role 6/lead review; the migration is not applied to Test.

Proposed public RPC: `list_course_group_invite_candidates(p_course_id uuid) returns table(profile_id uuid)`. It is stable, read-only, `SECURITY DEFINER`, and uses an empty `search_path`. Its query requires the caller to be enrolled in the selected course for the current term; only other current-term enrollees whose profile status is `open` or `considering` and who have no active membership for that course/term are returned. It returns only eligible profile UUIDs—no group IDs, group names, membership roles, or membership rows. The UI intersects the result with the already-authorized course-roster RPC response. Existing `create_group_and_invite`/`send_group_invitation` remain authoritative if eligibility changes after the read and for group-specific pending-action conflicts or races.

- Proposed migration: `supabase/migrations/20261117043100_stage5_course_group_invite_candidates.sql`.
- Read-only catalog regression: `supabase/tests/stage5_course_group_invite_candidates_catalog.sql`.
- Do not apply the migration to Test without explicit lead approval after review. Never apply it to Main. Do not reset/delete Test.
- A catalog test is not a functional behavior test; disposable two-account checks remain necessary after the approved migration is applied.

## Sample Test data and public demo blockers

The user requested Chloe Chan, Ethan Lee, Sophie Lam, Ryan Cheung, and other sample students as real Test profiles and course enrolments. These are fictional sample identities, but each `profiles.id` must still correspond to a real Supabase Auth UUID. The exact course-to-student mapping is not specified and the Test catalog codes differ from the old sample fixture. No Auth users or database rows have been created. Before seeding, the lead must identify the approved sample-name set, provide or approve disposable Auth accounts and confirm the per-course roster mapping (or explicitly authorize a course-wide mapping such as every sample student in every current Test course). Do not write fake UUIDs, query `auth.users` through the frontend, or use a service-role key.

No WebDev project resource or public demo URL is attached to this session; the public GitHub repository has no homepage URL. No replacement site was created and no deployment has been performed. To publish, the lead must identify the existing demo's deployment resource/platform and approve its release path. The feature branch must first pass checks and be reviewed; never push directly to `main` or merge without lead approval.

## Files in this feature slice

- `client/src/pages/citylink/AuthenticatedCourseDetail.tsx` and `CourseDetail.css` — signed-in course detail, enrolment gate, real roster, search/filter, invitation states, loading/empty/error/mobile UI, and fail-closed invite gating.
- `client/src/lib/courseDetailActions.ts` and its tests — inviteable group/peer state helpers.
- `client/src/lib/supabaseGroups.ts` and `supabaseGroups.test.ts` — ID-only candidate response validation and proposed RPC client call.
- `client/src/App.tsx`, `client/public/manus-routes.json`, `client/src/components/citylink/Shared.tsx`, `client/src/pages/citylink/Classmates.tsx` — separate real and fictional detail routes while preserving demo navigation.
- `client/src/pages/citylink/MyCourses.tsx` and `MyCourses.css` — link enrolled/catalogue cards to real detail and account navigation.
- `client/src/pages/citylink/GroupWorkflows.tsx` — clarify the existing any-active-member versus forming-creator invite rule.
- `supabase/migrations/20261117043100_stage5_course_group_invite_candidates.sql` and `supabase/tests/stage5_course_group_invite_candidates_catalog.sql` — review-only database migration and read-only catalog checks.
- `docs/team/DECISIONS.md`, `docs/SUPABASE_SETUP.md`, `docs/stage5/GROUP_AUTHORITY_HANDOFF.md`, and `TODO.md` — decision, setup, role, and task tracking records.

## Checks and exact results

Verified locally on 2026-11-17:

- `corepack pnpm check` — **passed after final UI/doc correction**, TypeScript `tsc --noEmit`, final exit 0.
- `corepack pnpm test` — **passed after final UI/doc correction**, 9 test files and 57 tests, final exit 0. Output includes existing OAuth configuration/session-payload stderr from `server/platform.test.ts`; the test suite still passed.
- `corepack pnpm build:static` — **passed after final UI correction**, Vite build exit 0. Existing warning: `/api/platform/config.js` is a non-module script and cannot be bundled as a module.
- Initial `prettier --check` — **failed** on seven TypeScript/TSX/JSON files. Ran Prettier `--write` on the flagged files and all changed text/UI/docs. A successful final `prettier --check` is still required below.
- Prettier does not infer a parser for `.sql` files in this project’s installed setup; those two SQL files were not run through Prettier. Their SQL formatting and security semantics require human/Role 6 review.
- `git diff --check` — **passed after final changes**, exit 0.
- Route manifest JSON parse — **passed after final changes**; both `/courses/:courseId` and `/demo/courses/:courseId` are present.
- The Test migration/catalog query — **not run**; migration not approved for application.
- Authenticated two-account course-roster and invite tests — **not run**; approved disposable accounts/mapping and migration approval are outstanding.
- Browser/mobile visual review — **not run**; no attached Preview project/browser.

Build warnings are not build failures. Do not count a test/build/formatter command as passed unless its final exit status is zero.

## Beginner-safe handoff and verification steps

1. **Confirm the working copy.** From the repository root run `git status --short --branch`, `git branch --show-current`, and `git log -1 --oneline`. Expected: the assigned feature branch, the intended local changes, and a feature commit only after the checks below. If the checkout is on `main` or has someone else’s changes, stop. Git stores local branches/staged snapshots/commits; GitHub hosts the remote branch and PR review.
2. **Install the locked dependencies if needed.** Run `corepack pnpm install --frozen-lockfile`. Expected: dependencies install from `pnpm-lock.yaml` without changing the manifest/lock. If it fails, stop and report the exact error.
3. **Run checks one at a time.** Run `corepack pnpm check`, `corepack pnpm test`, `corepack pnpm build:static`, then Prettier on all changed non-SQL files and `git diff --check`. A zero exit means that check passed; a failed test or non-zero exit is a blocker. Build warnings do not count as passing or failing by themselves. Do not apply the migration just to make the page render.
4. **Verify the route manifest.** Use `node -e 'const r=require("./client/public/manus-routes.json"); const p=r.routes.map(x=>x.path); for(const x of ["/courses/:courseId","/demo/courses/:courseId"]) { if(!p.includes(x)) throw Error("missing "+x); } console.log("route manifest JSON valid; both course detail routes present");'`. Expected: JSON loads and both real/demo paths are present. The earlier attempt failed because Bash expanded `!` inside the double-quoted script; this safe command avoids that.
5. **Use approved Test configuration and accounts only.** In the approved local/WebDev Development environment use only the CityLink Test URL and browser-safe publishable key; keep the env file private and never use Main or a service-role key. Sign in with a lead-approved disposable account, open **My Courses**, choose an enrolled course, and click **Classmates**. Expected: course and classmate fields match current Test data; a course outside the user’s enrolments does not reveal its roster.
6. **Wait for database approval before testing invites.** First have Role 6 review the exact migration and have the lead explicitly approve applying it to Test. After application, run the read-only catalog checks from `supabase/tests/stage5_course_group_invite_candidates_catalog.sql`. Sign into approved creator/member and recipient accounts, test first invite → forming group → recipient acceptance → active group/creator leadership, then invite from an existing active group. Confirm the eligibility list hides active group members; test non-enrolled, duplicate, conflicting, and concurrent paths. Do not invent a “full group” case because groups have no maximum. Stop and report any mismatch; do not edit RLS/RPCs on the fly.
7. **Save and share correctly.** After checks pass, use `git diff` to review exactly what will be saved; `git add` only intended feature files; create a meaningful local commit on `feature/roy-group-workflows`. Then push that feature branch (not `main`), verify its remote SHA, and update PR #2 for review. Tell the lead the exact checks and any still-blocked live tests. Do not merge or deploy until separately approved and the existing public demo target is known.

## Assumptions and known issues

- The course directory and roster RPC are the existing approved source of database-backed details; the UI does not invent course or profile fields.
- Invitation eligibility is intentionally checked by a read-only server RPC, but the exact migration SQL is still pending Role 6 and lead review and has not been applied.
- The old sample demo remains fictional; its course detail is moved to `/demo/courses/:courseId`.
- Test records, invite outcomes, and public release are not complete. No live Test writes, schema changes, merge, or deployment were performed in this handoff.
