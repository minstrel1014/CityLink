# CityLink prototype submission — how the recipient runs it

Written by the coordinator task on 2026-11-22, revised the same evening after Adam clarified at 22:16 that the prototype runs against the project's disposable **Test** database rather than against a database of the recipient's own. This version supersedes the 22:04 version of this file; the earlier text is preserved in git history and must not be used.

## What the submission is

The delivered source at `main` `1a583e30c019733d1880d2614ca853481509fdad` is a self-consistent **old pair**: the frontend calls the pre-capacity server contracts, and the eight checked-in Stage 5/6 migrations create exactly the schema those contracts expect. The disposable Test project already carries that schema, so the recipient does **not** apply any migration and does **not** create a database. Nothing needs to be restored, dumped or seeded.

The repository contains **no credentials**: there is no `.env` file, `.gitignore` excludes them, and no tracked file contains a publishable key or a JWT. The prototype cannot reach any database until two browser-safe values are supplied out of band.

## What the recipient needs from Adam

Two values, given directly and never committed to the repository:

- the Test project URL, for `VITE_SUPABASE_URL`;
- the **publishable** (anon) key, for `VITE_SUPABASE_PUBLISHABLE_KEY`.

Never the service-role or secret key: the frontend must only ever hold the publishable key. Adam supplies both values personally; this document deliberately contains neither.

## Steps

1. Unpack the source, then create `.env` at the repository root with the two variables above. The client reads only those two; when either is absent it reports a `missing` configuration state instead of crashing, which is the quickest way to confirm the file is being picked up.
2. `corepack pnpm install --frozen-lockfile`.
3. `corepack pnpm dev` for a development run, or `corepack pnpm build` followed by `corepack pnpm start` for a production-style run.
4. Register an account through the UI. Test contains the team's own QA accounts, so a fresh sign-up is preferable to borrowing one; there are no seeded demo credentials and the fictional `/demo` route is unrelated to any real database.
5. Create a course, create a group, invite someone, post a recruitment message and open the group chat. Those are the flows the prototype demonstrates.

## What must not be done

Do not run `pnpm db:migrate`. That script is `drizzle-kit migrate` and belongs to the Express/Drizzle scaffolding; it will not create the CityLink schema and could disturb objects it does not own. Do not apply the checked-in `supabase/migrations/*.sql` to Test either — they are already applied there, and re-applying them is not idempotent by design.

Do not point the prototype at the production project. Main is read-only until launch, and the capacity work deliberately excludes it; if the capacity migration ever reached Main, group creation in this prototype would fail, because that migration drops the two-argument `create_group_and_invite` the delivered frontend calls.

## What Test contains, stated plainly

Test holds the team's QA accounts and QA rows. Anyone holding the Test URL and publishable key can register and then see whatever the audience-limited RLS policies permit — coursemates' profiles, course rosters and group membership, not other people's private data. If that is not acceptable for a demonstration, the alternative is to strip or anonymise Test first, or to demonstrate against a database that holds no real accounts. That choice belongs to Adam, not to whoever runs the demo.

## Scope of this note

This is an operational instruction for the recipient. It authorizes no migration, no write, no deployment and no publication on CityLink's own projects, and it makes no claim about hosting, authentication or concurrency behaviour that has not been measured.
