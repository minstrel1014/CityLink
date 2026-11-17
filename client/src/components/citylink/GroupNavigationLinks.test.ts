import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: ReactNode;
  }) => createElement("a", { href, className }, children),
}));

import {
  CourseGroupLink,
  GroupChatLink,
} from "@/components/citylink/GroupNavigationLinks";

describe("existing CityLink group navigation links", () => {
  it("renders the My Courses My group link to the group-management panel", () => {
    const html = renderToStaticMarkup(
      createElement(
        CourseGroupLink,
        { courseId: "course-1", className: "course-detail-link" },
        "My group"
      )
    );

    expect(html).toContain('href="/courses/course-1"');
    expect(html).toContain('class="course-detail-link"');
    expect(html).toContain("My group");
  });

  it("renders the panel Open Group Chat link to the existing chat screen", () => {
    const html = renderToStaticMarkup(
      createElement(
        GroupChatLink,
        { groupId: "group-1", className: "secondary my-group-chat-link" },
        "Open Group Chat"
      )
    );

    expect(html).toContain('href="/groups/group-1/chat"');
    expect(html).toContain('class="secondary my-group-chat-link"');
    expect(html).toContain("Open Group Chat");
  });

  it("keeps the exact selected group ID in the chat destination", () => {
    const html = renderToStaticMarkup(
      createElement(
        GroupChatLink,
        { groupId: "group/with spaces" },
        "Open Group Chat"
      )
    );

    expect(html).toContain('href="/groups/group%2Fwith%20spaces/chat"');
  });
});
