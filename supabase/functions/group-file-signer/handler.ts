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

/** Tokens the P1 SQL raises deliberately. Anything else is not the caller's business. */
const TOKEN_STATUS: Record<string, number> = {
  group_files_unauthenticated: 401,
  group_files_no_permission: 403,
  group_files_not_pending: 404,
  group_files_not_found: 404,
  group_files_expired: 410,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  return TOKEN_STATUS[message.trim()] ?? 500;
}

function json(
  body: unknown,
  status: number,
  config: SignerConfig
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": config.siteOrigin,
      "Access-Control-Allow-Headers":
        "authorization, content-type, apikey, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    },
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
  const config = deps.config();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": config.siteOrigin,
        "Access-Control-Allow-Headers":
          "authorization, content-type, apikey, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
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
  } catch {
    // A presigning failure is ours, not the caller's: say nothing specific.
    return json({ error: "group_files_unavailable" }, 500, config);
  }
}
