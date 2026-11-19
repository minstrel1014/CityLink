import { describe, expect, it } from "vitest";
import {
  getLiveAuthGeneration,
  isAuthBoundary,
  markLiveAuthBoundary,
} from "./authBoundary";

describe("auth boundary classification", () => {
  it("treats a repeated SIGNED_IN for the same user as a confirmation", () => {
    expect(isAuthBoundary("SIGNED_IN", "account-a", "account-a")).toBe(false);
  });

  it("treats sign-in for a different user as a boundary", () => {
    expect(isAuthBoundary("SIGNED_IN", "account-a", "account-b")).toBe(true);
    expect(isAuthBoundary("SIGNED_IN", null, "account-a")).toBe(true);
  });

  it("treats initial restore, sign-out, and recovery as boundaries", () => {
    expect(isAuthBoundary("INITIAL_SESSION", null, "account-a")).toBe(true);
    expect(isAuthBoundary("SIGNED_OUT", "account-a", null)).toBe(true);
    expect(isAuthBoundary("PASSWORD_RECOVERY", "account-a", "account-a")).toBe(
      true
    );
  });

  it("does not treat token refresh or user metadata updates as boundaries", () => {
    expect(isAuthBoundary("TOKEN_REFRESHED", "account-a", "account-a")).toBe(
      false
    );
    expect(isAuthBoundary("USER_UPDATED", "account-a", "account-a")).toBe(
      false
    );
  });

  it("advances the synchronous live marker when a boundary is marked", () => {
    const before = getLiveAuthGeneration();
    expect(markLiveAuthBoundary()).toBe(before + 1);
    expect(getLiveAuthGeneration()).toBe(before + 1);
  });
});
