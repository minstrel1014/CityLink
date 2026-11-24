/**
 * Reply length policy for the group AI.
 *
 * Adam's numbers: aim for 1,200-1,500 characters, hard cap 2,500, and when the
 * cap is hit, cut the text, append a visible notice, and write a log entry. The
 * existing 4,000-character CHECK on `group_chat_messages.body` is untouched and
 * is not the limit that binds here.
 */

export const AI_REPLY_TARGET_MIN = 1_200;
export const AI_REPLY_TARGET_MAX = 1_500;
export const AI_REPLY_HARD_LIMIT = 2_500;
export const AI_REPLY_TRUNCATION_NOTICE = "（回答過長，已截斷）";

export interface ReplyLogEntry {
  event: "ai_reply_truncated";
  originalChars: number;
  keptChars: number;
  limit: number;
}

export type ReplyLogger = (entry: ReplyLogEntry) => void;

export interface FinalisedReply {
  body: string;
  truncated: boolean;
  chars: number;
}

export function charLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Applies the hard cap. The notice counts toward the 2,500, so the visible body
 * never exceeds the limit the product promised.
 */
export function finaliseAiReply(
  raw: string,
  options: { log?: ReplyLogger } = {},
): FinalisedReply {
  const trimmed = raw.trim();
  const total = charLength(trimmed);

  if (total <= AI_REPLY_HARD_LIMIT) {
    return { body: trimmed, truncated: false, chars: total };
  }

  const noticeCost = charLength(AI_REPLY_TRUNCATION_NOTICE);
  const keep = AI_REPLY_HARD_LIMIT - noticeCost;
  const body = `${Array.from(trimmed).slice(0, keep).join("")}${AI_REPLY_TRUNCATION_NOTICE}`;

  options.log?.({
    event: "ai_reply_truncated",
    originalChars: total,
    keptChars: keep,
    limit: AI_REPLY_HARD_LIMIT,
  });

  return { body, truncated: true, chars: charLength(body) };
}

/**
 * Whether a reply is inside the target band. The mock aims for it; a real model
 * cannot be forced to, so this is a check used by tests and by the log, not a
 * runtime rejection.
 */
export function isWithinTargetBand(body: string): boolean {
  const length = charLength(body);
  return length >= AI_REPLY_TARGET_MIN && length <= AI_REPLY_TARGET_MAX;
}

/** Prefixes the dropped-context notice when the context builder reports one. */
export function applyContextNotice(body: string, notice: string | null): string {
  if (notice === null) return body;
  if (body.startsWith(notice)) return body;
  return `${notice}\n\n${body}`;
}
