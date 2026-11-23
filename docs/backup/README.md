# Backup snapshots

Point-in-time records of the live CityLink project, kept in the canonical repository
so the schema cannot be lost along with a sandbox.

| File | Contents |
|---|---|
| `LIVE_SCHEMA_20261124.sql` | Structure of Launch `pijslbchvstkoweslymr` as at 2026-11-23 17:53 UTC: 14 tables with columns and defaults, all constraints, all indexes, RLS enablement, 16 policies, 7 triggers, 70 `public`/`private` function bodies, and table/function grants. **Structure only — no rows, no secrets.** |
| `RESTORE_GUIDE_20261124.md` | What a full snapshot contains, what it cannot contain, and the rebuild order. |

## What is not here

Application rows and Auth accounts are deliberately excluded. `citylink-live-data.json`
(292 rows including student profiles) and `citylink-auth-users.SENSITIVE.json`
(16 accounts by UUID and email) are personal data, and they are distributed only as
part of the downloadable snapshot bundle rather than committed to git.

## Why a dump exists alongside the migrations

`supabase/migrations/` records how the schema reached its current state. It does not
record the live function bodies, which changed during the 2026-11-24 solo-group
creation, group-visibility, leave-group and creator-backfill work. When the two
disagree, the dump is the ground truth for live structure and the migrations are the
ground truth for the path taken. A future change that reconciles them belongs in a
new migration, never in an edit to this snapshot.

## Regenerating a snapshot

Three read-only queries against the target project, then a source archive:

1. Schema: `pg_get_functiondef` over `public`/`private`, plus `information_schema.columns`,
   `pg_constraint`, `pg_index`, `pg_policies`, `pg_trigger`, `pg_class.relrowsecurity`
   and the ACL views.
2. Data: `json_agg` per table, in foreign-key order.
3. Auth accounts: `id`, `email`, timestamps from `auth.users` — no password hashes.

A snapshot ages immediately. Regenerate it after any change worth keeping, and store
the result somewhere other than the environment it is meant to protect.
