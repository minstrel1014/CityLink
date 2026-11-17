# Stage 6 decision handoff for Jeffery — proposal revision 2

- **Date:** 2026-11-17
- **Human approver:** Adam, Project/Integration Lead
- **Roles affected:** Jeffery (Group Chat and Recruitment Posts), Roy (group workflow and join requests), Role 6 (database/security/QA)

## Assignment ledger

- **Base role:** Database, Security, and QA Owner.
- **Human owner:** TBD; the lead has not supplied the Role 6 owner's real-person name.
- **Additional assigned work:** Stage 6 chat/recruitment proposal review, migration/security coordination, and Test-only metadata QA. This supplements, and does not replace, the base role.
- **Decision approver:** Adam, Project/Integration Lead.

**Status:** The product choices below are explicit lead directions. The accompanying SQL is a proposal only; no migration has been applied or approved for application.

## Recorded decisions for proposal v2

1. Preserve the current Test `profiles` read audience: authenticated users may read profiles of people sharing any course, without a current-term filter. New member-list RPCs follow that same any-shared-course audience, returning `profile_id` only as a non-display selector, the approved profile fields `display_name`, `major`, `year`, `bio`, and `skills`, and required pagination metadata. Do not add `student_id` or account `status` to the new RPC result. Existing direct profile-table access is unchanged.
2. Course-detail group discovery shows only groups with at least two actual active membership rows. Pending invitations are not members and do not count. Existing creator/recipient access needed to manage their own forming-group invitation is not removed by this listing rule.
3. Group chat is private to the group. Active members may read and send; former members may read history only; pending invitees and join requesters have no chat access. Sending is blocked for an `abandoned` group. Active members may still send in an `archived` group; only abandoned status freezes chat.
4. Recruitment posts for archived or abandoned groups remain readable but have no Apply/edit/close interaction. Proposal v2 closes open posts when the group changes to either status and disables management/application RPC results.
5. `apply_enabled` is viewer-specific: require an open post and active current-term group; viewer enrolled in that course and profile status `open` or `considering`; no active membership in that course/term; and no pending invitation or join request for that group. Roy's request RPC remains the final enforcement point.
6. Use RPC-only access for new chat/post tables: no direct browser table grants or direct SELECT policies. RPCs must authorize each caller; private helpers are not browser API entry points.
7. Preserve the current-leader review rule. If a membership-ending event leaves no active members, the group becomes `abandoned` (including when its last active member leaves an archived group); pending join requests become `cancelled` (not `expired`). Pending group invitations retain the existing `expired` behavior in proposal v2. This requires updating Roy's existing membership-end and empty-forming-group functions and coordinating those changes with Roy.
8. Pagination defaults: recruitment posts 20 rows, course-detail groups 25, member list 50; maximum 100 per call. These are page sizes, not a group-size cap. Keyset cursors and a `has_more` flag are included.
9. Adam approved group UUID and profile UUID as non-display RPC selectors. They are identifiers, not secrets or permissions; every RPC must authorize regardless of whether a caller knows an identifier. Pagination cursor UUIDs are continuation values for Jeffery to review as part of the API contract.

## Test-only evidence checked before drafting

The authorized read-only metadata check targeted only disposable Test ref `wkzclgmhrtecnpexfesr`; its status was `ACTIVE_HEALTHY`. No student/profile rows were read, no RPC was invoked, and no database changes were made. Test confirms:

- Existing `profiles` RLS calls `private.shares_course_with`, which checks for any shared `enrolments.course_id` and has no term condition. `authenticated` has table-level `SELECT` on `profiles` and can execute that helper; `anon` does not have the table privilege. The existing table grant is not column-limited, so the new RPC intentionally returns only its approved field list while preserving current direct access as Adam directed.
- `study_groups(id, course_id, term_id)` has the required composite unique constraint. `courses` has `term_id`; the group-to-course composite foreign key matches it. `enrolments` points to a course ID, so joining enrolment to that course and checking the group's current term supports current-term eligibility.
- Existing `group_memberships_group_status_idx` supports group/status membership counts. It does not include the roster's `joined_at`/membership-ID sort keys; proposal v2 adds a partial active-member cursor index for keyset pagination. Existing partial unique indexes cover active membership and pending invite/request lookups.
- Existing `private.can_view_group` allows a forming group to be read by its creator or a recipient of a pending invitation. Proposal v2 hides groups below two active members from the course-detail list; it does not remove this invite-flow visibility.
- When a group's last active member leaves, current Test code sets a forming/active group to abandoned, expires pending invitations, and expires pending join requests. Proposal v2 changes pending join requests to cancelled and also moves an archived group to abandoned if a membership-ending event leaves it with no active members. Its empty-forming-group helper cancels any pending join requests as well.
- No CityLink-owned chat or recruitment-post tables/RPCs exist; `realtime.messages` is generic Supabase transport, not a CityLink chat history or a public all-user room.
- Supabase flagged `private.citylink_schema_migrations` as RLS-disabled. Effective privilege checks showed no direct table privileges for `anon`, `authenticated`, or `service_role`; no remediation was applied. Review the advisory separately rather than enabling RLS automatically.

## Pagination response shape

Each RPC returns up to its page-size limit plus a `has_more` boolean on each returned row; it does not return an extra sentinel row. When `has_more` is true, the client sends the last row's cursor values on the next request: post `created_at` + `post_id`; group `group_name` + `group_id`; or member `cursor_joined_at` + `cursor_membership_id`. An empty page means there are no results after that cursor. Cursor IDs are opaque continuation values, not display text or authorization.

## Validation and delivery status

The SQL file is [`docs/proposals/CHAT_RECRUITMENT_MIGRATION_PROPOSAL_V2.sql`](CHAT_RECRUITMENT_MIGRATION_PROPOSAL_V2.sql). It is deliberately under `docs/proposals/`, not `supabase/migrations/`, because it is not yet a reviewed, forward-only migration. Offline parser checks passed: 63 top-level SQL statements, 13 PL/pgSQL function definitions, and 6 SQL-language function bodies parsed. These checks do not resolve live table/column names, grants, policies, function ownership, or execute any SQL. Role 6 and Roy should review database/security changes; Jeffery should review API fields, cursor behavior, and feature behavior. Only after review should a reproducible migration be prepared. Applying it to disposable Test still requires Adam's separate explicit approval. Supabase Main must not be accessed.

The local worktree is on `qa/security-workflows`; local `main` snapshot is `da135199` and the pre-edit worktree was clean. The environment has no Manus Tasks connector or GitHub integration, so this handoff has **not** been sent to Jeffery's task, no branch push was made, and no PR was opened or verified. Share this file and the proposal with Jeffery through the existing task once task messaging is available. No database changes were made.
