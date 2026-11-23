# Pre-blob reconciliation and the Launch return-type matrix (F17, F18, F19)

Status: static review plus a disposable local PostgreSQL 17.12 run. No Supabase
project was contacted, no migration was applied anywhere, and nothing here is an
application authorisation. The reviewed capacity blob is byte-identical to
`5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` before and
after this work; no `supabase/` file other than the new reconciliation migration
changed.

## 1. F17 — what actually fails, and on which targets

`20261119090000_group_hard_max.sql` replaces
`public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` with a
**14-column** result: the same thirteen columns the Stage 6 file defined, with
`subject text` inserted at position 4. PostgreSQL refuses to change a function's
result type in place, so on a target that still holds the **13-column** definition
the statement fails with SQLSTATE `42P13`:

```
ERROR:  cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION list_group_recruitment_posts(uuid,timestamp with time zone,uuid,integer) first.
```

Because the blob is one transaction (`begin;` at line 39, `commit;` at 1756), the
failure rolls the whole file back. Nothing is half-applied: measured after the
abort, `study_groups.max_members` did not exist.

Which targets hold the 13-column shape is not a property of the repository. The
repository is already at 14 columns because row 8
(`20261118083000_stage6_people_page_naming.sql:636-638`) drops and recreates the
function. A target that never received row 8 keeps the Stage 6 shape. The
coordinator's Launch snapshot records exactly that for CityLink Launch: the
`list_group_recruitment_posts` result has no `subject` column, the
`group_recruitment_posts.subject` column is absent, and the three
`*_length_chk` constraints are absent. So F17 is a **Launch-side** blocker, and
the reviewed blob as drafted cannot apply there at all.

## 2. The reconciliation file

`supabase/migrations/20261119080000_preblob_reconcile_list_group_recruitment_posts.sql`
sorts immediately before the blob and is a single `do` block. It:

| Situation on the target                          | Behaviour                                                   |
| ------------------------------------------------ | ----------------------------------------------------------- |
| function absent                                  | `NOTICE`, no-op                                             |
| present, 14 output columns, `subject` among them | `NOTICE`, no-op (safe to re-run after the blob)             |
| present, 13 output columns, no `subject`         | `drop function`, `NOTICE` naming the file that recreates it |
| present with any other output shape              | raises `P0001`, drops nothing                               |

It drops only that one identity. No `cascade`, no `*_capacity` variant, no
recreation, no grant change. Identity is matched on `pg_proc.proargtypes` OIDs
(`uuid,timestamptz,uuid,int4`), not on `pg_get_function_identity_arguments` text:
PostgreSQL renders `timestamptz` there as `timestamp with time zone`, and a text
comparison silently matched nothing during drafting — the guard reported "absent"
while the function existed. That bug is fixed and the OID form is what ships.

**Ordering, and the gap it creates.** The two files must be applied in the same
release window, reconciliation first. Between them the RPC does not exist: the
reconciliation drops it and the blob recreates it a few hundred lines later. A
client that calls the post list inside that window gets "function does not exist",
not a stable refusal. The window is two statements long and inside one deploy, but
it is real, and it is the reason the reconciliation is a separate file rather than
a silent edit to the reviewed blob.

## 3. Measured evidence (local 17.12, repository schema state)

Disposable PostgreSQL `17.12 (Ubuntu 17.12-1.pgdg24.04+1)`, unix socket only, no
TCP listener, cluster destroyed at the end (0 processes, 0 listeners). Raw run:
`f17-run/out/raw-f17-validation.txt`; harness `f17-src/run_f17.sh`.

| Phase | Action                                            | Result                                                                       |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2     | shape at repository state                         | 4 in, 14 out, `subject` named — row 8 already did this                       |
| 3     | install the verbatim 13-column Stage 6 definition | 13 out, no `subject`                                                         |
| 4     | blob, unmodified, `ON_ERROR_STOP=1`               | **exit 3, `42P13` at blob `:1749`**, `max_members` absent (nothing survived) |
| 5     | reconciliation file                               | exit 0, `NOTICE` dropped, function count 0                                   |
| 6     | blob again                                        | **exit 0**, 14 out + `subject`, 3 `*_capacity` reads, `max_members` present  |
| 7     | reconciliation re-run on the 14-column state      | exit 0, no-op, still 14 + `subject` (does not undo the apply)                |
| 8     | reconciliation with the function absent, twice    | exit 0, no-op both times                                                     |
| 8     | reconciliation against a wrong 1-column shape     | raises, exit 3, function still present — fails closed                        |

Phase 8 also confirms the guard does not treat "something else with this name" as
its own to drop.

## 4. A Launch-shaped target, end to end

Phase 8b builds the target Launch actually has: `schema.sql`, the fictional seed,
and the seven migrations before row 8 — row 8 omitted, so no `subject` column and
a 13-column post read. Then the release order, then the first real call.

| Step                                                                                  | Result                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `group_recruitment_posts.subject` before the apply                                    | 0 columns                                    |
| reconciliation                                                                        | exit 0, `NOTICE` dropped the 13-column read  |
| blob                                                                                  | **exit 0** — the `42P13` is gone             |
| post read shape after the blob                                                        | 4 in, 14 out, `subject` named                |
| call `list_group_recruitment_posts(course, null, null, 5)` as an authenticated caller | **`ERROR: column p.subject does not exist`** |
| add **only** `subject text`, call again                                               | 0 rows, exit 0 — the dependency is isolated  |

## 5. F19 — the subject column is a second, independent Launch blocker

The reconciliation makes the blob **apply** on Launch. It does not make the blob
**work** there. `list_group_recruitment_posts_capacity` is `plpgsql` and reads
`p.subject` (blob `:1532`, projected at `:1672`); the legacy wrapper is `language
sql` over that function and reads `legacy.subject` (`:1735`). PL/pgSQL bodies are
not resolved against columns at creation, so the apply succeeds and every call
fails at runtime with `column p.subject does not exist` — exactly what the phase
above measured.

This matters for sequencing, not for the reconciliation: the missing `subject`
column, its three `*_length_chk` constraints, and the three row-8 RPCs
(`update_own_display_name`, `list_course_ungrouped_classmates`,
`get_current_term_coursemate_profile`) are **row 8's** objects. They
must exist on Launch before this capacity release, and they are deliberately not
bundled into capacity DDL. Adding them inside the capacity migration would make the
release silently depend on a migration it does not contain.

The local proof that the column is the whole dependency — add it alone and the read
returns 0 rows — is what separates "the blob is broken" from "the target is
missing a prerequisite".

## 6. The return-type matrix

The packet called these "the thirteen functions the blob creates or replaces". The
file actually holds **seventeen** `create or replace function` statements covering
sixteen identities (`create_group_and_invite` appears twice, as the four-argument
definition and the three-argument fail-closed stub) plus one `drop function`. The
matrix below covers all seventeen, because a return-type collision on any one of
them aborts the file the same way.

Launch state is taken from the coordinator snapshot
(`CITYLINK_TEST_MAIN_METADATA_PARITY_COORDINATOR_20261122.md`), the only Launch
evidence this task holds.

| #   | Identity (blob line)                                                                  | Result the blob declares                   | Launch state per snapshot                          | Verdict                          |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- | -------------------------------- |
| 1   | `private.group_active_member_count(uuid)` `:66`                                       | `integer`                                  | not enumerated                                     | **F18**                          |
| 2   | `private.assert_group_has_capacity(uuid,integer)` `:100`                              | `void`                                     | not enumerated                                     | **F18**                          |
| 3   | `public.set_group_max_members(uuid,integer)` `:159`                                   | `integer`                                  | not enumerated                                     | **F18**                          |
| 4   | `public.create_group_and_invite(uuid,uuid,text,integer)` `:247`                       | `table(group_id uuid, invitation_id uuid)` | absent (Launch has only the two-argument overload) | create — no collision            |
| 5   | `public.create_group_and_invite(uuid,uuid,text)` `:387` (stub)                        | `table(group_id uuid, invitation_id uuid)` | absent (Launch's overload is `(uuid,uuid)`)        | create — no collision            |
| 6   | `public.send_group_invitation(uuid,uuid)` `:412`                                      | `uuid`                                     | not enumerated                                     | **F18**                          |
| 7   | `public.request_to_join_group(uuid)` `:552`                                           | `uuid`                                     | not enumerated                                     | **F18**                          |
| 8   | `public.respond_to_group_invitation(uuid,boolean)` `:650`                             | `text`                                     | not enumerated                                     | **F18**                          |
| 9   | `public.review_group_join_request(uuid,boolean)` `:827`                               | `text`                                     | not enumerated                                     | **F18**                          |
| 10  | `private.cancel_pending_invitations_from_removed_member(uuid,uuid)` `:989`            | `void`                                     | not enumerated                                     | **F18**                          |
| 11  | `public.remove_group_member(uuid,uuid)` `:1056`                                       | `text`                                     | not enumerated                                     | **F18**                          |
| 12  | `public.list_course_group_summaries_capacity(uuid)` `:1187`                           | 8 cols (`profile_id … capacity_state`)     | absent (`*_capacity` functions: none)              | create — no collision            |
| 13  | `public.list_course_group_summaries(uuid)` `:1289`                                    | 5 cols (`profile_id … group_size`)         | not enumerated                                     | **F18**                          |
| 14  | `public.list_current_term_course_groups_capacity(uuid,text,uuid,integer)` `:1318`     | 9 cols (`group_id … has_more`)             | absent                                             | create — no collision            |
| 15  | `public.list_current_term_course_groups(uuid,text,uuid,integer)` `:1448`              | 6 cols (`group_id … has_more`)             | not enumerated                                     | **F18**                          |
| 16  | `public.list_group_recruitment_posts_capacity(uuid,timestamptz,uuid,integer)` `:1484` | 18 cols (`post_id … has_more`)             | absent                                             | create — no collision            |
| 17  | `public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` `:1704`          | 14 cols, `subject` at position 4           | **present with 13 columns, no `subject`**          | **mismatch — `42P13`, F17**      |
| —   | `drop function public.create_group_and_invite(uuid,uuid)` `:245`                      | —                                          | **present** (Launch's only overload)               | intentional drop, not a mismatch |

Two consequences of the last row that the earlier drafting got wrong. On Launch the
two-argument `create_group_and_invite` **exists**, which is why page 01 `A-RPL-06`
must expect it present there (F16). And the blob's own `drop` removes it before
creating the four-argument version, so Launch does not end the apply with a
duplicate overload — it ends with `(uuid,uuid,text,integer)` and the three-argument
stub.

**Every mismatch found: one.** `list_group_recruitment_posts` is the only function
whose declared result type collides with a Launch function of the same identity.
The three `*_capacity` reads are new names. The remaining ten identities are
unresolved rather than clean — see F18.

## 7. F18 — closed on 2026-11-23 by an authorised Launch capture

The Launch snapshot records helper posture, the row-8 object set, and the absence
of capacity objects. It does not record `pg_get_function_result` for any identity,
so for ten functions the matrix can say "not enumerated", never "matches". A
`42P13` on any of them would abort the apply exactly as `list_group_recruitment_posts`
did, and this review would not have seen it coming.

**Closed.** Adam authorised one read-only Launch capture at 2026-11-23 13:22, and
the query below was run against `pijslbchvstkoweslymr` (run id
`ROLE6-LAUNCH-CAPTURE-20261123-1323`). It returned eight rows. Target identity is
corroborated independently: the raw SHA-256 of
`pg_get_functiondef(can_browse_current_term_group)` measured there is
`7cec20ec38fe1f77d1b78e9940cd28e0672b6b874a55fb22349bf5bac0b90591`, which is
exactly the Main raw value recorded in the coordinator's parity report, and its
length is 748 characters, also as recorded.

| #   | Identity                                                      | Measured on Launch                                                                           | Against the blob | Verdict                         |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- | ------------------------------- |
| 1   | `group_active_member_count(uuid)`                             | absent                                                                                       | create           | no collision                    |
| 2   | `assert_group_has_capacity(uuid,integer)`                     | absent                                                                                       | create           | no collision                    |
| 3   | `set_group_max_members(uuid,integer)`                         | absent                                                                                       | create           | no collision                    |
| 6   | `send_group_invitation(uuid,uuid)`                            | `uuid`                                                                                       | `uuid`           | matches                         |
| 7   | `request_to_join_group(uuid)`                                 | `uuid`                                                                                       | `uuid`           | matches                         |
| 8   | `respond_to_group_invitation(uuid,boolean)`                   | `text`                                                                                       | `text`           | matches                         |
| 9   | `review_group_join_request(uuid,boolean)`                     | `text`                                                                                       | `text`           | matches                         |
| 10  | `cancel_pending_invitations_from_removed_member(uuid,uuid)`   | absent                                                                                       | create           | no collision                    |
| 11  | `remove_group_member(uuid,uuid)`                              | absent                                                                                       | create           | no collision                    |
| 13  | `list_course_group_summaries(uuid)`                           | 5 cols: `profile_id, group_id, group_name, group_status, group_size`                         | 5 cols           | matches                         |
| 15  | `list_current_term_course_groups(uuid,text,uuid,integer)`     | 6 cols: `group_id, group_name, group_status, active_member_count, can_create_post, has_more` | 6 cols           | matches                         |
| 17  | `list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` | **13 cols, no `subject`**                                                                    | 14 cols          | **mismatch — the `42P13`, F17** |

Also measured in the same run: the two-argument
`create_group_and_invite(uuid,uuid)` exists on Launch returning
`TABLE(group_id uuid, invitation_id uuid)` — the F16 expectation, now evidence
rather than inference — and none of the three `*_capacity` reads exists.
**Superseded 2026-11-23.** Both halves of the sentence above were true at the 13:22Z capture and are false now: the two-argument `create_group_and_invite` was dropped by `20261118083000` (S1) and the three `*_capacity` reads were installed by `20261119090000`. The capture is retained as the pre-application record; the current Launch state is recorded in `docs/team/DECISIONS.md` (2026-11-23, Launch capacity application).

**Conclusion: F18 closes with no new mismatch.** Every remaining identity either
matches or is absent (so the blob creates it). `list_group_recruitment_posts`
remains the only return-type collision in the file, and Part A fixes it.

One consequence worth stating because it is easy to misread: `remove_group_member`
is **absent** on Launch. The blob creates it, so there is no collision, but it
means Launch has no member-removal RPC today — another row-8-era gap rather than a
capacity problem, and outside capacity DDL.

One capture closes it, and it is the same query shape Part C prepares for the
pinning run:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_function_result(p.oid) as result,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.proconfig as proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private')
   and p.proname in ('group_active_member_count', 'assert_group_has_capacity',
                     'set_group_max_members', 'create_group_and_invite',
                     'send_group_invitation', 'request_to_join_group',
                     'respond_to_group_invitation', 'review_group_join_request',
                     'cancel_pending_invitations_from_removed_member',
                     'remove_group_member', 'list_course_group_summaries',
                     'list_current_term_course_groups',
                     'list_group_recruitment_posts')
 order by 1, 2
 limit 60;
```

Reading that result against column 3 of the matrix above is a two-minute
comparison, and it is the only thing that turns ten "not enumerated" rows into
evidence.

## 8. What this does not do

- It does not authorise any application, on Launch or anywhere else. The
  reconciliation is a checked-in draft, reviewed locally.
- It does not fix Launch's missing row-8 objects (F19). Launch still cannot serve
  the post list until `subject` exists.
- It does not settle the ten unresolved identities (F18).
- It does not change the reviewed blob, and it must not be folded into it: the
  blob's SHA-256 is the reviewed artefact, and the reconciliation is deliberately a
  separate, earlier file.
