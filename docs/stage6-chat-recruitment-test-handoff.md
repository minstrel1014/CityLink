# Stage 6 Backend Handoff — Group Chat and Recruitment Posts

**Inspection date:** 2026-11-17
**Project:** CityLink disposable Supabase Test, ref `wkzclgmhrtecnpexfesr` (`CityLink-Stage5-Test`, `ACTIVE_HEALTHY`).
**Requested features:** Jeffery’s Group Chat and Recruitment Posts.
**Owner ledger:** Human owner TBD; base assignment remains Role 6 — Database, Security, and QA Owner. Additional assigned work: Stage 6 read-only backend handoff for Group Chat and Recruitment Posts. Earlier Role 6 responsibilities remain assigned.
**Git branch:** `qa/security-workflows`, created locally from clean, fetched `origin/main` at `da1351997b7ad2c35fc32e8b599caee45a70a917`.

## Executive summary

The Test catalog has no CityLink-owned tables, views, or materialized views matching `chat`, `message`, `recruit`, or `post`, and no group-chat or recruitment-post columns/policies/RPCs were found. The only name match across user schemas is Supabase-managed `realtime.messages`, a partitioned Realtime transport table, not a CityLink group-chat transcript model. Generic Realtime functions (`send`, `send_binary`, `broadcast_changes`, `topic`, `authorize`) exist, but no CityLink group-membership RLS policies or chat persistence contract exists for them.

Existing group workflow tables and RPCs are present. Authenticated users have direct `SELECT` on group tables but not direct table `INSERT`, `UPDATE`, or `DELETE`; write operations are exposed through authenticated-only SECURITY DEFINER RPCs. `request_to_join_group(p_group_id uuid)` can support the applicant-side “Apply to join” action without changing approval behavior, provided Jeffery’s client reuses Roy’s existing service wrapper for this RPC. The client-side service implementation was not inspected in this database-only handoff, so its exact method name/payload mapping remains to be confirmed with Roy.

The join-request review RPC currently checks `study_groups.creator_id` and active membership, rather than allowing any active member. However, a membership-end trigger can reassign `creator_id` to the earliest remaining active member. That succession behavior may diverge from the approved rule that only the original student who established the group may review requests. Lead alignment is needed before treating creator succession as approval succession; no behavior has been changed.

## Scope and read-only method

- Used the authenticated Supabase MCP only after verifying the exact project ref was `wkzclgmhrtecnpexfesr` and `get_project` reported `ACTIVE_HEALTHY`.
- Inspected public/private table metadata through `list_tables`; inspected catalog metadata with bounded `SELECT` queries against `information_schema`, `pg_catalog`, and `pg_policies`. Each SQL catalog query selected needed metadata columns and included an explicit `LIMIT`.
- Queried no application-table rows and did not select student/profile records. Function bodies were read as catalog definitions only and were not invoked. In particular, the Realtime `authorize` function was not called; its definition contains rolled-back probe inserts.
- Main was not queried. No secret/service-role key was read or shared. No data/schema/policy/permission change, migration, reset, or deletion was performed.
- `current_setting('pgrst.db_schemas', true)` returned `NULL`; therefore the configured PostgREST exposed-schema list was not confirmed from this setting. Do not infer that a schema is API-exposed from SQL role grants alone.

## Object inventory and columns

### CityLink-owned group and term objects in `public`

| Table | Observed relevant columns and constraints |
|---|---|
| `academic_terms` | `id uuid` PK, `code text` unique, nullable `starts_on` / `ends_on`, `created_at`. |
| `citylink_settings` | `singleton boolean` PK/check constrained true, `current_term_id uuid` FK to `academic_terms`, `updated_at`. |
| `study_groups` | `id`, `course_id`, `term_id`, nullable `creator_id`, `status` (`forming`, `active`, `abandoned`, `archived`), `name`, timestamps (`created_at`, nullable `activated_at`, `updated_at`). FKs to course/term/profile and composite relationships to memberships, invitations, and requests. No capacity/max-size column or table check was found. |
| `group_memberships` | `id`, `group_id`, `course_id`, `term_id`, nullable `profile_id`, `display_name_snapshot`, `membership_status` (`active`, `left`, `removed`, `account_deleted`), `joined_at`, nullable `ended_at`, `created_at`. Composite FK ties group/course/term. |
| `group_invitations` | `id`, `group_id`, `course_id`, `term_id`, nullable `sender_id` / `recipient_id`, sender/recipient name snapshots, `status` (`pending`, `accepted`, `declined`, `cancelled`, `expired`), timestamps including nullable response/cancel timestamps. Not a chat/post table. |
| `group_join_requests` | `id`, `group_id`, `course_id`, `term_id`, nullable `requester_id`, `requester_name_snapshot`, `status` (`pending`, `approved`, `rejected`, `cancelled`, `expired`), nullable `reviewed_by`, `created_at`, nullable `reviewed_at` / `cancelled_at`, `updated_at`. Composite FK ties request to group/course/term. |

No `max_members`/capacity field, capacity constraint, or capacity branch was found in the inspected create/invite/request/review functions. This is consistent with the approved rule that groups have no maximum size; do not add a limit or invent a default.

### Chat and recruitment-post objects

- No CityLink-owned public/private table, view, materialized view, or foreign table name matching `chat`, `message`, `recruit`, or `post` was found.
- No chat/recruitment/post-related columns occur in the inspected group/term tables; there is no persisted post body, author, post status, or group-chat message history column/table.
- No public/private CityLink RPC/function name matching chat, message, recruitment, or post was found.
- `realtime.messages` exists in Supabase’s `realtime` schema as a partitioned table. Its columns are `topic`, `extension`, nullable `payload jsonb`, nullable `event`, nullable `private`, `updated_at`, `inserted_at`, `id uuid`, nullable `binary_payload`, `skip_broadcast`, and nullable `expires_at`. These are generic transport-oriented fields, not a CityLink-owned group/message/author/history contract.
- `realtime.messages` has RLS enabled, no policies were returned for it, and direct role privilege predicates reported `SELECT`, `INSERT`, and `UPDATE` for `anon`, `authenticated`, and `service_role`, with no `DELETE`. Table grants alone do not bypass RLS; because no policies were found, direct row access is not established. The effective Supabase Realtime service path, channel topic authorization and retention were not runtime-tested. The `pgrst.db_schemas` setting was `NULL`, so REST exposure is unverified.
- Generic Realtime routines exist: `realtime.send(payload jsonb, event text, topic text, private boolean default true)`, `send_binary(payload bytea, event text, topic text, private boolean default true)`, `broadcast_changes(...)`, `topic()`, and `authorize(...)`. They are not CityLink group-chat RPCs. Catalog privilege checks reported execute access for `anon`, `authenticated`, and `service_role`. `send`/`send_binary` are not SECURITY DEFINER and write to `realtime.messages`; their actual feature suitability/authorization is unverified. `authorize` is a Realtime helper whose definition creates and rolls back probes; it was not invoked.

## RLS policies and what they permit

All five group/term tables in the inventory are RLS-enabled. The database returned these relevant authenticated policies; each is `PERMISSIVE` and `SELECT` only:

| Table / policy | Effective row condition and relevance |
|---|---|
| `study_groups` — `authenticated read eligible groups` | Calls `private.can_view_group(id, auth.uid())`. The helper permits reads for an active member; an enrolled user in an active group in the current term; or, for a forming group, its `creator_id` or a recipient with a pending invitation. This is broader than group membership alone, so it must not be treated as a chat-membership policy. |
| `group_memberships` — `members read group memberships` | Caller may read rows if they are an active member of that group, or if `profile_id = auth.uid()` (their own membership row). |
| `group_invitations` — `participants read group invitations` | Caller may read if they are sender, recipient, or an active member of the group. |
| `group_join_requests` — `requester and current leader read join requests` | Requester may read their request; otherwise caller must match `study_groups.creator_id` and be an active member of that group. |
| `academic_terms` / `citylink_settings` / `courses` | Authenticated users may read all academic terms and courses; settings read is limited to the singleton row (`singleton = true`). No browser writes were granted. |

No RLS policies were returned for chat/post tables because none were found. No `INSERT`, `UPDATE`, or `DELETE` RLS policy was returned for the group tables; authenticated group mutation is mediated by RPCs described below.

## Table grants

Effective role privilege checks for the inspected public group/term/course tables showed:

- `anon`: no `SELECT`, `INSERT`, `UPDATE`, or `DELETE`.
- `authenticated`: `SELECT` only; no direct `INSERT`, `UPDATE`, or `DELETE`.
- `service_role`: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` at the table privilege level; never expose its key in a client.

These are effective direct table privileges, separate from RLS filtering and RPC execution. No app-owned chat/post table exists, so no table grant or RLS permission for such a table exists to inspect.

## Existing CityLink RPCs/functions and grants

The following public functions are SECURITY DEFINER, use an empty `search_path`, and have effective `EXECUTE` for `authenticated`; the metadata check showed no `EXECUTE` for `anon` or `service_role` on these functions:

| Function | What it permits/does relevant to the handoff |
|---|---|
| `list_course_classmates(p_course_id uuid)` | For a current-term course in which the caller is enrolled, returns other enrolled profiles (profile ID, student ID, display name, major, year, bio, skills, status). Function definition inspected only; it was not invoked and no profile values were read. |
| `create_group_and_invite(p_course_id uuid, p_recipient_id uuid)` | Creates/reuses a forming group and a pending group invitation after auth, current-term, shared-course enrolment, profile-availability, self-invite and existing-membership checks. Returns group and invitation IDs. |
| `send_group_invitation(p_group_id uuid, p_recipient_id uuid)` | Allows a group member (or forming group creator) to invite an eligible, enrolled non-member; rejects conflicts with pending requests/invitations and existing course-term membership. |
| `respond_to_group_invitation(p_invitation_id uuid, p_accept boolean)` | Only recipient responds. Decline changes invitation state; acceptance validates current group/term and enrolment, adds membership, and activates a forming group as appropriate. |
| `cancel_group_invitation(p_invitation_id uuid)` | Only sender cancels a pending invitation. |
| `request_to_join_group(p_group_id uuid)` | Applicant-side request creation; detailed contract below. |
| `cancel_group_join_request(p_request_id uuid)` | Only the requester cancels their pending request. |
| `review_group_join_request(p_request_id uuid, p_approve boolean)` | Only current `study_groups.creator_id` who is still an active member may review a pending request; approval creates membership and marks approved, rejection marks rejected. It can mark requests expired if current group/term/enrolment/profile conditions are no longer met. |

Private helper functions observed include `can_view_group`, `is_active_group_member`, `is_enrolled`, and `is_current_term`; definitions are SECURITY DEFINER with empty `search_path`. Authenticated has `EXECUTE` for `can_view_group`, `is_active_group_member`, and `is_enrolled`; it does not have direct execute for `is_current_term` or locking/trigger helpers. `can_view_group` uses active membership, current-term/enrolment, or the forming-group creator/pending-invite rules described above. `is_enrolled(profile_id, course_id)` returns a boolean for a specified pair; authenticated direct execution was granted. Whether private routines are exposed through PostgREST is unconfirmed because the exposed-schema setting returned null.

Only `SELECT` policies are defined on the group tables, so these SECURITY DEFINER RPCs are the authenticated write interface visible in the catalog. Do not add direct table writes or bypass the RPC contracts without a reviewed change.

## Reusing Roy’s service for “Apply to join”

The live backend entry point is `public.request_to_join_group(p_group_id uuid) returns uuid`. Its definition:

1. Requires an authenticated caller and an existing active group in the current academic term.
2. Requires caller course enrolment and profile status `open` or `considering`.
3. Rejects if caller already has an active group membership for that course/term, or already has a pending invitation to this group.
4. Creates a pending `group_join_requests` row if one is not already pending for that requester/group, then returns the request UUID.
5. Does not approve the request, create a membership, or impose a maximum group size.

Therefore Jeffery’s “Apply to join” action should reuse Roy’s existing applicant-side service wrapper if it calls this RPC, rather than creating a second request insert path. It should pass the selected group ID, display pending/requested state using the existing response contract, and leave review to the existing review service/RPC. Roy’s client service source and exact wrapper name were not inspected in this database-only pass; confirm those details with Roy before integration. Do not call the review RPC from the applicant action or change approval rules in chat/post code.

### Approval-owner consistency item for lead review

`review_group_join_request` itself checks `v_creator_id = auth.uid()` **and** `private.is_active_group_member(group, auth.uid())`. This is narrower than “any active member” and matches creator-only review at the time of the call. But `private.handle_group_membership_end` invokes `private.reconcile_group_leader_after_membership_end`; when the current creator leaves or ceases to be active, that function reassigns `study_groups.creator_id` to the earliest remaining active member. Consequently, after a founder departure the successor recorded in `creator_id` can review requests. This may conflict with the approved rule that only the original student who established the group may review. No data was read to determine whether this state occurs for any group. Keep behavior unchanged and ask the Project/Integration Lead to resolve the meaning of “creator” after leader departure before proposing a migration or changing the service.

## Missing contracts / reviewed proposal needed

- No application-owned durable group chat table/API/RPC/policies/grants exist. The generic Realtime transport is not proof of a persisted chat feature or group-authorized channel. A design needs an approved choice between ephemeral broadcast and durable history, plus decisions on group membership access, message author identity, message lifecycle/retention, and whether former members can read prior messages.
- No recruitment-post table/API/RPC/policies/grants exist. A reviewed contract needs to decide authoring authority, audience/visibility, create/edit/archive lifecycle, how a post identifies course/term/group, and whether “Apply” creates the existing `group_join_requests` record. Do not infer or implement these semantics without lead approval.
- The broader group visibility helper must not silently be reused as a chat/post authorization rule; it includes enrolled non-members and forming-group invite recipients.
- The creator succession vs original-founder reviewer issue above requires lead alignment; no permission change is proposed here.

## Separate Test security advisory (not modified)

`list_tables` flagged `private.citylink_schema_migrations` as RLS-disabled. It is not a chat/post object. Effective role checks showed `anon` had no `USAGE` on `private` and no table privileges; `authenticated` had schema `USAGE` but no `SELECT`/`INSERT`/`UPDATE`/`DELETE` on the table; `service_role` had no private-schema `USAGE` or table privileges. Thus the metadata confirms RLS is disabled but does not show direct table privilege for those three API roles. The PostgREST exposed-schema configuration could not be confirmed (`current_setting` returned `NULL`). Keep this as an owner security review item; do not auto-apply. Supabase’s advisory remediation text is `ALTER TABLE "private"."citylink_schema_migrations" ENABLE ROW LEVEL SECURITY;`; enabling RLS without explicit policies may block expected access. No change was made.

## Exact checks and results

- The Supabase project list included another CityLink project ref; it was not queried. All database inspection calls used only `get_project(wkzclgmhrtecnpexfesr)`, which returned `ACTIVE_HEALTHY`.
- Verbose table metadata confirmed RLS enabled on `academic_terms`, `citylink_settings`, `study_groups`, `group_memberships`, `group_invitations`, and `group_join_requests`.
- Bounded catalog queries for candidate table names, columns, policies, table grants, function definitions, routine grants, triggers, view names, and role privilege predicates returned the findings above; every SQL statement had an explicit `LIMIT`.
- No application-table `SELECT` was executed. No student/profile row content was read. No routine was invoked. No database mutation occurred.
- No authenticated-session or multi-user behavior tests were performed; this is catalog inspection, not runtime proof of RLS behavior through PostgREST/Realtime.
- No migration, repository source code, database permissions, data, reset, or deletion was changed.
- Planned formatting check: `pnpm exec prettier --check docs/stage6-chat-recruitment-test-handoff.md`. A pass means Prettier accepts the file’s formatting; a failure means formatting needs adjustment. Prettier is not installed in this checkout (`node_modules/.bin/prettier` is absent), so this command is unavailable unless project dependencies are installed; they were not installed for this task.
- `pnpm check` type-checks TypeScript (pass = no TS type errors); `pnpm test` runs Vitest (pass = the configured unit tests pass); `pnpm build` builds the application/server (pass = both build steps succeed). These were not run because only Markdown changed. Failures in these commands indicate code/type/test/build issues, not a diagnosis of database policy behavior; none verifies RLS or chat/Postgres runtime behavior.
- `git diff --cached --check` passed (exit code 0, no whitespace diagnostics) on the staged Markdown handoff. This verifies whitespace only; it does not validate database behavior.

## Git/GitHub and handoff steps

Git is local and tracks the working branch, staging, and commits; GitHub is the remote repository and PR-review host. The local worktree was clean on `main`, fetched `origin/main` to `da13519`, and the assigned `qa/security-workflows` branch was created before this document was written. For this documentation-only change, stage only this file, inspect the staged diff, and make a meaningful local commit after the whitespace check passes. After lead review, push only `qa/security-workflows` (never `main`, never force-push), verify the remote branch, then open/update a PR. Do not claim any commit, push, or PR unless verified. Share this handoff with the lead and Jeffery; make clear that live catalog inspection was read-only and no database changes were made.
