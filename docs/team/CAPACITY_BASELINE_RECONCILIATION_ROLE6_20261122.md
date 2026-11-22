# Role 6 — repository / Test / Main migration baseline reconciliation (2026-11-22)

**Task:** Role 6, database security and migration review (human name still TBD),
continuity task `9KfXkHmMqAxUkRMsbpxEwA`.
**Assignment:** `Role6-Baseline-Reconciliation-Assignment-20261122.md`.
**Branch:** `docs/role6-capacity-baseline-reconciliation-20261122`, starting
exactly from PR #48 live head `213fb52d51925edc0cda6efd44f67c40a4215456`.
**Deliverable:** this document plus one factual correction to PR #48's evidence
report. Draft PR base: `docs/citylink-coordinator-evidence-20261122`.

This is analysis and documentation only. It is not a migration proposal that has
been applied, not Test/Main authorization, and not release approval.

## 1. Authorization boundary actually observed in this task

Allowed and used: GitHub clone/fetch, checked-out inspection at exact SHAs,
reading the recorded live evidence, creating the assigned docs branch, committing
and normally pushing it, and opening a draft PR.

Not used, and not available here: this task has **no Supabase connector in its
MCP tool list**, so no project listing, no catalog query, no SQL execution and no
application-row read occurred — for Test, for Main, or for anything else. Every
live-database statement below is therefore **reported evidence from the
coordinator's authorized read-only preflight**
(`docs/team/CITYLINK_COORDINATOR_LIVE_PREFLIGHT_AND_REVIEWS_20261122.md`, the
document this branch amends), not something Role 6 reproduced. The packet's
conditional allowance for further read-only catalog queries could not be exercised
because no verified target connection exists in this sandbox; the specific fields
that still need a metadata check are listed as open items in §11 and §12.

No file under `supabase/`, `client/`, `server/`, `vite.config.ts`, `package.json`,
the pnpm lockfile or any route file was changed. Proof commands and their results
are in §13.

## 2. Evidence classes used in this document

| Class               | Meaning                                                                         | Example                                       |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Checked-in          | Read from the repository at a named SHA                                         | migration text, `docs/stage6/*.md`            |
| Reported-live       | Coordinator's authorized read-only catalog inspection, not reproduced by Role 6 | Test/Main ledger rows, live RPC arity         |
| Reported-validation | Command results reported by another task                                        | `637 tests` at `344c105`                      |
| Static reasoning    | PostgreSQL semantics applied to checked-in text                                 | `CREATE OR REPLACE` cannot change return type |
| Unverified          | Needs a live or CLI check before anyone relies on it                            | Supabase CLI pending-set selection behavior   |

Nothing in this document converts a reported fact into a verified one.

## 3. Exact revision identities used

- `main`: `1a583e30c019733d1880d2614ca853481509fdad` — 8 migration files.
- PR #34 base: `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d` — 9 files (adds capacity).
- PR #41 SQL-only head: `2bc29595f5c66b0f379a4a46f544a2364fc88be2`.
- PR #41 docs-inclusive head (current): `2bb659d6e565ba74c49c124f0f17a326877e66ae`
  — same capacity blob `a04048e90d6b64c692f03c722b9eea2849058aab`,
  SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.
- Client integration / PR #37: `344c1058e78fd2cccfde89574e226f3e65a1457c`.
- PR #48 live head: `213fb52d51925edc0cda6efd44f67c40a4215456`
  (parent `9da4a9fad099d669110145e54410387f79f63e06`, the SHA named in the
  assignment packet; the packet SHA is an ancestor, and `213fb52` only adds the
  F4/baseline-dispatch note, so this branch starts from `213fb52`).
- Test `wkzclgmhrtecnpexfesr` `CityLink-Stage5-Test`; Main `pijslbchvstkoweslymr`
  `CityLink Project` (identity and status per the reported preflight).

## 4. Three-way migration-ledger mapping

Repository intent rows are matched by **migration name**, not by version number.

| #   | Repository file (version `name`)                                      | Test recorded version                                | Main recorded version                | Divergence class                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| 1   | `20261102090000_stage5_term_model`                                    | **no row**                                           | `20261118033916` `stage5_term_model` | Test: unrecorded apply (objects present)                             |
| 2   | `20261102131343_stage5_groups`                                        | `20261102131343` `20261102_stage5_groups`            | `20261118033944` `stage5_groups`     | Test: same version, different recorded name; Main: different version |
| 3   | `20261102140927_stage5_course_roster_rpc`                             | `20261102140927` `20261102_stage5_course_roster_rpc` | `20261118034001`                     | Test: same version; Main: different version                          |
| 4   | `20261114163512_20261114162301_stage5_group_authority_and_succession` | `20261114163512` (same double-prefixed name)         | `20261118034447`                     | Test: exact match; Main: different version                           |
| 5   | `20261117043100_stage5_course_group_invite_candidates`                | `20261117044721`                                     | `20261118034458`                     | different version identifier only                                    |
| 6   | `20261117205600_stage5_course_detail_group_views`                     | `20261117133731`                                     | `20261118034505`                     | different version identifier only                                    |
| 7   | `20261118050000_stage6_chat_recruitment`                              | `20261118043211`                                     | `20261118080722`                     | different version identifier only                                    |
| 8   | `20261118083000_stage6_people_page_naming`                            | `20261118082247`                                     | **no row**                           | Test: different version; Main: migration genuinely not applied       |
| 9   | `20261119090000_group_hard_max` (capacity, PR #34/#41 only)           | no row                                               | no row                               | not applied anywhere                                                 |

Answering the packet's first question directly: for rows 2–8 a missing _repository
version_ on a live target does **not** mean a missing object. The recorded
difference is a **different version identifier for the same intent**, and the
repository's own documentation states why:
`docs/stage6/STAGE6_TEST_MIGRATION.md:51` — "The file name `20261118050000` is
the repository version; the tool records its own execution timestamp." The same
document records the Test apply as version `20261118043211 (tool-assigned)`.

Only two divergences are substantive rather than cosmetic:

1. **Test row 1 is absent but the objects exist.** `docs/stage5/STAGE5_MAIN_PROMOTION.md`
   states that Test "records five Stage 5 migrations, but two were applied directly
   in the dashboard and never saved", and that repository files 2 and 3 were
   "rebuilt on 2026-11-18 from Test's catalog only". Term model was therefore
   applied out-of-band; its ledger row was never written.
2. **Main row 8 is absent and at least part of its content is genuinely missing**
   (§6). `docs/stage6/PEOPLE_PAGE_TEST_MIGRATION.md:104` already records: "Main
   still does not have the people-page migration … a separately authorized Main
   promotion is required."

Consequence for reconciliation: **two of the three baselines cannot be treated as
file-name comparable at all.** Any procedure that keys on repository version
identifiers will mis-classify rows 2–8 as unapplied.

## 5. Are the objects actually present despite the ledger names?

Objects below are what each checked-in file creates (extracted from the SQL text
at `main`/`213fb52`), matched against the reported live observations.

| Intent                    | Created objects (checked-in)                                                                                                                                                                            | Test                                                                                                                                                 | Main                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| term model                | `academic_terms`, `citylink_settings`, `courses.term_id` + FK/indexes/RLS                                                                                                                               | present by strong indirect evidence (live Stage 5/6 functions and QA depend on current-term data; no catalog row) — direct metadata check still owed | recorded row `20261118033916`; `DECISIONS.md` 2026-11-18 confirms apply |
| groups                    | 4 tables, 11 private helpers, `create_group_and_invite`, `respond_to_group_invitation`, `cancel_group_invitation`, `cancel_group_join_request`                                                          | reported present (core group tables, RLS policies, triggers)                                                                                         | reported present (same table set)                                       |
| roster rpc                | `list_course_classmates`                                                                                                                                                                                | not separately reported                                                                                                                              | `DECISIONS.md` parity option A implies present                          |
| authority/succession      | `send_group_invitation`, `request_to_join_group`, `review_group_join_request`, `handle_group_membership_end`, `reconcile_group_leader_after_membership_end`, `archive_deleted_profile_citylink_history` | reported present (policy/trigger patterns match)                                                                                                     | reported present (three write RPCs exist in the grant table)            |
| invite candidates         | `list_course_group_invite_candidates`                                                                                                                                                                   | documented applied as `20261117044721`                                                                                                               | reported present via row `20261118034458`                               |
| course detail             | `list_current_course_enrolment_counts`, `list_course_group_summaries`, `rename_study_group`                                                                                                             | present (ledger name variant)                                                                                                                        | `list_course_group_summaries(uuid)` reported in Main grant table        |
| stage6 chat/recruitment   | 2 tables, 19 functions incl. `private.can_browse_current_term_group`, `private.can_manage_recruitment_post`                                                                                             | recorded `20261118043211`; helpers reported live                                                                                                     | recorded `20261118080722`; helpers reported live                        |
| stage6 people page naming | 12 functions incl. 3-argument `create_group_and_invite`, `update_own_display_name`, `list_course_ungrouped_classmates`, `get_current_term_coursemate_profile`, plus 4 drops                             | recorded `20261118082247`; 3-arg create reported live                                                                                                | **not applied**; 2-argument create reported live                        |

So the ledger-name divergence is **not** an object-coverage problem for Test
except for the unrecorded term model, and **is** a real content gap for Main only
at row 8. The precise residual unknowns are listed in §11.

## 6. Why Main exposes only `create_group_and_invite(uuid, uuid)`

Causal chain, all from checked-in text plus reported-live facts:

1. `20261102131343_stage5_groups.sql` defines `create_group_and_invite` and
   revokes `public`/`anon` EXECUTE (lines 738+).
2. `20261118083000_stage6_people_page_naming.sql:85` runs
   `drop function public.create_group_and_invite(uuid, uuid);` and `:87` creates
   the three-argument `(uuid, uuid, text)` form, then `:155` revokes from
   `public, anon` and `:156` grants to `authenticated`.
3. Test has that migration (recorded `20261118082247`); Main does not (no row 8).
   Main therefore still has the two-argument form.

This is a _documented, expected_ difference, not an unexplained anomaly — and it
is the same reason Main's recruitment-post overloads (`create_group_recruitment_post(uuid, text)`,
`edit_group_recruitment_post(uuid, text)`, the pre-`subject`
`list_group_recruitment_posts(...)`) are still the older shapes.

Checked-in `main` client, however, calls the **three**-argument form:
`client/src/lib/supabaseGroups.ts:467-469` passes `p_course_id`, `p_recipient_id`
and `p_name`. So a build of `main` pointed at live Main would fail group creation
with a missing-function error. Whether any live surface currently points at Main
is a deployment fact this task cannot see; it must be confirmed before Main is
treated as a functioning production target for group creation.

Safe compatibility path:

- **Before PR #41.** Main cannot be used for capacity QA at all. The only
  defensible route to a capacity-ready Main is, in order: (a) a separately
  authorized, reviewed Main promotion that first brings row 8 (or its equivalent
  forward-only successor) so the three-argument create and recruitment renames
  exist, then (b) the capacity successor. Adam's standing rule (`DECISIONS.md`
  2026-11-18: only Adam may authorize Main changes) applies; nothing here
  authorizes it.
- **After PR #41 as currently written.** The capacity file itself starts at `:45`
  with `add column if not exists max_members`, `:100` capacity assertions, `:159`
  `set_group_max_members`, `:245` `drop function if exists
public.create_group_and_invite(uuid, uuid)`, `:247` the four-argument create and
  `:387` the three-argument fail-closed stub. Note the consequence: on a target
  that has not received row 8, `:245` removes the only create overload that that
  target's live client uses, and `:387` replaces the three-argument overload that
  such a target never had. **PR #41 is only coherent on a target that already has
  row 8**, which Test has and Main does not.
- Between the two, the three-argument stub keeps its Option A contract: old cached
  clients get `group_capacity_upgrade_required` (SQLSTATE 45000) rather than a
  silent default, and no unlimited fallback exists.

## 7. The private helpers: origin is reconciled, and PR #48 needed a correction

The evidence report's stop list said the helpers "exist live in both but
checked-in migrations do not define them". That statement is **factually wrong**
and this branch corrects it:

- `supabase/migrations/20261118050000_stage6_chat_recruitment.sql:133` defines
  `private.can_browse_current_term_group(p_group_id uuid)`;
- `:160` defines `private.can_manage_recruitment_post(p_post_id uuid)`;
- both are `SECURITY DEFINER SET search_path = ''`;
- `:931-932` revoke `ALL` on both from `PUBLIC, anon, authenticated`.

Both live targets recorded a `stage6_chat_recruitment` apply (Test `20261118043211`,
Main `20261118080722`), and the reported live posture — postgres-owned,
`SECURITY DEFINER`, `EXECUTE` postgres only — is exactly what that file produces.
The helpers' presence is therefore **explained by the checked-in migration**, not
out-of-band. The residual question narrows to whether the live bodies are
_identical_ to the checked-in text, which needs a metadata-only
`pg_get_functiondef` comparison on each target (§11).

Recommendation, choosing among the packet's options: **do not add a new migration
that re-creates them as "normalization".** Option 4a (a new forward-only define
migration) is unnecessary and would add an extra `CREATE OR REPLACE` path for
objects whose definitions are already versioned; Option 4b (record them as
out-of-band with a formal baseline snapshot) is now contradicted by the checked-in
evidence. The defensible successor strategy is:

1. treat `20261118050000` as the authoritative origin of both helpers;
2. in the preflight immediately before any capacity apply, assert per target that
   the two helpers exist with the expected signature, owner, `SECURITY DEFINER`,
   empty `search_path` and revoked grants, and that their recorded definition
   matches the file (metadata read only);
3. if a target fails that assertion, **stop** and handle that target with an
   explicit, separately reviewed remediation migration named for the actual
   divergence — not a blanket re-definition inside the capacity migration.

This keeps the capacity migration minimal and makes the helper dependency visible
in the ordering requirement instead of hidden inside a compatibility redefinition.

## 8. Is PR #41 safe to replay against live Test (or Main)?

No — for either target — under a blind ledger-driven replay.

Pending-set arithmetic, using repository version identifiers as a migration tool
would:

- Test recorded `{20261102131343, 20261102140927, 20261114163512, 20261117044721,
20261117133731, 20261118043211, 20261118082247}`; repository at `2bb659d`
  contains `{20261102090000, 20261102131343, 20261102140927, 20261114163512,
20261117043100, 20261117205600, 20261118050000, 20261118083000,
20261119090000}`. Only **3 of 9** ledger keys overlap; **6 files count as
  "pending" against a database that already has their objects** — including the
  capacity file and the term model.
- Main recorded `{20261118033916, 20261118033944, 20261118034001, 20261118034447,
20261118034458, 20261118034505, 20261118080722}`. **Zero** overlap: a blind push
  would attempt all nine files against production.

What a replay would then do, from the checked-in statements:

| File                                | Hazard if re-applied to a target that already has the objects                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261102090000` term model         | `create table if not exists` skips, but the file **writes data** (creates terms per semester, backfills `courses.term_id`, inserts `2026-Fall`, adds FK) and aborts on unlinked courses. DML is outside this assignment and outside Adam's read-only posture.                                                                                                                                                                  |
| `20261102131343` groups             | 4 `create table if not exists` skip, then **16 `create or replace function`** silently replace live bodies with the reconstructed text, plus 14 `grant`/19 `revoke` statements change ACLs that were tuned afterwards.                                                                                                                                                                                                         |
| `20261114163512` authority          | 6 `create or replace function` overwrite, 2 `create trigger` collide with existing triggers unless guarded.                                                                                                                                                                                                                                                                                                                    |
| `20261117043100`, `20261117205600`  | overwrite of read RPCs whose live versions were recorded under later timestamps; if the live definition is newer than the committed file, replay **regresses** it.                                                                                                                                                                                                                                                             |
| `20261118050000` chat/recruitment   | 19 `create or replace function` overwrite; reasserts grants/revokes.                                                                                                                                                                                                                                                                                                                                                           |
| `20261118083000` people page naming | `:85`, `:525`, `:589`, `:636` are bare `drop function` statements with **no `if exists`** — on Test the targets are already gone, so replay aborts there; 8 `alter table` statements re-add columns.                                                                                                                                                                                                                           |
| `20261119090000` capacity           | `add column if not exists` is safe; 17 `create or replace function` are only safe where the live signature and **return type** already match, because PostgreSQL rejects changing a return type in place. On Main, `list_group_recruitment_posts` still has the pre-`subject` shape, so the legacy wrapper at `:1704` is expected to **fail**, aborting mid-migration. `:245` would drop Main's only create overload (see §6). |

Same-name object risk, stated precisely:

- `create or replace function` matches on the **input type list**; default values
  and output column names do not create a new function. So the capacity file's
  wrappers replace rather than add overloads — good — but only when the live
  signature matches. Where it does not, PostgreSQL raises
  "cannot change return type" instead of silently adding an overload.
- The real same-name hazard is the **`*_capacity` reads**: they are new names by
  design (`:1187`, `:1318`, `:1484`) and must never be collapsed back onto the
  legacy names, otherwise old strict-allowlist clients see extra columns.
- A third hazard: replaying an already-applied intent under a _different_ version
  key makes the ledger record a second row for the same work, permanently
  corrupting the mapping in §4 for future reviews.

Therefore: **blind replay is ruled out**, on both targets, independent of whether
the capacity SQL itself is correct. This supersedes the earlier framing that
called the mismatch merely a stop condition — it is an active destruction risk on
replay.

Two facts still need verification before any push-based procedure is designed at
all, and neither can be verified from the repository: which pending-selection rule
the pinned Supabase CLI actually implements (including whether it errors on remote
rows missing locally, as Test's four unrecorded-name rows and Main's seven rows
would trigger), and whether the targets' current function definitions match the
committed text. Both are metadata/CLI checks, not row reads.

## 9. Required ordering in any successor capacity migration

Ordering the capacity work needs (with the capacity file's own line references at
`2bc2959`/`2bb659d` as the reviewed baseline):

1. **Prerequisite assertions, not DDL:** term model, group tables, and the
   `20261118050000` private helpers (`can_view_group`,
   `can_browse_current_term_group`, `can_manage_recruitment_post`) must already
   exist; the capacity reads call them at `:1389` and `:1598`. Fail closed with a
   clear message if absent.
2. **Capacity column and constraint first:** `:45`/`:56` add `max_members` with
   `if not exists` and its 2–19 check, documented at `:63`.
3. **Private capacity helpers next:** `:66` `private.group_active_member_count`,
   `:100` `private.assert_group_has_capacity`, then `:150`/`:152` revoke grants on
   both so browser roles cannot call them.
4. **Leader-only setter:** `:159` `set_group_max_members`, `:228` revoke,
   `:230` grant to `authenticated`.
5. **Create path:** `:245` drop the legacy two-argument overload, `:247` four-argument
   create, `:367`/`:369` and `:403`/`:405` ACL, `:387` the three-argument fail-closed
   stub. Old client compatibility requires 4 and 5 in the same transaction as the
   reads below, never separately.
6. **Admission RPCs that must respect capacity:** `:412` `send_group_invitation`,
   `:552` `request_to_join_group`, `:650` `respond_to_group_invitation`, `:827`
   `review_group_join_request`, each followed by its revoke/grant pair.
7. **Removal support:** `:973` `private.group_removal_context` (+ `:981` RLS,
   `:983` revoke), `:989` cancel pending invitations for a removed member, `:1056`
   `remove_group_member`, `:1163`/`:1165` ACL.
8. **New capacity reads:** `:1187`, `:1318`, `:1484` with `:1278`/`:1280`,
   `:1434`/`:1436`, `:1691`/`:1693` ACL.
9. **Legacy read wrappers last but in the same migration:** `:1289`, `:1448`,
   `:1704` with `:1313`/`:1315`, `:1479`/`:1481`, `:1751`/`:1753` ACL, so old
   allowlists keep 5/6/14-column shapes while capacity data is only exposed
   through the `*_capacity` names.
10. **Grant normalization as an explicit, separately sequenced step** (§10), not
    folded into capacity DDL, so a Main incident can be remediated without waiting
    for a capacity release.

If a successor ever has to run on a target that also needs row 8 (Main), then row 8
must be applied and verified **before** the capacity successor, per §6.

## 10. Grant divergence and a separately reviewed remediation sequence

Reported-live difference (Main broader than Test):

- `create_group_and_invite`, `list_course_group_summaries`,
  `list_current_term_course_groups`, `list_group_recruitment_posts`,
  `list_group_chat_messages`, `send_group_chat_message`,
  `respond_to_group_invitation` grant `service_role` on Main but not on Test;
- `request_to_join_group`, `review_group_join_request`, `send_group_invitation`
  additionally grant **`anon`** on Main;
- Test's posture for those three write RPCs matches `DECISIONS.md` 2026-11-18
  ("grant EXECUTE only to `authenticated` (no `anon`, no `public`)").

Checked-in text does not produce Main's posture for those three writes:
`20261114163512` creates them with `create or replace function` and never issues a
role grant for them (its three `revoke` statements target private helpers, and its
own closing comment at `:489`–`:491` states that existing execute grants are
preserved by `CREATE OR REPLACE`), and
`20261118050000`/`20261118083000` normalize the _read_ RPCs and the renamed
create. Because `create or replace function` **preserves existing ACLs**, Main's
`anon`/`service_role` rows must have come from the apply environment's effective
or default privileges (the reported preflight already notes
supabase_admin-created objects carry broader Supabase defaults), or from a
dashboard apply path, rather than from committed SQL. Role 6 cannot distinguish
these without a metadata check, and must not guess.

Security reading: these are `SECURITY DEFINER` functions with `search_path`
pinned, so `anon` EXECUTE is an _unauthenticated callable surface_, not an
immediate data leak — each function re-checks membership/current-term/leader
state. It is still a defect: anonymous callers can reach write RPCs, consume
sequence effects, and probe existence/error behavior. It does **not** prove any
row has been read or written.

Proposed remediation, deliberately split and **not authorized by this document**:

- **Test (disposable):** add a forward-only, metadata-only-reviewed ACL
  normalization migration that, for the exact seven to ten affected signatures,
  runs `revoke all on function <signature> from public, anon, service_role;` then
  `grant execute on function <signature> to authenticated;`, one statement per
  signature, never `revoke ... cascade`, and re-runs the reported preflight
  posture table afterwards. Requires Adam's exact-SQL Test authorization, an
  immediately preceding preflight, and Role 6 review of that head.
- **Main (production):** never ride on the Test procedure. Sequence: (1) fresh
  verified backup/restore evidence; (2) metadata-only enumeration of every
  function/table whose effective ACL differs from the reviewed contract;
  (3) a written Adam decision in `docs/team/DECISIONS.md` naming the exact SQL
  head, since the standing 2026-11-18 rule reserves Main authorization to Adam;
  (4) apply one statement group at a time with verification and a stop-on-error
  rule; (5) post-apply ACL comparison; (6) confirmation that no client relies on
  `anon` EXECUTE (the client always calls with a session, so this is expected to
  be safe, but must be proven, not assumed).
- **Neither** list is an instruction to act now; Main remains read-only.
- `service_role` grants on Main are not automatically wrong: the platform server
  role bypasses RLS and may be required by an existing integration. Removing them
  without that evidence could break a working path, so the decision is a product
  decision for Adam, not a security reflex.
- `ALTER DEFAULT PRIVILEGES` was **not** proposed: it changes future-object
  behavior globally per role/database and deserves its own review.

## 11. Confirmed matches, confirmed mismatches, open unknowns

| Item                                                                                                                                                                | Status                                                                                    | Basis                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Capacity blob unchanged by F4                                                                                                                                       | **Confirmed** by re-running the diff at `2bb659d`                                         | `git diff 2bc2959... 2bb659d -- supabase` = 0 bytes          |
| Helpers defined in checked-in SQL                                                                                                                                   | **Confirmed mismatch** with PR #48 §11 item 6; corrected in this branch                   | `20261118050000:133`, `:160`                                 |
| Main lacks row 8, hence 2-argument create                                                                                                                           | **Confirmed** (static) + reported-live arity                                              | `20261118083000:85/:87`; preflight §10                       |
| `main` client expects 3-argument create                                                                                                                             | **Confirmed**                                                                             | `client/src/lib/supabaseGroups.ts:467-469`                   |
| Blind replay unsafe on both targets                                                                                                                                 | **Confirmed** by static reasoning over §4/§8                                              | checked-in statements                                        |
| Main has a `stage6_chat_recruitment` row while Stage 6 docs say Main was never touched                                                                              | **Confirmed governance gap** — needs Adam's explanation                                   | `docs/stage6/STAGE6_TEST_MIGRATION.md:10,68` vs preflight §8 |
| `docs/SUPABASE_SETUP.md:199` says the invite-candidates migration "must never be applied to Main" while `DECISIONS.md` 2026-11-18 authorized exactly that as file 5 | **Confirmed documentation contradiction** — for Eunice/Adam to reconcile, not edited here | both checked-in texts                                        |
| Test term-model object presence                                                                                                                                     | **Indirect only** — metadata check owed                                                   | preflight has no row; live functions depend on it            |
| Whether live helper bodies match committed text (both targets)                                                                                                      | **Unknown** — `pg_get_functiondef` comparison owed                                        | no connector here                                            |
| Main presence of `update_own_display_name`, `list_course_ungrouped_classmates`, `get_current_term_coursemate_profile`, renamed `subject` shape                      | **Unknown** — reported evidence covers only create arity                                  | preflight §10                                                |
| Supabase CLI pending-selection and remote-only-row behavior                                                                                                         | **Unknown** — CLI verification owed                                                       | no toolchain proof available                                 |
| Whether any live surface points at Main                                                                                                                             | **Unknown** — deployment fact, outside this sandbox                                       | not observable here                                          |
| Origin mechanism of Main's `anon` grants                                                                                                                            | **Unknown** — default vs existing ACL vs dashboard apply                                  | §10                                                          |

## 12. Recommended successor contract, for later Adam approval

Recommended shape, explicitly **not** applied:

1. Reconcile per target, not globally. Produce a **baseline parity record** for
   Test and a separate one for Main: metadata-only enumeration of schema objects,
   function definitions, owners, ACLs and ledger rows, committed under
   `docs/team/` with the exact project ref and date. Only then can "which target is
   at which intent" be answered without guessing.
2. Adopt forward-only **intent** migrations with in-migration prerequisite
   assertions (fail closed, name the missing object), instead of expecting the
   CLI ledger to reconstruct history. Do not rewrite Test/Main ledger rows to look
   like the repository; do not use Drizzle for the Supabase application database.
3. Keep capacity SQL as already reviewed in PR #41, but publish it as a **new
   successor head** whose first statements are assertions plus the §9 order, and
   re-run Role 6 review at that exact head. Editing history in place would
   invalidate the reviewed blob `a04048e9…`.
4. Pair it with the client head that calls the four-argument create and the
   `*_capacity` reads, keeping the Option A stub/wrapper contract intact until the
   cached-client recovery conditions in the F2 rollout contract are met.
5. Ledger alignment, if ever chosen, is a **metadata write** (`migration repair`
   class of action) and must be named in its own authorization, per target, never
   implied by a QA grant.

Requested pairing contract for later approval (heads must be re-reviewed at
whatever is actual then; the SHAs below are the current reference points):

| Layer              | Reference head                                                | Paired PR                                        | Condition                                                   |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Capacity SQL       | `2bb659d6e565ba74c49c124f0f17a326877e66ae` (blob `a04048e9…`) | PR #41 → base `feature/group-capacity-migration` | successor with assertions supersedes; no replay of rows 1–8 |
| Migration base     | `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`                    | PR #34                                           | stays as review context only                                |
| Client integration | `344c1058e78fd2cccfde89574e226f3e65a1457c`                    | PR #37                                           | must be revalidated after F2 implementation                 |
| Evidence baseline  | `213fb52d51925edc0cda6efd44f67c40a4215456`                    | PR #48                                           | this reconciliation stacks on it                            |
| Test apply target  | `wkzclgmhrtecnpexfesr` after parity record + assertions pass  | new successor head                               | requires a new exact-SQL Adam authorization                 |
| Main               | read-only; separate `DECISIONS.md` decision required          | n/a                                              | row 8 promotion must precede any capacity work              |

## 13. What can and cannot proceed now

Can proceed with no database access:

- the baseline parity records described above, if metadata read-only access is
  authorized for the target;
- F2 client-side implementation (marker, upgrade message, refresh control,
  `index.html` cache posture) plus host-header evidence;
- Eunice's F1b documentation reconciliation, including the two contradictions
  found in §11;
- Roy's and Jeffery's capacity UI/state work against mocks, keeping fictional
  `/demo` data separate.

Cannot proceed:

- applying PR #41, in its reviewed or successor form, to Test or Main;
- any Test/Main write, grant change, ledger repair, reset or delete;
- signed-in capacity QA (Test has no capacity functions or `max_members`);
- treating Main as a capacity or even group-creation-capable backend;
- merge, ready-for-review transition, deployment or publication.

## 14. Proof that nothing state-changing occurred in this task

Commands run by Role 6 in this assignment, all read-only except the assigned docs
branch/commit/push/draft PR:

```text
git status --short --branch            # clean before branching
git fetch origin                       # normal fetch only
git log -1 --oneline origin/main       # 1a583e3
git ls-remote origin ...               # branch presence check
git cat-file -t <two SHAs>             # object type
git merge-base --is-ancestor 9da4a9f 213fb52   # ancestor: yes
git log/diff/ls-tree/show/grep/sed     # checked-in text only
git -C CityLink worktree add/move      # local worktrees, no shared state
```

No `supabase` command, no SQL, no catalog query, no HTTP call to either project,
and no application-row access occurred: the session has no Supabase connector.
No merge, no ready-for-review transition, no deployment, no publication, no
schedule and no polling was created. `main`, PR #34's base, PR #37's head and
PR #41's head were not modified by this task.

## 15. Adam's next action(s):

1. **Accept or reject the §7 correction.** Decide that the private helpers' origin
   is the checked-in `20261118050000_stage6_chat_recruitment.sql` and that no
   re-definition migration is wanted. Unblocks: successor-migration drafting and
   the preflight assertion list.
2. **Answer the Main governance question.** Explain, or direct that it be
   recorded in `docs/team/DECISIONS.md`, how live Main obtained
   `20261118080722 stage6_chat_recruitment` when the Stage 6 records say Main was
   never touched. Unblocks: whether Main's baseline can be trusted at all.
3. **Authorize the metadata-only parity checks** (per target, exact fields listed
   in §11) — or state that another task performs them. Role 6 has no Supabase
   connector in this session, so this authorization alone does not enable it here.
4. **Confirm the two documentation contradictions** belong to Eunice's F1b scope:
   `docs/SUPABASE_SETUP.md:199` versus `DECISIONS.md` 2026-11-18 file 5, and the
   §11 items. Unblocks: a single accurate migration history.
5. **Restate the still-unauthorized list** (no action needed to keep them stopped,
   but a decision is needed to change any): capacity migration application on Test
   or Main, any Test/Main write or grant change, ledger repair, signed-in capacity
   QA, merge, ready-for-review, deployment, publication, repository visibility or
   permission changes. Main stays read-only until official launch.
6. **Confirm the group-creation-on-Main question** in §6: if any live surface
   points at Main, a row-8 promotion decision is required before capacity
   planning; if none does, record that so Main's arity drift is treated as latent.
