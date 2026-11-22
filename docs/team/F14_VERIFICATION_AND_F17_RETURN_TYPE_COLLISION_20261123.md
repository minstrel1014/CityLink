# F14 verified at 551da90 — and the release blocker underneath it is now pinned

Coordinator verification, 2026-11-23 02:22. Everything below was re-derived from the remote and from read-only catalog queries against both projects, not taken from Role 6's handoff.

## 1. F14 itself checks out

Branch `feature/role6-capacity-successor-draft-20261122`, head **`551da907305ca07e17e44903858cea1c5f2765f5`**, one commit on `24ab8cb`, four files, all under `docs/capacity-successor/`. `git diff 24ab8cb..551da90 -- supabase` is **0 bytes**, the blob still hashes to `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`, and PR #51 stays draft on base `5537baa`.

The scope logic is inverted exactly as decided: `c_launch = 'pijslbchvstkoweslymr'`, `c_frozen = 'wkzclgmhrtecnpexfesr'`, the frozen ref tested at line 100 and drawing **45003** before any other gate is consulted, `v_target <> c_launch` drawing **45004** at line 111. The ref-bearing rule survives, 45001/45002 stay bare, and the header now states that a declared ref is operator-typed rather than proof of which database answered.

## 2. F16 is real, and Role 6 was right not to edit the expectation

`A-RPL-06` asserts `two-argument create_group_and_invite is gone` and passes only when `to_regprocedure('public.create_group_and_invite(uuid,uuid)')` is null. Read-only on CityLink Launch:

`create_group_and_invite(uuid,uuid)` → `TABLE(group_id uuid, invitation_id uuid)`

So the two-argument form **exists** on Launch, the row would FAIL there, and the expectation is Prototype-derived. Role 6 refused to edit an expectation to match a guess, which is the correct instinct: that is exactly the defect F13 was, pointing the other way. The fix is a target-relative expectation, not a lowered one — but which shape it takes is Adam's call.

## 3. F17 — the reviewed blob cannot be applied to CityLink Launch at all

This is the finding that matters more than the gate, and it is now pinned by evidence from both projects rather than described.

Read-only catalog, same query on both:

| Target                           | `list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` returns                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prototype `wkzclgmhrtecnpexfesr` | 14 columns — `post_id, group_id, group_name, **subject**, active_member_count, author_name, body, post_status, created_at, updated_at, closed_at, apply_enabled, can_manage, has_more` |
| Launch `pijslbchvstkoweslymr`    | 13 columns — the same list **without `subject`**                                                                                                                                       |

The reviewed blob redefines that function at `:1704` with `create or replace function … returns table (… subject text …)` — the 14-column shape — and the only `drop function` in the entire file is at `:245`, for `create_group_and_invite(uuid,uuid)`.

`create or replace function` cannot change a function's result type. On Launch the existing 13-column function therefore makes the blob abort with `cannot change return type of existing function` (SQLSTATE 42P13) at that statement, inside whatever transaction it runs in. The blob was authored as a delta against the **Prototype's** shape, not against Launch's.

This is not a gate problem and re-scoping the gate does not touch it. Adam's recorded release sequence — apply `20261118083000_stage6_people_page_naming.sql`, then the blob as reviewed — cannot execute on CityLink Launch as written.

Three options, none of which the coordinator may choose:

1. **A small, separately reviewed pre-blob reconciliation migration** that drops `public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` so the blob can recreate it in its 14-column form. Minimal and honest, but it changes the release sequence and needs fresh Role 6 review plus Adam's authorization naming it.
2. **A revised blob** that handles the shape change itself. Rejected on principle: Adam has kept the reviewed blob byte-identical through F13 and F4, and reopening it discards the review that produced `5cf0a66a…4887`.
3. **Rebuild Launch to the Prototype shape first.** Larger, and it makes the release depend on reproducing a frozen project's state — the opposite of what the freeze was for.

Option 1 is the smallest change that keeps the reviewed artifact intact, but it is a database change to Launch during the release window and is not authorised by anything recorded so far.

## 4. What is still blocking, in dependency order

1. **F17** — the blob cannot apply to Launch at all. Everything else is downstream of this.
2. **F9** — `P-H1-DIG`/`P-H2-DIG` read `UNPINNED`, so the gate refuses with 45007 by design. Producing a pin requires an authorised run against the target, which cannot honestly happen before the target's schema question in F17 is settled.
3. **F16** — `A-RPL-06` stops a Launch preflight on a Prototype-derived expectation.
4. **F14** — resolved in the instrument; not a blocker any more.

Nothing here authorises anything. No project was written to, no migration was applied, no row was read, and PR #51 remains a draft.
