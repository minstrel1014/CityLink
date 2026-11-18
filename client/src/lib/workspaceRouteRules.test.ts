import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activeMemberGroups,
  courseDetailPath,
  currentTermCourses,
  initialCourseScope,
  shouldRedirectToDashboard,
  visiblePendingJoinRequests,
  workspaceSessionMode,
} from "./workspaceRouteRules";
import type {
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "./supabaseGroups";

describe("CityLink workspace routing and display rules", () => {
  it("keeps the signed-in shell and existing fictional/auth routes in the route manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../public/manus-routes.json", import.meta.url),
        "utf8"
      )
    ) as { routes: { path: string }[] };
    const paths = new Set(manifest.routes.map(route => route.path));
    for (const path of [
      "/demo",
      "/demo/courses",
      "/demo/invitations",
      "/demo/messages",
      "/demo/me",
      "/demo/about",
      "/demo/students/:studentId/:courseId",
      "/dashboard",
      "/courses",
      "/demo/courses/:courseId",
      "/courses/:courseId",
      "/courses/:courseId/classmates",
      "/courses/:courseId/students/:studentId",
      "/students/:studentId/:courseId",
      "/invitations",
      "/me",
      "/my-courses",
      "/my-groups",
      "/group-chat",
      "/messages",
      "/about",
    ]) {
      expect(paths.has(path), `route manifest should include ${path}`).toBe(
        true
      );
    }
  });

  it("makes My courses the default dashboard view and All courses the directory view", () => {
    expect(initialCourseScope("dashboard")).toBe("mine");
    expect(initialCourseScope("directory")).toBe("catalogue");
  });

  it("opens course details on the My Group first view", () => {
    expect(courseDetailPath("course-123")).toBe("/courses/course-123");
    expect(courseDetailPath("course/123")).toBe("/courses/course%2F123");
  });

  it("keeps only courses returned by the current-term service, including zero counts", () => {
    const courses = [{ id: "current" }, { id: "zero" }, { id: "old" }];
    expect(
      currentTermCourses(
        courses,
        new Map([
          ["current", 2],
          ["zero", 0],
        ])
      )
    ).toEqual([{ id: "current" }, { id: "zero" }]);
    expect(currentTermCourses(courses, new Map())).toEqual([]);
  });

  it("distinguishes a session restoration error from signed-out demo access", () => {
    expect(workspaceSessionMode("error", null)).toBe("error");
    expect(workspaceSessionMode("loading", null)).toBe("loading");
    expect(workspaceSessionMode("ready", "user-1")).toBe("authenticated");
    expect(workspaceSessionMode("ready", null)).toBe("signed-out");
    expect(workspaceSessionMode("unconfigured", null)).toBe("signed-out");
  });

  it("sends a restored signed-in user to the dashboard", () => {
    expect(
      shouldRedirectToDashboard({
        sessionReady: true,
        userId: "user-1",
        authEvent: "SIGNED_IN",
        recoveryCallback: false,
        choosingNewPassword: false,
      })
    ).toBe(true);
  });

  it("does not redirect while signed out or while handling password recovery", () => {
    expect(
      shouldRedirectToDashboard({
        sessionReady: true,
        userId: null,
        authEvent: null,
        recoveryCallback: false,
        choosingNewPassword: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToDashboard({
        sessionReady: true,
        userId: "user-1",
        authEvent: "PASSWORD_RECOVERY",
        recoveryCallback: false,
        choosingNewPassword: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToDashboard({
        sessionReady: true,
        userId: "user-1",
        authEvent: null,
        recoveryCallback: true,
        choosingNewPassword: false,
      })
    ).toBe(false);
  });

  it("shows pending join requests only to the requester or original creator", () => {
    const requests = [
      {
        id: "own-request",
        status: "pending",
        requester_id: "user-1",
        group_id: "other-group",
      },
      {
        id: "creator-request",
        status: "pending",
        requester_id: "user-2",
        group_id: "owned-group",
      },
      {
        id: "other-member-request",
        status: "pending",
        requester_id: "user-3",
        group_id: "other-group",
      },
      {
        id: "resolved-request",
        status: "approved",
        requester_id: "user-2",
        group_id: "owned-group",
      },
    ] as GroupJoinRequestRow[];
    const groups = [
      { id: "owned-group", creator_id: "user-1" },
    ] as StudyGroupRow[];
    expect(
      visiblePendingJoinRequests(requests, groups, "user-1").map(
        request => request.id
      )
    ).toEqual(["own-request", "creator-request"]);
  });

  it("lists chat placeholders only for active groups the user actively belongs to", () => {
    const groups = [
      { id: "active-member", status: "active" },
      { id: "active-other", status: "active" },
      { id: "forming-member", status: "forming" },
    ] as StudyGroupRow[];
    const memberships = [
      { group_id: "active-member", membership_status: "active" },
      { group_id: "active-other", membership_status: "left" },
      { group_id: "forming-member", membership_status: "active" },
    ] as GroupMembershipRow[];
    expect(
      activeMemberGroups(groups, memberships).map(group => group.id)
    ).toEqual(["active-member"]);
  });
});
