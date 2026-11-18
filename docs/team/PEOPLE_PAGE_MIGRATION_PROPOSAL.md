# Proposal — course people page, group naming, recruitment subject, display names

Prepared 2026-11-18 for Role 6 review. **Not approved, not a migration, nothing executed.** Target project for application after approval: disposable Test `wkzclgmhrtecnpexfesr` only.

## Approved product decisions (Adam, 2026-11-18)

1. One active group **per course** per student (already enforced by `group_memberships_one_active_per_student_course_term_idx`).
2. Display names can be edited again without limit for now.
3. Existing unnamed groups: the leader is prompted to name them.
4. Ungrouped list shows name, year, major, skills, and links to a profile page.
5. Joining stays recruitment-post-only. The group management panel gets a "Create recruitment post" button; posts require a **subject** and body; each post lists the group's members, clickable to profiles.
6. Display-name gate blocks every page until a name is set.

## Proposed migration (single file, forward-only)

Candidate version: `20261118080000_stage6_people_page_naming.sql`.

### 1. Constraints

- `profiles_display_name_length_chk` on `profiles`:
  `display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 50`, added `NOT VALID`.
  Reason for `NOT VALID`: the sign-up trigger inserts `'New CityLink member'` (19 characters, passes length), so existing rows are fine, but adding the constraint `NOT VALID` keeps the migration safe if any legacy row is out of range. The "must not stay on the default" rule is a client gate, because a table check that rejects the default would break the sign-up trigger. Role 6 should confirm this trade-off.
- `study_groups_name_length_chk` on `study_groups`:
  `name = btrim(name) AND char_length(name) BETWEEN 1 AND 50`, added `NOT VALID` so today's unnamed groups stay readable until their leaders rename them.

### 2. Group creation and rename

- Drop and recreate `create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text)`:
  - same eligibility, locking and invitation logic as today;
  - `p_name` trimmed, required, 1–50 characters, otherwise `raise exception 'group name must contain 1 to 50 characters'`;
  - the group insert writes `name = p_name`.
  - The old two-argument signature is dropped, so the old client fails with "function not found" until the new client deploys. Rollout order below.
- New `rename_study_group(p_group_id uuid, p_name text) returns text`:
  - requires `auth.uid()`;
  - trims and validates the name;
  - locks the group row `FOR UPDATE`;
  - only `study_groups.creator_id = auth.uid()` may rename, otherwise `raise exception 'only the current group leader may rename this group'`;
  - allowed while the group is `forming` or `active`; abandoned/archived groups cannot be renamed;
  - returns the stored name.

### 3. Course group list

`list_current_term_course_groups` is recreated with one added filter so the viewer's own group never appears on the course page:

`AND NOT EXISTS (SELECT 1 FROM public.group_memberships AS own_m WHERE own_m.group_id = g.id AND own_m.profile_id = (SELECT auth.uid()) AND own_m.membership_status = 'active')`

Everything else (two-active-member minimum, current term, enrolment, field list, ordering) stays unchanged.

### 4. Ungrouped coursemates and their profiles

- New `list_course_ungrouped_classmates(p_course_id uuid, p_after_display_name text DEFAULT NULL, p_after_profile_id uuid DEFAULT NULL, p_limit integer DEFAULT 25)`
  returns `(profile_id uuid, display_name text, year smallint, major text, skills text[], has_more boolean)`.
  - viewer must be signed in and enrolled in a current-term course;
  - target must be enrolled in the same course and term;
  - target must have **no active membership** in that course and term;
  - excludes the viewer;
  - ordered by `display_name, profile_id`, keyset pagination, limit 1–100;
  - only the approved fields: `display_name`, `year`, `major`, `skills` (no `bio` in the card list).
- New `get_current_term_coursemate_profile(p_course_id uuid, p_profile_id uuid)`
  returns `(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[])`.
  - viewer and target must both be enrolled in the same current-term course;
  - returns only the approved profile allowlist (`display_name`, `major`, `year`, `bio`, `skills`), never `student_id` or account `status`;
  - no group membership required, so an ungrouped student's profile is reachable.

### 5. Recruitment posts

- `ALTER TABLE public.group_recruitment_posts ADD COLUMN subject text;`
  Backfill existing rows with `'Recruitment post'`, then `SET NOT NULL`.
  Add `group_recruitment_posts_subject_length_chk`: `subject = btrim(subject) AND char_length(subject) BETWEEN 1 AND 120` (validate after backfill).
- Drop and recreate `create_group_recruitment_post(p_group_id uuid, p_subject text, p_body text)`:
  same membership, group-status, lock-order and current-term checks as today; subject trimmed 1–120; body unchanged 1–2000.
- Recreate `edit_group_recruitment_post` with `p_subject` alongside the body (same author and membership checks as today).
- Recreate `list_group_recruitment_posts` to return `subject` in addition to the existing fields. Existing member counts and `apply_enabled` logic are unchanged.
- `close_group_recruitment_post` is unchanged.
- Post member lists reuse the existing `list_current_term_group_members(p_group_id, …)`; a post whose group is no longer forming/active keeps today's "Group details unavailable" behaviour.

### 6. Grants

- New and replaced public RPCs: `revoke all on function … from public, anon; grant execute … to authenticated;` matching current Stage 5/6 practice.
- No new table privileges. `group_recruitment_posts` keeps no direct client `SELECT` or DML; everything goes through the RPCs.
- `rename_study_group` and the two new read RPCs follow the same pattern.

## Rollout order

1. Role 6 review of this proposal; Adam approves the Test application separately.
2. Apply the migration to Test and verify objects and grants.
3. Merge the client changes (create form sends `p_name`; rename panel; people page; subject field; member lists on posts; display-name gate).
4. Sync the demo, then live QA with the three QA accounts.
5. Main only under a new written authorization from Adam.

The short window where the old client calls the removed two-argument `create_group_and_invite` is acceptable because group creation returns a clear error and no data is written; step 3 should follow immediately.

## Test plan

- Create a group without a name → rejected; with 51 characters → rejected; valid name stored.
- Non-leader rename → rejected; leader rename → stored; abandoned group rename → rejected.
- Course group list hides the viewer's own group and keeps the two-member rule.
- Ungrouped list excludes members, the viewer and other courses/terms; pagination works; only allowlisted fields returned.
- Coursemate profile RPC refuses a student outside the course and returns no `student_id`/`status`.
- Post creation without subject → rejected; with subject → stored and listed; edit keeps subject; existing posts show the backfilled subject.
- Display-name gate: new signup, existing default account, 50/51 characters.

## Open technical questions for Role 6

1. Is the `NOT VALID` length-check approach acceptable for both constraints?
2. Should the "cannot stay on `New CityLink member`" rule be enforced server-side despite the sign-up trigger (for example, a trigger that only rejects a profile **update** to the default), or is the client gate enough for v1?
3. Any objection to backfilling old posts' subject as `'Recruitment post'` rather than deriving it from the body?
4. Should `get_current_term_coursemate_profile` also be limited to ungrouped students plus shared-group members, or is same-course eligibility enough for the profile view?
