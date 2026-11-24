import { describe, expect, it } from "vitest";
import * as consent from "./groupAnalysisConsent";
import {
  CONSENT_STATEMENTS,
  decideStartAnalysis,
  initialConsentState,
  isConsentComplete,
} from "./groupAnalysisConsent";

describe("consent starts empty", () => {
  it("presents every statement unticked", () => {
    const state = initialConsentState();
    expect(Object.keys(state)).toHaveLength(CONSENT_STATEMENTS.length);
    expect(Object.values(state).every(value => value === false)).toBe(true);
    expect(isConsentComplete(state)).toBe(false);
  });

  it("requires all statements, not a majority", () => {
    const state = initialConsentState();
    CONSENT_STATEMENTS.forEach((statement, index) => {
      state[statement.id] = index < CONSENT_STATEMENTS.length - 1;
    });
    expect(isConsentComplete(state)).toBe(false);

    state[CONSENT_STATEMENTS[CONSENT_STATEMENTS.length - 1].id] = true;
    expect(isConsentComplete(state)).toBe(true);
  });

  it("does not treat a missing key as agreement", () => {
    expect(isConsentComplete({})).toBe(false);
  });
});

describe("the submit guard", () => {
  it("refuses with a token the UI can map", () => {
    expect(decideStartAnalysis(initialConsentState())).toEqual({
      canStart: false,
      reason: "consent_incomplete",
    });
  });

  it("allows only when every statement is ticked", () => {
    const state = initialConsentState();
    for (const statement of CONSENT_STATEMENTS) state[statement.id] = true;
    expect(decideStartAnalysis(state)).toEqual({
      canStart: true,
      reason: null,
    });
  });
});

describe("the disclosure says what it has to say", () => {
  const allText = CONSENT_STATEMENTS.map(statement => statement.text).join(" ");

  it("states that content leaves CityLink", () => {
    expect(allText).toMatch(/leaves CityLink/i);
  });

  it("names the provider and the country it processes in", () => {
    expect(allText).toMatch(/DeepSeek/);
    expect(allText).toMatch(/mainland-China/);
  });

  it("says the agreement covers one analysis only", () => {
    expect(allText).toMatch(/one analysis only/i);
  });
});

describe("consent is not persisted", () => {
  it("exports nothing that would remember a choice", () => {
    const suspicious = Object.keys(consent).filter(key =>
      /storage|cookie|remember|persist/i.test(key)
    );
    expect(suspicious).toEqual([]);
  });
});
