import { describe, expect, it } from "vitest";
import {
  findBackTarget,
  initialAppHistory,
  isSafeAppTarget,
  reduceAppHistory,
} from "./appHistory";

const entry = (href: string, key: string | null = null) => ({ href, key });

describe("app history reducer", () => {
  it("pushes and replaces entries without turning a redirect into a previous page", () => {
    let h = initialAppHistory(entry("/courses", "a"));
    h = reduceAppHistory(h, { type: "push", entry: entry("/my-courses", "b") });
    h = reduceAppHistory(h, {
      type: "replace",
      entry: entry("/dashboard", "b"),
    });
    expect(h.entries.map(e => e.href)).toEqual(["/courses", "/dashboard"]);
    expect(findBackTarget(h, false)).toEqual({
      index: 0,
      href: "/courses",
      delta: -1,
    });
  });

  it("tracks keyed back and forward and discards forward entries after a push", () => {
    let h = initialAppHistory(entry("/demo", "a"));
    h = reduceAppHistory(h, {
      type: "push",
      entry: entry("/demo/courses", "b"),
    });
    h = reduceAppHistory(h, { type: "push", entry: entry("/demo/me", "c") });
    h = reduceAppHistory(h, { type: "pop", entry: entry("/demo", "a") });
    expect(h.index).toBe(0);
    h = reduceAppHistory(h, { type: "pop", entry: entry("/demo/me", "c") });
    expect(h.index).toBe(2);
    h = reduceAppHistory(h, {
      type: "pop",
      entry: entry("/demo/courses", "b"),
    });
    h = reduceAppHistory(h, { type: "push", entry: entry("/demo/about", "d") });
    expect(h.entries.map(e => e.key)).toEqual(["a", "b", "d"]);
  });

  it("does not trust an unknown pop just because a URL matches", () => {
    let h = initialAppHistory(entry("/courses", "a"));
    h = reduceAppHistory(h, { type: "push", entry: entry("/dashboard", "b") });
    h = reduceAppHistory(h, {
      type: "pop",
      entry: entry("/courses", "unknown"),
    });
    expect(h).toEqual(initialAppHistory(entry("/courses", "unknown")));
    expect(findBackTarget(h, true)).toBeNull();
  });

  it("distinguishes repeated URLs by key and does not guess without keys", () => {
    let h = initialAppHistory(entry("/courses", "a"));
    h = reduceAppHistory(h, { type: "push", entry: entry("/dashboard", "b") });
    h = reduceAppHistory(h, { type: "push", entry: entry("/courses", "c") });
    expect(
      reduceAppHistory(h, { type: "pop", entry: entry("/courses", "a") }).index
    ).toBe(0);
    expect(
      reduceAppHistory(h, { type: "pop", entry: entry("/courses", null) })
        .entries
    ).toEqual([entry("/courses")]);
  });

  it("recognizes a previously requested traversal without a key, but rejects a mismatch", () => {
    let h = initialAppHistory(entry("/courses?scope=mine#top"));
    h = reduceAppHistory(h, { type: "push", entry: entry("/me") });
    expect(
      reduceAppHistory(h, {
        type: "pop",
        entry: entry("/courses?scope=mine#top"),
        expectedIndex: 0,
      }).index
    ).toBe(0);
    expect(
      reduceAppHistory(h, {
        type: "pop",
        entry: entry("/courses?scope=other"),
        expectedIndex: 0,
      }).entries
    ).toEqual([entry("/courses?scope=other")]);
    expect(
      reduceAppHistory(h, {
        type: "pop",
        entry: entry("/courses?scope=mine#top", "wrong"),
        expectedIndex: 20,
      }).entries
    ).toEqual([entry("/courses?scope=mine#top", "wrong")]);
  });

  it("uses the actual previous course groupmate page including query and fragment", () => {
    let h = initialAppHistory(
      entry("/my-courses/c1/groups?filter=open#people", "a")
    );
    h = reduceAppHistory(h, {
      type: "push",
      entry: entry("/my-courses/c1/people/p1", "b"),
    });
    expect(findBackTarget(h, false)).toEqual({
      index: 0,
      href: "/my-courses/c1/groups?filter=open#people",
      delta: -1,
    });
  });

  it("skips exact duplicates, unsafe targets and sign-in when it can redirect", () => {
    let h = initialAppHistory(entry("/demo", "a"));
    h = reduceAppHistory(h, { type: "push", entry: entry("/", "b") });
    h = reduceAppHistory(h, { type: "push", entry: entry("/my-courses", "c") });
    h = reduceAppHistory(h, { type: "push", entry: entry("/dashboard", "d") });
    h = reduceAppHistory(h, { type: "push", entry: entry("/dashboard", "e") });
    expect(findBackTarget(h, false)).toEqual({
      index: 0,
      href: "/demo",
      delta: -4,
    });
    expect(findBackTarget(h, true)).toEqual({ index: 1, href: "/", delta: -3 });
    expect(
      findBackTarget(initialAppHistory(entry("/dashboard")), false)
    ).toBeNull();
  });
});

describe("safe back targets", () => {
  it.each([
    "/",
    "/demo",
    "/demo/courses/c1",
    "/demo/students/s/c",
    "/dashboard",
    "/courses/c/classmates",
    "/courses/c/students/s",
    "/students/s/c",
    "/my-courses/c/groups",
    "/my-courses/c/people/p",
    "/groups/g/chat",
    "/groups/g/members",
    "/groups/g/members/p",
    "/my-groups",
    "/group-chat",
    "/about",
    "/messages",
    "/invitations",
    "/me",
    "/courses/c%2Fid?scope=mine#people",
  ])("accepts known app route %s", href =>
    expect(isSafeAppTarget(href, true)).toBe(true)
  );

  it.each([
    "https://outside.example/courses",
    "//outside.example/courses",
    "/\\outside.example/courses",
    "javascript:alert(1)",
    "/unknown",
    "/404",
    "/my-courses",
    "/courses/c/extra/part",
    "/demo?code=secret",
    "/demo#access_token=secret",
    "/demo?REFRESH_TOKEN=secret",
    "/demo#token_hash=secret",
    "/dashboard?id_token=secret",
  ])("rejects unsafe, unknown, alias, or credential-bearing target %s", href =>
    expect(isSafeAppTarget(href, true)).toBe(false)
  );

  it("permits the sign-in page only when redirect is known to be impossible", () => {
    expect(isSafeAppTarget("/?next=demo", false)).toBe(false);
    expect(isSafeAppTarget("/?next=demo", true)).toBe(true);
  });
});
