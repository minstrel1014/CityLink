# Minimum release-QA checklist — two checks added 2026-11-23

Adam approved these two checks at 2026-11-23 00:40 on the coordinator's recommendation. Both are deliberately small: read-only wherever the schema allows it, executable with accounts that already exist, and needing no schema change, no new account and no capacity write. Recording them here is not evidence that they ran; they are executed at release on CityLink Launch, inside the one authorization that names the SQL head, the client rollout, the target ref and the QA window.

## QA-INV-EXP-01 — an expired invitation cannot be accepted

Purpose: prove that expiry is enforced by the server rather than by the interface.

Prerequisites: an existing authorized account that can send an invitation in a course where it holds the necessary role, plus one second authorized account as the recipient. Test-only disposable data.

Action: send an invitation, then move its `expires_at` into the past through the authorized path available at QA time (or wait out a short configured expiry if one is available). Sign in as the recipient and attempt to accept.

Expected: the acceptance is refused and no membership row is created. The invitation must not silently convert into a join.

Verification: re-read the invitation row and the membership table; the invitation shows an expired or otherwise non-acceptable state and the membership count is unchanged.

What it unblocks: the claim that expiry is a server-side contract, which the capacity work relies on when it says a full group blocks new invitations while pending ones stay pending.

## QA-INV-REM-02 — removing a member cancels their pending invitation

Purpose: prove that membership removal does not leave a live invitation that could re-admit the person, and that removal stays manual as the product contract requires.

Prerequisites: an existing group whose leader is an authorized QA account, and one member plus one invited non-member, all existing authorized accounts.

Action: with a pending invitation outstanding for the non-member, remove the member through the group-management path. Then check the outstanding invitation and attempt to accept it as the non-member.

Expected: the pending invitation is cancelled or otherwise no longer acceptable; acceptance is refused; no new membership row appears. No member is removed automatically by the capacity logic — removal remains a manual leader action.

Verification: read the invitation row and the membership table before and after; record both.

What it unblocks: confidence that the invitation lifecycle and the membership lifecycle cannot disagree, which matters more once a maximum exists and "full" becomes a reachable state.

## Boundary

Neither check requires a schema change, a migration, a new account or a capacity write. Neither is a substitute for the signed-in multi-account QA at release, and neither may be reported as passing without the observed values.
