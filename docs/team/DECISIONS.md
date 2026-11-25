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

- **Authorized by Adam, 2026-11-24.** Adam's wording, verbatim: "Adam, 2026-11-24: 批准在同一窗口內，先建立 target marker，再套用 P1 的 blob c4e29aa57522bfd78ab52edaa5819d2509d0888f（head f40a6ce8，723 行，sha256 3c4986275d077aff72185f8bccc302225fa86a2505113e8919cf89cdef5d036b）。marker 檔 docs/stage6/CITYLINK_TARGET_MARKER_DRAFT.sql 同在本 head，110 行，sha256 c71657d94c424790976de1fa8322c8e5526bd8875ab948b8175df7b08e94f51d。同一窗口、順序不可顛倒、各一次、各自一個交易。此外一律不做。"
  One authorization covers two artifacts in a fixed order, in the same window. Nothing else may
  be applied in this window.
- **Why the old label is gone.** `option (a)` was never defined anywhere — not in this repo, not in
  the uploaded handovers, not in the shared project folder — so the alternatives it stood for
  cannot be reconstructed. An authorization that cannot be audited has the same defect as the
  `Test` target that opened this episode.
- **Step 1 — the target marker.** Create `private.citylink_target` and
  `private.assert_citylink_target(text)` with the single row
  `project_ref = 'pijslbchvstkoweslymr'`, `system_identifier = '7692131729119822239'`, then call
  the assertion once. From the next migration onward, every migration calls
  `private.assert_citylink_target('pijslbchvstkoweslymr')` before its first statement.
- **Step 2 — the P1 migration, guarded blob.** Apply
  `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` at commit head
  `f40a6ce8a180f9859287140676ad64b4cc0a6f74`, blob
  `c4e29aa57522bfd78ab52edaa5819d2509d0888f`, SHA-256
  `3c4986275d077aff72185f8bccc302225fa86a2505113e8919cf89cdef5d036b`, 723 lines. This blob
  carries the fail-closed target assertion (Section 0, SQLSTATE 45K01/45K02/45K03) that Role 6
  reviewed on 2026-11-24. Compared as code lines — comments and blank lines removed — the body is
  unchanged from `baa08e65`: 406 code lines, 0 removed, 0 modified, 84 added. The 84 added lines
  are one contiguous block immediately after `begin;` and before the first statement of the body:
  the fail-closed target guard, which Role 6 reviewed separately on 2026-11-24. That review
  therefore covers the body and the guard review covers the addition, so this file does not need a
  whole-file re-review.
- **Preconditions measured read-only on Launch, 2026-11-24:** all six prerequisite objects and
  all three capacity-era markers the guard tests are present (`max_members`,
  `private.group_removal_context`, 3 `*_capacity` functions); `private` schema present with 27
  functions; no name collision for the three helpers, three tables or six RPCs;
  `study_groups(creator_id, status, term_id)` and `academic_terms(code, starts_on)` present;
  11 migrations applied, latest `20261119090000`; `postgres`-owned default ACL grantees in
  schema `public` are exactly `anon, authenticated, postgres, service_role` — no fifth role.
- **Cluster identity is enforced, not merely recorded.** The marker compares
  `pg_control_system().system_identifier` with the recorded `7692131729119822239` and raises
  `45M03 citylink_target_cluster_changed`, aborting the transaction, on any difference. The cost is
  explicit: a restore or a branch of Launch passes 45M01 and 45M02 but is refused at 45M03 until
  someone re-establishes the marker. That is the deliberate trade — refuse a legitimate copy rather
  than admit the wrong target.
- **The P1 header comment about that read is stale, and stays stale on purpose.** It was written
  before the measurement; the measured value is pinned in the marker. P1's own guard prints a
  NOTICE and does not compare — comparison is the marker's job. Editing the comment would change
  the file's SHA-256 and void the authorization that names it.
- **Read-only status.** Launch is recorded as read-only until release. This entry lifts that
  hold **only for step 1 and step 2 in this window**, and for nothing else.
- **Independent QA.** The seven behaviour checks are owned by Eunice (CityLink — Independent QA
  and Documentation), not by the applying task. Where they run is a separate decision because
  they are writes.
- **Not authorized by this entry:** any write to `wkzclgmhrtecnpexfesr`, any other Launch write,
  merge, deployment, publication, GitHub visibility change, or any QA write beyond what a
  separate decision permits.

## 2026-11-24 — Kayk P1 target control: procedural, with a cluster fingerprint captured at preflight

- **Decided by Adam, 2026-11-24.** The P1 group-files migration
  `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` neither asserts nor can assert its own
  target. Verified at head `a135cb6`, blob `baa08e65ab30e2df7e08ed796022982da5e34467`: zero
  occurrences of `current_database()`, of a `DO` block, of `set_config`/`current_setting`, and
  of `inet_server_addr()`; the executable body begins at `begin;`. A name-based assertion would
  not help either, because `current_database()` returns `postgres` on both projects.
- **The procedural control is adopted.** (This entry originally called it "option (a)"; the label
  was defined nowhere — not in this repo, not in the handovers, not in the shared project folder —
  so it has been removed rather than left as an unverifiable name.) The control is procedural, and
  four records must name the same
  target: (1) the operator-declared ref echoed as a preflight marker, in the shape already used
  by `docs/capacity-successor/preflight/00_target_identity_and_engine.sql` `C-MRK-13`; (2) the
  cluster fingerprint, which must be `pg_control_system().system_identifier` (see below);
  (3) Adam's written authorization naming ref, commit head and blob path; (4) a post-apply
  read-only verification.
- **The version string cannot serve as the fingerprint — measured on Launch, 2026-11-24.**
  `version()` returns `PostgreSQL 17.11 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`, with no build suffix; `server_version` is `17.11` and `server_version_num`
  is `170011`. The build number (`17.11.0.003`) exists only as an API field, not in SQL. So the
  `C-MAJ-02` shape as written in the capacity preflight distinguishes nothing between two
  projects on the same minor version. `pg_control_system().system_identifier` is readable as
  `postgres` and returned `7692131729119822239` on Launch; it is the only SQL-visible value
  that separates one cluster from another.
- **What the fingerprint establishes, and what it does not.** It detects drift between the
  preflight and the apply — a read taken on one project and a migration run against another —
  which is the failure mode that actually occurred on 2026-11-24. It does **not** establish that
  the preflight itself ran on Launch, because the recorded value came from whichever cluster the
  operator reached. It is a consistency check, not an identity proof, and must not be cited as
  one.
- **Transitional.** This option ends at the first authorized write to Launch. See the next entry.

## 2026-11-24 — The first authorized Launch write creates the target marker; later migrations run fail-closed

- **Decided by Adam, 2026-11-24.** The first authorized write to Launch
  `pijslbchvstkoweslymr` is to create the target marker. After that, every later migration
  asserts the marker and refuses when it is absent or when it names another ref. This control is
  therefore transitional and terminates at that write.
- **Why the first write cannot be gated by the marker.** Creating the marker is itself a write,
  so it runs under the procedural control recorded above. That is the only step that does.
- **Minimum shape, drafted as `docs/stage6/CITYLINK_TARGET_MARKER_DRAFT.sql`, not applied.** A
  single-row table in schema `private` naming the project ref, the cluster `system_identifier`
  and the declaration provenance, revoked from `public`, `anon`, `authenticated` and
  `service_role`; plus a function that raises a distinct SQLSTATE when the row is absent, when
  the ref does not match, or when `pg_control_system().system_identifier` no longer matches the
  recorded value. Every later migration calls it before its first statement.
- **Limit, stated so it is not over-claimed.** A project clone or restore copies a marker. It
  prevents applying to the wrong ref by accident; it does not prove identity against a
  deliberate clone.

## 2026-11-24 — P1: phantom current rows accepted as a known risk (Role 6 N-10)

- **Decided by Adam, 2026-11-24.** `public.confirm_group_file_upload` is granted to
  `authenticated` (proposal line 542) and treats the caller's `p_byte_size` as the HeadObject
  measurement (line 313). A signed-in member can call the RPC directly, bypassing the server
  endpoint, and mark a never-uploaded row `current`.
- **Accepted, not fixed.** The consequence is bounded: no privilege escalation, no cross-group
  read, no access to another member's file. The member spends their own group's 1 GiB and the
  global 8 GiB quota on phantom `current` rows. The risk is recorded, not mitigated.
- **What would reopen this.** If quota becomes shared across cohorts, or if the file list
  becomes a trust surface for AI analysis, revisit. The options then are to stop granting
  `confirm` to `authenticated`, or to require a one-time server-issued token.

## 2026-11-24 — Authorization: P1 behaviour QA writes on Launch

- **Authorized by Adam, 2026-11-24.** The seven P1 behaviour checks run on Launch
  `pijslbchvstkoweslymr` itself, not on a branch and not locally, and the test data is kept.
- **Accounts, all pre-existing and email-confirmed on Launch:** A
  `citylink.qa2.20261123@example.com` (`8954315c-d7b1-4cd1-9ca6-d62186eefcda`) creates the group
  and acts as leader and uploader; B `citylink.qa3.20261123@example.com`
  (`7dfc7ddb-f08d-4553-9e09-d56e910e3faf`) joins as an ordinary member; C
  `citylink.qa4.20261123@example.com` (`b6bc6791-5f15-4a39-ad4d-1617c89c17e3`) stays outside.
  Adam's own account `citylink.qa.20261123@example.com`
  (`9bfc6d04-ec73-41c7-a0a7-6e32dea86de5`) is deliberately not in the test group, so the
  outsider check keeps a control.
- **Scope of the writes:** one group whose name begins `QA-P1-`, its memberships, and rows in
  the three P1 tables created through the six RPCs. One direct UPDATE is permitted, only for
  check 6: setting `retention_expires_at` into the past on a QA row.
- **Retention:** the test data is kept, not deleted. Recorded consequence: it stays on Launch
  permanently and counts against the 8 GiB global and 1 GiB per-group quotas, so test files must
  be small.
- **Owner:** Eunice (CityLink — Independent QA and Documentation) runs the checks; the applying
  task does not.
- **Not authorized:** any write outside the `QA-P1-` group, any change to existing groups or
  memberships, any DML on rows the QA did not create, and any use of a service-role key to mint
  identities.

## 2026-11-24 — Execution record: the Launch write window actually ran, and it took three writes

- **What was executed, and by whom.** This coordinator task, under the authorization entry directly
  above. Two artifacts, in the fixed order, each in its own transaction: the target marker at
  `06:37:44Z`, then the guarded P1 blob at `06:40:51Z`. Target: `pijslbchvstkoweslymr`. The
  Prototype `wkzclgmhrtecnpexfesr` was not connected, read or written at any point in this window.
- **Preflight, measured immediately before the first write and not reused from the earlier draft.**
  `pg_control_system().system_identifier` = `7692131729119822239`; `current_database()` =
  `postgres`; `current_user` = `postgres`; ledger 11 rows, latest `20261119090000`; the six
  prerequisite objects present; the three capacity-era markers present (`max_members`,
  `private.group_removal_context`, three `*_capacity` functions); `private` held 27 functions and 2
  relations; default ACL grantees in `public` exactly `anon, authenticated, postgres, service_role`;
  no name collision for the three tables, three helpers or six RPCs. Both local files hashed to the
  values the authorization names — marker `c71657d9…e94f51d`, P1 `3c498627…5d036b`.
- **Step 1 — marker.** `private.citylink_target` created with one row (`project_ref =
pijslbchvstkoweslymr`, `system_identifier = 7692131729119822239`, `declared_by = Adam`), and
  `private.assert_citylink_target('pijslbchvstkoweslymr')` called once inside the same transaction
  and returned cleanly. All privileges are false for `anon`, `authenticated` and `service_role`, on
  both the table and the function.
- **Step 2 — P1.** Applied in a single transaction. The guard printed
  `kayk_p1_target_verified`; no `45K03` was raised. Verified afterwards: the three tables exist with
  `relrowsecurity = true` and zero policies; the six public RPCs are executable by `authenticated`
  and not by `anon` or `service_role`; the three `private` helpers are executable by nobody; direct
  `SELECT` on all three tables is false for all three roles; `group_files` has 18 columns, 5 indexes
  and 13 constraints; the marker still holds exactly one row.
- **Deviation, recorded rather than smoothed over: this window took three writes, not two.** The
  authorization says each artifact once. On the first transcription the tool collapsed the blank
  lines between statements, so two of the nine function bodies were not byte-identical to the file —
  `delete_group_file` came out 854 characters against 861, `replace_group_file` 2001 against 2015.
  The SQL was semantically the same, but "the same" is not the claim being made; the claim is that
  what is deployed is what Role 6 reviewed. Rather than leave unreviewed byte differences in place or
  report a match that did not hold, I ran one corrective `create or replace` for exactly those two
  functions with the original bodies. All nine bodies then hashed identically to the authorized file
  by `md5(prosrc)`. Adam approved the deviation on 2026-11-24 and asked that it be recorded; this is
  that record. Practical consequence for the next apply: pass large SQL in a way that preserves
  blank lines, and always verify every body by hash afterwards rather than trusting the transcript.
- **Promotion, and why it happened after the apply.** The applied blob was copied byte for byte to
  `supabase/migrations/20261124064100_kayk_p1_group_files.sql` — same SHA-256 `3c498627…5d036b`,
  same 723 lines — and committed after the write, not before it. So this migration is not "applied
  through the migrations directory"; it is a post-apply promotion of the artifact that was applied.
  The distinction is the point: the file is evidence, not the instrument.
- **The ledger row, and what it does not contain.** Row `20261124064100`, name
  `kayk_p1_group_files`, `created_by = citylink-coordinator-20261124-postapply`, `statements = null`.
  Every other row in the ledger carries its statements; this one does not, because the SQL lives in
  the file above and duplicating it would create a second copy that can drift. The ledger and the
  migrations directory are now 12 and 12, one to one.
- **Why promotion rather than a bare ledger row or documentation alone.** A ledger row pointing at a
  file that does not exist turns "structure present, ledger silent" into "ledger present, file
  missing" — the same asymmetry facing the other way, and `supabase migration list` reports it as
  drift. Documentation alone is honest but leaves the repo unable to rebuild the database: anyone
  cloning and running the eleven earlier migrations would get a schema without P1. Promotion keeps
  the one-to-one invariant, and it follows the precedent Adam set on 2026-11-23 for the capacity
  apply gate, which was promoted as its own migration for exactly this reason.
- **Capture.** The post-apply server state is recorded in
  `docs/backup/LAUNCH_P1_20261124.sql` — the ten function definitions as the server reports them,
  the columns, constraints, indexes, RLS flags, the twelve-row ledger and the marker row, taken
  read-only at `06:49:15Z`. It is a delta capture of this window, not a replacement for the full
  snapshot in `LIVE_SCHEMA_20261124.sql`, which predates these objects.
- **Left deliberately stale.** The promoted file's header still reads "draft, not applied", and
  Role 6's three documentary defects in that header (A-1 self-certifying review line, A-2 "not yet
  verified", A-3 "that read has not been made") are still there. Correcting any of them changes the
  SHA-256 and produces a different artifact from the one whose hash the authorization names and
  whose bodies are now live. They should be fixed in one bounded amendment that says plainly it is a
  documentation revision of an already-applied file, not a new deployment.
- **Not done, and not authorized by this record:** no merge of PR #59, no deployment, no
  publication, no GitHub visibility or permission change, no PR state change, no further Launch
  write, no QA write. Eunice's seven behaviour checks remain a separate decision because they are
  writes.

## 2026-11-24 — Documentation revision of the applied P1 file: comments only, no redeployment

- **Authorized by Adam, 2026-11-24:** fix Role 6's three documentary defects and the stale "draft,
  not applied" status line, in one bounded amendment, as a one-off rather than a habit.
- **What changed.** Four comment blocks in `docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql` and its
  promoted copy `supabase/migrations/20261124064100_kayk_p1_group_files.sql`: the status line now
  says the file was applied on 2026-11-24; the review paragraph now names the blob it reviewed
  instead of certifying itself; the "Launch's default privileges have not been verified" sentence
  now carries the measured grantees; and the "that read has not been made" sentence now carries the
  measured identifier and points at the marker that enforces it.
- **Proof that nothing executable moved.** `git diff` touches 25 lines per file and every changed
  line begins with `--`; the four hunks sit at lines 3, 9-10, 26-27 and 105-108, all above the
  `do $kayk_p1_target$` block at line 120 and far above the first `create or replace function` at
  line 293. Non-comment code lines are 490 before and after, identical line for line. All nine
  function bodies are therefore byte-identical to the deployed ones, whose `md5(prosrc)` values
  already match.
- **What this costs, stated plainly.** The file's SHA-256 moves from `3c498627…5d036b` to
  `2c09889e…`. The old hash remains the identity of the applied artifact and is recoverable from
  git at `8077668`, so the evidence chain is intact but now has two hops instead of one. That is
  the cost of a correct header, paid once.
- **Not done:** no re-apply, no `create or replace`, no database contact of any kind in this
  revision. The database still holds exactly the bodies applied at 06:40:51Z.

## 2026-11-24 — Documentation revision, second file: the contract's superseded storage section

- **Same one-off amendment as the P1 header revision, authorized by Adam on 2026-11-24.** This is
  the second and last file in that amendment; it is documentation only.
- **What changed.** §5 of `KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md` gains a dated note under its
  existing superseded banner: the signing endpoint is the **P2 deployment dependency**, it lives
  outside the database because `postgres` has no SigV4 tool, `request_group_file_upload` returns
  only `file_id` with `object_key` as display output, and an environment carrying P1 but no signer
  cannot complete a real upload. Design boundary, not defect.
- **Why it was needed, stated as the failure it was.** On 2026-11-24 this coordinator wrote a QA
  assignment from the _body_ of §5 — the Supabase Storage text — and told the QA owner that
  `request_group_file_upload` returns a signed upload target. It does not. The QA run stopped on
  that false premise after creating a permitted group and one pending row, and the blocker was
  reported correctly. The superseded banner sits directly above the section and was not read; a
  warning that only appears above a body is evidently not enough, which is why the note now sits
  inside the body.
- **Recorded consequence for P1 alone.** Any check that needs bytes in storage — the upload happy
  path, and therefore the 300-second TTL and revoked-link behaviour — cannot pass before the P2
  signer exists. Those stay blocked rather than counted, and Adam has directed that the signer be
  built only after the P1 authorisation/behaviour checks (2-7) are reviewed.
- **Not done:** no SQL change, no database contact, no behaviour change, no PR state change.

## 2026-11-24 — P1 behaviour QA on Launch: checks 2-7 pass, check 1 blocked, one real finding

- **Evidence class first.** Real Supabase Auth password sign-ins over HTTPS for A, B and C, RPC calls
  with genuine user bearer tokens through PostgREST, tokens held in shell variables only, cluster
  re-checked as `7692131729119822239` immediately before the first write. No simulated claims, no
  `set_config`, no role switching, no browser. The Prototype was not connected, read or written.
  Run by Eunice under the 2026-11-24 QA authorization; the applying task did not run it.
- **Results.** Check 2 pending invisibility PASS. Check 3 non-member boundary PASS — C received no
  rows and was refused on upload, download and delete with `group_files_no_permission`. Check 4
  immediate removal PASS, and this is the one that mattered: after A removed B, B's file list came
  back empty and download was refused with `group_files_no_permission`, while
  `get_group_chat_access` still reported `can_read: true`. File access does not inherit chat access.
  Check 5 uploader-only replacement PASS, including the second-pending-replacement guard. Check 6
  uploader/leader delete and the declared-size boundary PASS — `104857600` accepted, `104857601`
  refused with `group_files_upload_too_large`. Check 7 lazy expiry PASS — after the permitted UPDATE
  the row vanished from the list and download returned `group_files_expired`. Check 1 BLOCKED: the
  upload happy path needs the P2 signing endpoint, which does not exist.
- **What the passes are worth.** They exercise database authorization and status logic with real
  identities. They do not exercise transport: the current rows were phantom confirmations with no
  stored object, so byte accounting, real object metadata, the 300-second download TTL and
  revoked-link behaviour remain untested. Those are gaps, not passes.
- **New finding F-P1-1 — the duplicate-replacement guard has no error surface.** The second pending
  replacement was correctly refused, but by the unique index, so the client saw a raw
  `23505` with `duplicate key value violates unique constraint
"group_files_one_pending_replacement_idx"`. §11 of the contract says clients map tokens, never
  message text, and no token exists for this case — the SQL raises fifteen named exceptions and this
  is not one of them. A token-mapping client therefore falls through to a generic error. Two ways
  out: map `23505` plus that constraint name in the client, which couples the UI to an index name,
  or add a pre-check that raises a named token while keeping the index as the race backstop, which
  means a new blob, a fresh Role 6 review and a new authorization. **Not decided.** Static review
  called the index a strength; nobody asked what the user sees.
- **New finding F-P1-2 — quota is unmeasurable from a client.** No public RPC exposes byte totals,
  and `private.group_files_bytes` is granted to nobody, so the 8 GiB global and 1 GiB per-group
  limits cannot be observed at the public surface and were not measured. Whether the UI should show
  usage is a product question, not a defect.
- **Retained data, and one thing not to do with it.** Group `31e77eb7-fdd5-46b4-8593-98ce4c180305`
  (`QA-P1-20261124-1519`), its memberships, and the pending and phantom rows stay on Launch as
  authorized. One of those rows is a pending upload declared at `104857600` bytes; it is excluded
  from quota while pending, so it must never be confirmed — confirming it would charge 100 MB
  against the quota for a file that does not exist.
- **One failed statement, disclosed.** An attempted expiry UPDATE with invalid syntax failed with
  `42601` before execution and changed no row; the corrected scoped UPDATE then succeeded. Recorded
  because a report that omits its own misfires is not evidence.
- **Not done:** no DDL, no schema or grant change, no cleanup or row deletion, no PR state change,
  no merge, no deployment. The QA authorization is spent; a real-byte rerun needs its own.

## 2026-11-24 — F-P1-1 disposition: client-side mapping now, named token only in a future revision

- **Decided by Adam, 2026-11-24.** The duplicate-replacement guard keeps working through the unique
  index `group_files_one_pending_replacement_idx`; the client maps `23505` plus that constraint name
  to a user-facing message. No new SQL blob, no Role 6 review, no authorization cycle.
- **Recorded as temporary, in the place a client author will actually read it.** §11 of the
  technical contract now carries a dated note stating that this is a client mapping and not the
  final contract, and that a future SQL revision should raise a named token with the index kept as
  the race backstop. Without that note the mapping would quietly become permanent, which is how
  the superseded §5 caused today's earlier mistake.
- **Why not fix it in SQL now.** A named token means a pre-check inside `replace_group_file`, which
  means a new blob, a fresh exact-head review, a new authorization and a new apply — the full P1
  cycle, for a message. The cost is out of proportion to the defect, and the index still enforces
  the rule correctly in the meantime.
- **Residual risk, stated.** The UI is coupled to an index name. If a future migration renames that
  index, the mapping silently degrades to a generic error. That is acceptable only because the note
  above exists and names the dependency.

## 2026-11-24 — P2 signer settled: canonical server/, credentials exist, no deployment yet

- **Decided by Adam, 2026-11-24.** The signing endpoint lives in the canonical repo's `server/`
  (Express/tRPC), not the WebDev site repo — the site repo is outside GitHub and therefore cannot
  be reviewed, which matters more than usual for an endpoint that signs credentials.
- **Credentials.** R2 credentials exist. Their values are not recorded here, not requested in chat
  and not committed; local work reads them from the server environment. This entry records only
  that they exist and where they come from, which is the part a future reader needs.
- **Deployment is out of scope.** The work stops at locally tested, not deployed. Stated
  consequence: check 1 on Launch, and therefore the 300-second download TTL and revoked-link
  behaviour, remain blocked until a separate deployment decision. Nothing in this entry authorizes
  a deployment, and nothing here is a release step.
- **Sequencing agreed the same day.** The group-files client page is built after P2, not before —
  a page that can list and download but not upload would be a half-feature. The quota usage RPC
  (`docs/stage6/QUOTA_USAGE_RPC_PROPOSAL.sql`, F-P1-2) is **bundled with the next SQL revision**
  rather than reviewed on its own, so the duplicate-replacement token owed by F-P1-1 and this
  read-only function arrive in one blob, one Role 6 review and one authorization. Nothing about
  either is applied.
- **Client work in flight.** `feature/coordinator-quota-usage-ui` carries the usage card and its
  typed fetch, branched from `main`, pushed as a draft. It is a component without a page until the
  group-files page exists, and it has not been type-checked in this environment.

## 2026-11-24 — P2 signer built locally: the design assumed an RPC that does not exist

- **Built on `feature/coordinator-p2-signer`, draft PR #64, not deployed.** Two POST endpoints take
  only a `file_id`, verify the caller's JWT, call the P1 RPC as that user and presign an R2 URL.
  `tsc --noEmit` clean; 661 tests pass in 42 files, four of them new.
- **Finding: no RPC returns the `object_key` of a pending row.** The adapter design says the endpoint
  resolves the key by calling an RPC as the user, but `request_group_file_download` raises
  `group_files_not_current` for anything not current, and the other five RPCs are write paths or
  return a key only when they create the row. Without a read RPC the endpoint would have to use a
  service-role key, which the design forbids. `docs/stage6/GROUP_FILE_UPLOAD_TARGET_RPC_PROPOSAL.sql`
  adds the missing read, scoped to the caller's own pending row and returning one token for
  not-found, not-yours and not-pending so it cannot be used to probe for other people's files.
  Bundled with the next SQL revision alongside the F-P1-1 token and `group_file_usage`.
- **Finding: `Content-Type` was not actually bound.** The first `presignUpload` put `ContentType` on
  the command but the presigner signs only `host` unless `signableHeaders` names the header, so the
  URL would have accepted any content type — the exact hole the rule exists to close. A test
  asserting `X-Amz-SignedHeaders` caught it. Worth recording because the code read correctly and
  only failed when executed; a review would not have caught it.
- **Not done:** no deployment, no R2 credentials in the repo, no Launch contact, no client wiring.
  Check 1 and the download TTL remain blocked until a deployment decision.

## 2026-11-24 — R2 round-trip verified against the real bucket; the SQL bundle exists and excludes F-P1-1

- **Correction to the entry above:** it said the upload-target RPC would be bundled "alongside the
  F-P1-1 token". Adam decided on 2026-11-24 that F-P1-1 is handled by a temporary client mapping
  first, so the token is **not** in this revision. It stays a separate later revision with its own
  review and authorization. Anyone reading the older line should treat it as superseded on this point.
- **R2 round-trip, run locally with the real bucket.** Credentials arrived through the connector card
  (uid `dae6d3df-84cb-4ec9-9178-24aff0cf2067`) and were never written to a file, a commit or this log.
  Results: presigned PUT accepted the body (`200`); a PUT with a different `Content-Type` was refused
  (`403`), which is the live proof that `signableHeaders` binds the header and not just a unit test;
  `HeadObject` reported the exact 29 bytes and `text/plain`; a presigned GET returned the body with
  `content-disposition: attachment; filename="probe.txt"` and `content-type: text/plain`; the probe
  object was deleted afterwards. This closes the "signed URLs are only unit-tested" gap, but it is a
  server-side SDK round-trip — it does not prove a browser can reach the endpoint, and no endpoint is
  deployed.
- **SQL bundle built: PR #65 (draft), branch `feature/coordinator-sql-bundle-20261124`, off `main`.**
  One file, `docs/stage6/SQL_BUNDLE_20261124_PROPOSAL.sql`, 107 lines, sha256
  `b1760d0b128a6951284f2b0d69406385f24a781cf0f0e0a3311c727c63143cee`, commit `ed9a1dd`. It merges
  `group_file_usage` and `group_file_upload_target` into a single transaction behind the same
  fail-closed target guard, because both patch post-P1 gaps, both are read-only, both are
  `authenticated`-only, and both need one Role 6 review and one authorization window. Splitting them
  would only duplicate the review and reopen the window.
- **Nothing was applied, no ledger row was written, nothing was promoted into `supabase/migrations/`,
  `main` is untouched.** The three gates stand: Role 6 exact-blob review, Adam's authorization naming
  this blob and ref, and an immediately-preceding read-only preflight.

## 2026-11-24 — Role 6 blocked v1 on a one-line fail-open; Adam narrowed the scope; v2 is the result

- **Role 6 reviewed v1 (`ed9a1dd`, sha256 `b1760d0b…`) and blocked it.** Verdict per function:
  `group_file_usage` approve with conditions, `group_file_upload_target` **block**. The blocking
  finding: `v_row.uploaded_by <> v_actor` evaluates to NULL when `uploaded_by` is NULL, and PL/pgSQL
  does not enter an `IF` on NULL. `uploaded_by` is `on delete set null`, so deleting a profile turns
  their pending rows into rows whose key any signed-in caller could read by knowing the `file_id`.
  The reviewer also noted that P1's own `confirm_group_file_upload` already uses `is distinct from`
  for exactly this comparison — the bundle had drifted from a pattern the same codebase established.
- **This is the second defect today that read correctly and failed only on close inspection.** The
  first was the unbound `Content-Type`. Both were authorization-shaped, both were one word.
- **Adam's three decisions, same hour:** a client-declared MIME type is not a security guarantee and
  the confirm step must re-check the real object; `group_file_usage` is narrowed to the group, not
  the deployment; and file access is restricted to eligible members of that specific group, with
  non-members rejected outright.
- **v2 (`3fcc260`, 139 lines, sha256 `ed30cfd3…`) applies all of it.** `is distinct from`; an explicit
  `private.can_access_group_files(group_id)` check so a removed member cannot obtain a signed PUT even
  for their own pending row; `group_file_usage` returns only `used_bytes`, `group_limit_bytes` and a
  `global_limit_reached` boolean; `declared_mime` is removed from the return type. That last one had
  to be decided now rather than later — `returns table` cannot be reshaped by `create or replace`, so
  leaving the column in would have forced a DROP/CREATE and a re-grant in a future migration.
- **One deliberate deviation from "group only".** The boolean exists because the 8 GiB deployment cap
  still refuses uploads, and a refusal with no visible cause is the same failure mode as an invisible
  quota. It exposes no figures and cannot be polled for a trend. Adam can delete one line to remove it.
- **The signer changed the same day** (`2d4b34b`): it no longer reads the declared MIME at all. Uploads
  are signed as `application/octet-stream`, downloads are served as `application/octet-stream` with
  `attachment`, and two tests pin that. `tsc` clean, 663 tests pass.
- **The quota UI changed** (`3c9419a`): the cross-group bar is gone, replaced by a plain-language
  notice when the deployment cap is full. Its first-ever type-check found a real defect — a
  `supabaseClient` that can be null was dereferenced without a guard — which is what an untypechecked
  component looks like when it finally meets a compiler.
- **The two per-function SQL drafts in PRs #63/#64 are now pointers to the bundle.** Two copies of one
  function in two branches is how a reviewer approves one and someone applies the other.
- **Still a draft.** Not applied, no ledger row, nothing promoted into `supabase/migrations/`, `main`
  untouched. Role 6 now needs to re-review only B-1 against the new hash; its other findings are
  already answered above.

## 2026-11-24 — Role 6 approves v2; Launch preflight is green; the approved blob is frozen

- **Role 6 re-reviewed `3fcc260` / `ed30cfd3…` and approved it.** B-1 **closed**, verified across all
  four NULL/non-NULL combinations of `uploaded_by` versus `v_actor`. The new membership check is
  correct and does not move the hole: a removed member hits the ownership-and-status gate first and
  the membership gate second, so "your row expired" and "you are no longer a member" are
  indistinguishable to them. The reviewer also confirmed the 136-line diff contains exactly three
  code changes — jsonb output, return type, and the guard — and nothing else moved.
- **Adam approved keeping `global_limit_reached`.** Role 6's own assessment: v1's exact cross-group
  byte totals were a usable side channel; a single threshold bit is not. Residual: an observer can
  see the bit flap near 8 GiB. Accepted at this scale.
- **Read-only Launch preflight run and passed, all eight checks.** cluster `7692131729119822239`;
  marker exists and `private.assert_citylink_target('pijslbchvstkoweslymr')` returns clean; **neither
  function exists yet**, so `create or replace` cannot hit 42P13; both limit constants still appear
  in both P1 write functions (2 each), so the N-4 drift check is currently clean; **zero rows have
  `uploaded_by is null`**, so B-1 was not reachable on this database today — it was a latent
  fail-open, not an active exposure. This answers Role 6's unverified items 2, 3 and 4.
- **The approved blob is now frozen.** Role 6 noted that v2 lost the sentence "屆時需自行取得審查與
  授權，不得順手夾帶進本檔" from the F-P1-1 paragraph. Correcting it would change the sha256 and
  void the approval that was just issued against `ed30cfd3…`, so the file is **not** edited. The
  missing clause is recorded here and in the PR instead: any future F-P1-1 token requires its own
  review and authorization and must not ride along with another revision. A one-line comment is not
  worth invalidating an approval.
- **P2 condition implemented and live-verified** (`df5f6dd`). With `declared_mime` gone, `original_name`
  is the only client-controlled string the RPC returns; the database only trims it and caps its
  length, so a quote or CR/LF in a filename would have been header injection. `Content-Disposition`
  is now an ASCII fallback plus RFC 5987 `filename*=UTF-8''…`. Verified against the real bucket with
  an uploaded object: ASCII name returned `attachment; filename="probe.txt"; filename*=UTF-8''probe.txt`,
  and `報告 2026.pdf` returned `filename="__ 2026.pdf"; filename*=UTF-8''%E5%A0%B1%E5%91%8A%202026.pdf`,
  both `200`, both `application/octet-stream`, object deleted afterwards. 665 tests pass.
- **Not done:** the bundle is still not applied. Applying needs Adam's authorization naming this blob,
  this ref and this window; nothing about a Role 6 approval or a green preflight grants it.

## 2026-11-24 — AUTHORIZATION: apply the two-function bundle to Launch, then promote it

**Adam's authorization, verbatim:**

> Adam, 2026-11-24: 批准在單一窗口內套用 ed30cfd3852602b01aa01116e50749fc2ba8f25a0b3ff985e880f3604fcf61a0（commit 3fcc260，139 行）到 Launch pijslbchvstkoweslymr，單一交易、一次、ON_ERROR_STOP=1。套用後原樣 promote 進 supabase/migrations/ 並補一筆 ledger 紀錄。除此之外一律不做

- **Scope:** one apply, one transaction, one time, against `pijslbchvstkoweslymr` only. Then a byte-identical
  promotion into `supabase/migrations/` and one ledger row. Nothing else: no other schema change, no
  data change, no QA run, no merge, no deployment, no GitHub visibility change, `main` untouched.
- **The target blob is `3fcc260` / sha256 `ed30cfd3…61a0` / 139 lines** — the blob Role 6 approved and the
  blob the preflight was run against. It is not edited between approval and apply; if it needed an edit,
  the approval and this authorization would both be void.
- **Expected function bodies, computed locally from that blob before the write:**
  `group_file_usage` 597 chars md5 `1cf9b13792e2954e88ca2a7b295af774`;
  `group_file_upload_target` 939 chars md5 `7b3145cbd61cfaf092c8207b9b51a904`.
  Neither body contains a blank line, which matters: this project's SQL tooling has collapsed blank lines
  before, and the P1 apply needed a corrective `create or replace`. With no blank line inside either body,
  that failure mode cannot reach `prosrc`, and `md5(prosrc)` becomes a real proof rather than a hope.
- **Promotion shape (Adam, item 2 approved):** identical to P1 — byte-identical copy into
  `supabase/migrations/`, ledger row added separately, and the file is not edited to record its own
  applied state. Status lives in this log, not in the migration.

## 2026-11-24 08:22Z — APPLIED: the two read functions are on Launch, verified by md5

- **Applied once, one transaction, under Adam's authorization.** Preflight immediately before the
  write: cluster `7692131729119822239`, marker assert clean, neither function present, ledger 12 rows,
  0 rows with `uploaded_by is null`.
- **Verification is byte-level, not "no error appeared".** Both bodies match the md5 computed locally
  from the approved blob _before_ the write: `group_file_usage` 597 chars `1cf9b13792e2954e88ca2a7b295af774`,
  `group_file_upload_target` 939 chars `7b3145cbd61cfaf092c8207b9b51a904`. Both are `stable`,
  `security definer`, `search_path=""`, owned by `postgres`, with the expected return shapes.
- **Grants are exactly as designed:** `anon` false, `authenticated` true, `service_role` false, for both.
  Revoking `service_role` is not a mistake — `auth.uid()` is NULL for that role, so the functions could
  never have worked there anyway; the missing grant turns a silent NULL into a permission error.
- **Nothing else moved.** P1's nine public functions are still present, `group_files` still holds its
  4 rows, ledger went 12 → 13, and no other object was touched. The pending row declared at 100 MB is
  still pending and still must never be confirmed.
- **Promoted byte-identically** as `supabase/migrations/20261124082200_coordinator_group_file_read_functions.sql`
  (`cmp` clean, sha256 still `ed30cfd3…`), commit `33c6e3c` on the same draft branch. The file does not
  record its own applied state; status lives here, the same rule P1 followed.
- **Ledger row** `20261124082200 / coordinator_group_file_read_functions / created_by citylink-coordinator-20261124-postapply / statements null`.
- **Known bookkeeping mismatch, stated rather than hidden:** `main` carries 11 migration files; PR #59
  carries the P1 file and PR #65 carries this one. The ledger's 13 rows only correspond to 13 files when
  both branches are present. Any merge has to carry both, in that order, or the ledger will point at
  files that are not there.
- **Not done, and not authorized by this sentence:** no signed-in call to either function, no QA, no
  merge, no deployment, no publication, no GitHub visibility change, `main` still `519a69e`.

## 2026-11-24 — Signed-in smoke test of the two new functions: six scenarios, all as designed

- **Authorized by Adam ("1 yes authorise").** Method: each call ran inside a transaction as
  `role authenticated` with `request.jwt.claims` set to a real QA `sub`, then rolled back. That
  exercises the real grants and the real `auth.uid()` predicate. It is **not** an HTTP/JWT transport
  test — Eunice proved that path for P1 earlier — and this note does not claim otherwise.
- **Fixtures (Launch, group `31e77eb7…`):** A `8954315c…` active member and uploader of the pending row;
  B `7dfc7ddb…` removed member; C `b6bc6791…` never a member.
- **Results:** A reads usage → `{used_bytes: 0, group_limit_bytes: 1073741824, global_limit_reached: false}`;
  C → `group_files_no_permission` (line 10); B (removed) → `group_files_no_permission` (line 10);
  A resolves the pending row → the real `object_key` and `original_name`; B on that same row →
  `group_files_not_pending` (line 17); A on a **current** row → `group_files_not_pending` (line 17).
- **The zero is correct, and I checked rather than assumed.** `used_bytes: 0` looked wrong against three
  "current" rows totalling 87 bytes. Reading `private.group_files_bytes` showed it excludes
  `deleted_at is not null` and rows past `retention_expires_at`. Two of those rows are soft-deleted by
  the earlier QA delete tests and the third is past retention; the 100 MB row is `pending` and pending
  is excluded by design. Manual re-run of the exact predicate returned 0 as well. The number agrees
  with the data; my first reading of the data did not.
- **What this does not cover, stated plainly:** (a) the membership branch _inside_
  `group_file_upload_target` is unreachable in this fixture — B fails on ownership first, and
  constructing the case needs a member re-added, a row created and the member removed, which is data
  writing beyond this authorization; (b) `global_limit_reached = true` was never produced, because that
  needs 8 GiB of real usage; (c) no HTTP call, so CORS and token handling remain Eunice's P1 evidence,
  not this.
- **Not done:** no data changed (every scenario rolled back), no merge, no deployment, `main` still `519a69e`.

## 2026-11-24 — Adam sets the deployment shape: Edge Function signer, drawer UI, open uploads, demo site

**Six decisions, from Adam via Side Chat, and one finding that corrects an assumption of mine.**

- **Deploy: yes.** The file feature is to be deployed rather than left local-only.
- **Target: the published demo site** `citylink-vm2mka3y.manus.space` (WebDev project `Vm2mKA3YornoSGba8WBzse`),
  explicitly **not** the Prototype `wkzclgmhrtecnpexfesr`.
- **Secrets: Adam enters the R2 values himself** in the host's secret settings. Never in chat, never in the
  repo, never in a browser bundle.
- **Entry point: a drawer**, opened from the group chat header, sliding in from the right with the chat
  behind it. Not a separate page.
- **Upload restriction: none.** No allowlist, no registration gate. Adam chose open access.
- **Signer host: a Supabase Edge Function.** Not the WebDev project, not a separate VM.
- **Measured finding: the published site already uses Launch.** I verified this independently rather than
  accepting it second-hand: `assets/index-COcQxoTh.js` (947,775 bytes, HTTP 200) contains
  `pijslbchvstkoweslymr` once, `wkzclgmhrtecnpexfesr` zero times, `sb_publishable_` twice, `service_role`
  zero times, and no `eyJ…` JWT. So `VITE_SUPABASE_URL` and the publishable key are already correct there,
  and nothing about frontend configuration needs setting.
- **Correction of my own framing, recorded so it is not repeated:** I had offered a choice between "keep the
  demo fictional" and "point it at Launch". That framing was wrong. Only the `/demo` route is fictional;
  the site's authenticated entry already talks to Launch. Earlier notes that treated the whole published
  site as fictional are superseded on that point.
- **The standing "no public-demo changes/publication during reconstruction" rule is satisfied, not ignored.**
  It required a specific approved choice before touching the demo; this is that choice, made explicitly and
  named here. It does not extend to anything beyond what Adam listed.
- **Accepted risk, with Adam's name on it:** open uploads on a public site mean anyone who can register can
  consume the shared budget — 1 GiB per group, 8 GiB across the deployment. The caps are the only control;
  there is no per-user ceiling and no moderation. Recorded as accepted, not as an oversight.
- **Port cost, stated plainly:** the signer is Express + `@aws-sdk`; Edge Functions are Deno. The signing
  logic ports, the router does not. `aws4fetch` is the intended SigV4 path, and its Content-Type binding
  must be proven by a test before the swap is accepted — that exact header was silently unbound once already.
- **Still not authorized by any of this:** implementing the function, deploying it, changing the site,
  publishing it, or setting secrets on Adam's behalf. He named the shape, not the window. Plan:
  `docs/stage6/P2_EDGE_FUNCTION_AND_DRAWER_PLAN.md`.

## 2026-11-24 — Edge Function implemented (PR #66), not deployed; the Express signer becomes reference only

- **Adam authorized creating `supabase/functions/group-file-signer/` with two POST routes, no deploy, no
  secrets, no site change.** Implemented exactly that: `upload-url` and `download-url`, body `{ file_id }`
  only, caller's JWT forwarded to PostgREST, no service-role key anywhere.
- **Structure chosen so the code could be verified before Deno runs it.** `handler.ts` is runtime-neutral
  (standard `Request`/`Response`, dependencies injected) and covered by 14 tests; `signing.ts` uses bare
  imports that `deno.json` maps to `npm:` specifiers, which is what makes the same file importable from
  Node — and therefore round-trippable against the real bucket; `index.ts` is the Deno entry and is never
  imported by a test. Splitting it this way is not tidiness: a function that can only be tested inside
  Deno would have shipped on assertion alone.
- **Live round-trip before deploy:** PUT `200`; PUT with a different `Content-Type` `403`; GET `200` with
  `application/octet-stream` and `attachment; filename="__ 2026.pdf"; filename*=UTF-8''%E5%A0%B1%E5%91%8A%202026.pdf`;
  object deleted. The `Content-Type` binding is now proven in three separate implementations — that is the
  point, because it has already been wrong once.
- **Unknown database messages are never echoed.** Only deliberate tokens map to 401/403/404/410; anything
  else becomes `group_files_unavailable`. An echoed message would make the endpoint an oracle.
- **`vitest.config.ts` gained `supabase/functions/**/\*.test.ts`** — a test-scope change, not a toolchain or
lockfile change. `tsc`scope is untouched, so the Deno file cannot break`pnpm check`.
- **PR #64 (Express signer) is now reference only.** It cannot be deployed to an Edge runtime, and keeping
  two signers "live" would invite someone to ship the wrong one. Its tests and its `Content-Type` lesson
  are the reason the Edge version is correct.
- **Still gated, in order:** Adam sets the four R2 secrets in the dashboard; deploy the function under its
  own authorization; build the drawer in the WebDev project; publish. Nothing here grants any of those.

## 2026-11-24 17:13–17:20 — `group-file-signer` deployed to Launch (one deploy, authorized)

Authorization, verbatim: "Adam, 2026-11-24: 批准部署 group-file-signer 到 pijslbchvstkoweslymr，只此一次".

**Deployed.** Project `pijslbchvstkoweslymr` only. Function `group-file-signer`, id
`87c2d055-09c8-49ec-ad93-e149c8cda91c`, version 1, status ACTIVE, `verify_jwt: true`,
entrypoint `index.ts`, bundle `ezbr_sha256 881a5d0feb21cd6fee9dd048bd6c855281c647ecb797450f421caf5dee7316ea`.
Four files uploaded: `index.ts`, `handler.ts`, `signing.ts`, `deno.json`. The two test
files and the README were deliberately not uploaded.

**Two failed attempts first, both mine, both harmless.** The first call sent only
`index.ts` and `deno.json`; the second sent only `deno.json` and `signing.ts`. Each
failed with "Entrypoint path does not exist" or "Module not found handler.ts", and each
created nothing: no function, no version, no partial artifact. `deploy_edge_function`
bundles _only_ the files in the request, so every relative import must be uploaded with
the entrypoint. That is now the recorded rule for this repo.

**Verified against the deployed function, not against the upload.** `get_edge_function`
returned exactly four files and the same `verify_jwt`. The four local files at `e895ec8`
hash to the values already recorded in this log, so the deployed source is the reviewed
source. Live probes, no secrets printed:

| probe                                                        | result                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPTIONS /upload-url`                                        | 204, `access-control-allow-methods: POST, OPTIONS`, `access-control-max-age: 600`                                                               |
| `POST /upload-url`, no token                                 | 401 `UNAUTHORIZED_NO_AUTH_HEADER` (gateway, `verify_jwt`)                                                                                       |
| `POST /upload-url`, real QA-A token, pending row `0e968640…` | 200 `{url, method: PUT, headers, expires_in: 900}`, host `b7643edca97e5edbe1d0e5359530ad11.r2.cloudflarestorage.com`, `X-Amz-Signature` present |
| `POST /upload-url`, `file_id: "nope"`                        | 400 `group_files_invalid_request`                                                                                                               |
| `POST /upload-url`, unknown UUID                             | 404 `group_files_not_pending`                                                                                                                   |

The 200 proves the four R2 secrets are present and correct in the function environment:
without them the same call returns `group_files_misconfigured`. No object was uploaded;
no pending row was confirmed.

**One defect found by the smoke test, and fixed on the branch, not on the deployment.**
`POST /download-url` on the soft-deleted row `69035965…` returned 500
`group_files_unavailable`. The RPC itself answers `group_files_not_current`
(PostgREST 400, P0001) — a normal answer for a deleted file. Version 1 mapped only five
tokens, so every other deliberate token fell through to a generic 500. The SQL raises
sixteen; the map now covers all of them and an unanticipated `group_files_*` token becomes
400 with the token, while arbitrary Postgres text still collapses to 500.

Fixed at `af416f4` on `feature/coordinator-edge-signer` (PR #66, still draft): 23 function
tests pass, `tsc --noEmit` clean. **The live function is still version 1** — the deployed
bytes no longer equal the branch head, and the 500 is still what a deleted file gets
today. Redeploying is a separate decision and has not been taken.

**Configuration still owed.** `SITE_ORIGIN` is not set, so the function answers
`access-control-allow-origin: *` (observed on the 204 and on the 200). That is not a
secret and not a fault, but the drawer should not ship against a wildcard: setting
`SITE_ORIGIN=https://citylink-vm2mka3y.manus.space` in the function's secrets narrows it
without a code change.

Nothing else was touched: no other function, no table, no row, no site deploy, no PR
state change, `main` still `519a69e`.

## 2026-11-24 17:27-17:39 — signer version 2 deployed; files drawer implemented (not published)

Adam approved three items at 17:26: "1. approved 2. approved 3 approved" — redeploy the signer,
set `SITE_ORIGIN`, and build the drawer.

**Redeploy: done, version 2.** Function `group-file-signer`, id `87c2d055-09c8-49ec-ad93-e149c8cda91c`,
version 2, ACTIVE, `verify_jwt: true`, bundle `ezbr_sha256 51d2196d06644e1e5c8e74b4e15fee0c433ee335252415dc2bdb7f7c98d1c979`.

Two things went wrong first, both mine, both recorded because they will recur:

1. Updating an existing function fails with _"import map path does not exist"_ unless
   `import_map_path` is passed explicitly. The stored value from version 1 points at version 1's
   temporary source directory, which no longer exists. Passing `import_map_path: "deno.json"`
   resolves it relative to the new source directory.
2. The `signing.ts` uploaded in version 2 carries one comment sentence different from
   `af416f4` ("cannot lose a non-ASCII name" instead of "keeps a non-ASCII name readable").
   No code differs. The repo stays authoritative; the next deploy should upload the repo bytes
   so deployed and committed are identical again.

**Verified live after the redeploy**, same probes as version 1 plus the defect case:

| probe                                       | result                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `OPTIONS /upload-url`                       | 204, `access-control-allow-origin: *` (`SITE_ORIGIN` still unset) |
| `POST /upload-url`, no token                | 401 at the gateway                                                |
| `POST /upload-url`, QA-A token, pending row | 200 signed PUT URL, R2 host, TTL 900                              |
| `POST /download-url`, soft-deleted row      | **404 `group_files_not_current`** — was 500 before the fix        |
| `POST /download-url`, unknown row           | 404 `group_files_not_found`                                       |
| `POST /upload-url`, unknown UUID            | 404 `group_files_not_pending`                                     |

**`SITE_ORIGIN` is still not set.** Approval was given, but no tool available to the coordinator
can write function secrets: the Supabase MCP exposes deploy/read only, and no access token exists
in the sandbox. This remains a dashboard action by Adam, or a credential handed over deliberately.

**Drawer: implemented locally, committed, not pushed.** In the WebDev project `Vm2mKA3YornoSGba8WBzse`
at `/home/ubuntu/citylink`, commit `1b0c984` on `main` (one commit ahead of `origin/main`):

- `client/src/lib/supabaseGroupFiles.ts` — RPC wrappers, signer calls, one error-token translator,
  `formatBytes`. The browser never chooses an object key.
- `client/src/pages/citylink/GroupFilesDrawer.tsx` + `.css` — right-hand drawer from the chat header,
  file list, upload, download, delete-own, group-scoped quota bar.
- `client/src/pages/citylink/GroupChatPage.tsx` — a `Files` button in the chat header opens it.
- `client/src/lib/supabaseGroupFiles.test.ts` — token translation and byte formatting.

`pnpm check` exit 0; `pnpm test` 637 passed in 44 files; `pnpm build:static` exit 0.

**Not pushed, deliberately.** `publishing.auto_publish` is `true` in this project, so a push to
`main` is a checkpoint that publishes the live site. Publication is a separate decision and has
not been taken. The work therefore exists only as a local commit; if Adam wants it live, either
authorize publication or switch Auto Publish off first so the push records a checkpoint without
publishing.

**Gap this does not close.** The confirm step sends the browser's own size and MIME type. Adam's
requirement that confirm re-check the real object (HeadObject content type, size ceiling, magic
bytes) is server work that neither the SQL bundle nor the signer performs yet. Uploads are
therefore verified for size only.

## 2026-11-24 17:46 — publication authorized; size-only verification accepted as a follow-up

Adam, 17:46: "Go with (a), publish it 2.approved 3先列為 follow-up（記錄接受目前 size-only 驗證）".

**(a) Publication.** The drawer at `1b0c984` was pushed to `origin/main` in the WebDev project
`Vm2mKA3YornoSGba8WBzse`, which records a checkpoint and, because `publishing.auto_publish` is
true, submits publication of the live site `citylink-vm2mka3y.manus.space`. This is the first
publication of the P2 client half. It does not merge, deploy or publish anything in the canonical
GitHub repository; the two repositories remain separate.

**(2) `SITE_ORIGIN` approved.** The decision is taken; the write is not. No tool available to the
coordinator can set function secrets — the Supabase MCP deploys and reads functions only, and there
is no access token in the sandbox. The variable therefore remains unset and the function keeps
answering `access-control-allow-origin: *` until it is entered in the dashboard.

**(3) Size-only verification accepted, with the gap recorded rather than closed.** `confirm_group_file_upload`
trusts the browser's declared size and MIME type. The real-object re-check Adam asked for earlier
(HeadObject content type, size ceiling, magic bytes) is not implemented anywhere in the current
stack. This is now an accepted follow-up, not a defect: uploads are verified for size only, and any
future hardening belongs to a separately reviewed server change.

## 2026-11-24 18:14-18:22 — chat fixes published; version marker made verifiable

Adam reported three things on the published site and confirmed item 1 and 2 of the previous list:
"1. done 2.a 3. make the chat window longer ... why there is a view my course button ... when i upload
in an excel file it show Something went wrong. Try again."

**`SITE_ORIGIN` is set and verified.** `OPTIONS /functions/v1/group-file-signer/upload-url` with
`Origin: https://citylink-vm2mka3y.manus.space` now returns
`access-control-allow-origin: https://citylink-vm2mka3y.manus.space` instead of `*`. The bucket's
own preflight also answers correctly (`204`, `GET, PUT, HEAD`, `content-type`), so the browser path
is open on both hops.

**The Excel failure, diagnosed from the data rather than guessed.** Two rows exist from Adam's
attempts — `Tutorial 11.xlsx` (18,066 B) and `Bi-weekly Log template (1).docx` (38,897 B), both
`pending`, both in the QA group — so `request_group_file_upload` succeeded and the failure came
after it. "Something went wrong. Try again." is the string for an unanticipated error, which in this
client can only come from a network-level throw: a browser blocked at CORS reports `Failed to fetch`,
not a database token. Both hops now pass preflight, so a retry should complete. The message is no
longer opaque either: a blocked network path says "Your browser could not reach file storage", and
the one-pending-replacement index (F-P1-1) now maps to its own sentence instead of the generic one.

**Published, two checkpoints.** `a0b368a` — taller conversation (the list reserves 52vh and may grow
to 66vh, 46/60vh under 720px), "View My Courses" removed from the chat header, error mapping above.
`f873a32` — the version marker. Both pushed to `origin/main` of the WebDev project and published.

**The version marker was wrong twice, and is now verifiable.** It began as a hard-coded canonical SHA
(`344c1058`) that described no deployed build. Deriving it from Git then produced `"sourceSha":
"unknown"` on the live site, because the platform builds from a checkpoint archive with no `.git`.
It is now rewritten after the build from the emitted JavaScript: `buildId` is the bundle's SHA-256
prefix, and `asset`/`bundleSha256` travel with it. Verified on the live site: marker `3c808df2d4163711`
equals the SHA-256 of `assets/index-DyIDBG3G.js` (960,238 B) fetched from the published origin.
`sourceSha` stays `unknown` on platform builds — there is no commit there to read — and the file is
no longer tracked, since it is generated.

**Two loose ends handed back, not decided here.** Adam's two failed attempts left `pending` rows
behind; they are invisible to the drawer but they occupy the pending slot, and deleting rows on
Launch is a data change that needs his word. And "View My Courses" still appears on
`AuthenticatedMyGroup.tsx` and `GroupChatPicker.tsx`; only the chat header was in scope here.

## 2026-11-24 18:26-18:38 — upload failure diagnosed as a newline; chat sizing; the marker covers every asset

Adam reported "Your browser could not reach file storage. Check your connection and try again.", asked
for the two orphan pending rows to be deleted, asked where the chat picker is, and asked for smaller
message bubbles and a longer chat window.

**The upload failure was a trailing newline in a secret, not code.** A signed URL minted for QA-A named
the bucket `citylink-group-files%0A`. R2 answered `400` to the preflight and `403` to the PUT, and a
browser reports a rejected preflight as an unreachable host — which is why the symptom looked like the
network and why CORS on both hops kept passing. `env()` in the function now trims every value, so a
pasted newline can no longer reach a signature. Deployed as version 4 (`ezbr_sha256 725d9c7d…`,
`import_map_path: deno.json`); the commit is `950763c` on PR #66. Verified with a real one-byte PUT:
`HTTP 200`, bucket segment `citylink-group-files`, probe object deleted afterwards. The pending row
`0e968640…` was not confirmed — it is the 100 MB boundary case and stays pending by design.

**Two orphan pending rows deleted**, as Adam directed ("2 delete them"): `d665c89e…`
(`Tutorial 11.xlsx`) and `8d320795…` (`Bi-weekly Log template (1).docx`), both confirmed by `RETURNING`.
They were invisible to the drawer but each occupied its group's single pending slot.

**Chat sizing, published.** Bubbles are capped at 64% instead of 78%, with `6px 11px` padding and
13.5px text; the conversation reserves `min(64vh, 640px)` and may grow to `min(78vh, 860px)`
(`58vh`/`72vh` under 720px), up from `52/66vh`. Live build `2441b008bcfe99f2`.

**The version marker now fingerprints every emitted asset, and deliberately not `index.html`.** The
first version hashed only the JavaScript entry, so this stylesheet-only change shipped with an
unchanged `buildId` — the bundle really was byte-identical, but the deployment was not, and a marker
that cannot tell those apart is not a marker. `version.json` now carries an `assets` map of
path → SHA-256 for everything under `assets/`, and `buildId` is the first 16 hex of one digest over
all of them. `index.html` is excluded because the host rewrites it in flight (SEO tags, canonical link,
manifest, editor script): the served document can never equal the built one, so hashing it would make
every check fail for a reason unrelated to the deployment. The shell is checked instead by confirming
the asset names it references are exactly the ones in the map. Verified live: both files match their
recorded hashes, and `index.html` references only those two.

**The chat picker is the `/group-chat` route** (`App.tsx`), which lists the groups a student can open a
chat in; "View My Courses" also appears there (`GroupChatPicker.tsx:67`) and on the My Group page
(`AuthenticatedMyGroup.tsx:660`). Only the chat header was in scope for the earlier removal.

## 2026-11-24 19:42-19:56 — the upload failure was two CORS gates, and only one is ours

Adam reported the same sentence again — "Your browser could not reach file storage" — after the newline
fix, so it was reproduced in a real browser instead of inferred.

**What the browser showed.** Signed in as QA-A on the published origin: the signer answered `200` and
the PUT to R2 answered `200`. Signed in on the project Preview origin
(`8328-…sg2.manus.computer`, the surface the Dashboard opens with a "Temporary preview" banner): the
signer answered `200`, and the PUT threw `TypeError: Failed to fetch`.

**Why.** The bucket has its own CORS rule, separate from the function's, and it lists only
`https://citylink-vm2mka3y.manus.space`. A preflight from the Preview origin gets `403` with no
`Access-Control-Allow-Origin`; the PUT itself still returns `200`, and the browser discards the
response because no origin was allowed. The client sees a thrown fetch, which is the sentence Adam
read. The R2 token is denied on CORS operations (`AccessDenied`), so this rule cannot be changed from
here — it is Adam's Cloudflare account.

**What was fixed here.** The signer now resolves the request origin instead of comparing it to one
string: `SITE_ORIGIN` may hold a comma-separated list, `*.manus.space` and `*.manus.computer` are
accepted by pattern, localhost is accepted for development, and an unrecognised origin gets no CORS
header at all. This is not a weakening of authorization: every request carries the caller's own JWT,
the function sets no cookies and reads no ambient credentials, so the token is the authority and CORS
only decides who may read a response. Deployed as version 5 (`ezbr_sha256 1c2f0520…`); 27 function
tests pass, including the Preview origin, an untrusted origin and the list form.

**The client now names the hop.** A signing request that never reaches the function says "file
service"; a bucket that refuses the upload says "file storage". Both log their detail to the console.
A signing failure is retried once after `refreshSession()`, because an expired token is rejected before
CORS headers are attached and therefore arrives as a network error rather than a `401`.

**Chat sizing, second pass.** Bubbles are `min(52%, 520px)` — 84% under 720px, where half a phone's
width would break words — and the conversation is a fixed `clamp(520px, 76vh, 900px)` window
(420–700px on phones) rather than a min/max range, so it holds its shape like a messenger. Published
`f5dc80c`, live build `e2300ba0c73c5d5a`, both assets verified against the marker.

**Where "View My Courses" lives.** Both are the breadcrumb above the page title, not an action button:
`GroupChatPicker.tsx:67` and `AuthenticatedMyGroup.tsx:660`, each
`<Link href="/my-courses" className="back-link">View My Courses</Link>`. The My Group page also has a
"My Courses" link at `:89` and the phrase in copy at `:710`. Removing the breadcrumbs would remove the
only way back to the course list from those two pages, so nothing was changed.

## 2026-11-24 20:00-20:36 — the chat names itself, and the breadcrumbs go

Adam asked whether everyone can reach a group chat, and asked for three UI changes: remove the two
breadcrumbs, add a way from the chat back to its group, and leave the bubble size alone ("the bubble is
fine now").

**The chat was already private; the notice was not.** The read predicate
`private.can_read_group_chat` requires an existing membership row with status `active`, `left` or
`removed` — a pending invitation or join request does not create one — and `private.can_send_group_chat`
additionally requires `active` and a group that is not abandoned. Verified against the live database
rather than read from SQL: QA-C (`citylink.qa4…`, a student with no membership in the QA group) called
`get_group_chat_access` and `list_group_chat_messages` and both returned
`P0001 not authorized to read this group chat`. Adam was reading the old notice, which opened with what
members _can_ do and only mentioned restriction afterwards. The notice now opens with the restriction:
"Only members of this group can open this chat, and the server checks that on every request — a pending
invitation or join request does not grant access."

**The header names the conversation.** A student with several chats open saw "Conversation" on all of
them. `loadGroupChatHeading(userId, groupId)` reads the group's `name` and `course_id`, then the course
`title`, and the panel renders `"<course title>: <group name>"` — for example
`QA Capacity Course: QA-P1-20261124-1519`. It is decoration only: the access check has already decided
permission, the reads are the same table reads the My Group page makes, it runs beside the message
request rather than before it, and any failure leaves the generic heading in place.

**The breadcrumbs are gone, and the earlier note was wrong.** The previous entry said removing them
would remove the only way back to the course list. That was not true — the workspace sidebar carries
"My Courses" on every page, and the layout breadcrumb above the title stays. Adam asked for them to go,
so the two `<Link href="/my-courses" className="back-link">View My Courses</Link>` elements were
deleted from `GroupChatPicker.tsx` and `AuthenticatedMyGroup.tsx`. The "My Courses" button inside the
My Group empty state (`:89`) is a recovery action in a failure panel, not a breadcrumb, and stays.

**A way back to the group.** The chat header now carries `View group` next to `Files`, linking to
`/courses/<courseId>`. `loadGroupChatHeading` already read `course_id`, so the link costs no extra
request; it renders only once the heading resolves, and the actions row got a flex rule because two
buttons in a plain block would have stacked.

**Published and verified live.** Build `3b24bc4a764b0d06` (commit `68dc187`): the header reads
`QA Capacity Course: QA-P1-20261124-1519`, `View group` navigates to
`/courses/0804189d-bb79-4d59-90f9-50a3b0fe3297`, and neither the picker nor the My Group page shows a
breadcrumb above its title any more. `pnpm check` clean, 638 tests pass.

**The Preview stays unavailable, by Adam's decision.** He confirmed uploads work on the published site
and said to leave the Manus Preview as it is. The cause is unchanged and outside this repository: the
R2 bucket's own CORS rule lists only the published origin, and the token cannot edit it. The signer's
origin resolution (version 5) is committed as `eccd7bd` on `feature/coordinator-edge-signer` (PR #66,
draft) so the deployed code has a reviewable source; nothing was deployed or merged in this round.

## 2026-11-24 — Design change: the shared analysis plan becomes a shared AI conversation in the group chat

- **Decided by Adam, 2026-11-24.** The group AI is no longer "one shared analysis plan per group". It is one
  shared AI conversation inside the group chat. The AI is not a member; it participates as if it were one.
  Its answers are chat messages with `author_kind = 'ai'`, `sender_id` NULL and
  `sender_name_snapshot = 'CityLink AI'`, visible to the whole group. Each group chat is its own session.
- **Entry point.** A button beside Files in the chat toolbar opens a drawer that slides in from above. Opening
  it sends nothing; a question is sent only by an explicit action after consent.
- **Why a new column rather than "sender_id is null".** `group_chat_messages.sender_id` is
  `ON DELETE SET NULL`, so a deleted account's messages also have a NULL sender. Without `author_kind`, the
  client would render a deleted member's words as CityLink AI. `author_kind in ('member','ai')` separates the
  two; the NULL sender is a consequence, not the test.
- **Answer length.** Target 1,200-1,500 characters, hard cap 2,500. Over the cap the answer is cut, the notice
  "（回答過長，已截斷）" is appended, and a log entry is written. The existing 4,000-character CHECK on
  `group_chat_messages.body` is unchanged; 2,500 is an application policy, not a database constraint.
- **Budgets, in characters and not words.** Chat history 4,000; selected file text 10,000 in total; at most two
  files per question.
- **Context rules, in priority order.** (a) the question is always kept; (b) at most the two most recent AI
  answers, oldest dropped first; (c) the remaining budget goes to member messages, most recent first; (d) when
  anything is dropped, the answer opens with "（本次未包含較早的對話）".
- **Clearing context.** Any member may do it. It moves `context_starts_at` and nothing else; no message is
  deleted, so a member cannot destroy another member's words by clearing.
- **Retention.** Permanent. A member's questions and the AI's answers stay after that member leaves or is removed.
- **File scope.** Only this group's files, `status = 'current'`, and `retention_expires_at` not passed.
- **Void, not deleted.** The shared-plan design recorded earlier - `group_analysis_plans`,
  `group_analysis_jobs` and `docs/stage6/KAYK_AI_PLANS_JOBS_CONTRACT_DELTA.md` - is void because of this change.
  Both tables are already applied on Launch. Per Adam they are **not dropped and not altered**; they are simply
  left unused, with no RPC reading or writing them.
- **What survives the change.** The extraction module, the provider boundary, the consent pattern and their
  tests stay; only the plan-shaped request and response are replaced. The new proposal is
  `docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md` - a draft, not applied, and requiring Role 6 exact-head review
  and a named authorization before any SQL exists.

## 2026-11-24 — Group AI chat: the write path, the read contract, the rate limit and the shared reset

- **Decided by Adam, 2026-11-24**, in response to Role 6's exact-head review of `KAYK_AI_CHAT_CONTRACT_DRAFT.md` (reviewed at `bd60b5c`, blob `73c9297`). Four rulings, recorded here because each one changes what the eventual migration may contain.
- **B-1 — write-back only via `service_role`.** AI messages are written by `finish_group_ai_request`, executable by `service_role` alone. `begin_group_ai_request` stays callable by `authenticated` and does permission, file eligibility, rate limiting and queueing, but never writes a message and never returns a body. `group_ai_requests` therefore keeps a `service_role` grant; revoking it would leave the log permanently at `queued`, because the provider's result arrives outside the database and nothing else can write it back. The reason this matters: `group_chat_messages` is `REVOKE ALL` to `authenticated` with no policy, so an RPC grant is the only gate — a single authenticated function that writes `author_kind='ai'` would let any member speak as CityLink AI.
- **B-2 — a new read function, not `DROP` + `CREATE`.** `list_group_chat_messages` keeps its exact signature; the two new columns (`author_kind`, `truncated`) are exposed by a new `list_group_chat_messages_ai`. `RETURNS TABLE` cannot be extended with `CREATE OR REPLACE`, and `DROP` takes the grants with it, so the additive claim only holds with a separate function. This follows the `_capacity` naming precedent Adam approved on 2026-11-21.
- **C-4 — the rate limit is a transactional check inside the RPC.** Before inserting the request row, `begin_group_ai_request` counts today's questions for the group, today's for the member, and the group's in-flight requests; any breach raises `group_ai_rate_limited` with `retry_after` in seconds. Chosen over a server-side limiter because the RPC is the one path no client can bypass, and it needs no new service. The numbers are a product choice, not a security boundary: 20 per group per UTC day, 10 per member per UTC day, 1 in flight per group, with a request `queued`/`processing` for more than 120 seconds treated as dead so a crashed server cannot wedge a group until midnight. The check takes `pg_advisory_xact_lock` on the group before counting, because count-then-insert is not atomic on its own. Constants live in `shared/aiRateLimit.ts` so the SQL and the client cannot drift.
- **C-3 — the shared reset stays as designed.** Any member, including one who just joined, may clear the group's AI context; clearing moves `context_starts_at` and deletes nothing. No rate limit and no audit trail are added. Recorded explicitly as a shared, repeatable reset rather than left implicit.

Still not authorized by this entry: no SQL file exists for any of it, nothing is applied, and the migration needs Role 6's exact-head review of the final blob plus Adam naming the exact SQL head. — see the entry below: as of 2026-11-24 (later the same day) the SQL file does exist, still unapplied.

## 2026-11-24 — Group AI chat: Adam rules F-11 (server-recorded acceptance) and F-12 (no switch, no opt-out); the SQL proposal is written

Adam's rulings, given in the Kayk task on 2026-11-24 after Role 6's third focused review
(`docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md` blob `aa93a5f543efea4b8add0bd65e8482b0a7b8d566`,
commit `352e88b`). This entry records the decisions and the file that now exists; it authorises
nothing beyond what the 2026-11-24 chat entry above authorised.

- **F-11 — acceptance is recorded server-side, once, and checked in `begin`.** Adam: "record
  AI-disclosure acceptance server-side once and check it in `begin`". Implementation shape in the
  proposal: `profiles.ai_disclosure_accepted_at timestamptz` — nullable, **no backfill**, because
  existing users never saw this disclosure and a default would manufacture consent. New RPC
  `public.accept_ai_disclosure()` writes it for the calling actor only.
  `public.begin_group_ai_request` checks it before any write and raises SQLSTATE `45N09`
  `group_ai_disclosure_required`. Known limit, stated rather than glossed: the record proves an
  account pressed accept at a timestamp, not that anyone read or understood the text; it closes
  "construct the request directly", not "changed your mind".
- **F-12 — option (c): neither a group switch nor a member opt-out; the acceptance is explicit.**
  Adam chose the third option, so the proposal deliberately creates **no** `ai_enabled` column and
  **no** opt-out path, and the disclosure must state that one member's question sends other
  members' chat and this group's file text to OpenRouter-routed DeepSeek, with no way for another
  member to opt out alone. A static test (`server/stage6AiChatSqlContract.test.ts`) refuses the
  appearance of such columns. Compliance judgement is Adam's/product's, not an agent's.
- **Consequence for §7 item 5 of the disclosure.** "Re-consent every question, nothing is
  remembered" is now a **UI** behaviour: the drawer asks every question, the server stores one
  timestamp. The server record is authoritative where the two disagree.
- **Rate-limit numbers, restated here so the SQL has a home to be compared against** (Adam's C-4
  ruling): 20 questions per group per UTC day, 10 per member per UTC day across groups, 1 in
  flight per group, `queued`/`processing` older than 120 s treated as dead, refusal token
  `group_ai_rate_limited` (SQLSTATE `45N06`) with `retry_after` and `reason` in `DETAIL`.
- **G-1 mechanism (Role 6's question "how can SQL share the TS constants?"):** literal duplication
  in SQL plus a static test that pins `shared/aiRateLimit.ts` to the SQL text. Chosen over
  build-time SQL generation and a settings table. Honest cost: there are two copies of the numbers;
  a change must touch both and the test is what catches drift.
- **New file, UNAPPLIED:** `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` (group AI chat
  schema: `group_ai_context`, `group_ai_requests`, `profiles.ai_disclosure_accepted_at`, three
  new columns on `group_chat_messages` with five constraints created `not valid` then validated in
  a separate section, `private.list_group_chat_messages_page`, `public.list_group_chat_messages_ai`,
  `begin_group_ai_request`, `claim_group_ai_request`, `finish_group_ai_request`,
  `clear_group_ai_context`, `accept_ai_disclosure`). It is guarded by the same
  `private.assert_citylink_target` marker as P1, so it refuses a wrong or unrecognised target
  instead of trusting an operator-set variable.
- **Evidence produced so far is local only.** `server/stage6AiChatMigrationApplies.test.ts` (16)
  applies the file to a throwaway PostgreSQL 17.12 database built on a **stub schema**
  (`server/fixtures/aiChatStubSchema.sql`, scenario `server/fixtures/aiChatScenario.sql`);
  `server/stage6AiChatSqlContract.test.ts` (22) pins SQL literals to the client constants. A pass
  proves the SQL parses, applies, re-applies and behaves as specified against the stub. It does not
  prove live Auth, real-table RLS, existing grants, concurrency, or any provider.
- **Not authorized by this entry:** applying the SQL to any Supabase project (Test or Launch), any
  signed-in write QA, `notify pgrst` against a real project, merge, ready-for-review, deployment,
  publication, GitHub visibility changes, or any write to Launch. Role 6's third review asked for a
  short "確認還原" check of the restored §2.1/ACL/§11 on a new blob, then a blob-level exact-head
  review of the SQL; there is explicitly **no fourth documentation round.**

## 2026-11-25 — Group AI chat: the apply target, the transfer method, the five gates and the window

Adam's rules for `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql`. They constrain **how and when** the
migration may ever be applied; none of them is an authorisation to apply it, and no write has happened.

**Where — the only target.**

- **CityLink Launch `pijslbchvstkoweslymr` is the only apply target.**
- Prototype `wkzclgmhrtecnpexfesr` is **frozen under F14 and must not be migrated** (the 2026-11-24 incident).
- Local PostgreSQL is a **test harness, never an apply target**; a green local apply does not mean "applied".
- Section 0's `private.assert_citylink_target('pijslbchvstkoweslymr')` is the **last line of defence, not the
  first**: it is not a substitute for gates 1-4 below.

**How — three mechanical requirements.**

1. **Transfer that preserves blank lines and formatting** (a file or a CLI pipe). **No manual paste.**
   Precedent: P1 was pasted once, blank lines were eaten, two functions' stored `prosrc` diverged from the
   authorised file, and a follow-up `create or replace` had to be issued. That is a defect this rule exists
   to prevent, not a style preference.
2. **After applying, compare `md5(prosrc)` of every created/changed function against the authorised file, and
   post the comparison.** All seven functions: `private.list_group_chat_messages_page`,
   `public.list_group_chat_messages_ai`, `begin_group_ai_request`, `claim_group_ai_request`,
   `finish_group_ai_request`, `clear_group_ai_context`, `accept_ai_disclosure`. A silent normalisation inside
   `create or replace` is exactly what this catches.
3. **Apply first, promote second — never the reverse.** After a successful apply, copy the **same bytes** to
   `supabase/migrations/<timestamp>_kayk_ai_chat.sql`, commit it, and add one migration-ledger row following
   P1's `20261124064100` precedent: the ledger points at the file, it does **not** re-store the statements.
   The ledger is not an apply tool.

**When — five gates, in order. Any gate that fails stops the sequence.**

1. **Role 6's exact-head verdict of "no blocker" on the blob.** The reviewed blob is
   `1a4f6c84441cfc6886a826c75e82cd94da734136` (788 lines, sha256
   `2931d19b97d337e04b33d866a80168294cae6e638cf51c285012db329584812d`). Role 6 returned **approve with
   conditions, no blocking security defect**, and conditions **S-1/S-2/S-3/S-4 change the SQL text**, so the
   blob that will actually be authorised is a **new** one; authorisation must name that new SHA/sha256, never
   `1a4f6c84…4136` for a file that has since been edited.
2. **Coordinator confirms no other branch is modifying the same objects** (`group_chat_messages`, `profiles`,
   the chat read functions, the two new tables).
3. **Launch read-only preflight**: current schema, existing functions, the invitation trigger, object
   ownership, default **and** effective privileges, the `private` schema, the migration ledger,
   `pg_control_system()`. Any mismatch stops it — **no "apply first, fix afterwards"**.
4. **Adam writes a dated authorisation in this file**, naming the ref, the blob, the line count and the sha256.
5. **Apply inside one transaction**, then run read-back verification, the `md5(prosrc)` comparison, the ledger
   row and the promotion.

**Window conditions.**

- Gates 3-5 must happen **in one window**; a preflight re-run the next day counts as **invalid**.
- Not on the eve of a demo or live QA; leave time for verification after the apply.
- Confirm nobody is editing the branch before applying.
- `author_kind` is an `ALTER` on the live `group_chat_messages`, which takes a lock → schedule a low-traffic
  slot. (A second reviewer reports Launch currently holds **4 rows** in that table, which is why the
  `NOT VALID` → `VALIDATE` step looks instant today; that is a **reported** measurement from a read-only
  catalog query, not evidence I produced, and the file's own duty to measure before applying still stands
  because the table grows.)

**Not authorised by this entry.** No apply, no preflight execution, no Launch write, no `notify pgrst`, no
signed-in QA, no merge, no ready-for-review transition, no deployment or publication. Recording the rules is
not granting permission. Connection strings, project URLs and keys stay out of PR bodies, chat and this file.

## 2026-11-25 — Adam rules S-1(a), S-2(b), S-3, S-4 and S-9(b); the AI-chat proposal becomes two deploys

Adam answered four of the ten conditions Role 6 raised against SQL blob `1a4f6c84…4136`. Kayk implemented
them in the same session. **This entry authorises nothing to run: no preflight, no connection to Prototype or
Launch, nothing applied, and no merge.** PR #67 stays draft.

**The rulings, as given.** S-1 option (a); S-2 option (b); S-3 approved; S-4 approved; S-9 option (b) — Role 6's
recommendation. S-5, S-6, S-7, S-8 and S-10 are **still open** and were deliberately not touched.

**What changed in the SQL.**

1. **S-1 (a)** — `finish_group_ai_request`'s five record parameters (`p_truncated`, `p_dropped_context`,
   `p_chat_chars`, `p_file_chars`, `p_files_used`) default to `null` and are written as
   `coalesce(p_x, q.x)`. A `finish(id, body)` call can no longer erase what `begin` measured; an explicitly
   passed value still wins. The AI message row now uses the resolved `truncated`, so the message and the log
   row cannot disagree.
2. **S-2 (b)** — new **`public.get_group_ai_request_status(uuid)`**, `security definer`,
   `set search_path = ''`, revoked from all four roles and granted to `authenticated` only. It returns state
   and counters (`status`, `asked_at`, `finished_at`, `message_id`, `error_code`, `dropped_context`,
   `truncated`, `files_requested`, `files_used`, `chat_chars`, `file_chars`) and **never** the question, the
   assembled turns or a file name, so it is a disclosure channel rather than a content channel. F-8's test is
   `files_used < files_requested`. Read scope is `private.can_read_group_chat` (the same rule that lets former
   members read AI answers); unknown id, unreadable group and a `null` argument all return **zero rows instead
   of an error**, so the function does not confirm which group a request id belongs to. `finish`'s return type
   is unchanged — Adam chose the option that does not require a later `DROP`+`CREATE`.
3. **S-3** — `accept_ai_disclosure()` writes only `where … ai_disclosure_accepted_at is null` and otherwise
   returns the existing instant. The column again means "when this member first accepted" (F-11), while §7
   item 5 keeps re-ticking per question.
4. **S-4** — both file headers now carry the full SQLSTATE table including `45N11`, and
   `stage6AiChatSqlContract.test.ts` **parses that table**: the union of codes declared in the two headers must
   equal the union of codes the two bodies raise, and each code's token must match the test's pairing table.
   The previous check only proved a token appeared somewhere in the file, which is why 45N11 could be missing
   from the header and the suite still passed.

**S-9 (b) — the split, and the structural rule it created.** The proposal is now two files with their own
transactions, cut between Section 3 and Section 3.1:

| File                                                                 | blob (full OID)                            | lines | size     | sha256                                                             |
| -------------------------------------------------------------------- | ------------------------------------------ | ----- | -------- | ------------------------------------------------------------------ |
| `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` (deploy 1)         | `33e5589e6ee5ddd0ed88b101be42d1f1700675df` | 290   | 17,703 B | `294ab3e6c9d671c591b8aad46cdb77f36b9ca6f8202cd4eaa0793f8bbec90b98` |
| `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql` (deploy 2) | `045546fd5068cd1216f90490e8a0dac8b5e03c33` | 681   | 29,726 B | `5da292dfacda973a39ad96750e739554e34a2a4d81d708207aeb953717e02213` |

Deploy 1 = target assertion, the two tables, `profiles.ai_disclosure_accepted_at` +
`accept_ai_disclosure()`, the three `group_chat_messages` columns and five `not valid` constraints. Its commit
releases the `ACCESS EXCLUSIVE` from the `ADD COLUMN`, which was the point of splitting. Deploy 2 =
**the target assertion re-run first**, the five `validate constraint` steps, the partial index, both read
functions and the private helper, `begin`/`claim`/`finish`, the new status function, `clear`, and the grants for
the objects it creates.

**New structural rule adopted from the split (not asked for by Role 6, stated so it can be reviewed):** an
object created by deploy 1 carries its own revoke/grant inside deploy 1. Leaving `accept_ai_disclosure()`'s ACL
to deploy 2 would leave it with PostgreSQL's default **PUBLIC `EXECUTE`** for the whole window between the two
commits — the exact shape R-2 was raised against.

**Honest description of the intermediate state.** After deploy 1 alone the columns exist with constraints
unvalidated, and the AI write path, the read function and the status RPC **do not exist**, so the feature is
absent rather than half-live; member chat is unaffected because `author_kind` defaults to `'member'` and the
only writer of `'ai'` arrives in deploy 2. Both files are idempotent (`if not exists`, guarded `DO` blocks,
`create or replace`), so a failed deploy 2 is fixed and re-run; deploy 1 is not rolled back. **Running only
half of this is not a valid end state** — the authorisation must name both blobs.

**Evidence.** `server/stage6AiChatMigrationApplies.test.ts` grew from 16 to **22** tests and
`server/stage6AiChatSqlContract.test.ts` from 22 to **23**; the six new apply tests are the structural claims
above, including that deploy 2 is refused (45M03) with **zero** of its seven functions created if the cluster
identity changes after deploy 1 committed, and succeeds again once it is recognised. The suite was run twice:
on the default cluster **PostgreSQL 16.15** and, to close the harness/target gap Adam was told about on
2026-11-24, on a PGDG cluster at port 5433 reporting **PostgreSQL 17.12** — same engine family as the 17.11
targets, not the same version. Both runs: 22/22. `corepack pnpm check` exit 0; `corepack pnpm test` 54 files /
**817 tests** passed; `corepack pnpm build` exit 0. A local green apply — on either engine — is still not an
applied migration.

## 2026-11-25 — Adam rules the remaining five AI-chat items as one batch; both blobs change again

**The ruling, as given.** Adam's message of 2026-11-25 was one sentence for all five open
items: 「一句話裁決這五條：『全部照 Role 6 建議改』（最省事，我建議這個）」. That covers S-5,
S-6, S-7, S-8 and S-10, and nothing else. No item is a new product choice: each change below
is the fix Role 6 itself proposed in its exact-head review. In the same message he answered
item 4 of my previous report with 「4. the launch database」 and forwarded the coordinator's
gate-2 output. I read that as confirming the eventual apply target is Launch
`pijslbchvstkoweslymr`, **not** as the dated authorisation gates 4–5 require: nothing was
connected to, preflighted or applied in this round, and the SQL that would run is now a
different pair of blobs from the one any authorisation could have named.

**Where each item landed.** S-5 (daily-count wording): Role 6 required one sentence in both
places but did not pick a side, so I changed the **SQL** to say what the already-approved G-3
decision says — a decision recorded 2026-11-24 should not be reworded to match code that
drifted from it. Both counts now read `and not (q.status = 'queued' and q.claimed_at is
null)`, and `v_stale` survives only in the in-flight test. This direction is my inference and
is flagged for Role 6 to confirm at re-certification. S-6 (context loops): `exit` on the first
message that does not fit, in both loops, so the kept window is a strict prefix and the notice
「（本次未包含較早的對話）」cannot describe a gapped window. S-7 (pinned literals): test side only
— one new static case binds every repeated literal (`4000` in four places, the file cap `2`,
the scan windows `10`/`200`) and the closed `error_code` set, and cross-checks the two error
tokens against the contract. S-8 (silent clamp): `truncated = coalesce(p_truncated,
q.truncated) or char_length(btrim(coalesce(p_body, ''))) > 4000`, which can only ever add the
flag, never remove one the caller passed. S-10 (free-text `error_code`): a CHECK in deploy 1's
`create table`, named `group_ai_requests_error_code_check`, allowing `null`,
`provider_timeout` and `provider_failed`; created validated on an empty table, so it costs no
scan.

**The 200-row scan cap (second reviewer item 1, same band as S-6).** He offered two fixes:
remove the limit, or set `dropped_context` when it is reached. I kept the limit and set the
flag, because `group_chat_messages` is a live table and an uncapped backwards scan on every
question is a cost this proposal should not take on trust. The mock/live difference he named
stays open: `shared/aiChatContext.ts` receives an array and therefore has no scan cap at all.
Changing client code is outside these five rulings, so it is recorded in contract §3 instead
of implemented.

**One error of mine, corrected in the same pass.** Deploy 1's header had been copied from
deploy 2 and said 「本檔是第 2 次」 plus a dependency on "deploy 1's objects" — wrong for the
first file, and exactly the sort of line an operator follows while running a migration. It now
states that this is deploy 1 of 2, that the order can only be 1 → 2, and lists S-10 here with a
note that S-5/S-6/S-7/S-8 live in deploy 2 so both files must run. No behaviour, signature,
grant or RLS line changed for this; it is a comment correction inside a blob that changed
anyway.

**New blob identity (supersedes everything before it).**

- Deploy 1 `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` — blob
  `57e4c5265da487073683436fa385a4ce79a06403`, 299 lines, 18,653 bytes, sha256
  `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`
- Deploy 2 `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql` — blob
  `de5eb18f238d2c6f0f6776e47dee7e19c1eacc86`, 711 lines, 32,724 bytes, sha256
  `4f50aba080d93a7653b58ef11ec2ec65dd87f00fbbda8c1be64051e5c30e575c`
- Contract `docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md` — blob
  `b574947f6917201280b8c62f54298cde97e38537`, 501 lines, 91,381 bytes, sha256
  `4422104bb2cb538da8aaa5033b171ddafa978a29803b25ff83f9720141af6dfd`

Superseded: deploy 1 `33e5589e6ee5ddd0ed88b101be42d1f1700675df` and deploy 2
`045546fd5068cd1216f90490e8a0dac8b5e03c33` (the earlier entry the same day), and the single
788-line `1a4f6c84441cfc6886a826c75e82cd94da734136` that Role 6 originally reviewed. Any future
authorisation must name the two current blobs, and must name **both**.

**Gate 2 (no other branch touches these objects) — evidence, not yet a coordinator statement.**
Adam forwarded the coordinator's gate-2 file, which lists my object inventory at `ae313b2` and
every open PR head. I additionally checked the candidate branches myself, read-only through the
GitHub connector (`gh pr view` / `gh pr diff`, no database involved): PR #60 (server-side group
search plus direct messages, SQL only), PR #65 (the two read-only group-file functions), PR #63
(quota usage RPC) and PR #64 (P2 signing endpoints) each add **zero** lines mentioning
`group_chat_messages`, `group_ai_context`, `group_ai_requests`, `author_kind`, `ai_request_id`,
`ai_disclosure_accepted_at` or any of the eight functions. PR #66 is an Edge Function with no
SQL objects; PR #59 is the P1 group-files line, which this proposal only reads. That supports
gate 2 for the work visible in this repository, but it cannot see unpushed work in somebody's
own sandbox, so the coordinator's own confirmation remains the record — and gate 2 is not apply
authorisation.

**Evidence for this round.** `server/stage6AiChatMigrationApplies.test.ts` grew 22 → **27** and
`server/stage6AiChatSqlContract.test.ts` 23 → **24**. The five new behaviour cases are the five
claims, and each was additionally run against the **previous** blob in the same local harness to
prove it discriminates rather than merely passing: before S-6 the newest/middle/oldest window
returned `turns=2` with first characters `tb` (a hole in the middle); before S-5 ten
never-claimed queued rows refused the next question with `45N06 … user_today=10`; before S-8 a
4,001-character answer logged `truncated=false` while storing a 4,000-character body.
`corepack pnpm check` exit 0; `corepack pnpm test` 54 files / **823 tests** passed; the apply
suite passed 27/27 on the default cluster (**PostgreSQL 16.15**) and again 27/27 on the PGDG
cluster at port 5433 (**PostgreSQL 17.12**), the same engine family as the 17.11 targets, not
the same version. A local green apply — on either engine — is still not an applied migration.

**Not done, deliberately.** Nothing was applied anywhere; no Supabase project was connected; no
preflight was run, because Adam's own window rule voids preflight evidence taken earlier; no
merge, no "Ready for review", no deployment, no publication, no signed-in QA, no real provider
call, no `notify pgrst`. The timezone item the second reviewer raised (`date_trunc('day',
now())` depends on the server's `TimeZone`, measured as UTC on Launch) is **not** one of the
five items Adam ruled, so that SQL line was left alone and is recorded as the single open
finding awaiting one sentence from Adam.

## 2026-11-25 — Adam rules the AI-chat day boundary to UTC; deploy 2 changes again, deploy 1 does not

**補充（後補，2026-11-25）：** 同日第三批裁決其實含三項，本條只記了日界那一項；另外兩項見下一條。

**The ruling, as given.** Adam replied to the single open item in my previous report
(second reviewer's item 4, not an S-numbered finding) with 「follow suggestions」. The
suggestion on the table was to replace `date_trunc('day', now())` with
`date_trunc('day', now(), 'UTC')` in `begin_group_ai_request`. That is what was implemented.
This is a dated decision by Adam, recorded here; it is a product/technical decision only and
authorises no database write, migration, merge, deployment or publication.

**Why it was worth a third blob.** The old expression resolves "today" against the _connecting
session's_ `TimeZone`. The reviewer measured Launch's `TimeZone = UTC` (reported, not measured
by me), so both forms are equal right now. But the quota reset and `retry_after` are derived
from the same `v_day_start`, so any connection whose session zone differs — a session-mode
pooler, the operator's own `psql` environment, or a later GUC change — moves the reset point and
the advertised wait together, while the client `shared/aiRateLimit.ts` computes its window with
`Date.UTC` and does not follow. After the pin the two sides agree structurally instead of by
configuration. Stated in contract §2.1 G-5 and §11.8.

**Scope of the change.** Only deploy 2
(`docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql`) contains a `date_trunc`. Deploy 1
is byte-identical to the blob recorded in the entry above: `57e4c5265da487073683436fa385a4ce79a06403`,
299 lines, 18,653 bytes, sha256 `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`.
Deploy 2 becomes `748a87f1969a58967d6cbf297077755c274ce522`, 720 lines, 33,737 bytes,
sha256 `8e4d18910d2ece5b75901373c53c7f731a72c8c03f64059b49c42f8e06b75f19`; it supersedes
`de5eb18f238d2c6f0f6776e47dee7e19c1eacc86` from the entry above, which supersedes `045546fd…`,
which superseded the single-file `1a4f6c84…`. Any authorisation must name **the deploy-1 blob
above and this deploy-2 blob**, and nothing older.

**Checks, recorded separately from claims.** One new behaviour test — "keeps the quota day on
UTC whatever the session timezone is": ten request rows are written at today 00:30 UTC, the
connection then runs `set time zone 'Etc/GMT+8'` (POSIX form = UTC−8) and the RPC must still
refuse with `45N06`, `reason=user_daily`, `user_today=10`, and a `retry_after` inside 1..86400;
the same scenario on a plain UTC connection must refuse identically. The static suite pins the
executable form and forbids any remaining un-zoned `date_trunc('day', now())`.
`pnpm check` exit 0; `pnpm test` 54 files / **824 tests** passed; the apply suite ran **28/28** on
the default cluster (**PostgreSQL 16.15**) and **28/28** on the PGDG cluster at port 5433
(**PostgreSQL 17.12**, same engine family as the 17.11 targets, not the same version).
**Discrimination measured, not assumed:** with deploy 2 temporarily replaced by its own previous
blob in the same harness, the new apply test failed at its first refusal assertion
(`expected +0 not to be +0`, i.e. the shifted connection let the member ask again) and the static
pin failed too; the file was then restored to the new blob and its sha256 re-verified.
Local green is not applied: no Supabase project was connected, no preflight was run, nothing was
applied, promoted, merged, deployed or published, and PR #67 stays draft.

## 2026-11-25 — Adam rules option A: a unique index, a contract sentence, and the last SHA change

**The ruling, as given.** The two remaining items from Role 6's third review were put to Adam
together and he chose **A**: adopt **3(a)**, making `group_chat_messages_ai_request` a **unique**
partial index, and **2(B)**, which changes no code and adds the missing half-sentence to the
contract. Both land in one batch, so deploy 2 changes exactly once more. This is a dated technical
decision by Adam; it authorises no database write, migration, merge, deployment or publication.

**Why uniqueness is not cosmetic.** The index exists so `finish_group_ai_request` can find the
message it already wrote. Nothing in the schema stopped a second row carrying the same
`ai_request_id`: the state machine in `finish` refuses a second finish, but a direct insert, an
import or a second writer never passes through it. `get_group_ai_request_status` joins those
messages, so a duplicate would have surfaced as two status rows for one request. Uniqueness now
belongs to the database rather than to a code path.

**Why the contract had to move in the same commit.** The contract does not merely describe the
index; it pastes the DDL at §1. Changing the SQL alone would have produced exactly the defect class
this cycle has been closing — S-4's missing SQLSTATE, S-5's daily count, G-5's in-flight wording.
§1.1 also gained the half-sentence naming the unique index as the enforcement point.

**Scope — four places, nothing else.**

- Deploy 2: the index expression (`create index` → `create unique index`, name and partial predicate
  unchanged) and one line in the header's change list. Nothing else in the file was touched.
- Contract: the §1 DDL snippet, one half-sentence in §1.1, and the operational definition at the end
  of §2.1 G-5 (Adam's 2(B): "in flight" is measured from `created_at`; the `claimed_at` form
  survives only inside the daily-quota exclusion). G-3's approved wording was not touched.
- `server/stage6AiChatSqlContract.test.ts`: the pinned literal becomes
  `create unique index if not exists group_chat_messages_ai_request`.
- `server/stage6AiChatMigrationApplies.test.ts`: one new test writes a second AI message carrying
  the same `ai_request_id` and requires `23505` naming the index.

**Blobs.** Deploy 1 is byte-identical to the entry above — `57e4c5265da487073683436fa385a4ce79a06403`,
299 lines, 18,653 bytes, sha256 `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`;
its diff against the previous head is **0 bytes**. Deploy 2 becomes
`2c66691b2e1f780498f1cca1e9c603a5a2053364`, 721 lines, 33,989 bytes, sha256
`9700679905c11e3d2b5046080f6ebccdf06288729ba909da1e2ca6a1b90ad15e`, superseding
`748a87f1969a58967d6cbf297077755c274ce522` / `8e4d18910d2ece5b75901373c53c7f731a72c8c03f64059b49c42f8e06b75f19`.
The contract becomes `75615c8caac01792c3bb2b4b1040e4b20ba782e9`, 528 lines, 96,702 bytes, sha256
`8740fe92c612b3dde709f0dce0025c77a3ecbb3493af232f9ff8afa7400f5bb3` — **superseded by the
follow-up below**. Any authorisation must name
**the deploy-1 blob above and this deploy-2 blob**, and nothing older.

**The contract's line citations moved by one.** The new header line shifts the deploy-2 body, so §2.1
G-5 now cites 340/346/352 where it used to say 339/345/351. The three cited lines were re-read after
the edit and say what the contract says they say.

**Checks, recorded separately from claims.** `pnpm check` exit 0. `pnpm test` exit 0 — 54 files,
**825 tests** passed, of which the apply suite is **29/29** on the sandbox cluster (**PostgreSQL
16.15**; the targets run 17.11, so this is weaker evidence on version, exactly as the harness header
warns). The new test is the only assertion in the suite that would have failed before E1: the
`pg_indexes` count cannot tell a plain index from a unique one.
**Discrimination measured, not assumed:** the same probe — one request, two messages carrying the
same `ai_request_id` — was run against both blobs, deploy 1 applied first in each case. Old blob
(`8e4d1891…`, 720 lines): the index installs as `CREATE INDEX`, the second insert is **accepted**,
two rows remain. New blob (`97006799…`, 721 lines): `CREATE UNIQUE INDEX`, the second insert fails
`ERROR: 23505: duplicate key value violates unique constraint "group_chat_messages_ai_request"`,
one row remains.

**This is the last SHA change.** After this commit the sequence is only gate 3 (Launch read-only
preflight), gate 4 (Adam's dated authorisation naming both blobs) and gate 5 (same-window apply,
1→2, `ON_ERROR_STOP=1`; deploy 2 failing does not roll deploy 1 back). No further SQL change is
expected; if one becomes necessary it is a new blob and needs its own authorisation. Local green is
not applied: no Supabase project was connected, no preflight was run, nothing was applied, promoted,
merged, deployed or published, and PR #67 stays draft.

**Follow-up, same day — one word.** Role 6 left the contract's own rationale at §1 line 45 to a
choice: call the index unique there, or keep the wording and record a deliberate exception. Adam
ruled the first. Line 45 and the §11 change list now read "unique partial index"; the §11
review-history narrative at line 398 is untouched, because it describes what was reviewed at the
time and rewriting it would be the same error in the other direction. Only the contract moved: it
becomes `13a4e8ccd5990d4cd443672e3a15adc6dab1b75c`, 528 lines, 96,716 bytes, sha256
`a49abe8883dadc9da77f54dcf1e383e766abb3a4ba661ea458bafdd504ad48cd`. Deploy 2 is unchanged at
`9700679905c11e3d2b5046080f6ebccdf06288729ba909da1e2ca6a1b90ad15e`, so the object an
authorisation names did not move.

**17.12 re-run, because the targets are 17.11.** Role 6 asked for the apply suite on a 17.12
cluster: the batch above was measured on 16.15 only. PostgreSQL 17.12 was installed from PGDG in
the coordinator sandbox (cluster `17/main`, port 5433, unix socket only, no Supabase project) and
the same suites were run against commit `ec35c4b`: apply suite **29/29**, full suite **54 files /
825 tests**, both exit 0. One invocation detail worth recording rather than hiding: the harness
opens each throwaway database by bare name, so it follows `PGPORT`, not
`CITYLINK_TEST_PG_URI`; the first attempt with the URI alone failed at the stub step with psql
status 2 (it connected to 5432, where that database does not exist), which says nothing about the
SQL. Re-run with `PGPORT=5433`: green.

## 2026-11-25 — AUTHORIZATION (gate 4): apply the AI-chat deploy pair to CityLink Launch

Adam authorises applying exactly these two blobs, in this order, to project
`pijslbchvstkoweslymr` (CityLink Launch):

- **Deploy 1** — path `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql`, blob
  `57e4c5265da487073683436fa385a4ce79a06403`, 299 lines, 18,653 bytes, sha256
  `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`
- **Deploy 2** — path `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql`, blob
  `2c66691b2e1f780498f1cca1e9c603a5a2053364`, 721 lines, 33,989 bytes, sha256
  `9700679905c11e3d2b5046080f6ebccdf06288729ba909da1e2ca6a1b90ad15e`

Note on the paths: deploy 1 is the **un-suffixed** file. `KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql` is
deploy 1, not the old combined 788-line proposal; the combined file is no longer a deployable object.

Both blobs were read back from head `8f705edf301d0184b5e0274bffd931dbac693dac` of
`feature/kayk-ai-analysis` (PR #67, draft) — the SQL files are byte-identical there and at `cb6b4a8`
and `ec35c4b` — and re-hashed from the commit blob, not a working tree. Role 6's gate-1 certification
(`ROLE6_AI_CHAT_FINAL_CERT_2c66691b_20261125.md`, 2026-11-25 02:30 Asia/Taipei) records **no blocker**
on either file, and its follow-up check at `8f705ed` confirms this authorisation names the current
objects. The contract `docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md` at this head is blob
`13a4e8ccd5990d4cd443672e3a15adc6dab1b75c`, sha256
`a49abe8883dadc9da77f54dcf1e383e766abb3a4ba661ea458bafdd504ad48cd`; it is a reference document and is
not applied.

**Execution shape.** Gate 3 read-only preflight against Launch immediately before, in the same
window; then one `psql` invocation per file, deploy 1 first, then deploy 2, each with
`ON_ERROR_STOP=1 -v VERBOSITY=verbose -f <file>`. Files are transferred in a form that preserves
blank lines and formatting, and the sha256 of the file that actually executes is recomputed and
compared against the two values above before it runs. Adam confirms the target in the same session
with `select system_identifier from pg_control_system();` = `7692131729119822239`. That read is the
identity check; the in-file Section 0 assertion proves history, not identity, and neither is a
substitute for this authorisation.

**Failure handling.** A deploy 2 failure does not roll deploy 1 back; both files are re-runnable
as written. If the unique index `group_chat_messages_ai_request` raises `23505`, that is pre-existing
row state, not a defect in the blob: stop, keep the raw output and SQLSTATE, do not delete chat
rows, and do not weaken the index back to non-unique as a fix.

**After apply.** `notify pgrst, 'reload schema';`, then per-function `md5(prosrc)` comparison against
the two reviewed blobs with the results posted, then promote the same bytes to
`supabase/migrations/<timestamp>_kayk_ai_chat_*.sql` and add the ledger line (the P1 pattern).

**If either blob changes after this entry is written, this entry no longer names what runs.** A new
blob means a fresh exact-head review and a new dated authorisation; nothing older may be applied.

**Not authorised by this entry:** merging or transitioning any PR to ready, deployment or
publication, GitHub visibility or permission changes, any write to `wkzclgmhrtecnpexfesr` (frozen
Prototype), signed-in or multi-account QA, and any schema work beyond these two files.

## 2026-11-25 — Execution-shape deviation for the gate-4 window (Adam, option 3)

Adam's decision at 09:13 Asia/Taipei: the gate-4 pair is applied through the Supabase connector's
`execute_sql` rather than through two `psql -f` invocations, because the coordinator's sandbox has no
secret store and no route to a `psql` connection string — `manus-config secret search` answers
"Saved secrets are not available in this environment", there is no `DATABASE_URL` and no `.pgpass`.
He was offered three routes (card plus a `{{secret:…}}` reference, running the prepared script
himself, or the connector) and chose the connector.

**What still holds, unchanged.** The same two blobs, in the same order, with the same sha256 values as
the gate-4 entry above; the gate-3 read-only preflight immediately before, in the same window; the
identity check `select system_identifier from pg_control_system();` = `7692131729119822239`; the
failure rule that a deploy 2 failure does not roll deploy 1 back; and the after-apply steps
(`notify pgrst, 'reload schema';`, per-function `md5(prosrc)` comparison posted, promotion of the same
bytes to `supabase/migrations/<timestamp>_kayk_ai_chat_*.sql`, ledger line).

**One transaction per file is preserved by the files themselves.** Both blobs carry their own
`begin;` … `commit;` (deploy 1 lines 90 and 299, deploy 2 lines 86 and 721), so a mid-file error aborts
that file's transaction and commits nothing. Fail-closed behaviour therefore rests on the explicit
transactions inside the authorised bytes, not on a client-side setting.

**What deviates.** There is no `psql` client in the path, so there is no `ON_ERROR_STOP=1` and no
`-v VERBOSITY=verbose`; error text and SQLSTATE come back from the connector's response instead. The
file reaches the server as a JSON string rather than as a filesystem `-f` argument, so blank lines and
formatting are preserved byte-for-byte in transit but are not exercised through a file descriptor.

**Scope.** This deviation covers this window only. It is not a precedent for later migrations: a
future window that has a working `psql` route should use the shape the gate-4 entry names.

## 2026-11-25 — Gate-4 application record: the AI-chat pair is live on Launch

Applied at 01:16 UTC (09:16 Asia/Taipei) through the connector route recorded in the deviation entry
above. Both files carried their own `begin;` … `commit;`; neither returned an error.

- **Deploy 1** (`4effbf5d…179d`) ran at 01:16:16Z and returned the in-file target assertion as empty,
  which is the pass signal. It created `group_ai_context`, `group_ai_requests`, the columns
  `group_chat_messages.author_kind`, `group_chat_messages.ai_request_id`,
  `group_chat_messages.truncated` and `profiles.ai_disclosure_accepted_at`, and the function
  `accept_ai_disclosure`.
- **Deploy 2** (`97006799…15e`) ran at 01:16:37Z with the same assertion pass. No `23505` was raised;
  the unique index installed without meeting pre-existing row state.
- **After apply.** `notify pgrst, 'reload schema';` executed. All eight function bodies md5-match the
  authorised files: `accept_ai_disclosure` `e3f6a2d9…`, `begin_group_ai_request` `ba844e1c…`,
  `claim_group_ai_request` `888ddbb8…`, `clear_group_ai_context` `75bc9fb0…`,
  `finish_group_ai_request` `2f0fa8af…`, `get_group_ai_request_status` `51c4caf3…`,
  `list_group_chat_messages_ai` `7121d7a0…`, `private.list_group_chat_messages_page` `7557d1ec…`.
- **Index.** `group_chat_messages_ai_request` is
  `CREATE UNIQUE INDEX … USING btree (ai_request_id) WHERE (ai_request_id IS NOT NULL)`.
- **Rows untouched.** `group_chat_messages` held 4 rows before and after; `group_ai_context` and
  `group_ai_requests` hold 0.
- **Grants observed.** `authenticated` holds EXECUTE on `accept_ai_disclosure`,
  `begin_group_ai_request`, `clear_group_ai_context`, `get_group_ai_request_status` and
  `list_group_chat_messages_ai`; not on `claim_group_ai_request` or `finish_group_ai_request`
  (server-only), and not on `private.list_group_chat_messages_page`. `anon` holds EXECUTE nowhere.
  Neither role holds table privileges on `group_ai_context` or `group_ai_requests`.
- **Promotion.** The same bytes were copied from the commit blobs to
  `supabase/migrations/20261125011616_kayk_ai_chat_deploy1.sql` and
  `supabase/migrations/20261125011637_kayk_ai_chat_deploy2.sql`; sha256 was re-checked after the copy
  and both still match the authorised values. Ledger rows of the same versions were added with
  `created_by = 'citylink-coordinator-20261125-postapply'`, the P1 pattern.
- **Pre-existing asymmetry, not caused by this window.** The ledger held 13 rows against 12 repo
  files before this window: `20261124082200 coordinator_group_file_read_functions` has a ledger row
  and no migration file. Recorded here so the next reader does not mistake it for a gate-4 artefact.

Scope: nothing else was written. No PR state change, no merge, no deployment, no publication and no
signed-in QA.

## 2026-11-25 — AUTHORIZATION (QA): single-account and multi-account QA of the AI-chat pair

Adam authorised at 09:24 Asia/Taipei, in the same message that approved the PR #67 retitle.

**Target.** CityLink Launch `pijslbchvstkoweslymr` only. Not `wkzclgmhrtecnpexfesr`, which stays frozen.

**Subject.** The eight functions applied at 01:16 UTC — `accept_ai_disclosure`,
`begin_group_ai_request`, `claim_group_ai_request`, `clear_group_ai_context`, `finish_group_ai_request`,
`get_group_ai_request_status`, `list_group_chat_messages_ai`, `private.list_group_chat_messages_page` —
plus the unique index `group_chat_messages_ai_request` and the tables `group_ai_context` /
`group_ai_requests`.

**Single-account QA.** One authenticated student exercising the client-facing path in the intended order:
the disclosure gate before first use, the idempotency key on `begin_group_ai_request`, the status poll, the
context clear, and the read path through `list_group_chat_messages_ai`.

**Multi-account QA.** Two or more authenticated students in the same group, exercising what differs by role
and membership state: active member, non-member coursemate, former member. The point is to see the
authority boundaries the grant matrix implies, not just that the calls return rows.

**Accounts.** The disposable Launch QA accounts already issued (`citylink.qa*.20261123@example.com`,
`citylink.seed.*.20261123@example.com`). They are QA identities, not real users, and nothing they create is
product data.

**Explicitly not authorised by this entry.** Concurrency or race testing beyond ordinary sequential
multi-account use — that needs its own decision; any schema or grant change; any write outside the QA
accounts' own rows; PR state change; merge; deployment; publication; GitHub visibility.

**Reporting.** Raw outputs and observed states, distinguishing what was executed from what was inferred. A
finding that would need code or SQL comes back as a finding, not as a fix.

## 2026-11-25 — The `20261124082200` ledger row has no migration file: recorded, not backfilled

Adam authorised resolving this at 09:24. Investigation first: the text of that migration is not
recoverable. The ledger row stores `statements = null`, and neither the repository nor the shared project
files contain that SQL under the version or under `group_file_read_functions`.

What the database does hold is the _result_, readable back with `pg_get_functiondef`. A file reconstructed
from that result never ran, would be treated by any migration tool as pending work, and could re-apply
definitions nobody reviewed in that form. Writing it would turn a bookkeeping gap into an unreviewed
schema change.

**Decision.** Documented permanent exception. The ledger row stays, the directory stays without a file, and
this entry is the record that the gap is known and why. If a reviewed backfill is ever wanted, it must be
generated from `pg_get_functiondef` at a named head, reviewed as new SQL, and labelled a reconstruction —
never presented as the bytes that ran.

## 2026-11-25 — Post-apply recheck: Role 6's preconditions, three answered by read-only queries

Role 6 reviewed the window record against head `ad54c20` and found no contradiction with its gate-1
certification. It raised six preconditions before signed-in QA. Three are answered here with raw read-only
output from Launch; the rest are decisions, not measurements.

**PRE-1 — can the definer functions bypass RLS?** Yes. `postgres` has `rolsuper = false` and
**`rolbypassrls = true`**; `service_role` is the same shape; `authenticated` and `anon` are both false. Every
read and write in this feature passes through a `postgres`-owned SECURITY DEFINER function, so the
zero-policy RLS on `group_ai_context` and `group_ai_requests` does not block the feature. DDL success would
not have proved this; the role flag does.

**PRE-3 — `service_role` in the grant matrix.** `service_role` holds EXECUTE on exactly
`claim_group_ai_request` and `finish_group_ai_request`, and on none of the other six, including
`private.list_group_chat_messages_page`. `postgres` holds EXECUTE on all eight. That is the intended split:
the two server-only functions are reachable only by the service role.

**PRE-4 — the new chat constraints are validated.** All ten constraints on `public.group_chat_messages`
report `convalidated = true`, including `group_chat_messages_author_kind`, `…_ai_has_no_sender`,
`…_ai_name`, `…_ai_request_only_for_ai` and `…_ai_request_fkey`. The validation loop in deploy 2 therefore
ran to completion rather than being skipped.

**Correction to the window record.** The `23505` contingency was untested by construction, not merely
"not triggered": `ai_request_id` is a column this pair added, so all four pre-existing rows held NULL and
the unique index never faced a legacy duplicate. It must not later be cited as a verified failure path.

**Not fixed, on purpose.** Deploy 1 line 292 contains the simplified character `必须` in a comment. It
stays. Editing an applied blob would break the identity between the docs file, the promoted migration and
the bytes that actually ran, which is the property worth more than the typo. Zero functional cost.

**Still open, and Adam's to decide.** PRE-2: no service-side executor exists for `claim` / `finish` — the
repository has no non-test caller and `supabase/functions/` is empty — so a request a student creates stays
`queued` and an end-to-end AI reply is not testable today. PRE-5: `supabase/schema.sql` contains none of the
five new objects (0 hits for `group_ai_requests`, `group_ai_context`, `ai_request_id`), so a local rebuild
from it produces a schema without them.

## 2026-11-25 — PRE-6 withdrawn: the "missing" migration was never missing

The earlier entry of today recorded `20261124082200 coordinator_group_file_read_functions` as a permanent
documented exception because its text could not be found. That conclusion was wrong and is withdrawn.

The file exists on `origin/feature/coordinator-sql-bundle-20261124` (PR #65, open draft), commit `33c6e3c`,
path `supabase/migrations/20261124082200_coordinator_group_file_read_functions.sql`. Verified here against
the commit blob: blob `15eb3457a337a8062b871460bd505fe6bcf73b5b`, 139 lines, sha256
`ed30cfd3852602b01aa01116e50749fc2ba8f25a0b3ff985e880f3604fcf61a0` — the same Git object as the v2 proposal
reviewed at `3fcc260`, so it is the bytes that ran and not a reconstruction. No forward-fill was made, and
none is needed.

The real shape is cross-branch aggregation, not a hole:

| ref                                             | migrations | extra over main                                                                                                    |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `main` (`519a69e`)                              | 11         | —                                                                                                                  |
| `feature/coordinator-sql-bundle-20261124` (#65) | 12         | `20261124082200_coordinator_group_file_read_functions`                                                             |
| `feature/kayk-ai-analysis` (#67)                | 14         | `20261124064100_kayk_p1_group_files`, `20261125011616_kayk_ai_chat_deploy1`, `20261125011637_kayk_ai_chat_deploy2` |
| union                                           | 15         | equals the Launch ledger's 15 rows                                                                                 |

Four applied migrations live only on draft branches. Recorded without authorising anything: merging #67 alone
would leave `main` at 13 files against 15 rows, so #65 and #67 have to be handled together when a merge
decision is finally taken. That is a merge-order decision, not an SQL one, and needs no new blob review.

## 2026-11-25 — `supabase/migrations/` is authoritative; `supabase/schema.sql` is a skeleton (Adam, option b)

Adam chose option b at 09:35 rather than adding the five new objects to `supabase/schema.sql`.

- The applied schema of any environment is what `supabase/migrations/` says, and for Launch that includes the
  four migrations currently sitting on draft branches (table above).
- `supabase/schema.sql` is a skeleton. It is not a live snapshot and must not be used to decide whether an
  object exists.
- A local rebuild from `schema.sql` alone cannot reproduce Launch, and "function not found" from such a
  rebuild is not evidence of a regression.

A header comment saying exactly this was added to `supabase/schema.sql` itself, so the next reader meets it at
the file rather than only here.

## 2026-11-25 — AUTHORIZATION (PRE-2): build and deploy a `service_role` executor (Adam, option A)

Adam chose option A at 09:35: a service-side executor exists before signed-in QA is asked to cover the
end-to-end path.

**Authorised.** Implement the executor in the canonical repository with tests; deploy it to Launch
`pijslbchvstkoweslymr` once it is reviewed; it may hold the provider credential as a server-side secret; it
calls `claim_group_ai_request` and then `finish_group_ai_request` as `service_role`.

**Shape fixed by the contract.** Claim, then provider call, then finish. `error_code` is limited to
`provider_timeout` / `provider_failed`. The answer body is capped at 2,500 characters including its truncation
notice. The context and unread-file notices are prepended in the order §6 fixes. `files_used` is reported so
the client can show the unread-file notice.

**Not authorised by this entry.** A provider key in the repository, in a browser bundle, or in chat; any SQL,
grant or policy change; merge; publication; GitHub visibility.

The provider credential is Adam's to supply through a secure card. Until it exists the executor is built and
tested against a fake provider, and is not deployed.

## 2026-11-25 — `LIVE_SCHEMA_20261124.sql` is a stale snapshot, not a baseline

`docs/backup/LIVE_SCHEMA_20261124.sql` on ref `docs/live-schema-snapshot-20261124` (3,619 lines, structure
only) was generated 2026-11-23 17:53 UTC. It contains none of `group_files`, `group_file_requests`,
`group_ai_requests`, `group_ai_context`, `ai_request_id` or `author_kind`, so it predates P1, the bundle and
the AI pair. Despite the filename it is not a live baseline and must not be used to judge whether an object
exists. Kept as history; not edited.

## 2026-11-25 — Signed-in QA result: 45 live calls, zero deviations

Eunice ran the authorised single-account and multi-account pass on Launch between 01:33 and 01:37 UTC,
against a fresh clone at `a5ff1a1`. Forty-five RPC calls through PostgREST with real password sign-in; the
cluster gate `7692131729119822239` was re-checked immediately before the first write.

**Result: no defects.** Every gate, error token and authority boundary matched the applied SQL and the
contract: the disclosure gate (`45N09`) before first use, write-once acceptance, idempotent replay with the
same key and `45N07` on a changed question, the in-flight gate `45N06` with `retry_after=15`, `45N03`/`45N11`
for empty and over-long questions, `45N05`/`45N04` for file count and ineligible files, `clear` as a
timestamp-only lower bound with the next request's `turns` empty, and cursor paging across both directions.

**Authority boundaries held in both directions.** A `removed` former member could read messages and request
status but not begin or clear (`45N01`); a never-member got the same generic `P0001` refusal for both a real
and a non-existent group; an unknown request id returned `[]` rather than an error, so existence does not
leak. `authenticated` calling `claim` or `finish` was refused with `42501` (HTTP 403), `anon` with `42501`
(HTTP 401) on all seven public functions.

**Retained state, deliberately.** Two `group_ai_requests` rows stay `queued` because no executor exists; they
stop holding the in-flight slot after 120 seconds and are excluded from daily counts while unclaimed. One
`group_ai_context` row records the clear. Two disclosure timestamps. No chat message, file, group or
membership was created or modified.

**Explicitly not tested.** End-to-end AI replies (no executor), the positive paths of `claim`/`finish`
(service_role only, and no service key was used), true concurrency, daily quota trip-wires, the `left`
membership state (only `removed` was available), and abandoned groups. The report separates executed,
statically reviewed and inferred throughout.

## 2026-11-25 — Provider changed to xAI; Role 6's deploy-3 review closed out; deploy 4 authorised

**The provider is now xAI, not OpenRouter/DeepSeek.** Adam chose an xAI API key on 2026-11-25 for the
executor that will answer queued questions, and approved the disclosure rewrite at 11:03. The earlier
record of 2026-11-24 (decision 4, OpenRouter calling `deepseek/deepseek-v3.2`) described the provider as it
was understood then; it is superseded **for the group-AI-chat answer path only**, and the historical design
documents that mention OpenRouter are left unedited as records of that date. The model id is supplied to the
executor through an environment variable rather than written into code, so a model change is a
configuration change and not a code change. Commit `8f9f948` rewrites the one live consent statement
("these contents leave CityLink and go to an external provider: xAI (United States), processed in the United
States") and updates contract §7 item 2 to match; the two verbatim-pinned statements are untouched, and a
test now asserts that OpenRouter, DeepSeek and "mainland China" no longer appear, so the copy cannot drift
back silently.

**Role 6's deploy-3 review found no blocker in the bytes, and asked for two things that were already past.**
It reviewed blob `5046eee2…` (the same sha256 that was applied) and confirmed the output columns against
deploy 1's table, the `begin;`-before-DDL ordering, the `revoke` naming all four roles, and — the finding
that mattered most — that `finish_group_ai_request` still accepts a `processing` row, so a claimed request
cannot be stranded. Its two pre-authorisation items (C-1, an apply-test pin; C-2, the contract naming the new
function) arrived after Adam's 10:55 authorisation and after the 02:56:24Z apply, so they were completed as
follow-ups rather than preconditions; that ordering is recorded here rather than smoothed over. `8f9f948`
adds three apply cases and two static pins, and the applies suite now runs **32/32 on PostgreSQL 17.12**,
which also closes the earlier gap that all apply evidence came from 16.15 while both Supabase targets run 17.

**Deploy 4 is the index Role 6 raised as C-3, and Adam chose to add it.** His words at 11:11 on 2026-11-25:
"2. add it as deploy 4". The file is `docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY4.sql`, 25 lines,
sha256 `f37b264e176f0303f49554994342c6978dc8cba520bae05f307001f6c6816796`; it creates
`group_ai_requests_queued` on `(created_at, id) where status = 'queued'`, the predicate the claim filters on
literally. Measured on a throwaway PostgreSQL 17.12 cluster: the index is created with that predicate and the
claim query plans as `Index Scan using group_ai_requests_queued`; with an empty table the planner still
prefers a sequential scan, which is correct and is why the plan was taken with `enable_seqscan = off` — the
claim being proven is that the index is _usable_, not that an empty table needs it.

**D-1: questions with attached files are not yet answerable, and Adam chose option b.** Deploy 3 returns the
`files` array, but no service-role path can turn a file id into content or an object key: `group_files` is
revoked from `service_role`, the two P1 read functions are granted to `authenticated` only, and the signer
Edge Function has never been deployed. Adam's choice of option b means deploying a service-role signing path,
which needs its own deployment authorisation and is not covered by any record above. Until it exists, a
question with a file is claimed and then stalls; the QA brief must say so, or the first report will read as
"AI file reading is broken".

**Deploy 4 applied to Launch, 2026-11-25 03:19Z.** The file was applied through the Supabase connector
`execute_sql` (the same route as deploys 1–3, since the sandbox has no psql connection string and no secret
store). The in-file target assertion returned empty, which is a pass; `pg_indexes` then reported
`CREATE INDEX group_ai_requests_queued ON public.group_ai_requests USING btree (created_at, id) WHERE (status = 'queued'::text)`
with `indisvalid = true`, and the two queued requests from Eunice's pass were untouched (2 queued, 2 total).
The file is promoted byte-identically to `supabase/migrations/20261125031926_kayk_ai_chat_deploy4.sql` and the
ledger row `20261125031926` / `kayk_ai_chat_deploy4` was written with `created_by =
citylink-coordinator-20261125-postapply`, matching the three rows before it. Promotion is after the fact, as
with deploys 1–3: the ledger records what ran, it did not drive it.

## 2026-11-25 — Signing path authorised, executor authorised, disclosure wording accepted

**Adam's three answers at 11:33.** (1) The service-role signing path is authorised — option b of Role 6's
D-1. (2) The xAI key is ready and the executor is authorised; the key itself still arrives through a secure
card at deployment time and never appears in chat, the repo or a browser bundle. (3) The disclosure wording
is accepted as written, so the live sentence stands and no retention or training claim is added to it.

**A correction to the premise behind option b.** Role 6 recorded that "PR #66's signing Edge Function was
never deployed". That is not accurate: `group-file-signer` was deployed to Launch on 2026-11-24 and
redeployed as version 2 (function id `87c2d055-09c8-49ec-ad93-e149c8cda91c`), with `SITE_ORIGIN` set and the
preflight `OPTIONS` check verified — see the 2026-11-24 17:13 and 17:20 entries above. What is true is
narrower and still matters: **the deployed signer authenticates user JWTs only**, so it cannot serve a
service-role executor that has no user token. The gap is a missing service-role route, not a missing
deployment.

**And signing yields bytes, not text.** The P1 migration stores no extracted text: `group_files` has no
`extracted_text` or character-count column, and the AI contract's line that "text is extracted server-side"
describes an intention that has no storage behind it yet. A signed download URL therefore gives the executor
a file it must parse itself. That is a real design choice rather than an implementation detail — extraction
in the executor means every answer path carries an xlsx/PDF parser, while extraction at upload time means a
schema change and a backfill — and it is recorded here as open, not silently decided.

**The executor is deployed, and it cannot answer yet.** Adam authorised the deployment at 11:42 on 2026-11-25
("authorized"). `group-ai-executor` was deployed to Launch `pijslbchvstkoweslymr` through the Supabase
connector's `deploy_edge_function`: function id `446f45a0-bf3c-4106-bde4-ee4e5ce65100`, version 1, status
ACTIVE, `verify_jwt = true`. The function authenticates its caller itself by comparing the bearer token to the
service-role key, so `verify_jwt` is a second lock rather than the only one.

It will return `executor_not_configured` until two secrets exist, and no connector tool can set Edge Function
secrets: `XAI_API_KEY` and `XAI_MODEL` have to be entered in the Supabase dashboard by Adam. That is the
fail-closed path working as designed, not a defect — an executor that quietly answered with a default model
would be worse. The model id is a configuration value, so changing it later is not a code change.

**Model and display name settled, 2026-11-25 11:54.** Adam accepted `grok-4.7` as `XAI_MODEL` and confirmed
that the two secrets are in place on Launch. He chose option A for the assistant's display name: it stays
`CityLink AI`, so no SQL change, no new blob and no constraint edit — the name a student sees above an AI
reply is unchanged, and "CityLink Assistant" is not used anywhere in the product. The model id remains a
configuration value; switching it later is a dashboard edit, not a code change.

**First end-to-end answers, 2026-11-25 12:20Z.** Adam invoked `group-ai-executor` from the dashboard tester
and got five answers: the two requests left over from Eunice's first pass plus three queued later. Verified
from the database rather than from the HTTP response — all five are `status = ready`, `error_code` is null,
and each has **exactly one** `group_chat_messages` row with `author_kind = 'ai'`, `sender_name_snapshot =
'CityLink AI'` and `ai_request_id` pointing at its request. Message lengths 52–143 characters, well inside
the 2,500 cap. Three of the five carried `dropped_context = true` with `chat_chars = 3206`, and their bodies
begin with the dropped-context notice, so notice-before-cap ordering holds in practice, not only in tests.

**The 401 detour, recorded because it cost three rounds.** The tester's first box is the header _name_, so
`Bearer` went out as a header called `Bearer` and `Authorization` arrived empty. Before that surfaced, two
real defects were found and fixed: `atob` rejects an unpadded base64url payload, so the role-claim check
refused every valid token; and one deploy claimed to add a diagnostic that a failed string replacement had
silently dropped, which is why the first 401 body was bare. The refusal now returns the caller's role and the
token length, which is what separated "wrong key" from "no header at all".

**Still open.** Questions with attached files remain untestable: the executor can only read text-shaped
attachments, and the signer's service-role route does not exist yet, so a spreadsheet or PDF yields the
"no readable text" notice. `turns` rows carry `{id, body}` and no sender name, so prompts currently attribute
every turn to "成員"; that is a prompt-fidelity gap, not a correctness bug, and it is worth fixing when the
executor gets its next revision.

**The AI drawer is on the public demo, and that creates a tracked divergence.** Adam chose "port" on
2026-11-25. The WebDev project builds from its own `main` (checkout `/home/ubuntu/citylink`), which had zero
references to `GroupAiDrawer`; the feature lives only on `feature/kayk-ai-analysis`. Ten files were copied
verbatim — the drawer and its CSS, `aiChatConsent.ts`, `GroupChatPage.tsx`, `supabaseStage6.ts`, and five
`shared/` modules — and for the two modified files the branch diff and the two-dot diff against main were
identical, which is the evidence that main had not moved since the branch point and nothing was overwritten.
`corepack pnpm check` and `corepack pnpm build:static` both passed before the push. Commit `e09f928` on the
WebDev `main` triggered automatic publication, and the live bundle now serves `assets/index-DLlAAR4i.js`
containing `Ask CityLink AI` and the consent strings.

**What this costs.** The demo's `main` now carries AI client code that the reviewed branch has not merged, so
the two copies must not be edited independently: PR #67 remains the source of truth, and when it merges its
versions win and `e09f928` becomes redundant. Anyone reading the demo's history should treat `e09f928` as a
port, not as a review.

**Also checked before publishing.** The stored `VITE_SUPABASE_PUBLISHABLE_KEY` description still claims it
holds the Prototype key; the live bundle proves otherwise — it references `pijslbchvstkoweslymr`, contains
`sb_publishable_`, and has no Prototype ref and no legacy JWT. The description is stale text, not a stale
value, and it should be corrected the next time that secret is touched.
