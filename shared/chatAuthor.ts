/**
 * Who wrote a group-chat message.
 *
 * The AI is not a member and has no profile, so its rows carry `sender_id = NULL`
 * and `sender_name_snapshot = 'CityLink AI'`. But `sender_id` also becomes NULL
 * when a profile is deleted (`ON DELETE SET NULL`), so NULL alone cannot tell an
 * AI message from a deleted account's message. Hence `author_kind`:
 *
 *   'member' - a person, possibly since deleted (sender_id may be NULL)
 *   'ai'     - CityLink AI
 *
 * The column does not exist yet; it is proposed in
 * `docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md` and must not be assumed present
 * in the database until that proposal is reviewed and applied.
 */

export type ChatAuthorKind = "member" | "ai";

export const AI_AUTHOR_NAME = "CityLink AI";

export interface ChatMessageRow {
  id: string;
  senderId: string | null;
  senderNameSnapshot: string;
  authorKind: ChatAuthorKind;
  body: string;
  createdAt: string;
}

export function isAiMessage(row: Pick<ChatMessageRow, "authorKind">): boolean {
  return row.authorKind === "ai";
}

/**
 * A member row with no sender is a deleted account, not the AI. Rendering it as
 * "CityLink AI" would put words in the product's mouth.
 */
export function isDeletedAccountMessage(
  row: Pick<ChatMessageRow, "authorKind" | "senderId">
): boolean {
  return row.authorKind === "member" && row.senderId === null;
}

export function displayAuthor(
  row: Pick<ChatMessageRow, "authorKind" | "senderNameSnapshot">
): string {
  return row.authorKind === "ai" ? AI_AUTHOR_NAME : row.senderNameSnapshot;
}

export type MembershipForReading = "active" | "left" | "removed" | "none";

/**
 * Who may read AI answers: exactly who may read the chat, which is the chat
 * predicate and **not** the file predicate. A member who left or was removed
 * keeps read access to history, and that includes the AI's answers in it - Adam's
 * decision, and the reason the disclosure text has to say so out loud.
 *
 * Note that an abandoned group is still readable: the page already shows
 * "former-member history access or an abandoned group" as read-only states.
 */
export function canReadAiReplies(membership: MembershipForReading): boolean {
  return membership !== "none";
}

/** Sending a new question is an active-member action. */
export function canAskAi(
  membership: MembershipForReading,
  groupAbandoned: boolean
): boolean {
  return membership === "active" && !groupAbandoned;
}
