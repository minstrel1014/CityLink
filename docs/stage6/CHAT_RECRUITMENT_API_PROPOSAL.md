# Stage 6 Group Chat and Recruitment Posts — API Proposal

**Status: proposal for Adam and Role 6 review only. No database migration was applied, no RLS was changed, and no application rows were read.** The accompanying SQL file is an unapproved design draft in `docs/stage6/`; it is intentionally not in `supabase/migrations/` and must not be applied as written until reviewed and explicitly approved.

## Owner and scope ledger

Human owner: **Jeffery**. Retain this task’s existing base role, Project Lead/Integration role task. Additional features: **Group Chat** and **Recruitment Posts**. The approved feature branch is `feature/jeffery-group-chat-recruitment`, based on exact GitHub `main` SHA `da1351997b7ad2c35fc32e8b599caee45a70a917`. The branch now exists locally in the isolated worktree `/home/ubuntu/CityLink-worktrees/jeffery-group-chat-recruitment`; it is not pushed yet. No code, Test database or deployment changes have been made.

Scope is limited to the group chat, recruitment posts, and the minimal group/member/profile navigation needed to browse those features. It does not redesign general Classmate Discovery, change Roy’s group creation/invitations/review/request workflow, add AI/files/attachments/notifications/moderation, change group capacity, or broaden direct table access.

## Human-approved behavior recorded for this proposal

The Stage 6 behavior in the shared decision log (PR #1, still open/unmerged) remains the product baseline: active group members may read and send plain-text chat messages; pending invitees and join-requesters have no chat access until membership is active; former members may read existing history but may not send; messages are not editable in v1; history remains while the group record exists, including for archived or abandoned groups. Recruitment posts are visible to eligible current-term coursemates, including nonmembers. Only an active member of the advertised group may author. The author may edit or close a post while actively in the group. When the author leaves or is removed, the post auto-closes, becomes read-only, remains visible, and Apply is disabled. Reporting/deletion and separate moderators are out of v1. Apply must call Roy’s existing request service, not insert a request or membership directly.

On 2026-11-17, Jeffery, exercising the recorded delegated Stage 6 decision authority, approved the following additional limits for coursemate-facing group/member/profile views:

- Group and profile UUIDs may be returned only as non-displayed route selectors. A guessed or possessed ID grants no access; every follow-up operation rechecks authorization.
- Nonmember coursemates may browse/open only `forming` and `active` groups. This rule does **not** remove existing active/former-member chat-history rights.
- For the new coursemate discovery/member/profile views, both the signed-in viewer and target must be enrolled in the same course in the configured current term at each request. Do not apply this rule globally to self-profile or former-member chat history.
- Permitted peer-profile fields: `display_name`, `major`, `year`, `bio`, `skills`. Exclude `email`, `student_id`, account `status`, and raw membership records.

The exact approved group/Stage 6 decisions are linked in the existing [shared decision PR #1](https://github.com/minstrel1014/CityLink/pull/1). This proposal adds no behavior to Roy’s existing service and does not alter the current leader-review rules.

## Verified database and code facts

The only queried database was disposable Supabase Test `CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`. Main was not accessed. Read-only catalog inspection found existing tables for profiles, courses, enrolments, terms, study groups, memberships, group invitations, and join requests. It found no CityLink-owned chat-message or recruitment-post table, API, or policy. `realtime.messages` is generic Supabase transport, not a durable CityLink chat-history model.

The existing Test `profiles` SELECT policy permits same-course peers across terms and authenticated direct SELECT is not column-limited. The existing `list_course_classmates(p_course_id uuid)` filters course and current term, but returns `student_id` and account `status` in addition to permitted profile fields. This proposal does **not** broaden that access and does not silently change the existing policy/RPC, because doing so would change general classmate-discovery and Roy’s current consumer. The gap is flagged for Adam/Role 6 review; these new views must use the narrow RPCs below. Any global correction of the existing profile policy needs separate cross-role review and a coordinated compatibility plan.

Roy’s open PR #2 branch `feature/roy-group-workflows` currently wraps `request_to_join_group(p_group_id uuid)` in the group service (`requestToJoinGroup(userId, groupId)`). The backend creates/reuses a pending request; it does not approve or directly add a member. The proposal uses only that wrapper for Apply. Do not modify Roy’s files or change its behavior in this feature.

Role 6’s catalog report is in [PR #4](https://github.com/minstrel1014/CityLink/pull/4), still open/unmerged. It reports group tables are RLS-enabled, authenticated users have direct SELECT but no direct group-table writes, and group writes are mediated by current RPCs. It also reports current `group_memberships` SELECT is not sufficient for an eligible coursemate to browse a group roster.

## Proposed SQL artifact

[Proposal-only SQL draft](CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql) contains exact proposed DDL, indexes, table RLS, helper functions, RPC signatures/bodies, grants, and membership-end trigger. It is a design artifact only; it is not a migration and has not been executed or validated by PostgreSQL.

The draft proposes:

1. `public.group_chat_messages`: immutable plain text, sender ID nullable for account deletion, sender-name snapshot, group FK `ON DELETE RESTRICT` so history is not silently purged with group deletion, and a group/time/key index.
2. `public.group_recruitment_posts`: group/course/term, nullable author ID, author-name snapshot, body, `open|closed`, timestamps, composite FK to the group/course/term, and indexes. No delete endpoint is proposed.
3. Narrow current-term group discovery functions: `list_current_term_course_groups(p_course_id uuid)`, `list_current_term_group_members(p_group_id uuid)`, and `get_current_term_group_member_profile(p_group_id uuid,p_profile_id uuid)`. These return only the approved name/profile fields plus non-displayed UUID route selectors, check viewer and target course-term eligibility on every call, and limit nonmember group/member access to forming/active groups.
4. Chat functions: `list_group_chat_messages(p_group_id uuid,p_before_created_at timestamptz,p_before_id uuid,p_limit integer)` for cursor paging, and `send_group_chat_message(p_group_id uuid,p_body text)`. Read authorization is active or former membership while the group record exists; sending is active membership only. There is no update/delete function.
5. Recruitment functions: `list_group_recruitment_posts(p_course_id uuid)`, `create_group_recruitment_post(p_group_id uuid,p_body text)`, `edit_group_recruitment_post(p_post_id uuid,p_body text)`, and `close_group_recruitment_post(p_post_id uuid)`. Read requires current-term course enrolment; create/edit/close require the author to remain an active member of the active current-term group. Membership-end triggers close the author’s open posts. A profile-delete trigger closes them before author identity is nulled.
6. RLS enabled on both new tables, but no direct client table privileges (including `SELECT`) are granted; even direct read-only access could expose internal columns. Field-limited `SECURITY DEFINER` RPCs are the only client API. Policies remain defense in depth if a table grant is ever separately reviewed. No anon access or direct DML. Every RPC/helper pins an empty `search_path`, schema-qualifies relations/functions, and rechecks authorization; route IDs never bypass checks.

The SQL draft uses proposed technical text bounds of 4,000 characters for messages and 2,000 for posts. These limits are labeled for reviewer choice, not sourced from an existing product decision. The proposal also preserves post visibility after its group is archived/abandoned, but redacts group UUID/name/member count and disables group opening/Apply for those statuses. Adam/Role 6 should confirm that this safely reconciles “closed posts remain visible” with “nonmembers can open only forming/active groups.”

## API contract summary for review

| Operation                | Proposed contract                                                                                                                                           | Authorization                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List browseable groups   | `list_current_term_course_groups(p_course_id)` → group UUID selector, name, lifecycle status, active member count                                           | Authenticated; viewer enrolled in course in current configured term; only forming/active groups                                                                |
| Open member list         | `list_current_term_group_members(p_group_id)` → profile UUID selector and approved profile fields                                                           | Re-check viewer course enrolment/current term; group belongs to that course/current term and is forming/active; return active members who also remain enrolled |
| Open member profile      | `get_current_term_group_member_profile(p_group_id,p_profile_id)` → approved profile fields                                                                  | Re-check viewer and target enrolment in the same current-term course; target must still be active member of that forming/active group                          |
| Load chat history        | `list_group_chat_messages(group,cursor,limit)` → message ID, sender-name snapshot, text, timestamp                                                          | Active or former group membership, regardless of group lifecycle status; no course-term check for former-history access                                        |
| Send chat message        | `send_group_chat_message(group,text)` → message ID                                                                                                          | Active group membership only; pending invitees/requesters and former members denied                                                                            |
| Browse recruitment posts | `list_group_recruitment_posts(course)` → post, author snapshot, status, and limited group summary when group is forming/active; closed posts remain visible | Authenticated current-term course enrolment; no public internet access                                                                                         |
| Create/edit/close post   | `create_group_recruitment_post(group,text)`, `edit_group_recruitment_post(post,text)`, `close_group_recruitment_post(post)`                                 | Create/edit/close as the author while actively belonging to that active current-term group; membership termination auto-closes; no delete/report endpoint      |
| Apply                    | Roy’s existing `requestToJoinGroup(userId, groupId)` wrapper calling `request_to_join_group(p_group_id)`                                                    | Existing RPC rules remain authoritative; apply is available only on open posts for active groups; no direct membership insert                                  |

## Review questions for Adam and Role 6

1. Confirm the SQL draft’s table constraints/indexes, empty-search-path security-definer pattern, grants, and RLS conditions. Confirm that private helper execution/schema privileges work in Test without exposing the private schema through PostgREST.
2. Confirm group/member/profile detail access checks are correct and that UUIDs remain non-displayed selectors. Confirm the target-member/current-course enrolment recheck matches the approved rule.
3. Confirm former-member chat history remains readable for every group lifecycle status, while the current coursemate-only browse/member APIs stay limited to forming/active groups.
4. Confirm how a still-visible post attached to an archived/abandoned group should expose associated group information. Draft recommendation: keep the post text/author/status visible to eligible coursemates, but return no group selector/name/count and disable group open/Apply.
5. Approve or choose different message/post length limits; these are currently proposal values only.
6. Review the new membership-end trigger alongside existing `private.handle_group_membership_end()`; this draft adds a separate trigger and does not modify succession logic.
7. Keep the existing broad peer profile RLS and legacy classmate RPC untouched in this feature; decide separately if/when to coordinate a cross-role profile-access correction, given the impact on existing Classmate Discovery and Roy’s `listCourseGroupPeers()` consumer.
8. No Test migration/runtime test until a reviewed migration is saved under `supabase/migrations/` and Adam explicitly approves applying it to Test. Never use Main or reset/delete Test.

## Frontend work that can proceed before the migration

Safe without database changes: build static responsive component layouts and local unit tests for the agreed loading/empty/error/unauthorized states; define TypeScript interfaces and pure display/pagination helpers matching the proposed contract; prepare UI copy for member/former/pending chat access; draft a frontend service boundary with mocks only; implement a component-level mock preview that is explicitly labeled fictional and cannot call Supabase. These activities should wait for Adam/Role 6 to approve the exact contract names/response shapes before wiring real RPC names.

Not safe yet: shipping a working live chat/post page; assuming generic Supabase Realtime provides durable history; querying membership/profile tables directly from the browser; changing existing profile RLS or `list_course_classmates`; implementing/applying the SQL; creating Test users/records; changing Roy’s request service; claiming RLS/runtime behavior is verified. No frontend files have been changed or implemented in this proposal.

## Execution issue diagnosis and branch state

The first worktree command failed with `bash: 11: command not found`. Inspection of the recorded shell history showed repeated literal terminal color-query response text of the form `11;rgb:…;1R` inserted into interactive-shell input. This is consistent with the shell trying to run the response token `11` as a command; it was a terminal/session contamination issue, not a Git error. This diagnosis is supported by a clean `bash --noprofile --norc` check that resolved the approved SHA, followed by a successful worktree creation using that clean shell.

Verified branch state: local branch `feature/jeffery-group-chat-recruitment`, HEAD exactly `da1351997b7ad2c35fc32e8b599caee45a70a917`, clean isolated worktree at `/home/ubuntu/CityLink-worktrees/jeffery-group-chat-recruitment`. No matching remote branch existed at the preflight check. It has not been pushed. The proposal is actually in that worktree now; the earlier standalone scratch copy at `/home/ubuntu/CityLink_STAGE6_RPC_proposal_preflight.md` was a preflight note outside the worktree, not the feature proposal. The canonical review files are the two linked documents in `docs/stage6/`.

## Tests, changed files, known issues, next steps

No app/type/unit/build tests were run because no application code was changed. No SQL parser or PostgreSQL was used; the SQL is unvalidated draft text. No Test data, RLS, schema, or grants were changed. The only intended changed files are this proposal handoff and the SQL proposal in `docs/stage6/`.

Known issues: the Test profile SELECT policy/old classmate RPC are broader than the approved current-term field scope; this draft does not fix or broaden them. The role-6 handoff notes prior group succession tie/no-successor behavior that conflicted with older decision-log text. The project lead’s prior choices were `joined_at → created_at → UUID` and, with no successor, mark abandoned and expire pending invitations/requests; the shared decision document still contains an unresolved statement. This Stage 6 proposal does not alter succession, but the lead should reconcile the stale decision record before any Stage 5 change. The group status/post visibility interpretation, text limits, and exact private-schema helper permissions also need review.

Next step: Adam and Role 6 review these two proposal files, mark accepted/changed items, and explicitly approve or reject the migration draft. After that review, record any cross-role decision in `docs/team/DECISIONS.md` on the responsible feature branch, revise the draft, get final migration review, and only then consider implementation. For Git, this local branch is Git’s isolated working copy; commits are local checkpoints and a push would upload this feature branch to GitHub for review—not to main. No commit, push, or PR has been made for this proposal yet.
