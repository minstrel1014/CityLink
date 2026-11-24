import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResult,
  AnalysisSection,
} from "./types";
import { AnalysisProviderError } from "./types";

/**
 * Deterministic, offline implementation of `AnalysisProvider`.
 *
 * It exists for three reasons: the UI and the job lifecycle can be built and
 * tested without a key; the tests can assert a stable output shape instead of a
 * model's prose; and the consent screen has something to run against before the
 * real adapter exists. It performs no I/O of any kind - no fetch, no socket, no
 * file read.
 */
export class MockAnalysisProvider implements AnalysisProvider {
  readonly id = "mock";
  readonly requiresNetwork = false;

  constructor(private readonly options: { delayMs?: number } = {}) {}

  async analyse(
    request: AnalysisRequest,
    signal?: AbortSignal
  ): Promise<AnalysisResult> {
    if (this.options.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.options.delayMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(
            new AnalysisProviderError(
              "analysis_cancelled",
              "Analysis was cancelled."
            )
          );
        });
      });
    }
    if (signal?.aborted) {
      throw new AnalysisProviderError(
        "analysis_cancelled",
        "Analysis was cancelled."
      );
    }
    if (request.text.trim().length === 0) {
      throw new AnalysisProviderError(
        "analysis_provider_failed",
        "Mock provider received empty text."
      );
    }

    const objectives = readObjectives(request.plan.content);
    const paragraphs = request.text
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(block => block.length > 0);

    const sections: AnalysisSection[] = objectives.map((objective, index) => ({
      heading: objective,
      body: `Mock analysis for "${objective}". Evidence found in paragraph ${Math.min(
        index + 1,
        paragraphs.length
      )}: ${firstSentence(paragraphs[Math.min(index, paragraphs.length - 1)] ?? "")}`,
    }));

    const summary = [
      `Read ${request.text.length} characters from file ${request.fileId}.`,
      objectives.length > 0
        ? `Checked ${objectives.length} plan objective(s).`
        : "No plan objectives were supplied, so the answer is generic.",
      "Produced by the mock provider: no content left this process.",
    ].join(" ");

    return {
      providerId: this.id,
      model: null,
      summary,
      sections,
      citations: paragraphs
        .slice(0, 2)
        .map(paragraph => firstSentence(paragraph)),
      usage: {
        inputChars: request.text.length,
        outputChars:
          summary.length + sections.reduce((n, s) => n + s.body.length, 0),
      },
    };
  }
}

/** Plan content is free-form JSONB, so read it defensively. */
export function readObjectives(content: Record<string, unknown>): string[] {
  const raw = content.objectives;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .slice(0, 8);
}

function firstSentence(paragraph: string): string {
  const match = paragraph.match(/^[^.!?]*[.!?]/);
  return (match ? match[0] : paragraph).trim();
}
