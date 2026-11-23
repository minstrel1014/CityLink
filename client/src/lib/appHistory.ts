export type AppHistoryEntry = {
  /** Full same-origin path, including the search and fragment. */
  href: string;
  /** The browser Navigation API's entry key, when available. */
  key: string | null;
};

export type AppHistory = {
  entries: AppHistoryEntry[];
  index: number;
};

export type AppHistoryAction =
  | { type: "push"; entry: AppHistoryEntry }
  | { type: "replace"; entry: AppHistoryEntry }
  | { type: "pop"; entry: AppHistoryEntry; expectedIndex?: number };

export function initialAppHistory(entry: AppHistoryEntry): AppHistory {
  return { entries: [entry], index: 0 };
}

/**
 * Only observed same-document pushes establish an adjacent trusted entry. A pop
 * is recognized by its browser-generated key, or by an explicitly requested
 * traversal whose destination we already know. An unrecognized pop starts a new
 * trust boundary rather than guessing from URL, referrer, or history.length.
 */
export function reduceAppHistory(
  history: AppHistory,
  action: AppHistoryAction
): AppHistory {
  const { entry } = action;
  if (action.type === "push") {
    return {
      entries: [...history.entries.slice(0, history.index + 1), entry],
      index: history.index + 1,
    };
  }
  if (action.type === "replace") {
    const entries = history.entries.slice();
    entries[history.index] = entry;
    return { entries, index: history.index };
  }

  const keyedIndex = entry.key
    ? history.entries.findIndex(
        candidate =>
          candidate.key === entry.key && candidate.href === entry.href
      )
    : -1;
  const expected = action.expectedIndex;
  const expectedEntry =
    expected === undefined ? undefined : history.entries[expected];
  const expectedMatches =
    expectedEntry?.href === entry.href &&
    (!expectedEntry.key || !entry.key || expectedEntry.key === entry.key);
  const index = keyedIndex >= 0 ? keyedIndex : expectedMatches ? expected! : -1;
  return index < 0 ? initialAppHistory(entry) : { ...history, index };
}

// Keep in step with the route Switch. Alias and error routes are intentionally
// not back targets: they redirect or may cause a full-page navigation.
const APP_PATHS = [
  /^\/$/,
  /^\/demo(?:\/(?:courses|invitations|messages|me|about))?\/?$/,
  /^\/demo\/courses\/[^/]+\/?$/,
  /^\/demo\/students\/[^/]+\/[^/]+\/?$/,
  /^\/(?:dashboard|courses|invitations|me|my-groups|group-chat|messages|about)\/?$/,
  /^\/courses\/[^/]+(?:\/classmates|\/students\/[^/]+)?\/?$/,
  /^\/students\/[^/]+\/[^/]+\/?$/,
  /^\/my-courses\/[^/]+\/(?:groups|people\/[^/]+)\/?$/,
  /^\/groups\/[^/]+\/(?:chat|members(?:\/[^/]+)?)\/?$/,
];
const AUTH_PARAMETERS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "token_hash",
  "code",
]);

export function isSafeAppTarget(href: string, allowSignIn: boolean): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  let url: URL;
  try {
    url = new URL(href, "https://citylink.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "https://citylink.invalid") return false;
  if (!allowSignIn && url.pathname === "/") return false;
  if (!APP_PATHS.some(pattern => pattern.test(url.pathname))) return false;
  for (const params of [
    url.searchParams,
    new URLSearchParams(url.hash.slice(1)),
  ]) {
    for (const key of params.keys()) {
      if (AUTH_PARAMETERS.has(key.toLowerCase())) return false;
    }
  }
  return true;
}

export type BackTarget = { index: number; href: string; delta: number };

export function findBackTarget(
  history: AppHistory,
  allowSignIn: boolean
): BackTarget | null {
  const current = history.entries[history.index];
  for (let index = history.index - 1; index >= 0; index--) {
    const entry = history.entries[index];
    if (
      entry.href !== current.href &&
      isSafeAppTarget(entry.href, allowSignIn)
    ) {
      return { index, href: entry.href, delta: index - history.index };
    }
  }
  return null;
}
