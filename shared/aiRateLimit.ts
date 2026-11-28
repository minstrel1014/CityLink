/**
 * Rate limits for the group AI conversation, as Adam decided on 2026-11-24.
 *
 * The check lives inside `begin_group_ai_request`, before the request row is
 * inserted, so it is transactional and cannot be bypassed by a client: every
 * question must pass through that function. This module is the single place the
 * numbers live, so the SQL and the client cannot drift apart.
 *
 * The numbers are a product choice, not a security boundary. They are set low
 * enough that a runaway client cannot spend real money and high enough that a
 * study group working through an assignment will not hit them.
 */
export const AI_RATE_LIMITS = {
  /** Questions one group may ask per calendar day (UTC). */
  perGroupPerDay: 20,
  /** Questions one member may ask per calendar day (UTC), across all groups. */
  perUserPerDay: 10,
  /** At most one question may be queued or processing for a group at a time. */
  maxInFlightPerGroup: 1,
  /**
   * A request stuck in `queued`/`processing` longer than this is treated as
   * dead rather than as an in-flight one. Without it a crashed server would
   * wedge a group until midnight.
   */
  inFlightStaleSeconds: 120,
} as const;

/** The error token the RPC raises; the drawer maps it to a sentence. */
export const AI_RATE_LIMITED_TOKEN = "group_ai_rate_limited";

const MS_PER_DAY = 86_400_000;

/**
 * Seconds until the daily counters reset, never less than one.
 *
 * The window is a UTC calendar day, so the answer is a property of the clock
 * rather than of when the member started asking. `retry_after` is what the
 * drawer shows; rounding up avoids telling someone to retry in 0 seconds.
 */
export function retryAfterSeconds(now: Date): number {
  const startOfDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const elapsed = now.getTime() - startOfDay;
  return Math.max(1, Math.ceil((MS_PER_DAY - elapsed) / 1000));
}

export interface RateLimitCounts {
  groupToday: number;
  userToday: number;
  inFlight: number;
}

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: "group_daily" | "user_daily" | "in_flight" };

/**
 * The decision, expressed once so the SQL can be checked against it.
 *
 * Order matters only for which reason is reported; all three are refusals. The
 * in-flight check comes first because it is the one a member can clear by
 * waiting a few seconds rather than until tomorrow.
 */
export function checkRateLimit(counts: RateLimitCounts): RateLimitVerdict {
  if (counts.inFlight >= AI_RATE_LIMITS.maxInFlightPerGroup) {
    return { allowed: false, reason: "in_flight" };
  }
  if (counts.groupToday >= AI_RATE_LIMITS.perGroupPerDay) {
    return { allowed: false, reason: "group_daily" };
  }
  if (counts.userToday >= AI_RATE_LIMITS.perUserPerDay) {
    return { allowed: false, reason: "user_daily" };
  }
  return { allowed: true };
}
