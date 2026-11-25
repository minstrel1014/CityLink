import { describe, expect, it } from "vitest";
import * as consent from "./aiChatConsent";
import { CONTEXT_DROPPED_NOTICE } from "@shared/aiChatContext";
import { AI_REPLY_TRUNCATION_NOTICE } from "@shared/aiChatReply";
import {
  AI_CHAT_CONSENT_STATEMENTS,
  AI_CHAT_REQUIRED_PHRASES,
  decideAskAi,
  initialConsentState,
  isConsentComplete,
} from "./aiChatConsent";

describe("consent starts empty and stays per question", () => {
  it("presents every statement unticked", () => {
    const state = initialConsentState();
    expect(Object.values(state).every(value => value === false)).toBe(true);
    expect(isConsentComplete(state)).toBe(false);
  });

  it("refuses with a token the drawer can map", () => {
    expect(decideAskAi(initialConsentState())).toEqual({
      canAsk: false,
      reason: "ai_chat_consent_incomplete",
    });
  });

  it("allows only when every statement is ticked", () => {
    const state = initialConsentState();
    for (const statement of AI_CHAT_CONSENT_STATEMENTS.slice(0, -1)) {
      state[statement.id] = true;
    }
    expect(isConsentComplete(state)).toBe(false);

    state[
      AI_CHAT_CONSENT_STATEMENTS[AI_CHAT_CONSENT_STATEMENTS.length - 1].id
    ] = true;
    expect(decideAskAi(state)).toEqual({ canAsk: true, reason: null });
  });

  it("does not treat a missing key as agreement", () => {
    expect(isConsentComplete({})).toBe(false);
  });

  it("exports nothing that would remember a choice", () => {
    const suspicious = Object.keys(consent).filter(key =>
      /storage|cookie|remember|persist/i.test(key)
    );
    expect(suspicious).toEqual([]);
  });
});

describe("the two mandated sentences appear verbatim", () => {
  const allText = AI_CHAT_CONSENT_STATEMENTS.map(s => s.text).join(" ");

  it("says the AI reads this group's chat", () => {
    expect(allText).toContain("AI 會讀取本群組聊天記錄");
    expect(AI_CHAT_REQUIRED_PHRASES.readsChat).toBe("AI 會讀取本群組聊天記錄");
  });

  it("says former members can still read AI answers", () => {
    expect(allText).toContain("前成員仍可讀取 AI 回答");
    expect(AI_CHAT_REQUIRED_PHRASES.formerMembers).toBe(
      "前成員仍可讀取 AI 回答"
    );
  });

  it("names the provider and the country", () => {
    expect(allText).toContain("xAI");
    expect(allText).toContain("美國");
  });
  it("does not name a provider we no longer call", () => {
    expect(allText).not.toContain("OpenRouter");
    expect(allText).not.toContain("DeepSeek");
    expect(allText).not.toContain("中國大陸");
  });

  it("says the answer is written into the group chat", () => {
    expect(allText).toContain("CityLink AI");
    expect(allText).toMatch(/寫進本群組聊天室/);
  });

  it("marks which statements carry a mandated phrase", () => {
    const withPhrase = AI_CHAT_CONSENT_STATEMENTS.filter(s => s.requiredPhrase);
    expect(withPhrase.map(s => s.id)).toEqual(["reads-chat", "former-members"]);
  });
});

describe("Adam's F-11 and F-12 rulings appear in the disclosure", () => {
  const allText = AI_CHAT_CONSENT_STATEMENTS.map(s => s.text).join(" ");

  it("states that other members cannot opt out (F-12, option c)", () => {
    // Adam chose neither a group switch nor a member opt-out, which is only defensible
    // if the disclosure says it out loud.
    expect(allText).toContain("無法單獨退出");
    expect(allText).toContain("本群組其他成員的聊天記錄");
    expect(allText).toContain("本群組檔案");
    expect(allText).toContain("沒有 AI 開關");
  });

  it("states that acceptance is recorded once on the server (F-11)", () => {
    expect(allText).toContain("伺服器");
    expect(allText).toContain("記錄");
    // The gate lives in SQL (45N09 group_ai_disclosure_required). This module must not
    // keep its own acceptance state, or the two records can disagree.
    const acceptanceHelpers = Object.keys(consent).filter(key =>
      /^accept|^record|^store/i.test(key)
    );
    expect(acceptanceHelpers).toEqual([]);
  });

  it("still marks only the two product-mandated sentences", () => {
    const withPhrase = AI_CHAT_CONSENT_STATEMENTS.filter(s => s.requiredPhrase);
    expect(withPhrase.map(s => s.id)).toEqual(["reads-chat", "former-members"]);
    expect(AI_CHAT_CONSENT_STATEMENTS).toHaveLength(7);
  });
});

describe("answer notices have one pinned order and one source of truth", () => {
  it("puts the dropped-context notice before the file notice (N-6)", () => {
    expect(consent.AI_CHAT_COPY.noticeOrder).toEqual([
      "droppedContext",
      "fileNotRead",
    ]);
  });

  it("reuses the shared notice strings instead of retyping them", () => {
    expect(consent.AI_CHAT_COPY.droppedContext).toBe(CONTEXT_DROPPED_NOTICE);
    expect(consent.AI_CHAT_COPY.truncation).toBe(AI_REPLY_TRUNCATION_NOTICE);
    expect(consent.AI_CHAT_COPY.fileNotRead).toBe(
      "（部分選取檔案沒有可讀文字）"
    );
  });

  it("keeps rate-limit copy tied to the retry_after seconds", () => {
    expect(consent.AI_CHAT_COPY.rateLimited(15)).toContain("15");
    expect(consent.AI_CHAT_COPY.rateLimited(1)).toContain("1 秒");
  });
});
