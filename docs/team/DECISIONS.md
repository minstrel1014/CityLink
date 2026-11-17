# CityLink Team Decisions

This file records explicit human-approved decisions that affect more than one role. Proposals and unresolved questions are identified separately; do not treat them as approved requirements. Update this file when the lead confirms a shared decision, and link the relevant feature handoff or pull request.

## Approved decisions

### 2026-11-14 — Study groups have no maximum size

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Study groups have no maximum size. Do not add a capacity limit, capacity-based rejection, or invented default capacity.
- **Roles affected:** Project/integration lead; study-group creation and management (Roy); join requests and membership (Roy); group invitation (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery); AI and project-room file upload (Kayk).
- **Data/API implications:** Do not add a group capacity column or an arbitrary group-size check to implement a maximum. A member count is not a capacity. If a future request proposes limits, ask the human lead for a new explicit decision before designing or implementing it.
- **Unresolved questions:** None about the maximum-size rule. Other membership and lifecycle behavior remains governed by the shared feature contract.

### 2026-11-14 — Current group leader reviews join requests; transfer on departure

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** The group leader must be an active group member to review join requests. At group establishment, the original student who first invites others is the leader, represented by `public.study_groups.creator_id`. If that leader leaves the group or their account is deleted/unavailable, the earliest-joined remaining active group member becomes the new leader and inherits join-request review authority. Use the existing `creator_id` as the current leader identifier; do not add a separate leader column under this decision. After transfer, `creator_id` no longer preserves the original founder's identity; no separate founder-history record is approved here. If no active members remain, handling of pending requests and leader succession is unresolved and must remain blocked pending another lead decision.
- **Roles affected:** Project/integration lead; group creation and management (Roy); invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery).
- **Data/API implications:** The live Test schema currently uses nullable `study_groups.creator_id` with `ON DELETE SET NULL`. `create_group_and_invite` initially sets it to the establishing student. The review RPC must require the active `creator_id` holder, and pending-request RLS must not expose other students' requests to ordinary members; requesters may still access their own request/status. When the current leader leaves or is deleted, the approved successor must be selected by earliest group-join time and `creator_id` transferred so the successor can review. Before implementation, verify the existing membership timestamp field and propose a deterministic ordering; ask the lead if the schema cannot identify the earliest member unambiguously. Enforce reviewer checks and transfer in backend operations/RLS, not UI-only logic.
- **Observed mismatch in Test (read-only inspection, 2026-11-14):** `public.review_group_join_request` currently permits any active group member, and the `group_join_requests` SELECT policy currently permits the requester or any active group member. The RPC/policy must be brought into alignment with this approved decision before the feature is treated as complete. No database changes were made during inspection.
- **Unresolved questions:** If no active members remain, no reviewer or pending-request outcome is approved. Ask the lead before implementing that edge case. If the available membership join-time data cannot determine one earliest active member (including a tie), ask the lead rather than inventing a tie-break rule.

### 2026-11-14 — Recruitment posts are visible to eligible coursemates

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Group recruitment posts may be seen by eligible coursemates who are not already members of that group. This is a coursemate audience, not public-internet access.
- **Roles affected:** Project/integration lead; group creation and management/recruitment posts (Jeffery); join requests and invitations (Roy); QA/live testing/documentation (Eunice); AI and project-room file upload (Kayk where room links or attachments are involved).
- **Data/API implications:** The read contract for recruitment posts must include eligible non-member coursemates; it cannot be limited to current group membership. The exact eligibility check must follow the approved course/enrolment contract. This decision does not grant posting, editing, deleting, reporting, chat, or moderation privileges.
- **Unresolved questions at original approval:** See the partial 2026-11-17 decision below for answers about course eligibility, group-member visibility, author authority, closed posts, and reporting/deletion. Other open behavior and data/API contracts remain blocked.

### 2026-11-17 — Partial Stage 6 decisions from the project lead

- **Status:** Partially approved. The project lead delegated Stage 6 decision authority to Jeffery. Implementation remains blocked on the two conflicts below; this entry does not approve an implementation or an actual Test migration.
- **Human approver/delegator:** CityLink project lead (real name remains TBD; choices and delegation were given in the project-lead task).
- **Approved decisions so far:** The lead selected profile fields `display_name`, `major`, `year`, `bio`, and `skills`; do not expose account `status` without a separate decision. The lead selected “any signed-in CityLink student” for profile-link access, but explained that coursemates can already see each other in the coursemate list; because those statements could mean different audiences, do not implement either profile-access scope until Jeffery resolves it. The lead also decided that former members who leave or are removed may read existing chat history but may not send; pending invitees and join-requesters get no chat access until membership is active; history remains accessible to former members while the group record exists, including after archive or abandonment; a sender may edit their own message; any eligible current-term coursemate may create a recruitment post; the author may edit or close their post; if the author leaves or is removed, the post auto-closes and remains visible with Apply disabled; reporting and deletion are out of Stage 6 v1. “Eligible coursemate” means a student enrolled in the associated course for the current term.
- **Roles affected:** Project/integration lead; Group Chat and Recruitment Posts owner Jeffery; Group Creation/Management and existing join-request owner Roy (Apply dependency); QA/live testing/documentation owner Eunice. The existing owner assignments remain unchanged.
- **Delegated authority:** As of 2026-11-17, the lead authorizes Jeffery to make and approve product, permission, API, and RLS design decisions for Stage 6 Group Chat and Recruitment Posts. The delegation is limited to those features and does not override approved Stage 5 group rules, Test-only access, reviewed forward-only migration requirements, or the ban on direct pushes/merges to `main`. It does not authorize resetting or deleting Test.
- **Data/API implications:** Test metadata shows eligible nonmembers may read an active group row, but the current `group_memberships` SELECT policy does not expose the full roster to nonmembers. Member-list/profile access therefore needs a backend-enforced audience contract and reviewed RLS change; the audience conflict must be resolved first. Test has no chat or recruitment-post tables/APIs, so Jeffery must document and review any proposed migration/RPC design before changes. Pending users must not reach chat before active membership. Former members' chat access is read-only while the group record exists. The lead selected sender-owned message editing, but whether a former member may edit their own old messages remains unresolved. Recruitment-post Apply must reuse the existing join-request flow and preserve first-pending-action-wins and leader-only review. No Test changes are made by these decisions.
- **Unresolved questions before implementation:** (1) The profile audience answer is internally unclear: does “any signed-in CityLink student” mean every authenticated student, or did the lead mean only current-term coursemates? (2) Does a sender's edit permission end when they leave or are removed, so former members remain strictly read-only, or may former members still edit their own old messages? Jeffery is authorized to resolve these two points and record the exact outcomes.
- **Next step:** The project lead attempted to hand off the decision authority through the Manus Tasks tool, but `list_tasks` returned `permission_denied`; the Jeffery task ID could not be verified and no task message was sent. Until Jeffery receives the delegated decisions and resolves the two open points, do not start implementation or change Test. After resolution, update this record and proceed on Jeffery's assigned feature branch.

### 2026-11-14 — First pending group action wins

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** For the same student and group, a pending invitation and a pending join request must not coexist. The first pending action remains; reject the later opposite action and show a clear error to the person who attempted it. For example, if the student already has a pending invitation, reject their later join request; if they already have a pending join request, reject a later invitation to that student.
- **Roles affected:** Project/integration lead; group invitations, creation, and join requests (Roy); QA/live testing/documentation (Eunice).
- **Data/API implications:** `send_group_invitation` and `request_to_join_group` must reject the opposing pending action atomically and return a conflict that the UI can explain to the actor whose later action was rejected. The 2026-11-17 Role 6 Test-only catalog handoff reports that the current RPC definitions reject opposite pending invitations/requests after acquiring per-course/profile locks; no RPC was invoked and concurrent authenticated runtime behavior was not tested. The definitions are consistent with the approved rule at source level, but race-safety still needs QA. Do not assume a migration is required or unnecessary without reviewing the existing contract and tests. No database change was made by this decision record.
- **Unresolved questions:** None about the first-action-wins rule. Exact user-facing error wording may be finalized during UI implementation, while preserving the approved meaning.

## Test-only inspection evidence relevant to these decisions

On 2026-11-14, the lead task and Roy's task used the authorized Supabase MCP connection to inspect metadata in disposable Test project `CityLink-Stage5-Test` (`wkzclgmhrtecnpexfesr`) only. Roy's audit found migration-history entries `20261102131343 / 20261102_stage5_groups` and `20261102140927 / 20261102_stage5_course_roster_rpc`; no corresponding migration source exists in the checked-in GitHub repository. Inspections covered public table/column metadata, RLS policies, constraints, indexes, triggers, group RPC definitions, and execute grants. No application rows were read or changed, no migration was applied, and Main was not accessed. Test contains the group tables and RPCs described above. The checked-in GitHub `main` snapshot inspected for this record is `da1351997b7ad2c35fc32e8b599caee45a70a917`; its checked-in schema is not a substitute for the live Test schema.

## Process for future decisions

When behavior, permissions, RLS, API contracts, or database changes are unclear or disputed, stop the affected work and ask the human lead directly in plain language. State the exact question, provide clear options and consequences, and keep asking when the answer is absent or ambiguous. Mark the work blocked; do not implement unresolved behavior. Once answered, record the date, exact decision, human approver, roles affected, data/API implications, and remaining questions here or in the relevant feature handoff.

Decision documentation belongs on the responsible feature branch. Run relevant checks, commit a meaningful local checkpoint, push that feature branch to GitHub, verify the remote branch, and open or update a pull request. Never push directly to `main`, force-push, or merge without lead approval. Tell the lead where the decision is recorded and provide the PR link.

## 2026-11-17 — Stage 6 contract clarification from Jeffery

This is the latest Stage 6 product decision record. It supersedes the profile-audience and chat-message-edit open questions in the earlier partial Stage 6 entry. It does not authorize code changes, schema changes, migrations, or writes to Supabase Test.

**Status.** The product rules below are approved under the project lead's previously recorded Stage 6 delegation to Jeffery. The remaining post-edit question was resolved as option A on 2026-11-17. Implementation remains blocked by the missing Role 6 Test-only schema/RLS/API handoff.

**Human decision-maker.** Jeffery, acting under the delegated Stage 6 decision authority. The project lead's real name remains TBD in the shared roster.

**Task ledger addendum.** Human owner Jeffery; preserve this task's existing Project Lead/Integration base role; add Group Chat and Recruitment Posts without removing prior assignments. `feature/jeffery-group-chat-recruitment` remains a suggestion only and has not been created. This does not replace Roy's group-workflow ownership, Kayk's AI/file scope, or Eunice's QA/documentation scope. The Manus task-management update returned `permission_denied`; this role ledger is recorded here and in the current conversation, not in task metadata.

### Approved decisions

**Profile and member-list audience.** Only eligible students enrolled in the same associated course for the current term may view the permitted group-member list and click through to member profiles. Do not broaden existing profile permissions to every signed-in student. Permitted profile fields are `display_name`, `major`, `year`, `bio`, and `skills`; do not expose account `status`.

**Group-chat access and retention.** Active group members may read and send plain-text messages. Pending invitees and join-requesters have no chat access until membership becomes active. After leaving or removal, former members are read-only: they may read existing history but may not send. Message editing is out of v1 for everyone. History remains available while the group record exists, including archived or abandoned groups. Do not add group deletion or message purging in v1.

**Recruitment-post visibility and author eligibility.** Eligible current-term coursemates may view posts, including eligible nonmembers. A post author must also be an active member of the specific group being advertised; a nonmember may not publish on another group's behalf. The author may edit or close a post while their group membership is active. If the author leaves or is removed, the post auto-closes, becomes read-only, remains visible, and has Apply disabled.

**Moderation and excluded scope.** There is no separate moderator role or reporting/deletion workflow in v1. Attachments, AI features, and extra notifications are also outside this first version.

**Join-request integration.** “Apply to join” must reuse Roy's existing join-request service. It must not directly add a member or duplicate/change Roy's approval rules. Preserve first-pending-action-wins and leader-only join-request review.

**Roles affected.** Project/integration lead; Jeffery (Group Chat and Recruitment Posts); Roy (group creation/management, invitations, and join-request dependency); Eunice (QA/live testing/documentation); Kayk (AI/files, with attachments excluded from this v1 scope).

### Data/API implications and blockers

Enforce course eligibility, active group membership for post creation, and chat read/send permissions in backend/RLS, not only in the UI. The last documented Test metadata inspection found that the `group_memberships` SELECT policy does not expose the full roster to eligible nonmember coursemates, and found no chat or recruitment-post tables/APIs. Role 6 must inspect the disposable Test schema/RLS/functions and provide the required handoff before any implementation proposal or migration. Use the narrowest backend-enforced access that supports the approved audience; do not broaden profile permissions. No Test schema, RLS, or data changes are authorized by this entry.

**Remaining product questions.** None. On 2026-11-17, Jeffery approved option A: editing ends when the author’s group membership ends; the auto-closed post is read-only, remains visible, and Apply stays disabled.

## 2026-11-17 — Join-request reviewer after leader succession

**Status.** Approved by the CityLink project lead on 2026-11-17 as option B. This resolves the conflict between the project instruction saying “original founder only” and the later current-leader rule recorded above. The current-leader rule supersedes the original-founder-only wording for join-request review.

**Decision.** The current group leader is authorized to review join requests. The leader is identified by `public.study_groups.creator_id`, and when leadership succession transfers that field to an eligible successor, review authority transfers with it. The original founder does not retain exclusive review authority after succession. This is consistent with the approved Stage 5 leader-succession model; do not add an immutable founder identity solely to preserve review authority.

**Human approver.** CityLink project lead (real name not supplied; owner ledger remains TBD).

**Roles affected.** Project/integration lead; Roy (group creation, management, invitations, join requests, and membership); Jeffery (recruitment-post Apply integration); Eunice (QA/live testing/documentation); Role 6/database-security owner.

**Data/API implications.** The review RPC and pending-request visibility policy must authorize only the current `creator_id` holder who remains an active group member, plus the requester reading their own request. Leadership transfer must update `creator_id` so the successor can review; former leaders must not retain review rights through a founder-only exception. The Test handoff reports that the live RPC currently uses `creator_id`, matching this decision. This decision does not authorize any migration, policy change, or Test database write. The separately reported succession tie-break and no-active-member/pending-request cleanup behavior are not changed by this reviewer-authority choice and must follow their own approved records.

**Unresolved questions.** None about who reviews join requests after succession. This decision does not resolve other group-lifecycle edge cases.

**Remaining technical blocker.** Role 6's Test-only handoff is available in [documentation PR #4](https://github.com/minstrel1014/CityLink/pull/4) on `qa/security-workflows`. It reports no CityLink-owned chat or recruitment-post schema/API and identifies profile/classmate audience and field-scope gaps; it does not provide a narrow, approved course-detail roster/group-summary API. No implementation or Test changes may begin until the relevant field-limited contract is reviewed.

## 2026-11-17 — Plan Test-backed course-detail roster for 12 sample students

**Status.** Approved for planning only by the CityLink project lead on 2026-11-17 (choice B). This does not authorize reading student records, changing RLS/grants, adding an API/RPC, writing a migration, implementing the feature, or publishing a changed application version.

**Decision.** Based on the project lead's report that 12 sample student records have been prepared in the disposable Test project, plan an update to the enrolled-course detail page to display those students' names, whether each has a group, the group name when applicable, and the group member count. This is a Test-data display, not permission to expose records to the public internet or broaden profile visibility. Preserve the existing authenticated/enrolled-course page guard; do not add other audiences without a separate explicit decision. The My Courses catalogue remains count-only, and its current sample count/list behavior is not changed by this decision.

**Human approver.** CityLink project lead (real name remains TBD in the role ledger).

**Task/owner ledger.** This planning addendum belongs to the existing Project Lead/Integration task. Preserve that base role and all earlier assignments. The added scope is planning a Test-backed enrolled-course detail roster; an implementation owner has not been assigned and remains TBD.

**Roles affected.** Project/integration lead; Eunice (existing Classmate Discovery and QA/documentation role); Role 6 database-security owner; Roy (group/membership data and any future join-request integration); Jeffery (existing group/recruitment scope where group discovery intersects). Existing role assignments are not replaced.

**Data/API implications.** Role 6's Test-only handoff reports that `list_course_classmates(p_course_id uuid)` filters to the current term and enrolled course but also returns `student_id` and profile `status`, beyond the prior approved profile-field allowlist. The `profiles` SELECT policy is broader than current-term coursemates and does not restrict columns; the `group_memberships` SELECT policy exposes memberships only to active group members or the student's own row. No approved field-limited path for returning the 12 students' group affiliation, group name, and member count has been verified. Do not call these sources or read application rows until a narrow, backend-authorized contract is reviewed. Do not use account `status` as the requested group-affiliation state; these are distinct concepts. Do not introduce a group-size cap or imply that a member count is a capacity.

The currently published course-detail “Request to join” control remains browser-local and does not call Test. The later 2026-11-17 decision below approves a future real request through Roy's existing service once the authorized course/group data path and client contract are reviewed; that future behavior has not been implemented or published.

**Unresolved before implementation.** (1) Role 6/security must provide or approve a field-limited, current-term eligible-coursemate course/group data contract and any separately reviewed migration/RLS/RPC proposal; do not weaken broad profile policies. (2) The project lead must assign an implementation owner; no owner is inferred. The request-button choice is resolved by the follow-up below. Until the data path is approved and an owner is assigned, the work remains blocked. No Test rows were read, and no database, source-code, or deployment change was made by the planning decision.

## 2026-11-17 — Real join-request action for future Test-backed course detail

**Status.** Approved by the CityLink project lead on 2026-11-17 (choice B) as the intended behavior for a future implementation. The live app has not been changed.

**Decision.** Once a field-limited, authorized group-data path is reviewed, the enrolled-course detail page's “Request to join” action should submit through Roy's existing join-request service and the existing Test RPC. Do not insert requests directly from the page, create memberships directly, duplicate Roy's workflow, or change the approval process. Preserve first-pending-action-wins and current-leader-only review.

**Human approver.** CityLink project lead (real name remains TBD in the role ledger).

**Roles affected.** Project/integration lead; Roy (group creation, invitations, join-request service and approval rules); Eunice (Classmate Discovery and QA/documentation); Role 6 (authorized data/API and RLS review).

**Data/API implications.** The page must use a real group ID returned by the approved course/group-summary path and pass it through Roy's existing client service. The action must display pending/already-requested and opposing-pending-action conflict states from that service; it must never approve or directly add the student. This decision does not authorize a new RPC, a profile/group RLS change, direct table writes, a migration, or any Test request until the required data path and client contract are reviewed. The published version remains browser-local until an implementation is completed, tested, and separately published.

**Unresolved before implementation.** Role 6/security must provide or approve a field-limited current-term course/group data contract that supplies only the fields and group ID needed by the page; the implementation owner remains TBD. No code, student rows, or database state were changed by this decision.
