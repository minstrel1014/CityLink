import { describe, expect, it } from "vitest";
import {
  AI_AUTHOR_NAME,
  canAskAi,
  canReadAiReplies,
  displayAuthor,
  isAiMessage,
  isDeletedAccountMessage,
} from "@shared/chatAuthor";

describe("author_kind tells the AI apart from a deleted account", () => {
  it("recognises an AI row", () => {
    expect(isAiMessage({ authorKind: "ai" })).toBe(true);
    expect(isDeletedAccountMessage({ authorKind: "ai", senderId: null })).toBe(
      false
    );
  });

  it("treats a member row with no sender as a deleted account, not the AI", () => {
    const deleted = { authorKind: "member" as const, senderId: null };
    expect(isAiMessage(deleted)).toBe(false);
    expect(isDeletedAccountMessage(deleted)).toBe(true);
  });

  it("does not treat a live member as deleted", () => {
    expect(
      isDeletedAccountMessage({ authorKind: "member", senderId: "user-1" })
    ).toBe(false);
  });

  it("always displays the AI as CityLink AI, whatever the snapshot says", () => {
    expect(
      displayAuthor({ authorKind: "ai", senderNameSnapshot: "anything" })
    ).toBe(AI_AUTHOR_NAME);
    expect(AI_AUTHOR_NAME).toBe("CityLink AI");
  });

  it("displays a member's snapshot, including for a deleted account", () => {
    expect(
      displayAuthor({ authorKind: "member", senderNameSnapshot: "Ada (left)" })
    ).toBe("Ada (left)");
  });
});

describe("who reads AI answers and who may ask", () => {
  it("lets active, left and removed members read them", () => {
    expect(canReadAiReplies("active")).toBe(true);
    expect(canReadAiReplies("left")).toBe(true);
    expect(canReadAiReplies("removed")).toBe(true);
  });

  it("refuses a non-member", () => {
    expect(canReadAiReplies("none")).toBe(false);
  });

  it("lets only active members of a live group ask", () => {
    expect(canAskAi("active", false)).toBe(true);
    expect(canAskAi("active", true)).toBe(false);
    expect(canAskAi("left", false)).toBe(false);
    expect(canAskAi("removed", false)).toBe(false);
    expect(canAskAi("none", false)).toBe(false);
  });
});
