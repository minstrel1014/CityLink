import { describe, expect, it, vi } from "vitest";
import {
  CONTEXT_DROPPED_NOTICE,
  type ChatTurn,
} from "../../../shared/aiChatContext";
import {
  AI_REPLY_HARD_LIMIT,
  AI_REPLY_TRUNCATION_NOTICE,
  charLength,
} from "../../../shared/aiChatReply";
import { MockAnalysisProvider } from "../provider/mock";
import { answerGroupQuestion } from "./answerQuestion";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const GROUP = "group-1";

function turn(
  id: string,
  authorKind: "member" | "ai",
  body: string,
  minutesAgo: number
): ChatTurn {
  return {
    id,
    authorKind,
    authorName: authorKind === "ai" ? "CityLink AI" : "Ada",
    body,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  };
}

const base = {
  question: "What did we decide about storage?",
  history: [] as ChatTurn[],
  files: [],
  contextStartsAt: null,
  groupId: GROUP,
  now: NOW,
};

describe("the end-to-end answer", () => {
  it("produces a body inside the target band for a normal question", async () => {
    const result = await answerGroupQuestion(base, {
      provider: new MockAnalysisProvider(),
    });

    expect(result.truncated).toBe(false);
    expect(result.chars).toBeGreaterThanOrEqual(1_200);
    expect(result.chars).toBeLessThanOrEqual(1_500);
    expect(result.providerId).toBe("mock");
    expect(result.model).toBeNull();
  });

  it("prefixes the dropped-context notice when older turns were excluded", async () => {
    const result = await answerGroupQuestion(
      {
        ...base,
        history: [
          turn("a1", "ai", "first", 40),
          turn("a2", "ai", "second", 30),
          turn("a3", "ai", "third", 20),
        ],
      },
      { provider: new MockAnalysisProvider() }
    );

    expect(result.context.dropped).toBe(true);
    expect(result.body.startsWith(CONTEXT_DROPPED_NOTICE)).toBe(true);
  });

  it("has no notice when nothing was dropped", async () => {
    const result = await answerGroupQuestion(
      { ...base, history: [turn("m1", "member", "one short message", 5)] },
      { provider: new MockAnalysisProvider() }
    );

    expect(result.context.dropped).toBe(false);
    expect(result.body.startsWith(CONTEXT_DROPPED_NOTICE)).toBe(false);
  });

  it("keeps the notice visible even when the answer is truncated", async () => {
    const longProvider = {
      id: "long",
      requiresNetwork: false,
      async answer() {
        return {
          providerId: "long",
          model: null,
          body: "x".repeat(5_000),
          usage: {
            inputChars: 0,
            outputChars: 5_000,
            turnsUsed: 0,
            filesUsed: 0,
          },
        };
      },
    };

    const result = await answerGroupQuestion(
      {
        ...base,
        history: [
          turn("a1", "ai", "old", 40),
          turn("a2", "ai", "older", 30),
          turn("a3", "ai", "oldest kept", 20),
        ],
      },
      { provider: longProvider }
    );

    expect(result.truncated).toBe(true);
    expect(charLength(result.body)).toBeLessThanOrEqual(AI_REPLY_HARD_LIMIT);
    expect(result.body.startsWith(CONTEXT_DROPPED_NOTICE)).toBe(true);
    expect(result.body.endsWith(AI_REPLY_TRUNCATION_NOTICE)).toBe(true);
  });

  it("logs a truncation through the injected logger", async () => {
    const log = vi.fn();
    const longProvider = {
      id: "long",
      requiresNetwork: false,
      async answer() {
        return {
          providerId: "long",
          model: null,
          body: "y".repeat(4_000),
          usage: {
            inputChars: 0,
            outputChars: 4_000,
            turnsUsed: 0,
            filesUsed: 0,
          },
        };
      },
    };

    await answerGroupQuestion(base, { provider: longProvider, log });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ai_reply_truncated",
        originalChars: 4_000,
      })
    );
  });

  it("passes the assembled context, not the raw history, to the provider", async () => {
    const seen: number[] = [];
    const spyProvider = {
      id: "spy",
      requiresNetwork: false,
      async answer(request: { turns: ChatTurn[]; files: unknown[] }) {
        seen.push(request.turns.length, request.files.length);
        return {
          providerId: "spy",
          model: null,
          body: "short",
          usage: {
            inputChars: 0,
            outputChars: 5,
            turnsUsed: request.turns.length,
            filesUsed: 0,
          },
        };
      },
    };

    await answerGroupQuestion(
      {
        ...base,
        history: [
          turn("a1", "ai", "z".repeat(3_000), 40),
          turn("a2", "ai", "y".repeat(3_000), 30),
          turn("m1", "member", "m".repeat(3_000), 20),
        ],
      },
      { provider: spyProvider }
    );

    // Two AI answers alone exceed 4,000 characters, so the member message and
    // one of the answers must have been dropped before the provider saw them.
    expect(seen[0]).toBeLessThan(3);
  });

  it("cancels cleanly", async () => {
    const controller = new AbortController();
    const provider = new MockAnalysisProvider({ delayMs: 50 });
    const pending = answerGroupQuestion(base, {
      provider,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "analysis_cancelled" });
  });
});
