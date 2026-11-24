> **Repository copy.** This guide is stored in the canonical repository. The source
> archive and the two data exports it describes are deliberately **not** committed
> here: `citylink-live-data.json` holds student records and
> `citylink-auth-users.SENSITIVE.json` holds account identifiers and email addresses.
> They travel with the downloadable snapshot bundle only. Everything in this file
> that concerns code, schema and rebuild order applies unchanged.

# CityLink — full project snapshot

Snapshot taken: **2026-11-24 01:54 (Asia/Taipei)** / 2026-11-23 17:54 UTC
Prepared by: the CityLink coordinator task, at Adam's request, so that no single
accident can lose the work.

This folder is a **point-in-time copy**. It does not keep syncing. Anything built
after this timestamp is not in here.

---

## 1. What is in this bundle

| File | What it is | Size |
|---|---|---|
| `citylink-source-<timestamp>.tar.gz` | The complete website source: React/TypeScript client, server scaffolding, all 10 SQL migrations, tests, docs, `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`. Excludes `node_modules`, `dist`, `.git`. | ~0.9 MB |
| `citylink-live-schema.sql` | Structure of the live Launch database `pijslbchvstkoweslymr`: 14 tables with columns and defaults, every constraint, index, RLS enablement, policy, trigger, all `public` + `private` function bodies, table and function grants. **Structure only, no rows, no secrets.** | ~150 KB |
| `citylink-live-data.json` | Every application row in the live database: 292 rows across 14 tables (terms 1, settings 1, courses 11, profiles 16, enrolments 155, groups 25, memberships 61, invitations 6, join requests 2, recruitment posts 12, group chat 1, direct threads 3, direct messages 8, invitations 0). | ~94 KB |
| `citylink-auth-users.SENSITIVE.json` | The 16 Supabase Auth accounts: id, email, created/confirmed timestamps. **No password hashes.** Contains 2 real addresses and 14 disposable QA/seed addresses. | ~5 KB |
| `RESTORE.md` | This file. | — |

The source archive is the authoritative copy of the code. The `.git` directory was
excluded because the site repo has its own remote (see §4); a fresh clone of that
remote is byte-identical to this archive plus history.

---

## 2. What is NOT in this bundle

These need a separate action and cannot be exported from inside a task:

1. **Passwords / Auth internals.** Supabase stores password hashes inside the Auth
   service. There is no supported way to export them through SQL. On a rebuild, the
   16 accounts must be re-created (Supabase Dashboard → Authentication → Users →
   Invite / Add user) and then re-linked to the existing `profiles` rows by UUID.
   The UUIDs in `citylink-auth-users.SENSITIVE.json` are what make that re-linking
   possible — do not lose that file.
2. **Supabase project settings.** Auth providers, email templates, redirect URLs,
   JWT expiry, storage buckets and policies, API keys, and the project's region/plan
   live in the Supabase Dashboard, not in the database. Use
   *Project Settings → General / Auth / API* to record or re-enter them.
3. **The WebDev deployment configuration.** Which build command runs, the output
   directory (`dist/public`), the runtime port (3000), the auto-publish flag and the
   public domain binding live in the Manus WebDev project record
   `wdp_60c0c4696762dc719639ff86`, not in the git repo.
4. **Environment variables.** The build reads `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. They are injected by the platform at build time;
   they are deliberately **not** written into this bundle. On a rebuild, set them
   again from the Supabase Dashboard (Project Settings → API). Never commit them.
5. **The frozen Prototype** `wkzclgmhrtecnpexfesr` (called Test before the 2026-11-22
   rename; do not migrate). It is intentionally untouched and intentionally not
   exported. It is not a writable target and never was one after F14 — see
   `docs/team/DB_TARGETS.md`.

---

## 3. How to rebuild from this bundle

Prerequisites: Node 20+, `corepack`, and a Supabase project (new or the same one).

```bash
# 1. Unpack the source
mkdir citylink && tar -xzf citylink-source-<timestamp>.tar.gz -C citylink
cd citylink

# 2. Pinned toolchain — do not substitute npm or a different pnpm
corepack enable
corepack pnpm install --frozen-lockfile

# 3. Sanity check the code before touching any database
corepack pnpm check          # tsc --noEmit
corepack pnpm test           # 634 tests / 43 files
corepack pnpm build:static   # produces dist/public
```

Rebuilding the database, in this order:

```text
a. Create the Supabase project.
b. Replay supabase/migrations/*.sql in filename order (10 files) — this gives you
   the schema the project had at each stage.
c. Compare the result against citylink-live-schema.sql. The dump is the ground
   truth for the LIVE state; the migrations are the ground truth for HOW it got
   there. If they disagree, trust the dump for structure and add a migration that
   explains the difference.
d. Re-create the 16 Auth users (Supabase Dashboard) using the UUIDs in
   citylink-auth-users.SENSITIVE.json.
e. Load citylink-live-data.json. Order matters because of foreign keys:
   academic_terms → citylink_settings → courses → profiles → enrolments →
   study_groups → group_memberships → group_invitations / group_join_requests /
   group_recruitment_posts / group_chat_messages → direct_threads → direct_messages.
f. Re-apply Auth settings, redirect URLs and storage configuration by hand.
g. Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in the WebDev project and
   rebuild.
```

Never run `db:push` or any Drizzle command against the Supabase application
database. Migrations are plain SQL files, applied in order.

---

## 4. What already protects the work (independent of this bundle)

- **The site repository.** Every change is a git commit on `main` of
  `https://7f0548f6b28a1758d9bf7be630d36cb4.artifacts.cloudflare.net/git/prod/wdp_60c0c4696762dc719639ff86.git`.
  At snapshot time: 35 commits, HEAD `099d8305d23b9010177e301a18ab37d2a21e6c01`.
  Each push also creates a Manus checkpoint, so earlier states can be restored from
  the WebDev panel.
- **The canonical GitHub repo** `minstrel1014/CityLink` holds the reviewed history
  and the PR record. Note: the site commits above are **not** in GitHub — the site
  is a separate repository. GitHub `main` is at `35146308`.
- **The SQL migrations** in `supabase/migrations/` are the replayable record of every
  schema change, including both 2026-11-24 migrations. That is why the schema can be
  rebuilt even without a database dump.

What was **not** protected before this snapshot: the live data rows, the exact live
function bodies, and the auth account list. Those are now in this bundle.

---

## 5. Manus's own backup tool is a different thing

The Task Data Backup at <https://manus.im/backup> belongs to the August 2026 data
separation programme (export window closed 23 August 2026, restoration from 25
August 2026). It is a point-in-time export of whole tasks, including website code,
database, configuration, secrets and integration settings — genuinely broader than
this bundle in one respect (it captures the platform-side configuration that §2
lists as missing).

It is **not** a general "save my app now" button, and that window has passed. The
live site is running normally, which means this website was not deleted by that
programme. Whether Adam's account is in scope for any other notice is a question for
his own in-app notification and email — not something this task can determine.

---

## 6. Keeping the bundle fresh

This snapshot ages the moment it is written. Regenerate it after any change worth
keeping. The three steps are reproducible:

1. `tar --exclude=node_modules --exclude=dist --exclude=.git -czf source.tar.gz .`
2. Re-run the schema-dump query and the data-export query against the live project.
3. Re-run the auth-manifest query.

Store the result somewhere that is not the sandbox — a local disk, an encrypted
archive, or a private repository. A backup that exists only inside the environment
it is meant to protect is not a backup.
