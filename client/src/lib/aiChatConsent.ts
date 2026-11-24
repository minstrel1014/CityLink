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
 * UI consent is per request: no storage key, no cookie, no "remember" here, so the
 * next question asks again.
 *
 * Adam's F-11 ruling (2026-11-24) changes what the SERVER knows: acceptance is
 * recorded once on the server (`profiles.ai_disclosure_accepted_at`, written by the
 * `accept_ai_disclosure()` RPC) and `begin_group_ai_request` refuses with
 * `group_ai_disclosure_required` (45N09) when it is missing. That timestamp is the
 * authoritative gate; this module's checkboxes are a UI promise repeated every
 * question, and neither side pretends otherwise. The module deliberately keeps no
 * acceptance state of its own, so nothing here can drift out of sync with the server.
 *
 * Adam's F-12 ruling (2026-11-24, option c) is that there is no group-level AI switch
 * and no per-member opt-out: one member's question sends other members' chat and this
 * group's file text. The disclosure therefore has to say that out loud, which is the
 * `others-data` statement below.
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
    id: "others-data",
    text: "其他成員無法單獨退出：你提問時，送出的內容包含本群組其他成員的聊天記錄與本群組檔案的文字，群組沒有 AI 開關，成員也沒有個人退出選項。",
  },
  {
    id: "per-question",
    text: "這個介面每次提問都會再要求你勾選，不會記住這個介面的勾選狀態。",
  },
  {
    id: "server-recorded",
    text: "你第一次接受時，伺服器會記住「此帳號已看過本揭露」這一個時間點（只記錄時間，不記錄其他資料）；之後每次提問仍會要求你在介面再確認一次。",
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
  filesUnavailable: "檔案清單暫時無法載入，請稍後再試。",
  emptyQuestion: "請先輸入問題。",
  truncation: "（回答過長，已截斷）",
  droppedContext: "（本次未包含較早的對話）",
  fileNotRead: "（部分選取檔案沒有可讀文字）",
  /**
   * N-6: both dropped notices can apply to one answer. Order is fixed here so the
   * drawer and the server-side assembly cannot each invent their own: context first,
   * then files, at most once each, before the answer body.
   */
  noticeOrder: ["droppedContext", "fileNotRead"] as readonly (
    | "droppedContext"
    | "fileNotRead"
  )[],
  disclosureRequired:
    "請先確認已閱讀 AI 揭露（伺服器會記錄你已看過，但不記錄其他資料）。",
  providerFailed: "CityLink AI 暫時無法回答，請稍後再試。",
  rateLimited: (retryAfter: number) =>
    `今天在這裡問得太多了，請 ${retryAfter} 秒後再試。`,
  clearContext: "清空 context",
  send: "送出提問",
  cancel: "取消",
} as const;
