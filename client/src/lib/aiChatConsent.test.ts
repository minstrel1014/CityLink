import { describe, expect, it } from "vitest";
import * as consent from "./aiChatConsent";
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

    state[AI_CHAT_CONSENT_STATEMENTS[AI_CHAT_CONSENT_STATEMENTS.length - 1].id] = true;
    expect(decideAskAi(state)).toEqual({ canAsk: true, reason: null });
  });

  it("does not treat a missing key as agreement", () => {
    expect(isConsentComplete({})).toBe(false);
  });

  it("exports nothing that would remember a choice", () => {
    const suspicious = Object.keys(consent).filter(key =>
      /storage|cookie|remember|persist/i.test(key),
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
    expect(AI_CHAT_REQUIRED_PHRASES.formerMembers).toBe("前成員仍可讀取 AI 回答");
  });

  it("names the provider, the route and the country", () => {
    expect(allText).toContain("OpenRouter");
    expect(allText).toContain("DeepSeek");
    expect(allText).toContain("中國大陸");
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
