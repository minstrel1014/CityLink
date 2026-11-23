# Capacity client/schema cutover and cached-client recovery — Option A direction

Status: **implementation direction approved by Adam on 2026-11-21; not migration-ready.** The compatibility approach and contract names are approved, but the exact SQL/client heads still require joint review. No SQL execution, Test/Main change, merge, publish, deployment or release is authorized by this proposal; signed-in and multi-account Test QA is separately authorized only within Adam's 2026-11-22 boundaries and remains unperformed here. Owner: Adam (lead); implementation owners: Adam-repair (client), Roy (group workflows), Role 6 (database/security review), Eunice (QA/docs). This proposal does not replace existing role tasks.

## Approved Option A direction and withheld gates

Adam approved Role 6 PR #41's compatibility direction on 2026-11-21: keep the old three-argument `create_group_and_invite` as a fail-closed compatibility stub that raises `group_capacity_upgrade_required` with SQLSTATE `45000`; use the four-argument create contract for capacity-aware clients; preserve released legacy read shapes; and expose capacity data through the separately named `list_course_group_summaries_capacity`, `list_current_term_course_groups_capacity`, and `list_group_recruitment_posts_capacity` contracts. The seven intentional legacy value deltas remain part of the approved contract and are recorded in `docs/team/DECISIONS.md` and the Role 6 contract.

This approval is an implementation direction only. The exact Role 6 SQL head and paired client heads must be reviewed together before any Test preflight. The unresolved preflight dependencies `private.can_browse_current_term_group`, `private.can_manage_recruitment_post`, function ownership, effective/default grantees and the `service_role` grant uncertainty remain blockers. No migration readiness is claimed.

## The compatibility problem

The capacity client calls a new four-argument `create_group_and_invite` and the separately named capacity read RPCs. Option A preserves the old three-argument creation signature as a fail-closed compatibility stub, so an old client cannot bypass the hard maximum while receiving a stable upgrade-required signal. It also preserves the released legacy read shapes while intentional legacy value deltas are introduced:

1. **Old client + new schema:** the old client reaches the compatibility stub, which aborts with `group_capacity_upgrade_required` / SQLSTATE `45000`; it creates nothing and cannot bypass capacity. In the relevant group-creation flow, the approved user-facing message is exactly **“CityLink needs an update. Refresh before creating a group.”** Whether a separate proactive version-mismatch notice is needed, and where it should appear, remains open; no proactive wording is decided here.
2. **New client + old schema:** the capacity-aware client calls explicitly named contracts that do not exist yet. This must not be released before the exact reviewed schema is ready.

There is no zero-downtime order that makes both old and new clients fully functional while also enforcing the new maximum. The cutover therefore needs a short, announced Test-only maintenance window and a deliberate stale-client recovery path.

## Recommended sequence (Test only)

1. **Freeze and review.** Merge the reviewed client and migration PRs only after the lead’s separate approval. Confirm the exact client head, exact migration head, and reviewed SQL are the same artifacts that will be used.
2. **Preflight and backup.** Take a verified logical backup/snapshot reference of disposable Test (`wkzclgmhrtecnpexfesr`). Record the migration history and preflight counts. Do not reset or delete Test. Confirm no unapproved data writes are in progress.
3. **Apply a compatibility migration first, only after the withheld gates are approved.** Add the new capacity column, helper functions, four-argument creation RPC, capacity-aware read contracts and legacy wrappers. Keep the old three-argument RPC as the approved fail-closed stub that raises `group_capacity_upgrade_required` with SQLSTATE `45000`. This prevents old clients from bypassing the maximum while giving the client a machine-readable recovery signal instead of a generic missing-function error.
4. **Publish the new client immediately after the migration passes verification.** Use a versioned static build, clear the host/CDN cache for `index.html`, and verify the public bundle hash. The new client must be the only client allowed to create or admit members.
5. **Keep the stub for the agreed cache window.** During that window, an old cached tab that calls the legacy three-argument create path shows “CityLink needs an update. Refresh before creating a group.” and is offered only a user-triggered refresh path; no automatic reload, automatic retry or forced refresh is authorized. Only the create path is stubbed; invitations, acceptance, join requests, review and removal keep their released signatures and capacity checks. Cache-window length and who declares it over remain open, and expiry alone never authorizes cleanup.
6. **Cleanup migration.** Consider removal only after all of the following are recorded: (1) new client integration is complete; (2) PR #37 and the client/schema rollout review are complete; (3) Role 6 has reviewed the current successor client/SQL head pair; (4) exact-head Test preflight is clean; (5) Adam-authorized Test QA, including relevant signed-in and multi-account scenarios, is complete; (6) cached-client recovery is implemented, reviewed and evidenced; (7) evidence shows old clients no longer need the fail-closed three-argument compatibility stub or legacy read wrappers; and (8) removal of the stub and removal of the legacy read wrappers are considered separately, with a new explicit Adam approval for each. Record the cleanup migration, verification output, and remaining risks. Do not remove either compatibility layer merely because a cache window expires.
7. **Rollback decision.** If the new client or schema fails verification, stop and report. Do not improvise a reverse migration. Restore the verified Test snapshot only with explicit lead approval, then redeploy the previously reviewed client. The old RPC stub is not a capacity bypass and must not be re-enabled as an emergency workaround.

## Cached-client recovery requirements

- Deliver a verifiable front-end/server build/version marker, subject to host and configuration evidence; this is a required deliverable, not a claim about the current implementation.
- Deliver a visible mismatch-recovery path that leads to a user-triggered refresh rather than silently retrying a missing RPC. Whether **Refresh** is an in-app button or an instruction to reload the browser remains an open Adam product choice; no automatic reload, automatic retry or forced refresh is authorized.
- Map the stub’s `group_capacity_upgrade_required` error to the approved message; do not show raw PostgREST text.
- An unsaved group-creation draft may be lost on manual refresh; no localStorage, sessionStorage or other preservation/recovery, and no automatic reload or retry, is authorized. Whether a manual-refresh warning should proactively mention draft loss remains open. (Adam's decision, 2026-11-21 20:45.)
- Deliver `index.html` no-store/no-cache or equivalent non-persistent shell caching, subject to host/configuration evidence; hashed JS/CSS may use versioned caching. This is not a claim that current Vite/Express behavior already satisfies it.
- Add a static-host fallback page/script only if it can be reviewed and does not expose environment configuration or secrets.
- Record the deployed client bundle hash, deployment time, and Test migration versions in the release receipt.

## Verification checklist

| Check                            | Expected result                                                               |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Pre-migration Test backup        | Verified reference recorded; no reset                                         |
| Migration history and preflight  | Exact reviewed versions; no unexpected objects                                |
| New client + new schema          | Create group with maximum, invite, Accept, Apply, removal, re-invite all work |
| Old client + compatibility stub  | Clear refresh message; no membership or capacity bypass                       |
| Full group                       | Invite/Apply/approval blocked with “Group is full”                            |
| Unset maximum                    | Additions blocked with “Group maximum is not set”                             |
| Over-19 group                    | No valid maximum or additions until size drops                                |
| Concurrent last place            | Exactly one admission; stale action returns a conflict and refreshes          |
| Cached client after cache window | Loads new bundle or shows the refresh path; no silent failure                 |
| Main                             | Not touched; any future Main action needs a new, scoped Adam authorization    |

## Open rollout decisions and gates for Adam

1. Decide whether a separate proactive version-mismatch notice is needed and where it should appear; the create-path message **“CityLink needs an update. Refresh before creating a group.”** is already approved, and no separate proactive wording is supplied here.
2. Choose the cache window length and who declares it over; expiry alone never authorizes cleanup.
3. Confirm the exact Test QA accounts and whether Eunice or Adam-repair owns the signed-in multi-account run.
4. Decide whether a manual-refresh warning should proactively mention that an unsaved group-creation draft may be lost. Draft preservation/recovery itself is not open and is not authorized.
5. Complete joint review of the exact SQL/client heads, then separately authorize any exact Test-only preflight or migration. The implementation direction is approved, but this gate is not complete.

Until these are answered and the exact review/authorization gates are complete, this remains a non-ready implementation direction. Do not apply SQL, change RLS/grants, reset Test, touch Main, merge, deploy or publish. Any Test QA must follow Adam's separately recorded 2026-11-22 authorization boundaries and exact target/evidence requirements.
