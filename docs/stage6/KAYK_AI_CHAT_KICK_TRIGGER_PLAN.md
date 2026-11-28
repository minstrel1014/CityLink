# Group AI chat — one-shot kick: implementation plan

Adam, 2026-11-25 13:08. Scope, restated in his words: after `begin_group_ai_request`
succeeds, a backend event triggers `group-ai-executor` immediately, once, best-effort.
No pg_cron. No per-minute sweep, no polling, no automatic retry. A failed trigger must
not roll back the request. No service-role or xAI key in the browser. Keep the executor's
claim/finish gates and do not widen table read grants.

Status: **designed, written, tested locally. Nothing applied to Launch.**

## What exists at this head

| Thing | State |
| --- | --- |
| `group-ai-executor` | deployed, version 6, `verify_jwt = true`, refuses any caller whose `role` claim is not `service_role` |
| `begin_group_ai_request` | inserts one row into `public.group_ai_requests` with `status = 'queued'` |
| `claim_group_ai_request` / `finish_group_ai_request` | the claim gate: a request is answered once even if two callers race |
| `pg_net` | available, **not installed** |
| `pg_cron` | available, **not installed** — and not used by this design |
| `supabase_vault` | installed, zero secrets |
| scheduler | none: no `cron.job`, no Manus schedule, no Dashboard Schedules page |

## Design

`after insert on public.group_ai_requests`, `when (new.status = 'queued')` →
`private.kick_group_ai_executor()` → `net.http_post(...)`.

Why this shape:

- **It is the event, not a proxy for it.** The insert *is* `begin_group_ai_request`
  succeeding. A trigger cannot fire for a request that was rolled back, and cannot
  miss one that committed.
- **Best-effort without endangering the request.** The whole body is wrapped in
  `begin … exception when others then raise warning`. The request row is already
  written by then; a transport failure produces a warning and nothing else. No
  re-raise, because a re-raise would abort the insert.
- **One attempt.** Exactly one `net.http_post` call site, no loop, no retry table.
  If the call fails, the row stays `queued` and is visible as such — Adam's choice,
  recorded rather than hidden.
- **No key in the file.** The bearer token is read from `vault.decrypted_secrets`
  where `name = 'group_ai_executor_key'` at run time. The SQL text contains no key,
  and `cron.job` (not used here) would contain none either.
- **pg_net, not `http`.** `http` is synchronous: the insert would block for the
  duration of the function call. pg_net queues and returns.
- **No executor change, no redeploy.** The function already accepts a service-role
  caller; the trigger presents one. This keeps the deployed bytes untouched, which
  is the smallest possible change for a live release path.

Two consequences worth stating before anyone applies it:

1. A kick that fails leaves a permanently `queued` request. There is no sweep to
   rescue it, by explicit instruction. The client now distinguishes this state
   ("尚未完成…重新載入對話") from a failure instead of claiming either.
2. One kick can answer up to `EXECUTOR_BATCH` (default 5) requests, because the
   executor claims in a loop. That is not a retry and not a second trigger; it is
   the existing function draining the queue behind the one request that woke it.

## Rejected alternatives

| Route | Why not |
| --- | --- |
| pg_cron every minute | Adam ruled it out; also the only thing it adds over the trigger is latency and idle invocations |
| Database Webhook on insert | Same event, but the `supabase_functions` schema does not exist and the header would be stored in the trigger definition where any `postgres` session can read it — worse than Vault for the same result |
| Client calls the executor after `begin` | Not a backend event; the browser would need a credential that can invoke a service-role function, which is exactly what is forbidden |
| Client calls a new "kick" function | Same objection plus a new deploy; the trigger achieves it with no code in the request path |

## Files

| File | Change |
| --- | --- |
| `docs/stage6/KAYK_AI_CHAT_KICK_TRIGGER_PROPOSAL.sql` | new, 88 lines, sha256 `813bdbaaf109c54bc6d31d5fc2f92de7c88124578fe2d65532bb7c7d0d1ea420` |
| `server/stage6AiChatKickTriggerContract.test.ts` | new, 10 static pins (one call site, no cron/loop/retry, guarded exception, definer + pinned search_path, no key in text, draft marker; drawer does not render a local answer and has a distinct pending state) |
| `server/stage6AiChatKickTriggerApplies.test.ts` | new, 5 behaviour tests on a disposable PostgreSQL |
| `client/src/components/citylink/GroupAiDrawer.tsx` | non-ready outcome now splits into `failed` vs still-pending, and the pending state offers "重新載入對話" |
| `client/src/lib/aiChatConsent.ts` | `stillPending`, `reloadThread` copy |

## Evidence (this head, local only)

- `corepack pnpm check` — clean.
- `corepack pnpm test` — **852/852 in 57 files** (837 before; +10 static, +5 applies).
- The applies run is on **PostgreSQL 17.12**, the same major as both Supabase targets:
  - `fires exactly once for a successful begin` — one `net.calls` row, header carries the Vault key, body carries `request_id` and `group_id`;
  - `does not undo the request when the HTTP attempt fails` — the stub raises `08006`, `begin` still returns 0, the warning is emitted, the request is present and `queued`;
  - `makes no attempt and keeps the request when the secret is missing`;
  - `does not fire for a row that is not queued`.
- What this does **not** prove: that Launch has `pg_net`, that the definer can read Vault there, that the Edge Function accepts the token, or that the real HTTP round trip works. Those are preflight and post-apply checks, listed below.

## Required Launch changes (all stopped at the authorization point)

1. **Enable `pg_net`.** Dashboard → Database → Extensions → `pg_net`. `pg_cron` is
   not needed and should stay off. `shared_preload_libraries` already contains
   `pg_net`, so no restart is involved.
2. **Create the Vault secret** `group_ai_executor_key`, holding the legacy
   `service_role` JWT (the one already used in the function tester). Created in the
   Dashboard so the value never enters SQL history, this file, or chat.
3. **Apply the SQL** above, after Role 6 review, under an authorisation that names
   sha256 `813bdbaa…` and the target `pijslbchvstkoweslymr`.

No Edge Function deployment. No client deployment required for the trigger itself.

## Preflight, immediately before applying

- `select extname from pg_extension where extname = 'pg_net';` → one row.
- `select count(*) from vault.secrets where name = 'group_ai_executor_key';` → 1 (name only, never the value).
- `select has_function_privilege('postgres', 'net.http_post(text,jsonb,jsonb,integer)', 'execute');` → true.
- `select has_table_privilege('postgres', 'vault.decrypted_secrets', 'select');` → true.
- `select count(*) from public.group_ai_requests where status = 'queued';` → recorded, not zero-asserted (a queued row from earlier testing may exist).
- sha256 of the applied file equals `813bdbaa…`.

## Verification after applying

- `select tgname from pg_trigger where tgrelid = 'public.group_ai_requests'::regclass and not tgisinternal;` → `group_ai_requests_kick`.
- One question through the demo → `net._http_response` has one row with `status_code = 200`; `group_ai_requests.status` moves `queued → ready`; exactly one `author_kind = 'ai'` message.
- Negative control, on Test only: rename the Vault secret, ask again, confirm the request stays `queued`, the insert succeeds, and the log shows `group_ai_kick_no_secret`.

## Out of scope here

Sender names in prompt turns; xlsx/PDF extraction in the executor; the signer's
service-role route; any cleanup of the legacy three-argument creation stub.
