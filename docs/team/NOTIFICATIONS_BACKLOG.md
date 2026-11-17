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

## Lead answers (2026-11-17)

| #   | Question     | Answer                                                                                                                                         |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trigger list | **Pending.** Plain-language explanation sent to the lead; group-only v1 versus including Stage 6 chat/recruitment events is not chosen yet.    |
| 2   | Badge style  | **Red dot**, not a number. Notifications are marked read **item by item**.                                                                     |
| 3   | Delivery     | **Polling**: the page asks for new notifications on load and every 60 seconds while it is open. No Realtime in v1.                             |
| 4   | Data source  | **Derive from existing invitation/request rows.** Still open: where the per-item read state is remembered (browser-only or a small table).     |
| 5   | Retention    | Keep notifications for **one semester**.                                                                                                       |
| 6   | Owner        | **Eunice**. This adds a feature to her existing scope; her base roles (Classmate Discovery; QA, live testing and documentation) are preserved. |

## Remaining questions for the lead (do not guess)

1. **Trigger list:** group events only in v1, or also Stage 6 chat/recruitment events once Stage 6 works?
2. **Per-item read state:** remember it only in the browser (no database change, lost on another device), or add a small read-state table (needs Role 6 review and a reviewed migration)?

## Proposed minimal v1 (proposal only, not approved)

- One bell button in the shared authenticated header, top-right, before the profile links.
- Badge shows a **red dot** when any unread item exists; clicking opens a small panel listing recent events, each marked read individually, with a link to `/my-groups` or the relevant course page.
- Reads existing `group_invitations` and `group_join_requests` rows through a narrow, recipient-only RPC; no direct table reads, no new permissions.
- Polls on page load and every 60 seconds; no Realtime in v1.
- Keeps items for **one semester**, then drops them.
- Empty, loading, error, and signed-out states follow the existing CityLink patterns.

If the lead prefers a dedicated `notifications` table instead, that becomes a database change and must follow the normal path: Role 6 review → reviewed migration → separate lead approval → Test only → never Main.

## Roles affected

- **Project/integration lead:** shared header UI and coordination.
- **Roy:** group invitations, join requests, and membership events (the notification source).
- **Jeffery:** only if chat or recruitment events are included later.
- **Eunice:** **feature owner** for the notification icon (added to her existing scope), plus QA and live multi-account testing.
- **Role 6:** only if a new table or RPC is proposed.

## Tests to expect when approved

- Unit tests for the unread-count and badge logic.
- Service tests that the RPC returns only the signed-in student's notifications.
- Live multi-account check: invite from one Test account, confirm the bell appears on the other.
- RLS check if a new table is added.

## Next step

The lead answers the two remaining questions above (trigger list, and where per-item read state is stored). Eunice then creates a feature branch from the latest `main`, and implementation starts. Until then this stays a backlog note only.
