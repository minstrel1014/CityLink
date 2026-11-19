import { describe, expect, it } from "vitest";
import {
  assertDispatchAllowed,
  DISPATCH_CONTEXT_CHANGED_MESSAGE,
} from "@/lib/supabaseRequestAuth";
import {
  getLiveAuthGeneration,
  markLiveAuthBoundary,
} from "@/lib/authBoundary";

describe("request dispatch context guard", () => {
  it("allows dispatch when no guard is supplied or the context is current", () => {
    expect(() => assertDispatchAllowed()).not.toThrow();
    expect(() => assertDispatchAllowed(() => true)).not.toThrow();
  });

  it("blocks dispatch when the initiating UI context has changed", () => {
    expect(() => assertDispatchAllowed(() => false)).toThrow(
      DISPATCH_CONTEXT_CHANGED_MESSAGE
    );
  });

  it("blocks dispatch when the live auth boundary changed after verification", () => {
    const verifiedGeneration = getLiveAuthGeneration();
    markLiveAuthBoundary();
    expect(() => assertDispatchAllowed(() => true, verifiedGeneration)).toThrow(
      DISPATCH_CONTEXT_CHANGED_MESSAGE
    );
  });
});
