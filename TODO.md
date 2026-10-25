# CityLink

- [x] Authentication entry preserves header, email/password fields, login/verify action, forgot-password and register links, and direct demo entry. Demo is explicitly not real authentication.
- [x] Mobile-first dashboard displays fictional course tiles, preserves course-to-classmate-to-profile main navigation and bottom navigation, and supports course search and department/enrolment filtering.
- [x] Explicit fictional course enrolments connect students to courses. Selecting a course displays only enrolled classmates; search matches student name or student ID within that course.
- [x] Academic profiles show avatar, major, year of study, bio, skills, studied courses, and current group-forming status.
- [x] Invite to Group saves a fictional invitation record, confirms sending, visibly updates pending status, prevents duplicate active invitations, and retrieves saved demo records after refresh. Invitations remain browser-local, not database-connected.
- [x] Fictional courses, profiles, enrolments and invitation records are separate from UI through a replaceable repository. No CityU records or Canvas access is assumed.
- [x] Invitations navigation shows incoming/outgoing records; later chat is visibly incomplete rather than a simulated live service. Optional profile editing operates only on demo data.
- [x] Supabase setup guide and proposed schema support profiles, courses, enrolments and invitations, explain actual database insert/select persistence, and clearly distinguish sample, connected and incomplete features.
- [x] Responsive implementation passes type/build and focused repository checks, with one read-only integration review.

## Delivery evidence

`pnpm check` and `pnpm build:static` passed. `pnpm test` passed all 16 tests, including 10 sample-repository tests for course-scoped search, invitation persistence and permissions, duplicate protection, storage failure handling, reset, malformed-profile fallback and edited-profile rehydration. The read-only integration review confirmed normal journey coverage; its malformed-profile finding and the identified skills-input issue were corrected. Preview serves the route manifest and downloadable Supabase documentation with HTTP 200.

The SQL schema was parser-validated only; it has not been applied to Supabase. No backend, real authentication, university records, invitation delivery or chat is connected. Browser storage is isolated to the fictional demo; if unavailable, invitations remain session-only with explicit feedback.
