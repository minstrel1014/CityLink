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

- [ ] “Insert the sample students (Chloe Chan, Ethan Lee, Sophie Lam, Ryan Cheung, and others as needed) as real test profiles into the Test database, and enrol them in the relevant courses.” Blocked until approved Auth accounts and an explicit mapping to the current Test course catalogue are available.
- [ ] “Update the course detail page to show real data from the database instead of pure fictional samples.” In progress on `feature/roy-group-workflows`; keep the fictional demo as a separate route.
- [ ] “For students without a group, add an ‘Invite’ button on the right: If I don’t have a group yet, sending an invite and having them accept should create a new group with me as the leader. If I already have a group, use the existing invitation flow.” In progress using the existing Test RPCs and authorization rules.
- [x] “Also confirm the current invitation rule: can any active member invite, or only the leader?” Confirmed from the Test implementation: any active member may invite to a forming or active group; the creator may also invite while a group is forming before active memberships exist. It is not leader-only for active members.
- [ ] “After implementing, please publish the update to the public demo.” Blocked: no existing WebDev project or public demo URL is attached, and project rules require feature-branch review before main/deployment.
