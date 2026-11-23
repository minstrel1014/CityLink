# Role 6 review handoff for Roy — Stage 6 chat and recruitment proposal

**Date:** 2026-11-17
**Approver for the reviewer-authority decision:** Adam, Project/Integration Lead
**Status:** Review guidance only. This is not an executable migration or approval to change Test.

## Owner and assignment ledger

- **Roy:** retain the existing group creation, membership, invitation, and join-request owner/task. No replacement task or reassignment is requested.
- **Role 6:** base role remains Database, Security, and QA Owner. Human owner name remains **TBD** until supplied by the lead. This handoff adds shared Stage 6 migration/security review; it does not replace earlier Role 6 assignments.
- **Jeffery:** retain the existing Group Chat and Recruitment Posts owner/task. Client work stays on Jeffery's assigned branch.

## Files to review

1. Jeffery's current proposal in [PR #5](https://github.com/minstrel1014/CityLink/pull/5): `docs/stage6/CHAT_RECRUITMENT_MIGRATION_PROPOSAL.sql` and `docs/stage6/CHAT_RECRUITMENT_API_PROPOSAL.md`.
2. Role 6's companion proposal and decision handoff in the `qa/security-workflows` branch: `docs/proposals/CHAT_RECRUITMENT_MIGRATION_PROPOSAL_V2.sql` and `docs/proposals/STAGE6_DECISIONS_FOR_JEFFERY.md`.

These are proposal documents under `docs/`, not migration files. Compare them and call out any mismatch; do not assume they are identical or execute either one. One final, reviewed version must be chosen before it is moved to `supabase/migrations/`.

## Approved decisions Roy must preserve

On 2026-11-17, Adam selected **B** and reaffirmed that the **current active group leader** may review join requests. The current leader is identified by `public.study_groups.creator_id`; when approved leadership succession transfers `creator_id` to a new active leader, review authority transfers too. The former leader loses that authority. This is the current approved decision for the feature and supersedes the earlier original-founder-only wording.

Other related approved behavior:

- If a membership-ending event leaves **no active members**, the group becomes `abandoned`, its pending join requests become `cancelled`, and pending invitations become `expired`.
- A pending invitation and a pending join request for the same student and group must not coexist: preserve first-pending-action-wins and reject the later opposing action.
- “Apply to join” must call Roy's existing join-request service/RPC. It must not insert a request directly, create membership directly, or change Roy's approval process.

## Roy's database/security review checklist

Please review the actual SQL and answer each item with evidence (file/line, catalog definition, or test result):

1. **Reviewer enforcement:** Does the review RPC allow only the authenticated current `creator_id` who is still an active member? Can an ordinary active member review another student's request? Can the requester still read their own request/status without seeing other students' requests?
2. **Succession wiring:** When the current leader leaves or is removed, does the membership-end path set `creator_id` to the approved successor so the successor can review, and does the old leader immediately lose review rights? Check the RPC, RLS visibility, and triggers together—not the UI alone.
3. **Successor selection:** The decision record says to use the earliest-joined remaining active member. The Role 6 draft currently orders by `joined_at`, then also by `created_at` and membership `id`. That extra tie-break is not approved. If join timestamps can tie or the earliest member cannot be identified unambiguously, stop and ask Adam; do not treat the extra ordering as an approved product rule.
4. **No active members:** Does every relevant exit path—including the last member leaving an already archived group—make the group abandoned and cancel pending join requests? Pending invitations should expire. Verify that terminal-state changes also close open recruitment posts as specified.
5. **Existing Test mismatch:** Project records have not been fully consistent about the current Test review RPC/policy: earlier Role 6 metadata reported “any active member,” while a later decision note says the Test RPC uses `creator_id`. Before finalizing the migration, Role 6 and Roy must re-check the live Test function and RLS metadata, read-only, on **Test ref `wkzclgmhrtecnpexfesr` only**. Do not read student/profile rows, inspect Main, or infer the live behavior from a proposal or old report.
6. **First-action race safety:** Confirm invitation and join-request code uses appropriate locking/constraints so simultaneous opposite actions cannot both remain pending. Review the existing service/RPC and tests; don't create a duplicate Apply workflow.
7. **RPC-only permissions:** Check function ownership, `SECURITY DEFINER` search path, caller identity checks, `EXECUTE` grants, and direct table grants/policies. Public/anon/browser roles must not gain direct access to the new chat/post tables or private helpers. Do not broaden unrelated permissions.
8. **Current-term checks and relational constraints:** Confirm the course/enrolment joins demonstrate current-term eligibility, and that every proposed composite foreign key has the matching unique key. Verify needed indexes against Test catalog metadata before migration sign-off.
9. **Lifecycle state cases:** Verify `forming`, `active`, `archived`, and `abandoned` handling, including the last-member and leader-transfer cases, in the actual RPCs and triggers.

## What “exact migration” means

The proposal is a design draft. An **exact migration** is the one final SQL file to be reviewed and applied, saved under `supabase/migrations/` with a unique timestamped filename. It must contain the precise approved forward-only changes, have no placeholder/TODO behavior, and match the API contract the client will use. Any disagreement between the two proposal copies, any unresolved successor tie-break, or any unverified Test object is a blocker—not something to guess around.

## What a “Test-only execution plan” means

The execution plan is a written checklist for a later, separately approved change. It must name only disposable project ref `wkzclgmhrtecnpexfesr` and include:

1. Pre-flight confirmation of the exact target project/ref and current schema/function/grant snapshot (metadata only; no student rows).
2. The exact migration filename and checksum/commit to apply, the authorized operator/tool, and confirmation it is Test only.
3. Apply order and post-apply catalog verification, with expected schema, function, policy, trigger, and grant results.
4. Authenticated scenarios using at least two approved test students, plus unauthenticated, outsider, former-member, pending invitee/requester, current leader, former leader, and zero-member cases. State expected allowed **and denied** outcomes.
5. Stop conditions and safe recovery: stop on unexpected object/result; do not reset/delete Test; repair only by a new reviewed forward-only migration after approval.
6. A test-results record naming exact commands/queries, pass/fail output, and any known limitation.

Adam must separately approve the **specific migration file and this specific Test plan** before anyone applies it. Approval of product behavior or a PR is not permission to execute SQL. Never access Supabase Main or put any secret/service-role key in client code or chat.

## Return to the lead

Please reply in the shared review thread with: (a) approval or concrete changes requested; (b) each checklist result and evidence; (c) the successor-tie status; (d) any mismatch between the PR #5 proposal and Role 6's companion draft; and (e) the proposed exact migration and Test plan when ready. No database changes have been made by this handoff.
