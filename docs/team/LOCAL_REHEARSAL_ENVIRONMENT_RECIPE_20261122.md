# Local rehearsal environment — proven recipe

Coordinator task `HeZwm7CA7Y3rDtYBounkVC`, 2026-11-22 22:39. Adam chose a local Supabase stack as the rehearsal target for the capacity work, with release happening on CityLink Launch (Main). This file records the environment that actually works in this sandbox, because the obvious route does not: `docker` is not installed here, so `supabase start` cannot run, and the sandbox is a hibernating container without a Docker daemon.

## What was tried, in order

**Docker.** `docker --version` and `docker info` both return `command not found`, and `docker compose` likewise. The Supabase CLI is installable but useless without a daemon. So a true `supabase start` stack is unavailable inside this sandbox; it needs either Adam's own machine (free, via the desktop client) or a Cloud Computer with Docker (from $10/month).

**Replaying only the eight checked-in migrations on a fresh database.** This fails immediately and the failure is informative: `20261102090000_stage5_term_model.sql:43` raises `relation "public.courses" does not exist`. The eight files are **increments**, not a baseline. Any plan that says "replay the eight files on a new project" — including the coordinator's own earlier Route A — is wrong and is retracted here.

**Base schema first, then the eight migrations.** `supabase/schema.sql` (18.8 KB, checked in) creates the base tables, including `public.courses`. With that applied first, the migrations get further and then stop at `20261102090000_stage5_term_model.sql:70` with `no course is linked to the approved current term 2026-Fall` — a deliberate data guard, not a schema error. So seed data is a prerequisite too.

**Base schema, seed, then the eight migrations.** This works. All eight apply with exit 0 on a local PostgreSQL 17.12 shaped like Supabase, ending at the repository's exact schema state.

## The proven sequence

1. **PostgreSQL 17** from PGDG (`postgresql-17`, resolved to 17.12-1.pgdg24.04+1). The sandbox's own apt sources ship 16 only.
2. A throwaway cluster: `initdb -A trust --no-sync` in `/tmp`, started with `-c listen_addresses=''` and a `/tmp` socket directory, so there are **zero TCP listeners** and nothing reachable from outside.
3. A minimal Supabase-shaped skeleton, because the migrations and the base schema reference objects only Supabase provides: schema `auth`, schema `extensions` with `pgcrypto`, roles `anon`, `authenticated`, `service_role` (with `bypassrls`), a minimal `auth.users` table, and three shims — `auth.uid()` reading `request.jwt.claim.sub`, `auth.role()` reading `request.jwt.claim.role`, `auth.jwt()` reading `request.jwt.claims`.
4. `supabase/schema.sql` — exit 0, 4 base tables.
5. `supabase/seed_citylink_fictional_courses.sql` — exit 0, 10 fictional courses, which satisfies the term guard in the first migration.
6. The eight `supabase/migrations/*.sql` in filename order — **8/8 exit 0**.
7. Verification: `create_group_and_invite(uuid,uuid,text)`, `list_group_recruitment_posts(uuid,timestamptz,uuid,integer)`, `request_to_join_group(uuid)` all present; 12 public tables.
8. Teardown: `pg_ctl -m fast -w stop`, directories deleted, `pgrep -c postgres` returns 0.

The script is archived as `docs/team/scripts/probe-supabase-shaped-pg17-20261122.sh` and is re-runnable end to end; it prints the engine version first, so any future run states which version produced its numbers.

## What this environment can and cannot be used for

It **can** carry: the SELECT-only preflight, the capacity blob rehearsal, the G4 normalization and digest expressions, RLS and grant behaviour with simulated claims (`set local request.jwt.claim.sub`, `set role authenticated`), concurrency behaviour at SQL level with two sessions, and the F10 apply-ordering test.

It **cannot** carry: real sign-in through GoTrue, PostgREST's own request path, the browser client's behaviour, or any hosting-edge cache evidence. Signed-in multi-account QA through the actual app UI therefore cannot happen here; it needs a real Supabase project — which, under the current plan, means CityLink Launch at release, or a `supabase start` stack on Adam's machine.

One honest gap to carry forward: this environment runs PostgreSQL **17.12**, while Main is **17.11.0.003** and Test is **17.11.0.011**. Same major version, so catalog and parser behaviour should match, but the pinning record produced here is a rehearsal artefact and must be re-verified against Main read-only immediately before the release-time apply.

## Boundary

Everything above runs locally in this sandbox against a cluster it creates and destroys. No Supabase project was contacted for this recipe, no migration was applied to Test or Main, no application row was read from any real project, and no credential was used or printed.
