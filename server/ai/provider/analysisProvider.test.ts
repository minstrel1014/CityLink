import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnalysisProviderError,
  DEFAULT_ANALYSIS_PROVIDER,
  MockAnalysisProvider,
  createAnalysisProvider,
} from "./index";
import type { AiChatRequest } from "./types";

const turn = (id: string, authorKind: "member" | "ai", body: string) => ({
  id,
  authorKind,
  authorName: authorKind === "ai" ? "CityLink AI" : "Ada",
  body,
  createdAt: "2026-11-24T10:00:00.000Z",
});

const request: AiChatRequest = {
  groupId: "group-1",
  question: "What did we decide about the storage layer?",
  turns: [turn("m1", "member", "We should keep it provider-neutral.")],
  files: [
    { id: "f1", name: "brief.pdf", text: "The brief asks for a prototype." },
  ],
  contextNotice: null,
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

    const reply = await new MockAnalysisProvider().answer(request);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reply.providerId).toBe("mock");
  });

  it("is deterministic", async () => {
    const provider = new MockAnalysisProvider();
    expect(await provider.answer(request)).toEqual(
      await provider.answer(request)
    );
  });

  it("aims for the 1,200-1,500 character band", async () => {
    const reply = await new MockAnalysisProvider().answer(request);
    const chars = Array.from(reply.body).length;
    expect(chars).toBeGreaterThanOrEqual(1_200);
    expect(chars).toBeLessThanOrEqual(1_500);
  });

  it("answers from the context it was given", async () => {
    const reply = await new MockAnalysisProvider().answer(request);
    expect(reply.body).toContain("brief.pdf");
    expect(reply.usage.turnsUsed).toBe(1);
    expect(reply.usage.filesUsed).toBe(1);
  });

  it("says so when no file was selected", async () => {
    const reply = await new MockAnalysisProvider().answer({
      ...request,
      files: [],
    });
    expect(reply.body).toContain("沒有選取檔案");
  });

  it("fails loudly on an empty question", async () => {
    await expect(
      new MockAnalysisProvider().answer({ ...request, question: "   " })
    ).rejects.toMatchObject({ code: "analysis_provider_failed" });
  });

  it("honours cancellation", async () => {
    const controller = new AbortController();
    const provider = new MockAnalysisProvider({ delayMs: 50 });
    const pending = provider.answer(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "analysis_cancelled" });
  });
});
