import React, { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: vi.fn(),
}));
vi.mock("@/lib/supabaseClient", () => ({ supabaseClient: null }));
vi.mock("@/data/AppContext", () => ({
  useCityLink: () => ({
    me: { name: "Demo", year: 1, avatar: "D", color: "sage" },
    invitations: [],
  }),
}));
vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement("a", { ...props, href }, children),
  useLocation: () => ["/dashboard", vi.fn()],
}));

import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import AppShell from "@/components/citylink/AppShell";
import { Shell } from "@/components/citylink/Shared";
import DisplayNameGate from "@/components/citylink/DisplayNameGate";
import { Stage6Layout } from "@/pages/citylink/Stage6Layout";
import { createAppHistoryStore, type HistoryPort } from "@/lib/appHistoryStore";
import { BackControl, BackNavigationFrame } from "./BackNavigation";

function makeStore(from = "/courses", to = "/me") {
  let href = from;
  let key = "one";
  const listeners = new Map<string, () => void>();
  const port: HistoryPort = {
    current: () => ({ href, key }),
    keys: () => ["one", "two"],
    go: vi.fn(),
    listen: (event, callback) => {
      listeners.set(event, callback);
      return () => listeners.delete(event);
    },
  };
  const store = createAppHistoryStore(port);
  href = to;
  key = "two";
  listeners.get("pushState")!();
  return store;
}

beforeEach(() => {
  vi.mocked(useSupabaseSession).mockReturnValue({
    status: "ready",
    user: { id: "test", email: "test@example.test" },
  } as ReturnType<typeof useSupabaseSession>);
});

describe("Back navigation rendering", () => {
  it("renders an accessible native, enabled button for a trusted previous page", () => {
    const store = makeStore();
    const html = renderToStaticMarkup(
      createElement(BackControl, { store, allowSignIn: false })
    );
    expect(html).toContain('aria-label="Page navigation"');
    expect(html).toContain('aria-label="Go back to previous page"');
    expect(html).toContain('type="button"');
    expect(html).toContain(">Back</button>");
    expect(html).not.toContain("disabled");
    store.destroy();
  });

  it("renders disabled for a signed-in sign-in redirect", () => {
    const store = makeStore("/", "/dashboard");
    const html = renderToStaticMarkup(
      createElement(BackControl, { store, allowSignIn: false })
    );
    expect(html).toContain("disabled");
    expect(html).toContain("No previous page available");
    store.destroy();
  });

  it("renders disabled for a direct entry with no trusted previous page", () => {
    const store = createAppHistoryStore({
      current: () => ({ href: "/courses/c", key: null }),
      keys: () => null,
      go: vi.fn(),
      listen: () => () => {},
    });
    const html = renderToStaticMarkup(
      createElement(BackControl, { store, allowSignIn: true })
    );
    expect(html).toContain("disabled");
    store.destroy();
  });

  it("allows the sign-in entry only when session state establishes signed-out", () => {
    const store = makeStore("/", "/demo");
    const render = () =>
      renderToStaticMarkup(
        createElement(BackNavigationFrame, { store, children: "Page" })
      );
    expect(render()).toContain("disabled");
    vi.mocked(useSupabaseSession).mockReturnValue({
      status: "ready",
      user: null,
    } as ReturnType<typeof useSupabaseSession>);
    expect(render()).not.toContain("disabled");
    vi.mocked(useSupabaseSession).mockReturnValue({
      status: "error",
      user: null,
    } as ReturnType<typeof useSupabaseSession>);
    expect(render()).toContain("disabled");
    store.destroy();
  });

  it.each(["standalone", "signed-in shell", "demo shell", "Stage 6 shell"])(
    "places one Back control in the route frame for %s",
    layout => {
      const store = makeStore(
        "/my-courses/c/groups?view=open",
        "/my-courses/c/people/p"
      );
      const page =
        layout === "standalone"
          ? createElement("main", null, "Standalone page")
          : layout === "signed-in shell"
            ? createElement(AppShell, {
                title: "Course",
                children: "Authenticated page",
              })
            : layout === "demo shell"
              ? createElement(Shell, { title: "Demo", children: "Demo page" })
              : createElement(Stage6Layout, {
                  title: "Coursemate profile",
                  children: "Profile page",
                });
      const html = renderToStaticMarkup(
        createElement(BackNavigationFrame, { store, children: page })
      );
      expect(html.match(/aria-label="Page navigation"/g)).toHaveLength(1);
      expect(html).toContain('class="citylink-route-frame"');
      const backButton = html.match(
        /<button[^>]*aria-label="Go back to previous page"[^>]*>/
      )?.[0];
      expect(backButton).toBeDefined();
      expect(backButton).not.toContain("disabled");
      if (layout === "Stage 6 shell") {
        expect(html).toContain('href="/dashboard">My Courses</a>');
        expect(html).not.toContain("Back to people");
      }
      store.destroy();
    }
  );

  it("keeps a loading DisplayNameGate in control instead of exposing routed content", () => {
    vi.mocked(useSupabaseSession).mockReturnValue({
      status: "loading",
      user: null,
    } as ReturnType<typeof useSupabaseSession>);
    const html = renderToStaticMarkup(
      createElement(DisplayNameGate, {
        children: createElement("main", null, "Gated page"),
      })
    );
    expect(html).toContain('aria-modal="true"');
    expect(html).not.toContain("Gated page");
    expect(html).not.toContain('aria-label="Page navigation"');
  });
});
