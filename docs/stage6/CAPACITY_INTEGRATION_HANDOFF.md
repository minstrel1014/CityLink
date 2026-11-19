# Capacity client integration handoff — 2026-11-19

Status: **draft integration only; not release-ready, not merged, not published, and not authorized for Test/Main database changes.** Owner ledger is unchanged: Adam remains Project, Integration, and Release Lead; Adam-repair has the additive capacity-client/UI assignment; Roy, Jeffery, Role 6, and Eunice retain their existing roles.

## Inputs reconciled

| Input                                           | Exact branch head at integration start | Purpose                                                                                     |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| PR #36 `feature/adam-capacity-client`           | `87671a0`                              | Capacity client, session guards, full invite rosters, pagination locks                      |
| PR #33 `feature/adam-qa-ux-nov19`               | `6b886bf`                              | Mixed People list, viewer labels, received-invitation Accept, Back navigation, neutral copy |
| PR #31 `feature/coursemate-portfolio`           | `bc28cca`                              | Coursemate portfolio profile and profile-based invitation entry                             |
| Draft PR #34 `feature/group-capacity-migration` | `5537baa` at last check                | Draft SQL only; not applied by this branch                                                  |

Integration branch: `feature/capacity-integration-20261119-v2`, based on the updated PR #36 head and maintained in a separate checkout. No other task checkout was modified.

## Conflict resolutions

- **People page:** retained the QA mixed coursemate list (`CoursePeerList`) and viewer-specific Requested/current-group labels, while retaining capacity roster reads, fail-closed unknown states, full/unset/over-limit prechecks, request-bound dispatch guards, and refresh tokens.
- **Display name gate:** retained the capacity branch’s account-bound `needs-name`/`error`/ready logic and mounted tests, plus the QA `BackNavigationFrame` inside the gate.
- **My Group / My Groups:** retained capacity guidance and creation-time maximum language, current-leader wording, QA neutral recruitment-only copy, and guarded invitation/cancellation actions.
- **Workspace:** retained the capacity branch’s scoped workspace implementation, full capacity cards, serialized refresh, and Apply refresh. The browse-card chat branch gated on a discovery flag was removed; the separate authorized `Open Group Chat` link in My Group remains.
- **Coursemate profile:** used the portfolio layout from PR #31, then restored capacity/session behavior: auth-generation invalidation, pre-dispatch guards, and the shared create-group dialog with an explicit 2–19 maximum. The profile never creates a group through the old three-argument RPC.
- **TODO / handoffs:** both QA and capacity histories were retained; capacity implementation is marked draft, not applied or released.

## Verification

- `corepack pnpm check` — passed.
- `corepack pnpm test` — **37 files / 599 tests passed** after the PR #37 review fixes.
- `corepack pnpm build` — passed; 1,758 modules; existing `/api/platform/config.js` non-module warning and chunk-size warning remain non-blocking.
- Prettier on changed files and `git diff --check` — passed.

These are local/static checks. They do **not** establish live RLS behavior, real browser lifecycle, cached-client behavior, PostgREST count/filter behavior, multi-account behavior, or concurrent-last-place safety.

## PR #37 review dispositions (2026-11-20)

| Finding                                                                                            | Disposition on this branch                                                                                                                                                                                                                                                                                                                                         | Evidence / remaining gate                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| B1 — Invitations page not keyed/guarded by same-user auth generation                               | Fixed. The page key, load, retry, and accept guard now include `authGeneration`; acceptance receives the live `isCurrent` dispatch guard. Added pure identity helpers and a same-user-generation regression.                                                                                                                                                       | `invitationAcceptance.ts` / `.test.ts`, `AuthenticatedWorkspacePages.tsx`; mounted/live same-user re-login QA remains outstanding. |
| B2 — People/My Groups invite fail-open while roster is pending/unavailable                         | Fixed for People pending, failed, and unknown rosters: local action is blocked with retry text. My Groups now blocks unknown capacity for active groups and keeps the server-checked forming-creator path. The forming-creator local count of 1 remains per the earlier contract; the independent review asks whether it should instead be unknown/server-checked. | `AuthenticatedCoursePeers.tsx`, `GroupWorkflows.tsx`, capacity tests; **open decision on forming-creator count**.                  |
| B3 — Approved exact strings were decorated in the People precheck                                  | Fixed. The visible precheck now returns exactly `Group is full` and `Group maximum is not set`; explanation is rendered separately.                                                                                                                                                                                                                                | `inviteCapacityMessage` / `inviteCapacityGuidance` tests.                                                                          |
| B4 — Successful Apply can lose pending state if refresh fails; Apply busy omitted posts pagination | Partially fixed. A successful Apply adds a durable local pending marker, and Apply is busy while posts paginate. Refresh-overlap/“silently dropped refresh during Load more” remains a separate UX decision.                                                                                                                                                       | `withLocalPendingState` test, workspace test; **open refresh-overlap UX**.                                                         |
| B5 — Cutover proposal said five-argument `create_group_and_invite`                                 | Fixed to the actual four-argument capacity RPC.                                                                                                                                                                                                                                                                                                                    | `CAPACITY_CLIENT_SCHEMA_CUTOVER_PROPOSAL.md`.                                                                                      |
| Jeffery note — portfolio existing-group invite lacks a full-roster precheck                        | Not changed; the server remains authoritative. A future profile capacity precheck would need the same full-roster source and explicit UX decision.                                                                                                                                                                                                                 | Server-checked behavior only; no new API or RLS change.                                                                            |

These dispositions are implementation/QA decisions, not new product approval. The forming-creator count and refresh-overlap behavior require Adam’s explicit choice before release.

## Remaining release gates

1. Independent review of the exact integration head (this draft PR), including the profile/portfolio merge and the capacity creation dialog.
2. Fresh exact-head review of draft PR #34; no SQL is approved or applied by this document.
3. Agree the client/schema cutover and cached-client recovery plan in `docs/team/CAPACITY_CLIENT_SCHEMA_CUTOVER_PROPOSAL.md`.
4. Separate Test-only authorization before applying any migration or creating QA records.
5. Signed-in multi-account Test QA: full group, unset maximum, over-19 group, invitation, pending invitation/request, Apply, manual removal, re-invitation, and concurrent last-place attempts.
6. No merge to `main`, publish, Main access, Test reset, or database change is authorized by this handoff.
