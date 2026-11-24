# CityLink Team Decisions

This file records explicit human-approved decisions that affect more than one role. Proposals and unresolved questions are identified separately; do not treat them as approved requirements. Update this file when the lead confirms a shared decision, and link the relevant feature handoff or pull request.

## Approved decisions

### 2026-11-14 — Study groups have no maximum size

- **Status:** Historical record. **Superseded by Adam’s 2026-11-20 approval** for the later hard-maximum capacity direction.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** Study groups have no maximum size. Do not add a capacity limit, capacity-based rejection, or invented default capacity. This historical wording is retained; **Superseded by Adam’s 2026-11-20 approval** for the later 2–19 maximum decision.
- **Roles affected:** Project/integration lead; study-group creation and management (Roy); join requests and membership (Roy); group invitation (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery); AI and project-room file upload (Kayk).
- **Data/API implications:** Do not add a group capacity column or an arbitrary group-size check to implement a maximum. A member count is not a capacity. If a future request proposes limits, ask the human lead for a new explicit decision before designing or implementing it.
- **Unresolved questions:** None about the maximum-size rule. Other membership and lifecycle behavior remains governed by the shared feature contract.

### 2026-11-14 — Current group leader reviews join requests; transfer on departure

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** The group leader must be an active group member to review join requests. At group establishment, the original student who first invites others is the leader, represented by `public.study_groups.creator_id`. If that leader leaves the group or their account is deleted/unavailable, the earliest-joined remaining active group member becomes the new leader and inherits join-request review authority. Use the existing `creator_id` as the current leader identifier; do not add a separate leader column under this decision. After transfer, `creator_id` no longer preserves the original founder's identity; no separate founder-history record is approved here. If no active members remain, the outcome was approved later, on 2026-11-17: the group is marked `abandoned` and pending invitations/requests expire (see the leader-succession edge-case decision below).
- **Roles affected:** Project/integration lead; group creation and management (Roy); invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice); group chat and recruitment posts (Jeffery).
- **Data/API implications:** The live Test schema currently uses nullable `study_groups.creator_id` with `ON DELETE SET NULL`. `create_group_and_invite` initially sets it to the establishing student. The review RPC must require the active `creator_id` holder, and pending-request RLS must not expose other students' requests to ordinary members; requesters may still access their own request/status. When the current leader leaves or is deleted, the approved successor must be selected by earliest group-join time and `creator_id` transferred so the successor can review. Before implementation, verify the existing membership timestamp field and propose a deterministic ordering; ask the lead if the schema cannot identify the earliest member unambiguously. Enforce reviewer checks and transfer in backend operations/RLS, not UI-only logic.
- **Observed mismatch in Test (read-only inspection, 2026-11-14):** `public.review_group_join_request` currently permits any active group member, and the `group_join_requests` SELECT policy currently permits the requester or any active group member. The RPC/policy must be brought into alignment with this approved decision before the feature is treated as complete. No database changes were made during inspection.
- **Unresolved questions:** Resolved on 2026-11-17 by the leader-succession edge-case decision below. Ties are ordered by `joined_at`, then `created_at`, then membership UUID; if no active members remain, the group is marked `abandoned` and pending invitations/requests expire. No further lead decision is required for these two cases.

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

## 2026-11-17 — Leader succession edge cases: tie-break and no-active-member outcome

**Status.** Approved by the CityLink project lead (Adam) on 2026-11-17 in the Project Lead/Integration task. This resolves the two questions left open in the 2026-11-14 leader-succession decision above.

**Decision.** When the current leader leaves or is removed and the remaining active members' earliest `joined_at` values are equal, choose the successor by natural ordering: earliest `joined_at`, then membership `created_at`, then membership UUID. No manual intervention is needed for a tie. When no active members remain, the group is dismissed: set `study_groups.status` to `abandoned` and expire its pending invitations and join requests. No new owner or capacity rule is introduced by either choice.

**Human approver.** CityLink project lead (Adam).

**Roles affected.** Project/integration lead; Roy (group creation, management, invitations, join requests and membership); Role 6/database-security owner; Eunice (QA/live testing/documentation); Jeffery (group chat and recruitment posts, where group status is visible).

**Data/API implications.** These rules describe the behavior Role 6 reported from the existing Test helper: successor order `joined_at`, then `created_at`, then `id`, and on no successor, group `abandoned` plus expiry of pending invitations and requests. This entry records the approved product rule; it does not authorize a migration, policy change, reset, or any Test write. QA should confirm the live routines match this rule before the feature is signed off, and report any mismatch to the lead rather than changing routines unilaterally.

**Unresolved questions.** None about these two edge cases. Other group-lifecycle behavior remains governed by the existing approved decisions.

## 2026-11-17 — Stage 5 implementation records merged from PR #2

These records were written on Roy’s `feature/roy-group-workflows` branch. They are preserved here after merging PR #2 into the shared decision log. The abandoned-group wording in the PR #5 integration record has been corrected to the lead’s option A (pending join requests expire).

### 2026-11-15 — Empty-group dismissal and deterministic leader succession

- **Status:** Approved.
- **Human approver:** CityLink project lead (name not supplied; owner ledger remains TBD).
- **Decision:** When a group has no remaining active members, dismiss it by setting `study_groups.status = 'abandoned'` and `creator_id = NULL`. Expire its pending group invitations and join requests, recording the transition timestamps. When multiple remaining active members share the earliest `joined_at`, select deterministically by `joined_at ASC`, then `created_at ASC`, then membership `id ASC`.
- **Roles affected:** Project/integration lead; group creation and management (Roy); group invitations (Roy); join requests and membership (Roy); QA/live testing/documentation (Eunice).
- **Data/API implications:** Use the existing profile-deletion history trigger function to preserve its anonymization/cancellation behavior while transferring leadership or dismissing empty groups. Add a membership-ending trigger so trusted membership status changes/deletes also transfer the leader or dismiss the empty group atomically. Do not create a new client leave/remove RPC solely to implement succession. If no successor exists, clear the leader, abandon the group, expire pending invitations and requests, and keep all transitions in the same transaction. The selected ordering is explicit because PostgreSQL row order is otherwise undefined.
- **Unresolved questions:** None for these edge cases. The historical sentence that no group capacity or maximum size was approved is **Superseded by Adam’s 2026-11-20 approval**; this entry remains a record of the earlier succession decision.

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

### 2026-11-17 — My Courses counts and two-view course detail

- **Status:** Product/API defaults approved for implementation by the CityLink project lead on 2026-11-17 (“Approve all defaults”). Any new migration requires Role 6 review and separate explicit lead approval before applying it to disposable Test.
- **Human approver:** CityLink project lead; real name remains TBD.
- **Decision:** Use the authenticated `/my-courses` page—the browse/add catalogue—for real current-term Test enrollment counts. Leave the fictional `/courses` catalogue and `/demo` routes unchanged. Split authenticated course detail into a first “My Group” view and a second coursemate list. The first view shows only the signed-in student's own group, active members, current leader, outgoing invitation statuses, pending cancellation, and group rename by the current leader. A no-group state offers the existing first-invitation group-creation flow and a link to request to join an active group. The second view splits coursemates into “In a group” and “Looking for a group,” shows group name/size/status, links to coursemate portfolios, and offers the existing join-request or Invite actions as applicable.
- **Roles affected:** Role 5 (Join-Request and Membership base role with added course-detail, group creation and invitation work), Role 6 (Test schema/RLS review), and Project/Integration Lead.
- **Data/API implications:** Counts use a narrow authenticated RPC that returns only current-term course IDs and totals, not student IDs. The peer-summary RPC returns only peer ID, group ID/name/status/size to an enrolled coursemate, with no other member IDs/names or private invitation/request rows. Group size is active memberships plus the forming group's creator if the creator is not already an active member. Portfolios use only the existing coursemate-visible profile fields. Group rename is a separate current-leader-authorized RPC; no direct table-update grant is added. Existing invitation/review authorization, first-pending-action conflicts, **unlimited group size (Superseded by Adam’s 2026-11-20 approval)**, authentication, profiles, and enrolment rules remain unchanged in this historical entry.
- **Migration gate:** The proposed exact SQL and catalog regression require Role 6 review, then separate explicit lead approval before any Test application. Never apply to Main or reset/delete Test.
- **Unresolved product questions:** None in the approved defaults. For this exact migration, Role 6 review and separate lead approval were confirmed, and Test-only application completed on 2026-11-17; signed-in multi-account UI verification remains pending.

### 2026-11-17 — Migration application and verification

- **Human approval:** On 2026-11-17, the CityLink lead confirmed that Role 6 reviewed the exact migration and explicitly approved Test-only application. The lead's real name and Role 6 reviewer name remain TBD.
- **Roles affected:** Role 5 (Join-Request and Membership base role; human owner TBD) and Role 6 (database security and QA).
- **Application:** `supabase/migrations/20261117205600_stage5_course_detail_group_views.sql` was applied successfully through Supabase MCP at 21:37 +08:00 to `CityLink-Stage5-Test`, ref `wkzclgmhrtecnpexfesr`, under migration name `stage5_course_detail_group_views`. Main was not accessed; Test was not reset or deleted; no application rows were changed by applying the migration.
- **Verification:** The checked-in `supabase/tests/stage5_course_detail_group_views_catalog.sql` completed without an exception. Post-application checks confirmed the three reviewed signatures; authenticated execute is granted and anon execute is denied; each function has an empty `search_path`; the two read RPCs are `STABLE SECURITY DEFINER`. RLS remained enabled on all seven relevant tables and their policy count remained 10. Preflight data showed current term `2026-Fall`, 10 courses, 132 enrolments in total (12–18 per course).
- **Unresolved questions and next steps:** No product questions remain. Signed-in multi-account and mobile verification is still needed. This update was not published to the separate WebDev demo; its prior public version remains unchanged.

### 2026-11-17 — PR #5 join-request integration: succession, abandonment, shared RPC reuse

- **Status:** Approved as the forward integration contract. This decision does not prepare, apply, or authorize a database migration. Any migration still requires Role 6 review and separate explicit lead approval before Test application.
- **Human approver:** Role 5 owner (Roy role; real name TBD), using the lead-delegated authority for feature/API behavior; the CityLink project lead’s real name remains TBD. The decision was confirmed in the Role 5 task on 2026-11-17 (“No objections from my side”).
- **Decision:** The team accepts Jeffery’s PR #5 approach for the join-request integration points:
  1. Reaffirm the existing succession model. The current group leader is the active student named by `study_groups.creator_id`. If that leader leaves, is removed, or becomes unavailable, the earliest-joined remaining active member becomes the leader using the approved `joined_at ASC`, then `created_at ASC`, then membership `id ASC` order, and inherits join-request review authority. This matches the 2026-11-14 and 2026-11-15 decisions; no separate leader column or immutable-founder record is added.
  2. When a group is abandoned, its pending group invitations **and** pending join requests expire (`expired`), matching the lead’s 2026-11-17 leader-succession edge-case decision above. The earlier suggestion to mark join requests `cancelled` was not adopted. The applied Test Stage 5 behavior already uses `expired`, so no forward migration is needed for this rule; Jeffery’s PR #5 proposal SQL must change its abandonment path from `cancelled` to `expired` before any migration review.
  3. PR #5 must integrate with Role 5’s existing group RPCs. “Apply to join” must keep using `requestToJoinGroup` / `request_to_join_group`; it must not add a second join-request service or insert `group_memberships` directly. The existing first-pending-action-wins rule remains authoritative.
- **Roles affected:** Role 5 (join-request and membership; Roy role), Role 6 (database security and migration review), Jeffery (PR #5 implementation), Project/Integration Lead, and QA/documentation (Eunice).
- **Data/API implications:** No schema change is required. `group_join_requests.status` already supports `cancelled`; the abandonment path sets `cancelled_at`. `study_groups.creator_id` remains the current-leader reference used by `review_group_join_request`. UI copy, service error handling, and tests must treat `cancelled` as the abandoned-group outcome rather than `expired`. Current Test behavior is unchanged until a future migration is applied. PR #5’s copied `supabaseGroups.ts` contains matching join-request wrappers but is not byte-identical to Role 5’s current file; integration must preserve newer Role 5 additions instead of overwriting them.
- **Unresolved technical details:** Confirm that PR #5’s `private.maybe_abandon_empty_forming_group` is actually invoked by the existing membership/group lifecycle or wire it explicitly; decide whether `reviewed_at`/`reviewed_by` should also be set when abandonment cancels requests (PR #5 currently sets only `cancelled_at`); and verify trigger ordering, transaction behavior, grants, and RLS with Role 6 before any migration. These are implementation review items, not approval to change Test.
- **References:** [PR #5](https://github.com/minstrel1014/CityLink/pull/5) and [PR #2](https://github.com/minstrel1014/CityLink/pull/2).

**Lead clarification (2026-11-17, option A).** The CityLink project lead (Adam) resolved the conflict between this section’s earlier `cancelled` wording and the 2026-11-17 edge-case decision: abandoned-group pending join requests **expire**, not cancel. Pending invitations also expire. This correction applies to documentation and to Jeffery’s still-unreviewed PR #5 SQL proposal; it authorizes no database change.

## 2026-11-18 — Stage 6 merge order: PR #5 waits for the shell PR

- **Decision (approved by the project lead, Adam, 2026-11-18):** PR #5 (Jeffery's Stage 6 group chat and recruitment posts) is **not merged yet**. A separate "shell" PR is being built by the repair task and will merge first, because it touches the same areas — `App.tsx` routes and the shared navigation/header — as PR #5.
- **After the shell PR merges:** Jeffery **merges the latest `main` into `feature/jeffery-group-chat-recruitment`**. He does **not** rebase and does **not** force-push. He resolves conflicts by keeping both sides (the shell's navigation and the Stage 6 routes), re-runs `corepack pnpm check`, `corepack pnpm test` and `corepack pnpm build`, pushes the feature branch, and asks for a fresh review.
- **Then, in order:** re-review PR #5 and merge it with lead approval → Role 6 reviews the corrected migration draft (abandoned-group join requests now `expired`, recorded in `reviewed_at`; no `expired_at` column exists) → the lead separately approves applying it to the Test project → only after it is applied and tested, sync `main` to the Webdev demo and publish.
- **Why no rebase:** a rebase rewrites the branch's commits and requires a force-push. The team rules forbid force-push without lead approval, so merging `main` into the feature branch is the safe way to update it.
- **Roles affected:** Jeffery (PR #5), the repair-task owner (shell PR), the Project/Integration Lead, Role 6 (migration review), and Eunice (QA and demo checks).
- **Data/API implications:** none. No database change is authorized by this decision. PR #5's SQL stays a proposal under `docs/stage6/`.
- **Documentation note:** PR #5 also edits this file. When Jeffery merges `main` into his branch, he keeps both entries rather than replacing either one.
- **Unresolved:** the shell PR number and merge time are not known yet; the exact conflict scope will be confirmed when it lands.

## 2026-11-18 — One-time read-only Main inspection authorization

- **Decision (Adam, project lead, 2026-11-18):** the lead authorizes a **one-time, read-only catalog inspection** of Supabase Main ref `pijslbchvstkoweslymr`, limited to schema metadata: table and column names, constraints, RLS flags, policies, and function names.
- **Explicitly excluded:** reading application rows, DDL or DML of any kind, invoking RPCs, changing settings, and any access to Auth user data.
- **Purpose:** confirm Main already has the base objects the five Stage 5 migrations depend on (`profiles`, `courses`, `enrolments`, `academic_terms`, `citylink_settings`, `courses(id, term_id)` uniqueness) before deciding whether to promote Stage 5 to Main.
- **Expiry:** this exception ends when the comparison is reported. The standing project rule “never access Main” remains in force for all other work, including any later migration until a separate written authorization is recorded.
- **Roles affected:** Project/Integration Lead, Role 6 (database security), and the integration lead task performing the read-only check.
- **Data/API implications:** none. No object or row on Main is changed by this authorization.

## 2026-11-18 — Stage 5 roster RPC parity (option A) and Main's current term

- **Decision (Adam, project lead, 2026-11-18):** keep `public.list_course_classmates` exactly as it exists for the Stage 5 promotion to Main. Removing `student_id` and `status` from its output is deferred to a follow-up migration **before Stage 6 launch**, together with the matching client update. Option A was chosen over tightening now.
- **Current term:** Main's only `courses.semester` value is `2026-Fall` (confirmed by the lead's read-only query). The term-model migration uses `2026-Fall` as `academic_terms.code` and `citylink_settings.current_term_id`.
- **Implications:** until the follow-up, `authenticated` coursemates on Main can read `student_id` and `status` through this RPC for current-term courses. The follow-up must change the RPC, its client consumers, and its tests together; no schema change is expected.
- **Roles affected:** Project/Integration Lead, Role 6 (migration review), Roy (client consumers), Eunice (QA), and the Stage 6 owner for the timing.
- **Unresolved:** owner and date for the tightening follow-up; to be assigned before Stage 6 launch.

## 2026-11-18 — Main backup authorization and completion

- **Decision (Adam, 2026-11-18):** the lead authorized a full read-only export of the Main application data for backup before the Stage 5 promotion, since the Free plan has no automated backups.
- **Executed:** logical export through the connected Supabase catalog/API on Main ref `pijslbchvstkoweslymr`. No rows were modified, no DDL ran, no Auth users were read.
- **Result:** `profiles` 2 rows, `courses` 10 rows, `enrolments` 4 rows, `invitations` 0 rows. Files stored at `/home/ubuntu/backups/main_20261118/` with `data.sql`, per-table JSON, README and SHA256 checksums; all checksums verified.
- **Scope limits:** `auth.users`, storage objects and schema DDL are not included; the schema is recorded in `supabase/schema.sql` and `supabase/migrations/`.
- **Handling:** contains real profile rows; restricted permissions, not committed, to be deleted from the sandbox after download.

## 2026-11-18 — Authorization to apply Stage 5 migrations to Main

- **Decision (Adam, project lead, 2026-11-18):** written authorization to apply the approved migration files to Supabase Main ref `pijslbchvstkoweslymr`, under the conditions quoted in the lead's message: verified backup first; only files merged to `main` through approved PRs; one migration at a time through the migration tool with verification after each; no reset/delete, TRUNCATE, unlisted drops, Auth/secret changes, or Test access; stop on failure; report each version, time, result and verification; authorization expires on delivery of the report.
- **Preconditions met:** logical Main backup completed 2026-11-18 (profiles 2, courses 10, enrolments 4, invitations 0; checksums verified; `/home/ubuntu/backups/main_20261118/`).
- **Required before execution:** PR #10 merged to `main` so only merged files are executed.
- **Roles affected:** Project/Integration Lead, Role 6, Eunice (verification), Roy and Jeffery (downstream features).
- **Data/API implications:** applies six migrations in order (term model, groups, roster RPC, authority, invite candidates, course detail). The term-model migration writes course data.

## 2026-11-18 — Continuation of Main migration and amended Main-access rule

- **Decision (Adam, project owner, 2026-11-18):** continue applying the approved migrations and finish files 4–6 so Main reaches the consistent six-file state.
- **Amended standing rule:** only **Adam, the project owner**, may authorize or perform changes to Supabase Main (`pijslbchvstkoweslymr`). Other contributors and tasks must not touch Main; the integration lead task acts only under Adam's explicit written authorization, recorded here.
- **Reviewer authority:** option B (the current group leader, including after succession) remains the operative rule. The project instruction text is to be updated by Adam to match; PR #9 stays unmerged until that update.
- **Stop notice:** the repair task's safety stop (2026-11-18) was acknowledged; no undo/reset was performed, and the lead confirmed continuation.

## 2026-11-18 — PR #9 status and Test evidence for option B

- **Status (report only):** PR #9 is open, unmerged and mergeable at merge commit `3d668262d9907af664919dcef9f48b0dc28cea62`, which includes GitHub main `9a12229`. Typecheck passed, 76/76 tests passed, build/format/whitespace passed; signed-in desktop and simulated 375px navigation passed with no Test actions submitted. Its PR body holds security sign-off pending reconciliation of the project instruction with option B.
- **Test evidence (read-only, 2026-11-18):** on Test, the `group_join_requests` SELECT policy is `requester and current leader read join requests`; `review_group_join_request`, `send_group_invitation` and `request_to_join_group` grant EXECUTE only to `authenticated` (no `anon`, no `public`). This matches option B (current leader, including after succession).
- **Remaining action for Adam:** save the project-instruction replacement text supplied on 2026-11-18 so the written rule matches option B and the Main-access rule names Adam as the only person who may authorize Main changes.
- **Main:** six migrations applied and verified; authorization expired on the 11:45 report. Follow-up B8 (missing `profiles` BEFORE DELETE trigger for `archive_deleted_profile_citylink_history`) still needs a new authorization.

## 2026-11-18 — Signed-in workspace shell and Stage 6 navigation reservation

- **Status:** Approved for implementation in Adam’s additional demo-repair assignment. This decision does not authorize any database, RLS, grants, or Supabase Test changes.
- **Human approver and owner:** Adam, CityLink Project, Integration, and Release Lead; Adam remains the owner of this additional demo-repair assignment. The repair assignment supplements and does not replace the lead task.
- **Decision:** After a normal restored/successful sign-in, land on `/dashboard` with **My courses** selected first. Keep **All courses** second and use `/courses` for the full Test-backed catalogue when signed in. Preserve the fictional `/demo` experience and its route family when signed out; the signed-in workspace should not expose the fictional demo as a primary navigation item. Add signed-in Dashboard, Courses, Invitations, Messages, and Profile navigation; keep group workflows and About reachable in the shell. Retain `/my-courses` as a compatibility redirect to `/dashboard`. Reserve the sidebar Messages entry and keep the existing Group Chat link inside authenticated course detail as a Stage 6 shell slot. Do not build chat pages or message send/read behavior in this phase; `/group-chat` remains a clear placeholder and Private Messages remains marked as not implemented.
- **Join-request visibility rule:** The requester and the **current group leader** may see a request. The leader is `study_groups.creator_id`, inherited after succession using the approved tie order (`joined_at`, then `created_at`, then `id`), per Adam's 2026-11-17 option-B decision. The earlier "original creator only" wording in this section was corrected during the 2026-11-18 merge to match option B; Test and Main both enforce the current-leader policy. It does not alter the approved unlimited group-size rule; that historical capacity wording is **Superseded by Adam’s 2026-11-20 approval**.
- **Roles affected:** Adam (base role: Project, Integration, and Release Lead; additional demo-repair assignment), Roy (group workflows and invitation/request integration), Eunice (navigation/notification shell reservation and QA), Jeffery (Stage 6 group chat/recruitment integration), and Role 6 (database security and migration review).
- **API/data implications:** Reuse existing authenticated reads only: `loadCourseDirectory`, `loadCurrentTermCourseEnrollmentCounts`, `listCourseGroupPeers` for courses the signed-in user is enrolled in, and `loadGroupWorkflowSnapshot`. Dashboard classmate initials and “looking” counts come only from those Test-backed reads; no fictional counts are presented as real. Invitations and Messages do not add RPCs or database writes; messages list only active groups where the signed-in user has an active membership. No schema, RLS, grant, RPC, or table contract is changed by this shell.
- **Known authorization mismatch:** The current review RPC is known to allow any active group member, which is broader than the original-creator-only product rule. This branch keeps the existing UI display/action gate on `creator_id` and filters the new Invitations view, but the backend RPC mismatch is not fixed here. Role 6 must review a precise migration/security change and the lead must explicitly approve any application to disposable Test before that backend mismatch can be called resolved. Main must never be accessed.
- **Coordination warning:** PR #5 is currently clean against main but stays unmerged by decision. After this shell PR merges, Jeffery must merge the new main into `feature/jeffery-group-chat-recruitment`, resolve any conflicts, and rerun checks before his PR can merge.
- **Unresolved before sign-off:** A real signed-in, mobile-width smoke test of the Test-backed dashboard and workflows remains necessary. This source-branch build does not itself configure, access, or publish the separate WebDev Preview. Confirm that the durable meaning of `study_groups.creator_id` remains the original creator if the existing succession code changes that value; do not silently replace this rule with successor review authority.

**Merge-readiness discovery (2026-11-18; not a new decision).** The checked-in `20261114163512_20261114162301_stage5_group_authority_and_succession.sql` reassigns `creator_id` to a successor after a leader leaves (lines 112–120), and its review RPC checks that current field and active membership (lines 415–424). The current project instructions explicitly approve review only by the original establisher, while prior decision history and the lead task’s report describe an option B giving review authority to the successor/current leader. These accounts conflict; a client filter on `creator_id` cannot settle original identity or enforce backend security. Adam and Role 6 must reconcile the approved behavior and verify current Test schema/RLS/RPC behavior before sign-off. This discovery does not approve a policy, migration, Main access, or any database write.

- **Data/API implications:** No schema change is required. `group_join_requests.status` supports `expired`; the abandonment path sets `reviewed_at` (and does not use `cancelled_at`). `study_groups.creator_id` remains the current-leader reference used by `review_group_join_request`. UI copy, service error handling, and tests must treat `expired` as the abandoned-group outcome. Current Test behavior is unchanged until a future migration is applied. PR #5’s copied `supabaseGroups.ts` contains matching join-request wrappers but is not byte-identical to Role 5’s current file; integration must preserve newer Role 5 additions instead of overwriting them.
- **Unresolved technical details:** Confirm that PR #5’s `private.maybe_abandon_empty_forming_group` is actually invoked by the existing membership/group lifecycle or wire it explicitly; confirm `reviewed_at` is set and `reviewed_by` remains null when abandonment expires requests; and verify trigger ordering, transaction behavior, grants, and RLS with Role 6 before any migration. These are implementation review items, not approval to change Test.
- **References:** [PR #5](https://github.com/minstrel1014/CityLink/pull/5) and [PR #2](https://github.com/minstrel1014/CityLink/pull/2).

**Lead clarification (2026-11-17, option A).** The CityLink project lead (Adam) resolved the conflict between this section’s earlier `cancelled` wording and the 2026-11-17 edge-case decision: abandoned-group pending join requests **expire**, not cancel. Pending invitations also expire. This correction applies to documentation and to Jeffery’s still-unreviewed PR #5 SQL proposal; it authorizes no database change.

**Implementation note (2026-11-18).** PR #5’s proposal SQL now sets abandoned-group join requests to `expired` and records `reviewed_at`; the verified Test schema exposes `reviewed_at`/`cancelled_at`, not `expired_at`, so no new column is invented. `reviewed_by` remains null for this system transition. This is a proposal-only correction; no migration was applied.

## 2026-11-18 — Stage 6 Test migration authorization (option B for item 1)

- **Decision (Adam, project lead, 2026-11-18):** item 1 of Role 6 review resolved as **option B** — recruitment posts may expose one-member active groups; no SQL change.
- **Authorization:** apply `20261118050000_stage6_chat_recruitment.sql` to the disposable Test project (ref `wkzclgmhrtecnpexfesr`) only, after Role 6 re-checks the exact file. Conditions: forward-only, one migration, no reset/TRUNCATE, no Main access, stop on error, verification queries after apply; Test data writes or accounts need separate approval.
- **Role 6 items:** 2 (group-row locks and open-status guards) and 3 (clear creator_id on abandonment) applied; 4 verified (private schema not exposed by PostgREST).
- **Files:** `supabase/migrations/20261118050000_stage6_chat_recruitment.sql`, `docs/stage6/STAGE6_TEST_MIGRATION.md`.

## 2026-11-20 — PR #37 capacity-integration review dispositions

- **Status:** approval status and implementation status are separate. The three follow-up choices recorded below as **1A / 2A / 3A** were explicitly approved by Adam on 2026-11-20; they are settled product decisions, not open questions. What remains open is exact-head implementation and independent QA of those approved behaviors, plus the separate client/schema cutover approval. Draft PR #37 remains unmerged and unreleased; nothing in this entry authorizes SQL, a migration, a Test/Main change, a publish or a merge.
- **Human approver:** Adam (CityLink Project, Integration, and Release Lead) approved choices 1A, 2A and 3A on 2026-11-20 in the integration-lead task. Independent reviews were supplied by Adam-repair, Eunice, Roy, Jeffery, and Role 6; a task-agent review report is not evidence of personal human authorship of any change.
- **Decisions implemented on `feature/capacity-integration-20261119-v2`:**
  1. The Invitations page is keyed, reloaded, and dispatch-guarded by `authGeneration`, so a same-user auth boundary cannot accept an invitation using stale context. Pure identity helpers and a regression test cover this.
  2. People-page invite controls fail closed while a full roster is pending, failed, or unknown, with a visible retry/explanation. My Groups blocks unknown capacity for active groups; the forming-creator server-checked path remains.
  3. The visible People precheck uses exactly `Group is full` and `Group maximum is not set`; explanatory text is separate.
  4. A successful recruitment Apply keeps a durable local pending marker, and Apply is busy while posts paginate.
  5. The cutover proposal’s creation signature is corrected from five arguments to the actual four-argument `create_group_and_invite`.
- **Roles affected:** Adam (Project/Integration/Release Lead), Adam-repair (additive capacity-client/UI assignment), Roy (group workflows), Jeffery (recruitment/chat), Eunice (QA/docs), Role 6 (database/security review).
- **Data/API implications:** client-only changes on the integration branch; no schema, RLS, grant, RPC, table, Test, or Main change. The server remains authoritative for capacity and invitation acceptance.
- **Approved product choices (these were recorded here as open until this 2026-11-21 documentation reconciliation):**

  **1A — forming-group creator count. Approved by Adam on 2026-11-20.**
  - Decision: in the narrow forming-group creator case, the current creator is counted as one member for the client capacity precheck, and only when no active membership row exists for that specific creator.
  - Boundary: this is an explicit exception to fail-closed behavior and must **not** be generalized. A roster read that is loading, pending, failed, unavailable or otherwise unknown still fails closed with retry/unavailable feedback and no dispatch against unknown capacity. No count may be fabricated after an arbitrary missing or failed roster read.
  - Roles affected: Roy (group creation/management, invitations, join requests), Adam-repair (capacity client/UI), Jeffery (recruitment/Apply surface), Eunice (QA/documentation), Role 6 (server-side capacity authority).
  - Behavior/data/API implications: client-side precheck only. Supabase remains the authority that admits or rejects the last place; this approval changes no RPC signature, table, RLS policy or grant, and authorizes no migration.
  - Implementation status: approval settled; exact-head implementation and page-level tests that distinguish this creator case from other pending/failed/unknown roster states remain pending and unverified.

  **2A — Refresh during Load more. Approved by Adam on 2026-11-20.**
  - Decision: a Refresh requested while Load more is in flight is queued and runs after pagination settles; it is not rejected and not silently dropped.
  - Boundary: the queue applies to **both** recruitment-post pagination and grouped People/group-card pagination. A refresh that was queued, superseded or skipped must not be reported to the user as having completed.
  - Roles affected: Jeffery (group chat and recruitment posts) — implementing on his own feature branch; Adam-repair (capacity client/UI), Eunice (QA/documentation).
  - Behavior/data/API implications: client-side ordering of reads and state updates only; no server contract, RPC or schema change follows from this approval. The durable Apply pending state approved in the same set remains visible even if a refresh fails or is skipped.
  - Implementation status: approval settled; Jeffery's branch implementation, reconciliation into the integration candidate, overlap/failure-path tests and exact-head QA remain pending.

  **3A — Portfolio existing-group invitation precheck. Approved by Adam on 2026-11-20.**
  - Decision: an existing-group invitation started from a coursemate portfolio page requires the same full-roster capacity precheck used elsewhere before dispatch.
  - Boundary: the precheck is a client guard over the existing authorized full-roster read; the server remains mandatory and authoritative for the invitation outcome, and fail-closed behavior for unknown rosters is unchanged (see 1A).
  - Roles affected: Roy (invitation workflows) — implementing on his own feature branch; the coursemate-portfolio surface owner (PR #31 workstream), Eunice (QA/documentation), Role 6 (server authority).
  - Behavior/data/API implications: no new or changed RPC, RLS policy, grant or table contract is implied; full groups continue to block new invitations/applications and acceptance/approval, with pending items left pending.
  - Implementation status: approval settled; at the reviewed PR #37 head the profile-page invite path lacked the precheck, so Roy's branch implementation, integration and exact-head QA remain pending.

- **Documentation-only correction:** this reconciliation records the approval status of 1A/2A/3A as Adam's explicit 2026-11-20 approvals. It introduces no new product behavior and is not evidence that any approved behavior is implemented, tested or released at this or any head. `docs/team/CAPACITY_CLIENT_SCHEMA_CUTOVER_PROPOSAL.md` already states the four-argument `create_group_and_invite` at this head and was verified, not edited.
- **Supersession note:** the former “Human approver: None” and “Open product choices” wording for 1A/2A/3A is **Superseded by Adam’s 2026-11-20 approval**. The implementation and exact-head QA statuses above remain current and unresolved.
- **Remaining gates:** exact-head review of the final integration PR, fresh review of the exact PR #34 SQL head, client/schema cutover and cached-client recovery approval, separate Test-only authorization, and signed-in multi-account/concurrent-last-place QA.

## 2026-11-21 — Option A capacity compatibility contracts

- **Status:** Implementation direction approved by Adam on 2026-11-21. This is a documentation record of the selected compatibility approach and contract names, not runtime verification, migration approval, Test preflight approval, merge approval, release approval or publication approval. PR #37 remains blocked from release until the final SQL/client pair is reviewed together at the same exact heads.
- **Human approver:** Adam, CityLink Project, Integration, and Release Lead, on 2026-11-21. Role 6 supplied the static contract review in PR #41; the Role 6 human name remains TBD. This record does not attribute task-generated code or SQL to a human author.
- **Compatibility decision:** Preserve the released legacy read shapes and names for old clients. Keep the old three-argument `public.create_group_and_invite(uuid, uuid, text)` as a fail-closed compatibility stub that always raises the machine-readable `group_capacity_upgrade_required` signal with SQLSTATE `45000`; it creates no group or invitation and cannot bypass the 2–19 maximum. Capacity-aware clients use the four-argument `public.create_group_and_invite(uuid, uuid, text, integer)` contract.
- **Capacity-aware read contracts:** New clients must opt into the separately named contracts `public.list_course_group_summaries_capacity`, `public.list_current_term_course_groups_capacity`, and `public.list_group_recruitment_posts_capacity`. Do not silently change the released legacy read result shapes or use a legacy read name to make a capacity decision.
- **Stable upgrade signal:** Client handling must match SQLSTATE `45000` or the message token `group_capacity_upgrade_required`, not localized human-readable text or `PGRST202`/`42883` for this compatibility path. Do not auto-retry or fall back to an unlimited/default-maximum create path. The client must keep the upgrade signal distinct from `Group is full` and `Group maximum is not set`.
- **Roles affected:** Adam (project/integration/release), Roy (group creation, invitations and join requests), Jeffery (group chat and recruitment posts), Role 6 (database security and migration review), Eunice (independent QA and documentation), and Adam-repair's capacity-client/UI assignment. The existing owner ledger is unchanged.
- **Seven approved legacy value deltas:** Adam approved the following intentional changes to values returned through the preserved legacy read names, while their column shapes remain unchanged:
  1. `list_course_group_summaries.group_size` changes from raw active-membership count to canonical capacity count, including the narrow forming-creator bonus.
  2. `list_course_group_summaries` hides a forming group containing only its creator when no active membership row exists; the legacy shape remains unchanged.
  3. `list_current_term_course_groups.active_member_count` changes from raw active-membership count to canonical capacity count; the column remains for old allowlist compatibility.
  4. `list_current_term_course_groups.can_create_post` remains structurally false for returned rows and is never authorization; real authority is `private.can_manage_recruitment_post` plus membership checks.
  5. `list_group_recruitment_posts.active_member_count` changes from raw active-membership count to canonical capacity count.
  6. `list_group_recruitment_posts.apply_enabled` becomes capacity-aware and is false for full, unset-maximum and over-limit groups; the write path remains authoritative.
  7. `list_group_recruitment_posts.apply_block_reason` remains unavailable on the legacy posts name and is available only on `public.list_group_recruitment_posts_capacity`.
- **Joint review and rollout implications:** The revised SQL and the paired client branches must be reviewed together at the same exact heads before any Test preflight. Legacy compatibility objects are temporary and may be removed only by a later, separately lead-approved cleanup migration. This approval does not approve that cleanup or its removal timing.
- **Unresolved preflight dependencies:** Before any future Test application, verify the existence, ownership and effective privileges of `private.can_browse_current_term_group` and `private.can_manage_recruitment_post`; verify function ownership and effective/default grantees, including the unresolved `service_role` grant uncertainty. A material mismatch stops application. This documentation task does not inspect those objects.
- **Decided 2026-11-21 20:45 (Adam):** stale-client user-facing wording is exactly "CityLink needs an update. Refresh before creating a group."; an unsaved group-creation draft may be lost on manual refresh with no preservation or automatic reload.
- **Still open:** cache-window length and who declares it over; exact Test-only migration authorization; signed-in multi-account/concurrency QA authorization; and cleanup-migration removal timing. These remain unresolved and are not approved by this entry.
- **Explicit non-authorization:** No Test or Main access, SQL execution, catalog inspection, migration application, application-row write, merge, deployment, publication, or signed-in QA is authorized by this entry. Main remains prohibited; any future Main action requires a separate written Adam decision.

## 2026-11-22 — F2 authorization boundaries and live baseline mismatch

- **Status:** Adam authorized the following bounded rollout and review work on 2026-11-22. This record does not authorize merge, release, deployment or publication, and it does not resolve the live baseline mismatch.
- **Human approver:** Adam, CityLink Project, Integration, and Release Lead.
- **Authorization boundaries:** Signed-in and multi-account QA against disposable Test is authorized when the exact target and evidence are recorded. Necessary schema, RLS, grant, ownership and security-policy work is authorized only within the approved CityLink scope, with the exact changes and results recorded. Test must never be reset or deleted. Main is read-only until official launch: no Main writes, migrations, deletions or schema changes are authorized. Deployment and publication are not authorized and require asking Adam first. GitHub visibility or permission changes are not authorized and require asking Adam first. Owner or replacement-task changes are authorized when necessary, while preserving original task and ownership history. QA or schema work is not merge, release or deployment approval.
- **Roles affected:** Adam (Project/Integration/Release); Role 6 (database security and migration review); Eunice (independent QA/documentation); Roy (group workflows); Jeffery (group chat/recruitment posts); and any explicitly retained replacement-task owner. Existing ownership and task provenance remain unchanged unless separately recorded.
- **Data/API and rollout implications:** These boundaries do not approve any future Main write. Client integration, schema/migration work, cached-client recovery, Test QA, merge, release, deployment and publication remain separate gates.
- **2026-11-22 live finding:** Authorized read-only metadata/catalog inspection found that the checked-in migration names/versions, the live Test migration ledger and the live Main migration ledger do not match. Test has a three-argument `create_group_and_invite`; Main has a two-argument version. Neither live database has `max_members` or the approved `_capacity` functions. Main grants differ materially from Test, including service-role and some anon grants. Therefore PR #41/capacity SQL is **migration-stopped** until Role 6 reconciles the live baseline.
- **Inspection limits:** The finding is metadata/catalog-only. No application row, secret or credential was read. No migration, SQL write, reset, deletion or schema change was performed by this documentation task.
- **Unresolved gates:** Role 6 must reconcile the three-way baseline and review the current successor client/SQL head pair before any capacity migration path can proceed. Exact-head Test preflight and separately authorized signed-in/multi-account Test QA remain required. The stale-client create-path message remains exactly `CityLink needs an update. Refresh before creating a group.`; only whether a separate proactive mismatch notice is needed and where it appears, and whether a manual-refresh warning should mention draft loss, remain open. Draft preservation/recovery, automatic reload/retry, and an unlimited/default-capacity fallback are not authorized.

## 2026-11-23 — CityLink Launch capacity sequencing: row 8 before the capacity release (Track B)

- **Decision (Adam, project lead, 2026-11-23 13:34):** row-8 promotion — the objects in `20261118083000_stage6_people_page_naming.sql` — is authorised to precede the capacity release on CityLink Launch `pijslbchvstkoweslymr`, and the approved order is row 8, then the pre-blob reconciliation, then `20261119090000_group_hard_max.sql`. This answers the Track B sequencing question. It does not by itself authorise a Main write to execute: an execution still needs its own window, its exact SQL heads and Role 6 review of those heads.
- **Measured basis (Role 6, 2026-11-23, disposable local PostgreSQL 17.12):** on a Launch-shaped target the capacity file applies at exit 0 once the 13-column read is dropped, but the first call to `list_group_recruitment_posts` then fails with `column p.subject does not exist`; adding only `subject text` makes the call return rows. A read-only Launch capture confirmed the target state: no `subject` column, no `*_length_chk` constraints, and no `remove_group_member` function.
- **Pin decision (Adam, 2026-11-23 13:34):** the helper digests pinned for the gate are the values measured on Launch under the published five-rule recipe — `private.can_browse_current_term_group` = `f150f88041470bbecaa01e90e909343f084ce8e3a12e82d46fe67ea068c6db57`, `private.can_manage_recruitment_post` = `7d50da9e152baee6cdea2372a2ee5c7a711ee374187b43cc2d37176d7f68b4d9`, with OIDs `26036`/`26037` and body lengths 748/1037 characters. The parity report's "canonical" pair (`5991901a…`, `5e88d56b…`) is **not** used: it does not reproduce on Launch under the published recipe or eight further variants, while the raw body digests match the report exactly (F20).
- **Authorisations recorded here:** one read-only Launch capture for F18/F9 (13:22) and this Track B sequencing decision (13:34). Both were carried out by Role 6 under those scopes. No migration was applied to any project, no Main row was written, and no pin has been declared into a running instrument.
- **Role 6 precondition note (review, not a decision):** the sequence is safe only if the new client release ships in the same window. Row 8 changes the post-list result from 13 to 14 columns on Launch, and the capacity file's three-argument `create_group_and_invite` stub fails closed with `CityLink needs an update. Refresh before creating a group.` — so a stale client would lose group creation entirely. The client PRs are unmerged and deployment is not authorised.
- **References:** PR #52 (reconciliation migration, capture record, F18/F20), `docs/capacity-successor/PREBLOB_RECONCILIATION_AND_LAUNCH_MATRIX_20261123.md`, `docs/capacity-successor/F9_LAUNCH_PIN_PREPARATION_20261123.md` §9.

## 2026-11-23 — Stale tabs are out of scope; capacity ships as one coordinated client-plus-database release

- **Decision (Adam, project lead, 2026-11-23 13:43), stale clients:** the raw database error for an already-open old tab is accepted. Old tabs are not a compatibility target: no two-argument `create_group_and_invite` stub is to be added to the reviewed capacity blob for Launch, and no recovery path is to be designed for a tab that has already loaded the old client. A user in an old tab is directed to reload into the new client. This answers F21 in `ROLE6-MERGE-AND-WINDOW-DECISION-2026-11-23.md` and narrows the F2 cached-client contract recorded on 2026-11-22: the upgrade message, user-triggered refresh, draft-loss behavior and non-persistent `index.html` caching remain in force **for the new client**, but compatibility with clients already running is no longer required.
- **Unchanged:** the three-argument fail-closed stub and the legacy read wrappers stay exactly as reviewed, because they protect the signature Test actually has. Nothing in this decision authorises their removal or any further edit to `20261119090000_group_hard_max.sql`, which remains at SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.
- **Decision (Adam, project lead, 2026-11-23 13:43), launch condition:** capacity releases when the new client is ready together with a corresponding database, under coordinator review. Schema and client therefore ship as one coordinated release; a migration window that would leave the live client without its creation RPC is not authorised. This replaces the previously contemplated schema-first window for Launch.
- **Not authorised by this entry:** merge, migration application, deployment, publication, or signed-in QA. Readiness and coordinator review are prerequisites to a release decision, not the decision itself; each still needs its own recorded authorisation naming exact heads and the target project.
- **Recorded in:** the shared project instructions (capacity compatibility and release gates) and this file. **References:** PR #53, F21 in `ROLE6-MERGE-AND-WINDOW-DECISION-2026-11-23.md`.

## 2026-11-23 — Launch capacity application, Option A merge set and behaviour QA record

- **Status:** record of work Adam authorised on 2026-11-23. It documents what was measured and applied. It is not a release, deployment or publication approval, and it does not authorise any further Main or Launch write.
- **Human approver:** Adam, CityLink Project, Integration and Release Lead. Applied by the coordinator task (`HeZwm7CA7Y3rDtYBounkVC`) over a direct `psql` session; Role 6 reviewed the ordered combination and independently reproduced the preflight numbers.
- **Applied set on CityLink Launch `pijslbchvstkoweslymr` (2026-11-23, UTC):** `20261118083000` S1 at 08:37:55Z (SHA-256 `75aee3a1…0362`, carries its own `BEGIN;`/`COMMIT;`), `20261119085000` gate at 08:38:41Z (no in-file transaction; the runner wrapped it), `20261119090000` S3 at 08:38:53Z (SHA-256 `5cf0a66a…4887`), and `20261119080000` reconciliation at 08:47:48Z as a measured no-op. The migration ledger went from 7 to 11 rows with `created_by = citylink-coordinator-psql-20261123`.
- **F10 measured, not assumed:** the reviewed capacity blob contains `begin;` at `:39` and `commit;` at `:1756`, so applying it as-is satisfies the prohibition on an outer transaction without any runner-provided wrapper. The gate file is the opposite case and must be wrapped; both statements are now measured rather than inferred.
- **The reconciliation is a no-op on Launch and is not a substitute for S1.** It emitted `already the 14-column shape (subject present); nothing to do`. A target without S1 cannot be repaired by it: the recreated read fails at first call with `column p.subject does not exist` (F19). The four preflight failures observed before S1 were all S1's, not row-8's; the earlier "row 8 is required" inference is withdrawn.
- **Gate evidence:** with no declarations the gate raises `group_capacity_gate_run_undeclared` (`45001`); with all seven declarations it returned `group_capacity_gate_satisfied run=citylink-launch-capacity-20261123T0838Z target=pijslbchvstkoweslymr` at 08:38:48Z. Pinned digests `f150f880…db57` and `7d50da9e…b4d9`.
- **F25 acknowledged (Role 6 integrated review):** `private.citylink_capacity_apply_gate()` is installed by a migration but no migration calls it. The eleven-row ledger therefore proves what was installed, never that the gate passed; enforcement is an operator action. Runbooks and release notes must say the gate is invoked by the operator, not that the ladder enforces it. Adding a call from a future migration would be new DDL and needs its own review.
- **F27 addressed by this entry:** no other file on `main` recorded that Launch was migrated, so this paragraph is the record.
- **Observed naming gap, unresolved:** the live ledger's Stage 6 row reads version `20261118080722` while the repository file is `20261118050000_stage6_chat_recruitment.sql`. The mismatch is recorded here rather than corrected; no rename or ledger edit was performed.
- **Option A merge set (2026-11-23):** `main` advanced `1a583e30` → `39f38ba2` through nine merges — #34 `2b63785d55`, #37 `89f18230f1`, #50 `66b9ff47cb`, #55 `c120356ea0`, #41 `a99f3be21e`, #51 `f74855b367`, #52 `9c7b7f0677`, #56 `bc45a77074`, #57 `22fd635`, then #53 `39f38ba2` after a local conflict resolution in this file. All nine PRs are merged; no PR remains open.
- **Client/database pairing evidence:** the published site `https://citylink-vm2mka3y.manus.space` serves bundle `index-DtJYmQaY.js` whose only project reference is `pijslbchvstkoweslymr`, and which contains `list_group_recruitment_posts_capacity` and `p_max_members`. Version build id `344c1058e78f…` corresponds to client head `344c1058e78fd2cccfde89574e226f3e65a1457c`. This answers F22 for the deployed bundle.
- **Signed-in QA on Launch (2026-11-23):** API-level checks recorded the fail-closed three-argument stub (`45000 group_capacity_upgrade_required`), the 2–19 bound (`P0001 group maximum must be between 2 and 19` for 1 and 25), and the empty capacity read. UI-level checks confirmed `Group is full` on a 2/2 group and `Group maximum is not set` on a group with no maximum, with current/maximum shown on grouped People cards and invite controls absent on a full group.
- **Behaviour chain (three disposable accounts, Launch):** create-with-invite → accept → group becomes active with the creator and invitee counted (`active max=2 active=2`); apply to join → pending; leader approval → `active max=19 active=3`; inviting into a full group and applying to a full group both return `P0001 Group is full`, and the pre-existing pending invitation stayed pending.
- **Observation, not a defect:** inviting a recipient who already holds a pending invitation returns the existing invitation id with HTTP 200 instead of raising a duplicate error, including while the group is full. Pending items remain pending, which matches the approved contract; the idempotent return is recorded so a future reader does not read it as a capacity bypass.
- **Seed-data defect found and fixed on Launch:** a seeded course carried the non-RFC-4122 UUID `22222222-2222-2222-2222-222222222222`. The client rejects a malformed `course_id` in the enrolment-count read, so the whole catalogue failed closed behind "The current term could not be verified". The course was re-keyed to `0804189d-bb79-4d59-90f9-50a3b0fe3297` by delete-and-recreate (the composite FK on `study_groups(id, course_id, term_id)` makes in-place re-keying impossible). The client behaved as designed; the data was wrong.
- **Not covered:** no concurrency or simultaneous-last-place test, no chat or recruitment-post write, no cancellation-path test beyond cancelling one invitation, and no acceptance attempt against a full group (only the invitation dispatch and the join request were exercised there).
- **References:** `APPLY_RESULT_20261123.md`, `PREFLIGHT_RESULT_20261123.md`, `SIGNED_IN_QA_20261123.md`, `UI_QA_20261123.md` under the coordinator's `launch-site/apply` working set; Role 6 integrated review of `main` after Option A (F25–F28).

## 2026-11-23 — Current group-chat AI and file-sharing product rules

- **Status:** Current Adam-approved product behavior, recorded for cross-role coordination. This entry supersedes earlier draft wording about four-month retention, retaining deleted/replaced versions, and extra directions in the no-permission message. It does not approve a technical architecture, provider, API, database schema, Storage bucket/policy, migration, Test operation, deployment, publication, or Supabase Main access.
- **Human approver:** Adam, CityLink project owner and lead.
- **AI task and shared plan:** When a current group member uploads lecture slides, AI should identify assignment requirements, weighting/marks, balanced work items based on the group size, each work item's content, all stated deliverable deadlines, and a suggested internal deadline. Do not assign work to named students; provide selectable roles. If the assignment window is more than seven days, suggest an internal deadline three days before; if it is seven days or less, suggest 24 hours before. List every conflicting or multiple date with its deliverable and do not select the governing deadline. If no deadline is stated, ask the group for a source that provides it. If the content is unclear, request more information rather than inventing an answer. Any current group member may view, edit, and save the shared analysis/work plan; members may adjust it after discussion. Do not assume AI may read chat-message history beyond the uploaded files in this scope.
- **File permissions and deletion:** Current group members may upload, view/open, download, and replace files without leader approval. Accept all file types and image formats up to 100 MB per file; this upload allowance does not guarantee that every format can be parsed by AI. Only the uploader of the current file may delete it. Replaced and deleted content is not retained and cannot be restored; recovery requires uploading again. If a file cannot be processed, ask the user to upload an appropriate file again.
- **Retention:** Keep only files currently present in the chatroom. For semester A, retention begins September 1; for semester B, it begins January 10; in each case, retain for five months from the semester start date. Do not retain old versions or deleted file content.
- **Member removal and access messages:** Removing a member does not delete the group's current files. Reject that former member's new file/API requests immediately. Previously issued download links need not expire immediately due to member removal. This exception does not decide what happens to links after a file is replaced or deleted; that remains for technical review. When access is denied, show only a no-permission message, with no instruction to contact the leader or apply to join. While AI is processing, show “AI is processing.”
- **Roles affected:** Adam (product owner/lead); Kayk (preserve the existing base role and add group-chat AI/file sharing); Jeffery (group-chat integration); Role 6 and the responsible technical lead (security/technical review); Eunice (QA/documentation).
- **Data/API implications:** Chat-message records remain in Supabase. Uploaded file contents are to be evaluated for storage in an external drive managed centrally by the CityLink app. This is an evaluation direction only: it does not select a provider, account type, OAuth scope, API, object-link design, backend, schema, quota, or ownership model. File and shared-plan reads/writes must be authorized for current group membership. No API, RLS policy, database change, migration, or external account setup is authorized by this product record.
- **Experience and privacy boundary:** The selected user-facing processing status is “AI is processing.” Device file/photo access should be requested on each upload attempt until granted, without changing the current page layout before permission is granted. Technical feasibility and any mandatory privacy/security disclosure remain subject to technical review; do not infer approval to send student files to an unreviewed third party.
- **Unresolved technical questions:** Role 6/technical owners must review provider terms and account ownership; OAuth/token handling; server-side current-membership checks; safe upload/download/replace/delete flows for arbitrary file types; the exact 100 MB byte definition and total quota; retention calculation, expiry time/time zone, cleanup and metadata/audit handling; behavior of links after replacement/deletion; archived/abandoned-group access; newly joined members' access to prior files/analysis; concurrent shared-plan edits; AI-supported formats and external processing/data disclosures. Any Supabase inspection is Test-only; Test writes require separate explicit approval; never access Main.
- **Next step:** Continue read-only technical and provider review with Role 6. Do not implement or connect a real upload, AI, Storage, API, schema, or migration until the exact technical contract is reviewed and any unresolved product conflict is returned to Adam. Do not merge to `main` without lead approval.

## 2026-11-23 — Group-chat file/AI technical decisions and Kayk decision authority

- **Recorded by:** the continuity task acting for Kayk's scope, from Adam's instructions in the CityLink project conversation. Adam is the human decision maker; this record is a technical decision log, not a claim of implementation or approval of any release step.
- **Storage backend (decision 1):** Adam selected the external cloud drive route (option 1C): file content is stored in a Google Drive managed centrally by the CityLink app, not in Supabase Storage. This resolves the "evaluation direction only" wording in the preceding 2026-11-23 product record for this feature; that record is not deleted and remains the product rule set. No provider account, credential, bucket, API or schema is created by this decision.
- **Signed link TTL (decision 2):** 300 seconds, re-issued on every request. Because Google Drive has no signed-URL primitive, the link is issued and verified by CityLink itself (HMAC over file id, actor and expiry) and must be re-checked against current membership on use.
- **Retention definition (decision 3):** calendar months — `starts_on + interval '5 months'`, expiring at 23:59:59 in Asia/Hong_Kong. Where `academic_terms.starts_on` is null, the term start is derived from the term code (semester A: 1 September, semester B: 10 January) and the derivation is recorded on the row so it can be corrected later. Making `starts_on` NOT NULL with a backfill is a schema change requiring separate review and authorization.
- **AI provider (decision 4):** OpenRouter, calling DeepSeek models (default `deepseek/deepseek-v3.2`). Only text extracted server-side is sent; images and unparseable formats are marked unsupported but remain downloadable. Analysis is user-triggered, and the third-party disclosure (including that DeepSeek is a mainland-China provider) must be shown before content is sent. The API key is held only in server-side secrets; Adam supplies it out of band and it must never appear in chat, the repository or the browser bundle.
- **Expiry mechanism (decision 5):** lazy expiry first — list and download paths filter on `retention_expires_at > now()`. Physical object deletion is deferred and is not yet authorized. Consequence accepted: expired files stop being visible but do not free drive quota, so the quota check is mandatory.
- **Malware scanning (decision 6):** none initially. Accepted residual risk; attachment disposition and `nosniff` remain required.
- **Decision authority delegated to Kayk:** Adam authorized Kayk (this continuity task acting in that scope) to make further decisions of the same kind for this feature — technical and product-detail choices such as adapter internals, retry and error semantics, consent wording, extraction formats, quota thresholds and test approach. The delegation does not extend to: creating paid subscriptions or accounts, handling or storing credentials on Adam's behalf, deploying or publishing, merging or changing GitHub visibility or permissions, writing to Supabase Main, applying migrations or schema changes, or altering the product rules recorded above. Those remain Adam's decisions.
- **Not authorized by this record:** any implementation, commit of feature code, migration, Test or Main database operation, signed-in QA, Edge Function deployment, Google Cloud or OpenRouter account setup, merge, deployment or publication.
- **Next step:** Role 6 reviews `docs/stage6/KAYK_DRIVE_ADAPTER_DESIGN.md` for the changed storage and download model; Adam supplies the OpenRouter key through a secure channel when the AI adapter is reached; implementation starts only on an exact assignment and branch.

## 2026-11-24 — Storage backend changed to Cloudflare R2; P1 authorized

- **Recorded by:** the continuity task acting for Kayk's scope, from Adam's instructions. Adam remains the human decision maker.
- **Change of decision 1:** Adam replaced the Google Drive route (1C) with **Cloudflare R2**. Known resources: bucket `citylink-group-files`, an R2 API token restricted to that bucket with Object Read & Write, CORS not yet configured, Account ID still to be supplied. The Drive design is superseded and retained only as history (`KAYK_DRIVE_ADAPTER_DESIGN.md`); the current design is `KAYK_R2_ADAPTER_DESIGN.md`.
- **Why:** R2 provides native presigned URLs with a 1-second to 7-day expiry, so the 300-second TTL needs no custom HMAC proxy; `DeleteObject` is immediate and free, so there is no trash retention to work around; credentials are long-lived access keys rather than OAuth refresh tokens that expire after 7 days in testing status; and the free tier is 10 GB-month with no egress charges.
- **Unchanged by the switch:** the authorization predicate, the six RPC contracts, the 100 MB limit, the 300-second TTL, calendar-month retention, lazy expiry, the no-scanning decision, the OpenRouter/DeepSeek AI direction, and the rule that replaced or deleted content is never retained. R2 has no versioning enabled by default; if it is ever enabled, deletion must also remove old versions.
- **New consequence:** presigned URLs must be signed server-side, so P2 still needs one small signing endpoint (Supabase Edge Function preferred, Cloudflare Worker as the alternative). Authorization stays in Postgres; the endpoint only calls the predicate.
- **Quota consequence:** 10 GB free is about 100 files at 100 MB, so the quota check is mandatory. Proposed soft limits: 8 GB global, 1 GB per group.
- **P1 authorized by Adam:** schema, `private.can_access_group_files`, the six RPCs, a migration proposal and mock tests. This authorizes drafting code on `feature/kayk-ai-project-room-files` and its implementation branch only. It does not authorize applying any migration, Test or Main database writes, Edge Function or Worker deployment, signed-in QA, merge, deployment or publication.

## 2026-11-24 — R2 storage cap, exact limit message and Role 6 review dispositions

- **Global storage cap (Adam):** 8 GB. On reaching it, new upload requests are rejected cleanly; the exact user-facing message is "Group storage limit reached for this cycle". It is recorded as a stable error token `group_files_storage_limit_reached` so the UI matches on the token rather than on message text, consistent with the existing `Group is full` convention.
- **Per-group soft limit:** 1 GB, unless Adam specifies otherwise.
- **Cap semantics:** the check runs before a presigned upload URL is issued and counts only rows with `status='current'` and `retention_expires_at > now()`. It is a soft cap: concurrent requests can each observe the same total and overshoot, and the database total excludes unconfirmed orphan objects until cleanup exists. Neither is a defect; both must be stated in operations notes.
- **Role 6 review of the R2 design:** archived verbatim as `docs/stage6/KAYK_ROLE6_REVIEW_R2_20261124.md`. Four blocking items were technical and have been fixed in the design: the endpoint must use the user's JWT rather than service role (R1); the signing endpoint must accept only `file_id` and never a client-supplied object key (R2); `confirm_group_file_upload` must take the measured byte size and content type (R3); and `can_access_group_files` must be active-only with a separate uploader check for deletion (R4).
- **R5 resolved (Adam, 2026-11-24):** retention is **five months**, which was already Adam's 2026-11-23 decision. The earlier four-month statement was bound to the version-history rule he has since abolished, so it is superseded and must not be read as a live rule. The real blocker is `academic_terms.starts_on` being NULL, handled separately by the term-code derivation.
- **R6 resolved (Adam, 2026-11-24):** replacement is limited to the uploader of the current version. The group leader may delete, but must never silently overwrite another member's content. Rationale: replacement deletes the old object without retaining a version, so allowing any member to replace would let any member destroy another member's work. Implemented as: `replace_group_file` requires `uploaded_by = auth.uid()`; `delete_group_file` allows the uploader or the group leader.
- **Recorded, no decision needed (R8):** no migration ever populates `academic_terms.starts_on`, so the term-code derivation is the only live path, not a fallback. Because `retention_expires_at` is written once at creation, it is a snapshot: correcting `starts_on` later will not move existing expiry dates. This is intentional.
- **Not authorized:** applying any migration, Test or Main writes, deploying the signing endpoint, configuring CORS on Adam's behalf, signed-in QA, merge or publication.

## 2026-11-24 — CORS origins, R5/R6 settled and the P1 SQL proposal delivered

- **CORS origins (Adam):** `https://citylink-vm2mka3y.manus.space` for production, plus `http://localhost:5173` and `http://localhost:3000` for development. Preview URLs change on every deployment and must not be added to the allowlist.
- **R5:** five months confirmed; the four-month statement is superseded by the abolished version-history rule and is not a live rule.
- **R6:** replacement is limited to the uploader of the current version; the leader may delete but must never silently overwrite. Both rules are implemented in the P1 SQL.
- **P1 delivered (draft, not applied):** `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` contains three tables, the `private.can_access_group_files` active-only predicate, retention derivation, quota helpers and six RPCs; `server/stage6GroupFilesSqlContract.test.ts` adds nine static contract tests that run without a database.
- **Verification at this head:** `corepack pnpm check` exit 0; `corepack pnpm exec vitest run` 42 files / 666 tests passed. These are static and unit results only: they do not establish RLS behaviour, real R2 object behaviour, concurrency or retention at runtime.
- **Known open point for Role 6:** the leader check in `delete_group_file` uses `study_groups.creator_id`. If leadership can be transferred under the Stage 5 authority/succession model, this must use the corresponding helper instead. This is flagged in the SQL itself.
- **Not authorized by this record:** applying the migration, deploying the signing endpoint, Test or Main writes, signed-in QA, merge or publication. Test application needs Adam's authorization naming the exact SQL blob.

## 2026-11-24 — R2 is storage only; the 8 GiB cap is application-level

- **Separation of services:** the Cloudflare R2 token (`citylink-chat-r2-dev`) and bucket `citylink-group-files` are object storage only. OpenRouter's BYOK feature routes AI model calls and is unrelated to R2. Neither service can be used to configure the other.
- **R2 has no hard storage cutoff.** Cloudflare's own limits page lists "Data storage per bucket: Unlimited"; exceeding the free tier produces billable overage rather than blocking writes. Nothing in R2 will stop an upload when a quota is reached.
- **Therefore the 8 GiB cap is enforced by CityLink, not by Cloudflare.** `request_group_file_upload` and `replace_group_file` refuse to issue an upload before the presigned URL exists, returning `group_files_storage_limit_reached`. Any path that bypasses these RPCs — for example a leaked R2 token used directly against the S3 API — is not limited by anything. This is why the token stays server-side, remains bucket-scoped, and should be rotated if exposure is suspected.
- **Cost controls:** an OpenRouter key can carry a spend limit on the OpenRouter side; R2 cannot be capped the same way, so cost protection there is limited to billing notifications and keeping the token out of client code.

## 2026-11-24 — Fact check: the group leader is `study_groups.creator_id`

- **Question raised by Adam:** whether the leader equals `creator_id`. Adam expected no. The checked-in SQL says otherwise.
- **Evidence:** `20261114163512_20261114162301_stage5_group_authority_and_succession.sql` defines `private.reconcile_group_leader_after_membership_end`, which transfers leadership by running `update public.study_groups set creator_id = v_successor_id`. There is no `leader_id` column anywhere in the migrations. `public.review_group_join_request` performs its leader check as `v_creator_id is distinct from v_actor`, i.e. `creator_id`.
- **Conclusion:** leadership is real and transferable, but it is stored in `creator_id` and reassigned on succession (earliest remaining active member, per the approved tie order). `creator_id = auth.uid()` is therefore the correct current-leader test, not an approximation, and no separate helper exists to call.
- **Effect on P1:** `delete_group_file` was already correct. Its caveat comment was replaced with the verified statement, and a regression test now asserts the SQL uses `creator_id` and never references a `leader_id` column.
- **Still not authorized:** applying the migration, deployment, Test or Main writes.

## 2026-11-24 — Role 6's P1 review: no blockers, three fixes applied

- **Verdict:** Role 6 found no blocking defects in the P1 migration draft and confirmed that the four design blockers (R1-R4) were absorbed. He also independently confirmed the leader conclusion: `creator_id` is the current-leader pointer because succession rewrites it, and a null `creator_id` fails closed.
- **Applied before applying:** A-1 length checks on `declared_mime`, `detected_mime` and `content_hash`; A-2 records `mime_mismatch` instead of silently accepting a mismatch; A-3 wraps the file in `begin;`/`commit;`.
- **Applied beyond his list:** a unique partial index on `replaces_file_id` for pending rows, so two concurrent replacements cannot both become current. This is a table-structure change and needs his confirmation on whether it requires re-review.
- **Deferred with reasons:** pagination for `list_group_files` moves to P3 with the UI; the `group_analysis_jobs` index moves to P4; the orphan-object debt from group deletion is recorded as known.
- **Operational dependency recorded:** `academic_terms.code` is only length-constrained, so a future term naming outside `YYYY-Fall`/`YYYY-Spring` would make every upload in that term fail closed. Adding a term naming convention requires updating the retention helper at the same time.
- **R5 already closed:** the five-month retention is recorded in this file; Role 6's question about the earlier four-month wording is answered by the superseded note.
- **Not authorized:** applying the migration, deployment, Test or Main writes.

## 2026-11-24 — Retention period restated so it is findable (Role 6 N-2)

- **Decision (Adam, 2026-11-23, restated 2026-11-24):** group-file retention is **five calendar months** from the term start — the Fall term starts 1 September and the Spring term starts 10 January, expiring at 23:59:59 `Asia/Hong_Kong`. The earlier four-month figure was tied to the version-history rule that Adam abolished and is superseded; it must not be revived.
- **Why recorded twice:** Role 6's final confirmation could not find the retention decision by searching `retention`/`保留`/`month` in this file, because it had only been written into `docs/stage6/` working documents. Retrieval failure cost a review round, so the number now lives in the decision ledger itself.

## 2026-11-24 — **VOID — grants nothing**: Kayk P1 preflight run against the frozen Prototype, migration NOT applied

> **Corrected the same day (target error).** These reads were run against `wkzclgmhrtecnpexfesr`, which since Adam's F14 decision (2026-11-23 01:50) is the **frozen Prototype**, explicitly out of scope and refused by the capacity gate with `group_capacity_gate_target_out_of_scope` (45003). The authorized apply target is CityLink Launch `pijslbchvstkoweslymr`, the project the capacity documents call "Main". Nothing in the entry below was written anywhere — no DDL, no DML, no grant change, no migration record — but its conclusions describe the Prototype's schema lineage, helper ownership, migration ledger and default privileges, and therefore **cannot be reused for Launch**. Kept, not deleted, because the measurements are accurate about the project they were taken from.

- **Authorization VOID — grants nothing.** Adam's 2026-11-24 wording named `wkzclgmhrtecnpexfesr` because the then-current instruction mapping called that ref Test; the register `docs/team/DB_TARGETS.md` and the F14 entry below (line 427 area, merged from main) show it is the frozen Prototype. So the grant is void on its face: the ref is out of scope, the preflight it was conditioned on is void, and no write of any kind happened. The original wording is preserved verbatim after this bullet as history.
  - **Original wording, kept as history (not a live grant):** `Test wkzclgmhrtecnpexfesr`, apply `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` at head `cfdcd2f`, three read-only preflights first. Blob at that head verified as SHA-256 `b762bb2737bc2ef9930226becdbb50404b624784a628c316fabe28ed6c9bf50a`, bit-identical to the version Role 6 pinned.
- **Three preflights, all clean:** no `group_files`/`group_analysis_plans`/`group_analysis_jobs` tables and no `%group_file%` functions exist in `public` or `private`; the only term row is `2026-Fall` and it matches `^[0-9]{4}-(Fall|Spring)$` (`starts_on` is NULL, which is what the `derived` retention basis exists for, and 15 groups use it); `study_groups.term_id` is NOT NULL with 0 NULL and 0 dangling references.
- **Additional read found a real defect (K-1):** Test's `pg_default_acl` shows `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` granting relations, functions and sequences to `anon`, `authenticated` **and `service_role`**, and `service_role` has `rolbypassrls = true`. Because the proposal revokes only from `public, anon, authenticated`, applying it as `postgres` leaves `service_role` with EXECUTE on all nine functions and full rights on all three tables — contradicting the file's own section-4 comment. Neither local harness could show this: Role 6 measured `service_role = f` on a plain PostgreSQL with no default ACLs.
- **Reproduced, not inferred:** `docs/stage6/scripts/KAYK_P1_DEFAULT_PRIVILEGE_PROBE.sql` mirrors Test's measured default privileges on a disposable PostgreSQL 17.12 cluster and applies the blob as `postgres`. Before the amendment, `service_role` held effective privileges on the 3 tables and on the 6 functions the default ACL reached — measured on Launch 2026-11-24, whose `postgres`-owned default privileges are scoped to schemas `public` and `storage` and therefore do not reach the three `private` helpers. After naming `service_role` in all twelve revokes the effective result is none, on all 9 functions and all 3 tables. The earlier 9/9 in this entry came from the local probe, which modelled default privileges in both `public` and `private`; that figure described the probe, not Launch, and is superseded by the measurement above.
- **Consequence:** the blob was amended to SHA-256 `82d6870b283c4e67bb25cbcd2dfe5cb5007bedce5f6931a0d2679a80f3f87a38`, so **Adam's authorization no longer matches what is on the branch and nothing was written to Test.** A new authorization naming the new blob, plus Role 6's re-check of the revoke change, are required before any apply.
- **Still open after any apply:** the seven live behaviour checks, including that a removed member loses access immediately. The `supabase_migrations.schema_migrations` ledger in Test holds 7 versions, the latest being `20261118082247` / `stage6_people_page_naming`, so Test trails the checked-in migration set; nothing in this blob references the absent ones. That ledger row is also where a future apply would be recorded.
- **Not exercised:** no write of any kind to Test or Main, no deployment, no merge, no publication.

## 2026-11-24 — R2 bucket CORS verified without credentials

- Adam supplied the three allowlisted origins and this task confirmed them by unsigned `OPTIONS` preflight against the bucket endpoint, which needs no key: `http://localhost:5173`, `http://localhost:3000` and `https://citylink-vm2mka3y.manus.space` each return `204 No Content` with `Access-Control-Allow-Origin` echoed and `Access-Control-Allow-Methods: GET, PUT, HEAD`; 5173 additionally received `Access-Control-Allow-Headers: content-type` and `Access-Control-Max-Age: 3600`.
- Two negative controls - a foreign origin and a non-allowlisted `*.manus.space` preview host - return `403 Forbidden` with no CORS headers, so the configuration is an exact-origin list rather than a wildcard, which is the behaviour the design requires for Preview URLs.
- The R2 Account ID remains referenced only as `R2_ACCOUNT_ID` and is deliberately not written into the repository.

## 2026-11-24 — Database target register, and the F14 mapping recorded where people search

- **Recorded, not decided:** this entry transcribes Adam's F14 decision of 2026-11-23 01:50, which had no entry in this log. Nothing here is a new approval or a new authorization.
- **The mapping:** `pijslbchvstkoweslymr` is **CityLink Launch** — the only authorised target, currently read-only until release; a write requires Adam's explicit written authorization recorded in this file. `wkzclgmhrtecnpexfesr` is **CityLink Prototype (do not migrate)** — frozen since F14 and refused by the capacity gate with `45003 group_capacity_gate_target_out_of_scope`.
- **What actually changed on 2026-11-23:** the refs never changed; writability did. Any earlier text calling `wkzclgmhrtecnpexfesr` "disposable Test" is a writability claim that became false at 01:50. In anything older than this entry, read "Test" as Prototype and "Main" as Launch.
- **Why this entry exists:** on 2026-11-24 between roughly 03:27 and 03:50 a continuity task concluded that a reviewed migration should be applied to `wkzclgmhrtecnpexfesr`, having read the pre-F14 mapping from `PROJECT_INSTRUCTIONS.md`. **No write occurred** — the task stopped for an unrelated reason, and the lead caught the target error. This log had 24 entries and not one mentioned the switch, so the correct answer was not discoverable by searching here.
- **Register:** `docs/team/DB_TARGETS.md`, which states that it overrides any conflicting text elsewhere. Corrected on the same date: the two shared-file mappings, `TODO.md`, and the Stage 6 proposal header. The applied migration `20261118050000_stage6_chat_recruitment.sql` is deliberately left unedited and is recorded as historical in the register.

## 2026-11-24 — Kayk P1 apply gate: points at the F14 record, restated only as a pointer

- **Not a second F14 record.** Adam's F14 decision of 2026-11-23 01:50 is recorded once, in the entry immediately above, which arrived from `origin/main` via PR #62; the register is `docs/team/DB_TARGETS.md`, which states that it overrides conflicting text elsewhere. An earlier version of this file carried a second, differently worded F14 entry written by this task; it has been deleted so one decision has one text.
- **Correction to what this task wrote earlier:** the claim that `PROJECT_INSTRUCTIONS.md` "still describes `wkzclgmhrtecnpexfesr` as the disposable Test database" was true only of the pre-F14 wording and is now outdated. That file carries its own dated 2026-11-24 correction block at lines 37-43 which supersedes the mapping; its original two paragraphs are retained below it as history, not as instruction.
- **Gating sequence for any Kayk P1 apply, in order, each gate independent and none assumable from a previous run:** (1) a fresh Role 6 exact-head review of the current blob — the `service_role` amendment at `6ca76ab` and the comment-only correction at `375eece` have no reviewer, so "two rounds passed" cannot be carried forward; (2) Adam's written authorization recorded in this file naming ref `pijslbchvstkoweslymr`, the commit head and the blob path; (3) three read-only preflights plus a `pg_default_acl` read against Launch, immediately before applying; (4) the apply; (5) live QA of the seven behaviour checks, the removed-member-loses-access case first.
- **Mechanism that survives the void measurement:** a Supabase project whose `pg_default_acl` grants `service_role` on new objects keeps that grant unless a revoke names it, and migrations run as `postgres`. Whether Launch carries those defaults has **not** been read; every revoke names `service_role` so the migration is correct either way.
- **Not authorized, not done:** any write to Launch, any write to the Prototype, deployment, publication, merge, GitHub visibility change, and any further preflight against `wkzclgmhrtecnpexfesr`.

## 2026-11-24 — P1 now carries a fail-closed target assertion; the blob moved again

- **Requested by:** the coordinator's dispatch of 2026-11-24, which Adam approved as a
  follow-up to the three PR #59 corrections. Scope was the guard and comments only: no
  business statement, function signature, grant or RLS setting was touched. The diff is
  purely additive - 175 lines inserted, none removed.
- **What was missing:** the capacity line refuses a wrong ref through
  `private.citylink_capacity_apply_gate()` (tokens at SQLSTATE 45001-45009), but of the
  eleven migration files only `20261119085000_capacity_apply_gate.sql` carried such a
  check. Kayk's P1 is a standalone migration with no equivalent, which is the mechanism
  behind the 2026-11-24 incident rather than a wording problem.
- **The guard:** section 0, a `do $kayk_p1_target$` block placed **inside** the file's own
  `begin;` transaction and before the first DDL. Two layers, three refusal tokens, each its
  own SQLSTATE so a log line says which line of work refused, deliberately not 45003:
  `kayk_p1_prerequisite_missing` (45K01, not a CityLink database),
  `kayk_p1_target_evidence_unreadable` (45K02, the catalog could not be consulted, which is
  a refusal not a pass), and `kayk_p1_target_out_of_scope` (45K03, readable and the Launch
  markers are absent).
- **No operator input is trusted.** There is no `current_setting()`, GUC or psql variable in
  the block; it reads `pg_catalog.pg_proc`, `pg_catalog.pg_attribute` and `to_regclass()` /
  `to_regprocedure()` only, and the expected values are compiled into the reviewed file. A
  guard that asked the applier to declare the ref would have passed on 2026-11-24, because
  the applier was confident.
- **The objective basis is capacity-era structure:** the column `public.study_groups.max_members`,
  the table `private.group_removal_context` and the three `_capacity` read functions in
  `public`, all created by `supabase/migrations/20261119090000_group_hard_max.sql`, which this
  file records at "Launch capacity application" as applied to CityLink Launch at 08:38:53Z on
  2026-11-23. The same record shows Launch's ledger moving from 7 rows to 11, while the
  2026-11-24 read of `wkzclgmhrtecnpexfesr` found 7 rows ending at `20261118082247`: the
  Prototype never received that file and after F14 must not, so the markers are absent there.
  Nothing on this branch drops them.
- **Stated limits, because the guard proves history and not identity:** a point-in-time
  restore or branch clone made from Launch after 2026-11-23 08:48Z carries the same three
  markers and would pass, and so would a project where someone recreates them by hand.
  `current_database()` cannot help - it is `postgres` on every Supabase project, as the gate
  file already records. The next hardening step is to pin
  `pg_control_system().system_identifier` against a value captured by one authorized read of
  Launch and archived here; until then the block prints the observed identifier as a NOTICE
  for the record and treats it as telemetry with no authority.
- **Measured, not assumed, on the disposable local PostgreSQL 17.12 harness:** an empty
  database returned 45K01 naming the five absent objects; the pre-capacity stub shape - the
  Prototype's shape - returned 45K03 reporting `capacity_functions=0 max_members=f`, and the
  three P1 tables were absent afterwards; the same careless invocation without
  `ON_ERROR_STOP` failed 36 later statements with `25P02 current transaction is aborted` and
  still created nothing; with the markers present the run emitted
  `kayk_p1_target_verified` and applied, twice. Tests:
  `server/stage6GroupFilesMigrationApplies.test.ts` covers all four paths against a fixture
  (`server/fixtures/groupFilesLaunchMarkersFixture.sql`), and
  `server/stage6GroupFilesSqlContract.test.ts` pins the token-to-SQLSTATE pairing, the
  placement after `begin;` and before the first DDL, the absence of `current_setting` and of
  grant/revoke inside the guard.
- **Consequence for the review chain:** this is a SQL body change, so the blob moved from
  `f67f18b280469003b6fe18cd9d7a1a672674466b51298f33b12df71bc13507f3` to `3c4986275d077aff72185f8bccc302225fa86a2505113e8919cf89cdef5d036b` (723 lines, was 548) and **no reviewer has seen it**. The
  comment-only F14 relabel at `375eece` left the statements identical; this one adds a real
  block, so the earlier proof that the stripped hash was unchanged no longer applies. Role 6
  owes an exact-head review of this blob before any apply, and any written apply authorization
  must name the new hash.
- **Not authorized, not done:** applying anything to Launch or the Prototype, any Supabase
  connection, deployment, publication, merge of PR #59, GitHub visibility change, and any
  change to `PROJECT_INSTRUCTIONS.md` or the shared project folder.

## 2026-11-24 — Authorization: first Launch write window — target marker, then Kayk P1 (guarded blob)

- **Authorized by Adam, 2026-11-24, option (a).** One authorization covers two artifacts in a
  fixed order, in the same window. Nothing else may be applied in this window.
- **Step 1 — the target marker.** Create `private.citylink_target` and
  `private.assert_citylink_target(text)` with the single row
  `project_ref = 'pijslbchvstkoweslymr'`, `system_identifier = '7692131729119822239'`, then call
  the assertion once. From the next migration onward, every migration calls
  `private.assert_citylink_target('pijslbchvstkoweslymr')` before its first statement.
- **Step 2 — the P1 migration, guarded blob.** Apply
  `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` at commit head
  `813cc8246651044d6142f4c0cc559582921d72a5`, blob
  `c4e29aa57522bfd78ab52edaa5819d2509d0888f`, SHA-256
  `3c4986275d077aff72185f8bccc302225fa86a2505113e8919cf89cdef5d036b`, 723 lines. This blob
  carries the fail-closed target assertion (Section 0, SQLSTATE 45K01/45K02/45K03) that Role 6
  reviewed on 2026-11-24. The 548-line body it wraps is byte-identical to the `baa08e65` blob
  reviewed earlier, so that review carries over unchanged.
- **Preconditions measured read-only on Launch, 2026-11-24:** all six prerequisite objects and
  all three capacity-era markers the guard tests are present (`max_members`,
  `private.group_removal_context`, 3 `*_capacity` functions); `private` schema present with 27
  functions; no name collision for the three helpers, three tables or six RPCs;
  `study_groups(creator_id, status, term_id)` and `academic_terms(code, starts_on)` present;
  11 migrations applied, latest `20261119090000`; `postgres`-owned default ACL grantees in
  schema `public` are exactly `anon, authenticated, postgres, service_role` — no fifth role.
- **Baseline cluster identity, for a future amendment:** `pg_control_system().system_identifier`
  measured as `7692131729119822239`. Recorded, not enforced: a hard comparison would refuse a
  legitimate restore or branch.
- **Read-only status.** Launch is recorded as read-only until release. This entry lifts that
  hold **only for step 1 and step 2 in this window**, and for nothing else.
- **Independent QA.** The seven behaviour checks are owned by Eunice (CityLink — Independent QA
  and Documentation), not by the applying task. Where they run is a separate decision because
  they are writes.
- **Not authorized by this entry:** any write to `wkzclgmhrtecnpexfesr`, any other Launch write,
  merge, deployment, publication, GitHub visibility change, or any QA write beyond what a
  separate decision permits.
