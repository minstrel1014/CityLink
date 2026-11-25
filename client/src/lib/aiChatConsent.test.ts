import { describe, expect, it } from "vitest";
import * as consent from "./aiChatConsent";
import { CONTEXT_DROPPED_NOTICE } from "@shared/aiChatContext";
import { AI_REPLY_TRUNCATION_NOTICE } from "@shared/aiChatReply";
import {
  AI_CHAT_COPY,
  AI_CHAT_CONSENT_STATEMENTS,
  AI_CHAT_REQUIRED_PHRASES,
  decideAskAi,
  forgetConsent,
  initialConsentState,
  isConsentComplete,
  rememberConsent,
} from "./aiChatConsent";

function withLocalStorage(run: () => void): void {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  try {
    run();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

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

  it("remembers one acceptance instead of asking on every question", () => {
    withLocalStorage(() => {
      const scope = { userId: "u-1", groupId: "g-1" };
      expect(isConsentComplete(initialConsentState(scope))).toBe(false);
      expect(rememberConsent(scope)).toBe(false);
      expect(isConsentComplete(initialConsentState(scope))).toBe(true);
      expect(rememberConsent(scope)).toBe(true);
      forgetConsent(scope);
      expect(isConsentComplete(initialConsentState(scope))).toBe(false);
    });
  });

  it("asks again in a different group and for a different user", () => {
    withLocalStorage(() => {
      const alice = { userId: "u-alice", groupId: "g-1" };
      const bob = { userId: "u-bob", groupId: "g-1" };
      const other = { userId: "u-alice", groupId: "g-2" };
      rememberConsent(alice);
      expect(isConsentComplete(initialConsentState(alice))).toBe(true);
      expect(isConsentComplete(initialConsentState(other))).toBe(false);
      expect(isConsentComplete(initialConsentState(bob))).toBe(false);
      rememberConsent(other);
      expect(isConsentComplete(initialConsentState(alice))).toBe(true);
      expect(isConsentComplete(initialConsentState(other))).toBe(true);
      expect(isConsentComplete(initialConsentState(bob))).toBe(false);
    });
  });

  it("offers one box that agrees every statement", () => {
    expect(AI_CHAT_COPY.agreeAll).toBe("我已閱讀並同意以上全部");
    expect(AI_CHAT_CONSENT_STATEMENTS.length).toBeGreaterThanOrEqual(7);
    expect(
      isConsentComplete(
        Object.fromEntries(AI_CHAT_CONSENT_STATEMENTS.map(s => [s.id, true]))
      )
    ).toBe(true);
  });

  it("does not promise to ask again on every question", () => {
    const all = AI_CHAT_CONSENT_STATEMENTS.map(s => s.text).join(" ");
    expect(all).not.toContain("每次提問都會再要求");
    expect(all).toContain("這個群組只需要同意一次");
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

  it("says whose allowance ran out and when it comes back", () => {
    const copy = consent.AI_CHAT_COPY.rateLimited(65607, "group_daily");
    expect(copy).toContain("18 小時");
    expect(copy).toContain("全組共用");
    expect(copy).toMatch(/\d{2}:\d{2}/);
    expect(copy).not.toContain("45N06");
    const mine = consent.AI_CHAT_COPY.rateLimited(65607, "user_daily");
    expect(mine).toContain("你今天");
    expect(mine).not.toContain("全組共用");
  });
});
