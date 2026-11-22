# CityLink Jeffery — F2 recruitment/post capacity read-path review

**Review task:** `ApSaUuidbYenqPumovZxUc`

**Coordinator:** `HeZwm7CA7Y3rDtYBounkVC`

**Exact reviewed head:** `344c1058e78fd2cccfde89574e226f3e65a1457c`

**Repository:** `minstrel1014/CityLink`

**Review mode:** read-only static source review in a separate detached checkout `/home/ubuntu/citylink-f2-review`

**Produced by:** task agent supporting Jeffery's retained human role; this report is not proof of human authorship.

## Scope and evidence boundary

This was a read-only review. The checkout was cloned separately, detached at the exact accepted integration SHA, and remained clean. No branch, edit, commit, push, Supabase/Test/Main access, SQL execution, migration, signed-in QA, merge, deployment or publication occurred. No secrets, `.env` values, auth cookies or credentials were read or printed. Static source and existing mocked-test evidence do not prove live schema, grants, RLS, Auth or concurrency behavior.

The exact-head assignment asked for six findings: capacity read-name consistency; preservation of the old wrapper shape; loading/load-more/Refresh/auth-generation serialization; future build/version-marker compatibility; relevance of approved versus pending stale-client wording; and whether a Jeffery-owner repair is required.

## Executive verdict

**No Jeffery-owner code defect requiring repair was found at `344c1058`.**

The recruitment-post client read path is consistent with the approved capacity-client contract: every client recruitment read goes through `listGroupRecruitmentPosts()`, whose sole service call is `list_group_recruitment_posts_capacity` with the unchanged four arguments and keyset cursor behavior. Its mapper already requires and validates the capacity/apply fields supplied by that capacity contract.

The exact head still carries the released legacy SQL wrapper `public.list_group_recruitment_posts` with its old 13-column return shape and no new capacity fields. That is compatible with Option A's shape-preservation rule, but it means the client/schema pair has a deployment dependency: the future approved capacity migration must create `list_group_recruitment_posts_capacity` before this client can be used against a target. The accepted client head does not itself prove that function exists in Test or Main; the attached evidence packet explicitly says neither live target currently has the capacity functions. This is a Role 6/coordinator/Test-preflight dependency, not a reason to change the Jeffery client path.

## 1. Capacity read-name consistency

**Pass, statically.**

At `client/src/lib/supabaseStage6.ts:135–147`, the narrow `RpcName` union contains `list_group_recruitment_posts_capacity` and no legacy recruitment-post RPC name. At `:710–723`, `listGroupRecruitmentPosts()` calls:

```text
list_group_recruitment_posts_capacity(
  p_course_id,
  p_after_created_at: after?.createdAt ?? null,
  p_after_id: after?.id ?? null,
  p_limit: RECRUITMENT_POSTS_PAGE_SIZE
)
```

`RECRUITMENT_POSTS_PAGE_SIZE` remains 20 (`supabaseStage6.ts:11`). The service test at `supabaseStage6.test.ts:656–662` pins the first-page call name and all four arguments; the keyset test at `:671–677` pins the capacity name and the supplied `createdAt`/`id` cursor. There is no literal legacy recruitment-post RPC name left under `client/src`.

All page-level recruitment reads route through this service function:

- initial posts load: `GroupWorkspacePage.tsx:242–271`;
- posts pagination: `:470–523`;
- capacity refresh: `:593–650`.

The page does not introduce an alternate recruitment RPC call.

The already-reconciled non-recruitment reads remain consistent and untouched in this review:

- `supabaseGroups.ts:417` → `list_course_group_summaries_capacity`;
- `supabaseStage6.ts:624` → `list_current_term_course_groups_capacity`.

## 2. Old wrapper shape and unintended field exposure

**Pass for the legacy wrapper's compatibility shape; deployment dependency noted.**

The released migration `supabase/migrations/20261118050000_stage6_chat_recruitment.sql:489–508` defines the legacy function with the original four arguments and exactly these 13 returned columns, in order:

```text
post_id
 group_id
 group_name
 active_member_count
 author_name
 body
 post_status
 created_at
 updated_at
 closed_at
 apply_enabled
 can_manage
 has_more
```

Its final SELECT at `:586–590` returns only those columns. It does not expose `subject`, `max_members`, `capacity_count`, `capacity_state` or `apply_block_reason`. This satisfies the approved Option A rule that old read wrappers preserve released result shapes and do not silently leak new fields.

The current client mapper is deliberately capacity-aware rather than a legacy-wrapper mapper. At `client/src/lib/supabaseStage6.ts:488–506`, `mapGroupRecruitmentPosts()` allowlists the capacity response fields, including `subject`, `max_members`, `capacity_count`, `capacity_state` and `apply_block_reason`; at `:201–228` it validates 2–19 maxima, canonical counts and derived capacity state; at `:526–580` it validates apply-block precedence and redacted terminal-group behavior. This is consistent with the separately named capacity function, not with the old wrapper.

The exact accepted client head therefore has a normal Option A rollout dependency: the new capacity function must be created and reviewed/applied before this client is pointed at a target. The coordinator evidence packet records that neither live Test nor Main currently has the capacity functions or `study_groups.max_members`; this review did not inspect either target.

## 3. Loading, Load more, Refresh and auth/session-generation serialization

**Pass in static source and existing mocked tests.**

### Initial loads and stale responses

`GroupWorkspacePage.tsx:242–271` assigns each posts load an incrementing `postsAttempt`, checks `scope.isCurrent(token)` before starting, and applies success/error only through `updateSnapshot()` with both the attempt and workspace token checks. `GroupWorkspaceScope.ts:68–75` requires ready status, the same user, course, auth generation and workspace generation.

`GroupWorkspaceScope.ts:38–48` invalidates the generation when rendered context changes. `GroupWorkspacePage.tsx:96–105` updates that scope in a layout effect on status, user, course or `sessionGeneration`, and the content tree is keyed by those same values at `:107–119`. The inner effect cleanup at `:376–383` clears the capacity queue and invalidates the old token.

### Load more and queued Refresh

`loadMoreGroups()` (`GroupWorkspacePage.tsx:415–468`) and `loadMorePosts()` (`:470–523`) synchronously claim their operation lock before awaiting service work. Each has a `settle` handler that releases its lock and calls `capacityRefresh.current?.settle()` on both success and failure. Thus a Refresh requested during either Load more is not silently rejected and is resumed after the blocking operation settles.

`RefreshQueue` (`client/src/lib/refreshQueue.ts:19–123`) retains at most one token intent. It returns `queued` while either pagination lock or another refresh is active, coalesces repeated requests, checks `isCurrent()` before service work, and discards stale intent without a call. A failed run clears the pending intent rather than automatically retrying. A request arriving while a run is active becomes one additional bounded intent; it does not create recursive or unbounded work.

### Refresh serialization and loaded ranges

`runCapacityRefresh()` (`GroupWorkspacePage.tsx:593–665`) claims both `postsOperation` and `groupsOperation` before its first service call and releases both in `finally`. It refreshes loaded posts through the capacity read first, then loaded group cards (`refreshGroupsForCapacity()` at `:525–585`), and only then increments the People-card refresh token and displays the success message. A group-read failure propagates to the single catch path and cannot be reported as success. The existing loaded post/group ranges and local draft/pending state are merged rather than reset.

The refresh uses a bounded maximum of 20 pages (`GroupWorkspacePage.tsx:621–628` and `:559–562`) while it reads enough pages to cover the currently loaded ID set. This is an explicit safety bound in the current implementation, not an observed defect at ordinary page sizes; if product requirements later permit more than 20 pages of loaded posts/groups, that bound should be revisited by a separately scoped owner decision.

The page controls are serialized consistently: `Load more groups` is disabled when `groupsPageBusy || postsRefreshBusy` (`:1074`), and `Load more posts` is disabled when `postsPageBusy || postsRefreshBusy` (`:1312`). The Refresh control exposes running/queued state at the recruitment card area (`:1285–1307`).

The existing focused tests cover queueing behind posts/groups Load more, coalescing, stale course/auth-generation discard, restart after failed pagination, refresh failures, group-read failures, durable pending Apply state and restoration of Load more controls. The test headings are in `GroupWorkspacePage.refreshQueue.test.ts`; service cursor/name assertions are in `supabaseStage6.test.ts`.

### Boundary note

This is static/mock evidence only. It does not establish real network ordering, database transaction behavior, RLS, Auth event timing or cross-account concurrency.

## 4. Future build/version marker compatibility

**No current marker exists in the reviewed recruitment path; an additive marker can integrate without contract drift if kept outside the RPC contract.**

The exact head has no `buildVersion`, commit SHA, release-version or `VITE_*_VERSION` marker in the client/service path. Existing cache-related evidence is limited to shell/platform behavior: `server/_core/index.ts:19` and `vite.config.ts:161` set `no-store` for relevant responses; `server/_core/vite.ts:32–35` reloads `index.html` from disk in development. These findings do not constitute approval of a future implementation.

A future verifiable marker can be read by the UI/rollout guard and carried through the existing `WorkspaceContext`/page state without adding fields to `list_group_recruitment_posts_capacity`, changing the 4-argument RPC call, changing the legacy wrapper, or changing mapper allowlists. It must not be inferred from browser cache time, appended as an RPC argument, used to reinterpret capacity values, or used to auto-reload/retry. The approved F2 policy requires a user-triggered refresh only; it does not authorize a new proactive message or automatic reload. Any marker implementation remains a separate exact assignment and must preserve the current recruitment read contract.

## 5. Stale-client wording and recruitment relevance

The exact approved create-path string is:

```text
CityLink needs an update. Refresh before creating a group.
```

It is specifically scoped to the group-creation stale-client flow. This review found no recruitment-post code that should reuse it. Recruitment reads should continue to use their existing capacity/read failure mapping and truthful Refresh state.

Adam's second proactive notice and browser-refresh examples remain examples pending final wording/mapping confirmation. This review does not invent, select or recommend a new user-facing string for recruitment posts. No stale-client handler, automatic reload, retry, storage preservation or draft-recovery behavior was added.

## 6. Defects versus future blockers

### Jeffery-owner defects requiring repair

**None found.** No code edit is requested from Jeffery by this review.

### Future integration/security/QA blockers (not Jeffery defects)

1. **Capacity schema dependency:** the accepted client head calls `list_group_recruitment_posts_capacity`, while the checked-in legacy migration at this head defines only the old wrapper. The coordinator/Role 6 pair review must confirm the successor SQL creates the approved capacity function with the exact signature/18-column shape before any target application.
2. **Live target mismatch:** the supplied coordinator evidence reports neither live Test nor Main currently has the capacity functions or `study_groups.max_members`. This review did not access either target. The capacity migration is therefore a future Role 6/Test-preflight gate, not a client repair.
3. **Role 6 prerequisite/security review:** helper origin, function ownership, effective grants, private-schema dependencies and other documented SQL gates remain separate; no Jeffery code change can resolve them.
4. **Independent QA:** exact-head signed-in/multi-account and concurrency QA remains separately gated and was not performed here.
5. **Pending product wording:** exact second proactive notice/browser-refresh mapping remains pending; do not implement or propagate it into recruitment UI from this report.

## Final status

The finite read-only review is complete at exact head `344c1058e78fd2cccfde89574e226f3e65a1457c`. No repository changes were made. The attached report is ready for the coordinator's exact-head reconciliation and paired Role 6/Eunice review.

## Adam's next action(s):

1. **Coordinator reconciliation:** record this review against exact client head `344c1058e78fd2cccfde89574e226f3e65a1457c` and pair it with the exact successor SQL head before any Test preflight. Expected result: one joint evidence record showing the capacity RPC signature/18 columns and the client call/mapper agree; work unblocked: future Test-only preflight request.
2. **Role 6 gate:** obtain the required exact-head SQL/client review and resolve the documented live-baseline/helper/ownership/grant dependencies. Expected result: an explicit Role 6 disposition; work unblocked: separately authorized Test migration path.
3. **Independent QA gate:** after approved client/schema heads and Test authorization/preflight, arrange Eunice's signed-in multi-account/concurrency QA. Expected result: live evidence for Auth/RLS/concurrency; work unblocked: later rollout consideration.
4. **Product wording decision:** confirm the exact second proactive message/browser-refresh mapping before any owner implements it. Expected result: a dated decision entry; work unblocked: future stale-client messaging work. Do not use this review as approval for new wording.

No action is requested from Jeffery unless a new exact implementation assignment is issued.
