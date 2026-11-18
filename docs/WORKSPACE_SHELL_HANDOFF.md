# Authenticated workspace shell handoff

| Field                 | Value                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Date                  | 2026-11-18                                                                                                           |
| Owner                 | Adam                                                                                                                 |
| Base role             | Project, Integration, and Release Lead                                                                               |
| Additional assignment | Detailed CityLink demo review/revision and feature-connection work; this does not replace Adam’s lead task.          |
| Feature branch        | `feature/adam-ux-shell`                                                                                              |
| Baseline              | GitHub `minstrel1014/CityLink` `main`, starting commit `c93e6c2`                                                     |
| Commit                | `fd26cd56deac8a9a1e52bd6ebf38c7397cad9a8e`                                                                           |
| Pull request          | [PR #9](https://github.com/minstrel1014/CityLink/pull/9), open and unmerged; recheck mergeability after main changes |

## Purpose and user-facing behavior

This feature gives a signed-in student one consistent CityLink workspace instead of sending the student back to the sign-in form or a page that mixes real and fictional data. A normal restored or successful Supabase Auth session goes to `/dashboard`. The dashboard opens with **My courses** first and selected; **All courses** remains the second tab. A signed-in visit to `/courses` opens the full Test-backed course directory. The old `/my-courses` path stays available as a redirect so existing links continue to work.

Course cards show the existing Test-backed enrollment total and, only on the dashboard and only for a course the signed-in student is enrolled in, initials for enrolled coursemates and the count of those marked open to finding a group. The complete course identity/title plate opens the My Group first view as a keyboard-accessible link. The distinct **My group** action remains available. Current-term course IDs are obtained from the existing current-term counts service, including zero-count courses; if that service fails, the course list is hidden with a retry rather than displaying unverified older terms. No sample classmate counts are presented as real counts.

The authenticated AppShell provides Dashboard, Courses, Invitations, Messages, and My profile navigation, a local sign-out control, the existing brand link, a reachable About page, and responsive bottom navigation. Explicit `/demo/...` aliases keep fictional navigation fictional even if a Test session exists; existing signed-out route fallbacks remain available and the fictional demo is not a signed-in primary navigation destination.

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

The current project instructions approve only the original group establisher to review a request, and identify `study_groups.creator_id` as that person. The new Invitations summary filters by requester or recorded `creator_id`, but this is not proof that the field is immutable or that backend access is safe. The checked-in succession migration reassigns `creator_id` to a successor (lines 112–120) and its review RPC checks the current leader (lines 415–424); older decision history describes successor review authority, while the current project instructions expressly say original creator only. The lead task reports a separate option-B decision favoring successor authority. These sources conflict and must be reconciled explicitly by Adam, with Role 6 security review and live Test verification; do not assume either client filtering or historic migration text proves current backend enforcement. This branch does not modify any RPC or claim to fix the mismatch. No Supabase Main access occurred in this repair task, no Test schema was inspected or modified here, and no persistent Test rows were created by the smoke tests.

The PR coordination instruction remains: PR #5 stays unmerged by decision. After this shell PR merges, Jeffery must merge the new `main` into `feature/jeffery-group-chat-recruitment`, resolve any conflicts, and rerun checks before Jeffery’s PR can merge.

## Files changed

- `client/src/App.tsx` — session-aware route branching, `/dashboard`, legacy `/my-courses` redirect, and authenticated shell wrappers while preserving fictional fallbacks.
- `client/src/components/citylink/AppShell.tsx` and `AppShell.css` — new desktop/mobile workspace shell, navigation, local-only sign-out, reserved empty invitation-badge slot, and embedded-page layout compatibility.
- `client/src/components/citylink/Shared.tsx`, `Dashboard.tsx`, `Classmates.tsx`, and `Workspace.tsx` — optional authenticated brand destination and explicit fictional demo links, preserving the sample pages’ design and data separation.
- `client/src/pages/citylink/Welcome.tsx` and `client/src/lib/workspaceRouteRules.ts` — ordinary signed-in landing to the dashboard while preserving the password-recovery path.
- `client/src/pages/citylink/MyCourses.tsx` and `MyCourses.css` — dashboard/directory view modes, primary My courses tab, existing-data classmate summaries, and a keyboard-accessible course identity link.
- `client/src/pages/citylink/AuthenticatedWorkspacePages.tsx` and its CSS — read-only Test-backed Invitations summary, active-group Messages list, and accurate signed-in About status.
- `client/src/pages/citylink/GroupWorkflows.tsx` — copy correction identifying the original creator as the join-request reviewer; no new mutation or RPC.
- `client/public/manus-routes.json` — session-dependent route documentation and Dashboard route.
- `client/src/lib/workspaceRouteRules.test.ts` — focused routing, visibility, active-group and route-manifest regression tests.
- `docs/team/DECISIONS.md`, `docs/WORKSPACE_SHELL_HANDOFF.md`, and `TODO.md` — approved behavior, role ledger, discoveries, validation and follow-up.

## Validation

On 2026-11-18, after the merge-readiness corrections, `corepack pnpm check` passed; `corepack pnpm test` passed (10 files, 76 tests); `corepack pnpm build` passed; Prettier checks on changed source/tests/manifest passed; and `git diff --check` passed. The build reports the pre-existing non-module `/api/platform/config.js` warning and the 505.12 kB minified JavaScript bundle advisory (141.57 kB gzip). The full test run prints expected OAuth configuration/invalid-session logs from `server/platform.test.ts`; all tests passed.

On 2026-11-18, the separate `shell-test` Preview ran this feature branch without replacing the existing Preview checkout. Its running configuration was checked in memory and matched the approved Test root URL and browser-safe publishable-key prefix. After the owner signed in, desktop navigation reached Dashboard, Courses, a course-name link to My Group, classmates, Invitations, Messages, My Profile, My Groups, and the legacy redirect. Direct Dashboard-to-Courses and reverse navigation selected the intended tabs. The fictional demo directory, course, student profile, and own-profile routes remained fictional while signed in. An embedded simulated 375-pixel viewport reached Dashboard, Courses, Invitations, Messages, and Profile, with five navigation links and no horizontal overflow; this is not a physical-device test. No invitation, request, group, enrollment, profile, or database/schema change was submitted. Individual account and invitation details are intentionally omitted.

## Assumptions, known issues, and next steps

The smoke tests did not verify multi-account permissions, invitation/group mutations, failure injection, or a physical mobile device. Use only the authorized disposable Supabase Test project (`wkzclgmhrtecnpexfesr`) for any further explicitly approved, non-writing smoke test; never use Main and never put a service-role key in the browser. This feature branch’s existing Supabase client accepts any valid HTTP(S) URL and does not itself enforce the Test project ref or publishable-key prefix; verify the injected settings before each future Test Preview start rather than assuming that this branch prevents misconfiguration.

Join-request authority and `creator_id` succession are unresolved between current project instructions and the lead task’s reported option-B decision. Do not merge or release this shell as security-complete until Adam reconciles the decision and Role 6 reviews current Test authorization; do not treat the client-side gate as a security boundary. No database change is authorized by this handoff.

The initial feature commit is `fd26cd56deac8a9a1e52bd6ebf38c7397cad9a8e`; subsequent corrections are on the same `feature/adam-ux-shell` branch. [PR #9](https://github.com/minstrel1014/CityLink/pull/9) is open against `main` and has not been merged. Main advanced after the original feature fork; recheck the latest base and PR mergeability before review. Do not push directly to or merge into `main` without lead approval. After the shell PR merges, the separate Jeffery/PR #5 coordination sequence above applies.
