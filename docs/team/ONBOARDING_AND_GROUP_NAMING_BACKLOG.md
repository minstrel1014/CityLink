# Backlog — group naming and first-login name prompt

Requested by Adam (project lead) on 2026-11-18. Status: **requested, not implemented**. Product details below are open questions until Adam answers them.

## Why

Two related gaps showed up during Stage 5/6 live testing:

1. **Groups have no name.** Stage 5's `create_group_and_invite` takes only a course and an invitee, so every group is created with an empty name. The UI currently falls back to "Study group". This makes group lists, chat headers and recruitment posts hard to tell apart.
2. **New accounts show "New CityLink member".** The sign-up trigger fills `profiles.display_name` with that default and nothing ever asks the student for their real name, so coursemates, chat messages and posts show the placeholder.

## Requested behaviour

- When a student creates a group, let them **name the group** at creation time.
- When a student **signs in for the first time**, ask them to **set their display name**.

## Affected areas

| Area                 | Change needed                                                                                                                   | Likely owner                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Database / RPC       | `create_group_and_invite` needs a group-name parameter (new migration; Test first, Main only with Adam's written authorization) | Roy, with Role 6 review      |
| Group creation UI    | Name field in the create-group form, validation and error states                                                                | Roy                          |
| Profile / onboarding | First-login prompt, save to `profiles.display_name`, skip/retry behaviour                                                       | Lead or Kayk, to be assigned |
| Existing users       | Decide whether accounts already on "New CityLink member" are prompted once                                                      | Adam                         |
| QA                   | Tests for empty, long, duplicate and edited names; first-login prompt on a fresh account                                        | Eunice                       |

## Data notes

- `profiles.display_name` already exists and is editable from the My Profile page, so no schema change is expected for the name prompt.
- A group-name column already exists (`study_groups.name`), currently always empty for new groups. The change is to the RPC signature and the UI, not a new column.
- Migration must be forward-only and applied to Test first. Main requires separate written approval.

## Open questions for Adam

1. **Group name required or optional?** If optional, keep "Study group" as the fallback.
2. **Length limit and trimming rules** (for example 3–80 characters, spaces trimmed, no all-space names).
3. **Can a group name be changed later?** By the leader only, or nobody in v1?
4. **Name prompt timing:** must the student set a name before using CityLink, or can they skip and be reminded later?
5. **Existing accounts:** should anyone still on "New CityLink member" see the prompt once at next sign-in?
6. **Display name rules:** length limit, and whether real-name or nickname is expected.

## Suggested next step

Adam answers the six questions, then the lead records them in `docs/team/DECISIONS.md`, Roy prepares the Test migration and UI for group naming, and a separate owner is assigned for the first-login prompt. Nothing here is implemented yet.
