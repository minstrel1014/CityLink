import { MockAnalysisProvider } from "./mock";
import { AnalysisProviderError, type AnalysisProvider } from "./types";

export type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResult,
} from "./types";
export { AnalysisProviderError } from "./types";
export { MockAnalysisProvider } from "./mock";

/**
 * The single file to edit when the real provider is approved.
 *
 * Why a factory instead of a direct import: the mock is the only implementation
 * that may exist on this branch, and an accidental `new OpenRouterProvider()`
 * somewhere in the call path would be a credential and disclosure defect that
 * no test would catch. Keeping construction in one place means the swap is a
 * reviewable diff of this file plus one new adapter, and the default stays
 * offline.
 *
 * The OpenRouter/DeepSeek adapter is a later, separate assignment: it needs an
 * approved key, an approved disclosure text and a decision on where the call
 * runs. Until then `createAnalysisProvider()` refuses every other name rather
 * than silently falling back to the mock, because a silent fallback would make
 * a misconfigured deployment look like a working one.
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

/** Name reported by the health endpoint and stored on the job row. */
export const DEFAULT_ANALYSIS_PROVIDER = "mock";
