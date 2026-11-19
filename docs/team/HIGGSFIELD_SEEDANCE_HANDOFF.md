# Higgsfield Seedance 2.5 server-side example

## Assignment ledger

- **Human owner:** TBD; the lead has not assigned a contributor to this task.
- **Base role:** TBD; no existing role has been supplied for this task. Preserve any previously assigned role when the lead supplies it.
- **Added feature:** Higgsfield Seedance 2.5 server-side example and its tests and documentation. No earlier assignment or handoff has been replaced.
- **Handoff:** Project/integration lead to review the feature branch and assign an owner if this example is to become part of a CityLink product feature.

## Scope and decisions

On 2026-11-19, Adam requested a standalone TypeScript SDK example. It does not add a UI, public endpoint, database table, or product workflow. No Supabase project was accessed or changed. Future product behavior, access permissions, costs, retention and any database/API design remain subject to the usual CityLink lead decisions and reviews.

The GitHub `main` baseline was `1a583e30c019733d1880d2614ca853481509fdad`. Work is on `feature/higgsfield-seedance-example`, in a separate checkout from the Public Demo. Git tracks local changes and commits; GitHub hosts the remote branch and pull request for team review. Do not push directly to `main` or merge without lead approval.

## Model and API contract

The example uses the official server-only `@higgsfield/client/v2` SDK and its `subscribe` method with model `bytedance/seedance-2.5/text-to-video`. It submits exactly `prompt: "A cinematic scene at sunset"`, `duration: 5`, `resolution: "720p"`, and `aspect_ratio: "16:9"`. Omitted optional fields use Higgsfield's defaults; the model reference lists MP4 and audio enabled as defaults. A successful completed response must include an HTTPS `video.url`.

The SDK version used here, `0.2.6`, does not stop its automatic poller on the API's documented `canceled` terminal status. The example submits through `subscribe` with `withPolling: false`, then polls the returned status URL itself, with backoff and a 15-minute timeout. It handles `completed`, `failed`, `canceled`, and moderation (`nsfw`) without labeling failures as success. It only sends credentials to the expected HTTPS Higgsfield status host and refuses redirects. No raw API/SDK errors or secret values are printed. Status GETs may be retried, but generation submissions are not automatically retried. A non-secret idempotency key is displayed for each generation intent so an ambiguous submission can be retried without intentionally creating a second generation.

Sources: [official SDK guide](https://docs.higgsfield.ai/docs/how-to/sdk), [Seedance 2.5 model reference](https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference), [request lifecycle](https://docs.higgsfield.ai/docs/concepts/requests), [polling](https://docs.higgsfield.ai/docs/concepts/polling), [idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency), and [SDK 0.2.6 polling implementation](https://github.com/higgsfield-ai/higgsfield-js/blob/e3f274249962417e21f6566d4eecec6d8491d11c/src/v2/client.ts).

## Local setup for a contributor

1. **Check out the reviewed feature branch.** In a terminal in your own CityLink checkout, run `git status --short --branch` and confirm there are no changes you need to keep elsewhere. Run `git fetch origin` to update your knowledge of GitHub, then `git switch feature/higgsfield-seedance-example`. If Git reports that the branch does not yet exist locally, run `git switch --track origin/feature/higgsfield-seedance-example` instead. Do not switch branches over uncommitted work or share a checkout that another contributor is editing.
2. **Install dependencies.** Run `pnpm install --frozen-lockfile` from the repository root. This uses the project's pinned pnpm version and checked-in lockfile. A successful installation exits with code 0.
3. **Add the credential locally.** Open or create `.env.local` in a local text editor. Add one line named `HF_CREDENTIALS`, with your actual Higgsfield key ID and key secret separated by a colon: `HF_CREDENTIALS=your-key-id:your-key-secret`. Replace both placeholder parts yourself; do not paste the real line into chat, terminal commands, screenshots, source code, or a pull request. Save the file. Verify that Git ignores it with `git check-ignore -v .env.local`; the output should point to `.gitignore`. Never add this credential to a browser-side `VITE_` variable. The script also accepts an already-provided server environment variable; an existing environment variable takes precedence over `.env.local`.
4. **Run the non-billable checks first.** Run `pnpm check`, `pnpm test`, and `pnpm exec prettier --check server/examples/seedance docs/team/HIGGSFIELD_SEEDANCE_HANDOFF.md package.json`. A zero exit code means the relevant check passed. A failure means stop and read the error before proceeding; tests use mocks and do not create a video. Run `pnpm build` to check the full build.
5. **Run one billable generation only when authorized.** Run `pnpm seedance:example` from the repository root. It prints the non-secret idempotency key and request ID, if accepted, to standard error, waits for a terminal state, and prints only the generated HTTPS video URL on standard output. A nonzero exit or a timeout is not success. Output links can expire; copy media to approved storage if it must be retained.

If the submission or status times out, do not immediately create a fresh generation. Check the request ID in the Higgsfield account first. To retry the **same** unchanged generation intent, run `SEEDANCE_IDEMPOTENCY_KEY=the-previously-printed-idempotency-key pnpm seedance:example`. The idempotency key is not the API credential. Reusing it with the same request asks Higgsfield to return the original request rather than creating another. For an intentionally new generation, omit that variable so a new key is created; this may be billable again. Check account pricing and balance before running.

## Files and verification

- `package.json`, `pnpm-lock.yaml`: add and pin the official client and add the example command; existing `dotenv` is reused.
- `server/examples/seedance/index.ts`: server-only SDK submission, safe status polling and terminal handling.
- `server/examples/seedance/index.test.ts`: mocked tests; they do not call Higgsfield or incur generation charges.
- `.env.local`: ignored local-only credential placeholder, not committed; the user supplies the real value privately.
- This handoff: owner ledger, instructions, contracts, checks and current blockers.

Verification results and remaining blockers are recorded below after checks are run.

### 2026-11-19 verification results

- `pnpm add @higgsfield/client@0.2.6`: passed; `pnpm ignored-builds` reported `None`. pnpm reported the existing `@builder.io/vite-plugin-jsx-loc` peer dependency expects Vite 4 or 5 while this project uses Vite 7.
- `pnpm check`: passed, exit 0.
- `pnpm test`: passed, exit 0; 14 test files and 108 tests, including 9 mocked Seedance tests. Existing platform tests printed an OAuth configuration warning and an expected missing-fields diagnostic.
- `pnpm build`: passed, exit 0. Vite warned about the non-module platform config script and a chunk larger than 500 kB.
- `pnpm exec prettier --check server/examples/seedance docs/team/HIGGSFIELD_SEEDANCE_HANDOFF.md package.json`: passed, exit 0, including after the results were documented.
- `git check-ignore -v .env.local`: passed; `.gitignore` line 12 ignores it. The sandbox placeholder has owner-only file permissions and contains no credential.
- `pnpm seedance:example` with all Higgsfield credential variables absent: stopped with `Set HF_CREDENTIALS ...` and exit 1 before submission. No generation was submitted, and no video URL was returned. Live authentication, model access, billing, completion and output are **not verified**.

**Next step:** Adam must choose how to supply the credential privately. If it stays only on Adam's computer, follow the local setup steps and run the billable example there; the cloud task cannot independently verify that run. If Adam authorizes a protected cloud input instead, run the example once with the supplied server-side credential and record the actual terminal result and URL before claiming success. The protected-input option stores a project environment secret and is not the same as filling a local `.env.local` file. Do not put the real credential in this handoff, a test fixture, Git, logs, or chat.

## 2026-11-19 — Scope clarification from Adam

**Status:** The earlier integration proposal is superseded; do not merge it into CityLink. Adam clarified that the goal is to generate a demo advertising video, not to add a Higgsfield function to the app. This record captures the scope clarification, not a decision to deploy software.

**Human approver:** Adam, CityLink project owner and integration lead.

**Roles affected:** Project/integration lead; the human owner of this example remains TBD. No existing role or feature assignment is replaced.

**Data/API implications:** Do not add the SDK, example command, Higgsfield credential, or an API endpoint to the application or its production configuration for this request. The earlier example exists only on its unmerged feature branch. No Supabase access or changes were made. No Higgsfield generation was submitted. The previously proposed protected input would store a project-level secret, so do not open it for this standalone video without reconfirming that storage choice.

**Open questions and next step:** Adam has not specified the content or format of the ad, or chosen between a standalone Higgsfield API request and the built-in Manus video tool after learning the billing distinction. Clarify those details before starting a billable generation. The earlier generic sunset test prompt is not an approved CityLink ad brief.
