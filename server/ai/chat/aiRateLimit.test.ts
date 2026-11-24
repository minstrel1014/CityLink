import { describe, expect, it } from "vitest";
import {
  AI_RATE_LIMITED_TOKEN,
  AI_RATE_LIMITS,
  checkRateLimit,
  retryAfterSeconds,
} from "@shared/aiRateLimit";

describe("group AI rate limits", () => {
  it("allows a member who is under every limit", () => {
    expect(
      checkRateLimit({ groupToday: 0, userToday: 0, inFlight: 0 })
    ).toEqual({ allowed: true });
  });

  it("allows the last question inside each limit and refuses the next one", () => {
    expect(
      checkRateLimit({
        groupToday: AI_RATE_LIMITS.perGroupPerDay - 1,
        userToday: 0,
        inFlight: 0,
      })
    ).toEqual({ allowed: true });
    expect(
      checkRateLimit({
        groupToday: AI_RATE_LIMITS.perGroupPerDay,
        userToday: 0,
        inFlight: 0,
      })
    ).toEqual({ allowed: false, reason: "group_daily" });

    expect(
      checkRateLimit({
        groupToday: 0,
        userToday: AI_RATE_LIMITS.perUserPerDay - 1,
        inFlight: 0,
      })
    ).toEqual({ allowed: true });
    expect(
      checkRateLimit({
        groupToday: 0,
        userToday: AI_RATE_LIMITS.perUserPerDay,
        inFlight: 0,
      })
    ).toEqual({ allowed: false, reason: "user_daily" });
  });

  it("reports the in-flight refusal first, because it clears in seconds", () => {
    // A member who is both at the daily ceiling and blocked by a running request
    // should be told the thing that resolves soonest, not "come back tomorrow".
    expect(
      checkRateLimit({
        groupToday: AI_RATE_LIMITS.perGroupPerDay,
        userToday: AI_RATE_LIMITS.perUserPerDay,
        inFlight: AI_RATE_LIMITS.maxInFlightPerGroup,
      })
    ).toEqual({ allowed: false, reason: "in_flight" });
  });

  it("treats one in-flight request per group as the ceiling", () => {
    expect(AI_RATE_LIMITS.maxInFlightPerGroup).toBe(1);
    expect(
      checkRateLimit({ groupToday: 0, userToday: 0, inFlight: 1 })
    ).toEqual({ allowed: false, reason: "in_flight" });
  });

  it("uses a token the drawer can map, distinct from the capacity gate", () => {
    expect(AI_RATE_LIMITED_TOKEN).toBe("group_ai_rate_limited");
    expect(AI_RATE_LIMITED_TOKEN).not.toContain("capacity");
  });

  it("counts down to the next UTC midnight", () => {
    // 23:59:30 UTC is thirty seconds before the counters reset.
    expect(retryAfterSeconds(new Date("2026-11-24T23:59:30.000Z"))).toBe(30);
    expect(retryAfterSeconds(new Date("2026-11-24T00:00:00.000Z"))).toBe(
      86_400
    );
  });

  it("never returns zero, so the drawer cannot say 'retry in 0 seconds'", () => {
    expect(retryAfterSeconds(new Date("2026-11-24T23:59:59.900Z"))).toBe(1);
    expect(retryAfterSeconds(new Date("2026-11-24T23:59:59.999Z"))).toBe(1);
  });
});
