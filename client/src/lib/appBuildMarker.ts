// CityLink F2 cached-client rollout marker.
//
// Purpose: give the group-creation path a *verifiable* way to tell whether the
// bundle already loaded in this browser is the build that is currently
// published. The running bundle's baked-in identifier is compared with the
// identifier served next to the deployment, so a stale cached bundle can be
// recognised before any create request is dispatched.
//
// Deliberately NOT done here, per Adam's 2026-11-22 decision set:
// - no inference from browser cache time, Date.now(), tab age or header dates;
//   only the two build identifiers are compared;
// - no automatic reload, forced refresh or background retry;
// - no localStorage/sessionStorage use, so an unsaved group-creation draft is
//   allowed to be lost when the user refreshes manually;
// - no new user-facing wording. The single approved create-path string lives in
//   the group workflow error mapper; this module only produces the stable
//   machine token that mapper already recognises.

export const APP_BUILD_MARKER_PATH = "/version.json";

/**
 * Stable, version-free machine token from Role 6's Option A compatibility
 * contract. The server raises it from the legacy three-argument create stub;
 * the client re-uses the same token when it can *prove* the loaded bundle is
 * stale, so exactly one approved user string covers both cases.
 */
export const GROUP_CAPACITY_UPGRADE_REQUIRED_TOKEN =
  "group_capacity_upgrade_required";

export type AppBuildMarker = {
  buildId: string;
  /** Published version label; never guessed. */
  version: string | null;
};

export type AppBuildFreshness = "fresh" | "stale" | "unknown";

type BuildMarkerEnv = {
  VITE_APP_BUILD_ID?: unknown;
  VITE_APP_VERSION?: unknown;
};

export type AppBuildMarkerResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type AppBuildMarkerFetch = (
  input: string,
  init?: { cache?: string }
) => Promise<AppBuildMarkerResponse>;

/** Identifier guard: a missing, blank or absurdly long value is unusable. */
function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return trimmed;
}

/**
 * The marker baked into the bundle that is currently running. Returns null when
 * the build did not supply an identifier: an absent marker is reported as
 * unverifiable and is never replaced by a fabricated value.
 */
export function readLoadedAppBuildMarker(
  env: BuildMarkerEnv | undefined = import.meta.env as BuildMarkerEnv
): AppBuildMarker | null {
  if (!env || typeof env !== "object") return null;
  const buildId = normalizeIdentifier(env.VITE_APP_BUILD_ID);
  if (!buildId) return null;
  return { buildId, version: normalizeIdentifier(env.VITE_APP_VERSION) };
}

/**
 * Parse the published marker document. Any shape problem returns null so the
 * caller treats the situation as unknown rather than guessing freshness.
 */
export function parsePublishedAppBuildMarker(
  value: unknown
): AppBuildMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { buildId?: unknown; version?: unknown };
  const buildId = normalizeIdentifier(candidate.buildId);
  if (!buildId) return null;
  return { buildId, version: normalizeIdentifier(candidate.version) };
}

/**
 * Compare the two identifiers. "unknown" means at least one side is missing or
 * unreadable, which must never be presented as an upgrade problem.
 */
export function compareAppBuildMarkers(
  loaded: AppBuildMarker | null,
  published: AppBuildMarker | null
): AppBuildFreshness {
  if (!loaded || !published) return "unknown";
  return loaded.buildId === published.buildId ? "fresh" : "stale";
}

/**
 * Read the published marker with `cache: "no-store"` so the answer comes from
 * the current deployment instead of the browser cache. Transport failure, a
 * non-OK response and an unreadable body all collapse to null (unknown); this
 * helper never throws and never retries.
 */
export async function loadPublishedAppBuildMarker(
  fetchImpl?: AppBuildMarkerFetch
): Promise<AppBuildMarker | null> {
  const activeFetch =
    fetchImpl ??
    (typeof globalThis.fetch === "function"
      ? (globalThis.fetch as unknown as AppBuildMarkerFetch)
      : null);
  if (!activeFetch) return null;
  try {
    const response = await activeFetch(APP_BUILD_MARKER_PATH, {
      cache: "no-store",
    });
    if (!response || response.ok !== true) return null;
    return parsePublishedAppBuildMarker(await response.json());
  } catch {
    return null;
  }
}

export type AppBuildFreshnessOptions = {
  fetch?: AppBuildMarkerFetch;
  loaded?: AppBuildMarker | null;
};

let memoizedDefaultProbe: Promise<AppBuildFreshness> | null = null;

/**
 * Decide the freshness for the current bundle load. Without a loaded marker no
 * request is made at all, so a development server or a test run cannot be
 * mistaken for a stale client. The default (no-option) probe is memoized for
 * the lifetime of the loaded bundle: a manual browser refresh is the only thing
 * that re-evaluates it, because the refresh loads a different bundle.
 */
export async function probeAppBuildFreshness(
  options: AppBuildFreshnessOptions = {}
): Promise<AppBuildFreshness> {
  const usesDefaults =
    options.fetch === undefined && options.loaded === undefined;
  if (usesDefaults && memoizedDefaultProbe) return memoizedDefaultProbe;
  const probe = evaluateAppBuildFreshness(options);
  if (usesDefaults) memoizedDefaultProbe = probe;
  return probe;
}

async function evaluateAppBuildFreshness(
  options: AppBuildFreshnessOptions
): Promise<AppBuildFreshness> {
  const loaded =
    options.loaded === undefined ? readLoadedAppBuildMarker() : options.loaded;
  if (!loaded) return "unknown";
  const published = await loadPublishedAppBuildMarker(options.fetch);
  return compareAppBuildMarkers(loaded, published);
}

/** Test seam only: the production code path has one freshness answer per load. */
export function resetAppBuildFreshnessProbe(): void {
  memoizedDefaultProbe = null;
}
