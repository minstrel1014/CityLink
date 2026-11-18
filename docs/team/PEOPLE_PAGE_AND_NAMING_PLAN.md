# Course page, private chat and naming — approved direction

Requested by Adam on 2026-11-18. This records the agreed direction and the work needed. Nothing below is implemented yet; database changes still need Role 6 review and a separate Test approval.

## Approved direction

1. **Private chat.** Non-members never see an "Open chat" link. The server already refuses chat reads and sends to anyone who is not an active or former member; the course page currently shows the link to everyone, which is misleading.
2. **Course page shows people.** The course page lists the existing groups, the recruitment posts, and the coursemates in that course who have no group. It must **not** show the group the viewer already belongs to.
3. **My Groups is the home of the viewer's own group.** The group card there carries the management panel (members, leader actions) and the **private group chat** button. Chat is its own chat-room page.
4. **Group names.** A group name is required when creating a group, at most **50 characters**, and only the current group leader may change it later.
5. **Display names.** Every student must set a display name before using CityLink, at most **50 characters**. The name can be edited once for free from the profile. Existing accounts still on "New CityLink member" are prompted once.
6. **One group per student.** A student can hold only one active group membership (scope still to confirm — see questions).

## Work required

### Database (needs Role 6 review, Test first, Main only with Adam's written approval)

- `create_group_and_invite`: add a required group-name parameter, trimmed, 1–50 characters.
- New RPC `rename_study_group(group_id, new_name)`: current leader only, 1–50 characters, same validation.
- New RPC for the course page's "students without a group": same current term and course, active enrolment, no active membership in that course, returns only the approved profile fields, paginated.
- Confirm the existing one-active-membership-per-course constraint (or add it if the scope is per course).
- Display-name rules: database check for 1–50 characters and a guard against setting the literal default; decide whether the "once" edit limit is enforced in the database or only in the UI.
- Existing unnamed groups: decide whether the leader is prompted to name them or they keep the "Study group" fallback.

### Client

- Course page: three sections (groups, recruitment posts, ungrouped coursemates); remove the viewer's own group from the list; remove "Open chat" from group cards.
- My Groups: own-group card with members, management panel, rename form (leader only) and "Open group chat" button.
- Chat: keep the existing chat-room page; ensure it is reachable only from My Groups.
- Group creation form: required name field with counter and validation.
- First-login display-name prompt: blocking until set, editable once from the profile.

### Tests

- RPC validation: empty, whitespace-only, 51-character and valid names; non-leader rename rejected.
- Course page: own group hidden, ungrouped students listed, no chat link for non-members.
- Display-name prompt: new account, existing default account, once-only edit.

## Open questions for Adam

1. **"One group" scope:** one group per course (current database rule) or one group total across every course?
2. **"Once for free":** after the first edit, is the display name locked forever, or can it be edited again? There is no payment feature, so "free" has no later price.
3. **Existing unnamed groups:** prompt the leader to name them, or leave them as "Study group" until renamed?
4. **Ungrouped student fields:** display name only, or also year, major and skills (the profile page already shows these to coursemates)?
5. **Joining from a group card:** should non-members get a "Request to join" button on each group card, or only through recruitment posts as today?
6. **Display-name gate:** block every page until a name is set (full-screen prompt), or allow browsing and prompt on first group action?

## Suggested order

1. Adam answers the six questions; the lead records them in `docs/team/DECISIONS.md`.
2. Migration proposal → Role 6 review → Adam's Test approval → apply to Test.
3. Roy builds group naming and the My Groups panel; the lead builds the course people page and the display-name prompt; Eunice tests.
4. Main promotion only after Adam's separate written authorization.
