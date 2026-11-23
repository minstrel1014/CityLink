// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: {
    status: "ready" as const,
    user: { id: "account-a" },
    authGeneration: 1,
  },
  profileResult: {
    data: { display_name: "Alice Chan" } as { display_name?: string } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: () => state.session,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(state.profileResult),
        }),
      }),
    }),
    auth: { signOut: vi.fn() },
  },
}));

vi.mock("@/lib/supabaseProfile", () => ({
  MAX_DISPLAY_NAME_LENGTH: 50,
  updateOwnDisplayName: vi.fn(),
}));

import DisplayNameGate from "./DisplayNameGate";

type Mounted = { root: Root; container: HTMLDivElement };
let mounted: Mounted | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderGate() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(
      createElement(
        DisplayNameGate,
        null,
        createElement("div", { "data-testid": "protected" }, "Protected page")
      )
    );
    await Promise.resolve();
  });
  await flush();
  return mounted;
}

async function rerenderGate() {
  if (!mounted) throw new Error("Gate is not mounted");
  await act(async () => {
    mounted!.root.render(
      createElement(
        DisplayNameGate,
        null,
        createElement("div", { "data-testid": "protected" }, "Protected page")
      )
    );
    await Promise.resolve();
  });
  await flush();
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  state.session = {
    status: "ready",
    user: { id: "account-a" },
    authGeneration: 1,
  };
  state.profileResult = {
    data: { display_name: "Alice Chan" },
    error: null,
  };
});

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
  document.body.innerHTML = "";
});

describe("DisplayNameGate", () => {
  it("renders protected routes for a valid stored name", async () => {
    const view = await renderGate();
    expect(view.container.textContent).toContain("Protected page");
    expect(view.container.textContent).not.toContain(
      "Confirming your display name"
    );
  });

  it("shows the name form when the account has no usable stored name", async () => {
    state.profileResult = {
      data: { display_name: "New CityLink member" },
      error: null,
    };
    const view = await renderGate();
    expect(view.container.textContent).toContain("Set your display name");
    expect(view.container.textContent).not.toContain(
      "Confirming your display name"
    );
    expect(view.container.textContent).not.toContain("Protected page");
  });

  it("shows retry and sign-out recovery when the profile read fails", async () => {
    state.profileResult = {
      data: null,
      error: { message: "read failed" },
    };
    const view = await renderGate();
    expect(view.container.textContent).toContain(
      "We could not confirm your name."
    );
    expect(view.container.textContent).toContain("Try again");
    expect(view.container.textContent).toContain("Sign out");
    expect(view.container.textContent).not.toContain(
      "Confirming your display name"
    );
    expect(view.container.textContent).not.toContain("Protected page");
  });

  it("resets the gate to the new account state instead of keeping the old name", async () => {
    const view = await renderGate();
    expect(view.container.textContent).toContain("Protected page");

    state.session = {
      status: "ready",
      user: { id: "account-b" },
      authGeneration: 2,
    };
    state.profileResult = {
      data: { display_name: "New CityLink member" },
      error: null,
    };
    await rerenderGate();

    expect(view.container.textContent).toContain("Set your display name");
    expect(view.container.textContent).not.toContain("Protected page");
    expect(view.container.textContent).not.toContain("Alice Chan");
  });
});
