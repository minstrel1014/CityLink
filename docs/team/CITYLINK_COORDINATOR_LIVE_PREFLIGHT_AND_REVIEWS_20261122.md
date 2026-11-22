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

| Repository version | Name                                                   |
| ------------------ | ------------------------------------------------------ |
| `20261102090000`   | `stage5_term_model`                                    |
| `20261102131343`   | `stage5_groups`                                        |
| `20261102140927`   | `stage5_course_roster_rpc`                             |
| `20261114163512`   | `20261114162301_stage5_group_authority_and_succession` |
| `20261117043100`   | `stage5_course_group_invite_candidates`                |
| `20261117205600`   | `stage5_course_detail_group_views`                     |
| `20261118050000`   | `stage6_chat_recruitment`                              |
| `20261118083000`   | `stage6_people_page_naming`                            |

PR #34/#41 additionally contain `20261119090000_group_hard_max.sql`.

Live Test ledger:

| Version          | Name                                                   |
| ---------------- | ------------------------------------------------------ |
| `20261102131343` | `20261102_stage5_groups`                               |
| `20261102140927` | `20261102_stage5_course_roster_rpc`                    |
| `20261114163512` | `20261114162301_stage5_group_authority_and_succession` |
| `20261117044721` | `stage5_course_group_invite_candidates`                |
| `20261117133731` | `stage5_course_detail_group_views`                     |
| `20261118043211` | `stage6_chat_recruitment`                              |
| `20261118082247` | `stage6_people_page_naming`                            |

Test has no exact ledger row for repository `20261102090000_stage5_term_model`, although its stage5 migration statement records internal marker `20261102_stage5_groups`.

Live Main ledger:

| Version          | Name                                    |
| ---------------- | --------------------------------------- |
| `20261118033916` | `stage5_term_model`                     |
| `20261118033944` | `stage5_groups`                         |
| `20261118034001` | `stage5_course_roster_rpc`              |
| `20261118034447` | `stage5_group_authority_and_succession` |
| `20261118034458` | `stage5_course_group_invite_candidates` |
| `20261118034505` | `stage5_course_detail_group_views`      |
| `20261118080722` | `stage6_chat_recruitment`               |

Main has no `stage6_people_page_naming` row. No single identity among repository/Test/Main has the same version/name series.

## 9. Detailed Test security preflight

Exact target was re-verified as `wkzclgmhrtecnpexfesr` / `CityLink-Stage5-Test` / `ACTIVE_HEALTHY` immediately before queries.

Relevant tables are all `postgres`-owned, RLS enabled and not forced. Effective direct-role posture:

| Role          | Public USAGE | Private USAGE | Bypass | Current group table SELECT | Direct INSERT on current group tables |
| ------------- | -----------: | ------------: | -----: | -------------------------: | ------------------------------------: |
| anon          |          yes |            no |     no |                         no |                                    no |
| authenticated |          yes |           yes |     no |                        yes |                                    no |
| service_role  |          yes |            no |    yes |                        yes |                                   yes |
| postgres      |          yes |           yes |    yes |                        yes |                                   yes |

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

| RPC                                    | authenticated | service_role |     anon |
| -------------------------------------- | ------------: | -----------: | -------: |
| `create_group_and_invite(uuid,uuid)`   |          true |         true |    false |
| `list_course_group_summaries(uuid)`    |          true |         true |    false |
| `list_current_term_course_groups(...)` |          true |         true |    false |
| `list_group_recruitment_posts(...)`    |          true |         true |    false |
| `list_group_chat_messages(...)`        |          true |         true |    false |
| `send_group_chat_message(...)`         |          true |         true |    false |
| `respond_to_group_invitation(...)`     |          true |         true |    false |
| `review_group_join_request(...)`       |          true |         true | **true** |
| `send_group_invitation(...)`           |          true |         true | **true** |
| `request_to_join_group(...)`           |          true |         true | **true** |

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
6. the two private helpers exist live in both and **are** defined by checked-in migration `20261118050000_stage6_chat_recruitment.sql` (`:133` and `:160`, `SECURITY DEFINER SET search_path = ''`, grants revoked at `:931`–`:932`), which both targets recorded an apply for; their origin is therefore explained, not out-of-band.

Role 6 correction, 2026-11-22: the earlier wording of item 6 (“checked-in migrations do not define them”) was factually wrong and has been replaced above. The narrowed residual question is whether the live helper bodies are byte-identical to the committed text, which still needs a metadata-only `pg_get_functiondef` comparison per target. See `CAPACITY_BASELINE_RECONCILIATION_ROLE6_20261122.md` §4, §7 and §11 for the full three-way ledger mapping, the reason version identifiers diverge (the migration tool records its own execution timestamp), and the replay-safety conclusion.

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
- Adam's 2026-11-22 QA/security authorization does not authorize applying PR #41.

The private-helper origin statement in sections 11 and 13 is a correction to this evidence document produced by Role 6 PR #49. It is **not yet present in PR #41 head** `2bb659d6e565ba74c49c124f0f17a326877e66ae`: both `docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md` and `docs/team/GROUP_CAPACITY_MIGRATION_DRAFT.md` at that head still incorrectly say that the two helpers are defined in no checked-in migration. The repository source is `supabase/migrations/20261118050000_stage6_chat_recruitment.sql` (`:133` and `:160`), with browser-role revocations at `:931`–`:932`. A separate bounded docs-only PR #41 amendment remains required; it must prove the reviewed SQL blob and SHA-256 remain unchanged.

## 14. Coordinator reconciliation snapshot — 2026-11-22 17:09 HKT

Current exact refs:

- `main`: `1a583e30c019733d1880d2614ca853481509fdad`
- client integration / PR #37: `344c1058e78fd2cccfde89574e226f3e65a1457c`
- migration base / PR #34: `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`
- PR #41 reviewed SQL-only head: `2bc29595f5c66b0f379a4a46f544a2364fc88be2`
- PR #41 docs-inclusive head: `2bb659d6e565ba74c49c124f0f17a326877e66ae`
- evidence PR #48 first commit: `9da4a9fad099d669110145e54410387f79f63e06`

The coordinator fast-forwarded PR #41's existing head branch to the verified F4 commit. The operation was a normal fast-forward, not a force-push, merge into another release branch, migration application, deployment or publication.

Role 6 received a new finite baseline-reconciliation assignment. It is authorized to create a documentation branch and draft PR stacked on this evidence branch and to use metadata-only catalog inspection against the exact Test and Main targets when needed. It is not authorized to apply migrations, change Test or Main, read application rows, edit source code, merge, mark ready, deploy or publish. Its result will determine whether a successor capacity SQL/client pairing can be proposed.

The capacity migration remains stopped. Current Test does not contain capacity functions or `max_members`, so signed-in capacity QA cannot yet exercise the integrated capacity client against the live database.

Remaining F2 decisions for Adam:

1. proactive version-mismatch notice: use a second string or reuse only the create-path message;
2. refresh action: provide an in-app user-clicked control or give a browser-reload instruction;
3. compatibility/cache window length and who declares completion;
4. named owner for signed-in multi-account capacity QA after migration readiness.

## 15. Role 6 baseline integration and remaining PR #41 correction — 2026-11-22 17:40 HKT

The coordinator independently verified Role 6 PR #49 at head `f96e11cdde7e06d8dcdce929e13eb73f3fd5eb01` before integrating it:

- the branch contains the full baseline reconciliation file and only the two assigned documentation files;
- the evidence-file correction accurately identifies and replaces the earlier false helper-origin wording from PR #48;
- `git diff --check` passes;
- Prettier 3.6.2 reports both files canonical;
- the reviewed PR #41 SQL blob remains `a04048e90d6b64c692f03c722b9eea2849058aab` and is untouched by PR #49.

PR #49 was normally merged into the evidence branch at merge commit `47fcc9cb5458d93d15e0a4cd32932a3b59e13695`, and the evidence branch was updated to that commit. This integration affects PR #48's evidence base only; it does not merge PR #49 into `main`, PR #37, PR #41, PR #34, or any database. It does not apply a migration or authorize deployment/publication.

The evidence branch then received this bounded docs-only follow-up to prevent PR #49's correction from being mistaken for a correction already applied to PR #41. PR #41 remains OPEN/draft at `2bb659d...` with its factual helper-origin error outstanding.

Role 6's substantive baseline conclusion is now part of the evidence record: version differences across repository/Test/Main mostly reflect the timestamp recorded by each migration execution rather than missing objects. The repository cannot safely reconstruct either live target's ledger by blind replay. Test has an unrecorded term-model application with strong indirect evidence that its objects exist; Main genuinely lacks row 8 (`stage6_people_page_naming`) and therefore has only the two-argument create overload. Main's broader RPC grants, including anon execute on three write RPCs, remain a separate security finding that must not be bundled with capacity DDL.

The capacity migration remains stopped. The coordinator subsequently performed the metadata-only live parity records that Role 6 could not run because its session lacked a Supabase connector. Both targets were re-verified immediately before each database call. Results are recorded in `CITYLINK_TEST_MAIN_METADATA_PARITY_COORDINATOR_20261122.md`.

Adam's outstanding decisions before that technical continuation are:

1. accept the helper-origin correction and the policy of using `20261118050000_stage6_chat_recruitment.sql` as the authoritative source rather than adding a helper-redefinition migration;
2. direct a bounded PR #41 docs-only correction and name whether Role 6 should perform it;
3. reconcile the documentation conflict in which Main has a `stage6_chat_recruitment` ledger row while Stage 6 documentation describes Main as untouched;
4. document the conflict between `docs/SUPABASE_SETUP.md` and the 2026-11-18 `DECISIONS.md` file-5 record;
5. confirm whether any live surface currently points at Main;
6. decide the four F2 implementation questions above: proactive second message string, refresh-control form, compatibility/cache window owner and length, and signed-in multi-account capacity QA owner.

None of these documentation and baseline steps authorize migration application, Main writes, merge to `main`, PR readiness, deployment or publication.

## 16. Coordinator live metadata parity outcome — 2026-11-22 17:50 HKT

The coordinator ran SELECT-only catalog checks against the exact disposable Test project `wkzclgmhrtecnpexfesr` (`CityLink-Stage5-Test`, `ACTIVE_HEALTHY`) and exact read-only Main project `pijslbchvstkoweslymr` (`CityLink Project`, `ACTIVE_HEALTHY`). No application row, secret, credential, connection value or setting value was read. No DDL, grant, migration, invocation, write, reset or deletion occurred.

The live result confirms all three technical points needed for the next Role 6 successor design:

1. **Term-model object parity is exact** for the checked tables, `courses.term_id NOT NULL`, primary keys, checks, foreign keys and RLS posture, even though Test lacks the repository term-model ledger row. This strengthens the “unrecorded apply, objects present” conclusion without claiming that the ledger can or should be reconstructed by replay.
2. **Helper origin is explained and no semantic helper drift was detected.** Both private helpers exist with browser-role execute revoked. After normalizing comments, whitespace and token spacing, both live helper bodies match each other and the checked-in Stage 6 migration. Raw text differs only because stored source formatting differs; canonical SHA-256 values and per-target raw hashes are recorded in the parity report. No helper-redefinition migration is recommended.
3. **Main really lacks row 8.** Main has no `update_own_display_name`, `list_course_ungrouped_classmates`, `get_current_term_coursemate_profile`, recruitment-post `subject` column/return field, three-argument group-create overload or row-8 constraints. Test has them. Neither target has capacity functions or `max_members`.

The parity report also compares current code heads with live catalogs. `main` client code calls the three-argument `create_group_and_invite`, while live Main has only a two-argument overload; PR #37 client code calls the four-argument capacity overload, while neither live target has it. The first mismatch becomes an actual production break only if a confirmed live surface currently serves the `main` client against Main. That deployment fact remains Adam's to confirm; it must not be inferred from repository code alone.

Consequently, the next finite database action is not to apply PR #41. Role 6 should first use the parity report to define a forward-only successor with explicit per-target prerequisite assertions and keep Main security/grant remediation, ledger repair and capacity DDL as separately reviewed changes. PR #41's helper-origin docs correction is still outstanding.
Consequently, the next finite database action is not to apply PR #41. Role 6 should first use the parity report to define a forward-only successor with explicit per-target prerequisite assertions and keep Main security/grant remediation, ledger repair and capacity DDL as separately reviewed changes. PR #41's helper-origin docs correction was still outstanding when this subsection was written; Section 17 records that it was subsequently completed and independently verified.

## 17. PR #41 helper-origin docs correction — independently verified, 2026-11-22 18:04 HKT

Role 6 completed the bounded docs-only correction requested in Section 15. The coordinator independently verified the pushed result in a clean detached worktree at the new remote head.

Exact Git evidence:

- previous PR #41 head: `2bb659d6e565ba74c49c124f0f17a326877e66ae`;
- new PR #41 head: `65058a8077ad89f5796151e7eeb539ba7b616d0c`;
- the new commit's parent is exactly the previous head;
- the existing head branch `feature/role6-capacity-compatibility-migration-20261121` advanced by a normal fast-forward push, with no force-push, new branch or replacement PR;
- `git diff --name-only` between the two commits contains exactly:
  - `docs/team/CAPACITY_COMPATIBILITY_MIGRATION_ROLE6_20261121.md`;
  - `docs/team/GROUP_CAPACITY_MIGRATION_DRAFT.md`;
- the diff contains 78 added and 33 removed lines across only those two documents;
- changes under `supabase`, `client`, `server`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts` and `docs/team/DECISIONS.md`: 0 paths;
- `git diff --check 2bb659d...65058a8` exited 0;
- `supabase/migrations/20261119090000_group_hard_max.sql` is unchanged from the previous head;
- its Git blob remains `a04048e90d6b64c692f03c722b9eea2849058aab`;
- its file SHA-256 remains `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`;
- Prettier 3.6.2 `--check` passed for both changed documents;
- the verification worktree remained clean.

The corrected documents now identify `20261118050000_stage6_chat_recruitment.sql` as the checked-in origin of `private.can_browse_current_term_group` and `private.can_manage_recruitment_post`, with definitions at `:133` and `:160` and browser-role revocations at `:931`–`:932`. The earlier repository-absence judgement is expressly labelled factually wrong and superseded by the coordinator's 2026-11-22 metadata-only parity record. They also retain the live-posture facts as evidence: both helpers exist in Test and Main, are `postgres`-owned, `SECURITY DEFINER`, use an empty `search_path`, have `EXECUTE` false for `anon`, `authenticated` and `service_role`, and match the checked-in body after comment/whitespace/token-spacing normalization.

Evidence class remains important. Role 6 had zero Supabase access in its session; the live catalog facts are coordinator-reported under Adam's 2026-11-22 read-only authorization. The correction fixes the repository-history statement in PR #41's documents. It does not apply SQL, change PR #41's migration content or its unapplied status, and does not approve Role 6's recommendation to avoid a helper-redefinition migration. Both corrected files explicitly leave that recommendation pending Adam's decision.

GitHub state re-read after verification:

- PR #41 remains OPEN/draft;
- base remains `feature/group-capacity-migration` at `5537baa40ecc2bd2dc05bc2eeca07f14bfcc7c2d`;
- head is `65058a8077ad89f5796151e7eeb539ba7b616d0c`;
- PR status remains mergeable and clean;
- the PR file list contains the two corrected documents plus the unchanged Option A SQL file;
- no PR was transitioned from draft, merged, deployed or published.

This evidence-branch update integrates the already-pushed PR #41 correction into the coordinator's record. It is not a merge of PR #41 into `main`, an approval of its SQL, a database migration action, or release authorization. Adam's remaining decisions listed in Section 15 still stand, except that the finite docs-only correction item itself is complete.

## 18. Adam's 2026-11-22 decisions and Stage 6 Main evidence reconciliation — 18:52 HKT

Adam answered the outstanding decisions in Section 15. This section records the exact result and distinguishes located evidence from remaining gaps.

**Helper policy — approved.** `20261118050000_stage6_chat_recruitment.sql` is the authoritative origin of both private helpers. The successor capacity migration must not redefine them; each target must pass per-target prerequisite assertions immediately before any separately authorized application. This unblocks successor drafting, not application.

**Stage 6 Main question — option C, with a narrower gap than initially believed.** Adam directed the team to retain the old Test-only document as a dated phase record and record the later Main action, while checking evidence. The coordinator located:

| Evidence                                     | Result                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization commit                         | `c3d65e40310a9282dc0ea020dc08d972915b6721`, 2026-11-18T08:04:12Z, `docs(team): record Adam's Stage 6 Main migration authorization`                                                                |
| Result commit                                | `0fd6926be6796b6c1537de70d11bb3967ae1c561`, child of the authorization commit, 2026-11-18T08:08:07Z, `docs(team): report Stage 6 Main migration result`                                           |
| Migration source                             | `supabase/migrations/20261118050000_stage6_chat_recruitment.sql` at `d667b6f`                                                                                                                     |
| Reported and independently re-hashed SHA-256 | `861f0042392a8142b8cfe19f9d9f768a2d1ef91ce4f2e359e26b816c1db6d87f`                                                                                                                                |
| Live Main ledger                             | `20261118080722 / stage6_chat_recruitment`, success at 16:07 +08:00                                                                                                                               |
| Reported post-apply checks                   | both tables with RLS, no browser direct table grants, ten RPCs with authenticated-only EXECUTE, three close triggers, no browser EXECUTE on private helpers, direct REST reads HTTP 401           |
| Explicit remaining risks                     | Main runtime RPC behavior was not exercised; Stage 5 profile-history trigger gap remained; pre-existing Main `rename_study_group(uuid, text)` had to be handled by the later people-page proposal |

Both commits are reachable on remote branch `docs/people-page-decisions` (tip `0772d7b03402c16f17d66eaf9a046ff2ab2525cb`) but are not ancestors of current `main` (`1a583e30c019733d1880d2614ca853481509fdad`). GitHub's branch view did not associate a PR with that branch. Thus the live Main row is **explained and not an unexplained out-of-band application**; the remaining defect is documentary — current-main history omitted the later authorization/report. The new `DECISIONS.md` section and dated note in this file reconcile it without treating the old unmerged branch as release authority or reactivating the expired authorization.

The coordinator also checked the separate file-5 concern. Current-main `DECISIONS.md` already records Adam's 2026-11-18 authorization to apply all six Stage 5 migrations, continuation through files 4–6, and a completion report. Live Main has `20261118034458 / stage5_course_group_invite_candidates`. Adam confirmed that the six-file authorization superseded the earlier “must never be applied to Main” restriction, and a dated supersession note was added immediately after the historical wording in `docs/SUPABASE_SETUP.md`. No present Main change is implied.

**Main client question — answer received and finding retained.** Adam confirmed that no live client surface currently uses Main, so Main's two-argument create function versus the newer client expectations is latent configuration/environment debt rather than a present outage. Separately, Main's broader RPC grants (notably `anon` EXECUTE on three join/invitation/review write RPCs) must remain a standalone security remediation item and cannot be bundled into capacity DDL.

**F2 decisions.** Adam selected a user-visible browser-refresh direction instead of an in-app refresh action, approved the owner matrix below, and assigned Eunice as future signed-in multi-account capacity QA owner. The existing approved group-creation string remains exactly:

```text
CityLink needs an update. Refresh before creating a group.
```

Adam approved the direction of a second proactive notice and gave examples, but both 5a and 5b used “for example” wording. Until Adam selects the final mapping, only the create-path string above is implementable as an exact product string; proactive and refresh-instruction wording must remain blocked for one confirmation. No automatic reload/retry/forced refresh, draft recovery or storage persistence is authorized.

| Responsibility                       | Owner       |
| ------------------------------------ | ----------- |
| Checklist and final evidence summary | Coordinator |
| Compatibility-stub removal review    | Role 6      |
| Group-creation client-path review    | Roy         |
| Recruitment/post read-path review    | Jeffery     |
| Independent QA evidence review       | Eunice      |

A seven-day observation window supplements but does not replace the technical gates. Cleanup can be proposed only after the coordinator records that every owner condition is complete, and actual cleanup still requires a new explicit Adam approval and separate migration review.

**Independent verification in this docs-only update.** The evidence branch started from clean remote head `394e3919105991a5d6c52c28385450bd51350c3e`. This Section 18 change edits only Markdown: `docs/team/DECISIONS.md`, `docs/SUPABASE_SETUP.md`, `docs/stage6/STAGE6_TEST_MIGRATION.md` and this evidence report. The commit history for `d667b6f` was re-extracted in the coordinator's canonical clone, and the SHA-256 above was re-computed from that exact object. No Supabase call, migration, signed-in QA, merge, PR-ready transition, deployment or publication occurred.
