# P2 signing endpoint — scope for approval

**Status:** scope only. No code written, no credentials configured, nothing deployed.
**Date:** 2026-11-24
**Why it exists:** `request_group_file_upload` returns `file_id` and `object_key` and deliberately no
URL. `postgres` has no SigV4 tool, so presigned URLs must be produced by a server endpoint. Until it
exists, no real upload can complete and check 1 of the P1 QA stays blocked.

## What it must do

Two endpoints, both authenticated by the caller's Supabase user JWT, both taking **only** a
`file_id` from the client.

| Endpoint | Returns | TTL |
|---|---|---|
| `POST /api/group-files/upload-url` | presigned R2 `PUT`, `Content-Type` bound at signing time | 900 s |
| `POST /api/group-files/download-url` | presigned R2 `GET`, with `response-content-disposition` and `response-content-type` | 300 s |

Server flow for both: verify the JWT → call the corresponding P1 RPC **as that user** (so
`private.can_access_group_files` decides, not the endpoint) → read `object_key` from the row the
RPC returns → sign → respond.

## Rules that are not negotiable

- **`object_key` is never accepted from the client.** It is output only. Accepting it would let any
  signed-in user obtain a valid PUT against someone else's object (Role 6 R2).
- **The RPC is the authority, not the endpoint.** The endpoint does not re-implement membership
  checks, does not read tables directly, and does not hold a service-role key.
- **Signing binds `Content-Type`.** Otherwise a caller can declare `text/plain` and upload anything.
- **No URLs in list responses.** Signing happens per request, never in bulk.
- **Presigned URLs are bearer tokens.** Not logged, not cached, not put in `Referer`-reachable
  pages.

## Configuration

R2 endpoint, bucket name, region `auto`, an access key id and secret, held as secrets in the server
environment. None of these exist yet; none may be committed.

## Explicit non-goals

Multipart or resumable upload, virus scanning, image thumbnails, CDN invalidation, and any change to
the P1 SQL. If resumable upload is ever wanted it becomes its own scope.

## Tests, before any Launch write

1. Unit: signing produces a URL whose signature covers the bound `Content-Type`; a mismatched
   `Content-Type` PUT is rejected by R2.
2. Unit: a request with a client-supplied `object_key` is ignored, not honoured.
3. Integration against a scratch bucket: PUT, then `HeadObject` returns the same size and type the
   client will pass to `confirm_group_file_upload`.
4. Authorization: a removed member's download-url call is refused by the RPC, not by the endpoint.
5. Negative: expired or tampered presigned URL is rejected by R2.

## Decisions this scope needs from Adam

1. **Where it lives.** The canonical repo's `server/` (Express/tRPC, alongside the existing
   scaffolding) is the natural home and keeps it in review. The alternative is the separate WebDev
   site repo, which is not in GitHub and therefore not reviewable the same way.
2. **R2 credentials.** Do they exist yet, and are they going into the server environment or a
   secret store?
3. **Whether deployment is in scope now.** Building and testing locally needs no deployment;
   check 1 on Launch does, because the browser must reach the endpoint. Deployment is currently
   outside every authorization, so this is a separate decision.

## What this unblocks

Check 1 and the real-bytes path; the 300-second download TTL; revoked-link behaviour on replace and
delete; and the client upload flow that PR #59 deliberately does not include.
