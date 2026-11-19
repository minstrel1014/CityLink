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

import { hasCurrentTermCourseEnrollment } from "@/lib/supabaseCourses";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const courseId = "11111111-1111-4111-8111-111111111111";
const otherCourseId = "22222222-2222-4222-8222-222222222222";
const ownRow = { student_id: userId, course_id: courseId };
const countRow = { course_id: courseId, enrolled_count: 3 };

type ResponseFixture = {
  data: unknown;
  error: unknown;
  ignoreFilters?: boolean;
};

// Apply the filters before the limit like PostgREST, unless a test deliberately
// simulates a bad server response to exercise the client's defensive checks.
function makeQuery(fixture: ResponseFixture) {
  const filters: [string, unknown][] = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    limit: vi.fn(async (limit: number) => {
      let data = fixture.data;
      if (Array.isArray(data)) {
        if (!fixture.ignoreFilters) {
          data = data.filter(row =>
            filters.every(
              ([column, value]) =>
                typeof row === "object" &&
                row !== null &&
                !Array.isArray(row) &&
                row[column] === value
            )
          );
        }
        data = (data as unknown[]).slice(0, limit);
      }
      return { data, error: fixture.error };
    }),
  };
  return query;
}

describe("hasCurrentTermCourseEnrollment", () => {
  let enrolments: ResponseFixture;
  let counts: ResponseFixture;
  let enrolmentQuery: ReturnType<typeof makeQuery>;
  let countQuery: ReturnType<typeof makeQuery>;

  beforeEach(() => {
    vi.resetAllMocks();
    enrolments = { data: [ownRow], error: null };
    counts = { data: [countRow], error: null };
    enrolmentQuery = makeQuery(enrolments);
    countQuery = makeQuery(counts);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.from.mockReturnValue(enrolmentQuery);
    mocks.rpc.mockReturnValue(countQuery);
  });

  it("returns true for the selected own enrolment and positive current-term count, using only narrow reads", async () => {
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).resolves.toBe(true);

    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.from.mock.calls).toEqual([["enrolments"]]);
    expect(enrolmentQuery.select.mock.calls).toEqual([
      ["student_id, course_id"],
    ]);
    expect(enrolmentQuery.eq.mock.calls).toEqual([
      ["student_id", userId],
      ["course_id", courseId],
    ]);
    expect(enrolmentQuery.limit.mock.calls).toEqual([[2]]);
    expect(mocks.rpc.mock.calls).toEqual([
      ["list_current_course_enrolment_counts"],
    ]);
    expect(countQuery.eq.mock.calls).toEqual([["course_id", courseId]]);
    expect(countQuery.limit.mock.calls).toEqual([[2]]);
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.from.mock.invocationCallOrder[0]
    );
    expect(mocks.getUser.mock.invocationCallOrder[1]).toBeGreaterThan(
      enrolmentQuery.limit.mock.invocationCallOrder[0]
    );
    expect(mocks.getUser.mock.invocationCallOrder[1]).toBeGreaterThan(
      countQuery.limit.mock.invocationCallOrder[0]
    );
  });

  it("accepts a positive integer count serialized as a string", async () => {
    counts.data = [{ course_id: courseId, enrolled_count: "1" }];
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).resolves.toBe(true);
  });

  it("accepts PostgreSQL's lowercase UUID output for an uppercase selected course", async () => {
    const lowerId = "abcdefab-cdef-0123-4567-abcdefabcdef";
    enrolments.data = [{ student_id: userId, course_id: lowerId }];
    counts.data = [{ course_id: lowerId, enrolled_count: 1 }];
    enrolments.ignoreFilters = true;
    counts.ignoreFilters = true;
    await expect(
      hasCurrentTermCourseEnrollment(userId, lowerId.toUpperCase())
    ).resolves.toBe(true);
  });

  it("rejects malformed IDs even if they match the supplied identifiers", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "not-a-uuid" } },
      error: null,
    });
    enrolments.data = [{ student_id: "not-a-uuid", course_id: courseId }];
    counts.data = [];
    await expect(
      hasCurrentTermCourseEnrollment("not-a-uuid", courseId)
    ).rejects.toThrow(/invalid/i);

    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    enrolments.data = [];
    counts.data = [{ course_id: "not-a-uuid", enrolled_count: 1 }];
    counts.ignoreFilters = true;
    await expect(
      hasCurrentTermCourseEnrollment(userId, "not-a-uuid")
    ).rejects.toThrow(/invalid/i);
  });

  it.each([
    { name: "no own enrolment", enrolments: [], counts: [countRow] },
    { name: "no current-term course", enrolments: [ownRow], counts: [] },
    { name: "neither row", enrolments: [], counts: [] },
    {
      name: "zero count and no own enrolment",
      enrolments: [],
      counts: [{ course_id: courseId, enrolled_count: 0 }],
    },
  ])(
    "returns false for $name and still verifies the session afterward",
    async fixture => {
      enrolments.data = fixture.enrolments;
      counts.data = fixture.counts;
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).resolves.toBe(false);
      expect(mocks.getUser).toHaveBeenCalledTimes(2);
      expect(enrolmentQuery.limit).toHaveBeenCalledWith(2);
      expect(countQuery.limit).toHaveBeenCalledWith(2);
    }
  );

  it.each([0, "0"])(
    "rejects a zero count (%s) that contradicts an own enrolment",
    async zero => {
      counts.data = [{ course_id: courseId, enrolled_count: zero }];
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).rejects.toThrow(/inconsistent/i);
    }
  );

  it("filters unrelated records before limiting, including unrelated malformed counts", async () => {
    enrolments.data = [
      ...Array.from({ length: 1200 }, () => ({
        student_id: userId,
        course_id: otherCourseId,
      })),
      { student_id: otherUserId, course_id: courseId },
      ownRow,
    ];
    counts.data = [
      ...Array.from({ length: 1200 }, () => ({
        course_id: otherCourseId,
        enrolled_count: "invalid",
        unexpected: true,
      })),
      countRow,
    ];
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).resolves.toBe(true);
    expect(enrolmentQuery.eq.mock.calls).toEqual([
      ["student_id", userId],
      ["course_id", courseId],
    ]);
    expect(countQuery.eq.mock.calls).toEqual([["course_id", courseId]]);
  });

  it("does not treat another user or course as the selected own enrolment", async () => {
    enrolments.data = [
      { student_id: userId, course_id: otherCourseId },
      { student_id: otherUserId, course_id: courseId },
    ];
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).resolves.toBe(false);
  });

  it("does not treat an unrelated course count as current-term evidence", async () => {
    counts.data = [{ course_id: otherCourseId, enrolled_count: 100 }];
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).resolves.toBe(false);
  });

  it.each([
    {
      name: "another account",
      row: { student_id: otherUserId, course_id: courseId },
    },
    {
      name: "another course",
      row: { student_id: userId, course_id: otherCourseId },
    },
    { name: "missing student ID", row: { course_id: courseId } },
    { name: "missing course ID", row: { student_id: userId } },
    { name: "extra field", row: { ...ownRow, extra: true } },
    { name: "null row", row: null },
    { name: "undefined row", row: undefined },
  ])("rejects a returned enrolment with $name", async ({ row }) => {
    enrolments.data = [row];
    enrolments.ignoreFilters = true;
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).rejects.toThrow(/invalid/i);
  });

  it.each([
    {
      name: "another course",
      row: { course_id: otherCourseId, enrolled_count: 1 },
    },
    { name: "missing course ID", row: { enrolled_count: 1 } },
    { name: "extra field", row: { ...countRow, student_ids: [userId] } },
    { name: "null row", row: null },
    { name: "undefined row", row: undefined },
  ])("rejects a returned count row with $name", async ({ row }) => {
    counts.data = [row];
    counts.ignoreFilters = true;
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).rejects.toThrow(/invalid/i);
  });

  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    "-1",
    "1.5",
    "",
    " 1",
    null,
    undefined,
    true,
    {},
  ])("rejects invalid enrolled_count %s", async value => {
    counts.data = [{ course_id: courseId, enrolled_count: value }];
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).rejects.toThrow(/invalid count/i);
  });

  it.each(["enrolments", "counts"])(
    "rejects a non-array %s response",
    async source => {
      (source === "enrolments" ? enrolments : counts).data = null;
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).rejects.toThrow(/invalid/i);
    }
  );

  it.each(["enrolments", "counts"])(
    "rejects duplicate %s even if the other result is empty",
    async source => {
      if (source === "enrolments") {
        enrolments.data = [ownRow, ownRow];
        counts.data = [];
      } else {
        enrolments.data = [];
        counts.data = [countRow, countRow];
      }
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).rejects.toThrow(/duplicated/i);
    }
  );

  it.each(["enrolments", "counts"])(
    "propagates a %s read error and verifies auth afterward",
    async source => {
      const failure = { code: "42501", message: `${source} denied` };
      (source === "enrolments" ? enrolments : counts).error = failure;
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).rejects.toBe(failure);
      expect(mocks.getUser).toHaveBeenCalledTimes(2);
    }
  );

  it("does not hide a count read error when the own enrolment is absent", async () => {
    const failure = new Error("count query failed");
    enrolments.data = [];
    counts.error = failure;
    await expect(hasCurrentTermCourseEnrollment(userId, courseId)).rejects.toBe(
      failure
    );
  });

  it("verifies auth after a rejected read as well", async () => {
    const failure = new Error("network failed");
    enrolmentQuery.limit.mockRejectedValueOnce(failure);
    await expect(hasCurrentTermCourseEnrollment(userId, courseId)).rejects.toBe(
      failure
    );
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("waits for both reads to settle before the final auth check", async () => {
    const failure = new Error("network failed");
    let finishCount!: (value: { data: unknown; error: unknown }) => void;
    enrolmentQuery.limit.mockRejectedValueOnce(failure);
    countQuery.limit.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishCount = resolve;
        })
    );

    const check = hasCurrentTermCourseEnrollment(userId, courseId);
    await vi.waitFor(() => expect(countQuery.limit).toHaveBeenCalled());
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    finishCount({ data: [countRow], error: null });
    await expect(check).rejects.toBe(failure);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "different account",
      response: { data: { user: { id: otherUserId } }, error: null },
    },
    {
      name: "signed-out account",
      response: { data: { user: null }, error: null },
    },
    {
      name: "auth error",
      response: { data: { user: null }, error: new Error("auth failed") },
    },
  ])("rejects $name before starting any reads", async ({ response }) => {
    mocks.getUser.mockResolvedValueOnce(response);
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).rejects.toThrow(/sign-in could not be verified/i);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "different account",
      response: { data: { user: { id: otherUserId } }, error: null },
    },
    {
      name: "signed-out account",
      response: { data: { user: null }, error: null },
    },
    {
      name: "auth error",
      response: { data: { user: null }, error: new Error("auth failed") },
    },
  ])(
    "rejects $name after reads, even when enrollment is absent",
    async ({ response }) => {
      enrolments.data = [];
      mocks.getUser.mockResolvedValueOnce({
        data: { user: { id: userId } },
        error: null,
      });
      mocks.getUser.mockResolvedValueOnce(response);
      await expect(
        hasCurrentTermCourseEnrollment(userId, courseId)
      ).rejects.toThrow(/sign-in could not be verified/i);
      expect(mocks.getUser).toHaveBeenCalledTimes(2);
    }
  );

  it("rejects a changed account after reading positive evidence", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: otherUserId } },
      error: null,
    });
    await expect(
      hasCurrentTermCourseEnrollment(userId, courseId)
    ).rejects.toThrow(/sign-in could not be verified/i);
  });

  it.each([
    { user: "", course: courseId },
    { user: "   ", course: courseId },
    { user: userId, course: "" },
    { user: userId, course: "   " },
  ])(
    "rejects missing identifiers without reading",
    async ({ user, course }) => {
      await expect(
        hasCurrentTermCourseEnrollment(user, course)
      ).rejects.toThrow(/required/i);
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
});
