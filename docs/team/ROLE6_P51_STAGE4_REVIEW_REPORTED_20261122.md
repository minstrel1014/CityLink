# Role 6 finite handoff — Stage 4 fresh exact-head review of the successor package (PR #51)

Date: 2026-11-22 (evening). Delivery: coordinator task `HeZwm7CA7Y3rDtYBounkVC`.
Assignment: Adam's Stage 4 review of my own successor draft. **Adversarial by instruction**: the earlier PR #41 verdict is not carried over, and every conclusion below is tagged with how I reached it.

## 1. Identification

| Item                 | Value                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role                 | Role 6 — database security and migration review                                                                                                                                                                                                                                                                                                  |
| Human name           | Still TBD (none invented)                                                                                                                                                                                                                                                                                                                        |
| This task            | `9KfXkHmMqAxUkRMsbpxEwA` (Role 6 continuity task)                                                                                                                                                                                                                                                                                                |
| Reviewed head        | `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`, branch `feature/role6-capacity-successor-draft-20261122`                                                                                                                                                                                                                                             |
| PR                   | #51 — I verified myself: `state OPEN`, `isDraft true`, `base feature/group-capacity-migration`, `mergeable MERGEABLE`, `mergeStateStatus CLEAN`, head OID matches the branch exactly                                                                                                                                                             |
| Parent commit        | `65058a8077ad89f5796151e7eeb539ba7b616d0c` (PR #41 docs head)                                                                                                                                                                                                                                                                                    |
| Reviewed SQL blob    | `supabase/migrations/20261119090000_group_hard_max.sql` = blob `a04048e90d6b64c692f03c722b9eea2849058aab`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`, re-read by me **at this head**                                                                                                                            |
| Database access      | **None.** Supabase Test `wkzclgmhrtecnpexfesr` and Main `pijslbchvstkoweslymr` were not contacted. No project listing, no credentials read.                                                                                                                                                                                                      |
| Evidence attachments | This report plus a machine-captured raw evidence file from that local engine. Both are delivered as real files; the capture is reproducible from two scripts (`capture_evidence.sh`, `repair_p51.py`) kept in this task's own scratch directory, outside the repository.                                                                         |
| Local engine used    | My own disposable **local** PostgreSQL 16.15 in this sandbox (installed with `apt-get`, `initdb -A trust`, `listen_addresses=''` so **no TCP listener**, socket-only), started per probe and stopped + data directory deleted at the end. Stray-process check after cleanup: 0. This is not the Test target and does not certify Test behaviour. |
| Repository mutation  | **None.** `git status --short --branch` clean throughout; `git diff --name-only 65058a8…HEAD -- supabase` = 0 files; `main` still `1a583e30c019733d1880d2614ca853481509fdad`; PR #51 head still `bc6a6d5…`. All repair material lives **outside** the repo, under this task's own scratch directory.                                             |

## 2. The two diff scopes, kept separate (as the packet required)

- `65058a8 → bc6a6d5` (what I added): exactly `docs/capacity-successor/CAPACITY_SUCCESSOR_MIGRATION_PACKAGE_ROLE6_20261122.md`, `docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql`, `docs/capacity-successor/CAPACITY_SUCCESSOR_PREFLIGHT_CHECKLIST_20261122.md`.
- `5537baa → bc6a6d5` (what PR #51 shows against its base) additionally carries what #51 inherits from PR #41: `supabase/migrations/20261119090000_group_hard_max.sql` +227/−17 and two `docs/team/` files (+361, +164/−15). **Reviewers must not read that +227/−17 as new work by the successor package.** I confirmed both scopes with `git diff --numstat` myself.

## 3. Evidence classes used below

| Tag              | Meaning                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **[R-16]**       | Reproduced by me on my own local disposable PostgreSQL 16.15 (exact SQLSTATE and messages recorded)                                |
| **[HEAD]**       | Re-derived by me statically from the exact head `bc6a6d5` / the blob at that head (line anchors, counts)                           |
| **[DOC]**        | Confirmed against official PostgreSQL 16 documentation that I fetched in this review                                               |
| **[CO]**         | Reported by the coordinator (their offline evidence attachment); accepted only where I reproduced or independently corroborated it |
| **[MINE-DRAFT]** | Restated from my own drafting in the previous assignment — flagged, never used as proof                                            |

## 4. Verdicts on the coordinator's six findings

### F1 — the block does not compile. **CONFIRMED [R-16][HEAD][DOC]**

I ran the guard **exactly as committed at `bc6a6d5`**, with `citylink.capacity_preflight_target` pinned to the Test ref, on an empty local database:

```text
ERROR:  syntax error at or near "||"
LINE 506:     || 'failure for target "%". G4 pinning and the applicati...
```

Identical to the coordinator's output, including the `LINE 506` offset, which resolves to guard line **604–606**: the final `raise notice` builds its format argument from three literals joined with `||`, then passes `v_target`. Official documentation [DOC] states the RAISE format "must be a simple string literal, not an expression", while `USING option = expression` _does_ accept any string-valued expression.

Re-audit of **all 7 raise sites** [HEAD] — this is the precision the packet asked for:

| Line               | Form                                                                                 | Verdict                         |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------- | --- | ------------------- |
| 127, 136, 153, 594 | `raise exception '<token>' using detail = <expr>, hint = <expr>, errcode = '45000';` | legal — format is a literal, `  |     | `only inside`USING` |
| 587, 590           | `raise notice '<literal with %>', v_target;` / `'  %', v_item;`                      | legal                           |
| 604                | `raise notice '<lit>' \|\| '<lit>' \|\| '<lit>', v_target;`                          | **illegal — the single defect** |

So: **exactly one** offending site, not a class of them, and the four `USING`-clause concatenations elsewhere are fine. Because PL/pgSQL parses the whole block before executing any of it, that one site silenced every other check — including G1's Main refusal, which is why the coordinator saw nothing else, and why several further defects (F7, F8 below) were invisible until the block could parse at all.

### F2 — `to_regfunction(text)` does not exist. **CONFIRMED, with a refinement that removes the version hedge [R-16][DOC]**

My run: `ERROR: function to_regfunction(unknown) does not exist` (SQLSTATE 42883), with `to_regclass(text)` resolving in the same session [R-16].

Refinement: the official PG 16 information-function table lists `to_regclass`, `to_regcollation`, `to_regnamespace`, `to_regoper`, `to_regoperator`, `to_regproc`, `to_regprocedure`, `to_regrole`, `to_regtype` — and **no `to_regfunction`** [DOC]. This is not a version-dependent availability question; `to_regfunction` was never a PostgreSQL identifier. The correct replacement for the guard's use is `to_regprocedure(text)`; `to_regproc(text)` would be wrong here because it takes a bare name and is ambiguous-without-error by design.

I verified the replacement is _semantically_ safe, not just syntactically [R-16]:

- `to_regprocedure('public.definitely_absent_fn(uuid)')` → **NULL, no abort** — exactly the intent stated in the guard's own comment at `:198–:201` (report every mismatch instead of aborting on the first).
- `to_regprocedure('now')` (bare name, no parentheses) → **NULL**, not an error. So the mechanical swap is safe **only because** all 19 sites pass fully parenthesized signatures [HEAD: sites 205, 242, 289, 342, 378, 392, 411, 432, 439, 465–472, 523, 530 — each holds `name(types)`]. Any future edit that passes a bare name would silently read as "object missing". That constraint should be written into the file, not left to convention.

I also verified `sha256(convert_to(lower(btrim(…))))` — the G4 normalization expression — compiles and returns a 64-hex digest on 16.15 [R-16], so the PG 15+ dependency noted in the header holds at least on this engine. The actual Test major version remains unverified, and confirming it belongs in the preflight run header, as the packet says.

### F3 — `pg_proc.proallargnames` does not exist. **CONFIRMED [R-16][DOC][HEAD]**

My catalog query returned `proallargnames_exists = 0`, and `pg_attribute` for `pg_proc` listed exactly `proallargtypes`, `proargmodes`, `proargnames` [R-16]; the official `pg_proc` table confirms the same three and no fourth [DOC]. Guard sites `:376`, `:390`, `:409` [HEAD].

Semantics, tested on three shapes I created locally [R-16]:

| Function                                                                  | `proargnames`                      | `proargmodes` |
| ------------------------------------------------------------------------- | ---------------------------------- | ------------- |
| `demo_all_in(a int)`                                                      | `{a}`                              | **NULL**      |
| `demo_shape(out p_post_id uuid, out p_group_id uuid, out p_subject text)` | `{p_post_id,p_group_id,p_subject}` | `{o,o,o}`     |
| `demo_tbl() returns table(q_id int, q_name text)`                         | `{q_id,q_name}`                    | `{t,t}`       |

So the rename is correct and `md::text = any (array['o','t'])` selects exactly OUT/TABLE columns in order — but the guard must keep treating a NULL/empty result as a mismatch, which it already does through its `coalesce(v_names::text, '<unreadable>')` comparison [HEAD `:383`, `:397`, `:416`].

One honest correction against **my own** probe: my first attempt at F3 raised `syntax error at or near "with"` because I wrote `unnest(...) with ordinality as a(nm, md, ord)` in the _select list_. The guard's actual form — `from pg_proc p, unnest(…) with ordinality as a(nm, md, ord)` in the FROM list — is valid, and after the rename it executes and reports rather than aborting [R-16]. That error was mine, not the artifact's, and I record it so nobody chases it.

### F4 — `pg_default_acl.roleid` does not exist. **CONFIRMED [R-16][DOC][HEAD]**

Locally `pg_attribute` lists `oid, defaclrole, defaclnamespace, defaclobjtype, defaclacl` [R-16], matching the official page [DOC]; the guard's G11 site is `:568` (`d.roleid::regrole::text`) [HEAD]. My run: `42703 / column d.roleid does not exist`. The correct column is `defaclrole`, and after that single substitution G11 executes and emits its capture NOTICE on both my empty and fixture databases [R-16].

Related trap worth recording for whoever edits that line: concatenating `defaclobjtype` **without** `::text` raises `42725 operator is not unique: text || "char"` [R-16, from my own faulty probe]. The guard already casts it, so this is not a current defect — but the line is one careless edit away from one.

### F5 — the `text[] || 'untyped literal'` accumulator is fatal. **CONFIRMED, with a refinement [R-16][HEAD]**

Counts re-derived at the head: **44** accumulator statements (`v_fail`/`v_note := v_fail`/`v_note || …`), **0** `array_append`/`array_cat` anywhere, declarations `v_fail text[] := '{}'` `:110` and `v_note text[] := '{}'` `:111` [HEAD].

My results on 16.15, every form the guard uses:

| Form                                                                    | Result                          |
| ----------------------------------------------------------------------- | ------------------------------- |
| `v := v \|\| 'G2 … missing'` (comma-free literal)                       | `22P02 malformed array literal` |
| `v := v \|\| 'G8 … runner'` (no comma)                                  | `22P02`                         |
| `v := v \|\| 'G3 ' \|\| i \|\| ' missing'` with `i` a declared **text** | `22P02`                         |
| multi-literal chains, `coalesce(<text[]>, '<literal>')` chains          | `22P02`                         |
| `array_append(v, '…')`                                                  | **works**                       |
| `v \|\| array['…']`                                                     | **works**                       |

Refinement to the coordinator's statement "only `array_append` worked": `v || array['…']` also works, because the literal becomes a `text[]` on both sides (`array_cat`). The failing construct is specifically `text[] || <unknown literal>`, which resolves to `array_cat` with the unknown coerced to `text[]` and then parsed as an array literal. Two valid repair forms therefore exist; **`array_append` is the one I recommend** because it is single-purpose, survives multi-line chains, and cannot silently re-select `array_cat`.

Precision on the packet's detail: the first accumulator statement is `:163` (`v_note`, the G1 capture), and `:171` is the first `v_fail`. Either way the guard could not report a single mismatch, as the coordinator says. Fails closed, never falsely passes — but unusable as an instrument of record, exactly as their finding states.

### F6 — minor items. **Partly confirmed, partly reframed [HEAD][R-16]**

- `v_sig regprocedure` declared at `:114` and never used: **confirmed** — 1 occurrence in the whole file [HEAD]. Cosmetic; removal shifts every later line number, which would invalidate the anchors in this review, so I recommend deleting it only in the same commit that renumbering is tolerated.
- The header claim: the actual wording at `:45` is "no `create, alter, drop, grant, revoke, comment, insert, update, delete, truncate, copy` or **`select-into-table`** statement in this file". That is **technically accurate** — there is no `SELECT … INTO <table>` — but it is misleading, because the block contains **13** row-into-variable `SELECT … INTO v_*` statements (`:216, :296, :374, :388, :407, :450, :461, :498, :510, :527, :551, :571, :576`) [HEAD]. I would not call this a false statement; I would call it a wording trap and recommend "no `SELECT … INTO` table creation; the `SELECT … INTO` uses are row-into-variable only".

## 5. Additional defects I found (invisible to the coordinator, because their run died at F1)

### F7 — **G3's `search_path` predicate is a guaranteed false positive.** [R-16] NEW, blocking

G3 reads `coalesce((select string_agg(c, ',' order by c) from unnest(p.proconfig) c), '<none>')` into `v_config` and fails the check when `v_config <> 'search_path='` (`:224–:226`) [HEAD].

I created functions using the **blob's own syntax** `set search_path to ''` and observed how the engine stores it [R-16]:

```text
proname         | proconfig            | guard-style text
pin_blob_style  | {"search_path=\"\""} | search_path=""
pin_no_value    | (null)               | <none>

drafted rule on a CORRECTLY pinned helper: t   (i.e. "mismatch")
```

The rendered element is `search_path=""`, never `search_path=`. So **G3 would report a mismatch on every legitimate Test preflight**, on a helper that is pinned exactly as the authoritative Stage 6 file pins it. My fixture run proves the end-to-end symptom: the repaired guard reported `G3 private.can_browse_current_term_group(uuid) search_path pin is not empty; observed proconfig "search_path=\"\""` for both helpers [R-16].

Two predicates I validated on the real engine, correct in both directions (empty pin passes, unpinned fails) [R-16]:

```sql
-- (a) parsed, robust across quoting variants — recommended
exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
         where split_part(c, '=', 1) = 'search_path'
           and btrim(replace(split_part(c, '=', 2), '"', ''), ''' ') = '')

-- (b) containment, simplest but depends on the engine's exact rendering
coalesce(p.proconfig, '{}'::text[]) && array['search_path=""']::text[]
```

This matters more than a cosmetic fix: G3's purpose is to prove the helper posture without redefining helpers. A check that always fails trains operators to distrust the guard, and a "mismatch" that is actually correct behaviour is worse than no check — it invites someone to "fix" the helper instead of the predicate, which would violate the no-redefinition rule.

### F8 — **5 hard `'name'::regclass` casts abort instead of reporting.** [R-16] NEW, blocking

Sites `:187`, `:324`, `:360` (as `attrelid = 'public.…'::regclass`) and `:501` (`c.oid = 'public.study_groups'::regclass`), `:512` (`conrelid = 'public.study_groups'::regclass`) [HEAD].

Three of them sit behind a `to_regclass('…') is not null and …` test, which assumes short-circuit evaluation. PostgreSQL does **not** guarantee it, and on my engine the expression was evaluated anyway:

```text
E2E on an empty database (accumulator + lookup defects already repaired):
ERROR:  relation "public.courses" does not exist      -- from :187, inside a `to_regclass(...) is not null and …` guard
ERROR:  relation "public.study_groups" does not exist  -- from :512, the constraint count, not guarded at all
```

[R-16]

`:512` is the serious one: a target with no `public.study_groups` cannot be _reported_ as such, because the count query aborts the block. Repair: compare against `to_regclass('…')` (which yields NULL and therefore "no rows", feeding the accumulator's mismatch path) — the substitution I applied at all 5 sites made the block run to a full accumulated report [R-16]. Note this is the _same class_ of mistake as F5 and the `regprocedure` intent note: the guard's design consistently intended "report everything", but several constructs abort the block first.

### F9 — the clean-success path is unreachable today, so it is untested code. [R-16][MINE-DRAFT] NEW

G4 always fails while the digests are unpinned, so the only reachable outcomes are: unpinned-target refusal (`:127`), Main refusal (`:136`), and accumulated mismatch (`:153` or `:594`). I exercised **all three** on the real engine [R-16]:

```text
no target set   -> ERROR: group_capacity_prerequisite_unpinned
Main ref        -> ERROR: group_capacity_main_out_of_scope  (with the row-8 / create-RPC rationale in DETAIL)
Test ref        -> ERROR: group_capacity_prerequisite_mismatch
                   DETAIL: 26 check(s) failed … (empty database, Supabase roles absent)
                   DETAIL: 25 check(s) failed … (empty database, anon/authenticated present)
                   DETAIL: 16 check(s) failed … (Supabase-shaped fixture)
```

The `raise notice '… reported no pinned failure …'` branch has never executed anywhere. It should be labelled untested, not implicitly trusted.

### F10 — the reviewed blob's own `begin;`/`commit;` defeat `--single-transaction`. [R-16] NEW, affects the runbook

The blob is self-delimiting: `begin;` at `:39`, `commit;` at `:1756` [HEAD, re-read at this head]. I reproduced a blob-style file under `psql --single-transaction`:

```text
WARNING: there is already a transaction in progress   (the file's begin;)
WARNING: there is no transaction in progress          (at exit)
both tables survived                                  (the file's commit; finalised early)
```

Consequence: wrapping the application in `psql --single-transaction`, or in an outer `BEGIN`, does **not** give the guard+DDL sequence atomicity — the blob's internal `commit;` ends the outer transaction mid-file and everything after it runs in autocommit. Run as a plain script, the blob's own atomicity is real (I confirmed an internal `begin; … rollback;` correctly left nothing behind) [R-16]. This is a concrete instruction for the checklist: run the guard, then run the blob **as-is, un-wrapped**, in the same authorized session, and record the two timestamps; do not attempt to bind them with `--single-transaction`. It also strengthens the case that the "one authorized run" control in my draft was procedural, not mechanical — and that the only true single-atomic-unit alternative would require editing the reviewed blob, which Adam's constraint forbids.

### F11 — service-role assumption: tested, **not** reproduced. [R-16] NEW, informational

G3 calls `has_function_privilege('service_role', v_oid, 'execute')` at `:252` while its role-existence check at `:235` covers only `anon` and `authenticated` — and that asymmetry is visible in the accumulated report itself: the role-existence item appears when `anon`/`authenticated` are absent and disappears when they exist (26 items vs 25 on the same empty database) [R-16]. I expected `42704` on a database lacking `service_role`; instead the block reported its accumulated mismatch normally (the privilege function returned NULL rather than aborting). **No defect claimed**; recorded only so the asymmetry is visible to whoever edits that check.

## 6. Was the guard genuinely read-only? **Yes, and now proven two ways** [HEAD][R-16]

- Token scan on the drafted file: 0 `create/alter/drop/grant/revoke/insert/update/delete/truncate/call/copy/execute` tokens outside comments and string literals, and 0 dynamic-SQL keywords [HEAD, my checker].
- Token scan on the repaired copy: still **0** after all 73 replacements [R-16], so the repairs add no write capability.
- Behaviour on the real engine: the block executed against an empty database and against a populated fixture, emitted only `NOTICE` capture lines, and terminated in a raised error; no catalog mutation was possible from a `DO` block containing only catalog `SELECT`s.

Correction to my own earlier record **[MINE-DRAFT]**: in the previous handoff I wrote that "G1 refuses Main's ref outright" and that the guard "reports every mismatch at once". Both were **design** statements presented in a way that implied working behaviour. As drafted the file could not parse, so nothing was refused and nothing was reported. F1–F8 are the price of that wording, and the lesson is recorded in §9.

## 7. Stage 4 scope, item by item

| Required area                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SQL structure and forward-only behaviour                                                                                         | **Sound as designed; the DDL side is unchanged and verified; the guard's executable layer is not usable yet**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | blob re-hashed at head [HEAD]; F1–F8 [R-16]; G5 correctly demands capacity objects absent, which is the forward-only precondition |
| Is the guard read-only?                                                                                                          | **Yes** (see §6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [HEAD][R-16]                                                                                                                      |
| Helper security posture (G3) and the no-redefinition rule                                                                        | **No-redefinition rule honoured (0 DDL tokens). G3's posture _logic_ is right, but its pin predicate is broken (F7) and its lookup identifier was invented (F2).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [HEAD][R-16][DOC]                                                                                                                 |
| Function owner and grants — G8 legality only                                                                                     | **Acceptable as a legality probe.** Ownership test uses `pg_has_role(session_user, owner, 'member')` (`:475`) and `has_schema_privilege` (`:481`, `:487`), the latter correctly guarded by `to_regnamespace('private') is null` (`:484`). No grant statement anywhere. Caveat: G8 asserts the _runner's_ privileges, so the recorded session identity must be part of the run header, or the result is unattributable.                                                                                                                                                                                                                                                                                                                                                                      | [HEAD][R-16]                                                                                                                      |
| Legacy compatibility: 3-arg stub `:387`, `group_capacity_upgrade_required` `:398–:399`; legacy shapes at `:1289`/`:1448`/`:1704` | **Preserved — unchanged and re-verified.** More importantly: **the guard's three expected output lists match the blob's own declarations exactly.** I compared name-by-name: 5-col `{profile_id,group_id,group_name,group_status,group_size}` = blob `:1292–:1298`; 6-col `{group_id,group_name,group_status,active_member_count,can_create_post,has_more}` = blob `:1454–:1460`; 14-col `{post_id,group_id,group_name,subject,active_member_count,author_name,body,post_status,created_at,updated_at,closed_at,apply_enabled,can_manage,has_more}` = blob `:1710–:1723`. So G6 will not reject the state the reviewed blob creates.                                                                                                                                                        | [HEAD]                                                                                                                            |
| Old-client read shapes                                                                                                           | **Same as above; no drift found.** On my fixture, supplying the 5-col shape verbatim produced **no** G6 complaint, while my invented 6-col/14-col names were correctly rejected [R-16] — the assertion bites in both directions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [R-16]                                                                                                                            |
| Transaction and concurrency, including my two-step residual                                                                      | **Residual is real and now sharper** (F10): the two steps cannot be mechanically bound by `--single-transaction`, and the drafted guard could not even run. Guard takes no locks beyond catalog `ACCESS SHARE`, so a concurrent group-creation between guard and DDL is unprevented — that window is inherent to Option A and is closed only by procedure (maintenance window, recorded timestamps).                                                                                                                                                                                                                                                                                                                                                                                        | [HEAD][R-16]                                                                                                                      |
| Test/Main target prerequisites, incl. my Finding 1 (Main structurally ineligible)                                                | **CONFIRMED and upgraded from inference to mechanism.** Two of its three legs are now parser-proven on a Main-shaped local database: a `language sql` wrapper declaring `subject` **fails at creation** (`column g.subject does not exist`), while the `language plpgsql` capacity read referencing `p.subject` **creates successfully and fails only when first called** — the silent-landmine asymmetry I asserted [R-16]. Third leg: dropping `create_group_and_invite(uuid,uuid)` on a target that has only that form leaves **0** create RPCs (`count(*) = 0` observed inside the transaction) [R-16]. Also cleared a possible fourth worry: `create schema if not exists private` at `:971` precedes the capacity read at `:1484`, so schema ordering inside the blob is fine [HEAD]. | [HEAD][R-16][CO]                                                                                                                  |
| Migration-ledger handling (G11 capture-only, Track D separation)                                                                 | **Correct as designed.** G11 wraps the ledger read in `begin … exception when insufficient_privilege` (`:549–:560`) and only captures; the `defaclrole` fix (F4) is the single required edit; repository filenames are explicitly not treated as ledger identity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [HEAD][R-16]                                                                                                                      |
| Do the four tracks really stay unbundled?                                                                                        | **Yes.** No DDL of any kind in the successor material; row-8, grant normalization and ledger repair appear only as detection/capture. The Main refusal message itself names row-8 promotion and grant normalization as _separate tracks_ rather than fixing them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [HEAD][R-16]                                                                                                                      |

## 8. The three positions Adam asked for

### 8.1 Can G4 ever be pinned honestly without a live dry run? **No — and the pinning record should be bigger than a hash pair**

Static reasoning cannot manufacture the value: the digest is defined over the _live catalog's_ rendering of the function body, and my candidate recipe applied to checked-in text produced different digests by construction (browse `9206e208…`, manage `1158da30…` vs canonical `5991901a…`, `5e88d56b…`) — a scope difference, not drift **[MINE-DRAFT][HEAD]**.

A minimum pinning record must contain, in one artifact:

1. `version()`, plus `lc_collator`, `lc_ctype`, `server_encoding` and the session `search_path` — `lower()` and locale-sensitive collation can change byte sequences, so the digests are not reproducible without them;
2. the **normalization expression verbatim** (the exact `regexp_replace` nesting) and the **input source** named explicitly: `pg_get_functiondef(oid)` of the live object, not the repository statement text;
3. the two digests **with the character length of the normalized input** (the parity report already records raw lengths 666/748 and 864/1037 — the same convention should carry to normalized values);
4. target ref, database name, timestamp, the identity of the session that ran it (`session_user`), and the observation that the helpers' `proconfig` renders as `search_path=""` — i.e. the F7 finding gets captured by the same run;
5. an explicit statement that the two digests were produced **by the expression in item 2 applied in the same run**, so no operator is comparing across scopes.

A genuine improvement now available **[R-16]**: the guard's own G4 normalization expression compiles and yields a 64-hex digest on a real engine. Therefore the honest design is to make the guard compute the observed digest with **its own published expression** and pin only the expected values produced by that same expression on Test — which removes the class of error that created this blocker in the first place (two different scopes, one number). Until then, G4 failing closed is the correct behaviour, not a defect.

### 8.2 Two-step guarded sequence vs a new atomic successor SQL head → **keep two-step**

Reasons, in cost order:

- The atomic alternative means **copying 1,756 lines of reviewed DDL** into a new file. That creates a second authority for the same DDL and invalidates every exact-head review already performed on the first — including the one Adam closed. It would require a byte-level reconciliation proof between two large files plus a fresh Role 6 review, and on Adam's packet a fresh Eunice evidence pass.
- The claimed benefit is illusory: Supabase records versions as execution timestamps and applies files by ledger; a single file would still be one transaction (the blob already is one) and F10 shows that wrapping it in `--single-transaction` actively _breaks_ atomicity rather than adding it.
- My F1–F8 repairs are all **local and mechanical** (73 replacements + 1 predicate), so the guard becomes usable without touching the blob at all.
- The residual risk of two steps is bounded and procedural: guard read-only, no locks taken, both steps in one authorized session with recorded timestamps, and the checklist forbidding manual changes between them.

If Adam nonetheless wants atomicity as a property rather than a procedure, the cheap middle path is **not** a copied DDL file: it is a successor where the guard is a `SELECT`-only preflight (see 8.3) run immediately before the unchanged blob, with the runbook language of F10. A truly atomic unit requires editing the blob and a new approval.

### 8.3 Is a PL/pgSQL guard the right instrument at all? → **No. Move the prerequisite assertions to a reviewed SELECT-only checklist; keep at most a thin DO wrapper**

This is a change of position from my own drafting, and the evidence is exactly F1–F8 **[R-16]**.

The structural problem is not any single defect: it is that **a DO block is all-or-nothing**, and every one of my successful repair iterations was only reachable by fixing a previous abort — which is precisely the evidence for the point below. PL/pgSQL parses the entire block before running any of it, so one syntax slip (F1) or one hard cast (F8) or one unknown identifier (F2/F3/F4) destroys the whole instrument — and destroys it _silently with respect to everything else_, which is precisely how five real defects survived a drafting review that was textual only. Its accumulator also needs a type-correct idiom (F5) and its final reporting statement is grammar-restricted (F1). Every one of those failure modes produces either a crash or a false "all good", and neither is an auditable record.

A SELECT-only preflight is strictly better for this purpose:

- each check is an independent row: `check_id, subject, expected, observed, verdict`; a broken expression fails **one** row (and can be reviewed as failing) instead of aborting the whole instrument;
- it is reviewable by humans and by Eunice without procedural-language knowledge, and it pastes directly into the checklist as the evidence artifact;
- it is trivially runnable through the authorized metadata path, needs no GUC plumbing for target pinning (the operator states the target in the record, and the Main prohibition stays a documented precondition), and cannot be accused of hiding an accumulator bug;
- the catalog logic that genuinely needs procedural behaviour — OUT/TABLE name extraction (F3), parsed `proconfig` inspection (F7), ACL capture (F4) — all expresses cleanly as `SELECT`s with `unnest`, `split_part` and `has_function_privilege`, each form already validated on my local engine [R-16].

What must still be PL/pgSQL (or a wrapper function) is the refusal behaviour: if Adam wants the sequence to be _un-skippable_, a thin wrapper whose only job is `if exists (select 1 from <checks> where verdict = 'MISMATCH') then raise exception …` is enough, and it is small enough to be reviewed as one page. The 608-line version is the wrong shape for an instrument of record: it concentrates 73 defects in one un-parseable artifact and gives no partial evidence.

**Recommendation**: keep PR #51's _design_ material (package document §1–§4, §7, §8; checklist) and replace the guard file with a SELECT-only preflight of roughly one page per track, then a fresh exact-head review. Retain the DO-block version only as a non-authoritative convenience, clearly labelled, **after** it has passed a real-parser gate.

## 9. Process conclusion I am responsible for

My previous assignment's §7 table said the guard was checked "statically, never parsed or executed", which was true and honestly labelled — but the surrounding prose then described guard behaviour ("refuses", "reports", "fails closed") as though the instrument worked. The structural checker I wrote could not have caught **any** of F1–F8: it counts tokens and balances control keywords; it does not know RAISE grammar, catalog column names, operator resolution, or `proconfig` rendering. Five of the six coordinator findings, and both of my new blocking findings, are in classes it is blind to by construction.

Therefore: **no SQL artifact that is intended as an instrument of record should be delivered as an accepted review artifact until it has been run through a real PostgreSQL parser**, even a disposable local one with no data in it. That gate is cheap — my whole reproduction took one install plus a few statements — and it would have caught F1, F2, F3, F4, F5, F7 and F8 before delivery. I recommend adding it to the Stage 4 wording so it is a requirement rather than a courtesy, and I am recording it against myself first.

## 10. Commands actually run in this review, with results

| Command / action                                                                                                | Exit / result                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git status --short --branch`; `git rev-parse HEAD`                                                             | clean, `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`; still clean at the end                                                                                                                                                                                          |
| `git ls-remote origin refs/heads/feature/role6-capacity-successor-draft-20261122`                               | `bc6a6d5…` (matches local)                                                                                                                                                                                                                                         |
| `gh pr view 51 … --json number,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,url` | OPEN / draft / base `feature/group-capacity-migration` / `MERGEABLE` / `CLEAN`                                                                                                                                                                                     |
| `git diff --name-only 65058a8…HEAD` ; `… -- supabase \| wc -l`                                                  | 3 docs files ; **0**                                                                                                                                                                                                                                               |
| `git diff --numstat 5537baa…HEAD`                                                                               | 3 docs + 2 `docs/team` + blob `+227/−17` (inherited)                                                                                                                                                                                                               |
| `git rev-parse HEAD:supabase/migrations/20261119090000_group_hard_max.sql`; `git cat-file blob … \| sha256sum`  | `a04048e9…`; `5cf0a66a…4887`                                                                                                                                                                                                                                       |
| `git ls-remote origin refs/heads/main`                                                                          | `1a583e30c019733d1880d2614ca853481509fdad` (unchanged)                                                                                                                                                                                                             |
| anchor/count greps on the guard and the blob                                                                    | 7 raise sites; 19 `to_regfunction`; 3 `proallargnames`; 1 `d.roleid`; 44 accumulators + 0 `array_append`; 5 `::regclass`; 13 `SELECT … INTO v_*`; 1 `v_sig`                                                                                                        |
| `sudo apt-get update && sudo apt-get install -y postgresql-16 postgresql-client-16`                             | success; `postgres (PostgreSQL) 16.15`                                                                                                                                                                                                                             |
| `initdb -A trust`; `pg_ctl -o "-c listen_addresses='' …"`; `ss -ltnp \| grep -c postgres`                       | started; **0** TCP listeners                                                                                                                                                                                                                                       |
| probes for F1–F5, F7, F8, F10, F11 (catalog + DO blocks)                                                        | every result quoted above; SQLSTATEs 42883 / 42703 / 22P02 / 42725 / 42P01 / 3F000-adjacent / syntax 42601                                                                                                                                                         |
| guard **as drafted** with Test ref pinned                                                                       | `ERROR: syntax error at or near "\|\|"` — no check ran                                                                                                                                                                                                             |
| repaired copy (R1 19, R2 3, R3 1, R4 44, R5 1, R6 5 = 73) with Test ref                                         | `group_capacity_prerequisite_mismatch`, 26 checks (empty db, roles absent) / 25 checks (empty db, roles present) / 16 checks (fixture) — the single-item difference is G3's role-existence stop, which confirms the accumulator aggregates rather than hides state |
| repaired copy with Main ref                                                                                     | `group_capacity_main_out_of_scope`                                                                                                                                                                                                                                 |
| repaired copy with no target                                                                                    | `group_capacity_prerequisite_unpinned`                                                                                                                                                                                                                             |
| Main-shaped probes (M1/M2b/M3)                                                                                  | `language sql` + absent `subject` → fails at creation; `language plpgsql` → creates, fails at first call; 2-arg create drop → 0 create RPCs left                                                                                                                   |
| `pg_ctl -m fast stop`; `pkill -f "postgres -D"`; `rm -rf data`                                                  | stopped, deleted, stray processes 0                                                                                                                                                                                                                                |

Warnings observed and disclosed: `psql --single-transaction` emitted `WARNING: there is already a transaction in progress` and `WARNING: there is no transaction in progress` in the F10 probe (that is the finding). Two of my own probe formulations were defective (`with ordinality` placement; `text || "char"` ambiguity) and are disclaimed in §4 F3/F4 rather than reported as artifact defects. Fixture creation reported `role "anon" already exists` on a reused cluster — cluster-scoped vs shared-catalog effect in my probe, not a guard issue.

## 11. Authorization boundary

This assignment was read-only against the repository and forbidden any Supabase call. I made **no** repository edit, commit, push, branch creation, PR body/state change, ready transition, merge or close; PR #51 remains OPEN/draft at `bc6a6d5…` with the same head. I contacted **no** Supabase project and read **no** credential. The only SQL executed was on my own disposable local engine with synthetic data, per the packet's explicit invitation; it was stopped and deleted. Static and local-parser review grants no migration, preflight, signed-in QA, merge, deployment or release approval, and silence is not approval.

## 12. Blockers

1. **The guard as committed is not an executable instrument** (F1–F8). Repair cost is small and fully characterised — 73 mechanical replacements plus the F7 predicate and the F8 cast rule — but until it is repaired _and_ re-validated by a real parser, no preflight should be scheduled around it.
2. **G4 pinning** still requires the separately authorized read-only dry run, and §8.1 now specifies the record it must produce (including locale and `proconfig` rendering).
3. **My recommendation re-shapes the artifact** (SELECT-only preflight instead of the DO-block guard). That is an Adam/coordinator decision, not a drafting detail, and it changes what the next assignment should build.
4. **Test engine major version remains unverified** (my evidence is 16.15; the PG 15+ `sha256` dependency and the `search_path=""` rendering must be re-checked on the real target).
5. Two stale-client strings (D5a/D5b) still need one confirmation each — untouched by this review, and I proposed no new user-facing string.

## 13. Coordinator/owner next action (agent work, no Adam decision required)

- Coordinator: record F7 and F8 in the evidence branch and add a **real-parser gate** to Stage 4 acceptance wording; my §9 is the concrete proposal.
- Coordinator: fold F10 into the preflight checklist as an explicit prohibition on `--single-transaction`/outer-BEGIN wrapping of the blob.
- Roy / Jeffery: nothing here changes client contracts; F8 in the shape lists confirms the 5/6/14-column expectations equal the blob's declarations, which is what the client allowlist work assumes.
- Eunice: when re-verifying, note that `to_regprocedure` (not `to_regfunction`) and `proargnames` (not `proallargnames`) are the identifiers to expect in any successor, and that G3's `search_path` predicate must not be trusted until F7 is repaired.
- Next Role 6 build (on a future assignment, not this one): SELECT-only preflight, one page per track, validated locally before delivery, then a fresh exact-head review.

## 14. Verdict

**PR #51's reasoning survives contact with a real parser; its guard does not.** The package design — wrap rather than duplicate the reviewed blob, Test-only scope because Main is structurally ineligible (now parser-proven), four tracks unbundled, Option A preserved verbatim, guard read-only by construction, G6 shapes faithful to the blob, ledger capture-only — I re-derived at the exact head and confirm, with the anchors above. The instrument of record as drafted is non-executable and contains two defects beyond the coordinator's list (F7 guaranteed-false mismatch on the correct helper posture, F8 block-aborting hard casts) that would each have stopped a real Test preflight. My position is that the DO-block guard should be replaced by a reviewed SELECT-only preflight, with the two-step sequence retained and the blob left byte-identical.

I do not certify this artifact as ready for review, and I do not treat my own earlier verdict as covering this head.

Adam's next action(s):

1. **Decide the instrument shape (blocking).** Choose: (a) repair the DO-block guard per F1–F8 and re-validate it on a real parser, or (b) replace it with a reviewed SELECT-only preflight plus a one-page refusal wrapper, which is what I now recommend. This decides the content of the next Role 6 assignment and whether PR #51 gets a repair commit or a redesign commit. Nothing else in this area can be settled first.
2. **Add the real-parser gate to Stage 4 acceptance.** Purpose: prevent another artifact that "reviewed clean" but cannot parse. Approve wording such as "any SQL intended as an instrument of record must be executed against a disposable local PostgreSQL with no live data before it is accepted". Expected result: recorded in `docs/team/DECISIONS.md`; unblocks accepting repaired successor material.
3. **Confirm the runbook prohibition from F10.** Approve or amend: the reviewed blob is applied **un-wrapped** (no `--single-transaction`, no outer `BEGIN`) after the preflight, in the same authorized session, with both timestamps recorded. Expected result: the checklist stops implying mechanical atomicity; unblocks a credible Test application plan.
4. **Then (unchanged, still queued)** authorize the single read-only Test dry run that produces the G4 pinning record specified in §8.1 — target `wkzclgmhrtecnpexfesr`, SELECT-only, no writes, no application rows — and confirm the Test engine's major version in the same run. Expected result: G4 becomes pinnable and the guard/preflight stops self-blocking. Present with the two-step-vs-atomic decision (item 1) and the Main Track B/C sequencing, since they now overlap.
5. **Optional, no dependency**: Role 6 human name; and the two D5a/D5b client strings, which this review did not touch.
