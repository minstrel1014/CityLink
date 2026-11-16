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

- **Status:** Partially approved; Jeffery's implementation remains blocked until the open questions below are answered. This entry does not approve code, a migration, an RLS policy, or a new API.
- **Human approver:** CityLink project lead (real name remains TBD; answers were given in the project-lead task).
- **Approved decisions so far:** A member who leaves or is removed may retain read-only access to existing group-chat history and may not send new messages. Eligible coursemates who are not group members may see the group-member list and click a member card to open that member's profile. “Eligible coursemate” means a student enrolled in the associated course for the current term, not the public internet. The author may create, edit, and close their recruitment post. A closed post remains visible with Apply disabled. Reporting and deletion are out of Stage 6 v1.
- **Roles affected:** Project/integration lead; Group Chat and Recruitment Posts owner Jeffery; Group Creation/Management and existing join-request owner Roy (Apply dependency); QA/live testing/documentation owner Eunice. The existing owner assignments remain unchanged.
- **Data/API implications:** Current Test metadata shows eligible nonmembers may read an active group row but the current `group_memberships` SELECT policy does not expose the full member list to nonmembers. Exposing member cards therefore needs an explicitly reviewed, course- and term-scoped backend/RLS contract; a UI-only check is insufficient. The checked Test metadata contains no chat or recruitment-post tables/APIs, so any migration/RPC design must be proposed and reviewed before Test changes. Apply must reuse the existing join-request flow and preserve the approved first-pending-action-wins and leader-only-review rules. No database changes are approved by this partial decision.
- **Unresolved questions before implementation:** (1) Should the linked profile page use the same current-term course-enrolment gate, or may any authenticated student open it? Which fields may eligible coursemates see: display name only; display name plus major/year; or those fields plus bio/skills when present? (2) Who may initially create a post for a group—only an active group member, the current leader, or any eligible coursemate? If an author leaves or is removed, do they keep edit/close rights, lose them while the post remains open, or cause the post to close? (3) Do pending invitees or join-requesters get any chat access before membership becomes active? (4) How long is chat history retained and accessible to former members, particularly after a group is archived or abandoned? (5) Can a sender edit their own message, or are sent messages immutable in v1?
- **Next step:** The project lead must answer these questions directly. Until then, do not create Jeffery's implementation branch or change code/Test. Once the contract is complete, record the final decision, review any proposed API/RLS/migration design, then proceed on Jeffery's assigned feature branch.

### 2026-11-14 — First pending group action wins

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** For the same student and group, a pending invitation and a pending join request must not coexist. The first pending action remains; reject the later opposite action and show a clear error to the person who attempted it. For example, if the student already has a pending invitation, reject their later join request; if they already have a pending join request, reject a later invitation to that student.
- **Roles affected:** Project/integration lead; group invitations, creation, and join requests (Roy); QA/live testing/documentation (Eunice).
- **Data/API implications:** `send_group_invitation` and `request_to_join_group` must check for the opposing pending action and enforce the rule atomically so concurrent calls cannot create both records. Return a conflict that the UI can explain to the actor whose later action was rejected. The current Test RPCs permit both pending records, so a reviewed migration and concurrency/atomicity tests are required before treating this behavior as implemented. No database change was made by this decision record.
- **Unresolved questions:** None about the first-action-wins rule. Exact user-facing error wording may be finalized during UI implementation, while preserving the approved meaning.

## Test-only inspection evidence relevant to these decisions

On 2026-11-14, the lead task and Roy's task used the authorized Supabase MCP connection to inspect metadata in disposable Test project `CityLink-Stage5-Test` (`wkzclgmhrtecnpexfesr`) only. Roy's audit found migration-history entries `20261102131343 / 20261102_stage5_groups` and `20261102140927 / 20261102_stage5_course_roster_rpc`; no corresponding migration source exists in the checked-in GitHub repository. Inspections covered public table/column metadata, RLS policies, constraints, indexes, triggers, group RPC definitions, and execute grants. No application rows were read or changed, no migration was applied, and Main was not accessed. Test contains the group tables and RPCs described above. The checked-in GitHub `main` snapshot inspected for this record is `da1351997b7ad2c35fc32e8b599caee45a70a917`; its checked-in schema is not a substitute for the live Test schema.

## Process for future decisions

When behavior, permissions, RLS, API contracts, or database changes are unclear or disputed, stop the affected work and ask the human lead directly in plain language. State the exact question, provide clear options and consequences, and keep asking when the answer is absent or ambiguous. Mark the work blocked; do not implement unresolved behavior. Once answered, record the date, exact decision, human approver, roles affected, data/API implications, and remaining questions here or in the relevant feature handoff.

Decision documentation belongs on the responsible feature branch. Run relevant checks, commit a meaningful local checkpoint, push that feature branch to GitHub, verify the remote branch, and open or update a pull request. Never push directly to `main`, force-push, or merge without lead approval. Tell the lead where the decision is recorded and provide the PR link.
