# Authenticated workspace shell handoff

| Field                 | Value                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Date                  | 2026-11-18                                                                                                  |
| Owner                 | Adam                                                                                                        |
| Base role             | Project, Integration, and Release Lead                                                                      |
| Additional assignment | Detailed CityLink demo review/revision and feature-connection work; this does not replace Adam’s lead task. |
| Feature branch        | `feature/adam-ux-shell`                                                                                     |
| Baseline              | GitHub `minstrel1014/CityLink` `main`, starting commit `c93e6c2`                                            |

## Purpose and user-facing behavior

This feature gives a signed-in student one consistent CityLink workspace instead of sending the student back to the sign-in form or a page that mixes real and fictional data. A normal restored or successful Supabase Auth session goes to `/dashboard`. The dashboard opens with **My courses** first and selected; **All courses** remains the second tab. A signed-in visit to `/courses` opens the full Test-backed course directory. The old `/my-courses` path stays available as a redirect so existing links continue to work.

Course cards show the existing Test-backed enrollment total and, only on the dashboard and only for a course the signed-in student is enrolled in, initials for enrolled coursemates and the count of those marked open to finding a group. The complete course identity/title plate is a keyboard-accessible link to authenticated course details. The distinct **My group** action remains available for the group workflow. No sample classmate counts are presented as real counts.

The authenticated AppShell provides Dashboard, Courses, Invitations, Messages, and My profile navigation, a local sign-out control, the existing brand link, a reachable About page, and responsive bottom navigation. The signed-out `/demo` experience and existing fictional route family remain in place and are not included as a signed-in primary navigation destination.

Invitations is a read-only summary of existing incoming/outgoing invitations and visible pending join requests. The established group actions remain on My Groups. Messages lists only active groups in which the current account has an active membership and links to the existing Group Chat placeholder. **No chat or private-message page, message API, composer, storage, or send/receive behavior was added.** The existing Group Chat link inside course detail remains the Stage 6 slot; the shell can host that future page without restructuring.

## Role/owner ledger

| Person                 | Human owner | Base role                                               | Additional assignment(s)                                                                                                                     |
| ---------------------- | ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Adam                   | Adam        | Project, Integration, and Release Lead                  | CityLink demo repair and feature-connection work; authenticated workspace shell, end-to-end routing, and dashboard UX in this feature branch |
| Group-workflow owner   | TBD         | Group creation, invitations, and join-request workflows | No new assignment in this feature                                                                                                            |
| QA/documentation owner | TBD         | QA and documentation                                    | No new assignment in this feature; badge implementation remains unassigned                                                                   |
| Jeffery                | Jeffery     | Stage 6 group chat and recruitment work                 | Existing Group Chat course-detail slot remains reserved; no chat implementation here                                                         |
| Role 6 owner           | TBD         | Database security and migration review                  | No database change in this feature                                                                                                           |

Adam’s repair assignment is additive and is not a replacement for, rename of, or handoff from the lead task. Existing role ownership was not changed.

## Decisions and data/API contracts

The approved details are recorded in [`docs/team/DECISIONS.md`](team/DECISIONS.md), dated 2026-11-18. The UI reuses current client contracts only: `loadCourseDirectory`, `loadCurrentTermCourseEnrollmentCounts`, `listCourseGroupPeers` for enrolled courses, and `loadGroupWorkflowSnapshot`. This shell does not add an RPC, route-backed write, database table, migration, RLS policy, grant, or schema change. Displayed roster initials and open-status counts are derived from the existing Test-backed peer read for the student’s enrolled course; Messages links are displayed only for active memberships.

Join-request display follows the current explicit project rule: the requester and the original group creator may see a request; the creator is represented by `study_groups.creator_id`. The new Invitations summary filters requests to that scope, and the existing workflow UI continues to gate review actions by that creator identifier. The backend review RPC is known to allow a broader set of active members. This branch does not modify that RPC or claim to fix the mismatch; Role 6 review and explicit lead approval are required before any Test database change. No Supabase Main access occurred, no Test schema was inspected or modified, and no persistent Test rows were created by this work.

The PR coordination instruction remains: PR #5 stays unmerged by decision. After this shell PR merges, Jeffery must merge the new `main` into `feature/jeffery-group-chat-recruitment`, resolve any conflicts, and rerun checks before Jeffery’s PR can merge.

## Files changed

- `client/src/App.tsx` — session-aware route branching, `/dashboard`, legacy `/my-courses` redirect, and authenticated shell wrappers while preserving fictional fallbacks.
- `client/src/components/citylink/AppShell.tsx` and `AppShell.css` — new desktop/mobile workspace shell, navigation, local-only sign-out, reserved empty invitation-badge slot, and embedded-page layout compatibility.
- `client/src/components/citylink/Shared.tsx` — optional brand destination for the authenticated shell; the existing default remains unchanged for fictional pages.
- `client/src/pages/citylink/Welcome.tsx` and `client/src/lib/workspaceRouteRules.ts` — ordinary signed-in landing to the dashboard while preserving the password-recovery path.
- `client/src/pages/citylink/MyCourses.tsx` and `MyCourses.css` — dashboard/directory view modes, primary My courses tab, existing-data classmate summaries, and a keyboard-accessible course identity link.
- `client/src/pages/citylink/AuthenticatedWorkspacePages.tsx` and its CSS — read-only Test-backed Invitations summary, active-group Messages list, and accurate signed-in About status.
- `client/src/pages/citylink/GroupWorkflows.tsx` — copy correction identifying the original creator as the join-request reviewer; no new mutation or RPC.
- `client/public/manus-routes.json` — session-dependent route documentation and Dashboard route.
- `client/src/lib/workspaceRouteRules.test.ts` — focused routing, visibility, active-group and route-manifest regression tests.
- `docs/team/DECISIONS.md`, `docs/WORKSPACE_SHELL_HANDOFF.md`, and `TODO.md` — approved behavior, role ledger, discoveries, validation and follow-up.

## Validation

Final validation passed `corepack pnpm check`; `corepack pnpm test` (10 files, 73 tests); `corepack pnpm build:static`; Prettier checks on all changed source/tests/docs/route manifest; and `git diff --check`. The build completed successfully with the pre-existing warning that `/api/platform/config.js` is a non-module script and the size advisory for the 503.47 kB minified JavaScript chunk (141.26 kB gzip), above Vite’s 500 kB threshold. The full test run prints the existing expected OAuth configuration/invalid-session logs from `server/platform.test.ts`; all 73 tests passed.

## Assumptions, known issues, and next steps

The browser session for an actual signed-in/mobile smoke test is not available in this GitHub source checkout. Therefore the successful build is not evidence that live Test authentication, the dashboard RPCs, or a visual signed-in flow were exercised. Use only the authorized disposable Supabase Test project (`wkzclgmhrtecnpexfesr`) if the Preview is later connected for an explicitly approved, non-writing smoke test; never use Main and never put a service-role key in the browser.

The current RPC’s broader join-request review permission remains an unresolved backend security mismatch; do not treat the client-side button/display gate as a replacement for server authorization. The live meaning and lifecycle of `study_groups.creator_id` must also be checked against the original-creator-only decision before a future permission migration, because earlier succession documentation described a leader transfer.

Next, finish the final check run, commit meaningful changes locally on `feature/adam-ux-shell`, push only that feature branch, verify the remote branch, and open a pull request for review. Do not push to or merge into `main` without the lead’s approval. After the shell PR merges, the separate Jeffery/PR #5 coordination sequence above applies.
