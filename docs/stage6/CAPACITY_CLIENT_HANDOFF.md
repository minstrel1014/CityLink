# Capacity client coordination and handoff

## Assignment and authority

- **Human owner:** Adam. His base role remains Project, Integration, and Release Lead. Demo repair, signed-in user journey, QA refinements, and capacity-client UI are additional assignments on the existing Adam-repair task; none replaces an earlier role or task.
- **2026-11-19 instruction:** Adam asked Adam-repair to prepare the coordinated capacity-client pull request and send it to the existing integration-lead task for review and coordination.
- **Affected existing roles:** Roy — group creation, invitations, join requests and management; Jeffery — recruitment and People read integration; Role 6 — database/security review; Eunice — QA; Adam — product, repair and release coordination. This assignment does not transfer or overwrite their roles.
- **Review:** [Draft PR #36](https://github.com/minstrel1014/CityLink/pull/36), branch `feature/adam-capacity-client`. Implementation checkpoint `d52c3591e968362672167e19e9a1649d2ebc49d6` was pushed and verified; the PR remains unmerged.

## Approved product behavior

Adam approved a leader-set hard maximum of 2–19 active members. A new group must choose its maximum when its name is entered; the current group leader may change it, but cannot lower it below current active membership. Existing groups must choose a maximum before adding anyone. A group already above 19 must reduce membership manually to 19 or fewer before choosing a valid maximum or adding anyone; membership is never removed automatically. When full, block new invitations and join applications; keep existing pending invitations and requests pending and prevent their acceptance/approval until a place opens. Show “Group is full” when an invite, join, acceptance, or request is blocked, and show current/maximum on grouped People cards. Only the current leader reviews requests and may perform separately approved manual member removal.

Direct join requests remain **presentation-only**: the server `request_to_join_group` RPC remains callable by an eligible client; do not claim the server requires a recruitment post. Adam released the Option A My Groups/People UI change separately; avoid accidentally restoring its removed direct-request button when integrating with [draft PR #33](https://github.com/minstrel1014/CityLink/pull/33).

## API and release boundary

- GitHub `main` at `1a583e30c019733d1880d2614ca853481509fdad` is the verified starting point for the separate `feature/adam-capacity-client` branch.
- [Draft migration PR #34](https://github.com/minstrel1014/CityLink/pull/34) was `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d` at task start. Role 6 reported no new static SQL blocker at `eab4335`; the later change recorded the review. Static review is not live authorization, runtime concurrency verification, or permission to apply SQL.
- [PR #32](https://github.com/minstrel1014/CityLink/pull/32) is an unmerged contract proposal: the explicit approved product rules above are decisions; technical choices and other proposed behavior still require coordination and review. The client must be reviewed against the exact final migration head.
- This feature branch is **client and documentation only**. Do not write or apply a migration, access or change Supabase Main, or modify Test data/schema/RLS/grants. Never insert or remove memberships directly from the client, and never use a secret or service-role key in the frontend.
- The old creation signature and strict read mappers were incompatible with the pre-Option-A draft schema; **Superseded by Adam’s 2026-11-20 approval** and the 2026-11-21 Option A compatibility contract: the old three-argument creation call remains as a fail-closed `group_capacity_upgrade_required` / SQLSTATE `45000` stub, while capacity-aware clients use the four-argument create and separately named capacity reads. Client/schema rollout, stale cached clients, exact SQL/client joint review, and Test authorization remain release coordination gates. Do not claim that the cap is live, or publish/merge, solely because this branch builds.

## Implementation, tests, and known issues

### Client implementation

- The My Groups and People creation flows require an explicit group name and a whole-number maximum of 2–19, and the client calls the draft four-argument `create_group_and_invite`. The maximum has no preselected default.
- The group service maps the draft capacity fields and `available`, `full`, `maximum_not_set`, and `over_limit` states, and exposes the draft `set_group_max_members` and `remove_group_member` RPC wrappers. The group leader can edit the maximum and manually remove an eligible nonleader member through confirmation; no client code automatically removes members.
- Grouped People cards display the returned current/maximum and status. Recruitment results map the draft capacity fields and application-block reasons. The existing admission actions surface `Group is full` or the unset/over-limit explanations. Existing pending items are not cancelled by the client. Only the server can make the authoritative admission decision.
- The Option A direct request control is not exposed on My Groups, pending-request cancellation remains, and recruitment-post Apply continues using the unchanged `request_to_join_group` wrapper. People and My Group wording does not claim the server requires recruitment posts. A previously accepted invitation does not prevent a later re-invite when the current server-provided candidate list says the person is eligible.
- Roster reads page through the existing RLS-protected membership query and check exact counts, duplicates, and changed totals rather than silently trusting a truncated page. A forming creator who is not an active member may have restricted visibility, so the UI does not claim an authoritative count in that case; it tells them the server will check capacity. Client-side counts can still go stale or change during concurrent writes; the database remains authoritative.

### Validation — 2026-11-19

- `corepack pnpm check`: passed (`tsc --noEmit`).
- `corepack pnpm test`: passed, **21 files and 294 tests**. The platform test emitted the existing missing-OAuth-configuration and deliberately invalid session-payload messages; the tests themselves passed.
- `corepack pnpm build` with the running Preview's verified, browser-safe **Test-only** settings held in memory: passed, **1,746 modules**. It emitted the existing non-module configuration-script warning and greater-than-500-kB chunk advisory. The build did not contact a database.
- Prettier on the changed files and `git diff --check`: passed. Tests are local/mock-based; no signed-in mutation, multi-account, authorization, race, or real-device QA was run.

### Integration and release gates — do not apply or deploy yet

1. This branch is based on current `main`, not draft [PR #33](https://github.com/minstrel1014/CityLink/pull/33). Its People, My Group, My Groups, recruitment and action-helper files overlap. Although this branch preserves Option A, it does **not** include all of PR #33's unified-list, invitation, and Back-navigation changes. The lead must coordinate and reconcile both branches, preserve both features, and rerun checks before release.
2. Open [PR #31](https://github.com/minstrel1014/CityLink/pull/31) contains the historical profile-based path that called the three-argument client function. That old implementation wording is **Superseded by Adam’s 2026-11-20 approval** for the portfolio existing-group full-roster precheck and by the 2026-11-21 Option A contract; exact client integration and QA remain gates before release.
3. The migration draft [PR #34](https://github.com/minstrel1014/CityLink/pull/34) was checked at head `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`. The capacity client depends on that draft's exact API; old clients break after the migration, and this new client is not compatible with the old Test schema. Agree an explicit coordinated cutover and stale-cache recovery plan, obtain Role 6/owner review and **separate authorization** for the exact Test-only migration, and perform authorized QA. Do not execute SQL, change Test or Main, merge, or publish as part of this client task.
4. The draft discovery function excludes groups where the viewer is an active member, so its `can_create_post` value cannot identify the viewer's own group. The review follow-up below provides a separate client entry point using existing reads; it does not change or claim to repair the SQL function. Verify the exact deployed contract and the client flow during authorized Test QA.
5. Independent review of the final integrated client, current-leader permissions, existing-group cases, account switches, full/pending flows, leader removal/re-invitation, and concurrent last-place admissions remains outstanding. Roster pagination cannot provide a transactional snapshot across multiple reads; Test concurrency QA and the locked server checks are essential. No database application or production authorization is implied by local checks.

### Changed areas

`client/src/lib/supabaseGroups*`, `supabaseStage6*`, and `courseDetailActions*` cover service contracts, mapping and tests. `AuthenticatedCoursePeers.tsx`, `PeopleCapacity*`, `AuthenticatedMyGroup*`, `GroupCapacitySettings.tsx`, `GroupMemberRemoval.tsx`, `GroupWorkflows*`, `GroupWorkspacePage*`, `Stage6Capacity*`, `groupCapacity*`, and `ActiveGroupsPanel*` cover the UI and tests. `OptionAUiContract.test.ts`, this handoff, and `TODO.md` record regression and coordination boundaries. No migration file is added or changed.

### PR #36 review follow-up — 2026-11-19

The review identified that putting the post-creation form on discovery rows made it unreachable for the viewer's own group. The client now has a separate Your Group entry point: it intersects existing RLS-visible groups with the signed-in viewer's active memberships in the selected course and checks positive current-term and own-enrolment evidence using existing services. Leaders and nonleader members are treated alike; an active one-person group, a full group, and a group with no maximum are not excluded from posting. The existing creation RPC still makes the final authorization decision. No recruitment rules, RPCs, RLS, or database objects are changed.

The own-group read now filters the viewer's active memberships to the selected course, uses bounded ordered pagination and exact counts, verifies matching group rows, and fails closed on incomplete or inconsistent results. Current-term and enrolment evidence is also filtered to the selected course, rather than relying on a whole-catalogue read. Group and post lists load independently of posting eligibility: if eligibility is pending or cannot be established, post creation stays hidden and the user is offered a retry, while available browsing results remain visible. These separate reads can become stale and are not a transactional snapshot; absence from a read is not conclusive proof that no group exists. Actual PostgREST filtering, RLS, and counts still require authorized Test verification.

For this post-creation action, the client verifies a captured session token, checks that the account/course context is still current, and attaches that verified token to the individual RPC request. It does not store or log the token. An already dispatched request cannot be undone by switching accounts. The UI also scopes loaded data, completions, and drafts to the current account/course/session, suppresses duplicate submissions, and prevents editing another post from overwriting a pending creation draft.

Adam chose option A on 2026-11-19: close the pre-existing account-switch mutation gap before release. The new `supabaseRequestAuth.ts` helper captures `getSession()`, verifies that exact access token with `getUser(token)`, and attaches `Authorization: Bearer <token>` to the individual request. It now covers every group mutation through `callGroupRpc` (creation, invitation/response/cancel, join request/review/cancel, rename, maximum, removal), Stage 6 chat send and recruitment-post edit/close, the profile display-name RPC and profile-field update, and course add/remove enrolment writes. No mutation is dispatched without a verified captured token, and the token is not stored or logged. Real browser lifecycle, live PostgREST/RLS authorization, account-switch QA, and multi-account/concurrency QA remain outstanding; the server remains authoritative.

The People-card single-member label now says `1 member / 5 max` for that example, and the My Group name input and help text now match the existing 50-character service limit. This follow-up changes `GroupWorkspacePage.tsx`, `GroupWorkspaceScope.ts`, `supabaseCourses.ts`, `supabaseGroups.ts`, `supabaseStage6.ts`, `supabaseProfile.ts`, `supabaseRequestAuth.ts`, `AuthenticatedProfile.tsx`, their relevant tests, `PeopleCapacity.tsx` and its test, `AuthenticatedMyGroup.tsx`, and `groupCapacity.test.ts`.

### Exact-head review follow-up — `7e8aeea`

Adam-repair's review found four client issues. The follow-up adds an optional `shouldDispatch` guard to the group, Stage 6 chat/recruitment, course-enrolment, and display-name mutation services. `assertDispatchAllowed()` checks the caller's account/course/generation guard after token verification and immediately before constructing the request; already-dispatched requests are still irreversible. The existing GroupWorkflows, My Group, People, recruitment, chat, course, and profile actions pass their scoped guards.

The profile save now rechecks its context after the display-name RPC and before the separate profile-field update, so a context switch cannot start the second write. DisplayNameGate now scopes save completion to the initiating account generation, preventing a delayed save from account A from unlocking account B's client-side name gate. Capacity-blocked My Groups and recruitment Apply states now expose a **Refresh group status** action; the server remains authoritative.

### Latest exact-head review follow-up — `d477760`

Adam-repair's re-review found that the People invitation/creation guard survived unmount, the recruitment capacity refresh replaced the whole workspace and discarded drafts, People summaries could remain stale after a capacity refresh, and same-account sign-out/re-sign-in or chat route changes still had timing windows. This follow-up addresses those client findings:

- `SupabaseSessionContext` now exposes an `authGeneration` that increments on each Supabase auth event. Workspace, My Groups, My Group, People, course-enrolment, chat, and profile actions include it in their invalidation checks. The authenticated `/me` page is keyed by account plus generation so stale account-bound state cannot remain mounted.
- People invitation/group-creation actions invalidate their guard on unmount and on account/session changes; a delayed completion cannot submit or display for an unmounted or different-account view.
- DisplayNameGate records the exact account/generation whose stored name was confirmed. If the account or auth generation changes, the gate returns to checking and blocks protected routes until the new identity is verified. A late save from the old identity cannot mark the new identity ready.
- Recruitment **Refresh group status** now reloads only recruitment pages and updates the separately mounted People summaries. It preserves the current create/edit draft, the loaded page count, and unsaved subject/body text; it does not reload groups or the whole workspace.
- Chat send and history completions now check the live group ID and auth generation in addition to the account, so a route change or same-account re-sign-in cannot apply a late result to another group or session.

Final local checks for this follow-up: `corepack pnpm check` passed; `corepack pnpm test` passed **26 files / 472 tests**; the Test-configured build passed with **1,748 modules** and the existing configuration-script/chunk advisories. Tests use mocked hooks and services. Mounted-browser account-switch, same-account re-sign-in, chat route-change timing, stale-profile paint privacy, live RLS, and concurrent-last-place QA remain outstanding. Already-dispatched requests cannot be undone by switching accounts; the server remains authoritative. No SQL, database, merge, or publication occurred.

### DisplayNameGate onboarding/recovery blocker — 2026-11-19

Adam-repair's exact-head re-review found that the new account-bound gate masked two completed states as `checking`: an account with no usable stored name (`needs-name`) and a failed profile read (`error`). The gate now records the exact account/generation for every completed load state, not only `ready`, so the name form and Retry/Sign out recovery remain reachable while a different account still starts in `checking`.

Mounted jsdom tests now cover a valid stored name, the needs-name form, a profile-read error with recovery controls, and an account switch from a valid name to a new unnamed account. The component explicitly imports React for this test runtime; `jsdom` is a development dependency only. No production API, RPC, database, or authorization behavior changed.

Final local checks for the blocker fix: `corepack pnpm check` passed; `corepack pnpm test` passed **27 files / 476 tests**; `corepack pnpm build` passed with **1,748 modules** and the existing configuration-script/chunk advisories; Prettier and `git diff --check` passed. These are mounted test-runtime checks, not a signed-in browser or live Test result. No SQL was executed and neither Test nor Main was changed.

### Post-`dd20e6a` lifecycle and capacity follow-up — 2026-11-19

The independent review is still pinned to `dd20e6a`; this follow-up is not independently reviewed yet. It addresses the later findings without changing SQL, RLS, Test, or Main:

- Same-session `SIGNED_IN` on tab focus no longer increments the auth generation or remounts drafts. `INITIAL_SESSION`, `SIGNED_OUT`, `PASSWORD_RECOVERY`, and a different-user sign-in remain boundaries. A process-local auth marker advances synchronously so a verified old session cannot dispatch after the boundary, even before React commits.
- Course enrolment writes recheck the captured boundary after `verifyCurrentOwner`; profile saves recheck before the second write. Group, chat, recruitment, and display-name mutations also pass the captured generation to the shared dispatch guard.
- People action invalidation now runs in `useLayoutEffect`, closing the passive-effect unmount window.
- Chat clears its draft and busy state when the group or auth generation changes.
- Coursemate profile state is cleared when the account or auth generation changes.
- Capacity refresh is serialized against post/group pagination, preserves loaded posts and group cards that were not present in the refreshed range, preserves drafts, and refreshes browseable group cards as well as People summaries.
- People invites now disable and explain known `full`, `maximum_not_set`, and `over_limit` groups before dispatch. Roster counts come from a separate full `listActiveGroupMembers` read for each invite group; a forming creator with no membership row has the safe one-person fallback, while a failed roster read remains server-checked.
- The browse-card `Open chat` branch gated on `canCreatePost` was removed. Private chat remains available from the current-member card in My Group through `Open Group Chat`.
- A successful Apply now refreshes recruitment posts and group cards so the pending state is not left clickable.
- Workflow group reads now validate `max_members` as null or a whole number from 2 to 19 instead of accepting an unvalidated cast.

Local checks for this follow-up: `corepack pnpm check` passed; `corepack pnpm test` passed **29 files / 489 tests**; `corepack pnpm build` passed with **1,749 modules** and the existing configuration-script and chunk-size warnings. These are mocked/local checks, not signed-in browser, live RLS, or concurrent-user QA.

### Final confirmed-fix pass — 2026-11-19

- People invite capacity now loads the full roster with `listActiveGroupMembers` for each invite group instead of counting the viewer's one membership row. A forming creator with no membership row uses the safe one-person fallback; a failed roster read fails closed to the server check. The workflow snapshot remains viewer-filtered.
- Group and post pagination now use an unconditional `settle` callback to release their operation locks even when a workspace reload invalidates the scoped request. The capacity/Apply refresh can therefore run after an overlapped Load more.
- Recruitment-post creation performs a final synchronous scope recheck immediately before claiming the write.
- Group-service session verification captures and validates the current access token without calling the SDK's session-removing `getUser()` path for a replaced cross-tab account.
- `getGroupWorkflowErrorMessage` returns the approved exact string `Group maximum is not set`; longer guidance remains a separate UI explanation.

Limitation retained deliberately: a same-user sign-in in another tab is treated as confirmation, not an identity boundary, so the app does not force a remount or clear drafts for it. A different user, sign-out, password recovery, or initial session still invalidates the old request boundary. Live cross-tab and mounted-browser verification remains required.

### Remaining pre-existing review risks (not fixed in this follow-up)

- Profile fields remain editable while a save is pending; a late completion can replace the draft and discard later typing.
- The installed auth SDK’s `getUser` missing-session error path can remove a newer stored session; this is pre-existing and not unique to this branch. Authorized mounted-browser/account-switch QA must verify it.
- These are tracked separately from the four addressed review findings and do not imply server authorization is weak; server RLS/RPC checks remain authoritative.

Added `client/src/lib/supabaseRequestAuth.test.ts` for the guard helper and updated the source-contract/workspace tests for the new optional argument. Final local checks: `corepack pnpm check` passed; `corepack pnpm test` passed **26 files / 472 tests**; `corepack pnpm build` with verified browser-safe Test-only configuration passed with **1,748 modules**, the existing non-module configuration-script warning, and the existing greater-than-500-kB chunk advisory. Formatting and `git diff --check` are checked before the follow-up commit. Component tests use mocked React hooks, so they do not substitute for mounted-browser or live Test QA. No SQL was executed; neither Test nor Main database was changed.
