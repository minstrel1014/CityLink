import { describe, expect, it } from "vitest";
import {
  AI_CHAT_LIMITS,
  CONTEXT_DROPPED_NOTICE,
  buildAiChatContext,
  clearAiChatContext,
  isFileEligible,
  type ChatTurn,
  type SelectableFile,
} from "../../../shared/aiChatContext";

const GROUP = "group-1";
const NOW = new Date("2026-11-24T12:00:00.000Z");

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

function file(overrides: Partial<SelectableFile> = {}): SelectableFile {
  return {
    id: "file-1",
    groupId: GROUP,
    name: "brief.pdf",
    text: "x".repeat(100),
    status: "current",
    retentionExpiresAt: "2027-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function build(
  overrides: Partial<Parameters<typeof buildAiChatContext>[0]> = {}
) {
  return buildAiChatContext({
    question: "What did we decide about the storage layer?",
    history: [],
    files: [],
    contextStartsAt: null,
    groupId: GROUP,
    now: NOW,
    ...overrides,
  });
}

describe("rule a: the question is always kept", () => {
  it("keeps a long question even when every budget is exhausted", () => {
    const question = "q".repeat(3_000);
    const context = build({
      question,
      history: [turn("m1", "member", "m".repeat(3_900), 1)],
      files: [file({ text: "f".repeat(9_900) })],
    });
    expect(context.question).toBe(question);
  });

  it("trims surrounding whitespace but never shortens the text", () => {
    const context = build({ question: "  why?  " });
    expect(context.question).toBe("why?");
  });
});

describe("rule b: at most two AI answers, oldest dropped first", () => {
  it("keeps the two most recent and marks the context as dropped", () => {
    const context = build({
      history: [
        turn("a1", "ai", "oldest answer", 30),
        turn("a2", "ai", "middle answer", 20),
        turn("a3", "ai", "newest answer", 10),
      ],
    });

    const aiIds = context.turns
      .filter(t => t.authorKind === "ai")
      .map(t => t.id);
    expect(aiIds).toEqual(["a2", "a3"]);
    expect(context.dropped).toBe(true);
    expect(context.notice).toBe(CONTEXT_DROPPED_NOTICE);
  });

  it("keeps both when there are exactly two", () => {
    const context = build({
      history: [turn("a1", "ai", "one", 20), turn("a2", "ai", "two", 10)],
    });
    expect(context.turns.filter(t => t.authorKind === "ai")).toHaveLength(2);
    expect(context.dropped).toBe(false);
    expect(context.notice).toBeNull();
  });
});

describe("rule c: the remaining budget goes to the most recent member messages", () => {
  it("fills the budget newest-first and drops the oldest", () => {
    const context = build({
      history: [
        turn("m1", "member", "a".repeat(1_500), 40),
        turn("m2", "member", "b".repeat(1_500), 30),
        turn("m3", "member", "c".repeat(1_500), 20),
        turn("m4", "member", "d".repeat(1_500), 10),
      ],
    });

    const memberIds = context.turns
      .filter(t => t.authorKind === "member")
      .map(t => t.id);
    expect(memberIds).toEqual(["m3", "m4"]);
    expect(context.stats.chatChars).toBeLessThanOrEqual(
      AI_CHAT_LIMITS.chatChars
    );
    expect(context.dropped).toBe(true);
  });

  it("counts AI answers against the same 4,000 characters", () => {
    const context = build({
      history: [
        turn("a1", "ai", "z".repeat(3_000), 20),
        turn("m1", "member", "m".repeat(900), 10),
        turn("m2", "member", "n".repeat(200), 5),
      ],
    });

    // Newest member message wins the remaining 1,000 characters; the older
    // 900-character one no longer fits once the 3,000-character answer is in.
    const ids = context.turns.map(t => t.id);
    expect(ids).toContain("a1");
    expect(ids).toContain("m2");
    expect(ids).not.toContain("m1");
    expect(context.stats.chatChars).toBe(3_200);
  });

  it("reports no drop when everything fits", () => {
    const context = build({
      history: [
        turn("m1", "member", "short", 10),
        turn("a1", "ai", "also short", 5),
      ],
    });
    expect(context.dropped).toBe(false);
    expect(context.notice).toBeNull();
  });
});

describe("rule d: the notice is exact", () => {
  it("is the string Adam specified, and nothing else", () => {
    expect(CONTEXT_DROPPED_NOTICE).toBe("（本次未包含較早的對話）");
  });
});

describe("clearing context moves a timestamp and deletes nothing", () => {
  it("returns the current instant and leaves the history untouched", () => {
    const history = [turn("m1", "member", "keep me", 10)];
    const before = JSON.stringify(history);

    const cutoff = clearAiChatContext(NOW);

    expect(cutoff).toBe(NOW.toISOString());
    expect(JSON.stringify(history)).toBe(before);
  });

  it("excludes everything at or before the cutoff, and nothing after it", () => {
    const history = [
      turn("old", "member", "before the clear", 60),
      turn("new", "member", "after the clear", 10),
    ];
    const cutoff = new Date(NOW.getTime() - 30 * 60_000).toISOString();

    const context = build({ history, contextStartsAt: cutoff });

    expect(context.turns.map(t => t.id)).toEqual(["new"]);
  });
});

describe("file eligibility", () => {
  it("accepts a current, unexpired file from this group", () => {
    expect(isFileEligible(file(), GROUP, NOW)).toBe(true);
  });

  it("refuses a file from another group", () => {
    expect(isFileEligible(file({ groupId: "other" }), GROUP, NOW)).toBe(false);
  });

  it("refuses a pending file", () => {
    expect(isFileEligible(file({ status: "pending" }), GROUP, NOW)).toBe(false);
  });

  it("refuses an expired file", () => {
    expect(
      isFileEligible(
        file({ retentionExpiresAt: "2026-11-01T00:00:00.000Z" }),
        GROUP,
        NOW
      )
    ).toBe(false);
  });

  it("treats an unreadable expiry as ineligible rather than as permanent", () => {
    expect(
      isFileEligible(file({ retentionExpiresAt: "not a date" }), GROUP, NOW)
    ).toBe(false);
  });

  it("drops ineligible files from the context and flags it", () => {
    const context = build({
      files: [
        file({ id: "ok" }),
        file({ id: "pending", status: "pending" }),
        file({ id: "expired", retentionExpiresAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    expect(context.files.map(f => f.id)).toEqual(["ok"]);
    expect(context.dropped).toBe(true);
  });
});

describe("file budget", () => {
  it("accepts at most two files", () => {
    const context = build({
      files: [file({ id: "a" }), file({ id: "b" }), file({ id: "c" })],
    });
    expect(context.files).toHaveLength(2);
    expect(context.dropped).toBe(true);
  });

  it("stops at 10,000 characters in total", () => {
    const context = build({
      files: [
        file({ id: "big", text: "a".repeat(9_500) }),
        file({ id: "second", text: "b".repeat(900) }),
        file({ id: "third", text: "c".repeat(100) }),
      ],
    });
    expect(context.stats.fileChars).toBeLessThanOrEqual(
      AI_CHAT_LIMITS.fileChars
    );
    expect(context.files.map(f => f.id)).not.toContain("second");
  });
});
