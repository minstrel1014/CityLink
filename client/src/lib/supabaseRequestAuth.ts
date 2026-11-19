import { supabaseClient } from "@/lib/supabaseClient";

type SupabaseClient = NonNullable<typeof supabaseClient>;

export const DISPATCH_CONTEXT_CHANGED_MESSAGE =
  "The workspace changed before the action could be sent. Refresh and try again.";

export interface VerifiedRequestSession {
  client: SupabaseClient;
  userId: string;
  accessToken: string;
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

  return { client: supabaseClient, userId, accessToken };
}

/** Check the caller's UI context immediately before dispatching a mutation. */
export function assertDispatchAllowed(shouldDispatch?: () => boolean): void {
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
