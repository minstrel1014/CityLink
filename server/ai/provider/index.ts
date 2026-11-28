import { MockAnalysisProvider } from "./mock";
import { AnalysisProviderError, type AnalysisProvider } from "./types";

export type { AnalysisProvider, AiChatReply, AiChatRequest } from "./types";
export { AnalysisProviderError } from "./types";
export { MockAnalysisProvider } from "./mock";

/**
 * The single file to edit when the real provider is approved.
 *
 * A factory rather than a direct import, because an accidental
 * `new OpenRouterProvider()` somewhere in the call path would be a credential and
 * disclosure defect no test would catch. The swap is this file plus one adapter,
 * and the default stays offline.
 */
export function createAnalysisProvider(name: string): AnalysisProvider {
  switch (name) {
    case "mock":
      return new MockAnalysisProvider();
    default:
      throw new AnalysisProviderError(
        "analysis_provider_not_configured",
        `No analysis provider is configured for "${name}". Only "mock" is available on this branch.`
      );
  }
}

/** Name reported by the health endpoint and stored alongside the AI message. */
export const DEFAULT_ANALYSIS_PROVIDER = "mock";
