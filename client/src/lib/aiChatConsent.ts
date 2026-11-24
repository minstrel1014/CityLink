/**
 * Disclosure and consent for the group AI conversation.
 *
 * Adam's 2026-11-24 design: the AI is not a member but participates like one; its
 * answers are written into the group chat and visible to the whole group; and
 * former members keep read access to that history. Those three facts are the
 * reason the disclosure is longer than "a third party will see this".
 *
 * The two sentences the product requires verbatim are marked below. They are
 * Chinese because the mandated wording is Chinese and the audience is Hong Kong
 * students; the surrounding chat UI stays English.
 *
 * Consent is per request: no storage key, no cookie, no "remember", so the next
 * question asks again.
 */

export interface ConsentStatement {
  id: string;
  text: string;
  /** Present when the product mandates the exact sentence. */
  requiredPhrase?: string;
}

export const AI_CHAT_REQUIRED_PHRASES = {
  readsChat: "AI 會讀取本群組聊天記錄",
  formerMembers: "前成員仍可讀取 AI 回答",
} as const;

export const AI_CHAT_CONSENT_STATEMENTS: readonly ConsentStatement[] = [
  {
    id: "reads-chat",
    text: "AI 會讀取本群組聊天記錄：本次提問、最近的對話，以及你選取的檔案文字，都會被用來產生回答。",
    requiredPhrase: AI_CHAT_REQUIRED_PHRASES.readsChat,
  },
  {
    id: "external-provider",
    text: "這些內容會離開 CityLink，送到外部 provider：OpenRouter 轉送 DeepSeek，而 DeepSeek 是中國大陸 provider，內容會在中國大陸處理。",
  },
  {
    id: "written-to-chat",
    text: "AI 的回答會以「CityLink AI」的名義寫進本群組聊天室，全組成員都看得到。",
  },
  {
    id: "former-members",
    text: "前成員仍可讀取 AI 回答：成員退出或被移除之後，聊天室歷史（包括 AI 的回答）仍然對他們可見。",
    requiredPhrase: AI_CHAT_REQUIRED_PHRASES.formerMembers,
  },
  {
    id: "per-question",
    text: "這次同意只涵蓋這一個問題，系統不會記住你的選擇，下一個問題會再問一次。",
  },
] as const;

export type ConsentState = Record<string, boolean>;

export function initialConsentState(): ConsentState {
  return Object.fromEntries(AI_CHAT_CONSENT_STATEMENTS.map(s => [s.id, false]));
}

export function isConsentComplete(state: ConsentState): boolean {
  return AI_CHAT_CONSENT_STATEMENTS.every(s => state[s.id] === true);
}

export type ConsentDecision =
  | { canAsk: true; reason: null }
  | { canAsk: false; reason: "ai_chat_consent_incomplete" };

export function decideAskAi(state: ConsentState): ConsentDecision {
  return isConsentComplete(state)
    ? { canAsk: true, reason: null }
    : { canAsk: false, reason: "ai_chat_consent_incomplete" };
}

/** Copy for the states the drawer can show, kept next to the disclosure. */
export const AI_CHAT_COPY = {
  button: "Ask CityLink AI",
  drawerTitle: "CityLink AI",
  drawerSubtitle: "一個問題、全組共用的一條對話。回答會寫進聊天室。",
  contextCleared: "已清空 context：只移動了時間戳，沒有任何訊息被刪除。",
  noFiles: "本群組目前沒有可選取的檔案（僅限 current 且未過期的檔案）。",
  emptyQuestion: "請先輸入問題。",
  truncation: "（回答過長，已截斷）",
  droppedContext: "（本次未包含較早的對話）",
  clearContext: "清空 context",
  send: "送出提問",
  cancel: "取消",
} as const;
