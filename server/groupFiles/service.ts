/**
 * Everything that decides *whether* a URL may be minted lives here, and none of
 * it is reimplemented: the endpoint asks the database, as the user, every time.
 *
 * That is deliberate. `private.can_access_group_files` is the single authority
 * on who may touch a group's files, and it is active-membership only — a removed
 * member loses file access even though `can_read_group_chat` still lets them
 * read the chat. An endpoint that cached membership, or read the table with
 * elevated rights, would quietly become a second and weaker authority.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GroupFileSignerConfig } from "./env";

export type ResolvedFile = {
  objectKey: string;
  originalName: string;
};

export class GroupFileRequestError extends Error {
  constructor(
    readonly status: number,
    readonly token: string
  ) {
    super(token);
    this.name = "GroupFileRequestError";
  }
}

/** Maps the RPC's named exceptions onto HTTP statuses. Tokens are the contract. */
const TOKEN_STATUS: Record<string, number> = {
  group_files_no_permission: 403,
  group_files_not_found: 404,
  group_files_not_current: 409,
  group_files_expired: 410,
  group_files_not_uploader: 403,
  group_files_not_pending: 409,
};

function toRequestError(rawMessage: string | undefined): GroupFileRequestError {
  const token = (rawMessage ?? "").trim().split(/[\s(]/)[0];
  const status = TOKEN_STATUS[token] ?? 500;
  // An unrecognised message is not echoed back: it may contain row data.
  return new GroupFileRequestError(
    status,
    status === 500 ? "group_files_unavailable" : token
  );
}

/** A client that carries the caller's own JWT, so RLS and auth.uid() apply. */
export function createUserClient(
  config: GroupFileSignerConfig,
  accessToken: string
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Rejects a token that Supabase does not recognise, before any RPC is called. */
export async function requireUserId(
  config: GroupFileSignerConfig,
  accessToken: string
): Promise<string> {
  const client = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new GroupFileRequestError(401, "group_files_unauthenticated");
  }
  return data.user.id;
}

/**
 * Resolves the object key for a pending upload row.
 *
 * The key is never accepted from the client: a caller who could name the key
 * would be able to obtain a signed PUT against someone else's object. The row is
 * read through `public.group_file_upload_target`, which returns a key only for a
 * pending row whose uploader is the caller.
 */
export async function resolveUploadTarget(
  client: SupabaseClient,
  fileId: string
): Promise<ResolvedFile> {
  const { data, error } = await client.rpc("group_file_upload_target", {
    p_file_id: fileId,
  });
  if (error) throw toRequestError(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { object_key?: string; original_name?: string }
    | null
    | undefined;

  if (!row?.object_key) {
    throw new GroupFileRequestError(404, "group_files_not_found");
  }

  return {
    objectKey: row.object_key,
    originalName: row.original_name ?? "file",
  };
}

/**
 * Resolves a current row for download. `request_group_file_download` already
 * refuses deleted, replaced and expired rows, so its refusals are the answer.
 */
export async function resolveDownloadTarget(
  client: SupabaseClient,
  fileId: string
): Promise<ResolvedFile> {
  const { data, error } = await client.rpc("request_group_file_download", {
    p_file_id: fileId,
  });
  if (error) throw toRequestError(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { object_key?: string; original_name?: string }
    | null
    | undefined;

  if (!row?.object_key) {
    throw new GroupFileRequestError(404, "group_files_not_found");
  }

  return {
    objectKey: row.object_key,
    originalName: row.original_name ?? "file",
  };
}
