/**
 * The boundary between CityLink and whatever produces an analysis.
 *
 * Everything above this file - the job row, the extraction module, the consent
 * screen - is provider-independent on purpose: the provider decision is Adam's
 * (OpenRouter + DeepSeek), the account and the key are not available to this
 * branch, and the shape of a real request is not settled until the disclosure
 * text is approved. So the contract is defined here and only a mock implements
 * it. Adding the real adapter means adding one file and one case in
 * `server/ai/provider/index.ts`; nothing else should need to change.
 */

/** The plan a group has saved, as the RPC returns it. */
export interface AnalysisPlan {
  /** Free-form JSONB in `public.group_analysis_plans.content`. */
  content: Record<string, unknown>;
  /** `public.group_analysis_plans.revision`; 0 means "no plan saved yet". */
  revision: number;
}

export interface AnalysisRequest {
  groupId: string;
  fileId: string;
  /** Extracted text only. The provider never receives the file itself. */
  text: string;
  plan: AnalysisPlan;
  /** BCP-47 tag the group writes in, used to keep the answer in the same language. */
  locale?: string;
}

export interface AnalysisSection {
  heading: string;
  body: string;
}

export interface AnalysisResult {
  providerId: string;
  /** Null for providers that do not expose a model name. */
  model: string | null;
  summary: string;
  sections: AnalysisSection[];
  /** Verbatim spans of the input the answer relies on; empty is allowed. */
  citations: string[];
  usage: {
    inputChars: number;
    outputChars: number;
  };
}

export interface AnalysisProvider {
  readonly id: string;
  /**
   * True when `analyse` leaves the process. The mock sets this to false and the
   * UI uses it to decide whether the consent screen is required, so a provider
   * that sends content off-site cannot be added without declaring it.
   */
  readonly requiresNetwork: boolean;
  analyse(
    request: AnalysisRequest,
    signal?: AbortSignal
  ): Promise<AnalysisResult>;
}

export class AnalysisProviderError extends Error {
  constructor(
    readonly code:
      | "analysis_provider_not_configured"
      | "analysis_provider_failed"
      | "analysis_cancelled",
    message: string
  ) {
    super(message);
    this.name = "AnalysisProviderError";
  }
}
