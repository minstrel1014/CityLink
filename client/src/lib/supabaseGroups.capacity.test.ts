import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  probeAppBuildFreshness: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

// The F2 rollout marker is replaced wholesale so these tests control the
// verdict directly and never reach the network: the default answer is
// "unknown", which must behave exactly like the pre-F2 client.
vi.mock("@/lib/appBuildMarker", () => ({
  GROUP_CAPACITY_UPGRADE_REQUIRED_TOKEN: "group_capacity_upgrade_required",
  probeAppBuildFreshness: mocks.probeAppBuildFreshness,
}));

import {
  GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE,
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listActiveGroupMembers,
  listCourseGroupSummaries,
  loadGroupWorkflowSnapshot,
  mapCourseGroupSummaries,
  removeGroupMember,
  requestToJoinGroup,
  respondToGroupInvitation,
  reviewGroupJoinRequest,
  setGroupMaxMembers,
} from "@/lib/supabaseGroups";

const profileId = "11111111-1111-4111-8111-111111111111";
const secondProfileId = "33333333-3333-4333-8333-333333333333";
const groupId = "22222222-2222-4222-8222-222222222222";
const baseRow = {
  profile_id: profileId,
  group_id: groupId,
  group_name: "Research team",
  group_status: "active",
  group_size: 3,
  max_members: 5,
  capacity_count: 3,
  capacity_state: "available",
};

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
  mocks.rpc.mockReturnValue(rpcResult({ data: null, error: null }));
  mocks.probeAppBuildFreshness.mockResolvedValue("unknown");
});

describe("active member roster pagination", () => {
  const row = (id: string) => ({
    id,
    group_id: groupId,
    course_id: "course-1",
    profile_id: id,
    display_name_snapshot: "Member",
    membership_status: "active",
    joined_at: "2026-11-01T00:00:00Z",
  });
  function queryWithPages(
    pages: Array<{ data: unknown[]; count: number | null }>
  ) {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    for (const page of pages)
      query.range.mockResolvedValueOnce({ ...page, error: null });
    mocks.from.mockReturnValue(query);
    return query;
  }
  it("continues until the exact count is reached, even if the server limits page sizes", async () => {
    const query = queryWithPages([
      { data: [row("one"), row("two")], count: 3 },
      { data: [row("three")], count: 3 },
    ]);
    expect(
      (await listActiveGroupMembers("actor", groupId)).map(m => m.id)
    ).toEqual(["one", "two", "three"]);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 99);
    expect(query.range).toHaveBeenNthCalledWith(2, 2, 101);
  });
  it("fails closed when the count changes or a roster page is incomplete", async () => {
    queryWithPages([
      { data: [row("one")], count: 2 },
      { data: [row("two")], count: 3 },
    ]);
    await expect(listActiveGroupMembers("actor", groupId)).rejects.toThrow(
      /changed or could not be counted/i
    );
    queryWithPages([{ data: [], count: 1 }]);
    await expect(listActiveGroupMembers("actor", groupId)).rejects.toThrow(
      /incomplete/i
    );
  });
  it("fails closed for duplicate or wrong-group roster rows", async () => {
    queryWithPages([{ data: [row("one"), row("one")], count: 2 }]);
    await expect(listActiveGroupMembers("actor", groupId)).rejects.toThrow(
      /changed while loading/i
    );
    queryWithPages([
      { data: [{ ...row("one"), group_id: "another" }], count: 1 },
    ]);
    await expect(listActiveGroupMembers("actor", groupId)).rejects.toThrow(
      /changed while loading/i
    );
  });
});

describe("capacity-bearing course group summaries", () => {
  it.each([
    {
      group_size: 2,
      max_members: 3,
      capacity_count: 2,
      capacity_state: "available",
    },
    {
      group_size: 2,
      max_members: 2,
      capacity_count: 2,
      capacity_state: "full",
    },
    {
      group_size: 4,
      max_members: 3,
      capacity_count: 4,
      capacity_state: "full",
    },
    {
      group_size: 19,
      max_members: 19,
      capacity_count: 19,
      capacity_state: "full",
    },
    {
      group_size: 3,
      max_members: null,
      capacity_count: 3,
      capacity_state: "maximum_not_set",
    },
    {
      group_size: 20,
      max_members: null,
      capacity_count: 20,
      capacity_state: "over_limit",
    },
    {
      group_size: 20,
      max_members: 19,
      capacity_count: 20,
      capacity_state: "over_limit",
    },
  ])(
    "maps the draft state $capacity_state for count $capacity_count and maximum $max_members",
    capacity => {
      const row = { ...baseRow, ...capacity };
      expect(mapCourseGroupSummaries([row])).toEqual([row]);
    }
  );

  it("accepts the existing numeric-string bigint group_size and keeps null unconfigured", () => {
    expect(
      mapCourseGroupSummaries([
        {
          ...baseRow,
          group_size: "3",
          max_members: null,
          capacity_state: "maximum_not_set",
        },
      ])
    ).toEqual([
      { ...baseRow, max_members: null, capacity_state: "maximum_not_set" },
    ]);
  });

  it("requires the exact field set and rejects extra, missing, or null required data", () => {
    expect(() => mapCourseGroupSummaries({})).toThrow(/response is invalid/i);
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, member_names: ["Private"] }])
    ).toThrow(/response is invalid/i);
    for (const key of Object.keys(baseRow)) {
      const incomplete: Record<string, unknown> = { ...baseRow };
      delete incomplete[key];
      expect(() => mapCourseGroupSummaries([incomplete]), key).toThrow();
    }
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, max_members: undefined }])
    ).toThrow();
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, capacity_count: null }])
    ).toThrow();
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, capacity_state: null }])
    ).toThrow();
  });

  it.each([1, 20, 2.5, NaN, Infinity, -Infinity, "3", undefined])(
    "rejects invalid maximum %s",
    max =>
      expect(() =>
        mapCourseGroupSummaries([{ ...baseRow, max_members: max }])
      ).toThrow()
  );

  it.each([0, 1, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3"])(
    "rejects invalid capacity count %s",
    count =>
      expect(() =>
        mapCourseGroupSummaries([{ ...baseRow, capacity_count: count }])
      ).toThrow()
  );

  it.each([
    0,
    1,
    -1,
    2.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "3.0",
    "",
    null,
  ])("rejects invalid group size %s", size =>
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, group_size: size }])
    ).toThrow()
  );

  it.each([
    { capacity_count: 2, group_size: 3 },
    { max_members: null, capacity_state: "available" },
    { max_members: null, capacity_state: "full" },
    { max_members: 5, capacity_state: "maximum_not_set" },
    { max_members: 3, capacity_state: "available" },
    { max_members: 5, capacity_state: "full" },
    {
      group_size: 20,
      capacity_count: 20,
      max_members: null,
      capacity_state: "maximum_not_set",
    },
    {
      group_size: 20,
      capacity_count: 20,
      max_members: 19,
      capacity_state: "full",
    },
    { capacity_state: "unlimited" },
  ])("rejects inconsistent capacity fields %#", fields => {
    expect(() => mapCourseGroupSummaries([{ ...baseRow, ...fields }])).toThrow(
      /invalid data/i
    );
  });

  it("rejects duplicate peers and contradictory metadata for the same group", () => {
    expect(() => mapCourseGroupSummaries([baseRow, baseRow])).toThrow(
      /invalid data/i
    );
    expect(() =>
      mapCourseGroupSummaries([
        baseRow,
        { ...baseRow, profile_id: secondProfileId, max_members: 6 },
      ])
    ).toThrow(/inconsistent group data/i);
    expect(
      mapCourseGroupSummaries([
        baseRow,
        { ...baseRow, profile_id: secondProfileId },
      ])
    ).toHaveLength(2);
  });

  it("rejects malformed IDs and status", () => {
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, profile_id: "not-a-uuid" }])
    ).toThrow();
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, group_id: "not-a-uuid" }])
    ).toThrow();
    expect(() =>
      mapCourseGroupSummaries([{ ...baseRow, group_status: "archived" }])
    ).toThrow();
  });

  it("maps the authenticated summary RPC response", async () => {
    mocks.rpc.mockReturnValueOnce(rpcResult({ data: [baseRow], error: null }));
    await expect(listCourseGroupSummaries("actor", "course")).resolves.toEqual([
      baseRow,
    ]);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_course_group_summaries_capacity",
      { p_course_id: "course" }
    );
  });
});

describe("capacity service RPCs", () => {
  it("sends the explicitly selected maximum and trimmed name when creating a group", async () => {
    const created = { group_id: "g", invitation_id: "i" };
    const request = rpcResult({ data: [created], error: null });
    mocks.rpc.mockReturnValueOnce(request);
    await expect(
      createGroupAndInvite("actor", "course", "recipient", "  Team  ", 2)
    ).resolves.toEqual(created);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(request.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer token-a"
    );
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_group_and_invite", {
      p_course_id: "course",
      p_recipient_id: "recipient",
      p_name: "Team",
      p_max_members: 2,
    });
  });

  it("reports a malformed creation response without retrying an old overload", async () => {
    mocks.rpc.mockReturnValueOnce(rpcResult({ data: [], error: null }));
    await expect(
      createGroupAndInvite("actor", "course", "recipient", "Team", 19)
    ).rejects.toThrow(/did not return/i);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_group_and_invite",
      expect.objectContaining({ p_max_members: 19 })
    );
  });

  it("propagates a missing new RPC without retrying an old overload", async () => {
    const error = { code: "PGRST202", message: "function not found" };
    mocks.rpc.mockReturnValueOnce(rpcResult({ data: null, error }));
    await expect(
      createGroupAndInvite("actor", "course", "recipient", "Team", 2)
    ).rejects.toBe(error);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_group_and_invite", {
      p_course_id: "course",
      p_recipient_id: "recipient",
      p_name: "Team",
      p_max_members: 2,
    });
  });

  it.each([undefined, null, 1, 20, 2.1, NaN, Infinity, -Infinity, "3"])(
    "rejects invalid maximum %s without making a write RPC",
    async value => {
      const invalid = value as unknown as number;
      await expect(
        createGroupAndInvite("actor", "course", "recipient", "Team", invalid)
      ).rejects.toThrow(/whole number between 2 and 19/i);
      await expect(
        setGroupMaxMembers("actor", "group", invalid)
      ).rejects.toThrow(/whole number between 2 and 19/i);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([2, 19])(
    "sets a valid maximum %i with the exact draft argument names",
    async maximum => {
      mocks.rpc.mockReturnValueOnce(rpcResult({ data: maximum, error: null }));
      await expect(setGroupMaxMembers("actor", "group", maximum)).resolves.toBe(
        maximum
      );
      expect(mocks.getUser).toHaveBeenCalledOnce();
      expect(mocks.rpc).toHaveBeenCalledWith("set_group_max_members", {
        p_group_id: "group",
        p_max_members: maximum,
      });
    }
  );

  it("removes one specified member only through the draft RPC", async () => {
    mocks.rpc.mockReturnValueOnce(rpcResult({ data: "removed", error: null }));
    await expect(removeGroupMember("actor", "group", "member")).resolves.toBe(
      "removed"
    );
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("remove_group_member", {
      p_group_id: "group",
      p_profile_id: "member",
    });
  });

  it.each([
    () => createGroupAndInvite("wrong-user", "course", "recipient", "Team", 2),
    () => setGroupMaxMembers("wrong-user", "group", 2),
    () => removeGroupMember("wrong-user", "group", "member"),
  ])(
    "does not invoke a write RPC for an unverified user %#",
    async operation => {
      await expect(operation()).rejects.toThrow(
        /sign-in could not be verified/i
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it("keeps the direct request_to_join_group RPC and exact argument unchanged", async () => {
    mocks.rpc.mockReturnValueOnce(
      rpcResult({ data: "request-id", error: null })
    );
    await expect(requestToJoinGroup("actor", "group")).resolves.toBe(
      "request-id"
    );
    expect(mocks.rpc).toHaveBeenCalledWith("request_to_join_group", {
      p_group_id: "group",
    });
  });

  it.each([
    {
      operation: () => respondToGroupInvitation("actor", "invitation", true),
      rpc: "respond_to_group_invitation",
      args: { p_invitation_id: "invitation", p_accept: true },
    },
    {
      operation: () => reviewGroupJoinRequest("actor", "request", true),
      rpc: "review_group_join_request",
      args: { p_request_id: "request", p_approve: true },
    },
  ])(
    "propagates a full error from $rpc without issuing another write",
    async ({ operation, rpc, args }) => {
      const error = { message: "Group is full" };
      mocks.rpc.mockReturnValueOnce(rpcResult({ data: null, error }));
      await expect(operation()).rejects.toBe(error);
      expect(mocks.rpc).toHaveBeenCalledOnce();
      expect(mocks.rpc).toHaveBeenCalledWith(rpc, args);
    }
  );

  it("selects max_members in the existing snapshot and preserves legacy null", async () => {
    const group = {
      id: "11111111-1111-4111-8111-111111111111",
      course_id: "22222222-2222-4222-8222-222222222222",
      creator_id: "33333333-3333-4333-8333-333333333333",
      status: "forming",
      name: "Team",
      max_members: null,
      created_at: "2026-01-01",
    };
    const builders: Record<
      string,
      {
        select: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        order: ReturnType<typeof vi.fn>;
      }
    > = {};
    mocks.from.mockImplementation((table: string) => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn().mockResolvedValue({
          data: table === "study_groups" ? [group] : [],
          error: null,
        }),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builders[table] = builder;
      return builder;
    });
    const snapshot = await loadGroupWorkflowSnapshot("actor");
    expect(snapshot.groups).toEqual([group]);
    expect(builders.study_groups.select).toHaveBeenCalledWith(
      "id, course_id, creator_id, status, name, max_members, created_at"
    );
    expect(builders.group_memberships.eq).toHaveBeenCalledWith(
      "profile_id",
      "actor"
    );
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
});

describe("safe capacity feedback", () => {
  it.each([
    ["Group is full", "Group is full"],
    ["Group maximum is not set", "Group maximum is not set"],
    [
      "Group maximum is not set; set a maximum before adding members",
      "Group maximum is not set",
    ],
    [
      "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.",
      "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.",
    ],
    [
      "Maximum cannot be lower than the current number of active members. Remove members first.",
      "Maximum cannot be lower than the current number of active members. Remove members first.",
    ],
    [
      "group maximum must be between 2 and 19",
      "Choose a whole-number group maximum between 2 and 19.",
    ],
    [
      "Group maximum does not match this group; edit the maximum before inviting",
      "The chosen maximum does not match this group's maximum. The leader must edit the maximum before inviting.",
    ],
    [
      "the current group leader cannot remove themselves through this operation",
      "The current group leader cannot remove themselves through this action.",
    ],
    [
      "the last active member cannot be removed through this operation",
      "The last active group member cannot be removed through this action.",
    ],
    [
      "target is no longer an active member of this group",
      "This person is no longer an active member of the group. Refresh the page to see the current members.",
    ],
  ])("maps the draft error %s", (raw, friendly) => {
    expect(getGroupWorkflowErrorMessage({ message: raw })).toBe(friendly);
  });

  it("retains existing conflict, authorization and safe fallback messages", () => {
    expect(
      getGroupWorkflowErrorMessage(
        new Error("only the current group leader may review requests")
      )
    ).toMatch(/review this request/i);
    expect(
      getGroupWorkflowErrorMessage(
        new Error("only the current group leader may set the maximum")
      )
    ).toMatch(/set the maximum/i);
    expect(
      getGroupWorkflowErrorMessage(
        new Error("only the current group leader may remove members")
      )
    ).toMatch(/remove members/i);
    expect(
      getGroupWorkflowErrorMessage(
        new Error("student already has a pending join request for this group")
      )
    ).toMatch(/first pending action/i);
    expect(
      getGroupWorkflowErrorMessage({ message: "secret SQL details" })
    ).not.toContain("secret SQL details");
    expect(
      getGroupWorkflowErrorMessage({
        code: "42501",
        message: "permission denied",
      })
    ).toMatch(/not permitted/i);
  });
});

it("blocks a group mutation when its initiating context is stale", async () => {
  await expect(
    requestToJoinGroup("actor", groupId, () => false)
  ).rejects.toThrow(/workspace changed before the action could be sent/i);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

describe("stale-client capacity upgrade-required signal", () => {
  const approved = "CityLink needs an update. Refresh before creating a group.";
  const fallback =
    "CityLink could not complete that group action. Your request was not confirmed; refresh and try again.";

  it("maps the contract code with the stable token to the exact approved string", () => {
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "group_capacity_upgrade_required",
      })
    ).toBe(approved);
  });

  it("maps the stable token alone to the same approved string", () => {
    expect(
      getGroupWorkflowErrorMessage({
        message: "group_capacity_upgrade_required",
      })
    ).toBe(approved);
    // The matcher is the machine token, never localized or human-readable
    // prose, and it is compared case-insensitively.
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "GROUP_CAPACITY_UPGRADE_REQUIRED",
      })
    ).toBe(approved);
  });

  it("keeps the capacity exact labels ahead of the upgrade handler for other 45000 errors", () => {
    expect(
      getGroupWorkflowErrorMessage({ code: "45000", message: "Group is full" })
    ).toBe("Group is full");
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "Group maximum is not set",
      })
    ).toBe("Group maximum is not set");
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "This group has more than 19 active members.",
      })
    ).toBe(
      "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set."
    );
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message:
          "maximum cannot be lower than the current number of active members",
      })
    ).toBe(
      "Maximum cannot be lower than the current number of active members. Remove members first."
    );
  });

  it("does not read an unrelated 45000 or a genuinely missing function as an upgrade", () => {
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "secret SQL details",
      })
    ).toBe(fallback);
    expect(
      getGroupWorkflowErrorMessage({
        code: "45000",
        message: "CityLink 需要更新後再建立群組",
      })
    ).toBe(fallback);
    expect(
      getGroupWorkflowErrorMessage({
        code: "PGRST202",
        message: "function not found",
      })
    ).toBe(fallback);
  });

  it("surfaces the upgrade string for a rejected legacy create without retry or altered arguments", async () => {
    const error = {
      code: "45000",
      message: "group_capacity_upgrade_required",
    };
    mocks.rpc.mockReturnValueOnce(rpcResult({ data: null, error }));
    let thrown: unknown = null;
    try {
      await createGroupAndInvite("actor", "course", "recipient", "  Team  ", 5);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBe(error);
    // No auto-retry and no default/unlimited maximum substitution: the single
    // supported four-argument request is sent verbatim, trimmed as before.
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_group_and_invite", {
      p_course_id: "course",
      p_recipient_id: "recipient",
      p_name: "Team",
      p_max_members: 5,
    });
    expect(getGroupWorkflowErrorMessage(thrown)).toBe(approved);
  });

  it("blocks the create dispatch when the loaded bundle proves it is stale", async () => {
    mocks.probeAppBuildFreshness.mockResolvedValueOnce("stale");
    let thrown: unknown = null;
    try {
      await createGroupAndInvite("actor", "course", "recipient", "  Team  ", 5);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(Error);
    // The stable machine token is thrown, not a new user-facing sentence.
    expect((thrown as Error).message).toBe("group_capacity_upgrade_required");
    // Fail closed before dispatch: no creation request is sent, so there is
    // nothing that could have been retried or silently downgraded.
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.probeAppBuildFreshness).toHaveBeenCalledOnce();
    expect(getGroupWorkflowErrorMessage(thrown)).toBe(
      GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE
    );
  });

  it("dispatches the supported request once when the marker is unknown or fresh", async () => {
    for (const verdict of ["unknown", "fresh"] as const) {
      mocks.rpc.mockReset();
      mocks.rpc.mockReturnValueOnce(
        rpcResult({
          data: [{ group_id: groupId, invitation_id: "invitation-1" }],
          error: null,
        })
      );
      mocks.probeAppBuildFreshness.mockResolvedValueOnce(verdict);
      await expect(
        createGroupAndInvite("actor", "course", "recipient", "  Team  ", 5)
      ).resolves.toEqual({ group_id: groupId, invitation_id: "invitation-1" });
      expect(mocks.rpc).toHaveBeenCalledWith("create_group_and_invite", {
        p_course_id: "course",
        p_recipient_id: "recipient",
        p_name: "Team",
        p_max_members: 5,
      });
      expect(mocks.rpc).toHaveBeenCalledOnce();
    }
  });

  it("exports the approved create-path string byte-for-byte", () => {
    expect(GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE).toBe(approved);
    expect(GROUP_CAPACITY_UPGRADE_REQUIRED_MESSAGE).toBe(
      "CityLink needs an update. Refresh before creating a group."
    );
  });
});
