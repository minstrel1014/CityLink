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
- **Decision:** The group leader must be an active group member to review join requests. At group establishment, the original student who first invites others is the leader, represented by `public.study_groups.creator_id`. If that leader leaves the group or their account is deleted/unavailable, the earliest-joined remaining active group member becomes the new leader and inherits join-request review authority. Use the existing `creator_id` as the current leader identifier; do not add a separate leader column under this decision. After transfer, `creator_id` no longer preserves the original founder's identity; no separate founder-history record is approved here. The empty-group outcome and equal-join-time tie-break were resolved by the later decision dated 2026-11-15 below.
- **Roles affected:** Project/integration lead; group creation and management (Roy); invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery).
- **Data/API implications:** The live Test schema uses nullable `study_groups.creator_id` with `ON DELETE SET NULL`; `create_group_and_invite` initially sets it to the establishing student. The review RPC must require the active `creator_id` holder, and pending-request RLS must not expose other students' requests to ordinary members; requesters may still access their own request/status. The existing `joined_at` field supplies the primary succession order. The lead-approved tie-break is `created_at ASC`, then membership `id ASC` (see the 2026-11-15 decision below). Enforce reviewer checks and transfer in backend operations/RLS, not UI-only logic.
- **Observed mismatch and correction:** Read-only inspection on 2026-11-14 found that `public.review_group_join_request` permitted any active group member and the `group_join_requests` SELECT policy permitted the requester or any active group member. The correction was applied to Test on 2026-11-15 as migration `20261114163512 / 20261114162301_stage5_group_authority_and_succession`. The read-only catalog regression returned 12/12 passing checks; manual multi-account behavior tests remain pending.
- **Unresolved questions:** None for empty-group dismissal or tied `joined_at` values after the explicit 2026-11-15 decision below. Other behavior remains subject to the human-approval rule above.

### 2026-11-14 — Recruitment posts are visible to eligible coursemates

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Group recruitment posts may be seen by eligible coursemates who are not already members of that group. This is a coursemate audience, not public-internet access.
- **Roles affected:** Project/integration lead; group creation and management/recruitment posts (Jeffery); join requests and invitations (Roy); QA/live testing/documentation (Eunice); AI and project-room file upload (Kayk where room links or attachments are involved).
- **Data/API implications:** The read contract for recruitment posts must include eligible non-member coursemates; it cannot be limited to current group membership. The exact eligibility check must follow the approved course/enrolment contract. This decision does not grant posting, editing, deleting, reporting, chat, or moderation privileges.
- **Unresolved questions:** Who may create, edit, delete, report, review, or hide recruitment posts; moderation and retention behavior; whether post attachments use Kayk's project-room file feature; and how notifications work. Ask the human lead before deciding these permissions or data/API contracts.

### 2026-11-14 — First pending group action wins

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** For the same student and group, a pending invitation and a pending join request must not coexist. The first pending action remains; reject the later opposite action and show a clear error to the person who attempted it. For example, if the student already has a pending invitation, reject their later join request; if they already have a pending join request, reject a later invitation to that student.
- **Roles affected:** Project/integration lead; group invitations, creation, and join requests (Roy); QA/live testing/documentation (Eunice).
- **Data/API implications:** `send_group_invitation` and `request_to_join_group` check for the opposing pending action while holding the same group-row lock, and return clear errors to the later actor. The Test migration above implements this rule; its preflight and post-apply aggregate check found no opposite pending pairs. Functional concurrency tests with disposable accounts/fixtures are still required before release.
- **Unresolved questions:** None about the first-action-wins rule. Exact user-facing error wording may be finalized during UI implementation, while preserving the approved meaning.

### 2026-11-15 — Empty-group dismissal and deterministic leader succession

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** When a group has no remaining active members, dismiss it by setting `study_groups.status = 'abandoned'` and `creator_id = NULL`. Expire its pending group invitations and join requests, recording the transition timestamps. When multiple remaining active members share the earliest `joined_at`, select deterministically by `joined_at ASC`, then `created_at ASC`, then membership `id ASC`.
- **Roles affected:** Project/integration lead; group creation and management (Roy); group invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice).
- **Data/API implications:** Use the existing profile-deletion history trigger function to preserve its anonymization/cancellation behavior while transferring leadership or dismissing empty groups. Add a membership-ending trigger so trusted membership status changes/deletes also transfer the leader or dismiss the empty group atomically. Do not create a new client leave/remove RPC solely to implement succession. If no successor exists, clear the leader, abandon the group, expire pending invitations and requests, and keep all transitions in the same transaction. The selected ordering is explicit because PostgreSQL row order is otherwise undefined.
- **Unresolved questions:** None for these edge cases. No group capacity or maximum size is approved.

## Test-only inspection evidence relevant to these decisions

On 2026-11-14, the lead task and Roy's task used the authorized Supabase MCP connection to inspect metadata in disposable Test project `CityLink-Stage5-Test` (`wkzclgmhrtecnpexfesr`) only. Roy's audit found migration-history entries `20261102131343 / 20261102_stage5_groups` and `20261102140927 / 20261102_stage5_course_roster_rpc`; no corresponding migration source exists in the checked-in GitHub repository. Inspections covered public table/column metadata, RLS policies, constraints, indexes, triggers, group RPC definitions, and execute grants. No application rows were read or changed, no migration was applied, and Main was not accessed. Test contains the group tables and RPCs described above. The checked-in GitHub `main` snapshot inspected for this record is `da1351997b7ad2c35fc32e8b599caee45a70a917`; its checked-in schema is not a substitute for the live Test schema.

On 2026-11-15, the forward-only correction migration `20261114163512 / 20261114162301_stage5_group_authority_and_succession` was applied to that Test project only. All 12 read-only catalog assertions passed; the three public RPCs remained executable by `authenticated` and not by `anon`. No application rows were created or changed by the migration or validation. Manual behavior tests with disposable accounts/fixtures remain outstanding. Main was not accessed.

## Process for future decisions

When behavior, permissions, RLS, API contracts, or database changes are unclear or disputed, stop the affected work and ask the human lead directly in plain language. State the exact question, provide clear options and consequences, and keep asking when the answer is absent or ambiguous. Mark the work blocked; do not implement unresolved behavior. Once answered, record the date, exact decision, human approver, roles affected, data/API implications, and remaining questions here or in the relevant feature handoff.

Decision documentation belongs on the responsible feature branch. Run relevant checks, commit a meaningful local checkpoint, push that feature branch to GitHub, verify the remote branch, and open or update a pull request. Never push directly to `main`, force-push, or merge without lead approval. Tell the lead where the decision is recorded and provide the PR link.
