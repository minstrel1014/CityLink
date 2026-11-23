# CityLink Launch frontend site — build and Preview verification (2026-11-23)

Coordinator record. This documents the creation of a **separate** Manus-hosted site for CityLink
Launch. It does not record a deployment, a publication, a migration or a merge.

## 1. What was created

| Item                 | Value                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Managed site project | `CityLink Launch`, resource `manus-resource://manus-webdev/project/wdp_60c0c4696762dc719639ff86`           |
| Project directory    | `/home/ubuntu/citylink`                                                                                    |
| Managed git repo     | `origin` = Manus-managed artifacts remote for `wdp_60c0c4696762dc719639ff86` (NOT `minstrel1014/CityLink`) |
| Checkpoint commit    | `1f93fc0609fb4e9b3e4c5ffbbf4af6637f077a7b` (HEAD == origin/main)                                           |
| Existing public demo | `clinkdemo-z7jrfxui.manus.space` — **not touched**, still serves the Prototype-pointing bundle             |

The new site is deliberately a separate resource from the professor's demo. Nothing in this record
modifies the Prototype project, its bundle, or its database.

## 2. Source

- Source head: PR #37 `344c1058e78df2cccfde89574e226f3e65a1457c`
  (`feature/capacity-integration-20261119-v2`), extracted with `git archive` into the site directory.
- PR #37 itself was **not** modified, and no branch of `minstrel1014/CityLink` was pushed.

### Local deltas relative to that head (2 files)

The reviewed head contains **no** build/version marker: `git grep` for `version.json`, `buildId`,
`APP_BUILD`, `__BUILD` over `client/`, `vite.config.ts` and `package.json` returns nothing. The
verifiable build identity required for this site therefore had to be added in the site's own repo:

1. `scripts/write-version.mjs` (new) — writes `client/public/version.json` with
   `buildId = 344c1058…`, `sourceSha`, `sourceRef`, `sourcePullRequest`, `target`,
   `supabaseProjectRef = pijslbchvstkoweslymr` and `builtAt`.
2. `package.json` — `"build:static": "node scripts/write-version.mjs && vite build"`
   (previously `vite build`).

No application source file was changed. The deployed client is otherwise byte-identical to the
reviewed head.

## 3. Configuration

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are stored in the platform secret store for
  this site (both keys recorded as `configured_environments: ["all"]`). They were entered through the
  platform input card; the coordinator never received the publishable key value and it appears in no
  committed file.
- `.env.local` in the site directory contains only the Launch API URL and is gitignored
  (`.gitignore:12`). No service_role or secret key exists anywhere in the site.
- `build.command` = `corepack pnpm install --frozen-lockfile && corepack pnpm build:static`,
  `build.outputDirectory` = `dist/public` (matches `vite.config.ts:186`).
- `runtime.port` = 3000; dev command `web` = `corepack pnpm dev:static`.

## 4. Build results

| Step    | Command                                   | Result                                          |
| ------- | ----------------------------------------- | ----------------------------------------------- |
| Install | `corepack pnpm install --frozen-lockfile` | exit 0, 3.4 s, pnpm 10.18.0, lockfile unchanged |
| Build   | `corepack pnpm build:static`              | exit 0, 1759 modules transformed, 5.17 s        |

Artifact: `dist/public/assets/index-B31mkccF.js`, 958,577 bytes,
SHA-256 `3b194bf2ab0dfc10a702583a207fb4cb9d7195b34d20e7147fa39c8eb42e43fd`.
`dist/public/version.json` is emitted with `buildId = 344c1058e78df2cccfde89574e226f3e65a1457c`,
`builtAt = 2026-11-23T06:36:20.666Z`.

Vite warns that one chunk exceeds 500 kB. This is the same warning the reviewed head produces; it is
not introduced by this work.

## 5. Required checks on the emitted bundle

| Check                                            | Observed                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| contains `pijslbchvstkoweslymr`                  | 1 occurrence (literal `https://pijslbchvstkoweslymr.supabase.co`) |
| contains `wkzclgmhrtecnpexfesr`                  | **0 occurrences**                                                 |
| contains `p_max_members`                         | 1                                                                 |
| contains `list_group_recruitment_posts_capacity` | 1                                                                 |
| contains `create_group_and_invite`               | 1                                                                 |
| contains `group_capacity_upgrade_required`       | 1                                                                 |
| publishable key inlined (count only)             | 1 (`sb_publishable_…`; value not recorded here)                   |

The dev server was verified the same way: `GET /src/lib/supabaseClient.ts` on port 3000 returns a
module containing the Launch ref once and the publishable-key prefix once, proving the platform
environment reaches the client in Preview as well as in the build.

## 6. Preview

- Preview dev server `web` is running on port 3000 (`port_status.listening: true`).
- Screenshot of `/` renders the CityLink sign-in page (headline, "Enter the demo", Supabase Auth
  email/password fields) with no configuration error.
- **Not published.** No `publish` call was made; `publishing.auto_publish` is `false`.

## 7. Expected, not-defect behaviour while Launch is still at row 8

S1 (`20261118083000_stage6_people_page_naming.sql`), S2 and S3 (the reviewed blob) are **not**
applied to `pijslbchvstkoweslymr`. Until they are:

- `*_capacity` reads and the four-argument `create_group_and_invite` do not exist on Launch, so those
  calls fail;
- group creation therefore cannot succeed through this client yet;
- the three-argument fail-closed stub, the capacity gate and the `45003`–`45009` refusal codes are not
  present on Launch either.

This is the expected pre-schema state, not a defect in the site.

## 8. Boundary

No PR was merged, no draft PR was marked ready, no migration was applied to Launch, the Prototype
project was not modified, and nothing was published. The checkpoint commit above is in the site's own
Manus-managed repository, not in `minstrel1014/CityLink`.

## 9. Correction 2026-11-23 15:02 — the stored publishable key belonged to the Prototype

The value entered on the first card was **not** CityLink Launch's publishable key. This was reported by
Adam and independently reproduced here with the stored value only, printing status codes and never the
key:

| Probe (`apikey` header only)     | `pijslbchvstkoweslymr` (Launch) | `wkzclgmhrtecnpexfesr` (Prototype) |
| -------------------------------- | ------------------------------- | ---------------------------------- |
| `GET /auth/v1/settings` (before) | **401**                         | **200**                            |

A replacement was applied through the platform input card with `replace_existing: true`, stored scope
`all`, secret revision 2. Re-test after replacement, same method:

| Probe                           | Launch  | Prototype |
| ------------------------------- | ------- | --------- |
| `GET /auth/v1/settings` (after) | **200** | **401**   |

The dev server was restarted (generation 3) and the production artifact rebuilt with the corrected
value:

- artifact `dist/public/assets/index-DtJYmQaY.js`, 958,577 bytes,
  SHA-256 `bbeb4d9fc4db2b851d0ff2f4079d99a94cc74cdc799a9b9c979c44228883f9a8`;
- bundle checks unchanged: Launch ref 1, Prototype ref 0, `p_max_members` 1,
  `list_group_recruitment_posts_capacity` 1, publishable-key prefix 1;
- `version.json` `buildId` still `344c1058e78df2cccfde89574e226f3e65a1457c`.

Auth-layer proof that the configuration is now correct: a password grant for the not-yet-created QA
account returns `400 invalid_credentials` ("Invalid login credentials") instead of `401 Invalid API key`.
The remaining failure is a missing account, not a configuration error.

Read-only SQL on Launch (single `LIMIT 20` aggregate over `information_schema.role_table_grants`)
explains the earlier `42501` seen from an unauthenticated REST probe: `anon` holds **no** table grants
on `public`, while `authenticated` holds `SELECT` on 10 public tables plus `INSERT`/`UPDATE`/`DELETE`
on 1. The unauthenticated 401 is therefore expected, not a defect; reads are reachable only after
sign-in, subject to RLS.

Consequence for the release: no account exists on Launch, and creating one is an Auth write to Launch.
That is outside the current read-only-until-release boundary and needs an explicit go-ahead.

## 10. QA account created on Launch 2026-11-23 15:05 (Adam-authorized, single action)

Adam authorized exactly one action: create the QA account, nothing else. It was created through the
public Auth endpoints with the browser-safe publishable key only — no service_role, no SQL write, no
schema change, no migration, no signed-in QA run.

| Step                                      | Result                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `GET /auth/v1/settings`                   | 200, `mailer_autoconfirm=true`, `disable_signup=false`           |
| `POST /auth/v1/signup`                    | 200, `email_confirmed_at` set (auto-confirmed), session returned |
| `POST /auth/v1/token?grant_type=password` | 200, token returned, `role=authenticated`                        |

Account: `citylink.qa.20261123@example.com`, `user_id = 9bfc6d04-ec73-41c7-a0a7-6e32dea86de5`.
The password was supplied by Adam, is not written to any file or commit, and is not recorded here.

Read-only confirmation afterwards (single `LIMIT 1` aggregate): `auth.users` = 3, `public.profiles` = 3,
and exactly 1 profile row exists for the new user id — so the profile row is created automatically by an
existing trigger on signup; no manual insert was needed or performed.

Nothing else was done. The client cannot yet exercise group creation, because `*_capacity` reads and the
four-argument `create_group_and_invite` still do not exist on Launch until S1/S2/S3 are applied.
