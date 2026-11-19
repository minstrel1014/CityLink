# CityLink

- [x] Authentication entry preserves the header, email/password fields, and direct demo entry. The Welcome-page sign-in and registration controls use Supabase Auth; `/demo` remains fictional and does not impersonate the Auth user. Password reset is still a placeholder.
- [x] Mobile-first dashboard displays fictional course tiles, preserves course-to-classmate-to-profile main navigation and bottom navigation, and supports course search and department/enrolment filtering.
- [x] Explicit fictional course enrolments connect students to courses. Selecting a course displays only enrolled classmates; search matches student name or student ID within that course.
- [x] Academic profiles show avatar, major, year of study, bio, skills, studied courses, and current group-forming status.
- [x] Invite to Group saves a fictional invitation record, confirms sending, visibly updates pending status, prevents duplicate active invitations, and retrieves saved demo records after refresh. Invitations remain browser-local, not database-connected.
- [x] Fictional courses, profiles, enrolments and invitation records are separate from UI through a replaceable repository. No CityU records or Canvas access is assumed.
- [x] Invitations navigation shows incoming/outgoing records; later chat is visibly incomplete rather than a simulated live service. Optional profile editing operates only on demo data.
- [x] Supabase setup guide and schema support profiles, courses, enrolments and invitations, explain database persistence, and distinguish sample, connected and incomplete features.
- [x] Responsive implementation passes type/build and focused repository checks, with one read-only integration review.

## Delivery evidence

The original demo implementation passed `pnpm check`, `pnpm build:static`, and all 16 original tests. Its read-only integration review findings were corrected. Preview served the route manifest and downloadable Supabase documentation.

The user reports that the SQL schema was applied to Supabase project `pijslbchvstkoweslymr` and that the four tables, six functions, RLS policy counts, profile column grants, and two triggers were verified. This report has not been independently re-observed in this session. The Stage 2 sign-up request creates a Supabase Auth user; a profile row depends on the separate schema trigger being installed and firing. Stage 2 did not query or verify that side effect. CityLink sample profiles, courses, enrolments, and invitations remain disconnected from Supabase.

## Approved Stage 1: Supabase Auth session foundation

- [x] Add a dedicated Supabase client module using only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; add TypeScript declarations. Install `@supabase/supabase-js` only if needed. Never expose a Supabase secret or `service_role` key in frontend code.
- [x] Add client-side session restoration and Supabase auth-state subscription handling, with cleanup/unsubscription. Expose Supabase Auth session state separately from the fictional demo identity `DEMO_USER_ID = "stu01"`.
- [x] Preserve the existing CityLink demo, UI, routes, sample data, and demo identity; keep `/demo` active. Do not connect profiles, courses, enrolments, or invitations to the database.
- [x] Do not implement sign-up, login, logout, or password reset in Stage 1. Do not run SQL, modify the database schema, create test accounts, commit, push, or deploy.
- [x] Run appropriate TypeScript, existing tests, and static-build checks if available; report any failures honestly.

Stage 1 validation: `pnpm check`, `pnpm test` (16 tests), Prettier check, `pnpm build:static`, `pnpm ignored-builds`, and `git diff --check` passed. The build reported the non-module `/api/platform/config.js` HTML-script warning. Supabase session restoration was not exercised against a live project, and no test account was created. The Development variables were configured later for Stage 2.

## Approved Stage 2: Supabase sign-up, email verification, and sign-in

- [x] Preserve the existing CityLink demo, UI styling, sample data, and `/demo` route. Keep the fictional demo identity separate from Supabase Auth. Use the existing Supabase client and session provider.
- [x] Connect the registration and login controls on the existing Welcome page to Supabase email/password sign-up and sign-in. Keep successful Auth sign-in separate from the fictional demo and its sample profile, courses, enrolments, and invitations.
- [x] Handle required/valid email and password validation, incorrect credentials, duplicate registrations (including Supabase's obfuscated existing-user response), and the email-verification-pending state. Show a clear signed-in state from the session provider.
- [x] Send email verification redirects to the current app root and document the required Supabase Auth redirect URL and email-confirmation settings. Do not change Supabase settings or create test accounts without approval.
- [x] Do not implement logout or password reset in Stage 2. Do not connect profiles, courses, enrolments, or invitations to the database. Do not run SQL, alter the schema, commit, push, or deploy.
- [x] Never expose a Supabase secret or `service_role` key in frontend code. Confirm Development variable presence without printing values.
- [x] Run available type-checking, tests, and build checks; report changed files, results, and remaining manual configuration/testing steps.

Stage 2 validation: `pnpm check`, `pnpm test` (21 tests), Prettier checks, `git diff --check`, and `pnpm build:static` passed. Preview returned HTTP 200 for the app root and route manifest; the route manifest stayed unchanged and the updated setup guide was served. A frontend-source boundary check found no Supabase data-table queries, logout/password-reset calls, or secret/service-role key references. The Webdev config confirmed both environment variable names are configured for Development; values were not printed. No Auth account was created, no Supabase setting or database was changed, and no live email/verification/session flow was tested.

Build warnings: Vite reports the existing `/api/platform/config.js` HTML script cannot be bundled without `type="module"`; the minified JavaScript chunk is 657.59 kB (188.23 kB gzip), above Vite's 500 kB warning threshold.

Before live Auth testing, an authorized project owner must add the current Development Preview root URL to Supabase Auth's Redirect URLs, optionally add `http://localhost:3000/**` for local testing, and confirm the Email provider's **Confirm email** setting. A live test would create a Supabase Auth user and may create a `public.profiles` row through the installed schema trigger; use an approved fictional test address with a mailbox you control.

## Approved Stage 3: Supabase-backed profile and account controls

- [x] Load the authenticated user's own `public.profiles` row using the current Supabase session user's UUID. Handle loading, missing-profile, query-error, and signed-out states. Do not create a missing profile in the frontend.
- [x] On the existing `/me` profile screen, show Supabase profile data to an authenticated user and allow edits only to `major`, `year`, `bio`, `skills`, and `status`. Save only those permitted columns, show success/error feedback, and rely on the signed-in UUID plus database RLS/column grants for ownership and access. Never accept a user-entered profile ID or use a service-role key.
- [x] Keep the fictional demo, sample data, `/demo`, courses, classmates, and invitations unchanged and separate from authenticated profile data.
- [x] Add local-session sign-out without revoking sessions on the user's other devices, clear authenticated profile state, and return to the unauthenticated screen. Implement password reset using Supabase Auth and the existing redirect helper; document allowed redirect configuration, and do not claim redirect/email behavior is live-tested if it is not.
- [x] Preserve the existing session provider except for exposing the Auth recovery event needed by the recovery form. Do not expose raw database errors, modify SQL/schema/RLS/grants, create/delete/modify real Auth users, commit, push, or deploy.
- [x] Add focused tests for profile field mapping/update payload and error states. Run existing type-checking, tests, formatting, whitespace checks, and static build. Report changed files, exact columns, ownership/RLS behavior, validation results, manual setup/live-testing steps, and limitations.

Stage 3 validation: `pnpm check`, `pnpm test` (29 tests across 5 files), `pnpm build:static`, Prettier checks, `git diff --check`, and frontend source-boundary scans passed. Preview returned the unchanged `/manus-routes.json` and updated setup guide. The build still warns about the existing non-module `/api/platform/config.js` script; the client bundle is 682.23 kB minified (192.66 kB gzip), above Vite's 500 kB advisory threshold. No Supabase Dashboard settings were changed, no SQL was run, no Auth user was created or modified, and no email, live profile read/update, or redirect flow was tested. The current Development Preview root still needs to be allowed in Supabase Auth → URL Configuration before the user manually tests verification/reset emails.

## Approved Stage 3 hardening pass

- [x] Before saving, call Supabase `auth.getUser()` and require its returned user ID to match the profile component's `userId`; otherwise stop with a safe authentication error.
- [x] Prevent asynchronous profile-save work from updating React state after unmount or after the authenticated user changes, while preserving existing loading and error behavior.
- [x] Trim bio before saving and validate individual skill-name length and total skill count. Preserve the existing editable fields and five-column payload.
- [x] Clean only Supabase recovery callback parameters from the URL; preserve unrelated query parameters and fragments.
- [x] Make the registration confirmation message describe possible verification email delivery without promising that an email was sent.
- [x] Add or update focused tests, then run `pnpm check`, all tests, `pnpm build:static`, Prettier, and `git diff --check`; report live-testing limitations.
- [x] Do not start Stage 4, change Supabase settings/schema, create accounts, send emails, commit, push, or deploy.

Stage 3 hardening validation: `pnpm check`, `pnpm test` (36 tests across 5 files), `pnpm build:static`, Prettier, `git diff --check`, and source-boundary scans passed. The build reports the existing `/api/platform/config.js` non-module warning and a 683.83 kB minified JavaScript chunk (193.34 kB gzip), above the 500 kB advisory threshold. The test suite emits an existing expected stderr log in `server/platform.test.ts`; all tests pass. No live Supabase Auth/profile operation was attempted, and no Stage 4 work began.

## Stage 3 final-review follow-up

- [x] Guard `saveProfile()` against a second submission while `saving` is already true.
- [x] Classify the saved profile response against the captured `saveUserId`, not a potentially changed prop.
- [x] Clear the previous profile and draft when a new profile load or account transition begins.
- [x] Preserve all earlier profile security, demo-separation, no-Supabase-side-effect, and no-Stage-4 constraints.
- [x] Rerun type-checking, all tests, static build, Prettier, and `git diff --check`; report results without creating Auth users, sending emails, changing Supabase settings/schema, committing, pushing, or deploying.

Final-review validation: `pnpm check`, `pnpm test` (36 tests across 5 files), `pnpm build:static`, Prettier, and `git diff --check` passed. The same non-blocking `/api/platform/config.js` and large-chunk build warnings remain. No Supabase access or Stage 4 work was performed.

## Approved Stage 4: Course catalogue and enrolment frontend

- [x] Reuse the existing `public.courses` and `public.enrolments` tables; do not create duplicates. Display available courses with code, name and relevant details, and support course search/filtering.
- [x] Build a separate authenticated My Courses experience that loads the signed-in user's own enrolments, allows adding/removing only their own rows using the Supabase Auth UUID, and provides loading, empty, error and success states. Writes verify `auth.getUser()` against the current account; INSERT sends only `student_id` and `course_id`, and DELETE filters to that verified user and course.
- [x] Keep enrolment write controls disabled until the separate insert/delete grants and owner-only RLS policies are reviewed and approved. Do not weaken/bypass RLS or claim self-enrolment verifies actual university registration. Document that shared-course profile visibility is intentional, not strict privacy.
- [x] Preserve `/demo`, fictional sample records, demo identity, current authentication, and profile functionality. Do not seed/delete demo data.
- [x] Do not inspect or mutate live data using accounts, execute SQL, modify policies/permissions, commit, push, or deploy. Do not use Supabase service-role credentials.
- [x] Run appropriate type-checking, tests, formatting and static build; report the live-policy inspection limitation, required SQL review and any remaining manual setup.

Stage 4 frontend validation: `pnpm check`, all tests, `pnpm build:static`, Prettier checks and `git diff --check` passed after enabling writes. The tests cover owner-ID verification, exact INSERT columns, owner-scoped DELETE filters, and duplicate-enrolment messaging. The user reports that the required SQL was applied and the live permission checks matched expectations; Manus did not independently query or mutate Supabase. Actual Account A/Account B live write-isolation testing remains open. The build retains the existing non-module `/api/platform/config.js` warning and a JavaScript chunk above Vite's 500 kB advisory threshold. See `docs/ENROLMENT_POLICY_REVIEW.md` for the SQL reference and read-only audit queries.

## Additional task request: Test-backed course detail, invitations, and demo release (2026-11-17)

- [x] “Insert the sample students (Chloe Chan, Ethan Lee, Sophie Lam, Ryan Cheung, and others as needed) as real test profiles into the Test database, and enrol them in the relevant courses.” Completed 2026-11-17 for the 12 user-supplied disposable Auth accounts: updated 12 `display_name` values and inserted 120 enrolments, all 12 in each of the ten Test courses. Verification confirmed 12 profiles × 10 course codes; existing enrolments were preserved.
- [x] “Update the course detail page to show real data from the database instead of pure fictional samples.” Implemented on `feature/roy-group-workflows`; fictional detail remains separate at `/demo/courses/:courseId`.
- [x] “For students without a group, add an ‘Invite’ button on the right: If I don’t have a group yet, sending an invite and having them accept should create a new group with me as the leader. If I already have a group, use the existing invitation flow.” Implemented with the existing invitation mutations and the Test-only candidate RPC, applied 2026-11-17; functional two-account tests remain outstanding.
- [x] “Also confirm the current invitation rule: can any active member invite, or only the leader?” Confirmed from the Test implementation: any active member may invite to a forming or active group; the creator may also invite while a group is forming before active memberships exist. It is not leader-only for active members.
- [x] “After implementing, please publish the update to the public demo.” Published the attached CityLink Public Demo on 2026-11-17 as WebDev version `2611844d02d6078c37b898df6c4deb6d7e72bf55` at `https://clinkdemo-z7jrfxui.manus.space/`. The sandbox browser rendered the root, the unauthenticated authenticated-detail route (sign-in state), and the 14-route manifest. This smoke check did not sign in or query Test rows; signed-in multi-account Invite behavior remains untested. GitHub PR #2 remains open and unmerged; GitHub `main` was not changed.

Test migration follow-up (2026-11-17): `stage5_course_group_invite_candidates` was applied only to `wkzclgmhrtecnpexfesr`, recorded as version `20261117044721`; all seven read-only catalog checks passed. The 12 user-supplied disposable Auth accounts were updated and enrolled in all ten current Test courses; verification confirmed every mapping. Functional multi-account invitation QA remains outstanding because no test-account passwords/session were supplied. Public publication is complete as noted above. See `docs/stage5/COURSE_DETAIL_HANDOFF.md`.

## Approved follow-on request: My Courses counts and two-view Course Detail (2026-11-17)

- [ ] My Courses: “Update the classmate count on each course card to show the real number of enrolled students from the Test database, not the fictional sample count of 4.” Approved implementation: current-term counts through an ID-free count-only API; exact migration requires Role 6 review and separate lead approval before Test application.
- [ ] Course Detail — first view (My Group): “When a student enters the course detail page, only show their own group situation (remove the original student list that was shown below): Current members in their group; People they have already invited (with status: pending / accepted / rejected); Allow the user to set or edit their group name; Allow cancelling pending invitations; Clearly indicate if the current user is the group leader; If the user has no group yet, show a clear empty state with options to create a group or request to join.” Approved constraints: first-group creation continues to select a first invitee and use the existing atomic RPC; only the current leader/creator may rename; pending invitations may be cancelled only through the existing authorized operation; request-to-join remains limited to active groups.
- [ ] Course Detail — second view (Classmate / Student List): “Move the original student list from the first view to this second view, and add the following: Add a button or link from the first view to open this full classmate list; Split the list into ‘In a group’ and ‘Looking for a group’; Next to each student, show: Their group name (so others can see who is in the same group); Group size; Current group status; Allow clicking into each student’s portfolio; Show ‘Request to join’ for students who are in a group; Show ‘Invite’ for students without a group.” Approved constraints: peer association/name/status/active-member count is visible only to authenticated coursemates in the current course/term through a narrow RPC; no other member identities or private invitation/request rows; portfolios use only existing coursemate-visible fields; Invite remains eligibility-RPC gated; request-to-join is shown only for active groups; no group maximum is added.
- [ ] “Keep the existing invitation and join-request rules. Do not change other parts of the app.” Existing invitation/review authority, first-pending-action conflicts, authentication, profiles, and course enrolment remain unchanged; scope is limited to these My Courses and Course Detail surfaces plus their required services, reviewed migrations/tests, route and handoff docs.

Status: implementation and local checks are complete; feature-code commit `b3eb7ef9f1749bce8cd4565d15cf6409c2a75ddc` is on `feature/roy-group-workflows` and open PR #2: https://github.com/minstrel1014/CityLink/pull/2. After the lead confirmed Role 6 review and Test-only approval, migration `20261117205600_stage5_course_detail_group_views.sql` was applied to `wkzclgmhrtecnpexfesr`; the checked-in catalog regression and post-application security checks completed successfully. Signed-in multi-account/mobile behavior remains unverified, and the separate public demo was not updated. See `docs/stage5/COURSE_DETAIL_HANDOFF.md` for exact results and next steps.

Route clarification (2026-11-17): the course catalogue/browse page where students can add courses is authenticated `/my-courses`. Add total current-term Test enrolment counts there; leave the fictional `/courses`, `/demo`, and `/demo/courses/:courseId` surfaces unchanged.

Group-size display clarification: count active memberships plus the forming group creator when the creator is not already an active member; this recognizes the establishing student and does not add a capacity limit.

## PR #5 join-request integration decision (2026-11-17)

- [x] Record the accepted PR #5 integration contract in `docs/team/DECISIONS.md`: succession model reaffirmed, abandoned-group join requests become `cancelled`, and PR #5 must reuse Role 5’s RPCs.
- [x] Add the forward-decision note and current-Test distinction to `docs/stage5/GROUP_AUTHORITY_HANDOFF.md`.
- [ ] Prepare a reviewed forward-only migration and catalog/behavior tests for the `cancelled` abandonment status. Do not apply it until Role 6 review and separate explicit lead approval; the current Stage 5 behavior remains `expired`.
- [ ] Integrate PR #5 with `feature/roy-group-workflows` so the existing group RPCs are present; preserve Role 5’s `supabaseGroups.ts` additions; verify Apply calls `requestToJoinGroup` and never inserts members directly.
- [ ] Run signed-in multi-account checks for succession review, abandonment cancellation, first-pending-action conflicts, and Apply-to-join.

## My Group four-card layout — 2026-11-17

- [x] Commit `d746d12888fecc12715ed91d81dd4271720a5048` is pushed on `feature/roy-my-group-cards`; open [PR #7](https://github.com/minstrel1014/CityLink/pull/7).
- [x] Separate the group view into four spaced cards: Group name, Current members, Invitation history, and Classmate list.
- [x] Add an **Open Group Chat** link at the bottom of Current members; it targets the placeholder path `/group-chat`.
- [x] Add a minimal `/group-chat` placeholder page and route manifest entry without implementing chat.
- [x] **Superseded 2026-11-18:** Stage 6 wired the existing Open Group Chat button to the real `/groups/:groupId/chat` screen using the panel’s group ID, and removed the placeholder route/page. See `docs/stage6/CHAT_RECRUITMENT_API_PROPOSAL.md`.
- [x] Preserve group rename, member display, invitation status/cancel, create-group, request-to-join, and full-classmate-list behavior.
- [x] Run `corepack pnpm check` (pass), `corepack pnpm test` (9 files, 67 tests), `corepack pnpm build` (pass), Prettier, and `git diff --check`.
- [ ] Signed-in desktop/mobile visual check with an authorized Test account remains outstanding.

## Approved Phase 1 — shared shell and end-to-end experience (2026-11-18)

This dated addendum supersedes older sign-in landing and “fictional course data only” statements for the signed-in routes; it preserves the signed-out `/demo` experience.

- [x] **Owner ledger:** Adam is the human owner. His base role remains Project, Integration, and Release Lead; authenticated demo repair, shell integration, and smoother user journey are additional features on this existing assignment, not a replacement task. Other owners remain TBD unless their names were explicitly supplied; Jeffery’s Stage 6 chat/recruitment assignment remains separate.
- [x] Route normal restored/successful sign-in to `/dashboard`, keep recovery-password flow in place, and make `/my-courses` redirect compatibly to Dashboard.
- [x] Make **My courses** the first/default dashboard tab and **All courses** the second; keep `/courses` as the full Test-backed catalogue for signed-in users and preserve the fictional `/courses` fallback for signed-out users.
- [x] Add a responsive authenticated shell with Dashboard, Courses, Invitations, Messages, and Profile navigation; preserve fictional routes and remove fictional-demo navigation from the signed-in shell.
- [x] Use existing Test-backed read contracts for enrolled-course roster initials, open-to-group counts, invitations, pending requests, and active group destinations. The client filters requests to the requester or recorded `creator_id`; whether that identifies the original creator and whether the server enforces the approved policy remain unresolved below. No new RPC or database write is introduced.
- [x] Reserve the sidebar Messages item and retain the existing Group Chat slot inside course detail for Stage 6. Do not implement chat pages, private-message pages, message storage, or send/receive behavior in this phase.
- [x] Make the complete course name plate a keyboard-accessible course-detail link; retain the distinct My group action.
- [x] Merge-readiness fixes and validation: `corepack pnpm check` passed; `corepack pnpm test` passed (10 files, 76 tests); `corepack pnpm build` passed; Prettier on changed source/tests/manifest passed; `git diff --check` passed. The build retains the existing `/api/platform/config.js` non-module warning and the >500 kB chunk-size advisory.
- [x] On 2026-11-18, in a separate Test-only Preview of PR #9, the owner signed in and opened Invitations at desktop width. Received invitations loaded; sent and pending empty states displayed; browser console showed no output. No invitation or group actions or Test data/schema changes were submitted.
- [x] Complete read-only desktop navigation and a simulated 375-pixel-wide check of the five signed-in shell pages; verify course name opens My Group and explicit fictional routes remain fictional when signed in. No Test actions or schema changes were submitted.
- [ ] Perform multi-account creator-versus-non-creator permission checks and any authorized mutation tests only against disposable Test, with separate approval before persistent Test rows. A real physical-mobile-device check is still outstanding. Do not access Main.
- [ ] Block security sign-off: project instructions say original creator only; checked-in succession reassigns `creator_id` to a successor, and the lead task reports a conflicting option-B decision. Adam must reconcile the decision and Role 6 must review actual Test authorization before any security change. The UI gate alone is not a backend fix; no Test migration is authorized here.
- [x] Initial commit `fd26cd56deac8a9a1e52bd6ebf38c7397cad9a8e` was pushed on `feature/adam-ux-shell` and [PR #9](https://github.com/minstrel1014/CityLink/pull/9) opened against `main`; the PR remains unmerged. Check its latest head and mergeability before review; do not push or merge directly to `main`.

Validation commands and exact results, file inventory, API boundaries, assumptions, open issues, and next steps are recorded in `docs/WORKSPACE_SHELL_HANDOFF.md`; the approved product and coordination decisions are in `docs/team/DECISIONS.md`.

## Coordinated group-capacity client — 2026-11-19

- [x] **Owner ledger and decision:** Adam remains Project, Integration, and Release Lead; demo repair, user-journey work, QA refinements, and the capacity-client UI are additive assignments in the existing Adam-repair task. Roy, Jeffery, Role 6, and Eunice retain their existing roles; see `docs/stage6/CAPACITY_CLIENT_HANDOFF.md`.
- [x] Implement an explicit 2–19 maximum alongside the group name in both current creation entry points, and call the draft four-argument creation service without selecting a default.
- [x] Implement current-leader maximum editing, existing-group unset and over-limit guidance, and individual confirmed member removal using the proposed RPCs. Backend enforcement still requires the separately authorized migration and live QA.
- [x] Implement capacity-aware People and recruitment mapping, current/maximum and full/unset/over-limit presentation, and existing-action full-group error messages. Pending records are not cancelled by the client; backend enforcement and concurrency QA remain outstanding.
- [x] Preserve the Option A presentation-only direct-request decision and unchanged `request_to_join_group` wrapper, without modifying RLS, the database, or recruitment-post rules. Reconcile with draft PR #33 before release.
- [x] Add service, mapping, input, UI, error-state, roster-visibility, re-invite, and regression tests. Typecheck passed; 21 test files / 294 tests passed; Test-configured build passed with the documented existing warnings; formatting and whitespace checks passed. Signed-in multi-account Test QA remains open.
- [ ] Reconcile the overlapping QA PR #33 and profile-invitation PR #31; the latter adds a group-creation path that also needs the explicit maximum. Preserve their user-facing work and rerun checks on the combined result.
- [x] Commit and push `feature/adam-capacity-client`; [draft PR #36](https://github.com/minstrel1014/CityLink/pull/36) is open for lead review and is not merged.
- [x] Address Adam-repair's exact-head review: pass scoped pre-dispatch guards through group, chat/recruitment, course, and profile mutations; recheck the profile context between its two writes; scope DisplayNameGate save completion to the initiating account; and add capacity refresh actions. No live database or multi-account QA is implied.
- [x] Address the `d477760` re-review: add auth-generation invalidation to People, My Groups, My Group, chat, course, profile, workspace, and display-name state; invalidate the People guard on unmount; key `/me` by account/generation; preserve recruitment drafts and loaded pages while refreshing capacity and People summaries; and check chat group/auth identity on late completions. Typecheck and all 472 tests passed. Mounted-browser account-switch, same-account re-sign-in, chat route timing, stale-profile paint privacy, and live multi-account/concurrency QA remain outstanding.
- [ ] Re-review the follow-up head; reconcile #31/#33, review exact #34, agree the client/schema cutover/cache plan, obtain separate Test-only authorization, and run signed-in multi-account/concurrency QA.
- [x] **Option A — request-bound mutation authentication (2026-11-19):** added the shared `supabaseRequestAuth` helper and bound group/recruitment mutations, chat send, post edit/close, profile display-name/profile-field updates, and course enrolment writes to the captured, verified Bearer token. Typecheck passed; 25 test files / 467 tests passed; Test-configured build passed with 1,748 modules; formatting and whitespace checks passed. No SQL, Test/Main changes, merge, or publish was performed; live RLS/multi-account/concurrency QA remains outstanding.
- [ ] Coordinate an explicit safe client/schema cutover, old and cached clients, and the exact final migration head with the lead and Role 6. No SQL, migration, Test schema/data, RLS/grants, Main access, merge, or publish is authorized by this client task. Commit and push only the feature branch and open a review PR; tell the existing lead task when ready.

### PR #36 review follow-up — 2026-11-19

- [x] Repair the unreachable own-group recruitment-post entry point using existing authorized reads and post service. Scope it to the viewer’s active group and current course/enrolment, bind the post request to the verified account, and prevent stale-context dispatch and draft overwrite. Replace the misleading mock and cover eligible own groups, unrelated groups, empty states, pagination, and account changes. RPCs, database, and recruitment-post rules remain unchanged.
- [x] Correct the singular member label when a maximum is set, and align My Group’s name input and guidance with the existing 50-character service limit. Add focused regression coverage.
- [x] Run the full type, test, build, format, and whitespace checks: typecheck passed; 24 test files / 464 tests passed; Test-configured build passed with the documented warnings. Signed-in multi-account/Test concurrency QA and PR #31/#33 integration remain outstanding.
- [ ] Update draft PR #36 and notify the existing lead task; do not apply SQL, change Test/Main, merge, or publish.
