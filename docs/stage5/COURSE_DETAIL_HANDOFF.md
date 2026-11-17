# Authenticated course detail and invite entry point — handoff

## Status and owner ledger

- **Status:** Source work is on `feature/roy-group-workflows`; the latest published WebDev checkpoint is `2611844d02d6078c37b898df6c4deb6d7e72bf55` at [https://clinkdemo-z7jrfxui.manus.space](https://clinkdemo-z7jrfxui.manus.space). The course-detail implementation, Test eligibility migration, 12-account/120-enrolment seed, public deployment, and browser route checks are complete as documented below. GitHub PR #2 remains open and unmerged; GitHub `main` was not changed.
- **Human owner:** TBD until the lead supplies the real person's name. Roy remains the assigned feature owner/approval delegate; base role retained.
- **Base role:** Join-Request and Membership Feature Owner.
- **Additional assigned features, retained:** Study group creation/management and invitation workflows; authenticated Test-backed course detail/classmate roster and its Invite entry point (assigned 2026-11-17).
- **Assignment changes/handoffs:** The 2026-11-17 course-detail, Test-fixture, and demo-release request was added to this owner's existing task. No base role was replaced. The migration, explicitly authorized Test seed, and requested public demo release are complete. Signed-in multi-account invite QA remains untested.

## Source discovery and verified behavior

- The React/Wouter app’s `/courses` directory and old `/courses/:courseId` detail used fictional records. The existing authenticated `/my-courses` screen loads the Test course catalogue and the current user’s own enrolments.
- The detail route is being split: `/courses/:courseId` is authenticated, while `/demo/courses/:courseId` preserves the prior fictional course detail. Fictional course cards and sample profile navigation now use the demo route. An enrolled course card links to the database-backed detail.
- `loadCourseDirectory(userId)` is the existing course source. `list_course_classmates(p_course_id)` is a `SECURITY DEFINER`, authenticated course-roster RPC; it requires the caller’s enrolment in a current-term course, returns profile fields for enrolled classmates, and excludes the caller. The UI does not call it until it verifies the user is enrolled.
- Test has a current-term catalogue of ten courses. Observed course codes: `BUS101`, `BUS220`, `COMM105`, `COMP101`, `COMP203`, `COMP215`, `DATA201`, `DATA310`, `FIN201`, and `MATH120`. These do not match the old fictional `IS3100`/`IS2200` sample-course codes; do not infer an enrolment mapping.
- **Confirmed current invite rule from the Test RPCs:** any active member may invite to a forming or active group. If a group is forming, its creator may also invite before having an active membership row; in the normal first-invite state there are no active members, so the creator is the available inviter until acceptance activates the group. The policy is not leader-only for active members. Acceptance adds the original inviter and invitee as active members, so the inviter is leader. There is no maximum group size. The mutation RPCs enforce enrolment, recipient availability, active membership, and first-pending-action conflicts.
- **API gap found:** `list_course_classmates` returns `profiles.status` but no active-group membership. The current invitation-acceptance RPC does not update `profiles.status`. Therefore `open`/`considering` alone cannot reliably determine that a student has no group. The UI must not show Invite based only on those profile values.

## Applied API contract and verification

On 2026-11-17 the CityLink lead selected the least-privilege eligibility-RPC option and explicitly requested that it be applied to Test. After verifying the Test project reference, migration history, relevant tables, RLS and existing helper/RPC definitions, the migration was applied to `wkzclgmhrtecnpexfesr`. Supabase recorded migration version `20261117044721`, name `stage5_course_group_invite_candidates`.

Applied public RPC: `list_course_group_invite_candidates(p_course_id uuid) returns table(profile_id uuid)`. It is stable, read-only, `SECURITY DEFINER`, and uses an empty `search_path`. Its query requires the caller to be enrolled in the selected course for the current term; only other current-term enrollees whose profile status is `open` or `considering` and who have no active membership for that course/term are returned. It returns only eligible profile UUIDs—no group IDs, group names, membership roles, or membership rows. The UI intersects the result with the already-authorized course-roster RPC response. Existing `create_group_and_invite`/`send_group_invitation` remain authoritative if eligibility changes after the read and for group-specific pending-action conflicts or races.

- Migration source: `supabase/migrations/20261117043100_stage5_course_group_invite_candidates.sql`.
- Read-only catalog regression: `supabase/tests/stage5_course_group_invite_candidates_catalog.sql`.
- Applied to disposable Test only with the user's explicit instruction. Never apply it to Main. Do not reset/delete Test.
- Catalog checks are not functional behavior tests; disposable two-account checks remain necessary after applying the migration.

## Test sample data and public demo release (complete)

The user supplied 12 disposable Test Auth accounts mapped to Chloe Chan, Ethan Lee, Sophie Lam, Ryan Cheung, Ava Wong, Lucas Ng, Mia Ho, Noah Tsang, Olivia Yeung, Leo Chan, Emma Lau, and Max Lo. Each email was matched to its existing Auth UUID and linked `public.profiles` row; only `display_name` and `updated_at` were changed. The user explicitly chose the all-ten-courses option. The write updated 12 profile names and inserted 120 `public.enrolments` rows with `ON CONFLICT DO NOTHING`, preserving existing enrolments. Read-only verification returned 12 profiles, each with exactly ten distinct current Test course codes: `BUS101`, `BUS220`, `COMM105`, `COMP101`, `COMP203`, `COMP215`, `DATA201`, `DATA310`, `FIN201`, and `MATH120`. No passwords, Auth UUIDs, or service-role credentials are recorded in this document. Remaining behavior QA still requires sign-in by account owners; no passwords were supplied to this task.

The user supplied and then attached the existing CityLink Public Demo WebDev resource. The separate public site was checkpointed and published as version `2611844d02d6078c37b898df6c4deb6d7e72bf55`; no replacement site was created. Its public root rendered in the sandbox browser, the authenticated course-detail path resolved to its sign-in state without reading Test rows, and the 14-route manifest was verified. A Python `urllib` root request returned HTTP 403; the public browser check succeeded, so no generic HTTP 200 claim is made. Never push directly to GitHub `main` or merge PR #2 without lead approval.

## Files in this feature slice

- `client/src/pages/citylink/AuthenticatedCourseDetail.tsx` and `CourseDetail.css` — signed-in course detail, enrolment gate, real roster, search/filter, invitation states, loading/empty/error/mobile UI, and fail-closed invite gating.
- `client/src/lib/courseDetailActions.ts` and its tests — inviteable group/peer state helpers.
- `client/src/lib/supabaseGroups.ts` and `supabaseGroups.test.ts` — ID-only candidate response validation and proposed RPC client call.
- `client/src/App.tsx`, `client/public/manus-routes.json`, `client/src/components/citylink/Shared.tsx`, `client/src/pages/citylink/Classmates.tsx` — separate real and fictional detail routes while preserving demo navigation.
- `client/src/pages/citylink/MyCourses.tsx` and `MyCourses.css` — link enrolled/catalogue cards to real detail and account navigation.
- `client/src/pages/citylink/GroupWorkflows.tsx` — clarify the existing any-active-member versus forming-creator invite rule.
- `supabase/migrations/20261117043100_stage5_course_group_invite_candidates.sql` and `supabase/tests/stage5_course_group_invite_candidates_catalog.sql` — applied Test migration source and read-only catalog checks.
- `docs/team/DECISIONS.md`, `docs/SUPABASE_SETUP.md`, `docs/stage5/GROUP_AUTHORITY_HANDOFF.md`, and `TODO.md` — decision, setup, role, and task tracking records.

## Checks and exact results

Verified locally on 2026-11-17:

- `corepack pnpm check` — **passed after final UI/doc correction**, TypeScript `tsc --noEmit`, final exit 0.
- `corepack pnpm test` — **passed after final UI/doc correction**, 9 test files and 57 tests, final exit 0. Output includes existing OAuth configuration/session-payload stderr from `server/platform.test.ts`; the test suite still passed.
- `corepack pnpm build:static` — **passed after final UI correction**, Vite build exit 0. Existing warning: `/api/platform/config.js` is a non-module script and cannot be bundled as a module.
- Initial `prettier --check` — **failed** on seven TypeScript/TSX/JSON files. Ran Prettier `--write` on the flagged files and all changed text/UI/docs. Final `prettier --check` on every changed non-SQL file **passed**, exit 0.
- Prettier does not infer a parser for `.sql` files in this project’s installed setup; those two SQL files were not run through Prettier. Their SQL formatting and security semantics require human/Role 6 review.
- `git diff --check` — **passed after final changes**, exit 0.
- Route manifest JSON parse — **passed after final changes**; both `/courses/:courseId` and `/demo/courses/:courseId` are present.
- Public deployment — **published** as WebDev version `2611844d02d6078c37b898df6c4deb6d7e72bf55` at `https://clinkdemo-z7jrfxui.manus.space`. The unauthenticated sandbox browser rendered the public root and authenticated detail route; the latter correctly showed “Sign in to view coursemates.” `/manus-routes.json` was readable and contained 14 routes including the authenticated and fictional detail paths. The browser smoke check did not sign in or query Test rows.
- The Test migration catalog regression — **7/7 checks passed** after apply: UUID-only result/signature; stable SECURITY DEFINER and empty search_path; enrolled caller/current-term requirement; only other open/considering profiles; exclusion of active course-term members; authenticated can execute/anon cannot; no group or membership fields in output. No application rows were read or written by the migration.
- Authenticated two-account course-roster and invite tests — **not run**; disposable accounts and all-course enrolments now exist, but no account passwords/session takeover or Preview browser is available in this task.
- Public route browser smoke — **passed** for root, unauthenticated course detail, and route manifest. Mobile viewport and authenticated roster/Invite behavior were not tested.

Build warnings are not build failures. Do not count a test/build/formatter command as passed unless its final exit status is zero.

## Beginner-safe handoff and verification steps

1. **Confirm the working copy.** From the repository root run `git status --short --branch`, `git branch --show-current`, and `git log -1 --oneline`. Expected: the assigned feature branch, the intended local changes, and a feature commit only after the checks below. If the checkout is on `main` or has someone else’s changes, stop. Git stores local branches/staged snapshots/commits; GitHub hosts the remote branch and PR review.
2. **Install the locked dependencies if needed.** Run `corepack pnpm install --frozen-lockfile`. Expected: dependencies install from `pnpm-lock.yaml` without changing the manifest/lock. If it fails, stop and report the exact error.
3. **Run checks one at a time.** Run `corepack pnpm check`, `corepack pnpm test`, `corepack pnpm build:static`, then Prettier on all changed non-SQL files and `git diff --check`. A zero exit means that check passed; a failed test or non-zero exit is a blocker. Build warnings do not count as passing or failing by themselves. Do not apply the migration just to make the page render.
4. **Verify the route manifest.** Use `node -e 'const r=require("./client/public/manus-routes.json"); const p=r.routes.map(x=>x.path); for(const x of ["/courses/:courseId","/demo/courses/:courseId"]) { if(!p.includes(x)) throw Error("missing "+x); } console.log("route manifest JSON valid; both course detail routes present");'`. Expected: JSON loads and both real/demo paths are present. The earlier attempt failed because Bash expanded `!` inside the double-quoted script; this safe command avoids that.
5. **Verify Test-backed courses and roster.** Use the approved CityLink Test URL and browser-safe publishable key only; keep the env file private and never use Main or a service-role key. Sign in with one of the approved disposable accounts, open **My Courses**, choose a course, and click **Classmates**. Expected: its database-backed classmate list shows the selected sample students; the same 12 profiles are enrolled in the ten listed Test courses. A course outside a user's enrolments must not reveal its roster.
6. **Continue functional invite QA.** The eligibility migration is already applied to Test and its seven catalog checks passed. With authorized account owners signing in, test first invite → forming group → recipient acceptance → active group/creator leadership, then invitation from an existing active group. Confirm the eligibility list hides active group members; test non-enrolled, duplicate, conflicting, and concurrent paths. Do not invent a “full group” case because groups have no maximum. Stop and report any mismatch; do not edit RLS/RPCs on the fly.
7. **Save and share correctly.** The requested WebDev release is complete; the separate WebDev `main` checkpoint is `2611844d02d6078c37b898df6c4deb6d7e72bf55`. The GitHub source documentation still needs a meaningful local commit on `feature/roy-group-workflows`, then push that feature branch (not `main`), verify the live GitHub ref, and update PR #2 for review. Report the signed-in multi-account QA gap. Do not merge GitHub PR #2 without lead approval.

## Assumptions and known issues

- The course directory and roster RPC are the existing approved source of database-backed details; the UI does not invent course or profile fields.
- Invitation eligibility is checked by the read-only `list_course_group_invite_candidates` RPC now applied to disposable Test; the seven catalog checks passed. Functional two-account checks are still outstanding.
- The old sample demo remains fictional; its course detail is moved to `/demo/courses/:courseId`.
- The 12-name Test seed and 120 course enrolments are complete and verified. The eligibility migration was applied only to Test. Public release is complete as version `2611844d02d6078c37b898df6c4deb6d7e72bf55`; only unauthenticated route rendering was checked. Functional invite outcomes remain untested, and no Main access or GitHub merge occurred.
