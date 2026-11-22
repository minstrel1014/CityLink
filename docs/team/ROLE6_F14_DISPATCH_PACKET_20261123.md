# Dispatch packet — Role 6, F14 Launch-scoped gate

Prepared by the coordinator 2026-11-23 01:50 for Adam to send **manually** from the Role 6 task, so he can set the task's model to Manus Flex himself. The coordinator has not sent it and will not.

Target task: Role 6 continuity task `9KfXkHmMqAxUkRMsbpxEwA`.
Suggested profile: whatever Adam selects manually (Flex or Standard). The work is a bounded single-file scope change plus one evidence run, so it does not need Max.

---

Role 6 (database security & migration review) — finite assignment: re-scope the capacity apply gate to CityLink Launch, and refuse the frozen Prototype.

Adam decided F14 on 2026-11-23 00:53: the gate becomes a CityLink Launch-scoped wrapper rather than being replaced by a manual runbook. One finite assignment; deliver one handoff, then stop. No polling, no scheduling, no redispatch.

## 1. Starting point

Branch `feature/role6-capacity-successor-draft-20261122`, head `24ab8cb3552285f7d5198f3b3bd8101ce1de634c` (your own F13 fix), PR #51 OPEN, draft, base `5537baa`. Verify with `git ls-remote` before touching anything and stop if it has moved. Own worktree only; never switch another checkout. Push fast-forward to the same branch; no rebase, amend, force-push or new PR; PR #51 stays draft.

## 2. What to change

- The authorised target becomes `pijslbchvstkoweslymr` (CityLink Launch). Declaring it must pass the scope check and proceed to the remaining gates.
- `wkzclgmhrtecnpexfesr` (CityLink Prototype, frozen, do not migrate) becomes explicitly out of scope and must be refused with the out-of-scope refusal (`45003`), not the generic unauthorized refusal. This is the exact inversion of today's behaviour and the point of the change.
- Keep all nine refusal assignments 45001–45009 and keep them mutually distinguishable. Keep the ref appended to every refusal from 45003 onward, and to the success token, as you already do.
- Do not touch `supabase/` at all. The reviewed blob must stay byte-identical at SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`. No client, server, `vite.config.ts`, `package.json` or lockfile change.
- Pages must not assume the Prototype anywhere. If a page hard-codes a ref expectation, fix it to be target-agnostic or to read the declared ref.

## 3. What you must state plainly in the instrument

- The ref is operator-declared and is not proof of which database answered, because `current_database()` is `postgres` on both Supabase projects. Pair any token with the archived page 00 rows `C-MRK-13`, `C-DB-03`, `C-USR-04` under the same run id.
- Re-scoping the gate does not make the apply safe, legal or authorised. It only means the gate can express the target that Adam's release decision names.
- The Prototype must remain untouched by any action this gate authorises.

## 4. Evidence bar

Build or reuse a disposable local PostgreSQL 17, bring it to repository schema state, install the wrapper and call it with each declared ref in turn, archiving the raw output: Launch declared, Prototype declared, an arbitrary ref declared, and the marker-missing cases. Record the exact message each call returned. A local run declaring Launch is a logic-path test of the scope branch, **not** a claim about the real CityLink Launch project — say so explicitly, and do not present any local token as evidence about that project.

If you can also show that the remaining gates still fire after the scope check passes (pages incomplete, verdict unsatisfied, pin unrecorded, engine unconfirmed, artifact unverified), do so; that ordering is what makes the gate meaningful.

## 5. Delivery

Send the handoff to coordinator task `HeZwm7CA7Y3rDtYBounkVC` with `manus-tasks.send_task_message`. If that is rejected with `permission_denied: shared_task`, save the same report as a CityLink Project shared file named `ROLE6-F14-LAUNCH-SCOPED-GATE-HANDOFF-2026-11-23.md` and say so.

Record: exact base and new SHAs (local and remote), branch, PR #51 state after push, every changed file, the real commands and exit statuses, the token each declared ref produced, what F14 now does and does not establish, what remains open, and the authorization boundary. No Supabase project write, no migration on any project, no signed-in QA, no merge, no ready transition, no deployment or publication.
