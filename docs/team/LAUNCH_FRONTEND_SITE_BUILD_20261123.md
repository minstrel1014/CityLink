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
