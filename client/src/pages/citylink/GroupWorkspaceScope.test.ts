import { describe, expect, it, vi } from "vitest";
import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";
import {
  GroupWorkspaceScope,
  recruitmentEligibility,
  runScoped,
  runScopedAction,
} from "./GroupWorkspaceScope";

const course = { id: "course-1" };
const group = (overrides: Partial<StudyGroupRow> = {}): StudyGroupRow => ({
  id: "group-1",
  course_id: course.id,
  creator_id: "leader-2",
  status: "active",
  name: "Our group",
  max_members: 2,
  created_at: "2026-11-17T09:00:00Z",
  ...overrides,
});
const member = (
  overrides: Partial<GroupMembershipRow> = {}
): GroupMembershipRow => ({
  id: "membership-1",
  group_id: "group-1",
  course_id: course.id,
  profile_id: "user-1",
  display_name_snapshot: "A Student",
  membership_status: "active",
  joined_at: "2026-11-17T09:00:00Z",
  ...overrides,
});
const eligible = (
  groups = [group()],
  memberships = [member()],
  currentCourseEligible = true
) =>
  recruitmentEligibility(
    "user-1",
    course.id,
    currentCourseEligible,
    groups,
    memberships
  );

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const context = { status: "ready", userId: "user-1", courseId: "course-1" };

describe("own-group recruitment eligibility", () => {
  it("accepts an active nonleader and the leader, including a one-member group", () => {
    expect(eligible().groups).toEqual([group()]);
    expect(eligible([group({ creator_id: "user-1" })]).groups).toEqual([
      group({ creator_id: "user-1" }),
    ]);
    // The sole active membership is enough; no roster size is required.
    expect(eligible([group()], [member()]).groups).toHaveLength(1);
  });

  it("does not restrict posting by maximum, fullness, or member count", () => {
    for (const maximum of [2, null]) {
      const own = group({ max_members: maximum });
      const manyMembers = [
        member(),
        ...Array.from({ length: 20 }, (_, i) =>
          member({ id: `other-${i}`, profile_id: `other-${i}` })
        ),
      ];
      expect(eligible([own], [member()]).groups).toEqual([own]);
      expect(eligible([own], manyMembers.slice(0, 2)).groups).toEqual([own]);
      expect(eligible([own], manyMembers).groups).toEqual([own]);
    }
  });

  it("requires the viewer's exact active membership in the exact course and group", () => {
    for (const membership of [
      member({ profile_id: "user-2" }),
      member({ profile_id: null }),
      member({ course_id: "course-2" }),
      member({ group_id: "group-2" }),
      member({ membership_status: "removed" }),
      member({ membership_status: "left" }),
      member({ membership_status: "account_deleted" }),
      // Pending is not a valid membership row; it must not be treated as active.
      member({
        membership_status: "pending" as GroupMembershipRow["membership_status"],
      }),
    ]) {
      expect(eligible([group()], [membership]).groups).toEqual([]);
    }
    // A pending invitation without a membership cannot establish membership.
    expect(eligible([group()], []).groups).toEqual([]);
    expect(eligible([group({ course_id: "course-2" })]).groups).toEqual([]);
  });

  it("excludes forming creators and terminal groups even with active rows", () => {
    for (const status of ["forming", "abandoned", "archived"] as const) {
      expect(
        eligible([group({ status, creator_id: "user-1" })]).groups
      ).toEqual([]);
    }
  });

  it("fails closed without affirmative current-course enrolment evidence", () => {
    expect(eligible([group()], [member()], false)).toEqual({
      verified: false,
      groups: [],
    });
    // Runtime malformed evidence must not be accepted as a truthy boolean.
    expect(eligible([group()], [member()], 1 as unknown as boolean)).toEqual({
      verified: false,
      groups: [],
    });
  });
});

describe("context-scoped work", () => {
  it.each([
    ["account", { ...context, userId: "user-2" }],
    ["course", { ...context, courseId: "course-2" }],
    ["auth generation", { ...context, authGeneration: 1 }],
    ["session readiness", { ...context, status: "loading", userId: null }],
  ])(
    "discards late success, error and finalization after %s changes",
    async (_, next) => {
      const scope = new GroupWorkspaceScope(context);
      const token = scope.startLoad()!;
      const success = vi.fn();
      const error = vi.fn();
      const finallyHandler = vi.fn();
      const first = deferred<string>();
      const second = deferred<string>();
      const tasks = [first, second].map(pending =>
        runScoped(scope, token, () => pending.promise, {
          success,
          error,
          finally: finallyHandler,
        })
      );
      scope.updateContext(next);
      expect(scope.contextVersion).toBe(1);
      first.resolve("old data");
      second.reject(new Error("old error"));
      await Promise.all(tasks);
      expect(success).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(finallyHandler).not.toHaveBeenCalled();
      // Returning to the original account/course never revives the old token.
      scope.updateContext(context);
      expect(scope.isCurrent(token)).toBe(false);
    }
  );

  it("discards stale refresh and unmount results by generation", async () => {
    const scope = new GroupWorkspaceScope(context);
    const token = scope.startLoad()!;
    const pending = deferred<string>();
    const success = vi.fn();
    const error = vi.fn();
    const task = runScoped(scope, token, () => pending.promise, {
      success,
      error,
    });
    scope.startLoad();
    pending.resolve("old snapshot");
    await task;
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const unmountedToken = scope.currentToken()!;
    scope.invalidate();
    expect(scope.isCurrent(unmountedToken)).toBe(false);
  });

  it("reports a current discovery failure instead of applying a snapshot", async () => {
    const scope = new GroupWorkspaceScope(context);
    const token = scope.startLoad()!;
    const success = vi.fn();
    const error = vi.fn();
    const failure = new Error("discovery unavailable");
    await runScoped(
      scope,
      token,
      () => Promise.all([Promise.resolve(true), Promise.reject(failure)]),
      { success, error }
    );
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(failure);
  });

  it("claims a write synchronously and releases it only for the same generation", async () => {
    const scope = new GroupWorkspaceScope(context);
    const token = scope.startLoad()!;
    const pending = deferred<string>();
    const work = vi.fn(() => pending.promise);
    const handlers = {
      start: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      finally: vi.fn(),
    };
    const first = runScopedAction(scope, token, work, handlers);
    expect(await runScopedAction(scope, token, work, handlers)).toBe(false);
    expect(work).toHaveBeenCalledTimes(1);
    expect(handlers.start).toHaveBeenCalledTimes(1);
    pending.resolve("ok");
    await first;
    expect(handlers.success).toHaveBeenCalledWith("ok");
    expect(handlers.finally).toHaveBeenCalledTimes(1);
    expect(
      await runScopedAction(scope, token, async () => "again", handlers)
    ).toBe(true);
  });
});
