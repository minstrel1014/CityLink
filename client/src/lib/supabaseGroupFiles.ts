import { supabaseClient } from "./supabaseClient";

/**
 * Usage figures for one group's file storage.
 *
 * Deliberately group-scoped: the RPC does not return other groups' bytes, and
 * this module does not ask for them. The server is the authority for every
 * number here, including the limit — a client-side copy of 1 GiB that drifts
 * from the guard produces the worst outcome, a UI that says there is room while
 * the upload is refused.
 *
 * `globalLimitReached` is a boolean, not a figure: the platform also has an
 * 8 GiB cap shared by every group, and an upload refused for that reason would
 * otherwise be inexplicable. It says only whether that cap is already reached.
 */
export type GroupFileUsage = {
  usedBytes: number;
  groupLimitBytes: number;
  globalLimitReached: boolean;
};

type GroupFileUsageRow = {
  used_bytes?: number | string | null;
  group_limit_bytes?: number | string | null;
  global_limit_reached?: boolean | null;
};

function toSafeNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Reads `public.group_file_usage`, a read-only RPC that returns this group's
 * usage and limit, plus whether the platform-wide cap is already reached.
 * Throws on a missing session or a refused call; callers render the error state
 * rather than inventing zeros, because zero usage is a claim, not an absence.
 */
export async function fetchGroupFileUsage(
  groupId: string
): Promise<GroupFileUsage> {
  // The client is null when the deployment has no Supabase configuration. That
  // is not "zero usage" and must not be rendered as one.
  if (supabaseClient === null) {
    throw new Error("File storage is not configured on this deployment.");
  }
  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Your sign-in could not be verified. Sign in again before continuing."
    );
  }

  const { data, error } = await supabaseClient.rpc("group_file_usage", {
    p_group_id: groupId,
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | GroupFileUsageRow
    | null
    | undefined;

  if (!row) {
    throw new Error("Usage could not be read for this group.");
  }

  return {
    usedBytes: toSafeNumber(row.used_bytes),
    groupLimitBytes: toSafeNumber(row.group_limit_bytes),
    globalLimitReached: row.global_limit_reached === true,
  };
}

/** Human-readable size, matching the units the contract uses (MiB, GiB). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const mib = 1024 * 1024;
  const gib = mib * 1024;
  if (bytes >= gib) return `${(bytes / gib).toFixed(2)} GiB`;
  if (bytes >= mib) return `${(bytes / mib).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
