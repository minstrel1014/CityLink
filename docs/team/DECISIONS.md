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

### 2026-11-16 — Public Test demo retains existing course and profile writes

- **Status:** Approved for the separate public demo release only.
- **Human approver:** CityLink project lead; real human name remains TBD.
- **Decision:** Keep the existing authenticated `/my-courses` add/remove-own-enrolment controls and `/me` own-profile edit controls available in the public Test-connected demo, alongside the three Stage 5 group workflows. This preserves existing behavior only; it does not authorize additional features or database-policy changes.
- **Roles affected:** Project/integration lead (human owner TBD); group workflow owner Roy; course-enrollment and profile feature owners (names/roles TBD); QA and documentation owner Eunice.
- **Data/API implications:** Once the browser client is configured for disposable Test, signed-in users may use the existing own-row `enrolments` insert/delete and `profiles` update flows, plus the existing group RPCs. Existing identity checks and RLS remain the security boundary. This does not authorize anonymous writes, weaker RLS, a service-role key, schema changes, or data seeding. This decision is limited to Test ref `wkzclgmhrtecnpexfesr` and the public demo copy.
- **Unresolved questions:** Test Auth redirect editing is blocked until an edit-capable account is used; protected Webdev Production values are still pending. Live multi-account behavior tests remain outstanding.

### 2026-11-17 — Course detail invite controls use server-computed eligibility

- **Status:** Approved and applied to disposable Test only on 2026-11-17; the separate public WebDev demo was published on 2026-11-17 as version `2611844d02d6078c37b898df6c4deb6d7e72bf55` at `https://clinkdemo-z7jrfxui.manus.space`. Never apply this migration to Main.
- **Human approver:** CityLink project lead (real name not supplied); on 2026-11-17 the lead selected the least-privilege eligibility-RPC option and delegated approval for feature/API behavior to Roy.
- **Decision:** The authenticated course detail page must show an Invite action only when the server identifies the coursemate as eligible. The eligibility response must not expose a group ID, group name, membership role, or membership row. Existing invitation RPCs remain authoritative for changes and for race/conflict checks. Existing invitation authorization remains unchanged: any active member may invite to a forming or active group, and the creator may also invite while a forming group has no active members; the permission is not leader-only for active members.
- **Roles affected:** Project/integration lead; join-request and membership owner Roy (including the added course-detail/group-invite integration); database security and QA owner (Role 6); QA/live-testing/documentation owner Eunice; group invitation owner Roy.
- **Data/API contract:** The authenticated course-detail page shows Invite only when the server identifies the coursemate as eligible. The eligibility response contains no group ID, group name, membership role, or membership row. `public.list_course_group_invite_candidates(p_course_id uuid) returns table(profile_id uuid)` is stable, read-only, SECURITY DEFINER with an empty search_path and authenticated-only execute grant. It requires the caller and peer to be enrolled in the selected current-term course, restricts peers to `open` or `considering`, and excludes peers with an active group membership for that course and term. The UI intersects these IDs with `list_course_classmates`; existing invitation RPCs remain authoritative for group-specific conflicts and races. Invitation authorization remains unchanged: any active member may invite to forming or active groups, and the creator may invite before a forming group has active memberships.
- **Applied migration and verification:** Applied to `CityLink-Stage5-Test` (`wkzclgmhrtecnpexfesr`) as migration `20261117044721 / stage5_course_group_invite_candidates`, after read-only Test schema/RLS/helper review and explicit user instruction. Seven read-only catalog checks passed: exact UUID-only result; stable SECURITY DEFINER/empty search_path; enrolled caller/current-term course; only other open/considering profiles; active course-term membership exclusion; authenticated execute/anon denied; no group/membership data in result. The migration changed no application rows. No Main access occurred.
- **Unresolved questions:** Signed-in multi-account roster/Invite behavior and mobile viewport rendering remain untested. The public root, unauthenticated detail route, and 14-route manifest were verified in the sandbox browser; no group or invitation mutations were performed during that smoke check.

### 2026-11-17 — Test demo sample roster enrolment

- **Status:** Approved and completed in disposable Test only.
- **Human approver:** CityLink project lead (real name not supplied).
- **Decision:** Use the 12 disposable Test Auth accounts supplied for the named sample students and enroll every one in all ten current Test courses. Update each linked profile's display name to the supplied student name. Do not modify other profile fields or repurpose unrelated generic profiles.
- **Roles affected:** Project/integration lead; join-request and membership owner Roy (including course detail and invitations); database security/QA Role 6; QA/documentation owner Eunice.
- **Data/API implications:** On 2026-11-17, 12 linked profile display names were updated and 120 missing enrolment rows were inserted with duplicate-safe `ON CONFLICT DO NOTHING`; existing enrolments were preserved. Read-only verification confirmed all 12 sample profiles have all ten course codes: `BUS101`, `BUS220`, `COMM105`, `COMP101`, `COMP203`, `COMP215`, `DATA201`, `DATA310`, `FIN201`, and `MATH120`. The broad all-course roster was explicitly chosen for disposable Test demo data; it should not be represented as actual university registration. No passwords, Auth UUIDs, or secret keys are included in the repository documentation.
- **Unresolved questions:** Functional invitation tests with account-owner sign-in remain outstanding. Public deployment is complete; GitHub PR #2 remains open and unmerged.

## Process for future decisions

When behavior, permissions, RLS, API contracts, or database changes are unclear or disputed, stop the affected work and ask the human lead directly in plain language. State the exact question, provide clear options and consequences, and keep asking when the answer is absent or ambiguous. Mark the work blocked; do not implement unresolved behavior. Once answered, record the date, exact decision, human approver, roles affected, data/API implications, and remaining questions here or in the relevant feature handoff.

Decision documentation belongs on the responsible feature branch. Run relevant checks, commit a meaningful local checkpoint, push that feature branch to GitHub, verify the remote branch, and open or update a pull request. Never push directly to `main`, force-push, or merge without lead approval. Tell the lead where the decision is recorded and provide the PR link.

### 2026-11-17 — My Courses counts and two-view course detail

- **Status:** Product/API defaults approved for implementation by the CityLink project lead on 2026-11-17 (“Approve all defaults”). Any new migration requires Role 6 review and separate explicit lead approval before applying it to disposable Test.
- **Human approver:** CityLink project lead; real name remains TBD.
- **Decision:** Use the authenticated `/my-courses` page—the browse/add catalogue—for real current-term Test enrollment counts. Leave the fictional `/courses` catalogue and `/demo` routes unchanged. Split authenticated course detail into a first “My Group” view and a second coursemate list. The first view shows only the signed-in student's own group, active members, current leader, outgoing invitation statuses, pending cancellation, and group rename by the current leader. A no-group state offers the existing first-invitation group-creation flow and a link to request to join an active group. The second view splits coursemates into “In a group” and “Looking for a group,” shows group name/size/status, links to coursemate portfolios, and offers the existing join-request or Invite actions as applicable.
- **Roles affected:** Role 5 (Join-Request and Membership base role with added course-detail, group creation and invitation work), Role 6 (Test schema/RLS review), and Project/Integration Lead.
- **Data/API implications:** Counts use a narrow authenticated RPC that returns only current-term course IDs and totals, not student IDs. The peer-summary RPC returns only peer ID, group ID/name/status/size to an enrolled coursemate, with no other member IDs/names or private invitation/request rows. Group size is active memberships plus the forming group's creator if the creator is not already an active member. Portfolios use only the existing coursemate-visible profile fields. Group rename is a separate current-leader-authorized RPC; no direct table-update grant is added. Existing invitation/review authorization, first-pending-action conflicts, unlimited group size, authentication, profiles, and enrolment rules remain unchanged.
- **Migration gate:** The proposed exact SQL and catalog regression require Role 6 review, then separate explicit lead approval before any Test application. Never apply to Main or reset/delete Test.
- **Unresolved product questions:** None in the approved defaults. For this exact migration, Role 6 review and separate lead approval were confirmed, and Test-only application completed on 2026-11-17; signed-in multi-account UI verification remains pending.

### 2026-11-17 — Migration application and verification

- **Human approval:** On 2026-11-17, the CityLink lead confirmed that Role 6 reviewed the exact migration and explicitly approved Test-only application. The lead's real name and Role 6 reviewer name remain TBD.
- **Roles affected:** Role 5 (Join-Request and Membership base role; human owner TBD) and Role 6 (database security and QA).
- **Application:** `supabase/migrations/20261117205600_stage5_course_detail_group_views.sql` was applied successfully through Supabase MCP at 21:37 +08:00 to `CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`, under migration name `stage5_course_detail_group_views`. Main was not accessed; Test was not reset or deleted; no application rows were changed by applying the migration.
- **Verification:** The checked-in `supabase/tests/stage5_course_detail_group_views_catalog.sql` completed without an exception. Post-application checks confirmed the three reviewed signatures; authenticated execute is granted and anon execute is denied; each function has an empty `search_path`; the two read RPCs are `STABLE SECURITY DEFINER`. RLS remained enabled on all seven relevant tables and their policy count remained 10. Preflight data showed current term `2026-Fall`, 10 courses, 132 enrolments in total (12–18 per course).
- **Unresolved questions and next steps:** No product questions remain. Signed-in multi-account and mobile verification is still needed. This update was not published to the separate WebDev demo; its prior public version remains unchanged.
