/**
 * Context assembly for the shared group AI conversation.
 *
 * The product rules (Adam, 2026-11-24) are fixed and this module is the only
 * place they are implemented:
 *
 *   a. the question itself is always kept;
 *   b. at most the two most recent AI answers are carried, oldest dropped first;
 *   c. whatever budget is left goes to member messages, most recent first;
 *   d. if anything was dropped, the answer opens with a notice saying so.
 *
 * Budgets are characters, not words: 4,000 for the chat portion and 10,000 for
 * file text in total, with at most two files. Characters are counted with
 * `Array.from` so an emoji or a CJK character counts as one, which is what a
 * reader would count.
 */

export type ChatAuthorKind = "member" | "ai";

export interface ChatTurn {
  id: string;
  authorKind: ChatAuthorKind;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SelectableFile {
  id: string;
  groupId: string;
  name: string;
  text: string;
  status: "pending" | "current";
  retentionExpiresAt: string | null;
}

export interface AiChatContextInput {
  question: string;
  /** Chat messages, any order; the builder sorts by createdAt then id. */
  history: ChatTurn[];
  /** Files the member selected; filtering happens here, not in the UI. */
  files: SelectableFile[];
  /** Messages at or before this instant are out of context (the "clear" action). */
  contextStartsAt: string | null;
  groupId: string;
  now?: Date;
}

export interface AiChatContext {
  question: string;
  /** Selected turns, chronological. */
  turns: ChatTurn[];
  files: Array<{ id: string; name: string; text: string }>;
  /** True when any turn or file was left out. */
  dropped: boolean;
  /** Exact string to prefix to the answer, or null. */
  notice: string | null;
  stats: {
    chatChars: number;
    fileChars: number;
    aiAnswersIncluded: number;
    memberMessagesIncluded: number;
  };
}

export const AI_CHAT_LIMITS = {
  chatChars: 4_000,
  fileChars: 10_000,
  maxFiles: 2,
  maxAiAnswers: 2,
} as const;

export const CONTEXT_DROPPED_NOTICE = "（本次未包含較早的對話）";

export function charLength(text: string): number {
  return Array.from(text).length;
}

function sortChronological(turns: ChatTurn[]): ChatTurn[] {
  return [...turns].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

function afterCutoff(turn: ChatTurn, cutoff: string | null): boolean {
  if (cutoff === null) return true;
  return turn.createdAt > cutoff;
}

/**
 * A file may be sent only if it belongs to this group, is `current`, and has not
 * passed its retention date. Expired or replaced files are excluded here even if
 * a caller passes them, so the rule cannot be lost in a UI filter.
 */
export function isFileEligible(
  file: SelectableFile,
  groupId: string,
  now: Date
): boolean {
  if (file.groupId !== groupId) return false;
  if (file.status !== "current") return false;
  if (file.retentionExpiresAt === null) return true;
  const expiry = new Date(file.retentionExpiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry > now.getTime();
}

export function buildAiChatContext(input: AiChatContextInput): AiChatContext {
  const now = input.now ?? new Date();
  const question = input.question.trim();
  const inScope = sortChronological(
    input.history.filter(turn => afterCutoff(turn, input.contextStartsAt))
  );

  const aiAnswers = inScope.filter(turn => turn.authorKind === "ai");
  const memberMessages = inScope.filter(turn => turn.authorKind === "member");

  // Rule b: the two most recent AI answers, newest first while budgeting.
  const aiNewestFirst = [...aiAnswers].reverse();
  const keptAi: ChatTurn[] = [];
  let chatChars = 0;
  let dropped = aiAnswers.length > AI_CHAT_LIMITS.maxAiAnswers;

  for (const turn of aiNewestFirst) {
    if (keptAi.length >= AI_CHAT_LIMITS.maxAiAnswers) {
      dropped = true;
      continue;
    }
    const cost = charLength(turn.body);
    if (chatChars + cost > AI_CHAT_LIMITS.chatChars) {
      dropped = true;
      continue;
    }
    keptAi.push(turn);
    chatChars += cost;
  }

  // Rule c: the remaining budget goes to member messages, newest first.
  const keptMember: ChatTurn[] = [];
  for (const turn of [...memberMessages].reverse()) {
    const cost = charLength(turn.body);
    if (chatChars + cost > AI_CHAT_LIMITS.chatChars) {
      dropped = true;
      continue;
    }
    keptMember.push(turn);
    chatChars += cost;
  }

  // Files: at most two, in the order the caller supplied (the UI sends the ones
  // the member ticked), total text within the budget.
  const eligible = input.files.filter(file =>
    isFileEligible(file, input.groupId, now)
  );
  if (eligible.length < input.files.length) dropped = true;

  const selectedFiles: AiChatContext["files"] = [];
  let fileChars = 0;
  for (const file of eligible) {
    if (selectedFiles.length >= AI_CHAT_LIMITS.maxFiles) {
      dropped = true;
      continue;
    }
    const cost = charLength(file.text);
    if (fileChars + cost > AI_CHAT_LIMITS.fileChars) {
      dropped = true;
      continue;
    }
    selectedFiles.push({ id: file.id, name: file.name, text: file.text });
    fileChars += cost;
  }

  const turns = sortChronological([...keptAi, ...keptMember]);

  return {
    question,
    turns,
    files: selectedFiles,
    dropped,
    notice: dropped ? CONTEXT_DROPPED_NOTICE : null,
    stats: {
      chatChars,
      fileChars,
      aiAnswersIncluded: keptAi.length,
      memberMessagesIncluded: keptMember.length,
    },
  };
}

/**
 * The "clear context" action. It moves a timestamp and nothing else: no message
 * is deleted, and the returned value is what the RPC would store. Kept pure so
 * the test can assert that no message list is touched.
 */
export function clearAiChatContext(now: Date = new Date()): string {
  return now.toISOString();
}
