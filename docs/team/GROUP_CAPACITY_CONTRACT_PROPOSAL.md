# CityLink group hard-maximum contract proposal

**Status:** Proposal only — do not execute SQL, apply a migration, change Test or Main, or merge this document as an implementation approval.

**Date:** 2026-11-19

**Product approver:** Adam, CityLink project lead and project owner.

**Prepared by:** CityLink integration lead task.

**Scope:** Roy’s group creation, invitation, join-request, membership, and group-management workflows; Jeffery’s recruitment-post and People-card read contract; Database Security review; Eunice’s QA plan. This proposal does not change Kayk’s AI/file-upload scope.

## 1. Why this proposal exists

Adam approved a new product rule on 2026-11-19: a group has a hard maximum set by its current leader, from 2 through 19 active members. This replaces the earlier “no maximum size” decision. The decision is recorded in [`docs/team/DECISIONS.md`](./DECISIONS.md).

The checked-in source currently has no group-maximum column. The checked-in admission functions also do not check capacity. A client-side limit would be unsafe because a browser can send a different count or two people can act at the same time. The server must own the count and the decision.

This proposal explains the smallest safe data/API contract. It is deliberately separate from the executable migration. Database Security must review the exact SQL and Adam must authorize the Test application separately.

## 2. Current evidence and boundaries

The integration task inspected the checked-in migrations and client code read-only. The Adam-repair task separately reported that the live Test catalog has no maximum column and that current group-summary/recruitment RPCs expose counts without a maximum. This proposal does not claim that every live Test row was inspected.

Relevant current functions are:

| Area                          | Current function                                                        | Current gap                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Create group and first invite | `public.create_group_and_invite(uuid, uuid, text)`                      | No maximum parameter or capacity check; a forming group may have a creator but no membership row. |
| Invite                        | `public.send_group_invitation(uuid, uuid)`                              | No capacity check before inserting a new invitation.                                              |
| Accept invite                 | `public.respond_to_group_invitation(uuid, boolean)`                     | Inserts membership without checking a maximum.                                                    |
| Request to join               | `public.request_to_join_group(uuid)`                                    | No capacity check before inserting a new request.                                                 |
| Direct request UI             | `/my-groups` “Request to join” control                                  | Calls the request RPC directly; the RPC has no recruitment-post check.                            |
| Approve/reject request        | `public.review_group_join_request(uuid, boolean)`                       | Approval inserts membership without checking a maximum.                                           |
| Rename group                  | `public.rename_study_group(uuid, text)`                                 | Separate naming concern; no capacity behavior.                                                    |
| Course-detail summaries       | `public.list_course_group_summaries(uuid)`                              | Returns `group_size`, but no configured maximum.                                                  |
| Browseable groups             | `public.list_current_term_course_groups(uuid, text, uuid, integer)`     | Returns `active_member_count`, but no configured maximum.                                         |
| Recruitment posts             | `public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer)` | Returns `active_member_count` and `apply_enabled`, but no configured maximum or full-group state. |

The current client mappers reject unexpected response keys. Adding a server field therefore requires coordinated client type, mapper, and UI changes; it is not safe to add the field to the server and assume older clients will display it.

## 3. Approved product behavior

The following behavior is approved and is not open for reinterpretation:

1. The current leader sets and may edit the maximum. The valid maximum is an integer from 2 through 19 inclusive.
2. 19 is an upper bound, not a default. The system must not silently choose 19, 2, or any other number.
3. A group without a maximum cannot add anyone. Its leader must set one first.
4. A group above 19 active members cannot choose a valid maximum or add members until its active size falls to 19 or fewer. No member is removed automatically.
5. Lowering the maximum below the current active membership count is rejected. Lowering it to exactly the current count is allowed and makes the group full.
6. When the active count equals the maximum, the group is full. New invitations and new join applications are blocked.
7. Existing pending invitations and requests are not cancelled, expired, or converted when the group becomes full. They remain pending.
8. Accepting an invitation or approving a request when the group is full must fail with the user-facing message **“Group is full”** and leave the pending row unchanged.
9. A place is not reserved by a pending invitation or request. Two pending people may compete for the last place; the server decides one winner and the other receives “Group is full.”
10. Grouped people cards must show the current count and the configured maximum. A card must not imply a maximum when none is configured.

## 4. Proposed data model

Add one nullable column to `public.study_groups`:

```sql
alter table public.study_groups
  add column max_members integer;

alter table public.study_groups
  add constraint study_groups_max_members_chk
  check (max_members is null or max_members between 2 and 19);
```

`NULL` means “not configured.” It is required for legacy rows and for any group created before this feature. It is not a default and it does not mean unlimited. The admission functions must reject additions when `max_members is null`.

The column is intentionally nullable rather than `not null`: existing groups may be above 19 and cannot be given a valid maximum until their active size drops. A `not null` constraint would either fail the migration or force an unsafe backfill. Do not backfill a number and do not add a default.

The existing `study_groups` SELECT policy may expose the new column to accounts already allowed to read the group. Do not add direct INSERT/UPDATE/DELETE grants. The leader changes the maximum only through a reviewed RPC. No new table is needed for this version.

### Count helper

The server needs one definition of “current active size.” It must count active `group_memberships` and include a forming-group creator who has not yet received a membership row. The helper must run after the caller has locked the group row.

Proposed private helper, to be reviewed by Database Security:

```sql
create or replace function private.group_active_member_count(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (
      select count(*)::integer
      from public.group_memberships as m
      where m.group_id = p_group_id
        and m.membership_status = 'active'
    )
    +
    case
      when exists (
        select 1
        from public.study_groups as g
        where g.id = p_group_id
          and g.status = 'forming'
          and g.creator_id is not null
          and not exists (
            select 1
            from public.group_memberships as m
            where m.group_id = p_group_id
              and m.profile_id = g.creator_id
              and m.membership_status = 'active'
          )
      ) then 1
      else 0
    end;
$function$;
```

The helper must be `security definer` with an empty search path, and execute must be revoked from `public`, `anon`, and `authenticated`; only trusted RPCs and triggers may call it. Database Security should verify the empty search path and function ownership before applying anything.

A second private helper may centralize the rejection:

```text
private.assert_group_has_capacity(p_group_id)
  read max_members and status after the caller locks the group row
  if max_members is null: raise 'Group maximum is not set'
  if group_active_member_count(p_group_id) >= max_members: raise 'Group is full'
```

Adam confirmed the proposed unconfigured wording **“Group maximum is not set”** on 2026-11-19. “Group is full” remains mandatory for a full group. The helper must not change a pending row; raising an exception rolls back the caller’s transaction.

## 5. Proposed write RPC contract

### 5.1 Set or edit the maximum

Proposed public RPC:

```text
public.set_group_max_members(p_group_id uuid, p_max_members integer)
returns integer
```

The function must perform these checks in this order:

1. Require an authenticated actor.
2. Reject a null or non-integer maximum.
3. Reject a value outside 2 through 19.
4. Select the group row `FOR UPDATE`; reject a missing group.
5. Reject a group whose status is not `forming` or `active`, or whose term is not current.
6. Require the actor to be the current `study_groups.creator_id`. A forming-group creator may not yet have a membership row, so the existing “active member” helper alone is not sufficient; the leader check must explicitly allow the forming creator.
7. Compute the active count with `group_active_member_count` after the group lock.
8. If the count is greater than 19, reject with a clear “group has more than 19 active members; remove members before setting a maximum” message. The leader must use the separate leader-only removal operation; no valid maximum can be stored while the count is above 19.
9. If the requested maximum is below the active count, reject with “maximum cannot be lower than current membership.” The leader must remove members first; do not remove anyone as a side effect.
10. Update `max_members` and `updated_at`; return the stored integer.

The function must not remove members, change membership statuses, expire pending actions, or change the group status. The leader-only removal path is specified separately in section 5.9.

### 5.2 Create group and first invitation

Adam selected option 1A on 2026-11-19: the maximum is entered at the same time as the group name. Replace the current three-argument function with:

```text
public.create_group_and_invite(
  p_course_id uuid,
  p_recipient_id uuid,
  p_name text,
  p_max_members integer
)
returns table(group_id uuid, invitation_id uuid)
```

The new group is created with the supplied maximum. The function validates 2–19 before inserting. If an existing forming group for the same leader/course/term is reused, the function must not allow an unconfigured group to bypass capacity: if the stored maximum is null, it must reject and direct the leader to `set_group_max_members`; if the stored maximum differs from the supplied value, it must reject rather than silently overwrite it. The leader may change the stored value only through the reviewed maximum-edit RPC. The client must be updated in the same release because the old signature would otherwise fail.

The checked-in old function is `public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text)`, which is the **three-argument** signature `(uuid, uuid, text)`. The migration must dependency-check and explicitly drop that exact signature after confirming its dependencies, so it cannot remain callable as a capacity bypass. Do not rely on dropping `(uuid, uuid)` alone. If a two-argument overload exists on the actual base catalog, drop it as well; otherwise record that it was absent.

Option B—starting a new group with no maximum and blocking acceptance later—is **not approved**. Do not implement both overloads, because ambiguous overloads make it unclear which behavior the client is calling.

### 5.3 Send invitation

`public.send_group_invitation(uuid, uuid)` keeps its signature. The existing invitation authority remains unchanged: any active member may invite to a forming or active group, and a forming-group creator may send the first invitation even before holding a membership row. Do not restrict invitations to the leader. After locking the group row and confirming that the actor is allowed to invite, it must:

1. Return an existing pending invitation to the same recipient unchanged, if one exists. This preserves idempotency and does not create a new place.
2. Otherwise preserve the existing first-pending-action check: if the recipient already has a pending join request for the same group, reject with the existing conflict message before capacity or eligibility checks that could mask it. Do not insert an invitation.
3. After that conflict check, call the capacity helper before inserting a new invitation. If the maximum is unset, reject. If the capacity count is at the maximum, raise “Group is full.”
4. Do not count pending invitations as members. A pending invitation does not reserve a place.
5. Do not cancel or expire any other pending invitation when the group becomes full.

### 5.4 Request to join

`public.request_to_join_group(uuid)` keeps its signature. After locking the group row and checking that the group is active and current-term, it must:

1. Return an existing pending request from the same requester unchanged, if one exists.
2. Otherwise call the capacity helper before inserting a new request. If the maximum is unset, reject. If the active count is at the maximum, raise “Group is full.”
3. Do not count pending requests as members. A pending request does not reserve a place.
4. Preserve the existing eligibility, first-pending-action, and leader-review rules.

### 5.5 Accept invitation

`public.respond_to_group_invitation(uuid, boolean)` keeps its signature. On `p_accept = true`, after locking the group and invitation and validating the recipient and current eligibility, it must call the capacity helper before inserting any membership.

For a forming group, `capacity_count` already includes the creator as one member even when the creator has no membership row yet. The capacity check must use one count basis consistently, not double-count the creator. Acceptance inserts the missing creator membership plus the recipient membership; the recipient adds exactly one place. Therefore the formula is `capacity_count + 1 for the recipient` when using the canonical count. If a helper instead exposes only active membership rows, the equivalent formula is `active_membership_count + (1 if creator membership is missing else 0) + 1 for the recipient`; do not combine that increment with a `capacity_count` that already includes the creator. A maximum of 2 must allow the first acceptance. If another acceptance already filled the group, the second acceptance must raise “Group is full” and leave the invitation pending. A capacity exception must roll back any membership insert, group status update, and invitation status update.

### 5.6 Approve join request

`public.review_group_join_request(uuid, boolean)` keeps its signature. Rejection must continue to work without a capacity check. On approval, after locking the group and request and checking the current leader, current term, and requester eligibility, it must call the capacity helper before inserting the membership. If full or unset, it must raise the appropriate error and leave the request pending. It must not mark the request expired merely because the group is full.

### 5.7 Cancellation and rename

`cancel_group_invitation`, `cancel_group_join_request`, and `rename_study_group` do not need capacity checks. They must continue to preserve their existing ownership and terminal-state rules.

### 5.8 Direct join requests — approved as presentation-only

Adam selected **option A** on 2026-11-19. The server behavior does not change: `public.request_to_join_group(p_group_id uuid)` remains callable for an otherwise eligible active group and does not require a recruitment post. This is **not** a server-enforced “recruitment-post-only” rule.

**Implementation hold:** the project-level instruction still says to retain the existing direct-request control and People-page wording until the update is applied and verified, and the Adam-repair task reports that it restored the recruitment-post sentence and will not change the RPC, control, or wording. Adam authorized the release on 2026-11-19, but the project-instruction card is pending approval and saved-instruction verification. Do not change the UI, RPC, or copy until that verification is complete and Adam-repair is released for Option A only.

After the hold is released, the UI must stop implying that a direct request is available. The authenticated `/my-groups` page currently has a direct “Request to join” control; remove that control only after Adam updates the project instruction and explicitly releases Adam-repair. The People/coursemate copy must then be neutral and must not claim that the server enforces recruitment-post-only requests. Visible self-initiated applications should be offered from open recruitment posts. The existing eligibility, leader review, first-pending-action, and capacity rules still apply to the RPC.

No RPC, RLS, permission, or database migration is required for this presentation-only decision. Adam-repair owns the UI change. If the team later wants server enforcement, that is a separate product/API decision and must not be inferred from this one.

### 5.9 Leader-only manual member removal

Adam requires the leader to remove members manually when a requested maximum is below the current active count, or when a group above 19 must shrink. The server must never remove members automatically.

The exact RPC is still subject to Roy and Database Security review. A proposed shape is:

```text
public.remove_group_member(p_group_id uuid, p_profile_id uuid)
returns text
```

#### Canonical lock order for removal

Role 6 identified a real deadlock risk: the earlier draft locked the group row before the target membership, while the existing Stage 6 chat/post paths lock the actor’s membership row before the group. A leader removing a member while that member sends a chat message or creates a post could then deadlock. Do not implement the earlier group-first removal order.

The proposed removal order is:

1. Look up the group, course, and term without taking a row lock; reject a missing group.
2. Lock the current term and acquire `private.lock_course_profiles(course_id, term_id, actor_id, target_id)` in the existing deterministic order.
3. Lock the target’s active `group_memberships` row `FOR UPDATE`.
4. Lock the `study_groups` row `FOR UPDATE`.
5. Recheck the group status, current term, actor authority, target membership, and target eligibility.
6. Update the membership and run the existing membership-end triggers.

This order is compatible with the existing paths:

- Stage 5 invitation/request/acceptance paths acquire the course/profile guards before the group lock, so a removal targeting the same profile waits at the profile guard instead of forming a group/membership cycle.
- Stage 6 chat/post paths lock the actor’s membership row and then the group; removal locks the target membership before the group. The two paths serialize on that membership row and neither holds the group while waiting for the other’s membership.
- Admission for a different target does not conflict with the target membership; the group lock remains the capacity serialization point.

Database Security must verify the membership-end trigger and every path that locks more than one membership row. If any such path needs multiple membership locks, it must use a deterministic order and the same profile/membership/group protocol; if that requires changing an existing Stage 6 function, the change belongs in the same reviewed migration. Do not mix a group-first removal with membership-first chat/post paths.

#### Function checks and effects

The reviewed function must:

1. Require an authenticated actor.
2. Reject a group that is not `forming` or `active`, or whose term is not current.
3. Require the actor to be the current `study_groups.creator_id` and an active member (or the forming creator where the existing model permits that state).
4. Require the target to be an active member of the same group and current term.
5. **Approved v1 behavior (Adam, 2026-11-19):** reject `p_profile_id = study_groups.creator_id` through this operation. Do not silently transfer leadership by removing the leader. There is no leave/abandon RPC on `main`; self-removal and leader succession remain out of scope for this RPC.
6. **Approved v1 behavior (Adam, 2026-11-19):** reject a removal that would leave the group with zero active members. Do not make removal silently abandon the group and do not invent a leave/abandon path.
7. Mark the target membership with the existing approved removed-state semantics (likely `membership_status = 'removed'` with the existing ended timestamp), not by deleting history. Database Security must verify the live enum and retention behavior before writing the SQL.
8. Preserve the removed member’s existing read-only chat/history rights under the approved Stage 6 rule; do not delete messages or memberships.
9. Leave pending join requests and ordinary pending invitations pending. Removal opens a place; it does not auto-accept or auto-approve anyone. For a pending invitation sent by the removed member, apply the approved cancellation rule below.
10. Run the existing membership-end triggers so approved behavior such as a recruitment post auto-closing when its author leaves or is removed still applies. Do not bypass those triggers or delete the membership history.
11. Return an authoritative status or result that the UI can display.

**Approved re-invite rule (Adam, 2026-11-19):** a removed member may be invited again through the existing invitation eligibility and first-pending-action rules, after the removal commits and only if no active membership blocks the invitation. The proposal does not add an automatic re-invite. Database Security must verify the uniqueness/history constraints before relying on it.

**Approved pending-invitation rule (Adam, 2026-11-19):** when a member is removed, cancel or expire that member’s still-pending invitations sent to other students. Use the existing `cancelled` status and `cancelled_at` timestamp for the normal removal path; use the existing expiry semantics only where the group itself becomes abandoned. The recipient must not be left with a pending invitation that cannot be accepted because the sender is no longer active. Pending join requests remain unchanged. Database Security must verify any pending request whose requester or reviewer relationship is affected by removal.

A leader who wants a maximum below the current count must remove members until the count is at or below the requested value, then save the maximum. A group above 19 must be reduced to 19 or fewer before a maximum can be stored. The UI must not offer a “remove automatically” or bulk-delete shortcut.

## 6. Proposed read contract

The server must return the maximum only where the client needs to explain capacity. All read RPCs remain authenticated-only, current-term/course-eligibility checked, and field-limited.

| Read path                                                                  | Add                                                                                                                             | UI use                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `list_course_group_summaries(uuid)`                                        | `max_members integer`, `capacity_count integer`, `capacity_state text` alongside existing `group_size`                          | Grouped People cards show current/max and an explicit capacity state. |
| `list_current_term_course_groups(...)`                                     | `max_members integer`, `capacity_count integer`, `capacity_state text` alongside existing `active_member_count`                 | Browseable group cards show capacity.                                 |
| `list_group_recruitment_posts(...)`                                        | `max_members integer`, `capacity_count integer`, `capacity_state text`, `apply_block_reason text`; keep `apply_enabled boolean` | Recruitment cards explain exactly why Apply is unavailable.           |
| Existing My Group snapshot (`StudyGroupRow` / `loadGroupWorkflowSnapshot`) | `max_members integer`; derive `capacity_count` and `capacity_state` from the existing memberships plus a forming creator        | My Group settings show current/max and leader editing.                |

`capacity_count` is the single canonical count used for every capacity comparison: active memberships plus a forming creator who does not yet have an active membership row. Existing `group_size` and `active_member_count` must be reconciled with this definition; do not compare `max_members` to a different count on different screens. If keeping the existing fields is necessary for compatibility, document that `group_size`/`active_member_count` must equal `capacity_count` for capacity-bearing groups.

The My Group path currently has no maximum field. The preferred contract is to add `max_members` to the existing `StudyGroupRow` shape and the existing `loadGroupWorkflowSnapshot` select, then derive `capacity_count` and `capacity_state` from the memberships already returned. Do not broaden table grants or expose raw membership rows. If that snapshot cannot be extended without weakening RLS, use a dedicated field-limited My Group capacity RPC instead; do not leave the settings screen without a data source.

The `GroupMembersPage` member-list view is not a capacity surface in this contract. If the team wants current/max there, a separate field-limited RPC/field is required. The capacity surfaces in this proposal are People cards, browseable group cards, recruitment cards, and My Group settings.

`capacity_state` must be one of `available`, `full`, `maximum_not_set`, or `over_limit`. A group above 19 with `max_members = NULL` must return `over_limit`, not the generic `maximum_not_set`; the UI must explain that the group is over the upper bound and must shrink before adding anyone. This resolves the missing over-19 People-card state.

`apply_block_reason` must be null when Apply is enabled and one of the following when disabled: `group_full`, `maximum_not_set`, `group_over_limit`, `post_closed`, `group_inactive`, `already_member`, `pending_invitation`, `pending_request`, `profile_unavailable`, or `not_eligible`. The client must show the capacity-specific wording only for `group_full`, `maximum_not_set`, and `group_over_limit`; other reasons may use their existing neutral messages. This is a field-limited reason, not raw membership data.

When multiple reasons are true, the server must return one deterministic reason in this order: `group_inactive` for an archived/abandoned group, then `post_closed`, then the capacity reason (`group_over_limit`, `maximum_not_set`, or `group_full`), then the remaining eligibility reasons (`already_member`, `pending_invitation`, `pending_request`, `profile_unavailable`, `not_eligible`). A closed post in a full group therefore reports `post_closed`, not `group_full`; a group above 19 reports `group_over_limit`, not `maximum_not_set`.

For archived/abandoned recruitment posts, `max_members`, `capacity_count`, and `capacity_state` must be `NULL` together with the existing redacted group fields (`group_id`, `group_name`, `active_member_count`); `apply_enabled` is false and the reason is `group_inactive`. Do not expose capacity details for a group that is no longer browseable.

Adding these columns changes the `RETURNS TABLE` shape. PostgreSQL will not allow `CREATE OR REPLACE FUNCTION` to change an existing return type. The migration must dependency-check and explicitly drop/recreate each affected function, then restore its grants; the client mappers must explicitly allow every new key. Current mappers reject unknown keys, so a server-only change would make the page show a data error.

Client mapper and UI work must cover: `client/src/lib/supabaseGroups.ts` for `CourseGroupSummary`, `StudyGroupRow`, and `loadGroupWorkflowSnapshot`; `client/src/lib/supabaseStage6.ts` for browseable `CourseGroupSummary` and `GroupRecruitmentPost`; `AuthenticatedCoursePeers.tsx` for People-card current/max/state; `GroupWorkspacePage.tsx` for browseable/recruitment cards and Apply reason presentation; `AuthenticatedMyGroup.tsx` for My Group capacity; and `getGroupWorkflowErrorMessage` for the exact messages. The client must enforce `apply_block_reason = NULL` when Apply is enabled and preserve archived/abandoned null redaction.

`apply_enabled` should remain true only when the existing eligibility rules pass **and** the group has a configured maximum **and** `capacity_count` is below it. A closed post remains closed. A full group must show “Group is full” rather than a generic unavailable message. A post whose group has no maximum should show “Group maximum is not set” and must not silently imply unlimited capacity.

## 7. Concurrency and transaction contract

All capacity-mutating paths must follow one documented order; do not count first and lock later, and do not use the earlier group-first removal order. The proposed protocol is:

- **Invitation/request/acceptance/approval:** lock the course/profile guards required by the existing functions, then the group row `FOR UPDATE`, then read the capacity count, then insert or update.
- **Member removal:** lock the course/profile guards, then the target membership row, then the group row, then recheck and update. See section 5.9.
- **Maximum edit:** lock the course/profile guards, then the group row, then read the count and update.
- **Existing chat/post:** retain the actor membership-row lock followed by the group row. Do not change this to group-first without a reviewed migration.

The profile guard is what serializes removal against an admission for the same target; the membership lock serializes removal against that member’s chat/post; the group lock serializes the capacity count and writes. Database Security must verify that no function takes these locks in the reverse order.

The group row lock is the serialization point for:

- sending a new invitation;
- creating a new join request;
- accepting an invitation;
- approving a join request;
- removing an active member;
- setting or editing the maximum.

If two transactions compete for the last place, one obtains the group lock and inserts; the second waits, re-reads the count after the first commits, and raises “Group is full.” The second transaction must roll back completely, so its pending row and any status update remain unchanged. The server must never create two memberships for one last place.

A removal and an admission action must also serialize on the group row. If a leader removes a member while another student accepts an invitation, one transaction commits first; the other re-reads the active count and proceeds or receives the appropriate full/eligibility result. A removal must not partially update the membership or expire a pending action.

The existing Stage 6 chat/post migration uses a membership-row-first/group-row-second lock order in its own paths. The removal path above is deliberately membership-first after the profile guard, not group-first, so it cannot form the deadlock Role 6 identified. Database Security must still review the membership-end trigger and all multi-membership paths against this protocol. The capacity helper itself must not acquire a new lock order; it assumes the caller already holds the required group lock.

## 8. User experience proposal

These are proposed UI behaviors for review, not an implementation approval:

| Surface                       | Proposed behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create group                  | Show a required numeric maximum field at the same time as the group name, with `min=2` and `max=19`. Explain that 19 is an upper bound, not a default. Do not submit until a number is chosen.                                                                                                                                                                                                                                                                                                                                                            |
| My Group settings             | Show `capacity_count / maximum`. The leader sees an editable number and Save. A member sees the value read-only. If unset, show “Group maximum is not set” and prompt the leader. If over 19 or the requested maximum is below the count, the leader must remove members manually; show the explicit over-limit/full state rather than a generic “maximum not set.”                                                                                                                                                                                       |
| Member removal                | The leader sees a clearly labelled remove-member action for other active members. It must be confirmation-protected and must never remove members automatically. Self-removal/current-leader removal and last-active-member removal are rejected for v1; leader departure remains out of scope.                                                                                                                                                                                                                                                           |
| Invite panel                  | If unset or full, disable the submit button and explain why. The server remains authoritative; a stale screen must still receive the server error.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Join request review           | Keep pending requests visible when full. Approve shows “Group is full”; reject still works.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| My Groups direct request      | **Release authorized but still gated:** Adam authorized release on 2026-11-19, but the project-instruction card is pending approval and saved-instruction verification. Until that is complete, do not remove the direct control or change its copy/RPC. After verification, release Adam-repair for Option A only: remove the direct “Request to join” control; the server RPC remains callable, but visible self-initiated applications should come from open recruitment posts. Use neutral copy; do not claim the server enforces post-only requests. |
| People cards                  | Show `3 / 5 members` (or equivalent clear wording) using `capacity_count`. Show “Group is full” for `full`; show “Group maximum is not set” for `maximum_not_set`; show the explicit over-limit message for `over_limit`. Never show a fake maximum.                                                                                                                                                                                                                                                                                                      |
| Browseable groups/recruitment | Show current/max and the explicit capacity state. Disable Apply when `apply_enabled` is false and show the `apply_block_reason` mapping. Do not hide the post merely because it is full.                                                                                                                                                                                                                                                                                                                                                                  |
| Errors                        | Add exact mappings for “Group is full,” “Group maximum is not set,” and the proposed over-limit/lower-maximum messages to `getGroupWorkflowErrorMessage`. Do not turn a capacity error into a generic “try again” message.                                                                                                                                                                                                                                                                                                                                |

### Copy cleanup list for Adam-repair

The current `main` still contains contradictory no-limit or server-enforced copy. The non-direct-request locations below should be updated with the capacity UI change; the direct-request locations are deferred under the hold. This is a UI/copy task, not a database migration:

- `client/src/pages/citylink/GroupWorkflows.tsx:766` — “No maximum group size.”
- `client/src/pages/citylink/AuthenticatedMyGroup.tsx:408` — “Groups have no maximum size.”
- `client/src/pages/citylink/AuthenticatedCoursePeers.tsx:664-669` — **partially deferred:** remove the obsolete “Groups have no maximum size” clause with the capacity UI, but leave the “Join requests are available only from recruitment posts” clause unchanged until the project-instruction card is approved and verified and Adam-repair is released for Option A only. After release, replace it with neutral wording, for example: “Join requests are reviewed by the group leader. Apply from an open recruitment post when one is available.”
- `client/src/pages/citylink/GroupWorkflows.tsx:716-811` — **deferred until the project-instruction card is approved and verified:** do not remove the direct “Request to join” control or its `requestToJoinGroup` call until Adam-repair is released for Option A only. After release, remove it and do not leave a dead “Groups you can request to join” section; either remove it or make it read-only discovery linking to the group’s recruitment-post surface.
- `client/src/pages/citylink/AuthenticatedMyGroup.tsx:608` — **deferred until the project-instruction card is approved and verified:** do not remove copy telling students they can request to join an existing group directly until Adam-repair is released for Option A only.
- `docs/stage6/PEOPLE_PAGE_TEST_MIGRATION.md` — correct the “recruitment-post-only join rule” wording to presentation-only; do not describe the RPC as server-enforced. This is a documentation clarification and does not authorize a UI change while the hold remains.

The existing `AuthenticatedMyGroup.tsx` group-name input currently says 120 characters while the database naming migration enforces 50; that stale copy is a separate cleanup and must not be mixed into the capacity migration without review.

## 9. Proposed migration and verification plan

Suggested file name for review: `supabase/migrations/20261119090000_group_hard_max.sql`. Database Security must confirm the actual version number and ordering after the current latest migration. The migration is forward-only and applies to Test only after separate authorization.

The migration should:

1. Preflight-check that `study_groups.max_members` does not already exist. Stop rather than overwrite an existing column.
2. Report, without modifying, any groups whose active count is above 19. These groups will be allowed to remain, but cannot set a valid maximum or add members until their size drops.
3. Add the nullable column and check constraint. Validate the constraint after confirming no invalid non-null values exist (the new column should have none).
4. Add the private count helper and capacity helper with least-privilege grants.
5. Dependency-check and drop the exact old `public.create_group_and_invite(uuid, uuid, text)` signature; recreate the approved four-argument function. Do not rely on dropping `(uuid, uuid)`. If a two-argument overload is present in the actual catalog, drop it too; otherwise record that it was absent.
6. Replace the admission functions and `set_group_max_members` with reviewed definitions, including the forming-group `capacity_count + 1 for recipient` check and the canonical lock order.
7. Add the leader-only `remove_group_member` function using the profile-guard → target-membership → group lock order, existing removed-membership semantics, membership-end triggers, history, and pending actions.
8. Dependency-check and explicitly drop/recreate each read function whose `RETURNS TABLE` shape changes (`list_course_group_summaries`, `list_current_term_course_groups`, `list_group_recruitment_posts`) before restoring grants; preserve eligibility, ordering, pagination, field limits, and archived-group redaction.
9. Revoke browser execute on private helpers; keep public RPC execute limited to authenticated accounts; do not add direct table writes.
10. Run a static parse and a catalog verification query for columns, constraints, function signatures, grants, RLS policies, and the absence of the old creation signature.

Suggested verification cases after the Test migration is separately authorized:

| Case                                                                | Expected result                                                                                                                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New group with max 2 at creation                                    | Creator counts as one; first invitation can be sent; first acceptance makes two.                                                                                                                               |
| New group with max 19 at creation                                   | Creator counts as one; the 19th active member may join; the next addition is blocked.                                                                                                                          |
| Max 2, group already has two active members                         | New invite, new join request, and another acceptance/approval all fail with “Group is full.”                                                                                                                   |
| Max 5, active count 3                                               | Invite/request allowed; accept/approve allowed until count 5; then blocked.                                                                                                                                    |
| Max 5, pending invite exists                                        | Pending invite remains pending when a different action fills the group; accepting it fails and remains pending.                                                                                                |
| Leader lowers max to current count                                  | Allowed; group becomes full; pending actions remain pending.                                                                                                                                                   |
| Leader lowers max below current count                               | Rejected until the leader removes members manually; no automatic removal; max unchanged until the count is low enough.                                                                                         |
| Leader sets max 1, 0, 20, or null                                   | Rejected with a clear validation error.                                                                                                                                                                        |
| Non-leader calls set-max                                            | Rejected; no change.                                                                                                                                                                                           |
| Group with max null                                                 | New invite/request/accept/approve blocked with “Group maximum is not set”; leader can set a valid max.                                                                                                         |
| Group with 20 active members                                        | Cannot add or set a valid max until the leader manually removes at least one member; no automatic removal.                                                                                                     |
| Leader removes another active member                                | Member becomes removed under the existing approved semantics; history remains; capacity count drops. Pending join requests stay pending; pending invitations sent by the removed member are cancelled/expired. |
| Non-leader attempts removal, or leader targets an ineligible member | Rejected; no membership or pending row changes.                                                                                                                                                                |
| Leader attempts self-removal                                        | Rejected for v1; leader succession/leave remains out of scope; no membership or leadership change.                                                                                                             |
| Removal would leave zero active members                             | Rejected for v1; no leave/abandon RPC exists; no silent abandonment.                                                                                                                                           |
| Removed member is invited again                                     | Allowed under existing invitation eligibility and first-pending-action rules; no automatic re-invite; uniqueness/history verified.                                                                             |
| Removed member was sender of a pending invitation                   | Pending invitation is cancelled/expired using existing terminal semantics; recipient can no longer attempt acceptance; no stuck pending row.                                                                   |
| Reused forming group has null or different maximum                  | Rejected; cannot create an invitation through the old/unconfigured path; no silent overwrite.                                                                                                                  |
| Recipient already has a pending join request                        | New invitation is rejected with the existing first-pending-action conflict message; no invitation is inserted; capacity message does not mask the conflict.                                                    |
| Forming group acceptance with max 2                                 | Missing creator membership plus recipient membership is counted as a net two; first acceptance is allowed; later additions blocked.                                                                            |
| Removal concurrent with member chat/post                            | Both complete or one receives a safe eligibility error; no deadlock; no orphan membership or message/post.                                                                                                     |
| Removal concurrent with same-target invitation acceptance/approval  | Profile guard serializes; one wins; no deadlock; pending action remains correct.                                                                                                                               |
| Archived/abandoned recruitment post                                 | `max_members`, `capacity_count`, and `capacity_state` are NULL with the other redacted group fields; Apply disabled.                                                                                           |
| Recruitment Apply with each block reason                            | `apply_enabled` is false and `apply_block_reason` matches the exact condition; capacity wording appears only for capacity reasons.                                                                             |
| Apply reason precedence                                             | Archived → `group_inactive`; closed post → `post_closed`; over-limit/unset/full → capacity reason; then eligibility reasons.                                                                                   |
| My Group settings data source                                       | `StudyGroupRow`/snapshot supplies `max_members`; `capacity_count` equals the canonical count; no raw membership rows exposed.                                                                                  |
| Capacity count consistency                                          | `capacity_count` equals `group_size`/the canonical active-plus-forming-creator count on every capacity-bearing row.                                                                                            |
| Old `create_group_and_invite(uuid, uuid, text)`                     | Signature is absent; a direct call cannot bypass the maximum; a two-argument overload is absent or explicitly removed.                                                                                         |
| Two simultaneous last-seat accept/approve operations                | Exactly one succeeds; the other receives “Group is full”; count never exceeds max.                                                                                                                             |
| Recruitment list and People cards                                   | Return and display current/max; Apply disabled at full/unset; no raw membership rows exposed.                                                                                                                  |

Run the normal client checks only after client changes exist: `corepack pnpm check`, `corepack pnpm test`, and `corepack pnpm build` (or `build:static` for the separate Webdev demo). A passing result means types, automated tests, and the production build are consistent; it does not prove live multi-account concurrency or Test integration.

## 10. Ownership and coordination

| Owner                   | Responsibility in this contract                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adam                    | Product/API decisions are recorded; authorize any Test migration separately; authorize Main only under a new explicit written authorization.                                    |
| Adam-repair task        | Implement the capacity UI, including the creation-time maximum field, maximum display/edit, manual member-removal controls, neutral direct-request copy, and full/unset states. |
| Roy                     | Review the group-creation, invitation, join-request, membership-removal, and group-management RPC behavior. Coordinate backend work with Adam-repair; avoid duplicate UI edits. |
| Jeffery                 | Review the recruitment-post and People-card read fields and UI behavior. Preserve the existing RPC-only chat/recruitment boundaries.                                            |
| Database Security owner | Review the exact schema, RPC, RLS, grant, lock-order, and migration plan; provide the executable migration only after approval.                                                 |
| Eunice                  | Turn the verification cases into QA checks, including multi-account and concurrency cases; record exact results.                                                                |
| Integration lead        | Keep the decision and proposal linked; coordinate PRs; do not apply SQL or merge without Adam’s approval.                                                                       |

The integration task attempted to message the role tasks, but `manus-tasks/list_tasks` and `list_task_messages` returned `permission_denied: access is unavailable`. The handoff therefore needs to be relayed by Adam or accessed through the repository/PR until task messaging is available.

## 11. Resolved decisions and remaining implementation questions

Adam answered the product questions on 2026-11-19:

| Question                  | Adam’s answer                                                      | Contract consequence                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New-group maximum         | **1A:** enter it at the same time as the group name.               | New `create_group_and_invite` takes a required 2–19 maximum; no unconfigured new group.                                                                                                                                               |
| Unconfigured wording      | **Yes** to the proposed **“Group maximum is not set”** phrase.     | Use that exact phrase for legacy/unconfigured groups; “Group is full” remains for full groups.                                                                                                                                        |
| Terminal groups           | **No** maximum editing after a group is abandoned/archived.        | Reject the edit; do not reopen a terminal group.                                                                                                                                                                                      |
| Over-19 and lower maximum | The leader must **remove members manually**; no automatic removal. | Add a leader-only removal path; reject a maximum below the active count until the count is low enough.                                                                                                                                |
| UI ownership              | Adam is doing UI in the newly created Adam-repair task.            | Adam-repair implements the UI; existing backend/read/QA owners retain their roles.                                                                                                                                                    |
| Direct join requests      | **A — presentation-only.**                                         | Keep the server RPC; after release, remove the `/my-groups` direct control and use neutral copy; do not claim server enforcement. **Release is authorized but gated** on approval and verification of the project-instruction update. |

### Review dispositions

- **Jeffery (read/recruitment contract):** the contract now adds `capacity_count`, `capacity_state`, and `apply_block_reason`; defines archived/abandoned redaction; removes the non-executable conditional group-detail row; lists exact copy locations; and requires dependency-checked drop/recreate because the read RPC return types change. Client mappers must be updated in the same release.
- **Roy (group/API):** the contract now rejects a reused forming group with a null or different maximum, uses `capacity_count + 1 for recipient` without double-counting the forming creator, preserves invitation authority for any active member (and the forming creator), preserves the recipient’s pending-join-request conflict check, and explicitly drops the checked-in `create_group_and_invite(uuid, uuid, text)` signature. Removal rejects self/current-leader and last-active-member removal for v1; re-invite is allowed under existing rules; pending invitations sent by the removed member are cancelled/expired. Exact removal state/timestamp and uniqueness/history behavior still need Database Security verification.
- **Role 6 (lock/concurrency):** the earlier group-first removal order is withdrawn. The proposal now uses profile guard → target membership → group for removal, compatible with the existing membership-first chat/post paths and profile-guarded admission paths. Database Security must verify the membership-end trigger and any multi-membership path.
- **Read contract:** the My Group settings path now has an explicit `StudyGroupRow`/snapshot source for `max_members`; `GroupMembersPage` is explicitly not a capacity surface unless a separate RPC/field is added; and `apply_block_reason` has a deterministic precedence. Client mapper files are named in section 6.
- **QA:** “Group is full” and “Group maximum is not set” are the approved exact capacity messages. Adam also approved the over-19 and lower-maximum copy below on 2026-11-19. The verification table now includes maximum 19, count consistency, My Group data, reason precedence, removal decisions, and pending-invitation cancellation.

**Approved copy (Adam, 2026-11-19):**

- Over-19: “This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.”
- Lower maximum: “Maximum cannot be lower than the current number of active members. Remove members first.”

The direct-request review found an older handoff/project-instruction statement that still treated the question as unresolved. Adam’s later 2026-11-19 **Option A** answer is authoritative for this contract; the project-instruction replacement in section 12 records the presentation-only rule. That does not change the server RPC.

The Adam-repair task has explicitly reported that it restored the existing People-page recruitment-post sentence and will not change the direct control, RPC, or wording until Adam updates the project instruction and releases the work. This is a live implementation discrepancy: the contract records Option A, but the current UI remains unchanged. Do not tell QA or users that the direct-request UI has been removed.

**Resolved product decisions (Adam, 2026-11-19):**

1. Reject self/current-leader removal and last-active-member removal for v1; leave/abandon remains out of scope.
2. A removed member may be invited again under existing eligibility and first-pending-action rules.
3. Pending invitations sent by a removed member are cancelled/expired; they must not remain stuck pending.
4. The over-19 and lower-maximum copy above is approved.
5. Adam authorized releasing Adam-repair for Option A only after the project-instruction card is approved and the saved instructions are verified.

Roy and Database Security must still review the exact leader-only removal RPC semantics, removed-membership state/timestamp, retention of read-only history, uniqueness/history constraints, and the canonical lock order. There are no remaining product questions about removal, re-invite, pending-invitation cancellation, maximum value, terminal-group editing, or direct-request presentation. The direct-request UI change remains gated on the project-instruction update and Adam-repair release verification.

## 12. Project-instruction status

The project-level instruction update is pending approval in the Project changes card. Adam-repair reports that the old conflicting paragraphs are already absent; the proposed update adds the creation-time maximum and manual-removal rules while preserving the direct-request hold. It has not been applied or verified yet. The integration task also attempted to update the configuration through `manus-config config save`, but the host rejected that collaboration-session change with:

> Collaboration sessions are not allowed to modify configuration via `manus-config config`.

The local attempt was not applied project-wide. Adam or the project owner must approve the Project changes card and verify the saved instructions outside this collaboration session. After that, send **“Release Adam-repair for Option A only.”** Do not change the direct-request UI or copy before that verification. The exact replacement paragraph is below.

> Approved group decisions (updated 2026-11-19; this supersedes the earlier no-maximum rule): the current group leader sets a hard maximum of 2–19 active members per group; 19 is an upper bound, not a default. A new group enters the maximum at the same time as the group name. Existing groups must choose a maximum before adding anyone. A leader may lower the maximum below the current active count only after manually removing members; the system must never remove members automatically. A group currently above 19 must be reduced manually to 19 or fewer before a valid maximum can be stored or members can be added. When a group is full, block new invitations and new join applications; existing pending invitations and requests remain pending and cannot be accepted or approved until a place opens. Show “Group is full” when blocked by the maximum, and show current/maximum on grouped people cards; show “Group maximum is not set” when no maximum is configured. Direct join requests are presentation-only: the server RPC remains callable for an eligible active group, but the UI must not expose direct request controls; visible applications come from recruitment posts. The current group leader — `study_groups.creator_id`, inherited after succession using the approved tie order (`joined_at`, then `created_at`, then `id`) — reviews join requests.

## 13. Next step

Adam’s product answers are recorded, the technical review blockers are corrected, and the removal/re-invite/pending-invitation/copy decisions are approved. The next step is for Roy and Database Security to review the exact removal RPC/API, canonical lock order, My Group read path, and read-function drop/recreate plan, and produce the executable migration for separate Test authorization. Adam-repair can implement UI only after the project-instruction card is approved, the saved instructions are verified, and Adam-repair is released for Option A only. No SQL should run before the migration review and explicit authorization.
