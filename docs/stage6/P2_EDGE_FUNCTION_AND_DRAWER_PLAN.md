# P2 — Edge Function signer + chat drawer: plan

Status: **plan only.** Nothing here is authorized by being written down. The implementation, the
function deploy, the site change and the publish each need their own decision from Adam, and the R2
secrets are entered by him.

## What changed on 2026-11-24

Adam settled six things (recorded in `DECISIONS.md`): deploy yes; target the published demo site
`citylink-vm2mka3y.manus.space` (WebDev project `Vm2mKA3YornoSGba8WBzse`), not the Prototype; he enters
the R2 values himself; the file UI is a **drawer** off the group chat header, not a page; **no upload
restriction**; and the signer lives in a **Supabase Edge Function**.

Measured fact, replacing an assumption: the published site already talks to Launch. Its bundle
`assets/index-COcQxoTh.js` contains `pijslbchvstkoweslymr` once, `wkzclgmhrtecnpexfesr` zero times,
`sb_publishable_` twice, `service_role` zero times, and no `eyJ…` JWT. So the site is not a fictional
sandbox with a Launch copy somewhere else — the fictional part is only the `/demo` route.

## 1. Edge Function: `group-file-signer`

- **Location:** `supabase/functions/group-file-signer/index.ts` in the canonical repo, so it is reviewable
  in the same place as the SQL it depends on.
- **Runtime:** Deno. The Express router from PR #64 does not port; the two handlers do.
- **SigV4:** use `aws4fetch` (a single small module, designed for Deno/edge, no npm tree) rather than
  `@aws-sdk/client-s3` + presigner. Reason to record: `@aws-sdk` works in Deno through the npm specifier
  but pulls a large dependency tree into a function that needs to sign two URLs; `aws4fetch` does exactly
  that. If it turns out not to bind `Content-Type` the same way, that must be proven by a test before the
  swap is accepted — the unbound-header bug already bit us once.
- **Routes:** `POST /upload-url` and `POST /download-url`, body `{ file_id }` only. Same rule as the
  Express version: the client never names an object key.
- **Auth:** the caller's `Authorization: Bearer <user JWT>` is forwarded to PostgREST for the RPC calls,
  so `auth.uid()` is the real user. The function never uses a service-role key.
- **Secrets (Adam enters these in the Supabase dashboard):** `R2_ENDPOINT`, `R2_BUCKET`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Never in the repo, never in the browser bundle, never in chat.
- **CORS:** allow the site origin explicitly; the function is called with a bearer token, not cookies.
- **What it returns:** a presigned PUT (upload) or GET (download) URL plus the headers the browser must
  send. Uploads are signed as `application/octet-stream`; downloads are served as
  `application/octet-stream` with `Content-Disposition: attachment; filename*=UTF-8''…`. Both rules are
  already implemented and tested in `server/groupFiles/` and must survive the port.

## 2. Drawer: files inside the group chat

- **Entry point:** a button in the group chat header/title bar. Opens a right-hand panel; the chat stays
  mounted behind it. No route change, so nothing about chat state is lost.
- **Contents:** the usage card (group bar only, plus the deployment-cap notice), the current file list,
  an upload control, and per-file download/delete where the server allows it.
- **Upload flow:** `request_group_file_upload` → `POST /upload-url` → `PUT` to R2 with the signed headers →
  `confirm_group_file_upload`. Pending rows are not counted against quota until confirmed.
- **Where the code lives:** the published site is a WebDev project, not this GitHub repo. The React
  component from PR #63 and the client fetch module are the reference implementation; the WebDev copy has
  to be written against the same contracts. That duplication is a real cost and should be recorded rather
  than pretended away.
- **Errors the drawer must render:** `group_files_no_permission`, `group_files_not_pending`,
  `group_files_expired`, `group_files_upload_too_large`, `group_files_group_limit_reached`,
  `group_files_storage_limit_reached`, `group_files_too_many_pending`, and the duplicate-replacement
  `23505` (mapped on the client until a named token exists).

## 3. Accepted risk: open uploads on a public site

Adam chose open access: no allowlist, no registration gate. Combined with a public site, **anyone who can
register can consume the shared budget** — 1 GiB per group, 8 GiB across the deployment. The caps and the
per-group limits are the only control; there is no moderation and no per-user ceiling. This is recorded as
an accepted risk with Adam's name on it, not as an oversight. If abuse appears later, the levers are a
per-user ceiling or an upload allowlist — both need a decision, neither exists today.

## 4. Order of work, each step gated

1. Implement the function in the repo (no deploy) + unit tests for signing and the two RPC paths.
2. Adam sets the four secrets in the Supabase dashboard.
3. Deploy the function to `pijslbchvstkoweslymr` — needs its own authorization naming the function and window.
4. Build the drawer in the WebDev project against the deployed function; verify in Preview.
5. Publish the site — needs its own authorization.
6. Only then is the previously blocked live check possible: a real upload round-trip from a browser.

## 5. What is still not decided

- Whether the Edge Function is allowed to be deployed before or after the drawer exists (step 3 before 4
  is my recommendation: an endpoint with no UI is harmless and testable).
- Whether the drawer ships to every user at once or behind a flag. Open uploads suggest all at once.
- Whether the 100 MB pending QA row is ever cleaned up. It must not be confirmed; deleting it is a data
  write that needs its own authorization.
