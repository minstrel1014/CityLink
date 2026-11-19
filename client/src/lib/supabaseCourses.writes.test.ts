import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import {
  addOwnCourseEnrolment,
  getCourseDirectoryErrorMessage,
  removeOwnCourseEnrolment,
} from "@/lib/supabaseCourses";

const enrolmentQuery = {
  insert: mocks.insert,
  delete: mocks.delete,
  eq: mocks.eq,
  select: mocks.select,
  maybeSingle: mocks.maybeSingle,
};

function writeRequest(result: { data?: unknown; error: unknown }) {
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

describe("Supabase enrolment writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "token-a" } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "authenticated-user-a" } },
      error: null,
    });
    mocks.from.mockReturnValue(enrolmentQuery);
    mocks.insert.mockReturnValue(writeRequest({ error: null }));
    mocks.delete.mockReturnValue(enrolmentQuery);
    mocks.eq.mockReturnValue(enrolmentQuery);
    mocks.select.mockReturnValue(enrolmentQuery);
    mocks.maybeSingle.mockReturnValue(
      writeRequest({
        data: {
          student_id: "authenticated-user-a",
          course_id: "course-uuid-a",
        },
        error: null,
      })
    );
  });

  it("inserts only the verified user ID and course ID, leaving created_at to the database", async () => {
    const request = writeRequest({ error: null });
    mocks.insert.mockReturnValueOnce(request);
    await addOwnCourseEnrolment("authenticated-user-a", "course-uuid-a");

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(request.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer token-a"
    );
    expect(mocks.from).toHaveBeenCalledWith("enrolments");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith({
      student_id: "authenticated-user-a",
      course_id: "course-uuid-a",
    });
  });

  it("rejects a caller-supplied user ID that does not match the authenticated user", async () => {
    await expect(
      addOwnCourseEnrolment("authenticated-user-b", "course-uuid-a")
    ).rejects.toThrow(/sign-in could not be verified/i);

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("deletes only the verified user's matching course enrolment", async () => {
    const request = writeRequest({
      data: {
        student_id: "authenticated-user-a",
        course_id: "course-uuid-a",
      },
      error: null,
    });
    mocks.maybeSingle.mockReturnValueOnce(request);
    await removeOwnCourseEnrolment("authenticated-user-a", "course-uuid-a");

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(request.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer token-a"
    );
    expect(mocks.from).toHaveBeenCalledWith("enrolments");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.eq.mock.calls).toEqual([
      ["student_id", "authenticated-user-a"],
      ["course_id", "course-uuid-a"],
    ]);
    expect(mocks.select).toHaveBeenCalledWith("student_id, course_id");
  });

  it("shows a clear duplicate-enrolment message", () => {
    expect(getCourseDirectoryErrorMessage({ code: "23505" }, "write")).toMatch(
      /already enrolled/i
    );
  });

  it("keeps raw database details out of RLS-denial feedback", () => {
    const message = getCourseDirectoryErrorMessage(
      { code: "42501", message: "permission denied for table enrolments" },
      "write"
    );

    expect(message).toMatch(/not permitted/i);
    expect(message).not.toContain("permission denied for table enrolments");
  });
});
