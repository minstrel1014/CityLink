# Proposal — course people page, group naming, recruitment subject, display names

Prepared 2026-11-18, revised the same day after Role 6's static review. **Still a proposal: not approved, not a migration, nothing executed.** Target for application after approval: disposable Test `wkzclgmhrtecnpexfesr` only.

## Approved product decisions (Adam, 2026-11-18)

1. One active group **per course** per student (already enforced by `group_memberships_one_active_per_student_course_term_idx`).
2. Display names can be edited again without limit for now.
3. Existing unnamed groups: the leader is prompted to name them.
4. Ungrouped list shows name, year, major, skills, and links to a profile page.
5. Joining stays recruitment-post-only. The group management panel gets a "Create recruitment post" button; posts require a **subject** and body; each post lists the group's members, clickable to profiles.
6. Display-name gate blocks every page until a name is set.

## Role 6 review outcome (2026-11-18)

Role 6 reviewed the first draft and raised four blockers. This revision adopts all four:

| Blocker                                                               | Resolution in this revision                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No authorized display-name write path                                 | New `update_own_display_name` RPC; no direct column grant                              |
| Replacing `rename_study_group` with a `text` return fails             | Keep the existing `void` signature; only replace the body                              |
| `NOT VALID` does not check existing rows                              | Read-only preflight, repair decision, then `VALIDATE CONSTRAINT` for profiles          |
| 50-character check conflicts with sign-up trigger                     | Update `handle_new_user` to cap at 50 in the same migration                            |
| A `NOT VALID` group-name check still blocks updates to unnamed groups | The check explicitly allows the empty legacy marker, so lifecycle updates keep working |

Role 6 also confirmed: same-course, current-term eligibility is sufficient for the coursemate profile RPC; `'Recruitment post'` is a safe subject backfill; a client gate alone is not a security boundary.

## Proposed migration (single file, forward-only)

Candidate version: `20261118080000_stage6_people_page_naming.sql`.

### 1. Preflight (read-only, run before writing the file)

```sql
select count(*) filter (where display_name <> btrim(display_name)
                           or char_length(display_name) not between 1 and 50) as bad_profiles
from public.profiles;
select count(*) filter (where name <> ''
                           and (name <> btrim(name) or char_length(name) > 50)) as long_group_names
from public.study_groups;
```

Main currently has two profiles (`New CityLink member`, 19 characters) and no groups, so both counts are expected to be zero. Test must be checked before its application. If either count is non-zero, stop and ask Adam whether to repair the rows or grandfather them; do not apply blindly.

### 2. Display names

- Replace `public.handle_new_user()` so a metadata name is trimmed and capped at **50** characters instead of 120. The default `'New CityLink member'` (19) still passes.
- Add `profiles_display_name_length_chk`: `display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 50`, created `NOT VALID`, then `VALIDATE CONSTRAINT` immediately after the preflight confirms no invalid rows. This is a real validation, not permanent grandfathering.
- New `public.update_own_display_name(p_display_name text) returns text`:
  - `SECURITY DEFINER`, `search_path = ''`;
  - requires `auth.uid()`;
  - trims the value, requires 1–50 characters, and rejects `'New CityLink member'` with a clear error;
  - updates only `profiles.display_name` and `updated_at` for the caller;
  - `revoke all from public, anon; grant execute to authenticated;`
  - returns the stored name.
- No direct `display_name` column update grant is added; the RPC is the only write path. The client gate remains UX, not the security boundary.

### 3. Group creation and rename

- Drop `create_group_and_invite(uuid, uuid)` and create `create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text)`:
  - same eligibility, locking and invitation logic as today;
  - `p_name` trimmed, required, 1–50 characters, otherwise `raise exception 'group name must contain 1 to 50 characters'`;
  - the group insert writes `name = p_name`.
  - The old two-argument signature is removed, so the old client receives "function not found" until the new client deploys; no data is written in that window. Rollout order below.
- Replace the existing `public.rename_study_group(uuid, text) returns void` **without changing its signature or return type**. The body keeps today's behavior:
  - requires `auth.uid()`;
  - loads the group term, calls `private.lock_current_term`, then locks the group row `FOR UPDATE`;
  - requires the group to be current-term and `forming` or `active`;
  - requires `creator_id = auth.uid()` and, for active groups, an active membership;
  - trims the name and changes the limit from 1–120 to **1–50** with the message `group names must contain between 1 and 50 characters`;
  - existing grants stay in place because the signature is unchanged.
- Add `study_groups_name_length_chk`:
  `name = '' OR (name = btrim(name) AND char_length(name) BETWEEN 1 AND 50)`,
  created `NOT VALID` and then `VALIDATE CONSTRAINT` after the preflight confirms no long names.
  The empty string is the documented **legacy marker** for a group created before names were required. It stays allowed so status, creator and other lifecycle updates on those rows cannot fail; `create_group_and_invite` and `rename_study_group` both reject empty names, so no new empty group can be created through the API. The leader prompt asks each legacy group to rename itself, and a later cleanup can remove the marker.

### 4. Course group list

`list_current_term_course_groups` is recreated with one added filter so the viewer's own group never appears on the course page:

`AND NOT EXISTS (SELECT 1 FROM public.group_memberships AS own_m WHERE own_m.group_id = g.id AND own_m.profile_id = (SELECT auth.uid()) AND own_m.membership_status = 'active')`

Everything else (two-active-member minimum, current term, enrolment, field list, ordering) stays unchanged.

### 5. Ungrouped coursemates and their profiles

- New `list_course_ungrouped_classmates(p_course_id uuid, p_after_display_name text DEFAULT NULL, p_after_profile_id uuid DEFAULT NULL, p_limit integer DEFAULT 25)`
  returns `(profile_id uuid, display_name text, year smallint, major text, skills text[], has_more boolean)`.
  - viewer must be signed in and enrolled in a current-term course;
  - target must be enrolled in the same course and term;
  - target must have **no active membership** in that course and term;
  - excludes the viewer;
  - ordered by `display_name, profile_id`, keyset pagination, limit 1–100;
  - only the approved fields: `display_name`, `year`, `major`, `skills`.
- New `get_current_term_coursemate_profile(p_course_id uuid, p_profile_id uuid)`
  returns `(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[])`.
  - viewer and target must both be enrolled in the same current-term course;
  - returns only the approved profile allowlist (`display_name`, `major`, `year`, `bio`, `skills`), never `student_id` or account `status`;
  - same-course eligibility is sufficient (Role 6 answer 4); no group membership required.

### 6. Recruitment posts

- `ALTER TABLE public.group_recruitment_posts ADD COLUMN subject text;`
  Backfill existing rows with `'Recruitment post'`, then `SET NOT NULL`. Role 6 has no technical objection; Adam should confirm the label, and the UI should show it as a legacy default.
- Add `group_recruitment_posts_subject_length_chk`: `subject = btrim(subject) AND char_length(subject) BETWEEN 1 AND 120`, validated after the backfill.
- Drop and recreate `create_group_recruitment_post(p_group_id uuid, p_subject text, p_body text)`:
  same membership, group-status, lock-order and current-term checks as today; subject trimmed 1–120; body unchanged 1–2000.
- Recreate `edit_group_recruitment_post` with `p_subject` alongside the body (same author and membership checks as today).
- Recreate `list_group_recruitment_posts` to return `subject` in addition to the existing fields. Existing member counts and `apply_enabled` logic are unchanged.
- `close_group_recruitment_post` is unchanged.
- Post member lists reuse the existing `list_current_term_group_members(p_group_id, …)`.

### 7. Grants

- New and replaced public RPCs: `revoke all on function … from public, anon; grant execute … to authenticated;`.
- No new table privileges. `group_recruitment_posts` keeps no direct client `SELECT` or DML.
- `update_own_display_name`, the two new read RPCs and the replaced `rename_study_group` follow the same pattern.

## Rollout order

1. Role 6 re-reviews this revision; Adam approves the Test application separately.
2. Apply to Test, run the preflight first, verify objects and grants.
3. Merge the client changes (create form sends `p_name`; rename panel treats the call as `void`; people page; subject field; member lists on posts; display-name gate and edit through the RPC).
4. Sync the demo, then live QA with the three QA accounts.
5. Main only under a new written authorization from Adam.

The short window where the old client calls the removed two-argument `create_group_and_invite` is acceptable because group creation returns a clear error and no data is written; step 3 should follow immediately.

## Test plan

- Preflight returns zero invalid profiles and zero long group names.
- Create a group without a name → rejected; with 51 characters → rejected; valid name stored.
- Non-leader rename → rejected; leader rename → stored; abandoned group rename → rejected; existing current-term lock still applies.
- Updating an unnamed legacy group (for example abandoning it) still succeeds while the empty marker is present.
- Display name: 50 accepted, 51 rejected, `'New CityLink member'` rejected, whitespace trimmed; new sign-up with a 120-character metadata name stores 50.
- Course group list hides the viewer's own group and keeps the two-member rule.
- Ungrouped list excludes members, the viewer and other courses/terms; pagination works; only allowlisted fields returned.
- Coursemate profile RPC refuses a student outside the course and returns no `student_id`/`status`.
- Post creation without subject → rejected; with subject → stored and listed; edit keeps subject; existing posts show the backfilled subject.

## Decisions confirmed by Adam (2026-11-18)

1. The legacy subject label is `'Recruitment post'`.
2. Existing unnamed groups keep the empty-string legacy marker. The constraint allows that marker so lifecycle updates still work, while new names must be 1–50 characters.
