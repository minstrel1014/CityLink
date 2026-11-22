# Dispatch packet — Role 6, F17 reconciliation + F16 target-relative row + F9 pin preparation

Prepared 2026-11-23 02:27 by the coordinator for Adam to send **manually** from the Role 6 task, so he can select the model profile himself. Not sent by the coordinator.

Target task: Role 6 continuity task `9KfXkHmMqAxUkRMsbpxEwA`.

---

Role 6 — finite assignment with three parts, all approved by Adam on 2026-11-23 02:25. One finite assignment; deliver one handoff, then stop. No polling, no scheduling, no redispatch.

## 0. Starting point and branch discipline

PR #41 head `65058a8077ad89f5796151e7eeb539ba7b616d0c` (the reviewed blob's branch). Verify with `git ls-remote` first and stop if it has moved.

Create a **new** branch `feature/role6-preblob-reconcile-20261123` from that head, and open a **new draft PR** whose base is `feature/role6-capacity-compatibility-migration-20261121`, so the PR diff is exactly your new files. Do **not** move PR #41's head, do **not** edit the blob, and do **not** rebase or force-push anything. The blob must still hash to SHA-256 `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887` at your head.

## 1. Part A — the F17 reconciliation migration (Adam approved option 1)

**Why.** The reviewed blob redefines `public.list_group_recruitment_posts(uuid,timestamptz,uuid,integer)` with `create or replace` at `:1704` in the Prototype's 14-column shape, including `subject`. CityLink Launch's existing function returns 13 columns without `subject`. PostgreSQL cannot change a result type, so on Launch the blob aborts with `cannot change return type of existing function` (42P13). Adam's recorded release sequence therefore cannot execute as written. The attached Launch catalog snapshot is the evidence.

**What to write.** One migration file that drops only `public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer)`, guarded so it is safe to re-run and so it does nothing if the object is already absent or already in the 14-column shape. It must not drop the `*_capacity` variants, must not touch any other object, and must carry a header comment stating: the 13-to-14 shape change, that the blob recreates the function immediately afterwards, that this file must be applied **before** the blob in the same release window, and that the RPC is absent for the window between the two statements.

**What to prove.** On a disposable PostgreSQL 17 at repository schema state, first **reproduce the failure**: with a 13-column function present, show the blob aborting with 42P13. Then apply your reconciliation file and the blob in order, and show the blob completing with exit 0. Archive the raw output of both runs. That before-and-after is the whole point; a passing run without the reproduced failure proves nothing.

**Also produce the complete matrix.** For all thirteen functions the blob creates or replaces, compare the blob's return type against the Launch snapshot and against the repository's own definitions, and report every mismatch you find, not only the one I named. If the matrix shows a second collision, say so plainly — that would change the size of the release problem.

## 2. Part B — make `A-RPL-06` target-relative (Adam's choice, 2026-11-23 02:25)

`A-RPL-06` currently asserts that the two-argument `create_group_and_invite(uuid,uuid)` is **absent**, which is true on the Prototype and false on Launch, where it exists and returns `TABLE(group_id uuid, invitation_id uuid)`. Adam chose "determine by the target's declared state" rather than lowering or deleting the row.

So: the row must judge against the state of the target it is actually running on, read from the declared ref and/or a recorded per-target pin, not against a value captured on the Prototype. Two hard requirements — it must still **FAIL** on a genuinely unexpected state, and it must not become a row that passes because it could not tell; when the target state is unknown the verdict is `UNPINNED` or `CAPTURE`, never `PASS`. `A-TRG-02`/`A-TRG-03` are the precedent for how to do this honestly. Say explicitly in the page and in the package document what each target is expected to show and why.

## 3. Part C — prepare the F9 pin, do not produce it

`P-H1-DIG` and `P-H2-DIG` read `UNPINNED`, so the gate refuses with 45007 by design and no application may be requested. Adam approved producing the pin **after** F17 is settled, not now.

Deliver a preparation only: exactly what a Launch run must capture to pin both helpers, the exact queries, the conditions under which a pin is valid, what invalidates it, and where the values are recorded. Do not run anything against any project, and do not present a local or Prototype-derived value as a Launch pin.

## 4. Boundaries

Local disposable PostgreSQL only. No Supabase project access of any kind — the Launch snapshot you need is attached, and if it is insufficient, say what is missing rather than reaching for a connector. No migration applied to any project, no signed-in QA, no merge, no ready transition, no deployment or publication. PR #41 untouched; the blob byte-identical.

## 5. Delivery

Send the handoff to coordinator task `HeZwm7CA7Y3rDtYBounkVC` with `manus-tasks.send_task_message`. If that fails again with `permission_denied: shared_task`, save the same report as a CityLink Project shared file named `ROLE6-F17-F16-F9-PREP-HANDOFF-2026-11-23.md` and say so.

Record: new branch and head SHAs (local and remote), the new draft PR number and state, every changed file, the reproduced 42P13 failure and the post-fix exit 0, the full return-type matrix, what Part B now asserts per target, what Part C prepared, what remains open, and the boundary.
