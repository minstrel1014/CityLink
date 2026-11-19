# Coursemate portfolio UI (2026-11-18)

## Purpose

The People page and the authenticated course-mate list now open the same portfolio-style coursemate page. The visual layout follows the approved fictional-demo mockup: cover card, initials avatar, name, academic facts, “A little about”, skills, shared course, and an invite panel.

This is a presentation and navigation change. It does not change the database schema, RLS, RPCs, API contracts or profile permissions.

## Data shown

The authenticated profile API (`get_current_term_coursemate_profile`) returns only:

- display name
- major
- year
- bio
- skills

The page also uses the current course title and code from the authenticated course directory. It does not show a student ID, account status, email, other courses, or private group records because those fields are outside the approved current-term coursemate profile allowlist. The “Courses this semester” section therefore shows only the shared course and explicitly says that only shared courses are shown.

## Navigation

Both profile links now target:

`/my-courses/:courseId/people/:profileId`

The link is used from:

- the People page’s embedded coursemate cards
- the authenticated course-mate list

The profile page’s back link returns to the course’s People page. The Courses item in the shared app shell remains active on this route.

## Invite panel

The invite panel reuses the existing group services:

- `create_group_and_invite` when the viewer has no group for the course
- `send_group_invitation` when the viewer already has an eligible group
- `loadGroupWorkflowSnapshot` for existing invitation state
- `list_course_group_invite_candidates` for the server’s eligibility list

The page does not add members directly and does not change Roy’s approval rules. The mutation RPC remains authoritative if eligibility changes after the page loads. When the viewer belongs to more than one eligible group, the page shows a group selector. The existing one-group-per-course and first-pending-action rules remain unchanged.

## Files changed

- `client/src/pages/citylink/CoursemateProfilePage.tsx` — portfolio layout, data loading, invite panel
- `client/src/pages/citylink/AuthenticatedCoursePeers.tsx` — both portfolio links now use the People profile route
- `client/src/components/citylink/AppShell.tsx` — Courses navigation active on `/my-courses/...` profile routes
- `client/src/index.css` — portfolio privacy note, course note and invite feedback styles
- this document

## Verification

Commands run from the source checkout:

| Command               | Result                                  |
| --------------------- | --------------------------------------- |
| `corepack pnpm check` | Passed; no TypeScript errors            |
| `corepack pnpm test`  | Passed; 13 test files, 99 tests         |
| `corepack pnpm build` | Passed; Vite production build completed |
| `git diff --check`    | Passed                                  |

The tests cover existing profile, group, invitation and route helpers. There is no browser component-test framework in this checkout, so the new visual layout still needs a signed-in click-through on Test after the branch is previewed or merged.

## Known limitations and next steps

- Student ID, availability status, other enrolled courses and shared-course count are not shown because the approved profile API does not return them. Adding them would require a separately reviewed field/API decision.
- The page does not replace the existing People-page invite buttons; both paths use the same services.
- Signed-in desktop and mobile visual checks remain outstanding until the branch is previewed with Test data.
- Do not merge or publish this change without the lead’s review. The public demo remains a separate Webdev publication and is not updated by a source-branch commit alone.
