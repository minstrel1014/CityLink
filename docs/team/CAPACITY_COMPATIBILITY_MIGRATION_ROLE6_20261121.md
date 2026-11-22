# Capacity compatibility migration contracts (Option A)

Status: **DRAFT — static preparation only.** Written by the Role 6 continuity task
(database security and migration review, human name TBD) for the CityLink
coordinator on **2026-11-21**, after Adam selected **Option A** on that date.

Branch: `feature/role6-capacity-compatibility-migration-20261121`
Base (migration being revised): `feature/group-capacity-migration` at
`5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d` (PR #34)
Main baseline used for contract comparison: `1a583e30c019733d1880d2614ca853481509fdad`
SQL file: `supabase/migrations/20261119090000_group_hard_max.sql`
F4 documentation amendment branch: `docs/role6-capacity-f4-wording-20261122`,
starting exactly from `2bc29595f5c66b0f379a4a46f544a2364fc88be2`. Documentation
only: `supabase/` is byte-unchanged (empty
`git diff 2bc2959… HEAD -- supabase`) and the SQL blob remains
`sha256 5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.

**No SQL was executed. No Supabase project — Test `wkzclgmhrtecnpexfesr` or
Main `pijslbchvstkoweslymr` — was connected to, listed, inspected or written.
Nothing in this document is runtime verification, application approval, Test
preflight authorization, merge approval or release approval.**

## 1. Why the contracts were split

The pre-Option-A draft dropped `public.create_group_and_invite(uuid, uuid, text)`
and changed the return shape of the three read RPCs in place. That couples the
migration to a client release in a way that fails _opaquely_: an old cached
browser bundle gets PostgREST `PGRST202`/`42883` "function not found" on create
and strict-allowlist rejections on reads, with no machine-readable reason and no
recovery path.

Option A separates the two concerns:

1. Old clients keep a **readable** schema surface (exact released column sets)
   and a **fail-closed but explainable** create surface.
2. Capacity-aware behaviour is only reachable through **new, explicitly named**
   contracts that capacity-aware client code must opt into.
3. The compatibility objects are temporary and are removed later by a separate,
   lead-approved cleanup migration — never by this file.

## 2. Contract inventory

### 2a. Group creation

| Contract                                       | Signature                                                                                                   | Returns                                    | Behaviour after this migration                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy create (compatibility stub, section 3b) | `public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text)`                        | `table(group_id uuid, invitation_id uuid)` | Always aborts. Raises `group_capacity_upgrade_required` / SQLSTATE `45000`. `SECURITY INVOKER`, `set search_path to ''`, no table access, no `auth.uid()`, no private helper call. Creates nothing, cannot bypass `max_members`. |
| Capacity create (current contract)             | `public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text, p_max_members integer)` | `table(group_id uuid, invitation_id uuid)` | Unchanged from the PR #34 draft: leader-side creation with a hard maximum chosen at creation.                                                                                                                                    |
| Removed overload                               | `public.create_group_and_invite(uuid, uuid)`                                                                | —                                          | Still dropped (no supported client calls it). The only `DROP FUNCTION` in the file.                                                                                                                                              |

The two live overloads are distinct by arity, so PostgREST resolves each
signature unambiguously. The stub's argument names, argument types and return
columns were taken verbatim from the released definition in
`supabase/migrations/20261118083000_stage6_people_page_naming.sql`.

### 2b. Read contracts — legacy names, released shapes (unchanged column sets)

| Contract                                 | Arguments                                                                                                                       | Columns, in order                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.list_course_group_summaries`     | `p_course_id uuid`                                                                                                              | `profile_id uuid`, `group_id uuid`, `group_name text`, `group_status text`, `group_size bigint`                                                                                                                                                                                                       |
| `public.list_current_term_course_groups` | `p_course_id uuid`, `p_after_group_name text default null`, `p_after_group_id uuid default null`, `p_limit integer default 25`  | `group_id uuid`, `group_name text`, `group_status text`, `active_member_count bigint`, `can_create_post boolean`, `has_more boolean`                                                                                                                                                                  |
| `public.list_group_recruitment_posts`    | `p_course_id uuid`, `p_after_created_at timestamptz default null`, `p_after_id uuid default null`, `p_limit integer default 20` | `post_id uuid`, `group_id uuid`, `group_name text`, `subject text`, `active_member_count bigint`, `author_name text`, `body text`, `post_status text`, `created_at timestamptz`, `updated_at timestamptz`, `closed_at timestamptz`, `apply_enabled boolean`, `can_manage boolean`, `has_more boolean` |

Each is now `language sql stable security definer set search_path to ''` and
selects only the listed columns from the matching `*_capacity` contract. No
capacity column leaks into these shapes. The original released definitions in
`20261117205600_stage5_course_detail_group_views.sql` and
`20261118083000_stage6_people_page_naming.sql` were used as the comparison
source, and the wrapper column name/type lists match them exactly.

### 2c. Read contracts — new capacity-aware names

| Contract                                          | Arguments                                                                                                                       | Columns, in order                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.list_course_group_summaries_capacity`     | `p_course_id uuid`                                                                                                              | `profile_id uuid`, `group_id uuid`, `group_name text`, `group_status text`, `group_size bigint`, `max_members integer`, `capacity_count integer`, `capacity_state text`                                                                                                                                                                                                                                  |
| `public.list_current_term_course_groups_capacity` | `p_course_id uuid`, `p_after_group_name text default null`, `p_after_group_id uuid default null`, `p_limit integer default 25`  | `group_id uuid`, `group_name text`, `group_status text`, `active_member_count bigint`, `max_members integer`, `capacity_count integer`, `capacity_state text`, `can_create_post boolean`, `has_more boolean`                                                                                                                                                                                             |
| `public.list_group_recruitment_posts_capacity`    | `p_course_id uuid`, `p_after_created_at timestamptz default null`, `p_after_id uuid default null`, `p_limit integer default 20` | `post_id uuid`, `group_id uuid`, `group_name text`, `subject text`, `active_member_count bigint`, `max_members integer`, `capacity_count integer`, `capacity_state text`, `author_name text`, `body text`, `post_status text`, `created_at timestamptz`, `updated_at timestamptz`, `closed_at timestamptz`, `apply_enabled boolean`, `apply_block_reason text`, `can_manage boolean`, `has_more boolean` |

`capacity_state` and `apply_block_reason` keep the value sets defined by the
original PR #34 draft; this revision renames and wraps the contracts, it does not
redefine those values.

### 2d. Write contracts whose names do not change

`public.set_group_max_members(uuid, integer)`,
`public.send_group_invitation(uuid, uuid)`, `public.request_to_join_group(uuid)`,
`public.respond_to_group_invitation(uuid, boolean)`,
`public.review_group_join_request(uuid, boolean)`,
`public.remove_group_member(uuid, uuid)`.

The four invitation/request/review RPCs previously had no explicit privilege
statement in the draft, so `CREATE OR REPLACE` inherited whatever the target
database already held. This migration now adds, for each, `revoke all on
function … from public, anon` followed by `grant execute on function … to
authenticated`.

## 3. Stable upgrade-required signal

Both parts are contract and must be matched by client code:

- **SQLSTATE `45000`** → PostgREST `error.code`
- **message text `group_capacity_upgrade_required`** → PostgREST `error.message`

Expected transport: an HTTP `400` JSON body
`{"code":"45000","message":"group_capacity_upgrade_required", …}` produced by an
aborted (rolled-back) transaction; no group row, no invitation row.

Client rules for the owner branches:

1. Match the code **or** the message token; do not match on localized or
   human-readable text, and do not match on `PGRST202`/`42883` for this path —
   those now belong only to genuinely missing functions.
2. Map the signal to the approved refresh/recovery affordance (rebuild/reload,
   then the `Group is full` / `Group maximum is not set` guidance as applicable).
3. Never auto-retry this call, and never fall back to an unlimited or
   default-maximum create path.
4. Surface it distinctly from the capacity failures raised by the write RPCs
   (`Group is full`, `Group maximum is not set`), which remain separate signals.

The token is stable, version-free and machine-parseable, so it also survives a
future removal of the stub: a client that still treats `42883`/`PGRST202` on this
call as "upgrade required" degrades safely once the stub is dropped by the later
cleanup migration.

## 4. Intentional behaviour deltas for old clients

Option A preserves _shapes_; these _values_ still change for old bundles, and
each needs owner acknowledgement before release:

| Area                                                  | Old behaviour                                         | Behaviour after this migration                                                      | Notes                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_course_group_summaries.group_size`              | raw active-membership count                           | canonical capacity count (active memberships plus the narrow forming-creator bonus) | Same column, same type; the approved forming-group creator rule.                                                                                              |
| `list_course_group_summaries` rows                    | one-person forming groups appeared                    | a forming group with only its creator and no active membership row is hidden        | Matches the required verification case already in `GROUP_CAPACITY_MIGRATION_DRAFT.md`.                                                                        |
| `list_current_term_course_groups.active_member_count` | raw active-membership count                           | canonical capacity count                                                            | Column retained for allowlist compatibility only.                                                                                                             |
| `list_current_term_course_groups.can_create_post`     | computed, structurally always false for returned rows | still structurally always false                                                     | **Legacy client allowlist field only; never security authority.** See the note below and `GROUP_CAPACITY_MIGRATION_DRAFT.md`.                                 |
| `list_group_recruitment_posts.active_member_count`    | raw active-membership count                           | canonical capacity count                                                            | As above.                                                                                                                                                     |
| `list_group_recruitment_posts.apply_enabled`          | true whenever the pre-capacity rules allowed it       | capacity-aware: false for full, unset-maximum and over-limit groups                 | An old client therefore disables Apply instead of offering an action the write RPCs would reject. The write path remains the authority.                       |
| `list_group_recruitment_posts.apply_block_reason`     | not exposed on the legacy name                        | still not exposed on the legacy name                                                | Available only on `…_posts_capacity`.                                                                                                                         |

**`can_create_post` safety contract (Adam, recorded 2026-11-22).** The column is
retained **only** so older strict client allowlists can still parse the row; it is
**never** security authority. Real server-side authority for creating a recruitment
post is `private.can_manage_recruitment_post` together with the relevant membership
check, and a write attempt is decided by those server checks alone. A
`can_create_post = false` value on the browse contract must therefore **not** be
interpreted as an actual server denial: browse rows intentionally exclude the
viewer’s own active group, so the field’s historical computation is structurally
misleading for exactly the rows a viewer could post in.

Reviewed evidence, not a product claim: at client head
`d4558a73dccfa0878dc43ed78271c44865574d5b` the coordinator/Role 6 review found the
field mapped and parsed for legacy allowlist compatibility and did **not** identify
it as a production UI authority consumer. This documentation correction alters no
SQL and does not resolve the future API redesign choice — whether to drop the flag
from the browse contract and source create capability from My Groups, or to change
the RPC audience deliberately.

## 5. Revised rollout sequence

1. **Preserve old reads.** Legacy read names keep their released shapes, so no
   client release is forced by column changes.
2. **Old create fails closed.** Applying this SQL to an authorized Test project
   makes the old three-argument create raise `group_capacity_upgrade_required`;
   it never silently creates an unlimited group.
3. **Capacity-aware clients call only the new contracts** — the `*_capacity`
   reads and the four-argument create — and must map the upgrade-required signal
   as specified above.
4. **SQL and client are reviewed as a pair at the same head.** The SQL draft and
   each client branch must be re-reviewed together before any Test preflight;
   this file does not substitute for that review.
5. **Cached-client recovery stays a separate requirement.** A build/version
   marker, an explicit refresh control and a no-cache shell are client-side work;
   this SQL cannot deliver them and does not attempt to.
6. **Test application requires new, explicit authorization.** The prior Test
   authorization did not cover this revised file. Before any application:
   exact-head Role 6 review of the changed SQL, Adam's Test-only authorization
   for this exact head, and an immediately preceding Test preflight reading
   current schema, functions, function **ownership**, effective/default
   privileges including any `service_role` grant, the invitation trigger state,
   group ownership, the `private` schema and the migration ledger. A material
   mismatch stops the application.

   Recorded 2026-11-22: the authorized live read-only preflight found the
   repository migration filenames, the actual Test ledger and the actual Main
   ledger to be **three different baselines**, with Main exposing only a
   two-argument `create_group_and_invite` where Test and the repository baseline
   have three, and with Main grants broader than Test for several public group
   functions. That is a material mismatch, so this step **stops at the
   preflight**: no application of the PR #41 SQL has occurred, and this
   document’s authorization record does not create one. Adam’s 2026-11-22
   authorization covers signed-in and multi-account Test QA and necessary Test
   schema/RLS/grant/ownership/security work within approved CityLink scope; Main
   stays read-only until official launch; deployment, publication and repository
   visibility/permission changes remain unauthorized. QA/security authorization
   is not merge or release approval.

7. **Compatibility objects are removed only later.** Once the capacity client is
   the only supported bundle, a separate lead-approved cleanup migration drops
   the stubs and wrappers. This file does not schedule or imply that removal.

Main is out of scope. Applying anything to Main would require Adam's separate
written decision recorded in `docs/team/DECISIONS.md`.

## 6. What the owner branches should do

- **Roy (group creation, invitations, join requests)** — from the current
  integration head, switch creation to the four-argument
  `create_group_and_invite(p_course_id, p_recipient_id, p_name, p_max_members)`,
  add the `group_capacity_upgrade_required` handler, and move any capacity
  display to `list_course_group_summaries_capacity(uuid)` /
  `list_current_term_course_groups_capacity(uuid, text, uuid, integer)`. Keep the
  existing `Group is full` / `Group maximum is not set` labels and the
  fail-closed roster rules; a compatibility read must never be used to make a
  capacity decision.
- **Jeffery (chat and recruitment posts)** — move recruitment card data to
  `list_group_recruitment_posts_capacity(uuid, timestamptz, uuid, integer)` to
  obtain `max_members`, `capacity_count`, `capacity_state` and
  `apply_block_reason`. Treat `can_create_post` from either browse contract as
  non-authoritative. Do not read capacity from a legacy name.
- **Eunice (independent QA and documentation)** — the decision log should record
  Option A as the selected compatibility approach, that legacy read shapes are
  preserved while legacy create fails closed, and that the value deltas in
  section 4 are part of the QA scope.
- **Role 6 (this task)** — re-review the exact final head of both the SQL and
  the paired client branches once the branches move; nothing here certifies a
  future head.

## 7. Open items and unresolved dependencies

1. **`private.can_browse_current_term_group` and
   `private.can_manage_recruitment_post` are referenced by this SQL but are
   defined in no checked-in migration** — the repository statement remains
   accurate; they appear only in
   `docs/stage6/CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql`. The live read-only
   catalog inspection Adam authorized on 2026-11-22 found **both helpers already
   present in live Test and in live Main** (`postgres` owner, `SECURITY DEFINER`,
   `EXECUTE` for `postgres` only). Their live origin and relationship to
   repository migration history are therefore **unreconciled**, which
   **reinforces rather than resolves** the migration-stop baseline mismatch in
   section 9. Before any application this dependency must either become its own
   checked-in migration or be formally documented as an out-of-band live object;
   ownership, effective/default grants and the private schema still need the
   recorded preflight reading at that moment.
2. **Function ownership was not rewritten.** The replaced and new objects inherit
   the ownership of whichever role executes the migration. `SECURITY DEFINER`
   wrappers therefore depend on live ownership being correct; verify it in
   preflight rather than assuming `postgres`.
3. **Non-`public`/`anon` grantees were not revoked.** This revision deliberately
   does not strip `service_role` or any other pre-existing grantee, because the
   server-side role may legitimately need access and the target's default
   privileges are unverified. Enumerate effective grants and default privileges
   in preflight and record them; only then decide whether a narrower grant set is
   safe. This is a known, documented gap — not a claim that privileges are
   already minimal.
4. **`can_create_post` contradiction is documented, not resolved** — under Adam’s
   safety contract it is a legacy client allowlist compatibility field that is
   **never** security authority; real authority is
   `private.can_manage_recruitment_post` plus the membership check, and a `false`
   value on the browse contract must not be read as an actual server denial. See
   `GROUP_CAPACITY_MIGRATION_DRAFT.md`, “Remaining integration issue”.
5. **The `max_members` column/constraint reuse** still does not fail closed if an
   existing same-named object differs; the exact-definition preflight requirement
   is unchanged.
6. **The unattached invitation-integrity guard** is still unattached; no trigger
   or policy change is included here.
7. **Result-limit/scale behaviour** of the read contracts is unchanged by this
   revision and still needs live QA on realistic data volumes.

## 8. Verification actually performed (static only)

Commands run inside the Role 6 sandbox against the checked-out head, all offline:

- `git worktree` based review of `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d` and
  `1a583e30c019733d1880d2614ca853481509fdad` (fresh clone; no shared checkout).
- Revision applied by an assertion-driven transformer; every anchor had to match
  exactly one line. Result: file grew from 1546 to 1756 lines;
  `sha256 5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`.
- Offline parser `pglast` 8.9 (Python 3.12.3, sandbox virtualenv): **59**
  top-level statements (`43` at base) — `17` `CreateFunctionStmt`, `32`
  `GrantStmt`, `2` `AlterTableStmt`, `2` `CommentStmt`, `1` `CreateSchemaStmt`,
  `1` `CreateStmt`, `1` `DoStmt`, `1` `DropStmt`, `2` `TransactionStmt`. No parse
  error. No database connection is possible in this mode.
- Structural checks (all in the validator, exit status `0`, zero problems):
  balanced dollar-quote tags; single `begin;`/`commit;`; no `CASCADE` in any
  statement; every created `public` function has a `revoke`+`grant` pair; the
  three `private` helpers are revoked from `public, anon, authenticated` with no
  grant; no legacy read name is dropped; legacy wrapper column and argument lists
  identical to the released definitions; the stub is `SECURITY INVOKER`, contains
  no `SELECT`/`FROM`/`auth.` reference, and matches the released three-argument
  return shape.
- `git diff --check` exit status `0`; no `client/` file modified.

**Not performed:** any PL/pgSQL execution plan check, any privilege or RLS
evaluation, any concurrency/lock test, any `pnpm` run against this revision, and
any contact with any Supabase project. Static parsing proves syntax and text
structure only; it does not prove that a function compiles at runtime, that
grants resolve as intended, or that capacity behaves correctly under load.

## 9. Authorization boundary and migration stop recorded 2026-11-22

Adam’s 2026-11-22 scope, recorded because it changes what section 5 step 6
previously assumed was merely “not yet authorized”:

1. Signed-in Test QA and multi-account Test QA are **authorized** within the
   approved CityLink scope, against disposable Test `wkzclgmhrtecnpexfesr` only.
2. Necessary Test schema, RLS, grant, ownership and security-policy work is
   **authorized** within that scope, with every exact change and result recorded.
3. Main `pijslbchvstkoweslymr` is **read-only** inspection and verification until
   official launch: no Main write, migration, deletion or schema change. Any
   future Main change still needs Adam’s separate written decision in
   `docs/team/DECISIONS.md`.
4. Deployment, publication and repository visibility/permission changes are
   **not** authorized.
5. QA and security authorization is **not** merge or release approval.

**Migration stop.** The authorized live read-only preflight found three different
baseline identities for the same schema history — checked-in repository migration
filenames, the actual Test ledger, the actual Main ledger — plus a
two-argument `create_group_and_invite` on Main against three arguments in Test
and in the repository baseline, and differing grant posture (several Main public
group functions grant `service_role`, and three grant `anon`, where Test does
not). By Adam’s existing release gate a material mismatch is a preflight stop, so
the Option A SQL on PR #41 **remains unapplied**, and the compatibility stub and
legacy read wrappers stay in place by design rather than by omission.

**Baseline reconciliation is now the first blocker.** Because the two `private`
helpers exist live in both projects but in no checked-in migration, the live
baseline origin and the repository history must be reconciled — as a new
checked-in migration for the dependency, or as a formally documented out-of-band
object — before any capacity migration can be proposed again. Role 6 cannot
perform that reconciliation from static sources alone and no live access was used
for this documentation amendment.

**Scope of this amendment.** F4 was a documentation-only correction requested by
Adam after F1 completed. It changes no SQL, no client behaviour and no
deployment state, and it is not an application, merge or release approval.
