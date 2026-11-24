import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnalysisProviderError,
  DEFAULT_ANALYSIS_PROVIDER,
  MockAnalysisProvider,
  createAnalysisProvider,
} from "./index";
import { readObjectives } from "./mock";

const plan = {
  content: { objectives: ["Summarise the brief", "List the deadlines"] },
  revision: 3,
};

const request = {
  groupId: "group-1",
  fileId: "file-1",
  text: "The brief asks for a prototype. The report is due in week 10.\n\nLate work loses ten percent.",
  plan,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the provider boundary", () => {
  it("defaults to the offline mock", () => {
    const provider = createAnalysisProvider(DEFAULT_ANALYSIS_PROVIDER);
    expect(provider.id).toBe("mock");
    expect(provider.requiresNetwork).toBe(false);
  });

  it("refuses an unconfigured provider instead of falling back", () => {
    expect(() => createAnalysisProvider("openrouter")).toThrowError(
      AnalysisProviderError
    );
    try {
      createAnalysisProvider("openrouter");
    } catch (error) {
      expect((error as AnalysisProviderError).code).toBe(
        "analysis_provider_not_configured"
      );
    }
  });
});

describe("the mock provider", () => {
  it("never touches the network", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("the mock provider must not call fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await new MockAnalysisProvider().analyse(request);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.providerId).toBe("mock");
  });

  it("is deterministic, so tests can assert a shape", async () => {
    const provider = new MockAnalysisProvider();
    const first = await provider.analyse(request);
    const second = await provider.analyse(request);
    expect(second).toEqual(first);
  });

  it("answers each plan objective, in order", async () => {
    const result = await new MockAnalysisProvider().analyse(request);
    expect(result.sections.map(section => section.heading)).toEqual([
      "Summarise the brief",
      "List the deadlines",
    ]);
    expect(result.summary).toContain("Checked 2 plan objective(s).");
  });

  it("says plainly when there is no plan yet", async () => {
    const result = await new MockAnalysisProvider().analyse({
      ...request,
      plan: { content: {}, revision: 0 },
    });
    expect(result.summary).toContain("No plan objectives were supplied");
    expect(result.sections).toHaveLength(0);
  });

  it("cites verbatim spans of the input", async () => {
    const result = await new MockAnalysisProvider().analyse(request);
    expect(result.citations.length).toBeGreaterThan(0);
    for (const citation of result.citations) {
      expect(request.text).toContain(citation);
    }
  });

  it("reports character usage without inventing token counts", async () => {
    const result = await new MockAnalysisProvider().analyse(request);
    expect(result.usage.inputChars).toBe(request.text.length);
    expect(result.usage.outputChars).toBeGreaterThan(0);
    expect(result.model).toBeNull();
  });

  it("fails loudly on empty text rather than returning an empty answer", async () => {
    await expect(
      new MockAnalysisProvider().analyse({ ...request, text: "   " })
    ).rejects.toMatchObject({ code: "analysis_provider_failed" });
  });

  it("honours cancellation", async () => {
    const controller = new AbortController();
    const provider = new MockAnalysisProvider({ delayMs: 50 });
    const pending = provider.analyse(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "analysis_cancelled" });
  });
});

describe("reading plan content defensively", () => {
  it("keeps only non-empty strings and caps the list", () => {
    const content = {
      objectives: [
        "one",
        "  ",
        42,
        null,
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
      ],
    };
    const objectives = readObjectives(content);
    expect(objectives).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
    ]);
  });

  it("returns nothing when the field is missing or not an array", () => {
    expect(readObjectives({})).toEqual([]);
    expect(readObjectives({ objectives: "one" })).toEqual([]);
  });
});
