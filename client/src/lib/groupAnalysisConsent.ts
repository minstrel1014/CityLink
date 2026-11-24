/**
 * Disclosure and consent for group-file analysis.
 *
 * Adam's 2026-11-23 decision (contract section 1, item 4) is that file content
 * may leave CityLink for a third-party provider, but only after the user is told
 * so and agrees, per analysis. Three consequences shape this module:
 *
 * 1. The disclosure names the destination, not just "a third party". DeepSeek is
 *    a mainland-China provider, and a student deciding whether to upload a
 *    supervisor's draft is entitled to know that before the bytes move.
 * 2. Consent is per analysis. There is no storage key, no cookie and no
 *    "remember my choice", so a second file asks again. That is deliberate: a
 *    remembered consent would silently cover a different file later.
 * 3. Nothing is pre-ticked. `initialConsentState()` returns all false, and the
 *    submit guard reads the state rather than trusting the button.
 */

export interface ConsentStatement {
  id: string;
  text: string;
}

export const CONSENT_STATEMENTS: readonly ConsentStatement[] = [
  {
    id: "leaves-citylink",
    text: "The text of this file leaves CityLink and is sent to an external AI provider for analysis.",
  },
  {
    id: "names-provider",
    text: "The provider is OpenRouter, which routes the request to DeepSeek. DeepSeek is a mainland-China provider, so the text is processed outside Hong Kong.",
  },
  {
    id: "per-analysis",
    text: "This agreement covers this one analysis only. Nothing is remembered, and the next file asks again.",
  },
] as const;

export type ConsentState = Record<string, boolean>;

export function initialConsentState(): ConsentState {
  return Object.fromEntries(
    CONSENT_STATEMENTS.map(statement => [statement.id, false])
  );
}

export function isConsentComplete(state: ConsentState): boolean {
  return CONSENT_STATEMENTS.every(statement => state[statement.id] === true);
}

export type ConsentDecision =
  | { canStart: true; reason: null }
  | { canStart: false; reason: "consent_incomplete" };

/**
 * Whether the "Send for analysis" action may proceed. Called by the component on
 * every render and again on submit, so a state change between render and click
 * cannot slip through.
 */
export function decideStartAnalysis(state: ConsentState): ConsentDecision {
  return isConsentComplete(state)
    ? { canStart: true, reason: null }
    : { canStart: false, reason: "consent_incomplete" };
}

/**
 * Copy shown when a file could not be parsed. Kept here, next to the consent
 * text, because both are user-facing statements about the same pipeline and must
 * not drift apart: an unparseable file is still uploaded, still downloadable and
 * still visible in the list.
 */
export const UNSUPPORTED_FORMAT_COPY =
  "Uploaded. This format cannot be analysed yet, but the file is still available to download.";

export const ANALYSIS_FAILED_COPY =
  "Uploaded. The analysis failed, and the file is unaffected. You can try again later.";
