# Notification icon — requested feature (backlog)

**Status:** Requested by the CityLink project lead (Adam) on 2026-11-17. **Not approved for implementation.** This document records the request and the decisions still needed; it does not authorize code, database, or API changes.

**Request (plain language):** Add a notification icon (a bell) in the **top-right corner** of the signed-in pages. It should show when a student receives a group invitation, when an invitation is accepted or declined, when a join request is approved or rejected, and similar group events, so students do not have to keep opening My Groups to check.

## Where it would live

- The authenticated navigation is built in `client/src/components/citylink/Shared.tsx` (nav items such as `My profile` / `My Courses` / `My groups` around line 126).
- Several authenticated pages also render their own header links, for example `client/src/pages/citylink/MyCourses.tsx` (lines 46–49), `AuthenticatedMyGroup.tsx`, `AuthenticatedCoursePeers.tsx`, `AuthenticatedProfile.tsx`, and `StudentPortfolio.tsx`.
- To avoid five separate bells, v1 should put one shared header component there and reuse it on every signed-in page.

## Events to notify (proposed list — needs confirmation)

| Event                                          | Who is notified           | Source                              |
| ---------------------------------------------- | ------------------------- | ----------------------------------- |
| Group invitation received                      | Invitee                   | `group_invitations`                 |
| Invitation accepted / declined                 | Inviter (and leader)      | `group_invitations`                 |
| Join request received                          | Current group leader only | `group_join_requests`               |
| Join request approved / rejected               | Requester                 | `group_join_requests`               |
| Leadership transferred after a leader leaves   | New leader                | membership/group trigger            |
| Chat message in a group the student belongs to | Active members            | Stage 6 chat (not built yet)        |
| Recruitment post application                   | Post author               | Stage 6 recruitment (not built yet) |

## Open questions for the lead (do not guess)

1. **Trigger list:** Which of the events above belong in v1? Group events only, or also Stage 6 chat/recruitment events later?
2. **Badge style:** A number of unread items, or just a dot? Should opening the panel mark everything read, or should each item be marked individually?
3. **Delivery:** Is polling enough (check on page load and every 30–60 seconds), or must it update live with Supabase Realtime?
4. **Data source:** Derive notifications from the existing invitation/request rows (no new table), or add a dedicated `notifications` table with `read_at`? A new table needs Role 6 review, a reviewed migration, and separate lead approval before Test.
5. **Retention:** Keep notifications forever, delete after a period (for example 30 days), or remove an item once the user acts on it?
6. **Owner:** Who implements it? It touches Roy's group data, the shared header (integration lead), and QA (Eunice). A real owner name must be supplied.

## Proposed minimal v1 (proposal only, not approved)

- One bell button in the shared authenticated header, top-right, before the profile links.
- Badge shows the unread count; clicking opens a small panel listing recent events with a link to `/my-groups` or the relevant course page.
- Reads existing `group_invitations` and `group_join_requests` rows through a narrow, recipient-only RPC; no direct table reads, no new permissions.
- Polls on page load and every 60 seconds; no Realtime in v1.
- Empty, loading, error, and signed-out states follow the existing CityLink patterns.

If the lead prefers a dedicated `notifications` table instead, that becomes a database change and must follow the normal path: Role 6 review → reviewed migration → separate lead approval → Test only → never Main.

## Roles affected

- **Project/integration lead:** shared header UI and coordination.
- **Roy:** group invitations, join requests, and membership events (the notification source).
- **Jeffery:** only if chat or recruitment events are included later.
- **Eunice:** QA and live multi-account testing.
- **Role 6:** only if a new table or RPC is proposed.

## Tests to expect when approved

- Unit tests for the unread-count and badge logic.
- Service tests that the RPC returns only the signed-in student's notifications.
- Live multi-account check: invite from one Test account, confirm the bell appears on the other.
- RLS check if a new table is added.

## Next step

The lead answers questions 1–6 above. Then the work is assigned to a real owner, a feature branch is created from the latest `main`, and implementation starts. Until then this stays a backlog note only.
