# Group hard-maximum migration draft

Status: **DRAFT — revised for Option A (Adam's 2026-11-21 decision); static preparation only; no runtime verification; not applied.** This document accompanies the SQL draft at `supabase/migrations/20261119090000_group_hard_max.sql`.

## Superseded by Adam's 2026-11-21 approval

The earlier revisions of this draft (recorded below at `252e292`, `80a829b` and
`eab4335`) described an Option B-style cutover: dropping the old
three-argument `create_group_and_invite(uuid, uuid, text)` and changing the
return shape of the three read RPCs. **Superseded by Adam's 2026-11-21 approval
of Option A.** The SQL on this branch now:

- keeps the three-argument signature as a **fail-closed upgrade stub** that
  raises the stable `group_capacity_upgrade_required` signal (SQLSTATE `45000`)
  instead of dropping it, so an old cached client receives a machine-detectable
  reason rather than a missing-function error;
- **preserves the exact legacy column sets** of
  `list_course_group_summaries`, `list_current_term_course_groups` and
  `list_group_recruitment_posts` through same-named wrappers, so older strict
  client allowlists still parse those responses;
- exposes capacity-aware reads only through the new `*_capacity` contracts;
- adds explicit `EXECUTE` normalization for the four replaced write RPCs.

The current reference is `docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md`.
Where the two disagree, that document and the SQL at this head win. Nothing here
grants application, Test-preflight or release approval.

Role 6’s exact-head review at `eab4335` confirmed the corrected `apply_block_reason` precedence and found no new static SQL blocker. This is not formal database-application approval: it does not validate runtime authorization, concurrency, or application behavior. The coordinated capacity-client release is still absent, and Adam chose to wait for it before Test application. No SQL was executed, no Test or Main database was connected to for this draft, and no migration was applied.

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
- new capacity fields (`max_members`, `capacity_count`, `capacity_state`) and `apply_block_reason` on three **new** read contracts — `list_course_group_summaries_capacity(uuid)`, `list_current_term_course_groups_capacity(uuid, text, uuid, integer)` and `list_group_recruitment_posts_capacity(uuid, timestamptz, uuid, integer)` — while the three legacy read RPC names keep their released column sets through wrappers.
- a `SECURITY INVOKER` fail-closed stub for the old three-argument create overload, and explicit `EXECUTE` normalization for `send_group_invitation`, `request_to_join_group`, `respond_to_group_invitation` and `review_group_join_request`.

## Deliberately outside this draft

- No invitation guard replacement or trigger attachment is included. Attaching it remains a separate decision.
- No client mapper, UI, or service change is included. The current client still calls the old three-argument `create_group_and_invite`, which now returns the fail-closed `group_capacity_upgrade_required` signal; capacity-aware creation still requires the coordinated client release.
- No Main access, reset, truncation, data deletion, or Auth/secret change.
- No automatic member removal; the leader must invoke `remove_group_member`.

## Release coupling that must not be missed

Under Option A the old three-argument `create_group_and_invite(uuid, uuid, text)` signature is **not** dropped. Section 3b replaces only its body with a `SECURITY INVOKER` stub that raises `group_capacity_upgrade_required` (SQLSTATE `45000`) and touches no table, no `auth.uid()` and no private helper, so it cannot create a group or bypass `max_members`. The checked-in client currently calls that three-argument signature through `client/src/lib/supabaseGroups.ts` and `client/src/pages/citylink/GroupWorkflows.tsx`, so after application old clients can still read but every old create attempt fails closed until the client is released against the four-argument RPC.

**Do not apply this migration to Test until the client is updated to supply the maximum and call the four-argument RPC.** A fail-closed create path is the intended interim state, not a release: group creation for deployed old clients is unavailable until the paired client PR is reviewed and released. Cached-client recovery (build/version marker, refresh control, no-cache shell) is a separate client-side requirement that this SQL does not provide.

The three legacy read RPC names keep their released column sets, so an older strict client can keep parsing them and the mapper/UI change is no longer forced by shape alone. Two deliberate **value** changes do reach old clients and still need owner sign-off before release: recruitment `apply_enabled` becomes capacity-aware, and browse/recruitment `active_member_count` carries the canonical capacity count. The full list, including the one-person forming-group visibility change, is in `docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md`.

## Review focus for Role 6

Role 6 should specifically verify:

1. The `max_members` constraint and null/legacy behavior.
2. `group_active_member_count` and `assert_group_has_capacity` semantics, especially forming-group creator counting and the full/unset/over-limit precedence.
3. The capacity checks in `create_group_and_invite`, `send_group_invitation`, `request_to_join_group`, `respond_to_group_invitation`, and `review_group_join_request`.
4. The membership-first lock order in `remove_group_member` and interaction with existing membership-end/chat/post locks.
5. The private context table and helper ACLs. The invitation guard is intentionally unchanged; a future complete guard/trigger migration must handle expiry and profile-deletion cleanup before attachment.
6. The exact `apply_block_reason` precedence and null redaction for archived/abandoned groups.
7. The read-contract split: three new `*_capacity` definitions plus three legacy-name wrappers that project only the released columns, with restored grants. No `DROP ... CASCADE` exists anywhere in the file; the only remaining `DROP FUNCTION` is the unused two-argument create overload.
8. Whether the canonical count should replace the existing `active_member_count` value on browseable and recruitment cards; this draft uses the canonical capacity count there.

### Required verification case

A forming group with only its creator and one pending invitation must not appear in course-detail People results from `list_course_group_summaries`. After a second person actually joins, the group may appear. Pending invitations never count as people. This filter was added after Role 6’s re-review at `1497e70`.

### Recruitment Apply positive case

Adam-repair’s static review found that `list_group_recruitment_posts` always returned a non-null `apply_block_reason`, so `apply_enabled` was always false. The `ELSE 'not_eligible'` branch is now `WHEN NOT e.apply_enabled THEN 'not_eligible' ELSE NULL`, allowing an eligible viewer of an open post with room to apply.

Role 6’s fresh review then found that the profile-availability branch was checked before membership and pending actions. The branch order is now the approved order: group inactive, post closed, capacity, `already_member`, `pending_invitation`, `pending_request`, `profile_unavailable`, `not_eligible`, then null. The verification set must cover an eligible/open/room positive case returning `apply_enabled = true` and `apply_block_reason = NULL`, plus full, unset, over-limit, closed, pending-invitation, pending-request, already-member, and profile-unavailable cases, including overlapping conditions.

### Additional review findings still open

Adam-repair’s report also flagged these items for owner review; none is changed silently here:

- `can_create_post` is calculated from active membership but the browseable query excludes the viewer’s own group; verify the pre-existing recruitment-create flag/list-filter contradiction independently.
- The `max_members` column/constraint reuse does not fail closed if an existing same-named object has a different definition; add an exact-definition preflight or document the accepted risk.
- Effective ACLs, default privileges, and direct `study_groups.max_members` visibility need live-catalog verification.
- The private removal helper relies on its public caller for some authority checks; verify all callers and the live invitation-trigger state.
- Existing pending invitation/request handling occurs before some eligibility checks; reconcile this with the contract and test concurrency and retry behavior.
- The old-client/new-schema and new-client/old-schema cutover needs an explicit compatibility and recovery plan, including cached browser sessions and PR #31’s additional creation entry point.
- Option A records that plan for the old-client/new-schema direction; the new-client/old-schema direction and cached-client recovery remain open client-side work.
- No coordinated capacity-client PR was open when this was checked; application remains blocked until that PR is reviewed and released.

## Static checks performed

- Role 6 static review at `252e292` (historical, before the Apply fix): no remaining blockers; 43 top-level statements and 13 complete PL/pgSQL functions parsed offline.
- Fresh Role 6 review at `80a829b`: positive Apply fix confirmed; one precedence mismatch found and now corrected; 43 top-level statements and 13 complete PL/pgSQL functions parsed offline.
- Role 6 exact-head review at `eab4335`: no new static SQL blockers; 43 statements and 13 function bodies parsed; runtime authorization/concurrency not tested.
- Option A revision on `feature/role6-capacity-compatibility-migration-20261121` (base `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`, no client code touched): offline `pglast` 8.9 parse gave **59 top-level statements** (base 43, delta +16) with no parse error — `17` `CreateFunctionStmt` (14 public, 3 private), `32` `GrantStmt`, `1` `DropStmt`, one `begin;`/`commit;` pair. Every created public function has a matching `revoke all on function` + `grant execute on function` pair; the three private helpers are revoked from `public, anon, authenticated` with no grant; dollar-quote tags are balanced; no `CASCADE` appears outside an explanatory comment. Each legacy wrapper’s `RETURNS TABLE` name/type list was compared against the released definitions in `20261117205600_stage5_course_detail_group_views.sql` and `20261118083000_stage6_people_page_naming.sql` and matched exactly (5, 6 and 14 columns). The fail-closed stub’s signature and return columns match the released three-argument function. Validator exit status `0`, zero reported problems.
- `git diff --check` exit status `0` (no whitespace errors) after the Option A revision.
- `corepack pnpm check` passed.
- `corepack pnpm test` passed: 13 files, 99 tests.
- `corepack pnpm build` passed; the existing non-blocking chunk-size warning remains.
- The `corepack pnpm …` results above are historical records from earlier revisions of this draft. They were **not** re-run for the Option A revision, which is SQL-and-docs only and changes no client code; the integration branch’s own current test record lives with PR #37.
- No database connection or SQL execution was performed for any check listed in this section, and the Option A revision involved no Supabase call, project listing or catalog inspection.

These checks do not validate PL/pgSQL runtime semantics, live RLS behavior, function ownership, or concurrency. Role 6’s final SQL review and a separately authorized Test run remain required.

## Fresh Test catalog evidence

Role 6’s fresh review included read-only catalog metadata from the disposable Test project `wkzclgmhrtecnpexfesr`; no application rows were read. At the `80a829b` snapshot:

- There was no `study_groups.max_members` column or `study_groups_max_members_chk` constraint, so there was no same-name object to mask the add-column path.
- Group tables had RLS enabled; `authenticated` had SELECT only and `anon` had no table privileges.
- The existing `study_groups` SELECT policy was `private.can_view_group`.
- There was no non-internal trigger on `group_invitations`; existing membership-end and terminal-group recruitment-post triggers were present.
- Relevant public RPCs were owned by `postgres`, `SECURITY DEFINER`, and executable by `authenticated` but not `anon`; the invitation guard was not `SECURITY DEFINER` and had no browser EXECUTE grant.
- The `private` schema had USAGE for `authenticated`, but the proposed helper was explicitly revoked from browser roles; `service_role` lacked private-schema USAGE.

These observations reduce uncertainty but do not replace the exact-head re-review and authorized runtime QA.

## Remaining integration issue

`list_current_term_course_groups` still computes `can_create_post` from active membership while excluding the viewer’s own active group from the browse rows. The field is therefore always false for returned rows, and the checked-in client consumes it for post-creation UI. This is pre-existing and is not silently changed in this capacity migration. Under Option A the legacy wrapper keeps the column so old allowlists still parse it, and the comment above the wrapper states explicitly that the value is structural, never authorization; real posting authority stays with `private.can_manage_recruitment_post` plus membership checks. The coordinated client/API work must still decide whether to remove the flag from the browse contract and source create capability from My Groups, or explicitly change the RPC audience.

## Open questions

- Role 6’s guard finding is resolved by removing the replacement; a complete guard/trigger change remains deferred.
- Role 6’s exact-head static review of the pre-Option-A SQL is recorded; the Option A SQL now needs a fresh exact-head review of the changed file, and no formal database-application approval has been given for either version.
- Live Test catalog ownership, RLS, grants, and transaction-ID behavior still need verification before execution. Function ownership and any non-`public`/`anon` grantees (for example `service_role`) on the replaced objects were **not** rewritten here and must be read during the authorized Test preflight.
- `private.can_browse_current_term_group` and `private.can_manage_recruitment_post` are referenced by this SQL but are not defined in any checked-in migration; their live origin must be confirmed before any Test application.
- The compatibility wrappers and the fail-closed stub are temporary contracts. Their removal requires a later lead-approved cleanup migration; they are not dropped by this file.
- The client release order and mapper/UI PR must be agreed before Test application.
- Adam’s separate Test authorization is still required after the final SQL review.
