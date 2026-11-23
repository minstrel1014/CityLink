import {
  findBackTarget,
  initialAppHistory,
  reduceAppHistory,
  type AppHistory,
  type AppHistoryEntry,
} from "./appHistory";

type HistoryEvent =
  | "pushState"
  | "replaceState"
  | "popstate"
  | "hashchange"
  | "pageshow";

export type HistoryPort = {
  current: () => AppHistoryEntry;
  /** Browser-generated same-origin entry keys, if the Navigation API exists. */
  keys: () => string[] | null;
  go: (delta: number) => void;
  listen: (event: HistoryEvent, callback: () => void) => () => void;
};

export type HistorySnapshot = {
  history: AppHistory;
  pending: boolean;
};

export function createAppHistoryStore(port: HistoryPort) {
  let snapshot: HistorySnapshot = {
    history: initialAppHistory(port.current()),
    pending: false,
  };
  let expectedIndex: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Set<() => void>();
  const emit = () => subscribers.forEach(listener => listener());
  const clearPending = () => {
    expectedIndex = undefined;
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
  };
  const apply = (event: HistoryEvent) => {
    const entry = port.current();
    const current = snapshot.history.entries[snapshot.history.index];
    // Hash traversals typically emit both popstate and hashchange. pageshow
    // may also follow an already observed location; neither is another push.
    if (
      (event === "hashchange" || event === "pageshow") &&
      entry.href === current.href &&
      entry.key === current.key
    )
      return;

    const history =
      event === "pushState"
        ? reduceAppHistory(snapshot.history, { type: "push", entry })
        : event === "replaceState"
          ? reduceAppHistory(snapshot.history, { type: "replace", entry })
          : reduceAppHistory(snapshot.history, {
              type: "pop",
              entry,
              expectedIndex: event === "popstate" ? expectedIndex : undefined,
            });
    clearPending();
    snapshot = { history, pending: false };
    emit();
  };
  const stopListening = (
    ["pushState", "replaceState", "popstate", "hashchange", "pageshow"] as const
  ).map(event => port.listen(event, () => apply(event)));

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    goBack(allowSignIn: boolean): boolean {
      if (snapshot.pending) return false;
      const current = port.current();
      const known = snapshot.history.entries[snapshot.history.index];
      if (current.href !== known.href || current.key !== known.key) {
        clearPending();
        snapshot = { history: initialAppHistory(current), pending: false };
        emit();
        return false;
      }
      const target = findBackTarget(snapshot.history, allowSignIn);
      if (!target) return false;

      // Where supported, check that every entry to be crossed is still the
      // exact browser entry observed by this store, not merely a matching URL.
      const keys = port.keys();
      if (keys && current.key) {
        const currentIndex = keys.indexOf(current.key);
        const contiguous =
          currentIndex >= 0 &&
          snapshot.history.entries
            .slice(target.index, snapshot.history.index + 1)
            .every(
              (entry, offset) =>
                entry.key !== null &&
                keys[currentIndex + target.delta + offset] === entry.key
            );
        if (!contiguous) {
          snapshot = { history: initialAppHistory(current), pending: false };
          emit();
          return false;
        }
      }
      expectedIndex = target.index;
      snapshot = { ...snapshot, pending: true };
      emit();
      try {
        port.go(target.delta);
      } catch {
        clearPending();
        snapshot = { ...snapshot, pending: false };
        emit();
        return false;
      }
      // Some browsers can ignore traversal. Do not leave the control stuck.
      if (snapshot.pending) {
        timeout = setTimeout(() => {
          clearPending();
          const latest = port.current();
          const previous = snapshot.history.entries[snapshot.history.index];
          snapshot = {
            history:
              latest.href === previous.href && latest.key === previous.key
                ? snapshot.history
                : initialAppHistory(latest),
            pending: false,
          };
          emit();
        }, 2000);
      }
      return true;
    },
    destroy() {
      clearPending();
      stopListening.forEach(stop => stop());
      subscribers.clear();
    },
  };
}

// Do not write to history.state: Wouter and other consumers retain their exact
// state, including null and primitive values. Navigation API keys are optional.
function browserPort(): HistoryPort {
  const navigation = (
    window as Window & {
      navigation?: {
        currentEntry?: { key: string } | null;
        entries?: () => Array<{ key: string }>;
      };
    }
  ).navigation;
  return {
    current: () => ({
      href:
        window.location.pathname +
        window.location.search +
        window.location.hash,
      key: navigation?.currentEntry?.key ?? null,
    }),
    keys: () => {
      try {
        return navigation?.entries?.().map(entry => entry.key) ?? null;
      } catch {
        return null;
      }
    },
    go: delta => window.history.go(delta),
    listen: (event, callback) => {
      window.addEventListener(event, callback);
      return () => window.removeEventListener(event, callback);
    },
  };
}

export type AppHistoryStore = ReturnType<typeof createAppHistoryStore>;
let browserStore: AppHistoryStore | undefined;

/** Start after Wouter has installed its pushState/replaceState events, before React mounts. */
export function startAppHistory(): AppHistoryStore {
  if (!browserStore) browserStore = createAppHistoryStore(browserPort());
  return browserStore;
}

export function getAppHistoryStore(): AppHistoryStore | undefined {
  return browserStore;
}
