# Stage 6 Backend Handoff — Group Chat and Recruitment Posts

**Inspection date:** 2026-11-17
**Project:** CityLink disposable Supabase Test, ref `wkzclgmhrtecnpexfesr` (`CityLink-Stage5-Test`, `ACTIVE_HEALTHY`).
**Requested features:** Jeffery’s Group Chat and Recruitment Posts.
**Owner ledger:** Human owner TBD; base assignment remains Role 6 — Database, Security, and QA Owner. Additional assigned work: Stage 6 read-only backend handoff for Group Chat and Recruitment Posts. Earlier Role 6 responsibilities remain assigned.
**Git branch:** `qa/security-workflows`, created locally from clean, fetched `origin/main` at `da1351997b7ad2c35fc32e8b599caee45a70a917`.

## Executive summary

The Test catalog has no CityLink-owned tables, views, or materialized views matching `chat`, `message`, `recruit`, or `post`, and no CityLink group-chat or recruitment-post columns/policies/RPCs were found. The only matching object is Supabase-managed `realtime.messages`, a partitioned Realtime transport table, not an application chat-history model. The approved Stage 6 behavior is recorded in `docs/team/DECISIONS.md` at `feature/group-contract-decisions` commit `a51a4d6` (open PR #1); this report maps that settled contract to the live schema and identifies technical gaps.

Existing group workflow tables and RPCs are present. Authenticated users have direct `SELECT` on group tables but not direct table `INSERT`, `UPDATE`, or `DELETE`; write operations are exposed through authenticated-only SECURITY DEFINER RPCs. `request_to_join_group(p_group_id uuid)` can support the applicant-side “Apply to join” action without changing approval behavior, provided Jeffery’s client reuses Roy’s existing service wrapper for this RPC. The client-side service implementation was not inspected in this database-only handoff, so its exact method name/payload mapping remains to be confirmed with Roy.

The join-request review RPC checks that the current `study_groups.creator_id` is the caller and that the caller remains an active member; the membership-end trigger transfers `creator_id` to a successor. This matches the latest decision-log rule (“current group leader” with transfer) but conflicts with the project-level task instruction that only the original founder may review. The live helper also resolves join-time ties using `created_at` and UUID, and expires pending requests when no successor exists, while the decision log says ties and the no-active-member outcome remain unresolved. These conflicts are reported for lead reconciliation; nothing was changed.

## Scope and read-only method

- Used the authenticated Supabase MCP only after verifying the exact project ref was `wkzclgmhrtecnpexfesr` and `get_project` reported `ACTIVE_HEALTHY`.
- Inspected public/private table metadata through `list_tables`; inspected catalog metadata with bounded `SELECT` queries against `information_schema`, `pg_catalog`, and `pg_policies`. Each SQL catalog query selected needed metadata columns and included an explicit `LIMIT`.
- Queried no application-table rows and did not select student/profile records. Function bodies were read as catalog definitions only and were not invoked. In particular, the Realtime `authorize` function was not called; its definition contains rolled-back probe inserts.
- Supabase Main was not accessed. GitHub `main` was referenced only as the repository baseline. No secret/service-role key was read or shared. No data/schema/policy/permission change, migration, reset, or deletion was performed.
- `current_setting('pgrst.db_schemas', true)` returned `NULL`; therefore the configured PostgREST exposed-schema list was not confirmed from this setting. Do not infer that a schema is API-exposed from SQL role grants alone.
- Reviewed the approved `docs/team/DECISIONS.md` on `feature/group-contract-decisions` at commit `a51a4d6bc3e80d4f8d08ee0af09be521a325b9fa`; read-only GitHub metadata confirmed PR #1 is OPEN, based on `main` at `da1351997b7ad2c35fc32e8b599caee45a70a917`. This decision branch is separate from this Role 6 feature branch and has not been merged to `main`.

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

All six group/term tables in the inventory and `profiles` are RLS-enabled. The database returned these relevant policies:

| Table / policy | Effective row condition and relevance |
|---|---|
| `study_groups` — `authenticated read eligible groups` | Calls `private.can_view_group(id, auth.uid())`. The helper permits reads for an active member; an enrolled user in an active group in the current term; or, for a forming group, its `creator_id` or a recipient with a pending invitation. This is broader than group membership alone, so it must not be treated as a chat-membership policy. |
| `group_memberships` — `members read group memberships` | Caller may read rows if they are an active member of that group, or if `profile_id = auth.uid()` (their own membership row). |
| `group_invitations` — `participants read group invitations` | Caller may read if they are sender, recipient, or an active member of the group. |
| `group_join_requests` — `requester and current leader read join requests` | Requester may read their request; otherwise caller must match `study_groups.creator_id` and be an active member of that group. |
| `profiles` — `profiles visible to self and course peers` | Authenticated `SELECT` is allowed for the caller’s own row or when `private.shares_course_with(id)` is true. The helper checks for any shared course enrolment and has no current-term filter. |
| `profiles` — `profiles editable by owner` | An `UPDATE` policy allows only `id = auth.uid()` and enforces the same row on `WITH CHECK`; however authenticated has no effective table `UPDATE` privilege, so this policy does not grant direct update access. |
| `academic_terms` / `citylink_settings` / `courses` | Authenticated users may read all academic terms and courses; settings read is limited to the singleton row (`singleton = true`). No browser writes were granted. |

No RLS policies were returned for chat/post tables because none were found. No `INSERT`, `UPDATE`, or `DELETE` RLS policy was returned for the group tables; authenticated group mutation is mediated by RPCs described below.

### Approved profile audience/field gap

The verified Stage 6 decision log limits member-list/profile access to eligible students enrolled in the same associated course for the current term, and permits only `display_name`, `major`, `year`, `bio`, and `skills`; it excludes account `status`. The live `profiles` policy is broader: `private.shares_course_with(p_other_profile_id uuid)` returns true for any shared `public.enrolments.course_id` and does not filter to the current term. Authenticated has table-level `SELECT` on `profiles`, which is row-filtered by that policy but not restricted to an approved column list. The existing `list_course_classmates(p_course_id uuid)` does filter to the current term and caller’s course enrolment, but its signature also returns `student_id` and `status`, beyond the approved field list. No profile values were selected. A reviewed backend/RLS or narrow-returning-RPC proposal is required before using these paths for the Stage 6 member list; do not silently reuse them.

## Table grants

Effective role privilege checks for the inspected public group/term/course/profile tables showed:

- `anon`: no `SELECT`, `INSERT`, `UPDATE`, or `DELETE`.
- `authenticated`: `SELECT` only; no direct `INSERT`, `UPDATE`, or `DELETE`.
- `service_role`: `SELECT`, `INSERT`, `UPDATE`, and `DELETE` at the table privilege level; never expose its key in a client.

These are effective direct table privileges, separate from RLS filtering and RPC execution. No app-owned chat/post table exists, so no table grant or RLS permission for such a table exists to inspect.

## Existing CityLink RPCs/functions and grants

The following public functions are SECURITY DEFINER, use an empty `search_path`, and have effective `EXECUTE` for `authenticated`; the metadata check showed no `EXECUTE` for `anon` or `service_role` on these functions:

| Function | What it permits/does relevant to the handoff |
|---|---|
| `list_course_classmates(p_course_id uuid)` | For a current-term course in which the caller is enrolled, returns other enrolled profiles (profile ID, student ID, display name, major, year, bio, skills, status). `student_id` and account `status` are outside the approved Stage 6 profile field list. Definition inspected only; it was not invoked and no profile values were read. |
| `create_group_and_invite(p_course_id uuid, p_recipient_id uuid)` | Creates/reuses a forming group and a pending group invitation after auth, current-term, shared-course enrolment, profile-availability, self-invite and existing-membership checks. Returns group and invitation IDs. |
| `send_group_invitation(p_group_id uuid, p_recipient_id uuid)` | Allows a group member (or forming group creator) to invite an eligible, enrolled non-member; rejects conflicts with pending requests/invitations and existing course-term membership. |
| `respond_to_group_invitation(p_invitation_id uuid, p_accept boolean)` | Only recipient responds. Decline changes invitation state; acceptance validates current group/term and enrolment, adds membership, and activates a forming group as appropriate. |
| `cancel_group_invitation(p_invitation_id uuid)` | Only sender cancels a pending invitation. |
| `request_to_join_group(p_group_id uuid)` | Applicant-side request creation; detailed contract below. |
| `cancel_group_join_request(p_request_id uuid)` | Only the requester cancels their pending request. |
| `review_group_join_request(p_request_id uuid, p_approve boolean)` | Only current `study_groups.creator_id` who is still an active member may review a pending request; approval creates membership and marks approved, rejection marks rejected. It can mark requests expired if current group/term/enrolment/profile conditions are no longer met. |

Private helper functions observed include `can_view_group`, `is_active_group_member`, `is_enrolled`, `is_current_term`, and `shares_course_with`; definitions are SECURITY DEFINER with empty `search_path`. Authenticated has `EXECUTE` for `can_view_group`, `is_active_group_member`, `is_enrolled`, and `shares_course_with`; it does not have direct execute for `is_current_term` or locking/trigger helpers. `is_enrolled(profile_id, course_id)` and `shares_course_with(other_profile_id)` return booleans for specified IDs; authenticated direct execution was granted. `shares_course_with` does not filter by current term. This is a metadata-level disclosure risk to review if the private schema is exposed; actual PostgREST schema exposure could not be confirmed because the setting returned null.

Only `SELECT` policies are defined on the group tables, so these SECURITY DEFINER RPCs are the authenticated write interface visible in the catalog. Do not add direct table writes or bypass the RPC contracts without a reviewed change.

## Reusing Roy’s service for “Apply to join”

The live backend entry point is `public.request_to_join_group(p_group_id uuid) returns uuid`. Its definition:

1. Requires an authenticated caller and an existing active group in the current academic term.
2. Requires caller course enrolment and profile status `open` or `considering`.
3. Rejects if caller already has an active group membership for that course/term, or already has a pending invitation to this group.
4. Creates a pending `group_join_requests` row if one is not already pending for that requester/group, then returns the request UUID.
5. Does not approve the request, create a membership, or impose a maximum group size.

Therefore Jeffery’s “Apply to join” action should reuse Roy’s existing applicant-side service wrapper if it calls this RPC, rather than creating a second request insert path. It should pass the selected group ID, display pending/requested state using the existing response contract, and leave review to the existing review service/RPC. Roy’s client service source and exact wrapper name were not inspected in this database-only pass; confirm those details with Roy before integration. Do not call the review RPC from the applicant action or change approval rules in chat/post code.

The live `request_to_join_group` definition rejects a pending invitation to the same group; `send_group_invitation` rejects a pending join request to the same group. Both call the per-course/profile locking helpers before those checks. This source inspection is consistent with the approved first-pending-action-wins rule and differs from the older 2026-11-14 decision-log statement that Test allowed both records. No functions were invoked and no concurrent authenticated test was run, so the current catalog does not prove race behavior; retain a multi-user/concurrency test in QA and do not assume a migration is required or unnecessary from source alone.

### Approval-owner consistency item for lead review

`review_group_join_request` checks `v_creator_id = auth.uid()` **and** `private.is_active_group_member(group, auth.uid())`; the trigger transfers `creator_id` when the current leader leaves. This matches the later approved decision-log rule that the current leader inherits review authority, but conflicts with the project-level instruction in this task that only the original student who established the group may review. Do not silently choose which rule supersedes the other; the Project/Integration Lead must reconcile the project instruction with the later decision record before implementation or QA sign-off.

There are two additional implementation-versus-decision gaps. The helper orders successors by `joined_at`, then `created_at`, then `id`, while the decision log says to ask the lead when earliest-join data is tied/ambiguous rather than inventing a tie-break. When no active successor exists, the helper marks the group abandoned and expires pending invitations and join requests; the decision log leaves the no-active-member/pending-request outcome unresolved. No group rows were read, so this report does not claim either edge case has occurred. Do not change these routines during this read-only handoff; require a lead decision before relying on the tie/no-member behavior as approved.

## Approved Stage 6 behavior and missing backend implementation

The reviewed decision log at `feature/group-contract-decisions` commit `a51a4d6bc3e80d4f8d08ee0af09be521a325b9fa` states that Stage 6 product questions are resolved; PR #1 is OPEN and unmerged. The following are approved product requirements—not proposals:

- **Group chat:** active members may read/send plain-text messages; pending invitees and join-requesters have no chat access until active membership; former members may read existing history but not send; history remains while the group record exists, including archived/abandoned groups. Message editing, attachments, AI features, and extra notifications are out of v1.
- **Recruitment posts:** eligible current-term coursemates (including eligible nonmembers) may view posts; only an active member of the advertised group may author; the author may edit/close while active in that group. If the author leaves or is removed, the post auto-closes, becomes read-only, stays visible, and Apply is disabled. Reporting/deletion and a separate moderator role are out of v1.
- **Member/profile list:** only eligible students in the same associated course in the current term may view it; allowed fields are `display_name`, `major`, `year`, `bio`, and `skills`; do not expose `student_id` or account `status` under this decision.
- **Apply:** reuse Roy’s existing join-request service, preserve first-pending-action-wins and the approved review rule, and never directly add a member from the post.

The backend gap is technical and still needs a reviewed proposal before implementation: no CityLink-owned durable chat table/API/RPC/policy/grant or recruitment-post table/API/RPC/policy/grant exists. `realtime.messages` is generic transport, not an application history contract. Future migrations/RPCs must enforce the approved access and lifecycle rules; do not implement or apply a migration as part of this inspection.

The current group visibility policy is not a chat policy: it permits eligible current-term nonmembers to view active group rows and permits certain pending invitees to view forming groups. Conversely, `group_memberships` currently exposes roster rows only to active members or the row’s own profile, which does not implement the approved current-term eligible-coursemate member-list scope. The `profiles` policy/RPC also exceed the approved current-term audience/field list as described above. The succession/tie/no-active-member conflicts in the prior section require lead reconciliation. No permission change is proposed here.

## Separate Test security advisory (not modified)

`list_tables` flagged `private.citylink_schema_migrations` as RLS-disabled. It is not a chat/post object. Effective role checks showed `anon` had no `USAGE` on `private` and no table privileges; `authenticated` had schema `USAGE` but no `SELECT`/`INSERT`/`UPDATE`/`DELETE` on the table; `service_role` had no private-schema `USAGE` or table privileges. Thus the metadata confirms RLS is disabled but does not show direct table privilege for those three API roles. The PostgREST exposed-schema configuration could not be confirmed (`current_setting` returned `NULL`). Keep this as an owner security review item; do not auto-apply. Supabase’s advisory remediation text is `ALTER TABLE "private"."citylink_schema_migrations" ENABLE ROW LEVEL SECURITY;`; enabling RLS without explicit policies may block expected access. No change was made.

## Exact checks and results

- The Supabase project list included another CityLink project ref; it was not queried. All database inspection calls used only `get_project(wkzclgmhrtecnpexfesr)`, which returned `ACTIVE_HEALTHY`.
- Verbose table metadata confirmed RLS enabled on `academic_terms`, `citylink_settings`, `study_groups`, `group_memberships`, `group_invitations`, and `group_join_requests`.
- Bounded catalog queries for candidate table names, columns, policies (including `profiles`), table grants, function definitions (including `shares_course_with`), routine grants, triggers, view names, and role privilege predicates returned the findings above; every SQL statement had an explicit `LIMIT`.
- The approved decision log was read from `feature/group-contract-decisions` at `a51a4d6bc3e80d4f8d08ee0af09be521a325b9fa`; read-only GitHub verification showed PR #1 OPEN, not merged. Its product contract was compared with the Test catalog; conflicts are called out above.
- No application-table `SELECT` was executed. No student/profile row content was read. No routine was invoked. No database mutation occurred.
- No authenticated-session or multi-user behavior tests were performed; this is catalog inspection, not runtime proof of RLS behavior through PostgREST/Realtime.
- No migration, repository source code, database permissions, data, reset, or deletion was changed.
- Planned formatting check: `pnpm exec prettier --check docs/stage6-chat-recruitment-test-handoff.md`. A pass means Prettier accepts the file’s formatting; a failure means formatting needs adjustment. Prettier is not installed in this checkout (`node_modules/.bin/prettier` is absent), so this command is unavailable unless project dependencies are installed; they were not installed for this task.
- `pnpm check` type-checks TypeScript (pass = no TS type errors); `pnpm test` runs Vitest (pass = the configured unit tests pass); `pnpm build` builds the application/server (pass = both build steps succeed). These were not run because only Markdown changed. Failures in these commands indicate code/type/test/build issues, not a diagnosis of database policy behavior; none verifies RLS or chat/Postgres runtime behavior.
- `git diff --cached --check` passed on this final staged revision (exit code 0, no whitespace diagnostics). It verifies whitespace only, not database behavior.

## Git/GitHub and handoff steps

Git is local and tracks the working branch, staging, and commits; GitHub is the remote repository and PR-review host. The local worktree was clean on `main`, fetched `origin/main` to `da13519`, and the assigned `qa/security-workflows` branch was created before this document was written. For this documentation-only change, stage only this file, inspect the staged diff, run `git diff --cached --check`, and commit a meaningful local checkpoint if it passes. Then push only `qa/security-workflows` (never `main`, never force-push), verify the remote branch, and open/update a PR for lead review. Merge only with lead approval. Do not claim any commit, push, or PR unless verified. Share this handoff with the lead and Jeffery; make clear that live catalog inspection was read-only and no database changes were made.
