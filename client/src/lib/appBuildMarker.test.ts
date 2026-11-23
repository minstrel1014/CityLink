import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_BUILD_MARKER_PATH,
  GROUP_CAPACITY_UPGRADE_REQUIRED_TOKEN,
  compareAppBuildMarkers,
  loadPublishedAppBuildMarker,
  parsePublishedAppBuildMarker,
  probeAppBuildFreshness,
  readLoadedAppBuildMarker,
  resetAppBuildFreshnessProbe,
  type AppBuildMarkerFetch,
} from "./appBuildMarker";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetAppBuildFreshnessProbe();
});

describe("loaded build marker", () => {
  it("reads only the identifiers the build actually supplied", () => {
    expect(
      readLoadedAppBuildMarker({
        VITE_APP_BUILD_ID: "  344c1058e78f  ",
        VITE_APP_VERSION: "1.0.0",
      })
    ).toEqual({ buildId: "344c1058e78f", version: "1.0.0" });
    expect(readLoadedAppBuildMarker({ VITE_APP_BUILD_ID: "build-7" })).toEqual({
      buildId: "build-7",
      version: null,
    });
  });

  it("reports no marker instead of fabricating one", () => {
    expect(readLoadedAppBuildMarker({})).toBeNull();
    expect(readLoadedAppBuildMarker({ VITE_APP_BUILD_ID: "   " })).toBeNull();
    expect(readLoadedAppBuildMarker({ VITE_APP_BUILD_ID: 42 })).toBeNull();
    expect(
      readLoadedAppBuildMarker({ VITE_APP_BUILD_ID: "x".repeat(201) })
    ).toBeNull();
    expect(readLoadedAppBuildMarker(undefined)).toBeNull();
  });

  it("exposes the approved stable token and marker path unchanged", () => {
    expect(GROUP_CAPACITY_UPGRADE_REQUIRED_TOKEN).toBe(
      "group_capacity_upgrade_required"
    );
    expect(APP_BUILD_MARKER_PATH).toBe("/version.json");
  });
});

describe("published build marker", () => {
  it("parses only a well-formed published marker", () => {
    expect(
      parsePublishedAppBuildMarker({ buildId: "build-7", version: "1.0.0" })
    ).toEqual({ buildId: "build-7", version: "1.0.0" });
    expect(parsePublishedAppBuildMarker({ version: "1.0.0" })).toBeNull();
    expect(parsePublishedAppBuildMarker({ buildId: "" })).toBeNull();
    expect(parsePublishedAppBuildMarker({ buildId: 7 })).toBeNull();
    expect(parsePublishedAppBuildMarker([{ buildId: "build-7" }])).toBeNull();
    expect(parsePublishedAppBuildMarker("build-7")).toBeNull();
    expect(parsePublishedAppBuildMarker(null)).toBeNull();
  });

  it("requests the marker with no-store so the browser cache cannot answer", async () => {
    const seen: Array<{ input: string; cache?: string }> = [];
    const fetchImpl: AppBuildMarkerFetch = vi.fn(
      async (input: string, init?: { cache?: string }) => {
        seen.push({ input, cache: init?.cache });
        return { ok: true, json: async () => ({ buildId: "build-8" }) };
      }
    ) as unknown as AppBuildMarkerFetch;

    await expect(loadPublishedAppBuildMarker(fetchImpl)).resolves.toEqual({
      buildId: "build-8",
      version: null,
    });
    expect(seen).toEqual([{ input: "/version.json", cache: "no-store" }]);
  });

  it("collapses transport, status and body problems to no marker", async () => {
    await expect(
      loadPublishedAppBuildMarker(
        vi.fn(async () => {
          throw new Error("offline");
        }) as unknown as AppBuildMarkerFetch
      )
    ).resolves.toBeNull();
    await expect(
      loadPublishedAppBuildMarker(
        vi.fn(async () => ({
          ok: false,
          json: async () => ({}),
        })) as unknown as AppBuildMarkerFetch
      )
    ).resolves.toBeNull();
    await expect(
      loadPublishedAppBuildMarker(
        vi.fn(async () => ({
          ok: true,
          json: async () => {
            throw new Error("not json");
          },
        })) as unknown as AppBuildMarkerFetch
      )
    ).resolves.toBeNull();
  });
});

describe("freshness comparison", () => {
  it("compares identifiers and nothing else", () => {
    const loaded = { buildId: "build-7", version: "1.0.0" };
    expect(
      compareAppBuildMarkers(loaded, { buildId: "build-7", version: "9.9.9" })
    ).toBe("fresh");
    expect(
      compareAppBuildMarkers(loaded, { buildId: "build-8", version: "1.0.0" })
    ).toBe("stale");
    expect(compareAppBuildMarkers(loaded, null)).toBe("unknown");
    expect(compareAppBuildMarkers(null, loaded)).toBe("unknown");
    expect(compareAppBuildMarkers(null, null)).toBe("unknown");
  });

  it("does not contact the deployment when the bundle has no marker", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(probeAppBuildFreshness({ loaded: null })).resolves.toBe(
      "unknown"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats an unreadable published marker as unknown, never as stale", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    const fetchSpy = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(probeAppBuildFreshness()).resolves.toBe("unknown");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("answers stale only for a proven identifier mismatch", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    vi.stubEnv("VITE_APP_VERSION", "1.0.0");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "build-8", version: "1.0.0" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(probeAppBuildFreshness()).resolves.toBe("stale");
  });

  // F2-M1 repair. The previous test here asserted one reading per loaded bundle
  // and used resetAppBuildFreshnessProbe() as the stand-in for a manual
  // browser refresh, which pinned the defect: a deployment landing while the
  // same tab stayed open was never noticed. The contract below is the approved
  // one — simultaneous attempts share a single reading, every later explicit
  // create attempt re-reads the marker, and no settled answer is retained.
  it("re-reads the marker when a deployment lands while the tab stays open", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    let published = "build-7";
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: published }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(probeAppBuildFreshness()).resolves.toBe("fresh");
    // The announced maintenance-window case: a new build is published, the user
    // keeps this bundle loaded and triggers another create.
    published = "build-8";
    await expect(probeAppBuildFreshness()).resolves.toBe("stale");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not freeze an unknown verdict once the marker becomes readable", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    let readable = false;
    const fetchSpy = vi.fn(async () =>
      readable
        ? { ok: true, json: async () => ({ buildId: "build-8" }) }
        : { ok: false, json: async () => ({}) }
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(probeAppBuildFreshness()).resolves.toBe("unknown");
    readable = true;
    await expect(probeAppBuildFreshness()).resolves.toBe("stale");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shares exactly one reading between simultaneous default probes", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    let release: (value: unknown) => void = () => {};
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const fetchSpy = vi.fn(() => gate);
    vi.stubGlobal("fetch", fetchSpy);

    const first = probeAppBuildFreshness();
    const second = probeAppBuildFreshness();
    release({ ok: true, json: async () => ({ buildId: "build-7" }) });
    await expect(first).resolves.toBe("fresh");
    await expect(second).resolves.toBe("fresh");
    // Anti-stampede preserved: the concurrent wave issued one request...
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // ...and once that reading settled the entry was forgotten, so a later
    // explicit attempt takes its own fresh reading instead of reusing it.
    const fetchSpyLater = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "build-8" }),
    }));
    vi.stubGlobal("fetch", fetchSpyLater);
    await expect(probeAppBuildFreshness()).resolves.toBe("stale");
    expect(fetchSpyLater).toHaveBeenCalledTimes(1);
  });

  it("keeps the F2-M2 residual: an unsettled reading is shared, never duplicated, and is only cleared when it settles", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    let release: (value: unknown) => void = () => {};
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const fetchSpy = vi.fn(() => gate);
    vi.stubGlobal("fetch", fetchSpy);

    const first = probeAppBuildFreshness();
    await Promise.resolve();
    const second = probeAppBuildFreshness();
    // No timeout is implemented (Adam's contract forbids a timer, so F2-M2
    // stays open): the second attempt waits on the same pending reading and
    // takes no extra request. Both fail closed — nothing dispatches meanwhile.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    release({ ok: true, json: async () => ({ buildId: "build-7" }) });
    await expect(first).resolves.toBe("fresh");
    await expect(second).resolves.toBe("fresh");
  });

  it("never deduplicates caller-supplied explicit-option probes", async () => {
    const fetchOne = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "build-7" }),
    }));
    const fetchTwo = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "build-8" }),
    }));
    const loaded = { buildId: "build-7", version: null };

    await expect(
      probeAppBuildFreshness({ fetch: fetchOne, loaded })
    ).resolves.toBe("fresh");
    await expect(
      probeAppBuildFreshness({ fetch: fetchTwo, loaded })
    ).resolves.toBe("stale");
    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(fetchTwo).toHaveBeenCalledTimes(1);
  });

  it("forgets only the running reading through the test seam, never a verdict", async () => {
    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "build-7" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(probeAppBuildFreshness()).resolves.toBe("fresh");
    // The seam is not what re-arms production; a settled reading was already
    // forgotten. Calling it here must therefore not add a third behaviour.
    resetAppBuildFreshnessProbe();
    await expect(probeAppBuildFreshness()).resolves.toBe("fresh");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("never reloads the page, forces a refresh or touches web storage", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", {
      reload,
      href: "https://example.invalid/groups",
    });
    const storageCalls: string[] = [];
    const trackingStorage = (name: string) => ({
      getItem: (key: string) => {
        storageCalls.push(`${name}.getItem:${key}`);
        return null;
      },
      setItem: (key: string) => {
        storageCalls.push(`${name}.setItem:${key}`);
      },
      removeItem: (key: string) => {
        storageCalls.push(`${name}.removeItem:${key}`);
      },
    });
    vi.stubGlobal("localStorage", trackingStorage("localStorage"));
    vi.stubGlobal("sessionStorage", trackingStorage("sessionStorage"));

    vi.stubEnv("VITE_APP_BUILD_ID", "build-7");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ buildId: "build-8" }),
      }))
    );

    await expect(probeAppBuildFreshness()).resolves.toBe("stale");
    expect(reload).not.toHaveBeenCalled();
    expect(storageCalls).toEqual([]);
  });
});
