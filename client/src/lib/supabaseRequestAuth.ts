import { supabaseClient } from "@/lib/supabaseClient";
import { getLiveAuthGeneration } from "@/lib/authBoundary";

type SupabaseClient = NonNullable<typeof supabaseClient>;

export const DISPATCH_CONTEXT_CHANGED_MESSAGE =
  "The workspace changed before the action could be sent. Refresh and try again.";

export interface VerifiedRequestSession {
  client: SupabaseClient;
  userId: string;
  accessToken: string;
  authGeneration: number;
}

/**
 * Capture and verify the token for this one request. The returned header is
 * attached by the caller so a later ambient account switch cannot change the
 * actor of an already-dispatched mutation.
 */
export async function verifyRequestSession(
  userId: string,
  errorMessage = "Your sign-in could not be verified. Sign in again before continuing."
): Promise<VerifiedRequestSession> {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) throw new Error(errorMessage);
  const authGeneration = getLiveAuthGeneration();

  let accessToken: string;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (error || typeof token !== "string" || !token.trim()) {
      throw new Error();
    }
    accessToken = token;
    const verified = await supabaseClient.auth.getUser(accessToken);
    if (verified.error || verified.data.user?.id !== userId) {
      throw new Error();
    }
  } catch {
    // Do not surface authentication errors that might contain sensitive data.
    throw new Error(errorMessage);
  }

  return { client: supabaseClient, userId, accessToken, authGeneration };
}

/** Check the live auth boundary and the caller's UI context before dispatch. */
export function assertDispatchAllowed(
  shouldDispatch?: () => boolean,
  expectedAuthGeneration?: number
): void {
  if (
    expectedAuthGeneration !== undefined &&
    getLiveAuthGeneration() !== expectedAuthGeneration
  ) {
    throw new Error(DISPATCH_CONTEXT_CHANGED_MESSAGE);
  }
  if (shouldDispatch && !shouldDispatch()) {
    throw new Error(DISPATCH_CONTEXT_CHANGED_MESSAGE);
  }
}

/** Bind a Supabase request builder to the already-verified request token. */
export function bindRequestToken(
  request: { setHeader(name: string, value: string): unknown },
  accessToken: string
): any {
  return request.setHeader("Authorization", `Bearer ${accessToken}`);
}
