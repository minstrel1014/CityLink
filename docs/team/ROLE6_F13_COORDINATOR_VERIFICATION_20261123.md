# Role 6 F13 fix — coordinator verification at exact head

Verified 2026-11-23 01:49 by the coordinator against the remote, not against Role 6's description.

## Exact head and shape

Branch `feature/role6-capacity-successor-draft-20261122`, head **`24ab8cb3552285f7d5198f3b3bd8101ce1de634c`**, two commits on top of `7114b9611294460c59721c04183d099f37ef145c`: `d4c12c8` (fix the assertion, make verdicts ref-bearing) then `24ab8cb` (record the pin as measured). PR #51 keeps its base `5537baa` and stays draft; nothing was merged or marked ready.

Five files changed, all under `docs/capacity-successor/`: the package document, the preflight checklist, `01_track_a_capacity_prerequisites.sql` (+106), `90_apply_gate_wrapper_DRAFT.sql` (+35), and the preflight README. `git diff 7114b96..24ab8cb -- supabase` is **0 bytes**, and the blob at the new head still hashes to `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`. Client, server, `vite.config.ts`, `package.json` and the lockfile have zero delta. So the fix is confined to the instrument, which is exactly the boundary the assignment set.

## Does it do what Adam asked

`A-TRG-02` now reads `count=1 identity=<pin>` against observed `count=<n> identity=<...>`, and passes only when the count is exactly one **and** the observed identity equals the pin. That is the strengthening Adam directed, and it fails on both an addition (count 2) and a removal (count 0). A new `A-TRG-03` captures the whole attachment set as `CAPTURE`, so "unchanged across the apply" is discharged by capture-and-compare rather than inferred from a number — an honest solution to a stateless page, and it puts the comparison in the runbook where a reviewer can see it.

The wrapper now appends `target=<ref>` to every refusal from 45003 onward, and documents that 45001/45002 cannot carry a ref because the ref is by definition unknown in those two states. The token names and the 45001–45009 assignments are unchanged, so existing expectations still match. Role 6 also wrote down, in the file itself, that the ref is operator-declared and cannot be self-proved because `current_database()` is `postgres` on both projects — the same caveat I recorded at 01:37, now stated where it will be read.

## The one claim that needed checking

Commit `24ab8cb` records the pin "as measured on Test". Role 6's task has no Supabase connector, and its own record said no project was contacted, so I checked the basis rather than accepting the wording: Adam approved a **read-only, SELECT-only** dry run against `wkzclgmhrtecnpexfesr` on 2026-11-23 whose stated product was the G4 pinning record and the engine major version. A catalog-only trigger identity capture is the same read-only class, produces no row change and touches no application row, so it sits inside that approval rather than beside it. The measurement also matches, character for character, the identity I derived statically and the count I took read-only myself: one non-internal trigger, `invitations_enforce_invitation_integrity`… precisely `invitations_enforce_integrity;public.invitations;before;insert+update;row;origin`, with `public.invitations` at 1 of 7 and `public.group_invitations` at 0 of 6. That settles the F13 attribution question in favour of `supabase/schema.sql:354-357` and against my 00:16 wording, which the erratum already records.

What it still does not prove, and Role 6 says so itself: Main was not contacted, so this is not a pin against CityLink Launch; the pin proves attachment, not enforcement, so the capacity behaviour question remains signed-in QA territory; and a future divergence is a finding for Adam rather than a licence to lower the expectation again.

## What this does and does not unlock

It removes the false stop. It does not authorise anything: no migration was applied anywhere, no merge, no ready transition, no deployment. F14 is still open and is the next assignment — the gate's scope still points at the frozen Prototype, so it cannot yet authorise the apply that will actually happen on CityLink Launch.
