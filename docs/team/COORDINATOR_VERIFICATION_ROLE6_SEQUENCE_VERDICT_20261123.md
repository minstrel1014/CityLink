# Coordinator verification of Role 6's combined sequence verdict (2026-11-23 15:56)

Role 6 delivered `Role6verdict—theorderedcombinationS1→pin→S3→gate.md` answering the packet
`ROLE6_S1_S3_CLIENT_COMBINED_EXACT_HEAD_REVIEW_PACKET_20261123.md`. Its headline verdict is
**conditional pass on the SQL pair, refusal on the sequence as an executable procedure**.

This file records what the coordinator independently reran, what it accepted as reported, and the one
claim that has now moved from hypothesis to measurement. It does not restate Role 6's reasoning.

## 1. Claims I reran myself and confirm

| Role 6 claim                                                                    | My check                                                                                                       | Result                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2 is **not** at C1 and **not** at PR #51 head                                  | `git cat-file -e <head>:supabase/migrations/20261119080000_preblob_reconcile_list_group_recruitment_posts.sql` | **confirmed absent** at both                                                                                                                                                                                                                        |
| S2 lives on PR #52 head `2377046d…` with blob `2816e842…` / SHA-256 `c4ccc85b…` | `git rev-parse` + `sha256sum` at that head                                                                     | **confirmed**: blob `2816e8421674c4297c91867a57ba04f9c27ebe92`, SHA-256 prefix `c4ccc85b0a343fb7`                                                                                                                                                   |
| Refusal codes `45003`–`45009` are **not** in S3                                 | `grep -oE '45[0-9]{3}'` over S3                                                                                | **confirmed**: exactly two hits, both `45000`                                                                                                                                                                                                       |
| S1 validates both constraints against existing rows                             | `sed -n '30,40p;78,86p'` of S1 at C1                                                                           | **confirmed**: `validate constraint profiles_display_name_length_chk` and `validate constraint study_groups_name_length_chk` present                                                                                                                |
| S1 supplies `update_own_display_name`, S3 does not touch it                     | S1 line 40 onward; identifier counts                                                                           | **confirmed**: `create or replace function public.update_own_display_name(p_display_name text) returns text`, `security definer`, `set search_path = ''`, `revoke all … from public, anon`, `grant execute … to authenticated`; 0 occurrences in S3 |

## 2. Where my packet's counts were wrong (errata, packet left as dispatched)

My packet §5(e) said S3 has "3 `alter table`, 0 `security_invoker`". Both were imprecise:

- `security invoker` is written with a **space** in the SQL; my grep used an underscore, so my `0` was a
  grep error. Actual count: **2**.
- `alter table` at line level is **3**, but the three are not equivalent:
  - `:45` and `:56` — column work on `public.study_groups`;
  - `:981` — `alter table private.group_removal_context enable row level security`.
    Role 6's "2" excludes the private-schema RLS enable. The substantive point my packet understated is
    that **S3 does enable row level security on a private table**, even though it adds no policy. Role 6's
    statement "neither file adds or drops a policy" remains true; "no RLS change" would not have been.

This is recorded as an erratum rather than an edit to the dispatched packet, so the record shows what
Role 6 actually reviewed.

## 3. F23 is no longer a hypothesis — measured on Launch

Role 6 demonstrated the abort locally and explicitly labelled the Launch state "a hypothesis about
Launch". I ran its two SELECTs against the real target, read-only, as a single statement with `LIMIT 1`:

| Measure                                                                  | Value |
| ------------------------------------------------------------------------ | ----- |
| `profiles` that would block row 8 (null, padded, or length outside 1–50) | **0** |
| `profiles` total                                                         | 3     |
| `study_groups` that would block row 8                                    | **0** |
| `study_groups` total                                                     | **0** |

Target `pijslbchvstkoweslymr`, engine 17, observed 2026-11-23 15:56. So **row 8 would not abort on
today's data**: the three profile rows are all constraint-clean and there are no groups at all.

Two limits on that statement, both of which must survive into the runbook:

1. It is a **snapshot**. Any row written between now and the apply can invalidate it — including a QA
   account whose display name is padded, or a group named with a trailing space. The check must be
   re-run in the same authorised session immediately before S1, not relied on from this record.
2. It says nothing about constraints S1 adds that this predicate does not model. It closes F23 only for
   the two constraints Role 6 identified.

## 4. Accepted as reported, not independently rerun

- The local sequence rehearsal results (S1 exit 0 → S3 exit 0, no `42P13`, 14-column post read,
  17-column `_capacity` read).
- The ten gate cases and the measured fact that the wrapper reads only `current_setting`
  (`reads_pg_proc = f`, `reads_current_database = f`).
- The post-state ACL survey (eleven functions executable by `authenticated`, none by `anon`, no `PUBLIC`
  grants left in `public`).

These are Role 6's own sandbox evidence, delivered with raw logs; I am recording them as **reported by
the reviewer**, not as coordinator-verified.

## 5. Net effect on the release

Role 6's refusal is procedural, not substantive: the SQL pair is consistent in this order, and the
sequence as written ends by calling a function no migration creates. Combined with my measurement:

- the **data** condition on row 8 is currently satisfied (0 blocking rows);
- the **gate** condition is not: `private.citylink_capacity_apply_gate()` must be installed by a
  deliberate operator step that no migration in the sequence performs, and a ledger audit will never
  show it.

Neither of those is mine to waive, and neither authorises an apply. The apply still needs an explicit
authorisation naming exact heads, target and window.

## 6. PR #54 review received 2026-11-23 16:05 — three confirmations and one real defect of mine

Role 6 reviewed the promoted gate migration. What I reran or verified myself:

| Claim                                                                      | My check                                      | Result                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Lines 24–187 hash to `a36a2e78…7db0` and `diff` against the draft is empty | `tail -n +24 \| sha256sum`, `diff`            | **confirmed**                                                                                    |
| `schema private` comes from `supabase/schema.sql:16`, not from S3          | `grep -n 'create schema' supabase/schema.sql` | **confirmed**: `16:create schema if not exists private;`                                         |
| The file sorts **after** S3 in the ledger                                  | `ls supabase/migrations`                      | **confirmed**: `20261119090000_group_hard_max.sql` then `20261123120000_capacity_apply_gate.sql` |
| Raw log shows a clean run                                                  | `grep -oE 'exit=[0-9]+'`                      | **23 × exit=0, 1 × exit=1** (the single failure is the deliberate negative case)                 |

### The defect is mine, and it is substantive

I wrote in PR #54 that the migration "must run after S3 and before the gate call". The first half is
wrong: there is no dependency in either direction, and the filename I chose (`20261123120000`) makes the
ledger install the gate **after** the capacity migration has already been applied. A gate that arrives
after the apply cannot refuse that apply. Role 6 proved the independence by applying the migration with
no S3 and again with no S1.

Correcting it is not only a rename: if the gate is meant to refuse the capacity apply, the operator must
**call** it between installing it and applying S3. That reorders the runbook addendum, not just a
filename. Pending Adam's decision; nothing was changed.

### One Role 6 claim that is factually wrong

It reports that the new file "is the only migration in the ladder without `BEGIN;`/`COMMIT;`". It is
not. Counting `^BEGIN;` across all ten migrations: only `20261118050000_stage6_chat_recruitment.sql`
and `20261118083000_stage6_people_page_naming.sql` have it. Seven migrations do not — including
`20261119090000_group_hard_max.sql` (S3 itself). So the file matches the dominant convention, and adding
`BEGIN;`/`COMMIT;` to it alone would make it inconsistent with S3 rather than more consistent. Its other
note — that the copied block still carries the draft's "DRAFT REVIEW ARTIFACT" wording — is accurate and
already explained by the preamble.

### Status after this review

Byte identity, application, digest identity and the `private` schema question are all closed. What
remains open is placement: `20261123120000` (as filed, governs later operations only) versus
`20261119085000` (sorts before S3, can refuse the capacity apply) plus the matching runbook reorder.
