# `group-file-signer` — Edge Function

Signs short-lived R2 URLs for group files. **Not deployed.** This directory exists because Adam
approved implementing it; deploying it, setting its secrets, and changing the site are separate
decisions.

## Why it exists

P1's SQL decides *who may touch which file*. It deliberately does not hand out URLs, because only a
server holding the R2 credentials can sign one. The client sends a `file_id`; this function resolves
the object key by calling an RPC **as that user**, then signs.

The client never names an object key. If it could, any signed-in user could obtain a valid PUT against
someone else's object.

## Routes

| Route | Body | Returns |
|---|---|---|
| `POST /upload-url` | `{ "file_id": "<uuid>" }` | `{ url, method: "PUT", headers: { "Content-Type": "application/octet-stream" }, expires_in }` |
| `POST /download-url` | `{ "file_id": "<uuid>" }` | `{ url, method: "GET", expires_in }` |

Authorization: `Authorization: Bearer <user JWT>`. No service-role key is used anywhere, so
`auth.uid()` is the real caller and P1's predicates decide.

## Errors

Only tokens the SQL raises on purpose are mapped: `group_files_unauthenticated` → 401,
`group_files_no_permission` → 403, `group_files_not_pending` / `group_files_not_found` → 404,
`group_files_expired` → 410. **Any other database message becomes `group_files_unavailable` (500).**
Echoing an arbitrary message would turn the endpoint into an oracle for probing other rows.

## Configuration

Platform-provided (do not set): `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

Secrets Adam enters in the dashboard — names only, values never in this repo, never in chat:

| Secret | Meaning |
|---|---|
| `R2_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `citylink-group-files` |
| `R2_ACCESS_KEY_ID` | R2 token id |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |

Optional: `SITE_ORIGIN` (exact CORS origin, defaults to `*` for testing only), `UPLOAD_TTL_SECONDS`
(900), `DOWNLOAD_TTL_SECONDS` (300).

## Two content-type rules, both deliberate

1. **Uploads are signed as `application/octet-stream`, never as the client's declared type.** The
   declared type is a string in a JSON body, not a property of the bytes; signing it would let the
   caller decide how a later GET is interpreted.
2. **Downloads are served as `application/octet-stream` with `Content-Disposition: attachment`**, with
   the filename in both an ASCII fallback and RFC 5987 `filename*=UTF-8''…`. A presigned URL cannot
   carry arbitrary response headers, so these ride inside the signature.

## Why `@aws-sdk` and not a lighter SigV4 library

`signing.ts` is the same logic that was round-tripped against the real bucket, including the fix for a
`Content-Type` that was silently outside the signature. A lighter implementation would have to re-prove
that binding against the real service before it could be trusted, and the only gain is cold start. If
cold start becomes a problem, that swap is the lever — and it needs the round-trip, not just a unit test.

## Tests

`handler.test.ts` (14) covers routing, CORS, auth, input validation, token→status mapping, refusal to
echo unknown messages, and presigning failures. `signing.test.ts` (6) covers the signed-header binding,
the two content-type rules, and filename escaping. Both run under the repo's normal `pnpm test`;
`deno.json` maps the bare imports so `signing.ts` is importable from Node.

Verified against the real bucket before deploy: PUT `200`, PUT with a different `Content-Type` `403`,
GET `200` with `application/octet-stream` and the RFC 5987 disposition, object deleted afterwards.

## Deploy (not run)

```bash
supabase functions deploy group-file-signer --project-ref pijslbchvstkoweslymr
```

Requires the secrets above to be set first, and Adam's explicit authorization naming the function and
the window.
