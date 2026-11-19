import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

import {
  ActiveGroupsPanel,
  type ActiveGroupsPanelProps,
} from "@/pages/citylink/ActiveGroupsPanel";

const group: StudyGroupRow = {
  id: "group-1",
  course_id: "course-1",
  creator_id: "leader-1",
  status: "active",
  name: "Study team",
  created_at: "2026-11-19T00:00:00Z",
};
const request: GroupJoinRequestRow = {
  id: "request-1",
  group_id: group.id,
  course_id: group.course_id,
  requester_id: "viewer",
  requester_name_snapshot: "Viewer",
  status: "pending",
  created_at: "2026-11-19T00:00:00Z",
};
const invitation: GroupInvitationRow = {
  id: "invitation-1",
  group_id: group.id,
  course_id: group.course_id,
  sender_id: "leader-1",
  recipient_id: "viewer",
  sender_name_snapshot: "Leader",
  recipient_name_snapshot: "Viewer",
  status: "pending",
  created_at: "2026-11-19T00:00:00Z",
};
const membership: GroupMembershipRow = {
  id: "membership-1",
  group_id: "other-group",
  course_id: group.course_id,
  profile_id: "viewer",
  display_name_snapshot: "Viewer",
  membership_status: "active",
  joined_at: "2026-11-19T00:00:00Z",
};

function makeProps(
  overrides: Partial<ActiveGroupsPanelProps> = {}
): ActiveGroupsPanelProps {
  return {
    groups: [group],
    courseCode: "BUS101",
    userId: "viewer",
    joinRequests: [],
    incomingInvitations: [],
    memberships: [],
    busyAction: "",
    onCancelRequest: vi.fn(),
    ...overrides,
  };
}

function findCancelButton(node: ReactNode): { onClick: () => void } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findCancelButton(child);
      if (result) return result;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: ReactNode; onClick?: () => void };
  if (node.type === "button" && props.children === "Cancel request") {
    return { onClick: props.onClick! };
  }
  return findCancelButton(props.children);
}

describe("My Groups active-group presentation", () => {
  it("shows other active groups without a direct request button", () => {
    const html = renderToStaticMarkup(
      createElement(ActiveGroupsPanel, makeProps())
    );
    expect(html).toContain("Study team");
    expect(html).toContain("Other active groups in this course");
    expect(html).toContain("recruitment posts");
    expect(html).not.toContain("Request to join");
    expect(html).not.toContain("<button");
  });

  it("keeps a viewer’s pending request and calls the existing cancellation action", () => {
    const onCancelRequest = vi.fn();
    const props = makeProps({ joinRequests: [request], onCancelRequest });
    const html = renderToStaticMarkup(createElement(ActiveGroupsPanel, props));
    expect(html).toContain("Your join request is pending.");
    expect(html).toContain("Cancel request");
    expect(html).toContain('aria-label="Cancel join request to Study team"');
    expect(html).not.toContain("Request to join");
    const button = findCancelButton(ActiveGroupsPanel(props));
    expect(button).not.toBeNull();
    button!.onClick();
    expect(onCancelRequest).toHaveBeenCalledOnce();
    expect(onCancelRequest).toHaveBeenCalledWith("request-1");
  });

  it("does not expose cancellation for another person’s request", () => {
    const html = renderToStaticMarkup(
      createElement(
        ActiveGroupsPanel,
        makeProps({
          joinRequests: [{ ...request, requester_id: "someone-else" }],
        })
      )
    );
    expect(html).not.toContain("Cancel request");
    expect(html).not.toContain("Request to join");
  });

  it("disables the existing cancellation while an action is in progress", () => {
    const html = renderToStaticMarkup(
      createElement(
        ActiveGroupsPanel,
        makeProps({
          joinRequests: [request],
          busyAction: "cancel-request-request-1",
        })
      )
    );
    expect(html).toContain("Cancelling…");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("preserves the existing pending-invitation and group-membership messages", () => {
    const invited = renderToStaticMarkup(
      createElement(
        ActiveGroupsPanel,
        makeProps({ incomingInvitations: [invitation] })
      )
    );
    expect(invited).toContain("You have an invitation to this group");
    const grouped = renderToStaticMarkup(
      createElement(ActiveGroupsPanel, makeProps({ memberships: [membership] }))
    );
    expect(grouped).toContain("You already belong to a group for this course.");
    expect(invited).not.toContain("Request to join");
    expect(grouped).not.toContain("Request to join");
  });

  it("accurately describes an empty list of other active groups", () => {
    const html = renderToStaticMarkup(
      createElement(ActiveGroupsPanel, makeProps({ groups: [] }))
    );
    expect(html).toContain(
      "No other active groups are visible in this course."
    );
    expect(html).not.toContain("Request to join");
  });

  it("identifies each pending cancellation by group for assistive technology", () => {
    const secondGroup = { ...group, id: "group-2", name: "Other team" };
    const secondRequest = { ...request, id: "request-2", group_id: "group-2" };
    const html = renderToStaticMarkup(
      createElement(
        ActiveGroupsPanel,
        makeProps({
          groups: [group, secondGroup],
          joinRequests: [request, secondRequest],
        })
      )
    );
    expect(html).toContain('aria-label="Cancel join request to Study team"');
    expect(html).toContain('aria-label="Cancel join request to Other team"');
  });
});
