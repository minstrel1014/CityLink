# Capacity client/schema cutover and cached-client recovery — Option A direction

Status: **implementation direction approved by Adam on 2026-11-21; not migration-ready.** The compatibility approach and contract names are approved, but the exact SQL/client heads still require joint review. No SQL execution, Test/Main change, merge, publish, deployment, release, or signed-in QA is authorized. Owner: Adam (lead); implementation owners: Adam-repair (client), Roy (group workflows), Role 6 (database/security review), Eunice (QA/docs). This proposal does not replace existing role tasks.

## Approved Option A direction and withheld gates

Adam approved Role 6 PR #41's compatibility direction on 2026-11-21: keep the old three-argument `create_group_and_invite` as a fail-closed compatibility stub that raises `group_capacity_upgrade_required` with SQLSTATE `45000`; use the four-argument create contract for capacity-aware clients; preserve released legacy read shapes; and expose capacity data through the separately named `list_course_group_summaries_capacity`, `list_current_term_course_groups_capacity`, and `list_group_recruitment_posts_capacity` contracts. The seven intentional legacy value deltas remain part of the approved contract and are recorded in `docs/team/DECISIONS.md` and the Role 6 contract.

This approval is an implementation direction only. The exact Role 6 SQL head and paired client heads must be reviewed together before any Test preflight. The unresolved preflight dependencies `private.can_browse_current_term_group`, `private.can_manage_recruitment_post`, function ownership, effective/default grantees and the `service_role` grant uncertainty remain blockers. No migration readiness is claimed.

## The compatibility problem

The capacity client calls a new four-argument `create_group_and_invite` and the separately named capacity read RPCs. Option A preserves the old three-argument creation signature as a fail-closed compatibility stub, so an old client cannot bypass the hard maximum while receiving a stable upgrade-required signal. It also preserves the released legacy read shapes while intentional legacy value deltas are introduced:

1. **Old client + new schema:** the old client reaches the compatibility stub, which aborts with `group_capacity_upgrade_required` / SQLSTATE `45000`; it creates nothing and cannot bypass capacity. The stale-client user-facing message remains open.
2. **New client + old schema:** the capacity-aware client calls explicitly named contracts that do not exist yet. This must not be released before the exact reviewed schema is ready.

There is no zero-downtime order that makes both old and new clients fully functional while also enforcing the new maximum. The cutover therefore needs a short, announced Test-only maintenance window and a deliberate stale-client recovery path.

## Recommended sequence (Test only)

1. **Freeze and review.** Merge the reviewed client and migration PRs only after the lead’s separate approval. Confirm the exact client head, exact migration head, and reviewed SQL are the same artifacts that will be used.
2. **Preflight and backup.** Take a verified logical backup/snapshot reference of disposable Test (`wkzclgmhrtecnpexfesr`). Record the migration history and preflight counts. Do not reset or delete Test. Confirm no unapproved data writes are in progress.
3. **Apply a compatibility migration first, only after the withheld gates are approved.** Add the new capacity column, helper functions, four-argument creation RPC, capacity-aware read contracts and legacy wrappers. Keep the old three-argument RPC as the approved fail-closed stub that raises `group_capacity_upgrade_required` with SQLSTATE `45000`. This prevents old clients from bypassing the maximum while giving the client a machine-readable recovery signal instead of a generic missing-function error.
4. **Publish the new client immediately after the migration passes verification.** Use a versioned static build, clear the host/CDN cache for `index.html`, and verify the public bundle hash. The new client must be the only client allowed to create or admit members.
5. **Keep the stub for the agreed cache window.** During that window, an old cached tab shows “CityLink has been updated. Refresh the page before creating or joining a group.” Do not remove the stub until QA and the lead agree the cache window is over.
6. **Cleanup migration.** After the cache window, drop the old three-argument overload and the stub. Record the cleanup migration, verification output, and remaining risks.
7. **Rollback decision.** If the new client or schema fails verification, stop and report. Do not improvise a reverse migration. Restore the verified Test snapshot only with explicit lead approval, then redeploy the previously reviewed client. The old RPC stub is not a capacity bypass and must not be re-enabled as an emergency workaround.

## Cached-client recovery requirements

- Serve `index.html` with no-store/no-cache headers and a build-version marker; never let a browser keep an old shell indefinitely.
- Add a visible version check in the app that detects a build/schema mismatch and offers **Refresh CityLink** rather than silently retrying a missing RPC.
- Map the stub’s `group_capacity_upgrade_required` error to the approved message; do not show raw PostgREST text.
- Preserve unsaved drafts only when safe. A schema-mismatch reload should warn before discarding a recruitment draft or profile form.
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

1. Confirm the stale-client user-facing message; the machine-readable compatibility signal and refresh/recovery direction are approved, but the final wording remains open.
2. Choose the cache window length and who declares it over.
3. Confirm the exact Test QA accounts and whether Eunice or Adam-repair owns the signed-in multi-account run.
4. Confirm whether a draft-preservation warning is required when recovery reloads a schema-mismatched client.
5. Complete joint review of the exact SQL/client heads, then separately authorize any exact Test-only preflight or migration. The implementation direction is approved, but this gate is not complete.

Until these are answered and the exact review/authorization gates are complete, this remains a non-ready implementation direction. Do not apply SQL, change RLS/grants, reset Test, touch Main, merge, deploy, publish, or perform signed-in QA.
