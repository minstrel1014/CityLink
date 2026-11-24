import { describe, expect, it } from "vitest";
import {
  PLAN_CONCURRENCY_MODE,
  PLAN_ERROR_TOKENS,
  PlanConcurrencyUndecidedError,
  buildSavePlanRequest,
} from "@shared/groupAnalysisPlan";

describe("the open decision stays open", () => {
  it("is recorded as undecided, not defaulted", () => {
    expect(PLAN_CONCURRENCY_MODE).toBe("undecided");
  });

  it("refuses to build a save request while undecided", () => {
    expect(() =>
      buildSavePlanRequest({
        content: { objectives: ["one"] },
        currentRevision: 1,
      })
    ).toThrowError(PlanConcurrencyUndecidedError);

    try {
      buildSavePlanRequest({ content: {}, currentRevision: 1 });
    } catch (error) {
      expect((error as PlanConcurrencyUndecidedError).code).toBe(
        PLAN_ERROR_TOKENS.undecided
      );
    }
  });
});

describe("the three candidate shapes, so the choice is a one-line change", () => {
  it("optimistic carries the revision the client loaded", () => {
    const request = buildSavePlanRequest({
      content: { objectives: ["one"] },
      currentRevision: 7,
      mode: "optimistic",
    });
    expect(request).toEqual({
      p_content: { objectives: ["one"] },
      p_expected_revision: 7,
      mode: "optimistic",
    });
  });

  it("last-write-wins sends no revision", () => {
    const request = buildSavePlanRequest({
      content: {},
      currentRevision: 7,
      mode: "last_write_wins",
    });
    expect(request.p_expected_revision).toBeNull();
  });

  it("serialized also sends no revision, because the lock is server-side", () => {
    const request = buildSavePlanRequest({
      content: {},
      currentRevision: 7,
      mode: "serialized",
    });
    expect(request.p_expected_revision).toBeNull();
  });
});
