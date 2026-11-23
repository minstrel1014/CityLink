import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import { loadOwnCourseGroupSnapshot } from "@/lib/supabaseGroups";
import { recruitmentEligibility } from "@/pages/citylink/GroupWorkspaceScope";

type Row = Record<string, unknown>;
type Response = {
  data: unknown;
  count: number | null | undefined;
  error: unknown;
};
type Query = {
  table: string;
  columns?: string;
  options?: unknown;
  filters: Array<[string, string, unknown]>;
  orders: Array<[string, unknown]>;
  range?: [number, number];
};

const uuid = (number: number) =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const userId = uuid(1);
const courseId = uuid(2);
const otherUser = uuid(3);
const otherCourse = uuid(4);
const timestamp = "2026-11-17T09:00:00Z";
const membership = (i: number): Row => ({
  id: uuid(10000 + i),
  group_id: uuid(20000 + i),
  course_id: courseId,
  profile_id: userId,
  display_name_snapshot: "A Student",
  membership_status: "active",
  joined_at: timestamp,
});
const group = (i: number, overrides: Row = {}): Row => ({
  id: uuid(20000 + i),
  course_id: courseId,
  creator_id: otherUser,
  status: "active",
  name: "Our group",
  max_members: null,
  created_at: timestamp,
  ...overrides,
});
const auth = (id: string | null = userId) => ({
  data: { user: id ? { id } : null },
  error: null,
});
const retryable = /could not be verified.*refresh and try again/i;

/** A miniature PostgREST response: filters before count, range, and server cap. */
function mockTables({
  memberships = [membership(1)],
  groups = [group(1)],
  rowLimit = 50,
  mutate,
}: {
  memberships?: Row[];
  groups?: Row[];
  rowLimit?: number;
  mutate?: (response: Response, query: Query, page: number) => Response;
} = {}) {
  const calls: Query[] = [];
  const pages: Record<string, number> = {};
  mocks.from.mockImplementation((table: string) => {
    const query: Query = { table, filters: [], orders: [] };
    calls.push(query);
    const builder = {
      select: vi.fn((columns: string, options: unknown) => {
        query.columns = columns;
        query.options = options;
        return builder;
      }),
      eq: vi.fn((key: string, value: unknown) => {
        query.filters.push(["eq", key, value]);
        return builder;
      }),
      in: vi.fn((key: string, value: unknown[]) => {
        query.filters.push(["in", key, value]);
        return builder;
      }),
      order: vi.fn((key: string, options: unknown) => {
        query.orders.push([key, options]);
        return builder;
      }),
      range: vi.fn((from: number, to: number) => {
        query.range = [from, to];
        let rows = [...(table === "group_memberships" ? memberships : groups)];
        for (const [op, key, value] of query.filters) {
          rows = rows.filter(row =>
            op === "eq"
              ? row[key] === value
              : (value as unknown[]).includes(row[key])
          );
        }
        rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const count = rows.length;
        let response: Response = {
          data: rows.slice(from, Math.min(to + 1, from + rowLimit)),
          count,
          error: null,
        };
        pages[table] = (pages[table] ?? 0) + 1;
        if (mutate) response = mutate(response, query, pages[table]);
        return Promise.resolve(response);
      }),
    };
    return builder;
  });
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue(auth());
});

describe("own-course group snapshot", () => {
  it("returns an authenticated empty result only after an exact zero count", async () => {
    const calls = mockTables({ memberships: [], groups: [group(1)] });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).resolves.toEqual(
      {
        groups: [],
        memberships: [],
      }
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ count: "exact" });
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("finds memberships and groups beyond server-limited pages without exposing unrelated groups", async () => {
    const memberships = Array.from({ length: 5 }, (_, i) => membership(i + 1));
    const ownGroups = [
      group(1),
      group(2, { status: "forming", name: "" }),
      group(3, { status: "archived", creator_id: null }),
      group(4, { status: "abandoned" }),
      group(5),
    ];
    // These visible unrelated groups would fill an unscoped first page.
    const unrelated = Array.from({ length: 120 }, (_, i) =>
      group(i + 1000, {
        id: uuid(5000 + i),
        created_at: "2026-11-18T09:00:00Z",
      })
    );
    const oldUnscopedPage = [...unrelated, ...ownGroups]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 100);
    expect(oldUnscopedPage.map(row => row.id)).not.toContain(ownGroups[4].id);
    const calls = mockTables({
      memberships,
      groups: [...unrelated, ...ownGroups],
      rowLimit: 2,
    });
    const snapshot = await loadOwnCourseGroupSnapshot(userId, courseId);
    expect(snapshot).toEqual({ groups: ownGroups, memberships });
    const membershipCalls = calls.filter(
      call => call.table === "group_memberships"
    );
    const groupCalls = calls.filter(call => call.table === "study_groups");
    expect(membershipCalls.map(call => call.range)).toEqual([
      [0, 49],
      [2, 51],
      [4, 53],
    ]);
    expect(groupCalls.map(call => call.range)).toEqual([
      [0, 49],
      [2, 51],
      [4, 53],
    ]);
    for (const call of calls) {
      expect(call.options).toEqual({ count: "exact" });
      expect(call.orders).toEqual([["id", { ascending: true }]]);
    }
    for (const call of membershipCalls) {
      expect(call.filters).toEqual([
        ["eq", "profile_id", userId],
        ["eq", "course_id", courseId],
        ["eq", "membership_status", "active"],
      ]);
      expect(call.columns).toBe(
        "id, group_id, course_id, profile_id, display_name_snapshot, membership_status, joined_at"
      );
    }
    for (const call of groupCalls) {
      expect(call.filters).toEqual([
        ["eq", "course_id", courseId],
        ["in", "id", memberships.map(row => row.group_id)],
      ]);
      expect(call.columns).toBe(
        "id, course_id, creator_id, status, name, max_members, created_at"
      );
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    const eligible = recruitmentEligibility(
      userId,
      courseId,
      true,
      snapshot.groups,
      snapshot.memberships
    );
    expect(eligible).toEqual({
      verified: true,
      groups: [ownGroups[0], ownGroups[4]],
    });
  });

  it("uses bounded ID batches and pages through each exact group count", async () => {
    const memberships = Array.from({ length: 51 }, (_, i) => membership(i));
    const groups = Array.from({ length: 51 }, (_, i) => group(i));
    const calls = mockTables({ memberships, groups, rowLimit: 7 });
    expect(await loadOwnCourseGroupSnapshot(userId, courseId)).toEqual({
      groups,
      memberships,
    });
    const groupCalls = calls.filter(call => call.table === "study_groups");
    const batchSizes = groupCalls.map(
      call => (call.filters[1][2] as string[]).length
    );
    expect(batchSizes).toEqual([...Array(8).fill(50), 1]);
    for (const call of calls) {
      expect(call.range![1] - call.range![0] + 1).toBe(50);
    }
  });

  it.each([
    ["different account", auth(otherUser)],
    ["no user", auth(null)],
    [
      "auth error",
      { data: { user: { id: userId } }, error: new Error("bad session") },
    ],
  ])("makes no reads when authentication fails: %s", async (_, response) => {
    mocks.getUser.mockResolvedValue(response);
    mockTables();
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      /sign-in could not be verified/i
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects an account change during the read, including the zero-row case", async () => {
    mocks.getUser
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(auth(otherUser));
    mockTables({ memberships: [] });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      /sign-in could not be verified/i
    );
  });

  it("rejects invalid scope identifiers without issuing table reads", async () => {
    mockTables();
    await expect(
      loadOwnCourseGroupSnapshot(userId, "not-a-course-id")
    ).rejects.toThrow(retryable);
    mocks.getUser.mockResolvedValue(auth("not-a-user-id"));
    await expect(
      loadOwnCourseGroupSnapshot("not-a-user-id", courseId)
    ).rejects.toThrow(retryable);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["group_memberships", "study_groups"])(
    "rejects missing or invalid %s counts",
    async table => {
      for (const count of [
        null,
        undefined,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        mockTables({
          mutate: (response, query) =>
            query.table === table ? { ...response, count } : response,
        });
        await expect(
          loadOwnCourseGroupSnapshot(userId, courseId)
        ).rejects.toThrow(retryable);
      }
    }
  );

  it.each(["group_memberships", "study_groups"])(
    "rejects count changes between %s pages",
    async table => {
      mockTables({
        memberships: [membership(1), membership(2)],
        groups: [group(1), group(2)],
        rowLimit: 1,
        mutate: (response, query, page) =>
          query.table === table && page === 2
            ? { ...response, count: 3 }
            : response,
      });
      await expect(
        loadOwnCourseGroupSnapshot(userId, courseId)
      ).rejects.toThrow(retryable);
    }
  );

  it.each(["group_memberships", "study_groups"])(
    "rejects incomplete, missing, or excessive %s data",
    async table => {
      for (const data of [[], null, [membership(1), membership(2)]]) {
        mockTables({
          mutate: (response, query) =>
            query.table === table ? { ...response, data } : response,
        });
        await expect(
          loadOwnCourseGroupSnapshot(userId, courseId)
        ).rejects.toThrow(retryable);
      }
    }
  );

  it("fails when an exact group count shows a missing or RLS-unreadable group", async () => {
    mockTables({
      memberships: [membership(1), membership(2)],
      groups: [group(1)],
    });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
  });

  it.each(["group_memberships", "study_groups"])(
    "rejects duplicates or reversed IDs across %s pages",
    async table => {
      for (const invalidSecond of ["duplicate", "reverse"] as const) {
        mockTables({
          memberships: [membership(1), membership(2)],
          groups: [group(1), group(2)],
          rowLimit: 1,
          mutate: (response, query, page) => {
            if (query.table !== table) return response;
            const source = table === "group_memberships" ? membership : group;
            if (invalidSecond === "duplicate" && page === 2)
              return { ...response, data: [source(1)] };
            if (invalidSecond === "reverse" && page === 1)
              return { ...response, data: [source(2)] };
            return response;
          },
        });
        await expect(
          loadOwnCourseGroupSnapshot(userId, courseId)
        ).rejects.toThrow(retryable);
      }
    }
  );

  it("rejects two membership IDs pointing at the same group", async () => {
    const second = { ...membership(2), group_id: membership(1).group_id };
    const calls = mockTables({ memberships: [membership(1), second] });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
    expect(calls.every(call => call.table === "group_memberships")).toBe(true);
  });

  it.each([
    ["membership ID", { id: "bad" }],
    ["group ID", { group_id: "bad" }],
    ["profile ID", { profile_id: otherUser }],
    ["null profile", { profile_id: null }],
    ["course ID", { course_id: otherCourse }],
    ["inactive status", { membership_status: "left" }],
    ["missing name", { display_name_snapshot: "" }],
    ["invalid timestamp", { joined_at: "nonsense" }],
    ["unexpected private field", { private_data: "secret" }],
  ])(
    "rejects an out-of-scope or malformed membership: %s",
    async (_, overrides) => {
      mockTables({
        mutate: (response, query) =>
          query.table === "group_memberships"
            ? { ...response, data: [{ ...membership(1), ...overrides }] }
            : response,
      });
      await expect(
        loadOwnCourseGroupSnapshot(userId, courseId)
      ).rejects.toThrow(retryable);
    }
  );

  it.each([
    ["unrequested group", { id: uuid(999) }],
    ["malformed ID", { id: "bad" }],
    ["other course", { course_id: otherCourse }],
    ["unknown status", { status: "pending" }],
    ["invalid creator", { creator_id: "bad" }],
    ["invalid name", { name: null }],
    ["invalid maximum", { max_members: 1.2 }],
    ["missing maximum", { max_members: undefined }],
    ["invalid timestamp", { created_at: "nonsense" }],
    ["unexpected private field", { private_data: "secret" }],
  ])(
    "rejects a group that cannot safely match the membership: %s",
    async (_, overrides) => {
      mockTables({
        mutate: (response, query) =>
          query.table === "study_groups"
            ? { ...response, data: [{ ...group(1), ...overrides }] }
            : response,
      });
      await expect(
        loadOwnCourseGroupSnapshot(userId, courseId)
      ).rejects.toThrow(retryable);
    }
  );

  it.each(["group_memberships", "study_groups"])(
    "converts %s query errors to retryable failures",
    async table => {
      mockTables({
        mutate: (response, query) =>
          query.table === table
            ? { ...response, error: { message: "private SQL detail" } }
            : response,
      });
      await expect(
        loadOwnCourseGroupSnapshot(userId, courseId)
      ).rejects.toThrow(retryable);
    }
  );

  it("converts a synchronous query failure to a retryable failure", async () => {
    mocks.from.mockImplementation(() => {
      throw new Error("network failure");
    });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
  });

  it("converts a rejected transport promise to a retryable failure", async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockRejectedValue(new Error("network failure")),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    mocks.from.mockReturnValue(builder);
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
  });

  it.each([null, undefined, { data: [], count: 0 }])(
    "rejects a malformed response envelope %#",
    async badResponse => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        range: vi.fn().mockResolvedValue(badResponse),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      mocks.from.mockReturnValue(builder);
      await expect(
        loadOwnCourseGroupSnapshot(userId, courseId)
      ).rejects.toThrow(retryable);
    }
  );

  it("rejects a response exceeding the requested page size", async () => {
    const memberships = Array.from({ length: 51 }, (_, i) => membership(i));
    mockTables({
      memberships,
      mutate: response => ({ ...response, data: memberships }),
    });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
  });

  it("accepts the row cap boundary when it can be read within the request cap", async () => {
    const memberships = Array.from({ length: 500 }, (_, i) => membership(i));
    const groups = Array.from({ length: 500 }, (_, i) => group(i));
    const calls = mockTables({ memberships, groups });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).resolves.toEqual(
      {
        memberships,
        groups,
      }
    );
    expect(calls).toHaveLength(20);
  });

  it("fails closed above the row count cap", async () => {
    const calls = mockTables({
      mutate: response => ({ ...response, count: 501 }),
    });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
    expect(calls).toHaveLength(1);
  });

  it("fails closed at the global request cap when the server cap is tiny", async () => {
    const memberships = Array.from({ length: 70 }, (_, i) => membership(i));
    const calls = mockTables({ memberships, rowLimit: 1 });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
    expect(calls).toHaveLength(64);
    expect(calls.every(call => call.table === "group_memberships")).toBe(true);
  });

  it("shares the request cap between membership pages and group pages", async () => {
    const memberships = Array.from({ length: 33 }, (_, i) => membership(i));
    const groups = Array.from({ length: 33 }, (_, i) => group(i));
    const calls = mockTables({ memberships, groups, rowLimit: 1 });
    await expect(loadOwnCourseGroupSnapshot(userId, courseId)).rejects.toThrow(
      retryable
    );
    expect(calls).toHaveLength(64);
    expect(
      calls.filter(call => call.table === "group_memberships")
    ).toHaveLength(33);
    expect(calls.filter(call => call.table === "study_groups")).toHaveLength(
      31
    );
  });
});
