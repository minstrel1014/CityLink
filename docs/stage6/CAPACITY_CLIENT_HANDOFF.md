# Capacity client coordination and handoff

## Assignment and authority

- **Human owner:** Adam. His base role remains Project, Integration, and Release Lead. Demo repair, signed-in user journey, QA refinements, and capacity-client UI are additional assignments on the existing Adam-repair task; none replaces an earlier role or task.
- **2026-11-19 instruction:** Adam asked Adam-repair to prepare the coordinated capacity-client pull request and send it to the existing integration-lead task for review and coordination.
- **Affected existing roles:** Roy — group creation, invitations, join requests and management; Jeffery — recruitment and People read integration; Role 6 — database/security review; Eunice — QA; Adam — product, repair and release coordination. This assignment does not transfer or overwrite their roles.

## Approved product behavior

Adam approved a leader-set hard maximum of 2–19 active members. A new group must choose its maximum when its name is entered; the current group leader may change it, but cannot lower it below current active membership. Existing groups must choose a maximum before adding anyone. A group already above 19 must reduce membership manually to 19 or fewer before choosing a valid maximum or adding anyone; membership is never removed automatically. When full, block new invitations and join applications; keep existing pending invitations and requests pending and prevent their acceptance/approval until a place opens. Show “Group is full” when an invite, join, acceptance, or request is blocked, and show current/maximum on grouped People cards. Only the current leader reviews requests and may perform separately approved manual member removal.

Direct join requests remain **presentation-only**: the server `request_to_join_group` RPC remains callable by an eligible client; do not claim the server requires a recruitment post. Adam released the Option A My Groups/People UI change separately; avoid accidentally restoring its removed direct-request button when integrating with [draft PR #33](https://github.com/minstrel1014/CityLink/pull/33).

## API and release boundary

- GitHub `main` at `1a583e30c019733d1880d2614ca853481509fdad` is the verified starting point for the separate `feature/adam-capacity-client` branch.
- [Draft migration PR #34](https://github.com/minstrel1014/CityLink/pull/34) was `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d` at task start. Role 6 reported no new static SQL blocker at `eab4335`; the later change recorded the review. Static review is not live authorization, runtime concurrency verification, or permission to apply SQL.
- [PR #32](https://github.com/minstrel1014/CityLink/pull/32) is an unmerged contract proposal: the explicit approved product rules above are decisions; technical choices and other proposed behavior still require coordination and review. The client must be reviewed against the exact final migration head.
- This feature branch is **client and documentation only**. Do not write or apply a migration, access or change Supabase Main, or modify Test data/schema/RLS/grants. Never insert or remove memberships directly from the client, and never use a secret or service-role key in the frontend.
- The old creation signature and strict read mappers are incompatible with the draft schema; a new four-argument-only client may also be incompatible with the old backend. Client/schema rollout, stale cached clients, and Test authorization remain a release coordination gate. Do not claim that the cap is live, or publish/merge, solely because this branch builds.

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
2. Open [PR #31](https://github.com/minstrel1014/CityLink/pull/31) adds a profile-based group-creation path that still calls the three-argument client function. Its owner and the lead must add the explicit maximum there and reconcile the overlapping People file before release.
3. The migration draft [PR #34](https://github.com/minstrel1014/CityLink/pull/34) was checked at head `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`. The capacity client depends on that draft's exact API; old clients break after the migration, and this new client is not compatible with the old Test schema. Agree an explicit coordinated cutover and stale-cache recovery plan, obtain Role 6/owner review and **separate authorization** for the exact Test-only migration, and perform authorized QA. Do not execute SQL, change Test or Main, merge, or publish as part of this client task.
4. A previously identified recruitment-create concern remains for the owners to verify: the draft group-list function excludes groups where the viewer is an active member while deriving `can_create_post` from such membership. This client PR does not change the database or claim to resolve that issue.
5. Independent review of the final integrated client, current-leader permissions, existing-group cases, account switches, full/pending flows, leader removal/re-invitation, and concurrent last-place admissions remains outstanding. Roster pagination cannot provide a transactional snapshot across multiple reads; Test concurrency QA and the locked server checks are essential. No database application or production authorization is implied by local checks.

### Changed areas

`client/src/lib/supabaseGroups*`, `supabaseStage6*`, and `courseDetailActions*` cover service contracts, mapping and tests. `AuthenticatedCoursePeers.tsx`, `PeopleCapacity*`, `AuthenticatedMyGroup*`, `GroupCapacitySettings.tsx`, `GroupMemberRemoval.tsx`, `GroupWorkflows*`, `GroupWorkspacePage*`, `Stage6Capacity*`, `groupCapacity*`, and `ActiveGroupsPanel*` cover the UI and tests. `OptionAUiContract.test.ts`, this handoff, and `TODO.md` record regression and coordination boundaries. No migration file is added or changed.
