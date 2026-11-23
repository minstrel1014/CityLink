import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppHistoryStore, type HistoryPort } from "./appHistoryStore";

type FakeEntry = { href: string; key: string | null; state: unknown };
function fakeBrowser(initial: FakeEntry, withKeys = true) {
  let entries = [initial];
  let index = 0;
  const listeners = new Map<string, Set<() => void>>();
  const calls: number[] = [];
  const fire = (type: string) =>
    listeners.get(type)?.forEach(listener => listener());
  const port: HistoryPort = {
    current: () => ({
      href: entries[index].href,
      key: withKeys ? entries[index].key : null,
    }),
    keys: () => (withKeys ? entries.map(e => e.key!) : null),
    go: delta => {
      calls.push(delta);
    },
    listen: (type, callback) => {
      const set = listeners.get(type) ?? new Set();
      set.add(callback);
      listeners.set(type, set);
      return () => set.delete(callback);
    },
  };
  return {
    port,
    calls,
    fire,
    push(e: FakeEntry) {
      entries = [...entries.slice(0, index + 1), e];
      index++;
      fire("pushState");
    },
    replace(e: FakeEntry) {
      entries[index] = e;
      fire("replaceState");
    },
    traverse(delta: number) {
      index += delta;
      fire("popstate");
    },
    insertUnobserved(e: FakeEntry) {
      entries.splice(index, 0, e);
      index++;
    },
    get entries() {
      return entries;
    },
  };
}
const e = (href: string, key: string, state: unknown = null) => ({
  href,
  key,
  state,
});
afterEach(() => vi.useRealTimers());

describe("app history event store", () => {
  it("tracks a groupmate profile and goes to its actual previous page, preserving state", () => {
    const browser = fakeBrowser(
      e("/my-courses/c/groups?filter=open#people", "a", { selected: 1 })
    );
    const store = createAppHistoryStore(browser.port);
    const listener = vi.fn();
    store.subscribe(listener);
    browser.push(e("/my-courses/c/people/p", "b", "profile-state"));
    expect(store.goBack(false)).toBe(true);
    expect(browser.calls).toEqual([-1]);
    expect(store.getSnapshot().pending).toBe(true);
    expect(store.goBack(false)).toBe(false);
    browser.traverse(-1);
    expect(store.getSnapshot().history.index).toBe(0);
    expect(store.getSnapshot().pending).toBe(false);
    expect(browser.entries.map(item => item.state)).toEqual([
      { selected: 1 },
      "profile-state",
    ]);
    expect(listener).toHaveBeenCalledTimes(3);
    store.destroy();
  });

  it("supports native back and forward when browser entry keys prove their identity", () => {
    const browser = fakeBrowser(e("/demo", "a"));
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/demo/courses", "b"));
    browser.push(e("/demo/me", "c"));
    browser.traverse(-1);
    expect(store.getSnapshot().history.index).toBe(1);
    browser.traverse(1);
    expect(store.getSnapshot().history.index).toBe(2);
    browser.fire("hashchange");
    expect(store.getSnapshot().history.entries).toHaveLength(3);
    store.destroy();
  });

  it("supports controlled Back but treats unkeyed manual forward as a new trust boundary", () => {
    const browser = fakeBrowser(e("/courses?x=1#top", "a"), false);
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/me", "b"));
    expect(store.goBack(false)).toBe(true);
    browser.traverse(-1);
    expect(store.getSnapshot().history.index).toBe(0);
    browser.traverse(1);
    expect(store.getSnapshot().history.entries.map(item => item.href)).toEqual([
      "/me",
    ]);
    expect(store.goBack(false)).toBe(false);
    store.destroy();
  });

  it("updates replace in place and traverses past an unsafe sign-in page", () => {
    const browser = fakeBrowser(e("/demo", "a"));
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/", "b"));
    browser.push(e("/my-courses", "c"));
    browser.replace(e("/dashboard", "c"));
    expect(store.getSnapshot().history.entries.map(item => item.href)).toEqual([
      "/demo",
      "/",
      "/dashboard",
    ]);
    expect(store.goBack(false)).toBe(true);
    expect(browser.calls).toEqual([-2]);
    browser.traverse(-2);
    expect(store.getSnapshot().history.index).toBe(0);
    store.destroy();
  });

  it("does not traverse if browser keys reveal an unobserved intermediate entry", () => {
    const browser = fakeBrowser(e("/courses", "a"));
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/me", "b"));
    browser.insertUnobserved(e("/dashboard", "unknown"));
    expect(store.goBack(false)).toBe(false);
    expect(browser.calls).toEqual([]);
    expect(store.getSnapshot().history.entries.map(item => item.href)).toEqual([
      "/me",
    ]);
    store.destroy();
  });

  it("disables Back after an unrecognized hash or pageshow location", () => {
    const browser = fakeBrowser(e("/demo", "a"));
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/demo/me", "b"));
    browser.insertUnobserved(e("/demo/me#new", "unknown"));
    browser.traverse(-1);
    browser.fire("hashchange");
    browser.fire("pageshow");
    expect(store.getSnapshot().history.entries.map(item => item.href)).toEqual([
      "/demo/me#new",
    ]);
    expect(store.goBack(true)).toBe(false);
    store.destroy();
  });

  it("recovers when a traversal is ignored or throws and cleans up listeners", () => {
    vi.useFakeTimers();
    const browser = fakeBrowser(e("/courses", "a"));
    const store = createAppHistoryStore(browser.port);
    browser.push(e("/me", "b"));
    expect(store.goBack(false)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(store.getSnapshot().pending).toBe(false);
    store.destroy();
    browser.push(e("/about", "c"));
    expect(store.getSnapshot().history.entries).toHaveLength(2);

    const broken = fakeBrowser(e("/courses", "a"));
    broken.port.go = () => {
      throw new Error("blocked");
    };
    const store2 = createAppHistoryStore(broken.port);
    broken.push(e("/me", "b"));
    expect(store2.goBack(false)).toBe(false);
    expect(store2.getSnapshot().pending).toBe(false);
    store2.destroy();
  });
});
