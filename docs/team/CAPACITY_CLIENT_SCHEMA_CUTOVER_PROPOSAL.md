# Capacity client/schema cutover and cached-client recovery — proposal

Status: **proposal only.** No SQL execution, Test/Main change, merge, publish, or release is authorized. Owner: Adam (lead); implementation owners: Adam-repair (client), Roy (group workflows), Role 6 (database/security review), Eunice (QA/docs). This proposal does not replace existing role tasks.

## The compatibility problem

The capacity client calls a new five-argument `create_group_and_invite` and expects capacity fields from the read RPCs. The draft migration removes the old three-argument creation function so an old client cannot bypass the hard maximum. That creates two unavoidable windows:

1. **Old client + new schema:** the old client calls a missing RPC, so group creation fails. This is safer than silently bypassing capacity, but the user needs a clear recovery message.
2. **New client + old schema:** the new client calls a function that does not exist yet. This must not be released before the schema is ready.

There is no zero-downtime order that makes both old and new clients fully functional while also enforcing the new maximum. The cutover therefore needs a short, announced Test-only maintenance window and a deliberate stale-client recovery path.

## Recommended sequence (Test only)

1. **Freeze and review.** Merge the reviewed client and migration PRs only after the lead’s separate approval. Confirm the exact client head, exact migration head, and reviewed SQL are the same artifacts that will be used.
2. **Preflight and backup.** Take a verified logical backup/snapshot reference of disposable Test (`wkzclgmhrtecnpexfesr`). Record the migration history and preflight counts. Do not reset or delete Test. Confirm no unapproved data writes are in progress.
3. **Apply a compatibility migration first.** Add the new capacity column, helper functions, five-argument creation RPC, and updated read RPCs. Keep the old three-argument RPC temporarily, but replace its body with a fail-closed stub that raises a clear `group_capacity_upgrade_required` message. This prevents old clients from bypassing the maximum while giving them a recognizable failure instead of a generic missing-function error.
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

## Open decisions for Adam

1. Approve the compatibility-stub approach versus a stricter maintenance window with no old-client compatibility at all.
2. Choose the cache window length and who declares it over.
3. Confirm the exact Test QA accounts and whether Eunice or Adam-repair owns the signed-in multi-account run.
4. Confirm the approved message for stale clients and whether a draft-preservation warning is required.
5. Confirm that no capacity migration is applied until the client and SQL exact heads are reviewed together.

Until these are answered, this remains a proposal. Do not apply SQL, change RLS/grants, reset Test, touch Main, merge, or publish.
