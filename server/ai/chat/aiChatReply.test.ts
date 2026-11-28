import { describe, expect, it, vi } from "vitest";
import {
  AI_REPLY_HARD_LIMIT,
  AI_REPLY_TARGET_MAX,
  AI_REPLY_TARGET_MIN,
  AI_REPLY_TRUNCATION_NOTICE,
  applyContextNotice,
  charLength,
  finaliseAiReply,
  isWithinTargetBand,
} from "../../../shared/aiChatReply";

describe("the hard cap", () => {
  it("leaves a reply at the limit untouched", () => {
    const body = "a".repeat(AI_REPLY_HARD_LIMIT);
    const result = finaliseAiReply(body);
    expect(result.truncated).toBe(false);
    expect(result.chars).toBe(AI_REPLY_HARD_LIMIT);
  });

  it("cuts one character over the limit and appends the notice", () => {
    const body = "a".repeat(AI_REPLY_HARD_LIMIT + 1);
    const result = finaliseAiReply(body);

    expect(result.truncated).toBe(true);
    expect(result.body.endsWith(AI_REPLY_TRUNCATION_NOTICE)).toBe(true);
    expect(result.chars).toBe(AI_REPLY_HARD_LIMIT);
    expect(charLength(result.body)).toBeLessThanOrEqual(AI_REPLY_HARD_LIMIT);
  });

  it("counts the notice inside the limit, not on top of it", () => {
    const result = finaliseAiReply("b".repeat(10_000));
    expect(charLength(result.body)).toBe(AI_REPLY_HARD_LIMIT);
  });

  it("writes exactly one log entry when it truncates", () => {
    const log = vi.fn();
    finaliseAiReply("c".repeat(3_000), { log });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      event: "ai_reply_truncated",
      originalChars: 3_000,
      keptChars: AI_REPLY_HARD_LIMIT - charLength(AI_REPLY_TRUNCATION_NOTICE),
      limit: AI_REPLY_HARD_LIMIT,
    });
  });

  it("writes no log entry when nothing is cut", () => {
    const log = vi.fn();
    finaliseAiReply("short answer", { log });
    expect(log).not.toHaveBeenCalled();
  });

  it("counts CJK characters as characters, not bytes", () => {
    const result = finaliseAiReply("中".repeat(AI_REPLY_HARD_LIMIT + 10));
    expect(result.truncated).toBe(true);
    expect(result.chars).toBe(AI_REPLY_HARD_LIMIT);
  });
});

describe("the target band", () => {
  it("is 1,200 to 1,500 characters", () => {
    expect(AI_REPLY_TARGET_MIN).toBe(1_200);
    expect(AI_REPLY_TARGET_MAX).toBe(1_500);
  });

  it("accepts the edges and refuses just outside them", () => {
    expect(isWithinTargetBand("a".repeat(1_200))).toBe(true);
    expect(isWithinTargetBand("a".repeat(1_500))).toBe(true);
    expect(isWithinTargetBand("a".repeat(1_199))).toBe(false);
    expect(isWithinTargetBand("a".repeat(1_501))).toBe(false);
  });
});

describe("the dropped-context notice", () => {
  it("is prefixed once, never twice", () => {
    const notice = "（本次未包含較早的對話）";
    const once = applyContextNotice("answer", notice);
    expect(once.startsWith(notice)).toBe(true);
    expect(applyContextNotice(once, notice)).toBe(once);
  });

  it("does nothing when there is no notice", () => {
    expect(applyContextNotice("answer", null)).toBe("answer");
  });
});
