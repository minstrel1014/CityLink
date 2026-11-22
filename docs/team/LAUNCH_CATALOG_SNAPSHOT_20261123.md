# CityLink Launch — public function catalog snapshot (read-only)

Captured 2026-11-23 02:26 by the coordinator with a single read-only `pg_proc` query against `pijslbchvstkoweslymr`. No row was read, nothing was written. Provided so Role 6 can build the return-type matrix without a connector of its own.

| function                              | signature                       | returns                                                                                                          |
| ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| cancel_group_invitation               | (uuid)                          | void                                                                                                             |
| cancel_group_join_request             | (uuid)                          | void                                                                                                             |
| close_group_recruitment_post          | (uuid)                          | void                                                                                                             |
| create_group_and_invite               | (uuid,uuid)                     | TABLE(group_id uuid, invitation_id uuid)                                                                         |
| create_group_recruitment_post         | (uuid,text)                     | uuid                                                                                                             |
| edit_group_recruitment_post           | (uuid,text)                     | void                                                                                                             |
| enforce_invitation_integrity          | ()                              | trigger                                                                                                          |
| get_current_term_group_member_profile | (uuid,uuid)                     | TABLE(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[])                    |
| get_group_chat_access                 | (uuid)                          | TABLE(can_read boolean, can_send boolean)                                                                        |
| handle_new_user                       | ()                              | trigger                                                                                                          |
| list_course_classmates                | (uuid)                          | TABLE(profile_id, student_id, display_name, major, year, bio, skills, status)                                    |
| list_course_group_invite_candidates   | (uuid)                          | TABLE(profile_id uuid)                                                                                           |
| list_course_group_summaries           | (uuid)                          | TABLE(profile_id, group_id, group_name, group_status, group_size bigint)                                         |
| list_current_course_enrolment_counts  | ()                              | TABLE(course_id uuid, enrolled_count bigint)                                                                     |
| list_current_term_course_groups       | (uuid,text,uuid,integer)        | TABLE(group_id, group_name, group_status, active_member_count bigint, can_create_post boolean, has_more boolean) |
| list_current_term_group_members       | (uuid,timestamptz,uuid,integer) | TABLE(profile_id, display_name, major, year, bio, skills, cursor_joined_at, cursor_membership_id, has_more)      |
| list_group_chat_messages              | (uuid,timestamptz,uuid,integer) | TABLE(message_id, sender_name, body, created_at)                                                                 |
| list_group_recruitment_posts          | (uuid,timestamptz,uuid,integer) | **TABLE(13 columns — no `subject`)**                                                                             |
| rename_study_group                    | (uuid,text)                     | void                                                                                                             |
| request_to_join_group                 | (uuid)                          | uuid                                                                                                             |
| respond_to_group_invitation           | (uuid,boolean)                  | text                                                                                                             |
| review_group_join_request             | (uuid,boolean)                  | text                                                                                                             |
| send_group_chat_message               | (uuid,text)                     | uuid                                                                                                             |
| send_group_invitation                 | (uuid,uuid)                     | uuid                                                                                                             |
| visible_course_enrolments             | ()                              | TABLE(student_id uuid, course_id uuid)                                                                           |

Absent on Launch but created by the reviewed blob: `list_course_group_summaries_capacity`, `list_current_term_course_groups_capacity`, `list_group_recruitment_posts_capacity`, `remove_group_member`, `set_group_max_members`. Those are new objects, so no collision is possible for them.

## Coordinator's spot comparison (not a substitute for Role 6's matrix)

Of the thirteen functions the blob creates or replaces, the ones I compared against this snapshot match except one: `list_group_recruitment_posts` returns 13 columns on Launch and the blob redefines it with 14, which is F17. `list_course_group_summaries` (5), `list_current_term_course_groups` (6), `request_to_join_group` (uuid) and `respond_to_group_invitation` (text) all match. Role 6 must complete the matrix rather than rely on this paragraph.
