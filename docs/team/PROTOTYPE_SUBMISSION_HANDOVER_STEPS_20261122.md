# CityLink prototype submission — how the recipient stands it up

Written by the coordinator task on 2026-11-22 after Adam chose, at 22:04, to give the prototype submission **its own database** instead of relying on the project's Main database. This document exists so that the person receiving the source can run it without touching CityLink's Main project, and so that nobody has to guess what the submission does and does not contain.

## What the submission actually is

The delivered source at `main` `1a583e30c019733d1880d2614ca853481509fdad` is a self-consistent **old pair**: the frontend calls the pre-capacity server contracts, and the eight checked-in migrations create exactly the schema those contracts expect. This was verified against the live Main catalog on 2026-11-22: Main still exposes `create_group_and_invite(p_course_id uuid, p_recipient_id uuid)`, the four-argument `list_group_recruitment_posts`, and `can_manage_recruitment_post`, and exposes **no** `*_capacity` function, so the capacity work has never been applied to any database the submission could reach.

The repository contains **no credentials**: there is no `.env` file, `.gitignore` excludes them, and no tracked file contains a publishable key or a JWT. Nothing in the submission can connect to a database until the recipient supplies their own project URL and browser-safe publishable key.

## What the recipient needs

A Supabase project of their own (the free tier is sufficient) and Node 22 with Corepack. The checked-in migrations depend on objects only Supabase provides — the `auth` schema plus the `anon`, `authenticated` and `service_role` roles, used in 17, 2, 6, 2, 4, 36 and 31 places across the Stage 5/6 files — so a plain PostgreSQL instance without the Supabase auth schema is not a substitute. A local `supabase start` stack also works.

## Steps

1. Create the project, then copy the project URL and the **publishable** (anon) key from the Supabase dashboard. Never use a service-role or secret key in the frontend.
2. Apply the eight migrations in filename order with `supabase db push`, or with `psql -f` against the project's connection string. **Do not use `pnpm db:migrate`**: that script is `drizzle-kit migrate` and belongs to the Express/Drizzle scaffolding, not to the Supabase application database. Using it will not create the CityLink schema.
3. Create `.env` at the repository root with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set to the values from step 1. The client reads only these two variables; when either is absent it reports a `missing` configuration state rather than crashing.
4. `corepack pnpm install --frozen-lockfile`, then `corepack pnpm dev` for development, or `corepack pnpm build` followed by `corepack pnpm start` for a production-style run.
5. Sign up through the UI to create the first account. There are no seeded accounts, no demo credentials and no fixture data in the submission; the fictional `/demo` route is separate from any real database and must not be pointed at one.

## What the recipient must not do

Do not point the prototype at CityLink's Main project (`pijslbchvstkoweslymr`). Main is reserved for read-only verification until CityLink launches, and the forward capacity work deliberately excludes it. If the prototype is ever pointed at Main and the capacity migration is applied there, group creation would break, because that migration drops the two-argument `create_group_and_invite` the delivered frontend calls. That is precisely the risk this arrangement removes.

## Scope of this note

This is an operational instruction for the recipient. It authorizes no migration, no write, no deployment and no publication on CityLink's own projects, and it makes no claim about hosting, authentication or concurrency behaviour that has not been measured.
