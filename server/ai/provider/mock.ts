import { composeMockReply } from "../../../shared/aiChatMockReply";
import type { AnalysisProvider, AiChatReply, AiChatRequest } from "./types";
import { AnalysisProviderError } from "./types";

/**
 * Deterministic, offline implementation of the chat provider.
 *
 * It exists so the drawer, the context rules and the length policy can be built
 * and tested without a key. No I/O of any kind: no fetch, no socket, no file
 * read. The wording comes from `shared/aiChatMockReply.ts`, which the client
 * drawer uses too, so the preview and the tests cannot drift.
 */
export class MockAnalysisProvider implements AnalysisProvider {
  readonly id = "mock";
  readonly requiresNetwork = false;

  constructor(private readonly options: { delayMs?: number } = {}) {}

  async answer(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatReply> {
    if (this.options.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.options.delayMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new AnalysisProviderError("analysis_cancelled", "Answer was cancelled."));
        });
      });
    }
    if (signal?.aborted) {
      throw new AnalysisProviderError("analysis_cancelled", "Answer was cancelled.");
    }
    if (request.question.trim().length === 0) {
      throw new AnalysisProviderError(
        "analysis_provider_failed",
        "Mock provider received an empty question.",
      );
    }

    const body = composeMockReply({
      question: request.question,
      turns: request.turns,
      files: request.files,
    });

    const inputChars =
      Array.from(request.question).length +
      request.turns.reduce((sum, turn) => sum + Array.from(turn.body).length, 0) +
      request.files.reduce((sum, file) => sum + Array.from(file.text).length, 0);

    return {
      providerId: this.id,
      model: null,
      body,
      usage: {
        inputChars,
        outputChars: Array.from(body).length,
        turnsUsed: request.turns.length,
        filesUsed: request.files.length,
      },
    };
  }
}
