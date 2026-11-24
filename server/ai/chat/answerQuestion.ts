import {
  buildAiChatContext,
  type AiChatContext,
  type AiChatContextInput,
} from "../../../shared/aiChatContext";
import {
  applyContextNotice,
  finaliseAiReply,
  type FinalisedReply,
  type ReplyLogger,
} from "../../../shared/aiChatReply";
import type { AnalysisProvider } from "../provider/types";

/**
 * The one place a group question becomes a chat message body.
 *
 * Order matters and is deliberate:
 *   1. assemble the context (budgets, dropped-context flag);
 *   2. ask the provider for a raw answer;
 *   3. prefix the dropped-context notice, because the reader must know the
 *      answer saw less than the whole conversation;
 *   4. apply the 2,500-character hard cap last, so truncation counts the notice.
 *
 * Doing 4 before 3 would let the notice be cut off, which is the one part of the
 * message that must never disappear.
 */
export interface AnswerQuestionDeps {
  provider: AnalysisProvider;
  log?: ReplyLogger;
  signal?: AbortSignal;
}

export interface AnswerQuestionResult extends FinalisedReply {
  providerId: string;
  model: string | null;
  context: AiChatContext;
}

export async function answerGroupQuestion(
  input: AiChatContextInput,
  deps: AnswerQuestionDeps,
): Promise<AnswerQuestionResult> {
  const context = buildAiChatContext(input);

  const reply = await deps.provider.answer(
    {
      groupId: input.groupId,
      question: context.question,
      turns: context.turns,
      files: context.files,
      contextNotice: context.notice,
    },
    deps.signal,
  );

  const withNotice = applyContextNotice(reply.body, context.notice);
  const finalised = finaliseAiReply(withNotice, { log: deps.log });

  return {
    ...finalised,
    providerId: reply.providerId,
    model: reply.model,
    context,
  };
}
