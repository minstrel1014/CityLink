以下提示可直接貼到 **CityLink 主協調任務 `HeZwm7CA7Y3rDtYBounkVC`**。它會把目前進度、1–8 階段授權、connector 要求和「不要因一般確認卡延遲而停工」的規則一次說清楚。

```text
Adam 授權 CityLink 主協調任務依照以下最新狀態和範圍繼續執行。請把這段視為我在主協調任務中的明確授權，不要因為一般性的 Project-file、非機密文件、owner dispatch 或 connector enablement confirmation card 延遲而停止；這些操作可以在授權範圍內直接繼續，並在結果中記錄。若平台仍強制顯示確認卡，請先繼續所有不依賴該卡的獨立工作，不要重複提交相同變更。

## Current exact state

Repository: `minstrel1014/CityLink`

- current `main`: `1a583e30c019733d1880d2614ca853481509fdad`
- PR #37 client integration: `344c1058e78fd2cccfde89574e226f3e65a1457c`
- PR #41 corrected docs head: `65058a8077ad89f5796151e7eeb539ba7b616d0c`
- PR #41 reviewed SQL blob: `a04048e90d6b64c692f03c722b9eea2849058aab`
- PR #41 SQL file SHA-256: `5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887`
- PR #48 evidence branch latest head: `a6eb75ffd734d5dce1c913dd0e572088033df4e0`
- PR #48 remains OPEN / draft / mergeable / clean
- PR #37 and PR #41 remain draft and must not be marked ready or merged.

The following owner assignments have already been dispatched:

- Role 6 `9KfXkHmMqAxUkRMsbpxEwA`, Standard: draft a forward-only successor capacity migration package.
- Roy `BZbzfvBk76tWP5HkPYqxXT`, Standard: implement stable F2 group-creation marker/cache deliverables.
- Jeffery `ApSaUuidbYenqPumovZxUc`, Lite: review the recruitment/post read path.
- Jeffery has now completed his finite review at exact head `344c1058e78fd2cccfde89574e226f3e65a1457c`; no Jeffery-owner code defect was found. Record his attached handoff as accepted evidence and stop his task.

## General authorization

I authorize the coordinator to continue the following finite, non-release work without asking me again for a separate verbal confirmation:

1. Read-only GitHub inspection and exact-head verification.
2. Local/static repository inspection.
3. Documentation and evidence updates in the assigned evidence branch.
4. Updating PR descriptions while preserving draft status.
5. Dispatching the already-defined finite owner assignments using the approved task profiles.
6. Enabling or re-enabling the required GitHub connector and using the authenticated GitHub connector for read-only inspection, branch pushes on explicitly assigned branches, and draft PR creation/update within CityLink scope.
7. Updating the CityLink Project ledger and environment evidence files. Project-file approval cards are not blockers; submit the changes once and continue. Do not claim the card has been applied until the host reports that it was applied.
8. Creating and attaching finite handoff packets and decision records to the relevant owner/coordinator tasks.

Do not create duplicate owner tasks, schedules, polling loops, unattended monitoring or automatic redispatch.

## Stage 1 — Evidence and decision reconciliation

Continue and complete the evidence reconciliation.

Record the following Adam decisions:

- `20261118050000_stage6_chat_recruitment.sql` is the authoritative origin of:
  - `private.can_browse_current_term_group(uuid)`;
  - `private.can_manage_recruitment_post(uuid)`.
- Do not add a helper-redefinition migration.
- A future target application must use per-target prerequisite assertions for signature, owner, `SECURITY DEFINER`, empty `search_path`, effective grants and normalized function body. A material mismatch must stop that target.
- The old Test-only Stage 6 document remains a dated earlier-phase record.
- The later Main application was historically authorized and reported by:
  - authorization commit `c3d65e40310a9282dc0ea020dc08d972915b6721`;
  - result commit `0fd6926be6796b6c1537de70d11bb3967ae1c561`;
  - remote branch `docs/people-page-decisions`;
  - branch tip `0772d7b03402c16f17d66eaf9a046ff2ab2525cb`;
  - Main ledger version `20261118080722`;
  - source migration commit `d667b6f`;
  - source SHA-256 `861f0042392a8142b8cfe19f9d9f768a2d1ef91ce4f2e359e26b816c1db6d87f`.
- These historical commits are not ancestors of current `main`; record that as a documentation gap, not as evidence of an unexplained out-of-band Main change.
- The earlier file-5 “must never be applied to Main” rule was superseded by Adam’s 2026-11-18 six-file Main authorization, including `stage5_course_group_invite_candidates`.
- Current Main changes remain prohibited without a new explicit Adam authorization.

## Stage 2 — F2 client rollout

Continue the stable F2 implementation work through Roy’s assigned branch only.

The following are authorized for static implementation and review:

- verifiable client/server build or version marker;
- stale-client detection;
- the already-approved exact group-creation message:

  `CityLink needs an update. Refresh before creating a group.`

- user-triggered browser refresh behavior;
- `index.html` no-store or equivalent non-persistent cache behavior where repository-controlled;
- versioned caching for hashed JS/CSS assets;
- tests for stale-client handling and marker behavior.

The following are prohibited:

- automatic reload;
- automatic retry;
- forced refresh;
- localStorage/sessionStorage draft preservation;
- automatic draft recovery;
- fallback group creation;
- changing the old three-argument stub;
- removing legacy read wrappers;
- using browser cache time as the version detector.

The second proactive message and browser-refresh wording were approved only as examples, not as final exact product strings. Do not implement a new proactive user-visible string until I provide one final exact mapping.

## Stage 3 — Successor migration design

Role 6 may draft a new forward-only successor migration package from the exact PR #41 documentation head:

`65058a8077ad89f5796151e7eeb539ba7b616d0c`

The draft must keep these tracks separate:

1. capacity schema/function DDL;
2. per-target prerequisite assertions;
3. helper posture assertions;
4. old three-argument fail-closed compatibility stub;
5. legacy read wrappers;
6. Test-only capacity objects;
7. Main row-8 remediation;
8. Main grant/security normalization;
9. migration-ledger identity repair.

Do not put all of these into one opaque migration. Do not redefine the Stage 6 private helpers. Do not modify the reviewed PR #41 SQL blob. The successor draft may be committed and pushed only on its assigned draft branch, with exact files and SHA recorded.

## Stage 4 — Fresh Role 6 review

After the successor draft exists, obtain a fresh exact-head Role 6 review covering:

- SQL structure and forward-only behavior;
- helper security posture;
- function owner and grants;
- legacy compatibility;
- old-client read shapes;
- transaction and concurrency behavior;
- Test/Main target prerequisites;
- migration-ledger handling.

The old PR #41 review must not be treated as automatically covering the successor head.

## Stage 5 — Test-only preflight

Test project:

- ref: `wkzclgmhrtecnpexfesr`
- name: `CityLink-Stage5-Test`

A future Test preflight is authorized only when the successor SQL and client/schema pair have passed the fresh review. The preflight must be immediately before any Test migration and must verify:

- exact Test target;
- current schema;
- function signatures;
- ownership;
- default and effective privileges;
- private schema posture;
- invitation trigger;
- migration ledger;
- helper posture;
- migration file hash;
- client/server compatibility.

A material mismatch stops the operation.

Do not broaden access to Main. Do not reset or delete Test. Do not read secrets or print credentials.

## Stage 6 — Test migration

Do not apply the Test migration yet.

Application requires all of the following first:

- fresh Role 6 review of the exact successor SQL head;
- compatible client/schema rollout review;
- immediately preceding exact Test preflight;
- a separate explicit Adam authorization naming the exact successor SQL head and Test target;
- forward-only execution;
- no reset, delete or TRUNCATE;
- catalog verification after application.

Passing static review or having broad Test authorization does not itself authorize this migration.

## Stage 7 — Signed-in multi-account QA

Do not perform signed-in capacity QA yet because Test currently has no capacity schema/functions or `max_members`.

After authorized Test migration and post-migration verification, Eunice task `Vf6CvKBQkfUjdqFWDs9JWX` is the QA owner. The future QA scope may include:

- group maximum 2–19;
- full-group invitation blocking;
- full-group application blocking;
- maximum-not-set behavior;
- narrow forming-creator exception;
- old-client fail-closed behavior;
- new four-argument creation;
- concurrent invitation/join races;
- pagination and Refresh queue behavior;
- auth-generation boundaries;
- portfolio invitation capacity precheck;
- actual server-side authorization.

Static/mock tests must not be reported as live Auth/RLS/concurrency QA.

## Stage 8 — Release review

Release review is not authorized yet.

Do not:

- merge PR #37, #41 or #48 into `main`;
- mark draft PRs ready;
- deploy;
- publish;
- change repository visibility or permissions;
- perform Main writes, Main migrations, Main grant changes or Main schema changes;
- remove the compatibility stub or legacy wrappers;
- claim release approval based on passing tests.

Before release can be considered, the coordinator must have exact evidence for owner handoffs, successor SQL review, compatible client/schema review, Test preflight, authorized Test migration, signed-in multi-account QA, cache/version behavior, old-client recovery and the separate seven-day observation window.

## Main security finding

Adam confirmed that no current live client uses Main. Keep Main’s broader RPC grants as a separate security-remediation finding, especially the observed anon EXECUTE grants on:

- `request_to_join_group`;
- `review_group_join_request`;
- `send_group_invitation`.

Do not mix this remediation into the capacity migration. Any Main security change requires a new explicit Adam authorization.

## Connector instruction

Use the official GitHub connector already enabled for this task. If it is not available, enable/ensure GitHub through the supported connector flow and continue non-GitHub local work while setup completes. Do not ask me for raw tokens, passwords, keys or cookies.

Do not enable a broad Supabase connector merely because it is available. For future live work, use only the exact disposable Test target and verify the target before each call. Main remains read-only inspection/verification only until a new explicit Adam authorization.

## Reporting requirement

Every owner handoff must be sent directly to coordinator task:

`HeZwm7CA7Y3rDtYBounkVC`

Each handoff must include:

- human role;
- task ID;
- branch, PR and exact SHA;
- changed files;
- exact validation commands, exit statuses, counts and warnings;
- authorization boundary;
- blockers and next action;
- distinction between reported, statically reviewed, independently rerun, live-verified, committed, pushed, merged and deployed.

Every response and handoff must end with:

`Adam's next action(s):`

Do not claim that any host confirmation card has been applied unless the host explicitly reports that it was applied. Routine non-secret coordination work should not be paused merely because such a card is pending.
```

這段提示已把「可以直接繼續的低風險工作」和「仍然必須等你另行明確授權的 Test/Main、QA、merge、deployment、publication」分開，避免把免確認要求誤解成全面放行高風險操作。
