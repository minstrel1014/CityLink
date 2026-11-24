/**
 * The boundary between CityLink and whatever answers the group's question.
 *
 * The shape is the chat one, not the old plan one: a question, the assembled
 * context (recent chat plus selected file text) and nothing else. Assembly
 * happens in `shared/aiChatContext.ts`, so a provider never sees a message the
 * budget excluded and never decides what to include.
 *
 * Only a mock implements this on the branch. The OpenRouter/DeepSeek adapter is a
 * later, separately authorised assignment: it needs a key, an approved disclosure
 * text and a decision on where the call runs.
 */
import type { ChatTurn } from "../../../shared/aiChatContext";

export interface AiChatRequest {
  groupId: string;
  /** The member's question, always included. */
  question: string;
  /** Selected chat turns, chronological. May be empty. */
  turns: ChatTurn[];
  /** Selected file text, already filtered for status and retention. */
  files: Array<{ id: string; name: string; text: string }>;
  /** Notice to prefix when context was dropped, or null. */
  contextNotice: string | null;
  locale?: string;
}

export interface AiChatReply {
  providerId: string;
  model: string | null;
  /** Answer text before the length policy is applied. */
  body: string;
  usage: {
    inputChars: number;
    outputChars: number;
    turnsUsed: number;
    filesUsed: number;
  };
}

export interface AnalysisProvider {
  readonly id: string;
  /**
   * True when `answer` leaves the process. The mock sets this to false; the UI
   * reads it to decide whether the consent screen is required, so a provider
   * that sends content off-site cannot be added without declaring it.
   */
  readonly requiresNetwork: boolean;
  answer(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatReply>;
}

export class AnalysisProviderError extends Error {
  constructor(
    readonly code:
      | "analysis_provider_not_configured"
      | "analysis_provider_failed"
      | "analysis_cancelled",
    message: string,
  ) {
    super(message);
    this.name = "AnalysisProviderError";
  }
}
