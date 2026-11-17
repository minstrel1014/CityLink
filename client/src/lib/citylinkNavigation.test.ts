import { describe, expect, it } from "vitest";
import {
  courseGroupManagementPath,
  courseGroupsWorkspacePath,
  groupChatPath,
} from "@/lib/citylinkNavigation";

describe("CityLink group navigation paths", () => {
  it("opens the group-management panel from a My Courses course ID", () => {
    expect(courseGroupManagementPath("course-123")).toBe("/courses/course-123");
  });

  it("opens the existing group chat route with the panel’s group ID", () => {
    expect(groupChatPath("group-456")).toBe("/groups/group-456/chat");
  });

  it("opens the Stage 6 workspace from the My Courses Groups & posts action", () => {
    expect(courseGroupsWorkspacePath("course-789")).toBe(
      "/my-courses/course-789/groups"
    );
  });

  it("encodes identifiers without losing the selected context", () => {
    expect(courseGroupManagementPath("course 1/2")).toBe(
      "/courses/course%201%2F2"
    );
    expect(courseGroupsWorkspacePath("course 1/2")).toBe(
      "/my-courses/course%201%2F2/groups"
    );
    expect(groupChatPath("group 1/2")).toBe("/groups/group%201%2F2/chat");
  });
});
