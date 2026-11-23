import { describe, expect, it, vi } from "vitest";
import {
  appendCurrentRecruitmentPage,
  createActionOwner,
  createRequestGeneration,
  isCurrentCourseSnapshot,
  matchesCourseScope,
  publishCourseRequestInvalidation,
  requestWithCourseInvalidation,
  subscribeCourseRequestInvalidation,
} from "@/lib/courseRequestRefresh";
import type { GroupRecruitmentPost } from "@/lib/supabaseStage6";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const scope = { userId: "user-1", courseId: "course-1" };
const post: GroupRecruitmentPost = {
  id: "post-1",
  groupId: "group-1",
  groupName: "Group",
  activeMemberCount: 2,
  authorName: "Author",
  subject: "Subject",
  body: "Body",
  status: "open",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  closedAt: null,
  applyEnabled: true,
  canManage: false,
};

describe("scoped course request refresh", () => {
  it.each(["success", "ambiguous-error"] as const)(
    "invalidates matching views on %s while preserving the actual result",
    async outcome => {
      const target = new EventTarget();
      const task = deferred<string>();
      const refresh = vi.fn();
      const otherUser = vi.fn();
      const otherCourse = vi.fn();
      const details: unknown[] = [];
      target.addEventListener("citylink:course-request-invalidated", event =>
        details.push((event as CustomEvent).detail)
      );
      subscribeCourseRequestInvalidation(() => scope, refresh, target);
      subscribeCourseRequestInvalidation(
        () => ({ ...scope, userId: "user-2" }),
        otherUser,
        target
      );
      subscribeCourseRequestInvalidation(
        () => ({ ...scope, courseId: "course-2" }),
        otherCourse,
        target
      );
      const result = requestWithCourseInvalidation(
        scope,
        () => task.promise,
        target
      );
      expect(refresh).not.toHaveBeenCalled();
      if (outcome === "success") {
        task.resolve("confirmed");
        await expect(result).resolves.toBe("confirmed");
      } else {
        const error = new Error("connection lost after possible commit");
        task.reject(error);
        await expect(result).rejects.toBe(error);
      }
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(otherUser).not.toHaveBeenCalled();
      expect(otherCourse).not.toHaveBeenCalled();
      expect(details).toEqual([scope]); // No group, status, or request data.
    }
  );

  it("refreshes the remounted matching course, but never another account or course", async () => {
    const target = new EventTarget();
    const task = deferred<void>();
    const firstView = vi.fn();
    const stopFirst = subscribeCourseRequestInvalidation(
      () => scope,
      firstView,
      target
    );
    const result = requestWithCourseInvalidation(
      scope,
      () => task.promise,
      target
    );
    stopFirst(); // The original view unmounted while the request was in flight.
    const returnedView = vi.fn();
    const differentAccount = vi.fn();
    const differentCourse = vi.fn();
    subscribeCourseRequestInvalidation(() => scope, returnedView, target);
    subscribeCourseRequestInvalidation(
      () => ({ ...scope, userId: "user-2" }),
      differentAccount,
      target
    );
    subscribeCourseRequestInvalidation(
      () => ({ ...scope, courseId: "course-2" }),
      differentCourse,
      target
    );
    task.resolve();
    await result;
    expect(firstView).not.toHaveBeenCalled();
    expect(returnedView).toHaveBeenCalledOnce();
    expect(differentAccount).not.toHaveBeenCalled();
    expect(differentCourse).not.toHaveBeenCalled();
  });

  it("invalidates in-flight post, snapshot, and roster reads before allowing a fresh generation", async () => {
    const target = new EventTarget();
    const posts = createRequestGeneration();
    const relationship = createRequestGeneration();
    const roster = createRequestGeneration();
    const oldPostRead = posts.invalidate();
    const oldRelationshipRead = relationship.invalidate();
    const oldRosterRead = roster.invalidate();
    const snapshot = {
      ...scope,
      generation: oldPostRead,
      posts: [post],
      postsHasMore: true,
      postsCursor: { createdAt: post.createdAt, id: post.id },
    };
    const stalePage = {
      items: [{ ...post, id: "post-2", applyEnabled: true }],
      hasMore: false,
      nextCursor: null,
    };
    const task = deferred<void>();
    subscribeCourseRequestInvalidation(
      () => scope,
      () => {
        posts.invalidate();
        relationship.invalidate();
        roster.invalidate();
      },
      target
    );
    const result = requestWithCourseInvalidation(
      scope,
      () => task.promise,
      target
    );
    task.resolve();
    await result;
    expect(posts.isCurrent(oldPostRead)).toBe(false);
    expect(relationship.isCurrent(oldRelationshipRead)).toBe(false);
    expect(roster.isCurrent(oldRosterRead)).toBe(false);
    // The exact append function used by the UI refuses a delayed stale page.
    expect(
      appendCurrentRecruitmentPage(
        snapshot,
        scope,
        oldPostRead,
        posts.current(),
        stalePage
      )
    ).toBe(snapshot);
    const freshGeneration = posts.invalidate();
    const fresh = {
      ...snapshot,
      generation: freshGeneration,
      posts: [{ ...post, applyEnabled: false }],
    };
    expect(
      appendCurrentRecruitmentPage(
        fresh,
        scope,
        oldPostRead,
        posts.current(),
        stalePage
      )
    ).toBe(fresh);
    expect(
      appendCurrentRecruitmentPage(
        fresh,
        { ...scope, userId: "user-2" },
        freshGeneration,
        posts.current(),
        stalePage
      )
    ).toBe(fresh);
    expect(
      appendCurrentRecruitmentPage(
        fresh,
        { ...scope, courseId: "course-2" },
        freshGeneration,
        posts.current(),
        stalePage
      )
    ).toBe(fresh);
    expect(
      appendCurrentRecruitmentPage(
        fresh,
        scope,
        freshGeneration,
        posts.current(),
        stalePage
      )?.posts.map(p => p.id)
    ).toEqual(["post-1", "post-2"]);
  });

  it("scopes stored snapshots to both a signed-in account and course", () => {
    expect(matchesCourseScope(scope, scope)).toBe(true);
    expect(matchesCourseScope(scope, { ...scope, courseId: "different" })).toBe(
      false
    );
    expect(matchesCourseScope(scope, { ...scope, userId: "different" })).toBe(
      false
    );
    expect(matchesCourseScope(scope, { ...scope, userId: null })).toBe(false);
    expect(matchesCourseScope(null, scope)).toBe(false);
    const stored = { ...scope, generation: 3 };
    expect(isCurrentCourseSnapshot(stored, scope, 3)).toBe(true);
    expect(isCurrentCourseSnapshot(stored, scope, 4)).toBe(false);
    expect(
      isCurrentCourseSnapshot(stored, { ...scope, userId: "other" }, 3)
    ).toBe(false);
    expect(
      isCurrentCourseSnapshot(stored, { ...scope, courseId: "other" }, 3)
    ).toBe(false);
  });

  it("cannot clear or write through an old action after unmount, even after a new action starts", () => {
    const oldView = createActionOwner();
    oldView.mount();
    const oldAction = oldView.begin()!;
    expect(oldView.begin()).toBeNull();
    oldView.unmount();
    const newView = createActionOwner();
    newView.mount();
    const newAction = newView.begin()!;
    expect(oldView.isCurrent(oldAction)).toBe(false);
    expect(oldView.finish(oldAction)).toBe(false);
    expect(newView.finish(oldAction)).toBe(false);
    expect(newView.isCurrent(newAction)).toBe(true);
    expect(newView.finish(newAction)).toBe(true);
    oldView.mount(); // Includes a Strict Mode-style remount of the same owner.
    const later = oldView.begin()!;
    expect(oldView.finish(oldAction)).toBe(false);
    expect(oldView.isCurrent(later)).toBe(true);
  });

  it("does not refresh unrelated scopes or retain listeners after unsubscribe", () => {
    const target = new EventTarget();
    let current = scope;
    const refresh = vi.fn();
    const stop = subscribeCourseRequestInvalidation(
      () => current,
      refresh,
      target
    );
    current = { ...scope, userId: "user-2" };
    publishCourseRequestInvalidation(scope, target);
    current = { ...scope, courseId: "course-2" };
    publishCourseRequestInvalidation(scope, target);
    expect(refresh).not.toHaveBeenCalled();
    current = scope;
    publishCourseRequestInvalidation(scope, target);
    expect(refresh).toHaveBeenCalledOnce();
    stop();
    publishCourseRequestInvalidation(scope, target);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
