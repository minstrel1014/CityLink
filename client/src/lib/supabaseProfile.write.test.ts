import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser },
    rpc: mocks.rpc,
  },
}));

import { updateOwnDisplayName } from "@/lib/supabaseProfile";

function rpcResult(result: { data: unknown; error: unknown }) {
  const builder = {
    setHeader: vi.fn(() => builder),
    then(
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "token-a" } },
    error: null,
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "actor" } },
    error: null,
  });
});

describe("profile display-name writes", () => {
  it("binds the verified request token to the RPC", async () => {
    const request = rpcResult({ data: "New Name", error: null });
    mocks.rpc.mockReturnValueOnce(request);

    await expect(updateOwnDisplayName("actor", "  New Name  ")).resolves.toBe(
      "New Name"
    );

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.getUser).toHaveBeenCalledWith("token-a");
    expect(request.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer token-a"
    );
    expect(mocks.rpc).toHaveBeenCalledWith("update_own_display_name", {
      p_display_name: "New Name",
    });
  });

  it("does not dispatch when the captured token belongs to another user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "someone-else" } },
      error: null,
    });

    await expect(updateOwnDisplayName("actor", "New Name")).rejects.toThrow(
      /sign-in could not be verified/i
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
