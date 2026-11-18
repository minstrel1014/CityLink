# Stage 6 live QA — Test project (2026-11-18)

Scope: disposable Test project `wkzclgmhrtecnpexfesr` only. Main was not accessed. Adam approved Test data and accounts, and enabled sign-ups without email confirmation for this test.

Method: three real Test accounts signed in through Supabase Auth and called the deployed RPCs through PostgREST with their own access tokens, exactly as the browser app does. This tests the live database behaviour with real sessions; it is not a click-through of the UI.

## Accounts and data

| Role                                                  | Test account (user id)                 |
| ----------------------------------------------------- | -------------------------------------- |
| Alice — creates the group, sends chat, creates a post | `c38d4f34-2351-4ca9-8851-4a0f15843148` |
| Bob — invitee, then former member                     | `01658e3a-2a04-44cf-a9a3-5fcf63ea87ea` |
| Cara — coursemate, never a member                     | `a7b4eb26-c815-4cd6-8258-c1b3100f4f94` |

All three were enrolled in course `0f2e29bd-21c0-4f77-8dc3-ec5b20b83dce` (2026-Fall). Alice created group `aa2e01ea-516c-4e69-927c-3df50b4b0e75` and invited Bob, who accepted.

QA rows are clearly identifiable: display names are the default “New CityLink member”, the group name is empty, and the accounts use `citylink.qa.*` emails. The group is now abandoned and its post closed. Deleting these QA rows needs a separate approval because the project forbids Test deletions without one.

## Results

| #   | Check                               | Expected                                     | Actual                                              | Result |
| --- | ----------------------------------- | -------------------------------------------- | --------------------------------------------------- | ------ |
| 1   | Alice creates group and invites Bob | Group + pending invitation                   | `group_id`, `invitation_id` returned                | Pass   |
| 2   | Bob accepts invitation              | `accepted`                                   | `accepted`, membership active                       | Pass   |
| 3   | Alice sends a chat message          | Message id                                   | Message id returned                                 | Pass   |
| 4   | Bob reads chat after sending        | Sees message with sender and timestamp       | 1 message, sender name and `created_at` present     | Pass   |
| 5   | Cara (outsider) reads chat          | Denied                                       | `not authorized to read this group chat`            | Pass   |
| 6   | Cara sends to chat                  | Denied                                       | `only active group members may send messages`       | Pass   |
| 7   | Alice chat access                   | `can_read=true, can_send=true`               | Same                                                | Pass   |
| 8   | Cara chat access                    | Denied                                       | `not authorized to read this group chat`            | Pass   |
| 9   | Alice creates a recruitment post    | Post id                                      | Post id returned                                    | Pass   |
| 10  | Cara lists posts                    | Open, Apply enabled, manage false, 2 members | `open`, `apply_enabled=true`, `can_manage=false`, 2 | Pass   |
| 11  | Bob lists posts                     | Apply disabled (already a member)            | `apply_enabled=false`                               | Pass   |
| 12  | Alice lists posts                   | Manage true, Apply false (own group)         | `can_manage=true`, `apply_enabled=false`            | Pass   |
| 13  | Bob leaves; reads history           | Allowed                                      | 1 message returned                                  | Pass   |
| 14  | Bob leaves; sends                   | Denied                                       | `only active group members may send messages`       | Pass   |
| 15  | Bob chat access after leaving       | `can_read=true, can_send=false`              | Same                                                | Pass   |
| 16  | Alice (last member) leaves          | Group abandoned, creator cleared             | `status=abandoned`, `creator_id=null`               | Pass   |
| 17  | Post auto-closes on group end       | `closed` with `closed_at`                    | `closed`, timestamp set                             | Pass   |
| 18  | Cara lists the closed post          | `closed`, no group details, Apply off        | `closed`, `group_id=null`, `apply_enabled=false`    | Pass   |
| 19  | Alice (former member) reads history | Allowed                                      | 1 message returned                                  | Pass   |
| 20  | Alice (former member) sends         | Denied                                       | `only active group members may send messages`       | Pass   |

Direct browser-role reads of `group_chat_messages` and `group_recruitment_posts` return `401 / 42501 permission denied`, confirming the tables stay closed to direct access.

## Observations (not failures)

- Groups created by `create_group_and_invite` have an empty name. The Stage 5 RPC does not take a name argument; the UI should either show a fallback label or Stage 5 should add naming later.
- QA profiles have no `display_name`, so messages and posts show the default “New CityLink member”. Real students who set a name will see it.
- My first check of abandonment ran inside the same SQL statement as the membership update, so it read the pre-trigger snapshot and looked wrong. Re-querying afterwards showed the correct `abandoned` state; the trigger had fired.
- No leave-group RPC exists, so “leaving” was simulated by updating the membership row, which fired the same triggers the application would.

## Not covered here

- Clicking through the browser UI (buttons, loading and error states) on the Test-connected app.
- Main promotion of Stage 6.
- Deleting QA rows.

## Next step

Sync the demo to `main` and publish, then optionally run a short browser click-through as Alice.
