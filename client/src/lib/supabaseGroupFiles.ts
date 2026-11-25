import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Group files: the read/confirm RPCs plus the two signer routes.
 *
 * The browser never learns an object key it can choose. It asks the database for
 * a pending row, the signer turns that row into a URL, and the row is only
 * "current" after the confirm step. Every call below runs as the signed-in user;
 * nothing here uses a service key, and nothing here decides access on its own —
 * the RPC predicates do.
 */

export const GROUP_FILE_MAX_BYTES = 100 * 1024 * 1024;
/** The signer signs exactly one content type; a mismatch is rejected by R2. */
export const GROUP_FILE_CONTENT_TYPE = "application/octet-stream";
export const GROUP_FILES_PAGE_SIZE = 50;

export type GroupFile = {
  id: string;
  originalName: string;
  declaredMime: string | null;
  detectedMime: string | null;
  byteSize: number;
  uploadedBy: string | null;
  analysisStatus: string | null;
  retentionExpiresAt: string | null;
  createdAt: string;
};

export type GroupFileUsage = {
  usedBytes: number;
  groupLimitBytes: number;
  globalLimitReached: boolean;
};

type RpcRow = Record<string, unknown>;

function client() {
  if (!supabaseClient) {
    throw new Error("group_files_unavailable");
  }
  return supabaseClient;
}

/** Tokens the database raises on purpose, in the words a student can act on. */
const MESSAGES: Record<string, string> = {
  group_files_no_permission: "Only members of this group can use its files.",
  group_files_not_uploader: "Only the person who uploaded a file can replace it.",
  group_files_not_found: "That file is no longer available.",
  group_files_not_pending: "That upload is no longer pending.",
  group_files_not_current: "That file was deleted.",
  group_files_expired: "That file has expired.",
  group_files_retention_window_closed: "That file has expired.",
  group_files_name_required: "Give the file a name.",
  group_files_upload_too_large: "That file is larger than the 100 MB limit.",
  group_files_size_mismatch: "The uploaded size did not match what was declared.",
  group_files_storage_limit_reached:
    "The platform's file storage is full. Try again later.",
  group_files_group_limit_reached:
    "This group has used its 1 GB of file storage. Delete something first.",
  group_files_too_many_pending:
    "Too many uploads are pending. Finish or cancel one first.",
  group_files_term_missing: "The current term is not configured.",
  group_files_term_code_unrecognised: "The current term is not recognised.",
  group_files_misconfigured: "File storage is not configured yet.",
  group_files_unavailable: "File storage is unavailable. Try again.",
  group_files_network:
    "Your browser could not reach file storage. Check your connection and try again.",
  group_files_network_signer:
    "Your browser could not reach the file service. Check your connection and try again.",
  group_files_network_storage:
    "Your browser could not reach file storage. Check your connection and try again.",
  group_files_pending_exists:
    "An earlier upload is still waiting to finish in this group. Reload and try again.",
  group_files_invalid_request: "That request was not valid.",
  group_files_unauthenticated: "Sign in again to use group files.",
};

export function groupFileErrorMessage(raw: string | null | undefined): string {
  const token = (raw ?? "").trim();
  if (!token) return "Something went wrong. Try again.";
  return MESSAGES[token] ?? "Something went wrong. Try again.";
}

/**
 * Reduce a PostgREST error to one token.
 *
 * A raised token arrives as the whole message. Two shapes are not tokens and
 * still need an honest answer: the unique index that allows only one pending
 * replacement per group (23505, F-P1-1 — a temporary client mapping until a SQL
 * revision gives it a token of its own), and a network failure, which reaches
 * here as `Failed to fetch` and must not be reported as a database problem.
 */
function errorToken(
  error: { message?: string; code?: string } | null | undefined
): string {
  const message = (error?.message ?? "").trim();
  if (
    error?.code === "23505" ||
    message.includes("group_files_one_pending_replacement_idx")
  ) {
    return "group_files_pending_exists";
  }
  return message;
}

function toFile(row: RpcRow): GroupFile {
  return {
    id: String(row.id),
    originalName: String(row.original_name ?? "file"),
    declaredMime: (row.declared_mime as string | null) ?? null,
    detectedMime: (row.detected_mime as string | null) ?? null,
    byteSize: Number(row.byte_size ?? 0),
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    analysisStatus: (row.analysis_status as string | null) ?? null,
    retentionExpiresAt: (row.retention_expires_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listGroupFiles(groupId: string): Promise<GroupFile[]> {
  const { data, error } = await client().rpc("list_group_files", {
    p_group_id: groupId,
  });
  if (error) throw new Error(errorToken(error));
  return ((data ?? []) as RpcRow[]).slice(0, GROUP_FILES_PAGE_SIZE).map(toFile);
}

export async function getGroupFileUsage(
  groupId: string
): Promise<GroupFileUsage> {
  const { data, error } = await client().rpc("group_file_usage", {
    p_group_id: groupId,
  });
  if (error) throw new Error(errorToken(error));
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    usedBytes: Number(raw.used_bytes ?? 0),
    groupLimitBytes: Number(raw.group_limit_bytes ?? 0),
    globalLimitReached: Boolean(raw.global_limit_reached),
  };
}

async function accessToken(): Promise<string> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("group_files_unauthenticated");
  return token;
}

function signerUrl(route: "upload-url" | "download-url"): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return `${base}/functions/v1/group-file-signer/${route}`;
}

async function postToSigner(
  route: "upload-url" | "download-url",
  fileId: string
): Promise<Response> {
  return await fetch(signerUrl(route), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({ file_id: fileId }),
  });
}

async function callSigner(
  route: "upload-url" | "download-url",
  fileId: string
): Promise<{ url: string; method: string; headers?: Record<string, string> }> {
  let response: Response;
  try {
    response = await postToSigner(route, fileId);
  } catch (first) {
    // A request rejected before the CORS headers are attached — an expired
    // token, for instance — reaches `fetch` as a network failure, not as a
    // status. Refresh once and retry before blaming the network; the second
    // failure is the real one.
    try {
      await client().auth.refreshSession();
      response = await postToSigner(route, fileId);
    } catch (second) {
      console.error(`[group-files] ${route} could not be reached`, first, second);
      throw new Error("group_files_network_signer");
    }
  }
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || typeof body.url !== "string") {
    throw new Error(String(body.error ?? "group_files_unavailable"));
  }
  return {
    url: body.url,
    method: String(body.method ?? (route === "upload-url" ? "PUT" : "GET")),
    headers: (body.headers as Record<string, string> | undefined) ?? undefined,
  };
}

/**
 * Upload in the order the SQL expects: a pending row, a signed PUT, then a
 * confirm that only succeeds if the declared and actual sizes agree.
 */
export async function uploadGroupFile(
  groupId: string,
  file: File
): Promise<void> {
  if (file.size > GROUP_FILE_MAX_BYTES) {
    throw new Error("group_files_upload_too_large");
  }
  const { data, error } = await client().rpc("request_group_file_upload", {
    p_group_id: groupId,
    p_original_name: file.name,
    p_declared_mime: file.type || GROUP_FILE_CONTENT_TYPE,
    p_byte_size: file.size,
  });
  if (error) throw new Error(errorToken(error));
  const row = ((data ?? []) as RpcRow[])[0];
  const fileId = row ? String(row.file_id) : "";
  if (!fileId) throw new Error("group_files_not_found");

  const target = await callSigner("upload-url", fileId);
  let put: Response;
  try {
    put = await fetch(target.url, {
      method: "PUT",
      headers: target.headers ?? { "Content-Type": GROUP_FILE_CONTENT_TYPE },
      body: file,
    });
  } catch {
    // The bucket answered the preflight but the upload never completed; from the
    // browser this is indistinguishable from a dropped connection.
    console.error("[group-files] the signed upload could not be reached", {
      host: new URL(target.url).host,
    });
    throw new Error("group_files_network_storage");
  }
  if (!put.ok) throw new Error("group_files_unavailable");

  const confirmed = await client().rpc("confirm_group_file_upload", {
    p_file_id: fileId,
    p_byte_size: file.size,
    p_detected_mime: file.type || GROUP_FILE_CONTENT_TYPE,
  });
  if (confirmed.error) throw new Error(errorToken(confirmed.error));
}

export async function deleteGroupFile(fileId: string): Promise<void> {
  const { error } = await client().rpc("delete_group_file", {
    p_file_id: fileId,
  });
  if (error) throw new Error(errorToken(error));
}

/** Ask the signer for a download URL, then hand the browser to it. */
export async function downloadGroupFile(fileId: string): Promise<void> {
  const target = await callSigner("download-url", fileId);
  window.location.assign(target.url);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  const text =
    value >= 10 || exponent === 0
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[exponent]}`;
}
