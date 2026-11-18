# People-page naming migration — Test application record

**Owner:** integration lead. **Approved by:** Adam, 2026-11-18 ("write the executable migration, run the preflight on Test, and apply it to Test only"). **Role 6:** proposal approved after all five blockers were cleared; no SQL executed by Role 6.

## Scope

Single forward-only migration, `supabase/migrations/20261118083000_stage6_people_page_naming.sql`, applied to the disposable Test project `wkzclgmhrtecnpexfesr` only. Main was not accessed or changed.

## Preflight on Test (before apply)

| Check                                     | Result  |
| ----------------------------------------- | ------- |
| Display names not trimmed or outside 1–50 | 0       |
| Default `New CityLink member` profiles    | 9 of 21 |
| Group names non-empty and invalid         | 0       |
| Empty legacy groups                       | 5 of 7  |

The preflight passed, so both new constraints were created `NOT VALID` and then validated.

## Applied migration

- Recorded version: `20261118082247`, name `stage6_people_page_naming`.
- Start/end: 16:22 +08:00, success, no errors.
- The tool records the application time as the version; the file content is the reviewed migration.

## Verified after apply

- `profiles_display_name_length_chk`, `study_groups_name_length_chk` and `group_recruitment_posts_subject_length_chk` all exist and are **validated**.
- `update_own_display_name(text) returns text`, `create_group_and_invite(uuid, uuid, text)`, `rename_study_group(uuid, text) returns void`, `list_course_ungrouped_classmates(...)`, `get_current_term_coursemate_profile(...)`, `create_group_recruitment_post(uuid, text, text)`, `edit_group_recruitment_post(uuid, text, text)` and `list_group_recruitment_posts(...)` returning `subject` all exist.
- Old two-argument overloads are gone: `create_group_and_invite(uuid, uuid)`, `create_group_recruitment_post(uuid, text)` and `edit_group_recruitment_post(uuid, text)`.
- Every replaced or new RPC is executable by `authenticated` only; `anon` has none.
- Existing posts were backfilled with `'Recruitment post'`; the subject column is `NOT NULL`.

## What is not verified yet

No RPC was invoked as a signed-in Test user in this step. Runtime behaviour — name gate, 50/51-character limits, leader rename, one-member group member list, ungrouped list, subject create/edit — needs live QA after the client is updated. The old client still calls the removed two-argument group-creation RPC and will show "function not found" until the client work merges.

## Next steps

1. Client work on the same branch: name gate and profile edit through `update_own_display_name`; group creation form with name; leader rename panel; people page; subject fields; member lists on posts.
2. `pnpm check`, `pnpm test`, `pnpm build`, then live QA with the QA accounts.
3. Sync the demo after review. Main only under a new written authorization from Adam.
