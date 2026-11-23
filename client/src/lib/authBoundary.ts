import type { AuthChangeEvent } from "@supabase/supabase-js";

let liveAuthGeneration = 0;

/**
 * A synchronous, process-local boundary marker. It changes in the auth event
 * callback before React can render, so a request guard can reject work from the
 * previous account/session even during the intervening microtask.
 */
export function getLiveAuthGeneration(): number {
  return liveAuthGeneration;
}

export function markLiveAuthBoundary(): number {
  liveAuthGeneration += 1;
  return liveAuthGeneration;
}

/**
 * A tab refocus can emit SIGNED_IN again for the same active user. That is a
 * confirmation, not a new session boundary, so it must not remount route state
 * or discard drafts. Sign-out/re-sign-in, a different user, initial restore, and
 * password recovery are boundaries.
 */
export function isAuthBoundary(
  event: AuthChangeEvent,
  previousUserId: string | null,
  nextUserId: string | null
): boolean {
  if (event === "INITIAL_SESSION" || event === "PASSWORD_RECOVERY") return true;
  if (event === "SIGNED_OUT") return true;
  if (event === "SIGNED_IN") return previousUserId !== nextUserId;
  return false;
}
