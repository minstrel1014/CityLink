# Stage 6 Test migration handoff

## Status

Prepared for Test-only application, pending Role 6 re-check of this exact file.

- Migration: `supabase/migrations/20261118050000_stage6_chat_recruitment.sql`
- Source proposal: `docs/stage6/CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql` (revision 2), merged with PR #5 as `03563bc`
- Target: disposable Test project, ref `wkzclgmhrtecnpexfesr`, only
- Main: never touched by this migration

## Authorization

Adam, CityLink project lead, 2026-11-18:

> I, Adam (CityLink project lead), authorize the CityLink integration lead task to apply the approved Stage 6 chat/recruitment migration to the disposable Supabase Test project (ref `wkzclgmhrtecnpexfesr`) only, after Role 6 re-checks the exact migration file. Conditions: forward-only, one migration, no reset/TRUNCATE, no Main access, stop and report on any error, run verification queries after apply. Test data writes or account creation need separate approval.

Recorded in `docs/team/DECISIONS.md`.

## Role 6 items and how they are handled

| Item                                              | Decision or fix                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. One-member active groups visible through posts | Adam chose option B on 2026-11-18: recruitment posts may expose one-member active groups. No SQL change.                                                                                                               |
| 2. Race hardening                                 | `send_group_chat_message` and `create_group_recruitment_post` lock the group row; `edit_group_recruitment_post` and `close_group_recruitment_post` update only `status = 'open'` posts and raise when no row changed.  |
| 3. Abandoned forming group keeps `creator_id`     | `maybe_abandon_empty_forming_group` now clears `creator_id` when it abandons the group.                                                                                                                                |
| 4. `private` schema exposure                      | Verified on Test: `pgrst.db_schemas` is unset, so PostgREST exposes only `public`, `storage`, `graphql_public`. `authenticated` has pre-existing USAGE on `private`, required by RLS helpers; no new grants are added. |

## Objects created

- Tables: `public.group_chat_messages`, `public.group_recruitment_posts` (RLS enabled, no direct policies, no direct browser privileges)
- Functions: 19 total — 10 public RPCs (chat list/send/access, course group discovery, member list/profile, recruitment list/create/edit/close) and 9 private functions (4 authorization helpers plus 5 lifecycle/trigger functions)
- Indexes: chat page cursor index and post listing index
- Triggers: recruitment auto-close on membership end, group terminal status and profile deletion

No table grants are given to `anon` or `authenticated`; browser access is only through the granted RPCs.

## Verification plan after apply

1. Migration recorded in `supabase_migrations.schema_migrations` as `20261118050000`.
2. Both tables exist with RLS enabled and zero direct privileges for `anon` and `authenticated`.
3. All new RPCs exist and grant EXECUTE only to `authenticated` (plus `postgres`).
4. Triggers exist on `group_memberships`, `study_groups` and `profiles`.
5. Direct PostgREST read of `group_chat_messages` is denied for an authenticated client.
6. Functional checks with two Test accounts and a former member are separate work and require the lead's approval for Test data writes.

## Known limits

- The merged client pages show their unavailable state until this migration is applied to the connected database.
- No Main promotion and no public-demo sync are part of this step.
- Rollback is a separate compensating migration; this file is forward-only.
