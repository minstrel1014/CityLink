// Coordinator independent lifecycle harness for PR #50 head a2d041d6 (F2-M1 repair).
// External only: NOT repository code, NOT committed to the app, no network, no Supabase.
// Timer-free pending detection (setImmediate only) so the F2 "no timer" contract is
// not even mirrored by probe scheduling in this script.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SRC =
  "/home/ubuntu/citylink-recreation/wt-roy-f2-a2d041d/client/src/lib/appBuildMarker.ts";
const dir = mkdtempSync(join(tmpdir(), "coord-f2m1-"));

async function freshInstance(loadedId) {
  const out = join(
    dir,
    `bundle-${loadedId}-${Math.random().toString(36).slice(2)}.mjs`
  );
  await build({
    entryPoints: [SRC],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: out,
    define: {
      "import.meta.env": JSON.stringify({ VITE_APP_BUILD_ID: loadedId }),
    },
    logLevel: "error",
  });
  // separate query string guarantees a distinct module instance per scenario
  return import(pathToFileURL(out).href + "?i=" + Math.random());
}

const outcome = { pending: "PENDING(no verdict)" };
async function settleOrPending(p) {
  let state = outcome.pending;
  p.then(
    v => {
      state = v;
    },
    () => {
      state = "REJECTED";
    }
  );
  await new Promise(r => setImmediate(() => setImmediate(r)));
  return state;
}

function makeFetch(state) {
  state.calls = 0;
  return async () => {
    state.calls += 1;
    if (state.throwOnCall && state.calls === state.throwOnCall) {
      throw new Error("simulated network failure");
    }
    if (state.hangOnCall && state.calls >= state.hangOnCall) {
      return new Promise(() => {}); // never settles
    }
    return new Response(
      JSON.stringify({
        buildId: state.published,
        version: null,
        emittedAt: "x",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
}

const results = [];

// Scenario 1: deployment lands while the same module instance stays loaded.
{
  const mod = await freshInstance("build-A");
  const st = { published: "build-A" };
  globalThis.fetch = makeFetch(st);
  const first = await mod.probeAppBuildFreshness();
  st.published = "build-B"; // deployment lands, same tab, no refresh
  const second = await mod.probeAppBuildFreshness();
  results.push({
    scenario: "same-instance later deployment",
    first,
    second,
    fetchCalls: st.calls,
    expect: "fresh then stale, 2 reads",
    pass: first === "fresh" && second === "stale" && st.calls === 2,
  });
}

// Scenario 2: initial unknown (fetch throws) then marker becomes readable.
{
  const mod = await freshInstance("build-A");
  const st = { published: "build-B", throwOnCall: 1 };
  globalThis.fetch = makeFetch(st);
  const first = await mod.probeAppBuildFreshness();
  st.throwOnCall = 0;
  const second = await mod.probeAppBuildFreshness();
  results.push({
    scenario: "unknown then readable",
    first,
    second,
    fetchCalls: st.calls,
    expect: "unknown then stale, 2 reads (no freeze)",
    pass: first === "unknown" && second === "stale" && st.calls === 2,
  });
}

// Scenario 3: simultaneous probes share one read; a later attempt re-reads.
{
  const mod = await freshInstance("build-A");
  const st = { published: "build-A" };
  globalThis.fetch = makeFetch(st);
  const [a, b] = await Promise.all([
    mod.probeAppBuildFreshness(),
    mod.probeAppBuildFreshness(),
  ]);
  st.published = "build-B";
  const third = await mod.probeAppBuildFreshness();
  results.push({
    scenario: "concurrent wave then later attempt",
    a,
    b,
    third,
    fetchCalls: st.calls,
    expect:
      "one shared read for the wave (fresh/fresh), later attempt stale, 2 reads total",
    pass: a === "fresh" && b === "fresh" && third === "stale" && st.calls === 2,
  });
}

// Scenario 4: explicit-option probes are never deduplicated.
{
  const mod = await freshInstance("build-A");
  const st = { published: "build-B" };
  globalThis.fetch = makeFetch(st);
  const one = await mod.probeAppBuildFreshness({
    loaded: { buildId: "build-A", version: null, emittedAt: "x" },
  });
  const two = await mod.probeAppBuildFreshness({
    loaded: { buildId: "build-A", version: null, emittedAt: "x" },
  });
  results.push({
    scenario: "explicit loaded option probes",
    one,
    two,
    fetchCalls: st.calls,
    expect: "stale twice, 2 independent reads",
    pass: one === "stale" && two === "stale" && st.calls === 2,
  });
}

// Scenario 5: F2-M2 residual - a never-settling read pins later default probes.
{
  const mod = await freshInstance("build-A");
  const st = { published: "build-B", hangOnCall: 1 };
  globalThis.fetch = makeFetch(st);
  const p1 = mod.probeAppBuildFreshness();
  const s1 = await settleOrPending(p1);
  const p2 = mod.probeAppBuildFreshness();
  const s2 = await settleOrPending(p2);
  // identity check: dedup means the same pending promise is handed back
  results.push({
    scenario: "F2-M2 residual hung marker read",
    firstProbe: typeof s1 === "string" ? s1 : (s1?.verdict ?? s1),
    secondProbe: typeof s2 === "string" ? s2 : (s2?.verdict ?? s2),
    fetchCalls: st.calls,
    expect:
      "both pending, exactly one underlying read, later attempt pinned (promise identity is invalid to assert because probeAppBuildFreshness is declared async)",
    pass: s1 === outcome.pending && s2 === outcome.pending && st.calls === 1,
  });
}

for (const r of results) console.log(JSON.stringify(r));
console.log(
  "SUMMARY " +
    results.filter(r => r.pass).length +
    "/" +
    results.length +
    " scenarios match the repaired contract"
);
