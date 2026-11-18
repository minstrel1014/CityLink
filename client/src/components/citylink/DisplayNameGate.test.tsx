import React from "react";
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { status: "ready", user: { id: "user-1" } } as {
    status: string;
    user: { id: string } | null;
  },
  maybeSingle: vi.fn(),
  updateOwnDisplayName: vi.fn(),
}));

vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: () => mocks.session,
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { signOut: vi.fn() },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  },
}));
vi.mock("@/lib/supabaseProfile", () => ({
  MAX_DISPLAY_NAME_LENGTH: 50,
  updateOwnDisplayName: mocks.updateOwnDisplayName,
}));

import DisplayNameGate from "@/components/citylink/DisplayNameGate";

function renderGate() {
  return render(
    <DisplayNameGate>
      <div data-testid="protected">Protected route</div>
    </DisplayNameGate>
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { status: "ready", user: { id: "user-1" } };
  mocks.updateOwnDisplayName.mockResolvedValue("Alice QA");
});

describe("DisplayNameGate", () => {
  it("does not mount protected routes while the session is loading", () => {
    mocks.session = { status: "loading", user: null };
    renderGate();
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(screen.getByText(/Confirming your display name/)).toBeTruthy();
  });

  it("keeps protected routes blocked when the profile read fails", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("denied"),
    });
    renderGate();
    await waitFor(() =>
      expect(screen.getByText(/could not confirm your name/i)).toBeTruthy()
    );
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("keeps protected routes blocked when the profile row is missing", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    renderGate();
    await waitFor(() =>
      expect(screen.getByText(/no profile row/i)).toBeTruthy()
    );
    expect(screen.queryByTestId("protected")).toBeNull();
  });

  it("blocks the default name until a real name is saved", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: "New CityLink member" },
      error: null,
    });
    renderGate();
    await waitFor(() =>
      expect(screen.getByText("Set your display name")).toBeTruthy()
    );
    expect(screen.queryByTestId("protected")).toBeNull();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Alice QA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(screen.getByTestId("protected")).toBeTruthy());
    expect(mocks.updateOwnDisplayName).toHaveBeenCalledWith(
      "user-1",
      "Alice QA"
    );
  });

  it("mounts protected routes only after a valid custom name is confirmed", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: "Alice QA" },
      error: null,
    });
    renderGate();
    await waitFor(() => expect(screen.getByTestId("protected")).toBeTruthy());
    expect(screen.queryByText("Set your display name")).toBeNull();
  });

  it("renders public routes for a signed-out session", async () => {
    mocks.session = { status: "ready", user: null };
    renderGate();
    await waitFor(() => expect(screen.getByTestId("protected")).toBeTruthy());
    expect(screen.queryByText(/Confirming your display name/)).toBeNull();
  });
});
