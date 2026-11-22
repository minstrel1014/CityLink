# Migration target moves off Test — plan for the replicated database

Coordinator task `HeZwm7CA7Y3rDtYBounkVC`, 2026-11-22 22:17, recording Adam's 22:16 direction: the prototype the professor receives runs against **Test**, and CityLink's forward capacity work moves to a **new database replicated from Test**. This file is the plan for that split. It authorizes nothing: every database action below needs Adam's explicit decision naming the exact target ref.

## Why the split is needed at all

The reviewed capacity blob drops the two-argument `create_group_and_invite(p_course_id uuid, p_recipient_id uuid)` at `:245` and replaces the read contracts with `_capacity` variants. The delivered prototype calls the old contracts. So any database that the prototype points at must stay pre-capacity, and any database that receives the migration must not be the one the prototype uses. Until 22:16 both roles were assigned to Test, which is why this plan exists.

The resulting three-way separation is clean and should be recorded as the operating rule:

| Project                 | Ref                    | Role                                                    | Capacity migration                    |
| ----------------------- | ---------------------- | ------------------------------------------------------- | ------------------------------------- |
| CityLink Project (Main) | `pijslbchvstkoweslymr` | launch reference, read-only until launch                | never, until Tracks B and C complete  |
| CityLink-Stage5-Test    | `wkzclgmhrtecnpexfesr` | the professor's prototype runtime                       | never while the prototype is in use   |
| new replicated project  | to be created          | capacity migration, preflight, G4 pinning, signed-in QA | yes, after the separate authorization |

## How to replicate, and the recommendation

Two routes exist and they are not equivalent.

**Route A — schema replication by replaying the checked-in migrations (recommended).** Create the new project, then apply the eight `supabase/migrations/*.sql` files in filename order. This reproduces the schema deterministically from the repository, needs no connection string, no password and no dump file, and is exactly what the capacity work needs: the blob's prerequisites are schema objects, not rows. The cost is that QA data must be created through the app, which for signed-in multi-account QA is what we want anyway — fresh accounts, fresh courses, no inherited QA debris that could mask a capacity bug.

**Route B — physical replication including data.** A `pg_dump`/`pg_restore` cycle, or the dashboard's restore-to-a-new-project feature where the plan allows it. This carries the existing QA rows across, which is attractive for reproducing a reported bug, but it requires handling the database password or connection string, and it copies real team accounts and personal data into a third place. It also copies the migration ledger, which must then be reconciled before any new migration is applied. Use this only if a specific defect cannot be reproduced on a fresh schema.

Recommendation: Route A, plus a deliberately small set of seeded QA accounts created through the UI on the new project. If Adam specifically needs the current Test rows preserved for a demonstration, Route B is available but the credential handling must be his, done through Supabase's own tooling rather than pasted anywhere.

## Facts Adam needs before deciding

The organization `pjehowhahlebjnsivbfp` ("CityLink's Supabase") is on the **free** plan, and it already holds **two active projects** — Test and Main, both `ACTIVE_HEALTHY`, both PostgreSQL 17 (17.11.0.011 and 17.11.0.003). The connector quotes **$0 per month** for a new project, but the free plan's two-active-project limit is the binding constraint, not the price: a third project may be refused at provisioning, and if it is, the options are an organization plan upgrade or a local Supabase stack as the migration/QA target. Neither Test nor Main can be paused to make room — Test is the prototype's runtime and Main is the launch reference.

## What changes once the new project exists

Every authorization recorded so far names `wkzclgmhrtecnpexfesr`. None of them may be stretched to cover the new ref. In order, and each needing its own explicit decision from Adam:

1. **Target naming.** A new decision naming the new project ref as the capacity migration target, the preflight target and the signed-in QA target.
2. **G4 re-pinning.** The pinning record must be measured on the new project, not inherited from Test. Both are PostgreSQL 17 and almost certainly the same 17.11 build family, so the expected values will very likely match, but "very likely" is not a pin. Role 6's currently running read-only dry run against Test produces a proxy that must be re-measured on the new project before any apply.
3. **Preflight and apply.** The SELECT-only preflight from the option (b) reshape runs first, in the same authorized session as the apply, with the F10 prohibition observed: blob as reviewed, no `--single-transaction`, no outer `BEGIN`, both timestamps recorded.
4. **Signed-in multi-account and concurrency QA** on the new project, with accounts created there.
5. **Test freeze.** From the moment the prototype is handed over, Test must receive no schema change, no migration and no destructive QA. Any capacity evidence that would previously have been gathered on Test now belongs to the new project.

## What remains true regardless

Main stays read-only until launch. Merge, ready transition, deployment and publication remain unauthorized. The reviewed blob `a04048e90d6b64c692f03c722b9eea2849058aab` / SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` must stay byte-identical. PR #50 stays a retired draft. No credential, key or `.env` content is to be printed, copied or committed anywhere in this work.

## Addendum 22:20 — why Route A is now the only sensible route

Two read-only facts gathered after this plan was first written make the choice between the routes much less even than it looked.

First, the two existing projects are **not** at the same schema state. `list_migrations` on Test returns seven rows and no `stage5_term_model` row; on Main it returns seven rows that include `stage5_term_model` but stop at `stage6_chat_recruitment`, with no `stage6_people_page_naming` row. The repository holds eight files. The observed function signatures match that difference: Main exposes `create_group_and_invite(uuid,uuid)` while Test exposes the three-argument `create_group_and_invite(uuid,uuid,text)` with `p_name`. A physical copy of Test (Route B) would therefore reproduce Test's gaps and then require a ledger reconciliation before any new migration could be applied — two sources of drift instead of none.

Second, the delivered prototype is bound to Test and calls that three-argument function. Anything that mutates Test's schema mutates the demonstration. Replaying the eight checked-in files on a fresh project (Route A) produces a superset that contains both missing pieces, needs no credential handling, and leaves Test untouched.

Caveat that must travel with the first fact: a missing ledger row is not proof the objects are absent, since either project may have received SQL through the dashboard editor without a ledger entry. What is certain is that the two projects differ, and that neither can be assumed to equal the repository's eight files.
