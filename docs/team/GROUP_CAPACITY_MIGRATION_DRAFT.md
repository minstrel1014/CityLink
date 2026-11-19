# Group hard-maximum migration draft

Status: **DRAFT — not reviewed for execution and not applied.** This document accompanies the SQL draft at `supabase/migrations/20261119090000_group_hard_max.sql`.

No SQL was executed, no Test or Main database was connected to for this draft, and no migration was applied. The draft exists so Role 6 can perform the final SQL review before Adam gives separate Test authorization.

## What the draft contains

The migration is forward-only and targets the disposable Test project only after review and authorization. It contains:

- a nullable `study_groups.max_members` column constrained to 2–19;
- `private.group_active_member_count(uuid)`, which counts active memberships and includes a forming-group creator who does not yet have an active membership row;
- `private.assert_group_has_capacity(uuid, integer)`, which rejects unset, over-limit, and full groups;
- `public.set_group_max_members(uuid, integer)` for the current leader;
- a four-argument `public.create_group_and_invite(uuid, uuid, text, integer)`;
- capacity checks in invitation, request, acceptance, and approval paths;
- `public.remove_group_member(uuid, uuid)` with the approved membership-first lock order;
- `private.group_removal_context`, a transaction-keyed context table with no browser grants;
- `private.cancel_pending_invitations_from_removed_member(uuid, uuid)`;
- no change to the currently unattached `public.enforce_invitation_integrity()` guard. A complete guard/trigger change is deferred until it can authorize every existing lifecycle path, including expiry and profile-deletion cleanup, plus the removal context.
- new capacity fields and `apply_block_reason` in the three affected read RPCs.

## Deliberately outside this draft

- No invitation guard replacement or trigger attachment is included. Attaching it remains a separate decision.
- No client mapper, UI, or service change is included. The current client still calls the old three-argument `create_group_and_invite` and must be updated in the same release before this SQL is applied.
- No Main access, reset, truncation, data deletion, or Auth/secret change.
- No automatic member removal; the leader must invoke `remove_group_member`.

## Release coupling that must not be missed

The draft drops the old three-argument `create_group_and_invite(uuid, uuid, text)` signature so it cannot remain a capacity bypass. The checked-in client currently calls that three-argument signature through `client/src/lib/supabaseGroups.ts` and `client/src/pages/citylink/GroupWorkflows.tsx`.

**Do not apply this migration to Test until the client is updated to supply the maximum and call the four-argument RPC.** Otherwise group creation will fail for the deployed client. The client update is a separate feature/PR and must be reviewed with the migration.

The read RPC return shapes also change. Older clients reject unknown keys; the mapper/UI update must be released with the migration.

## Review focus for Role 6

Role 6 should specifically verify:

1. The `max_members` constraint and null/legacy behavior.
2. `group_active_member_count` and `assert_group_has_capacity` semantics, especially forming-group creator counting and the full/unset/over-limit precedence.
3. The capacity checks in `create_group_and_invite`, `send_group_invitation`, `request_to_join_group`, `respond_to_group_invitation`, and `review_group_join_request`.
4. The membership-first lock order in `remove_group_member` and interaction with existing membership-end/chat/post locks.
5. The private context table and helper ACLs. The invitation guard is intentionally unchanged; a future complete guard/trigger migration must handle expiry and profile-deletion cleanup before attachment.
6. The exact `apply_block_reason` precedence and null redaction for archived/abandoned groups.
7. The dependency-checked drop/recreate of the three read RPCs and restored grants.
8. Whether the canonical count should replace the existing `active_member_count` value on browseable and recruitment cards; this draft uses the canonical capacity count there.

### Required verification case

A forming group with only its creator and one pending invitation must not appear in course-detail People results from `list_course_group_summaries`. After a second person actually joins, the group may appear. Pending invitations never count as people. This filter was added after Role 6’s re-review at `1497e70`.

## Static checks performed

- `pglast` parsed the migration as 43 top-level SQL statements with no parse error.
- `git diff --check` passed.
- `corepack pnpm check` passed.
- `corepack pnpm test` passed: 13 files, 99 tests.
- `corepack pnpm build` passed; the existing non-blocking chunk-size warning remains.
- No database connection or SQL execution was performed.

These checks do not validate PL/pgSQL runtime semantics, live RLS behavior, function ownership, or concurrency. Role 6’s final SQL review and a separately authorized Test run remain required.

## Open questions

- Role 6’s guard finding is resolved by removing the replacement; a complete guard/trigger change remains deferred.
- Role 6 must confirm the exact context-table privileges and transaction-ID behavior.
- The client release order and mapper/UI PR must be agreed before Test application.
- Adam’s separate Test authorization is still required after the final SQL review.
