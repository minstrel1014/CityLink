# People-page naming migration — Test application record

**Owner:** integration lead. **Approved by:** Adam, 2026-11-18 ("write the executable migration, run the preflight on Test, and apply it to Test only"). **Role 6:** proposal approved after all five blockers were cleared; no SQL executed by Role 6.

## Scope

Single forward-only migration, `supabase/migrations/20261118083000_stage6_people_page_naming.sql`, applied to the disposable Test project `wkzclgmhrtecnpexfesr` only. Main was not accessed or changed.

## Preflight on Test (before apply)

| Check                                     | Result  |
| ----------------------------------------- | ------- |
| Display names not trimmed or outside 1–50 | 0       |
| Default `New CityLink member` profiles    | 9 of 21 |
| Group names non-empty and invalid         | 0       |
| Empty legacy groups                       | 5 of 7  |

The preflight passed, so both new constraints were created `NOT VALID` and then validated.

## Applied migration

- Recorded version: `20261118082247`, name `stage6_people_page_naming`.
- Start/end: 16:22 +08:00, success, no errors.
- The tool records the application time as the version; the file content is the reviewed migration.

## Verified after apply

- `profiles_display_name_length_chk`, `study_groups_name_length_chk` and `group_recruitment_posts_subject_length_chk` all exist and are **validated**.
- `update_own_display_name(text) returns text`, `create_group_and_invite(uuid, uuid, text)`, `rename_study_group(uuid, text) returns void`, `list_course_ungrouped_classmates(...)`, `get_current_term_coursemate_profile(...)`, `create_group_recruitment_post(uuid, text, text)`, `edit_group_recruitment_post(uuid, text, text)` and `list_group_recruitment_posts(...)` returning `subject` all exist.
- Old two-argument overloads are gone: `create_group_and_invite(uuid, uuid)`, `create_group_recruitment_post(uuid, text)` and `edit_group_recruitment_post(uuid, text)`.
- Every replaced or new RPC is executable by `authenticated` only; `anon` has none.
- Existing posts were backfilled with `'Recruitment post'`; the subject column is `NOT NULL`.

## What is not verified yet

No RPC was invoked as a signed-in Test user in this step. Runtime behaviour — name gate, 50/51-character limits, leader rename, one-member group member list, ungrouped list, subject create/edit — needs live QA after the client is updated. The old client still calls the removed two-argument group-creation RPC and will show "function not found" until the client work merges.

## Next steps

1. Client work on the same branch: name gate and profile edit through `update_own_display_name`; group creation form with name; leader rename panel; people page; subject fields; member lists on posts.
2. `pnpm check`, `pnpm test`, `pnpm build`, then live QA with the QA accounts.
3. Sync the demo after review. Main only under a new written authorization from Adam.

## Client implementation (same branch)

- `DisplayNameGate` blocks every signed-in page until a real display name is saved through `update_own_display_name`; the profile page can edit the name (1–50 characters).
- Group creation now requires a 1–50 character name in My Groups; the two quick-invite screens ask for a name before calling the new three-argument RPC.
- Leaders get a rename panel in My Groups; `rename_study_group` is limited to 1–50 characters in the client.
- The course people page lists groups, recruitment posts and current-term coursemates without a group; ungrouped profiles open through `get_current_term_coursemate_profile`.
- Recruitment posts now require a 1–120 character subject; create, edit and list use the new RPC signatures.
- `pnpm check` passed; `pnpm test` passed 98/98; `pnpm build` passed; `git diff --check` passed.

## Still not verified

Live signed-in QA for the name gate, 50/51 boundaries, leader rename, one-member member list, ungrouped list and subject flows. Main has not received this migration; it still needs a fresh written authorization.

## Review fixes (head a0b30a7 review)

- `DisplayNameGate` now has explicit `checking`, `ready`, `needs-name` and `error` states. A profile read error, missing profile row, missing name or default name keeps the app blocked; the error state offers retry and sign-out recovery.
- The ungrouped coursemate list now uses the RPC cursor (`p_after_display_name`, `p_after_profile_id`), 50 rows per page, with a “Load more people” action. It no longer silently stops at 100.
- Added a regression test for the ungrouped cursor and limit.
- Rechecked: `pnpm check` passed; `pnpm test` 99/99 passed; `pnpm build` passed; `git diff --check` passed.

Live signed-in QA of the gate states and more than 50/100 ungrouped rows remains outstanding.

## Live QA data on Test (2026-11-18)

All accounts and rows below are labelled QA data on the disposable Test project only. No real student records, email addresses or passwords are recorded in the repository.

- `QA Marketing Team` (active, 3 members: Alice QA, Dave QA, Bob QA) — recruitment post by Alice QA and a second post by Dave QA.
- `QA Finance Circle` (active, 3 members: Emma QA, Frank QA, Cara QA) — recruitment post by Emma QA.
- Ava Wong received a pending group invitation from the people-card action.
- Grace QA (no group) applied to `QA Finance Circle`; the request is pending and still needs the leader's decision.
- One plain-text chat message was sent in `QA Marketing Team` and remained after a full page refresh.

## Four UI updates tested in the browser

1. **People list actions** — a member sees “Invite to my group”; a student without a group sees “Create a group”. The invite created a real pending Test invitation. The create link opened My Groups with the course and invitee preselected.
2. **Coursemate profile** — rebuilt with the same card and panel layout as the signed-in profile: avatar, name, shared-course status, About, strengths and study information. Only the approved shared-course fields are shown.
3. **Shared navigation** — `Stage6Layout` now wraps group chat, group members, people and coursemate profile pages in `AppShell`, so the desktop sidebar and mobile bottom navigation stay available on every page.
4. **Private group chat** — My Groups now shows every joined group, with “Open private chat” and “View members”. Rename controls appear only for the leader. Browseable group cards show “Open chat” only to active members; non-members see only “View members”.

## Verification results

- `pnpm check` passed.
- `pnpm test` passed 99/99.
- `pnpm build` passed.
- `git diff --check` passed.
- Desktop browser QA passed for the display-name gate, people actions, profile page, sidebar, private chat send/refresh, recruitment post browsing and Apply to join.
- Mobile bottom navigation is covered by the existing responsive `AppShell` CSS, but a fresh 375px visual pass of every new route is still recommended before Main promotion.

## Known limits

- Main does not have the people-page migration yet. Main promotion needs a new written authorization.
- The QA accounts and rows are Test-only and must not be copied to Main.
- Recruitment post apply deliberately creates a pending request; it does not add a member.

## Public release (2026-11-18)

- Source PR #22 merged into GitHub `main` at `0df367fc40db6311233cf265813d16eef4b8911f`.
- WebDev `main` synced to `889b8806561c13a04836e1fbb0170d149968d4ea`; Auto Publish deployed it to https://clinkdemo-z7jrfxui.manus.space.
- Live asset confirmed as `index-a8syhxIG.js`.
- Live checks passed: My Groups shows **Open private chat** and **View members**; a non-member sees no Open chat on another group; the people page lists four recruitment posts and the ungrouped coursemate actions; Ava's profile uses the new card layout; the saved chat message is visible after refresh.
- Main still does not have the people-page migration `20261118083000_stage6_people_page_naming.sql`; a separately authorized Main promotion is required before these screens can use Main.

## People-page layout update (2026-11-18, branch `feature/people-page-coursemate-layout`)

Adam asked for the no-group panel to expose one action, “Find your groupmate”, and for the people page to use the same coursemate-list design that shows “In a group” and “Looking for a group” cards.

### What changed

- `AuthenticatedMyGroup.tsx`: the no-group panel now has one primary **Find your groupmate** link to `/my-courses/:courseId/groups`. The duplicate classmate-list card and the old inline first-invite form were removed from that panel. The old form called the removed two-argument RPC, so keeping it would have produced a runtime error.
- `GroupWorkspacePage.tsx`: the verified `AuthenticatedCoursePeers` list is embedded at the top of the people page. The old ungrouped-only section and its duplicate RPC request were removed. Groups and recruitment posts remain below the coursemate list.
- `AuthenticatedCoursePeers.tsx`: added an `embedded` mode that renders the existing coursemate list without repeating the course heading, description and roster notice. Full-page rendering at `/courses/:courseId/classmates` is unchanged.
- Grouped coursemates now show an **In a group** badge instead of their stale profile status (“Looking for a group”). The card still shows the group name, active member count and status, plus the approved View portfolio link and request action.
- `MyCourses.tsx`: the course-card link now reads **Find your groupmate**.
- Test-only QA cleanup: the two profiles still named “New CityLink member” were identified as the labelled Bob and Cara QA accounts and renamed **Bob QA** and **Cara QA** through a direct Test `profiles` update. No real student data, Main access or secret was involved.

### Data and permissions

No schema, RPC, RLS or Main change. The embedded list uses the existing field-limited `list_course_classmates`/group-summary responses and the existing people-page profile route. Group cards show private chat only to active members; the embedded list’s request action still calls Roy’s existing `request_to_join_group` path.

### Checks and browser results

- `pnpm check` passed.
- `pnpm test` passed **99/99** across 13 test files.
- `pnpm build` passed (Vite production build).
- `git diff --check` passed.
- Signed-in desktop browser QA at 127.0.0.1:3010 against Test:
  - My Group with no group shows exactly one **Find your groupmate** button.
  - The people page shows 18 coursemates: 6 **In a group** and 12 **Looking for a group**, with group name/size and request/invite actions.
  - Grouped cards show **In a group**, not the old “Looking for a group” badge.
  - The full `/courses/:courseId/classmates` page still renders its course heading and list.
  - The page keeps the shared sidebar; mobile bottom navigation uses the existing `AppShell` responsive CSS. A fresh 375px visual pass of this exact page is still recommended.

### Still open

- This branch is not merged or published yet.
- Live QA after publication and a separate Main promotion authorization remain required.

### Follow-up card spacing (same day)

The embedded roster did not load the full-page `.course-detail-page` selectors, so the group name and member count ran together and the View portfolio link did not use the course-detail spacing. `CourseDetail.css` now applies the same group-meta grid and block-level View portfolio link to `.course-detail-embedded`. Rechecked locally: group name and “3 people · Active” are on separate lines, and View portfolio is below the major/year line. No data, API or permission change.
