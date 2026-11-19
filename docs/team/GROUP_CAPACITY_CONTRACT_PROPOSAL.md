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

The exact unconfigured-maximum wording is an open product question. “Group is full” is mandatory for a full group. The helper must not change a pending row; raising an exception rolls back the caller’s transaction.

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
8. If the count is greater than 19, reject with a clear “group has more than 19 active members” message; no valid maximum can be set.
9. If the requested maximum is below the active count, reject with “maximum cannot be lower than current membership.”
10. Update `max_members` and `updated_at`; return the stored integer.

The function must not remove members, change membership statuses, expire pending actions, or change the group status.

### 5.2 Create group and first invitation

This is the main open API question. There are two safe shapes:

**Option A (recommended for a single-step experience):** replace the current three-argument function with:

```text
public.create_group_and_invite(
  p_course_id uuid,
  p_recipient_id uuid,
  p_name text,
  p_max_members integer
)
returns table(group_id uuid, invitation_id uuid)
```

The new group is created with the supplied maximum. The function validates 2–19 before inserting. If an existing forming group for the same leader/course/term is reused, the function must use that group’s stored maximum and must not silently replace it; if the stored maximum is null, the caller must set it through `set_group_max_members` before another invitation is created. The client must be updated in the same release because the old three-argument signature would otherwise fail.

**Option B (smaller signature change, more two-step):** keep the current three-argument function and allow a new group to start with `max_members = null`. The first invitation may be created, but acceptance is blocked until the leader sets a maximum. The UI must show “maximum not set” immediately after creation.

Adam must choose one. Do not implement both overloads without a separate API decision, because ambiguous overloads make it unclear which behavior the client is calling.

### 5.3 Send invitation

`public.send_group_invitation(uuid, uuid)` keeps its signature. After locking the group row and confirming that the actor is allowed to invite, it must:

1. Return an existing pending invitation to the same recipient unchanged, if one exists. This preserves idempotency and does not create a new place.
2. Otherwise call the capacity helper before inserting a new invitation. If the maximum is unset, reject. If the active count is at the maximum, raise “Group is full.”
3. Do not count pending invitations as members. A pending invitation does not reserve a place.
4. Do not cancel or expire any other pending invitation when the group becomes full.

### 5.4 Request to join

`public.request_to_join_group(uuid)` keeps its signature. After locking the group row and checking that the group is active and current-term, it must:

1. Return an existing pending request from the same requester unchanged, if one exists.
2. Otherwise call the capacity helper before inserting a new request. If the maximum is unset, reject. If the active count is at the maximum, raise “Group is full.”
3. Do not count pending requests as members. A pending request does not reserve a place.
4. Preserve the existing eligibility, first-pending-action, and leader-review rules.

### 5.5 Accept invitation

`public.respond_to_group_invitation(uuid, boolean)` keeps its signature. On `p_accept = true`, after locking the group and invitation and validating the recipient and current eligibility, it must call the capacity helper before inserting any membership.

For a forming group, the helper counts the creator as one member. If the invitation would bring the group to two members and the maximum is 2, it is allowed. If another acceptance already filled the group, the second acceptance must raise “Group is full” and leave the invitation pending. A capacity exception must roll back any membership insert, group status update, and invitation status update.

### 5.6 Approve join request

`public.review_group_join_request(uuid, boolean)` keeps its signature. Rejection must continue to work without a capacity check. On approval, after locking the group and request and checking the current leader, current term, and requester eligibility, it must call the capacity helper before inserting the membership. If full or unset, it must raise the appropriate error and leave the request pending. It must not mark the request expired merely because the group is full.

### 5.7 Cancellation and rename

`cancel_group_invitation`, `cancel_group_join_request`, and `rename_study_group` do not need capacity checks. They must continue to preserve their existing ownership and terminal-state rules.

### 5.8 Recruitment-post-only join requests are unresolved

This is a separate product/API authorization question, not a capacity rule. It must be resolved before implementation because the current UI and server behavior do not match.

The checked-in `public.request_to_join_group(p_group_id uuid)` accepts an eligible active group without checking for a recruitment post. The authenticated `/my-groups` page still renders a direct “Request to join” action. The People/coursemate copy says requests are available only from recruitment posts. That sentence is therefore not a server-enforced statement today.

Adam must choose one of these meanings:

| Option                        | Server behavior                                                                                                                                                                                 | UI behavior                                                                                                                   | Consequence                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A — presentation only         | Keep the current RPC; eligible direct calls remain possible.                                                                                                                                    | Remove direct request controls from `/my-groups` and People; expose Apply only from open recruitment posts; use neutral copy. | Simplest, but “only from recruitment posts” is not a security boundary.                                    |
| B — server-enforced post-only | `request_to_join_group` must reject a new request unless an open recruitment post for the same group/course/current term exists. Decide whether the request must be tied to a specific post ID. | Remove or redirect every direct request control; Apply remains the visible path.                                              | Requires reviewed API/migration and UI changes; direct API calls are blocked.                              |
| C — keep direct requests      | Keep the current RPC and direct `/my-groups` control.                                                                                                                                           | Correct the copy to say requests can be made from `/my-groups` as well as recruitment posts.                                  | Matches current behavior but conflicts with the earlier “joining only from posts” presentation preference. |

If Adam chooses B, these additional questions must be answered: whether the RPC needs a `post_id` parameter or merely any open post; whether a request may remain pending after its post closes; whether an existing pending request is returned idempotently when no post is open; and whether the leader can still approve a pending request after the post closes. Do not invent those behaviors.

This question does not override capacity. Even when a post is open, a full group or an unconfigured maximum must still block a new request and must leave an existing pending request pending.

## 6. Proposed read contract

The server must return the maximum only where the client needs to explain capacity. All read RPCs remain authenticated-only, current-term/course-eligibility checked, and field-limited.

| Read path                                      | Add                                                                             | UI use                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `list_course_group_summaries(uuid)`            | `max_members integer` (nullable) alongside existing `group_size`                | Grouped People cards show `current / max` and a full state. |
| `list_current_term_course_groups(...)`         | `max_members integer` (nullable) alongside `active_member_count`                | Browseable group cards and group details show capacity.     |
| `list_group_recruitment_posts(...)`            | `max_members integer` (nullable); make `apply_enabled` false when full or unset | Recruitment cards explain why Apply is unavailable.         |
| Group detail/member view, if it shows capacity | `max_members integer` (nullable)                                                | Show current/max without exposing raw membership rows.      |

Client mapper changes must explicitly allow the new keys. Current mappers reject unknown keys, so a server-only change would make the page show a data error.

`apply_enabled` should remain true only when the existing eligibility rules pass **and** the group has a configured maximum **and** the active count is below it. A closed post remains closed. A full group must show “Group is full” rather than a generic unavailable message. A post whose group has no maximum should show “maximum not set” and must not silently imply unlimited capacity.

## 7. Concurrency and transaction contract

All admission paths must use the same lock order: lock the course/profile guards required by the existing functions, then lock the group row `FOR UPDATE`, then read the capacity count, then insert or update. Do not count first and lock later.

The group row lock is the serialization point for:

- sending a new invitation;
- creating a new join request;
- accepting an invitation;
- approving a join request;
- setting or editing the maximum.

If two transactions compete for the last place, one obtains the group lock and inserts; the second waits, re-reads the count after the first commits, and raises “Group is full.” The second transaction must roll back completely, so its pending row and any status update remain unchanged. The server must never create two memberships for one last place.

The existing Stage 6 chat/post migration uses a membership-row-first/group-row-second lock order in its own paths. Database Security must review any new capacity helper against those paths to avoid a deadlock. The capacity helper itself must not acquire a new lock order; it assumes the caller already holds the group lock.

## 8. User experience proposal

These are proposed UI behaviors for review, not an implementation approval:

| Surface                       | Proposed behavior                                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create group                  | Show a required numeric maximum field with `min=2` and `max=19`. Explain that 19 is an upper bound, not a default. Do not submit until a number is chosen.                                                                                                                 |
| My Group settings             | Show `current active members / maximum`. The leader sees an editable number and Save. A member sees the value read-only. If unset, show “Maximum not set” and prompt the leader. If over 19, explain that the group must become 19 or smaller before a maximum can be set. |
| Invite panel                  | If unset or full, disable the submit button and explain why. The server remains authoritative; a stale screen must still receive the server error.                                                                                                                         |
| Join request review           | Keep pending requests visible when full. Approve shows “Group is full”; reject still works.                                                                                                                                                                                |
| My Groups direct request      | If Adam chooses presentation-only or server-enforced post-only, remove the direct control and do not leave copy claiming “only from posts” while the control remains. If Adam keeps direct requests, correct the copy instead.                                             |
| People cards                  | Show `3 / 5 members` (or equivalent clear wording). Show a “Group is full” badge when `group_size >= max_members`. If unset, show `3 members · maximum not set`; never show a fake maximum.                                                                                |
| Browseable groups/recruitment | Show current/max and a full badge. Disable Apply when full or unset. Do not hide the post merely because it is full.                                                                                                                                                       |
| Errors                        | Add exact mappings for “Group is full” and the unconfigured-maximum message to `getGroupWorkflowErrorMessage`. Do not turn a capacity error into a generic “try again” message.                                                                                            |

The existing `GroupWorkflows.tsx` copy “Group size is not limited” must be removed when this feature ships. The existing `AuthenticatedMyGroup.tsx` group-name input currently says 120 characters while the database naming migration enforces 50; that stale copy is a separate cleanup and must not be mixed into the capacity migration without review.

## 9. Proposed migration and verification plan

Suggested file name for review: `supabase/migrations/20261119090000_group_hard_max.sql`. Database Security must confirm the actual version number and ordering after the current latest migration. The migration is forward-only and applies to Test only after separate authorization.

The migration should:

1. Preflight-check that `study_groups.max_members` does not already exist. Stop rather than overwrite an existing column.
2. Report, without modifying, any groups whose active count is above 19. These groups will be allowed to remain, but cannot set a valid maximum or add members until their size drops.
3. Add the nullable column and check constraint. Validate the constraint after confirming no invalid non-null values exist (the new column should have none).
4. Add the private count helper and capacity helper with least-privilege grants.
5. Replace the admission functions and `set_group_max_members` with reviewed definitions.
6. Replace the read functions that return `max_members`; preserve all existing eligibility, ordering, pagination, and field limits.
7. Revoke browser execute on private helpers; keep public RPC execute limited to authenticated accounts; do not add direct table writes.
8. Run a static parse and a catalog verification query for columns, constraints, function signatures, grants, and RLS policies.

Suggested verification cases after the Test migration is separately authorized:

| Case                                                 | Expected result                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| New group with max 2                                 | Creator counts as one; first invitation can be sent; first acceptance makes two.                                |
| Max 2, group already has two active members          | New invite, new join request, and another acceptance/approval all fail with “Group is full.”                    |
| Max 5, active count 3                                | Invite/request allowed; accept/approve allowed until count 5; then blocked.                                     |
| Max 5, pending invite exists                         | Pending invite remains pending when a different action fills the group; accepting it fails and remains pending. |
| Leader lowers max to current count                   | Allowed; group becomes full; pending actions remain pending.                                                    |
| Leader lowers max below current count                | Rejected; no member removed; max unchanged.                                                                     |
| Leader sets max 1, 0, 20, or null                    | Rejected with a clear validation error.                                                                         |
| Non-leader calls set-max                             | Rejected; no change.                                                                                            |
| Group with max null                                  | New invite/request/accept/approve blocked with “maximum not set”; leader can set a valid max.                   |
| Group with 20 active members                         | Cannot set any valid max or add; no automatic removal.                                                          |
| Two simultaneous last-seat accept/approve operations | Exactly one succeeds; the other receives “Group is full”; count never exceeds max.                              |
| Recruitment list and People cards                    | Return and display current/max; Apply disabled at full/unset; no raw membership rows exposed.                   |

Run the normal client checks only after client changes exist: `corepack pnpm check`, `corepack pnpm test`, and `corepack pnpm build` (or `build:static` for the separate Webdev demo). A passing result means types, automated tests, and the production build are consistent; it does not prove live multi-account concurrency or Test integration.

## 10. Ownership and coordination

| Owner                   | Responsibility in this contract                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adam                    | Answer the open product questions; authorize any Test migration separately; authorize Main only under a new explicit written authorization.                          |
| Roy                     | Review the group-creation, invitation, join-request, membership, and group-management RPC/UI behavior. Implement only after the contract and migration are approved. |
| Jeffery                 | Review the recruitment-post and People-card read fields and UI behavior. Preserve the existing RPC-only chat/recruitment boundaries.                                 |
| Database Security owner | Review the exact schema, RPC, RLS, grant, lock-order, and migration plan; provide the executable migration only after approval.                                      |
| Eunice                  | Turn the verification cases into QA checks, including multi-account and concurrency cases; record exact results.                                                     |
| Integration lead        | Keep the decision and proposal linked; coordinate PRs; do not apply SQL or merge without Adam’s approval.                                                            |

The integration task attempted to message the role tasks, but `manus-tasks/list_tasks` and `list_task_messages` returned `permission_denied: access is unavailable`. The handoff therefore needs to be relayed by Adam or accessed through the repository/PR until task messaging is available.

## 11. Decisions needed before implementation

Adam should answer these before Database Security turns this into an executable migration:

1. **New-group creation:** Should `create_group_and_invite` require a maximum in the same call (Option A), or may a new group start with no maximum and block acceptance until the leader sets one (Option B)? No default will be invented.
2. **Unconfigured wording:** Should the user-facing message be “Group maximum is not set” or another exact phrase? “Group is full” is mandatory only for a full group.
3. **Terminal groups:** Should the leader be able to edit the maximum after a group is abandoned or archived? The proposal recommends no.
4. **Over-19 groups:** The current product has no membership-removal workflow. How should a group above 19 reduce its active size? This is a known gap; do not remove members automatically and do not silently allow adding.
5. **Implementation split:** Confirm that Roy owns the group write/UI work, Jeffery owns the recruitment/People read/UI work, Database Security owns the migration, and Eunice owns QA. This proposal does not reassign anyone.
6. **Direct join requests:** Should the server require an open recruitment post for `request_to_join_group`, or is the requirement only presentation? If server-enforced, must the request be tied to a specific post, and what happens to pending requests when that post closes? See section 5.8.

## 12. Project-instruction status

The project-level instruction still contains the obsolete “no maximum size” sentence. The integration task attempted to update it through `manus-config config save`, but the host rejected the change with:

> Collaboration sessions are not allowed to modify configuration via `manus-config config`.

The local attempt was not applied project-wide. Adam or the project owner must apply the replacement in the project settings outside this collaboration session. The exact replacement paragraph is:

> Approved group decisions (updated 2026-11-19; this supersedes the earlier no-maximum rule): the current group leader sets and may edit a hard maximum of 2–19 active members per group; 19 is an upper bound, not a default. Existing groups must choose a maximum before adding anyone. Never lower the maximum below the current active membership count or remove members automatically. A group currently above 19 cannot choose a valid maximum or add members until its size drops to 19 or fewer. When a group is full, block new invitations and new join applications; existing pending invitations and requests remain pending and cannot be accepted or approved until a place opens. Show “Group is full” when an invite, join application, acceptance, or approval is blocked by the maximum, and show current/maximum on grouped people cards. The current group leader — `study_groups.creator_id`, inherited after succession using the approved tie order (`joined_at`, then `created_at`, then `id`) — reviews join requests.

## 13. Next step

Adam should answer the decisions in section 11. If Adam selects Option A or B and confirms the wording and ownership, the Database Security owner can produce the exact executable migration and ask for separate Test authorization. No SQL should run before that review.
