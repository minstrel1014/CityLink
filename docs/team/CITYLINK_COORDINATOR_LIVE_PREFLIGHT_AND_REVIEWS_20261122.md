# CityLink live preflight and F2/F4 evidence — 2026-11-22

**Coordinator:** `HeZwm7CA7Y3rDtYBounkVC`  
**Human lead:** Adam  
**Safety result:** Only read-only Supabase inspection occurred. No migration, application-row write, Test reset/delete, Main write, merge, deployment or publication occurred.

## 1. Adam's authorization received in the main task

At 2026-11-22 16:16 HKT Adam authorized the following:

1. Signed-in Test QA and multi-account Test QA: authorized.
2. Necessary schema, RLS, grant, ownership and security-policy work: authorized within approved CityLink scope, with exact changes and results recorded.
3. Main access: read-only inspection/verification only until official launch. No Main writes, migrations, deletions or schema changes.
4. Deployment/publication: not authorized; ask first.
5. GitHub repository visibility/permission changes: not authorized; ask when needed.
6. Reassigning owners or creating replacement tasks: authorized when necessary while preserving original task/ownership history.
7. Before any significant action, explain change/reason/scope/risk/expected result in simple Traditional Chinese.
8. Do not expose secrets, reset/delete Test, or treat QA as merge/release approval.

## 2. Exact repository artifacts

- `main`: `1a583e30c019733d1880d2614ca853481509fdad`
- client integration base during F2 review: `d4558a73dccfa0878dc43ed78271c44865574d5b`
- current client integration / PR #37 head after F1b: `344c1058e78fd2cccfde89574e226f3e65a1457c`
- PR #34 migration base: `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`
- PR #41 reviewed SQL blob head before F4: `2bc29595f5c66b0f379a4a46f544a2364fc88be2`
- PR #41 current docs-inclusive head: `2bb659d6e565ba74c49c124f0f17a326877e66ae`
- PR #46 docs head: `d4558a73dccfa0878dc43ed78271c44865574d5b`
- PR #46 state: closed/merged into the integration base only; two documentation files.
- PR #37 state: open/draft/mergeable/clean.
- PR #41 state: open/draft/mergeable/clean.

Independent validation of `d4558a7...`:

- `corepack pnpm install --frozen-lockfile`: pass, lockfile unchanged.
- `corepack pnpm check`: pass.
- `corepack pnpm test`: pass, 40 files / 637 tests / 0 failures.
- `corepack pnpm build:static`: pass.
- `git diff --check` and tree: clean.
- Known Vite warnings only: non-module `/api/platform/config.js`; one JS chunk >500 kB.

## 3. Eunice F2 direct handoff

File source: `/home/ubuntu/upload/Eunice-F2-Contract-Docs-QA-Review-Handoff-20261122.md`

Result: **F2 is compatible in direction but requires three bounded wording amendments.**

- F1 verification: pass. Exact approved stale-client string and draft-loss wording are integrated.
- F2 implementation status: not implemented for build/version marker, visible Refresh CityLink control, or `index.html` no-store behavior.
- F4: migration-branch docs absent from client head; not edited.
- Required corrections:
  1. Remove the proposal's remaining claim that stale-client wording is still open.
  2. Remove stale-client wording and draft warning from the proposal's open-decision list.
  3. Cleanup wording must not allow dropping stub/wrappers merely after cache window; require all F2 completion conditions, cached-client recovery, recorded evidence and new explicit Adam approval.
- Eunice explicitly did not edit/push or use Supabase.

## 4. Role 6 F2 direct handoff

File source: `/home/ubuntu/upload/ROLE6-F2-CONTRACT-REVIEW-2026-11-22.md`

Result: **Accept F2 direction with amendments.** No client code blocker; F2 is client/host work and requires no database change.

- A build/version marker: compatible with amendment. No reliable marker currently exists. Vite content hashes alone are not a version marker because a running old bundle cannot discover a newer entry. A public, secret-free build ID plus freshly fetched non-cached comparison target is required. Exact carrier must be implementation-reviewed.
- B upgrade prompt/refresh: compatible. Exact string and create-only reach verified; matcher accepted. Need settle:
  1. whether exact create-specific message is used only in group-creation paths or also for a general proactive banner;
  2. whether refresh is an in-app user-clicked control versus a browser-refresh instruction.
- C `index.html`: compatible with amendment but not satisfied by checkout. Current production Express serves `index.html` without `no-store`; static-host behavior cannot be proven from repo alone and must later be evidenced with response headers. No-store is necessary but not sufficient for an already-running stale SPA.
- D compatibility-period conditions: sound direction but wording must split start prerequisites from end conditions, bind review to exact successor head pairs, define stub removal separately from wrapper removal, and require telemetry/cache-window evidence plus Adam approval.
- E stub/wrappers: compatible; PR #41 keeps fail-closed create behavior and released signatures/column shapes; no removal is permitted.
- Role 6 says F3 remains preflight blocker because its static review had no live access.
- Prior reviewed application code at `90e2762` and new docs head `d4558a7` is byte-identical in `client`, `server`, `vite.config.ts`, `package.json`, so the prior joint client verdict carries forward.

## 5. Coordinator live read-only preflight

### Project identity/status

- Test `wkzclgmhrtecnpexfesr`: `CityLink-Stage5-Test`, `ACTIVE_HEALTHY`, Postgres 17.
- Main `pijslbchvstkoweslymr`: `CityLink Project`, `ACTIVE_HEALTHY`, Postgres 17.

No secret values, connection strings, keys or `.env` were read/printed.

### Test actual state

Applied ledger versions:

- `20261118082247 stage6_people_page_naming`
- `20261118043211 stage6_chat_recruitment`
- `20261117133731 stage5_course_detail_group_views`
- `20261117044721 stage5_course_group_invite_candidates`
- `20261114163512 … stage5_group_authority_and_succession`
- `20261102140927 stage5_course_roster_rpc`
- `20261102131343 stage5_groups`

Observed:

- `create_group_and_invite` has **only 3-argument** overload: `p_course_id uuid, p_recipient_id uuid, p_name text`; owner `postgres`; SECURITY DEFINER; EXECUTE `postgres` + `authenticated` only.
- No `*_capacity` public functions.
- `study_groups` has no `max_members` column.
- Private helpers already exist live:
  - `private.can_browse_current_term_group(uuid)`
  - `private.can_manage_recruitment_post(uuid)`
  - owner postgres, SECURITY DEFINER, EXECUTE postgres only.
- `private` schema USAGE: postgres + authenticated; service_role absent.
- `public` schema USAGE: anon/authenticated/service_role/postgres present.
- `invitations`: RLS enabled, 4 policies, 1 trigger.
- `study_groups`: RLS enabled, 1 policy, 1 trigger.
- Core tables include both `invitations` and `group_invitations`, plus `group_memberships`, `group_join_requests`, `group_recruitment_posts`, `study_groups`.

### Main actual state (read-only)

Applied ledger versions:

- `20261118080722 stage6_chat_recruitment`
- `20261118034505 stage5_course_detail_group_views`
- `20261118034458 stage5_course_group_invite_candidates`
- `20261118034447 stage5_group_authority_and_succession`
- `20261118034001 stage5_course_roster_rpc`
- `20261118033944 stage5_groups`
- `20261118033916 stage5_term_model`

Observed:

- `create_group_and_invite` has only **2 arguments**: `p_course_id uuid, p_recipient_id uuid`.
- No `max_members`.
- No `*_capacity` functions.
- Both private helpers exist with same signatures/owners/definer flags/ACL as Test.
- Core group table set matches Test.
- Many public group functions grant `service_role=X`; several grants are broader than Test, for example `create_group_and_invite` is `postgres + authenticated + service_role`, while Test is only `postgres + authenticated`.
- `request_to_join_group`, `review_group_join_request`, and `send_group_invitation` also grant `anon=X` on Main.
- `service_role` and `postgres` have BYPASSRLS.
- `private` schema USAGE excludes service_role.

## 6. Critical material mismatch

There are **three different baseline identities** for supposedly related schema history:

1. repository checked-in filenames;
2. actual Test ledger;
3. actual Main ledger.

Additionally Main's create RPC signature (2 args) differs from Test/repository baseline (3 args), and grant posture differs. By Adam's existing release gate, a material mismatch **stops migration application**. This is now an independently verified fact, not a theoretical assumption.

Consequences:

- PR #41 SQL must **not** be applied to Test yet.
- New client must **not** be deployed/signed-in QA tested against current Test because capacity functions/`max_members` do not exist.
- Role 6 must reconcile the live baselines and migration history before any migration is proposed.
- Main read-only inspection confirmed current production does not have capacity rollout deployed.

## 7. Current classification

- F2 direction: **accepted with wording amendments**, not yet final rollout approval.
- F1: complete/integrated and independently validated.
- F2 implementation: still required.
- F4: deferred correction is now eligible, but only as a bounded docs amendment; no SQL blob change.
- Migration/Test preflight: **paused due material live-baseline mismatch**.
- Deploy/publish/repo permissions: **not authorized**.

## 8. Detailed exact migration-ledger comparison (authorized read-only)

Checked-in repository files at `main`, client `d4558a7`/`344c105`, PR #34 `5537baa`:

| Repository version | Name |
|---|---|
| `20261102090000` | `stage5_term_model` |
| `20261102131343` | `stage5_groups` |
| `20261102140927` | `stage5_course_roster_rpc` |
| `20261114163512` | `20261114162301_stage5_group_authority_and_succession` |
| `20261117043100` | `stage5_course_group_invite_candidates` |
| `20261117205600` | `stage5_course_detail_group_views` |
| `20261118050000` | `stage6_chat_recruitment` |
| `20261118083000` | `stage6_people_page_naming` |

PR #34/#41 additionally contain `20261119090000_group_hard_max.sql`.

Live Test ledger:

| Version | Name |
|---|---|
| `20261102131343` | `20261102_stage5_groups` |
| `20261102140927` | `20261102_stage5_course_roster_rpc` |
| `20261114163512` | `20261114162301_stage5_group_authority_and_succession` |
| `20261117044721` | `stage5_course_group_invite_candidates` |
| `20261117133731` | `stage5_course_detail_group_views` |
| `20261118043211` | `stage6_chat_recruitment` |
| `20261118082247` | `stage6_people_page_naming` |

Test has no exact ledger row for repository `20261102090000_stage5_term_model`, although its stage5 migration statement records internal marker `20261102_stage5_groups`.

Live Main ledger:

| Version | Name |
|---|---|
| `20261118033916` | `stage5_term_model` |
| `20261118033944` | `stage5_groups` |
| `20261118034001` | `stage5_course_roster_rpc` |
| `20261118034447` | `stage5_group_authority_and_succession` |
| `20261118034458` | `stage5_course_group_invite_candidates` |
| `20261118034505` | `stage5_course_detail_group_views` |
| `20261118080722` | `stage6_chat_recruitment` |

Main has no `stage6_people_page_naming` row. No single identity among repository/Test/Main has the same version/name series.

## 9. Detailed Test security preflight

Exact target was re-verified as `wkzclgmhrtecnpexfesr` / `CityLink-Stage5-Test` / `ACTIVE_HEALTHY` immediately before queries.

Relevant tables are all `postgres`-owned, RLS enabled and not forced. Effective direct-role posture:

| Role | Public USAGE | Private USAGE | Bypass | Current group table SELECT | Direct INSERT on current group tables |
|---|---:|---:|---:|---:|---:|
| anon | yes | no | no | no | no |
| authenticated | yes | yes | no | yes | no |
| service_role | yes | no | yes | yes | yes |
| postgres | yes | yes | yes | yes | yes |

Legacy `invitations` additionally gives authenticated INSERT/UPDATE, with table policy and BEFORE trigger guards. Current `group_chat_messages` and `group_recruitment_posts` have no RLS policy rows, so direct authenticated access is blocked and behavior is RPC-mediated.

Exact policy posture:

- `group_invitations.participants read group invitations`: SELECT for sender/recipient or active group member.
- `group_join_requests.requester and current leader read join requests`: SELECT for requester or current creator who is also an active member.
- `group_memberships.members read group memberships`: SELECT for active member or own row.
- `study_groups.authenticated read eligible groups`: SELECT via `private.can_view_group(id, auth.uid())`.
- `invitations`: four sender/recipient/enrollment/pending-state policies.

Effective core RPC ACL: authenticated EXECUTE is true; service_role and anon are false; all tested objects are postgres-owned SECURITY DEFINER. `create_group_and_invite` only has the three-argument signature. Current membership/recruitment triggers use postgres-owned private DEFINER helpers.

Default privilege evidence:

- postgres-created public functions default to EXECUTE for postgres only;
- postgres-created public tables default to DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for anon/authenticated/service_role, not INSERT/SELECT/UPDATE;
- supabase_admin-created public objects have broader Supabase defaults.

Existing object ACLs are the relevant baseline evidence, but the default split matters for migration owner identity.

## 10. Detailed Main read-only security comparison

Exact target was re-verified as `pijslbchvstkoweslymr` / `CityLink Project` / `ACTIVE_HEALTHY`.

Table RLS/role posture is materially close to Test for current group tables, but Main's explicit RPC grants are broader:

| RPC | authenticated | service_role | anon |
|---|---:|---:|---:|
| `create_group_and_invite(uuid,uuid)` | true | true | false |
| `list_course_group_summaries(uuid)` | true | true | false |
| `list_current_term_course_groups(...)` | true | true | false |
| `list_group_recruitment_posts(...)` | true | true | false |
| `list_group_chat_messages(...)` | true | true | false |
| `send_group_chat_message(...)` | true | true | false |
| `respond_to_group_invitation(...)` | true | true | false |
| `review_group_join_request(...)` | true | true | **true** |
| `send_group_invitation(...)` | true | true | **true** |
| `request_to_join_group(...)` | true | true | **true** |

No capacity functions, no `max_members`, and only the two-argument create overload exists.

Private helper comparison:

- `private.can_browse_current_term_group(uuid)` exists, postgres-owned SECURITY DEFINER, direct execute false for authenticated/service_role/anon;
- `private.can_manage_recruitment_post(uuid)` exists with same posture;
- `private` schema owner is postgres and USAGE is postgres/authenticated, not service_role;
- postgres/authenticated effective group-table posture is the same narrow pattern as Test; service_role has bypass and broad table privileges.

Main triggers and policy names/expressions match the relevant Test patterns at the metadata level: membership leadership/recruitment closure and invitation integrity remain present. This comparison does not authorize a Main write. The anon EXECUTE rows are a material security difference and must be handled only through a separately approved, reviewed rollout/security migration plan—not current Main access.

## 11. Refined stop decision

The blocker is stronger than “no capacity migration”:

1. repository filenames/versions are not the actual migration-ledger versions for Test or Main;
2. Test lacks a term-model ledger row while Main has one;
3. Test has people-page naming while Main does not;
4. Main's create arity is two arguments, while Test/repo baseline has three;
5. Main has broader RPC grants including anon on three writes;
6. private helpers exist live in both but checked-in migrations do not define them.

Therefore the capacity migration cannot be inferred or blindly replayed. Role 6 must first produce a baseline reconciliation that maps actual objects/migration intent to a reviewed successor sequence. Only after that and Adam's exact SQL-head authorization can migration planning continue.

## 12. F1b reconciliation and current head update

Eunice delivered F1b directly from `d4558a7` to `344c1058e78fd2cccfde89574e226f3e65a1457c`, changing only `docs/team/CAPACITY_CLIENT_SCHEMA_CUTOVER_PROPOSAL.md` and `docs/team/DECISIONS.md`. The coordinator independently fetched, reviewed the full diff and validated exact head with frozen install, typecheck, 637 tests and static build, all passing.

The integration branch was normally fast-forwarded to `344c105...`. PR #37 now reports OPEN/draft/mergeable/clean at that head; PR #47 is closed/merged into integration base only. `main` remains `1a583e30c019733d1880d2614ca853481509fdad`. F4 is still awaiting Role 6's bounded docs-only return.

## 13. F4 documentation outcome

Role 6 delivered a linear documentation-only chain from the reviewed SQL head `2bc2959...`:

`74a9e71...` safety and authorization wording -> `0d10293...` table layout correction -> `2bb659d6e565ba74c49c124f0f17a326877e66ae` Prettier-canonical formatting.

Only two files changed:

- `docs/team/GROUP_CAPACITY_MIGRATION_DRAFT.md`
- `docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md`

Required proof independently re-run by the coordinator:

```text
git diff 2bc29595f5c66b0f379a4a46f544a2364fc88be2 2bb659d6e565ba74c49c124f0f17a326877e66ae -- supabase
```

The command produced zero bytes. The SQL blob stayed `a04048e90d6b64c692f03c722b9eea2849058aab`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`. `git diff --check` passed and Prettier 3.6.2 reported both Markdown files canonical.

The verified F4 head was normally fast-forwarded onto PR #41's existing head branch `feature/role6-capacity-compatibility-migration-20261121`. GitHub subsequently reported PR #41 OPEN/draft, base unchanged and head `2bb659d...`, mergeable/clean. This is not merge to main, migration application, deployment or publication.

F4 wording now states explicitly that:

- `can_create_post` is a legacy client allowlist compatibility field only;
- it is never security authority;
- real server authority is `private.can_manage_recruitment_post` plus the relevant membership check;
- browse-row `false` must not be interpreted as an actual authorization denial;
- the private helpers are absent from checked-in migrations but present in live Test/Main, so their origin remains unreconciled;
- Adam's 2026-11-22 QA/security authorization does not authorize applying PR #41.

## 14. Coordinator reconciliation snapshot — 2026-11-22 17:09 HKT

Current exact refs:

- `main`: `1a583e30c019733d1880d2614ca853481509fdad`
- client integration / PR #37: `344c1058e78fd2cccfde89574e226f3e65a1457c`
- migration base / PR #34: `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`
- PR #41 docs-inclusive head: `2bb659d6e565ba74c49c124f0f17a326877e66ae`
- this evidence PR #48 base commit: `9da4a9fad099d669110145e54410387f79f63e06`

The coordinator fast-forwarded PR #41's existing head branch to the verified F4 commit. This did not alter the SQL blob or merge any branch.

Role 6 received a new finite baseline-reconciliation assignment. It is authorized to create a documentation branch and draft PR stacked on this evidence branch, and to use metadata-only catalog inspection against the exact Test/Main targets if required. It is not authorized to apply migrations, change Test/Main, read application rows, edit code, merge, deploy or publish. Its result will determine whether a successor capacity SQL/client pairing can be proposed.

The capacity migration remains stopped. Current Test does not contain capacity functions or `max_members`, so signed-in capacity QA cannot yet exercise the integrated capacity client against the live database.

Remaining F2 decisions for Adam:

1. proactive version-mismatch notice: use a second string or reuse only the create-path message;
2. refresh action: in-app user-clicked control or browser-reload instruction;
3. compatibility/cache window length and who declares completion;
4. named owner for signed-in multi-account capacity QA after migration readiness.
