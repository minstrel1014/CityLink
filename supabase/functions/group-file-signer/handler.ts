/**
 * Request handling for the group-file signer, with no runtime assumptions.
 *
 * Everything that touches the network or the environment arrives as a
 * dependency, so this file runs unchanged under Deno (the Edge Function) and
 * under Node (the test suite). The Deno wiring lives in `index.ts`.
 *
 * Two rules shape the whole file:
 *   1. The client never names an object key. It sends a `file_id`; the key comes
 *      from an RPC executed as that user.
 *   2. An error message from the database is never echoed to the caller. Only a
 *      known token maps to a status; anything else becomes a generic failure.
 *      Echoing would turn the endpoint into an oracle for probing other rows.
 */

export const GROUP_FILE_CONTENT_TYPE = "application/octet-stream";

/**
 * Tokens the SQL raises deliberately, and the status each one becomes.
 *
 * The list is not decoration. The first deploy mapped five tokens, so
 * `group_files_not_current` — the ordinary answer for a file that has been
 * deleted — fell through to `group_files_unavailable` / 500 and told the drawer
 * the service was broken. Every raise site in the P1 and read-function SQL is
 * represented here; `DOMAIN_TOKEN` is the backstop for one added later.
 */
const TOKEN_STATUS: Record<string, number> = {
  // identity and authorisation
  group_files_unauthenticated: 401,
  group_files_no_permission: 403,
  group_files_not_uploader: 403,
  // the row itself
  group_files_not_found: 404,
  group_files_not_pending: 404,
  group_files_not_current: 404,
  group_files_expired: 410,
  group_files_retention_window_closed: 410,
  // the request
  group_files_name_required: 400,
  group_files_upload_too_large: 413,
  group_files_size_mismatch: 409,
  // capacity
  group_files_storage_limit_reached: 409,
  group_files_group_limit_reached: 409,
  group_files_too_many_pending: 429,
  // term resolution
  group_files_term_missing: 409,
  group_files_term_code_unrecognised: 409,
};

/**
 * A token this endpoint did not anticipate, but unmistakably one of ours:
 * lowercase words and underscores, nothing else. Returning 400 with the token
 * is still honest — it describes the caller's request — while an arbitrary
 * Postgres message (spaces, a table name, a value) stays behind a generic 500.
 */
const DOMAIN_TOKEN = /^group_files_[a-z][a-z0-9_]{0,40}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which origin may read a response.
 *
 * `SITE_ORIGIN` may name several origins, separated by commas or spaces; a bare
 * `*` keeps the permissive behaviour used for local testing.
 *
 * Manus-hosted origins are also accepted by pattern, deliberately. The
 * published site and the project Preview are different hosts — `*.manus.space`
 * and `*.manus.computer` — so pinning CORS to the published host makes the
 * feature fail inside the Preview with the exact symptom of an unreachable
 * bucket: the browser discards the response and `fetch` throws before any
 * status is visible. That happened once and cost an audit to find.
 *
 * It is not a hole in the authorization model. Every request carries the
 * caller's own JWT, the function sets no cookies and reads no ambient
 * credentials, so the token is what protects the data, not CORS. `Vary: Origin`
 * keeps shared caches from handing one origin's response to another.
 */
const MANUS_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*manus\.(space|computer)$/i;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function resolveOrigin(
  requestOrigin: string | null,
  siteOrigin: string
): string | null {
  const configured = siteOrigin.split(/[\s,]+/).filter(Boolean);
  if (configured.includes("*")) return "*";
  if (!requestOrigin) return configured[0] ?? null;
  if (configured.includes(requestOrigin)) return requestOrigin;
  if (MANUS_ORIGIN.test(requestOrigin) || LOCAL_ORIGIN.test(requestOrigin)) {
    return requestOrigin;
  }
  // No header at all: the browser blocks the response, which is the intent.
  return null;
}

export type SignerConfig = {
  /** Exact origin allowed by CORS. `*` is accepted only for local testing. */
  siteOrigin: string;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
};

export type RpcResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

export type SignerDeps = {
  config(): SignerConfig;
  callRpc(
    token: string,
    fn: string,
    args: Record<string, unknown>
  ): Promise<RpcResult>;
  presignUpload(args: {
    objectKey: string;
    contentType: string;
    expiresIn: number;
  }): Promise<string>;
  presignDownload(args: {
    objectKey: string;
    fileName: string;
    contentType: string;
    expiresIn: number;
  }): Promise<string>;
};

export function statusForToken(message: string | undefined): number {
  if (!message) return 500;
  const token = message.trim();
  const mapped = TOKEN_STATUS[token];
  if (mapped) return mapped;
  return DOMAIN_TOKEN.test(token) ? 400 : 500;
}

function json(body: unknown, status: number, config: SignerConfig): Response {
  // `config.siteOrigin` has already been resolved for this request, and an
  // empty string means "no origin is allowed" — omit the header rather than
  // send an empty one, so the browser blocks it cleanly.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (config.siteOrigin) {
    headers["Access-Control-Allow-Origin"] = config.siteOrigin;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** First row of an RPC result, whether it came back as an object or an array. */
function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

export async function handleRequest(
  req: Request,
  deps: SignerDeps
): Promise<Response> {
  // A per-request copy, because the resolved origin replaces the configured
  // list for the rest of this call and must not leak into the next one.
  const config: SignerConfig = { ...deps.config() };
  config.siteOrigin =
    resolveOrigin(req.headers.get("origin"), config.siteOrigin) ?? "";

  if (req.method === "OPTIONS") {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Headers":
        "authorization, content-type, apikey, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    };
    if (config.siteOrigin) {
      headers["Access-Control-Allow-Origin"] = config.siteOrigin;
    }
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, config);
  }

  // Supabase strips `/functions/v1/<name>`, but a direct call may keep it, so
  // route on the last segment rather than on an exact path.
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const route = path.slice(path.lastIndexOf("/") + 1);
  const isUpload = route === "upload-url";
  const isDownload = route === "download-url";
  if (!isUpload && !isDownload) {
    return json({ error: "not_found" }, 404, config);
  }

  const token = bearerToken(req);
  if (!token) {
    return json({ error: "group_files_unauthenticated" }, 401, config);
  }

  let fileId: unknown;
  try {
    const body = (await req.json()) as { file_id?: unknown };
    fileId = body?.file_id;
  } catch {
    return json({ error: "group_files_invalid_request" }, 400, config);
  }
  if (typeof fileId !== "string" || !UUID.test(fileId)) {
    return json({ error: "group_files_invalid_request" }, 400, config);
  }

  try {
    if (isUpload) {
      const { data, error } = await deps.callRpc(
        token,
        "group_file_upload_target",
        { p_file_id: fileId }
      );
      if (error) {
        const status = statusForToken(error.message);
        return json(
          {
            error:
              status === 500
                ? "group_files_unavailable"
                : error.message?.trim(),
          },
          status,
          config
        );
      }
      const row = firstRow(data);
      if (!row?.object_key) {
        return json({ error: "group_files_not_found" }, 404, config);
      }
      const url = await deps.presignUpload({
        objectKey: String(row.object_key),
        contentType: GROUP_FILE_CONTENT_TYPE,
        expiresIn: config.uploadTtlSeconds,
      });
      return json(
        {
          url,
          method: "PUT",
          headers: { "Content-Type": GROUP_FILE_CONTENT_TYPE },
          expires_in: config.uploadTtlSeconds,
        },
        200,
        config
      );
    }

    const { data, error } = await deps.callRpc(
      token,
      "request_group_file_download",
      { p_file_id: fileId }
    );
    if (error) {
      const status = statusForToken(error.message);
      return json(
        {
          error:
            status === 500 ? "group_files_unavailable" : error.message?.trim(),
        },
        status,
        config
      );
    }
    const row = firstRow(data);
    if (!row?.object_key) {
      return json({ error: "group_files_not_found" }, 404, config);
    }
    const url = await deps.presignDownload({
      objectKey: String(row.object_key),
      fileName: String(row.original_name ?? "file"),
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn: config.downloadTtlSeconds,
    });
    return json(
      { url, method: "GET", expires_in: config.downloadTtlSeconds },
      200,
      config
    );
  } catch (error) {
    // A missing secret is a deployment fault, and it is worth naming as such:
    // "misconfigured" tells an operator to look at the environment without
    // telling a caller which variable is absent. Everything else stays generic.
    if ((error as { name?: string })?.name === "GroupFileConfigError") {
      return json({ error: "group_files_misconfigured" }, 500, config);
    }
    // A presigning failure is ours, not the caller's: say nothing specific.
    return json({ error: "group_files_unavailable" }, 500, config);
  }
}
