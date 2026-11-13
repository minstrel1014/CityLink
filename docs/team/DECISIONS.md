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

### 2026-11-14 — Only the group establisher reviews join requests

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Only the person who established a group—the original student who first invited others—may review its join requests. This authority is specific to join-request review; it does not automatically grant chat moderation, recruitment-post moderation, or broader administrator permissions.
- **Roles affected:** Project/integration lead; group creation and management (Roy); invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery).
- **Data/API implications:** In the live Test schema, the establishing student is represented by `public.study_groups.creator_id`; `public.create_group_and_invite` sets it to the actor who first establishes the group. Authorization for the review operation must identify that creator, not permit any active group member to review. The pending-request review/list policy must also avoid exposing another student's request to ordinary group members; requesters may still access their own request/status. Enforce this in the backend RPC and RLS, not only in the UI.
- **Observed mismatch in Test (read-only inspection, 2026-11-14):** `public.review_group_join_request` currently permits any active group member, and the `group_join_requests` SELECT policy currently permits the requester or any active group member. The RPC/policy must be brought into alignment with this approved decision before the feature is treated as complete. No database changes were made during inspection.
- **Unresolved questions:** The approved rule does not name a substitute reviewer if the creator account is deleted or unavailable (`creator_id` can become null). Do not invent a substitute; ask the human lead if that case must be supported. Whether creator review also requires the creator to remain an active member needs confirmation if relevant to the final RPC contract.

### 2026-11-14 — Recruitment posts are visible to eligible coursemates

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Group recruitment posts may be seen by eligible coursemates who are not already members of that group. This is a coursemate audience, not public-internet access.
- **Roles affected:** Project/integration lead; group creation and management/recruitment posts (Jeffery); join requests and invitations (Roy); QA/live testing/documentation (Eunice); AI and project-room file upload (Kayk where room links or attachments are involved).
- **Data/API implications:** The read contract for recruitment posts must include eligible non-member coursemates; it cannot be limited to current group membership. The exact eligibility check must follow the approved course/enrolment contract. This decision does not grant posting, editing, deleting, reporting, chat, or moderation privileges.
- **Unresolved questions:** Who may create, edit, delete, report, review, or hide recruitment posts; moderation and retention behavior; whether post attachments use Kayk's project-room file feature; and how notifications work. Ask the human lead before deciding these permissions or data/API contracts.

## Test-only inspection evidence relevant to these decisions

On 2026-11-14, the lead task used the authorized Supabase MCP connection to inspect metadata in disposable Test project `CityLink-Stage5-Test` (`wkzclgmhrtecnpexfesr`) only. The inspection covered public table/column metadata, RLS policies, constraints, indexes, triggers, group RPC definitions, and execute grants. No application rows were read or changed, no migration was applied, and Main was not accessed. Test contains the group tables and RPCs described above. The checked-in GitHub `main` snapshot inspected for this record is `da1351997b7ad2c35fc32e8b599caee45a70a917`; its checked-in schema is not a substitute for the live Test schema.

## Process for future decisions

When behavior, permissions, RLS, API contracts, or database changes are unclear or disputed, stop the affected work and ask the human lead directly in plain language. State the exact question, provide clear options and consequences, and keep asking when the answer is absent or ambiguous. Mark the work blocked; do not implement unresolved behavior. Once answered, record the date, exact decision, human approver, roles affected, data/API implications, and remaining questions here or in the relevant feature handoff.

Decision documentation belongs on the responsible feature branch. Run relevant checks, commit a meaningful local checkpoint, push that feature branch to GitHub, verify the remote branch, and open or update a pull request. Never push directly to `main`, force-push, or merge without lead approval. Tell the lead where the decision is recorded and provide the PR link.
