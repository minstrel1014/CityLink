# Role 6 finite assignment — one verdict on the ordered combination S1 → pin → S3 → gate

Prepared by the coordinator task `HeZwm7CA7Y3rDtYBounkVC` on 2026-11-23.
**Status: PREPARED, NOT SENT.** Adam dispatches this manually so he can choose the model.

---

## 1. Recipient and delivery

- Recipient: **Role 6** — database security and migration review (human name still pending).
- Continuity task: `9KfXkHmMqAxUkRMsbpxEwA`.
- Suggested profile per the approved cost-aware routing table: **Standard**. Escalate only if the
  combination review turns into ambiguous cross-layer cutover reasoning.
- Delivery channel: Role 6's `send_task_message` into the coordinator task has been rejected
  (`permission_denied: shared_task`), so deliver the handoff as a **project-shared file** under
  `docs/` plus the report content, then stop.

## 2. Why this review does not exist yet

Role 6's current SQL verdict covers the **S3 blob alone** (unchanged since it was first reviewed). No
review has yet covered **S1 + S3 + client `344c1058…` as one ordered apply sequence**. Jeffery's F2
review at the client head explicitly left the caveat that "the client capacity RPC must be paired with
an approved successor migration before target application". That pairing is exactly what is unreviewed.

## 3. Exact fingerprints the coordinator independently verified (2026-11-23 15:16–15:18)

Evidence class: **coordinator-verified** (local `git` object reads plus GitHub `headRefOid`), not
inferred from handover text.

| Item               | Value                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client C1          | PR #37 head `344c1058e78fd2cccfde89574e226f3e65a1457c`, base `main` (`1a583e30c019733d1880d2614ca853481509fdad`), OPEN / draft / MERGEABLE                                                                                                                                                         |
| S1                 | `supabase/migrations/20261118083000_stage6_people_page_naming.sql` — blob `70cb7871494477d7204f41e28c19e0e546849e97`, SHA-256 `75aee3a19a7910cf24c52e945bb8d38f2676aad387c709eda70e9ff90ac80362`, **747 lines**, present at C1 and byte-identical at `main`, `5537baa4…`, `65058a80…`, `551da907…` |
| S2                 | `supabase/migrations/20261119080000_preblob_reconcile_list_group_recruitment_posts.sql` — blob `2816e842…`, SHA-256 `c4ccc85b0a343fb74ebe5d489635fa2805502faac6889dda74be3eff3c44d55c`                                                                                                             |
| S3                 | `supabase/migrations/20261119090000_group_hard_max.sql` at PR #51 head `551da907305ca07e17e44903858cea1c5f2765f5` — blob `a04048e90d6b64c692f03c722b9eea2849058aab`, SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`, **1756 lines**                                    |
| Apply gate wrapper | `docs/capacity-successor/preflight/90_apply_gate_wrapper_DRAFT.sql` at PR #51 head (draft instrument, **not** the blob)                                                                                                                                                                            |
| Target             | `pijslbchvstkoweslymr` ("CityLink Launch (read-only until release)"), PostgreSQL engine 17                                                                                                                                                                                                         |

### Correction Adam should know before dispatching

The SHA string circulated in the request text — `344c1058e78d**f2**cccfde…` — is a **transposition
typo**. The real head is `344c1058e78f**d2**cccfde…` (index 11 differs). Confirmed three independent
ways: `git ls-remote`, `gh pr view 37 --json headRefOid`, and `git cat-file -t` (the typo string resolves
to no object). Use the `…e78fd2…` form in the assignment; anything pinned to the typo form cannot be
verified because that object does not exist.

## 4. The single verdict requested

Give **one** verdict on this ordered sequence as a whole, not four separate ones:

```
S1 (70cb7871…)  →  pin capture (F9, target-declared identity)  →  S3 (a04048e9…)  →  private.citylink_capacity_apply_gate()
target = pijslbchvstkoweslymr, engine 17
```

Answer: is that sequence safe and internally consistent to apply, and does it leave the exact state the
S3 blob was reviewed against? A verdict of "approved in isolation" is not sufficient — the pairing is
the question.

## 5. Specific questions the verdict must answer

(a) **Row-8 preconditions.** Does S1 leave the exact row-8 preconditions that S3 was reviewed against,
or does S1 move the target away from them? Name each precondition by catalog object, and state which
ones S1 changes.

(b) **Recruitment read shape vs the client.** S1 drops and rebuilds `list_group_recruitment_posts` with
14 columns. Does that rebuilt shape stay compatible with what the client at `344c1058…` expects, and
does the legacy read wrapper plus `list_group_recruitment_posts_capacity` still return only fields an
old client accepts?

(c) **Presence after S3-on-top-of-S1.** Are all of these present afterwards: the three-argument
fail-closed `create_group_and_invite`, the four-argument `create_group_and_invite` with
`p_max_members`, the three `*_capacity` read functions, and refusal codes `45003`–`45009`?
Coordinator observation to check rather than trust: the literal strings `45003` and `45009` do **not**
appear in the S3 blob at all (`grep -c` = 0); the codes live in the wrapper
`90_apply_gate_wrapper_DRAFT.sql`. Confirm whether the gate/wrapper is therefore part of the apply
sequence, and if so name its exact blob and whether it must be applied before, after, or never.

(d) **`update_own_display_name`.** Does anything in S1 or S3 create or alter `update_own_display_name`?
Coordinator observation: the identifier appears **3 times in S1** and **0 times in S3**, and it does
**not exist on Launch today** (`pg_proc` count = 0 for `public.update_own_display_name`). That gap blocks
the display-name gate for the QA account. Say plainly whether S1 supplies it, and if it does, whether the
S1 definition matches what the current client calls.

(e) **Grant / RLS / ownership deltas.** Is there any grant, RLS or ownership change in S1 that the S3
review did not account for? Coordinator counts to verify, not to assume: S3 has 14 `grant` statements
and 3 `alter table`, 0 `create policy`, 0 `alter function`, 0 `security_invoker`. S1 at the true C1 head
has **7 `grant`, 7 `revoke`, 0 `create policy`, 0 `drop policy`, 8 `alter table`, 0 `owner to`,
12 `security definer`, 12 `search_path`, 6 `create or replace function`, 6 `create function`,
4 `drop function`**. S1 therefore changes privileges and definer/search_path posture while adding no
policies: state whether the S3 review assumed that posture, and whether any S3 function depends on a
privilege that S1 revokes (or on a function S1 drops).

## 6. Live read-only facts on Launch (coordinator-verified 2026-11-23 15:16)

| Check                                            | Observed                                               |
| ------------------------------------------------ | ------------------------------------------------------ |
| `public.update_own_display_name` functions       | 0                                                      |
| `public.profiles` rows                           | 3                                                      |
| `public.profiles` row security                   | on                                                     |
| `public.profiles` policies                       | 2                                                      |
| `anon` grants on `public`                        | none                                                   |
| `authenticated` grants on `public`               | `SELECT` on 10 tables, `INSERT`/`UPDATE`/`DELETE` on 1 |
| `*_capacity` functions, `max_members`, `subject` | absent                                                 |
| migration ledger rows                            | 7 (Launch sits before row 8)                           |

## 7. Evidence to cite

- `docs/team/RELEASE_RUNBOOK_20261123.md` steps 1–5
- `docs/team/RELEASE_CANDIDATE_20261123.md`
- `docs/team/ROLE6_F13_COORDINATOR_VERIFICATION_20261123.md`
- `docs/team/F14_VERIFICATION_AND_F17_RETURN_TYPE_COLLISION_20261123.md`
- `docs/team/F17_F19_ARE_SEQUENCE_ARTIFACTS_20261123.md`
- `docs/team/LAUNCH_CATALOG_SNAPSHOT_20261123.md`
- `docs/team/LAUNCH_FRONTEND_SITE_BUILD_20261123.md` (new client/site identity and corrected key facts)

## 8. This assignment is review-only

**Authorized:** read-only inspection of the exact heads and blobs; SELECT-only inspection of the Launch
catalog; rehearsal on the reviewer's own disposable local PostgreSQL 17 (socket-only, created and
destroyed inside the task).

**Not authorized by this packet:** any SQL execution that writes; any migration application to Launch or
Prototype; `apply_migration`; any change to `main`, PR #37, PR #41 or PR #51; marking any draft PR ready;
merge; deployment; publication; touching the professor's Prototype project or its database; exposing or
rotating credentials; removing the three-argument stub or the legacy read wrappers.

## 9. Required handoff format

One file, finite, ending with `Adam's next action(s):`. It must state, separately and explicitly:
requested / reported / statically reviewed / independently rerun / live-verified / committed / pushed /
merged / deployed. Every claim about Launch must say which engine and which ref it was observed on. Any
question answered "unknown" must say what would make it knowable.

## 10. Stop conditions

Stop and report instead of proceeding if: any fingerprint in §3 does not reproduce at the head you fetch;
S1 at the fetched head is not blob `70cb7871…`; S3 at PR #51 head is not blob `a04048e9…`; or the verdict
would require deciding a product question that belongs to Adam (capacity semantics, rollout timing,
stub removal).

---

## Paste-ready prompt for Adam

> Role 6 — finite, review-only assignment. Read `/home/ubuntu` project-shared file
> `ROLE6_S1_S3_CLIENT_COMBINED_EXACT_HEAD_REVIEW_PACKET_20261123.md` (CityLink project shared files) and
> follow it exactly. One verdict on the ordered sequence
> S1 blob `70cb7871494477d7204f41e28c19e0e546849e97` (747 lines, SHA-256 `75aee3a1…0362`) →
> F9 pin capture on the target's declared identity →
> S3 blob `a04048e90d6b64c692f03c722b9eea2849058aab` (1756 lines, SHA-256 `5cf0a66a…4887`) at PR #51 head
> `551da907305ca07e17e44903858cea1c5f2765f5` → `private.citylink_capacity_apply_gate()`, against client
> PR #37 head `344c1058e78fd2cccfde89574e226f3e65a1457c`, target `pijslbchvstkoweslymr`, engine 17.
> Answer questions (a)–(e) in §5 of the packet. Read-only plus your own disposable local PostgreSQL only:
> no writes to any database, no migration applied, no merge, no PR change, no deployment, no publication,
> do not touch the Prototype project. Deliver as a project-shared file and stop.
