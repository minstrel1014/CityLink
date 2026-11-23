import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GroupRecruitmentPost } from "@/lib/supabaseStage6";
import {
  canApplyToRecruitmentPost,
  Stage6ApplyControl,
  Stage6CapacityCount,
  Stage6CapacityStatus,
  withLocalPendingState,
} from "./Stage6Capacity";

const availablePost = (): GroupRecruitmentPost => ({
  id: "post-1",
  groupId: "group-1",
  groupName: "Design team",
  activeMemberCount: 3,
  maxMembers: 5,
  capacityCount: 3,
  capacityState: "available",
  authorName: "Student",
  subject: "Looking for a teammate",
  body: "Join our team.",
  status: "open",
  createdAt: "2026-11-17T09:00:00.000Z",
  updatedAt: "2026-11-17T09:00:00.000Z",
  closedAt: null,
  applyEnabled: true,
  applyBlockReason: null,
  canManage: false,
});

function getApplyButton(
  post: GroupRecruitmentPost,
  busy: boolean,
  onApply: () => void
) {
  const element = Stage6ApplyControl({ post, busy, applying: false, onApply });
  return Children.toArray(element.props.children).find(
    child => isValidElement(child) && child.type === "button"
  ) as ReactElement<{ disabled: boolean; onClick: () => void }>;
}

describe("Stage 6 capacity presentation", () => {
  it("keeps a successful request visibly pending when refresh is unavailable", () => {
    const post = withLocalPendingState(availablePost(), true);
    expect(post.applyEnabled).toBe(false);
    expect(post.applyBlockReason).toBe("pending_request");
    expect(canApplyToRecruitmentPost(post)).toBe(false);
    expect(
      renderToStaticMarkup(
        createElement(Stage6ApplyControl, {
          post,
          busy: false,
          applying: false,
          onApply: vi.fn(),
        })
      )
    ).toContain("pending request");
  });

  it("shows the real current/maximum count and does not invent a maximum", () => {
    expect(
      renderToStaticMarkup(
        createElement(Stage6CapacityCount, { count: 3, maximum: 5 })
      )
    ).toContain("3 / 5 members");
    expect(
      renderToStaticMarkup(
        createElement(Stage6CapacityCount, { count: 3, maximum: null })
      )
    ).toContain("3 members · Maximum not set");
    expect(
      renderToStaticMarkup(
        createElement(Stage6CapacityCount, { count: 1, maximum: null })
      )
    ).toContain("1 member · Maximum not set");
  });

  it.each([
    ["available", "Space available"],
    ["full", "Group is full"],
    ["maximum_not_set", "Group maximum is not set"],
    ["over_limit", "more than 19 active members"],
  ] as const)("explains the %s capacity state", (state, wording) => {
    expect(
      renderToStaticMarkup(createElement(Stage6CapacityStatus, { state }))
    ).toContain(wording);
  });

  it("renders the exact full reason, disables Apply, and cannot call the application handler", () => {
    const post: GroupRecruitmentPost = {
      ...availablePost(),
      activeMemberCount: 5,
      capacityCount: 5,
      capacityState: "full",
      applyEnabled: false,
      applyBlockReason: "group_full",
    };
    const onApply = vi.fn();
    const html = renderToStaticMarkup(
      createElement(Stage6ApplyControl, {
        post,
        busy: false,
        applying: false,
        onApply,
      })
    );
    expect(html).toContain("Group is full");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-describedby="apply-block-reason-post-1"');
    expect(canApplyToRecruitmentPost(post)).toBe(false);
    const button = getApplyButton(post, false, onApply);
    expect(button.props.disabled).toBe(true);
    button.props.onClick();
    expect(onApply).not.toHaveBeenCalled();
  });

  it.each([
    ["maximum_not_set", "maximum_not_set", "Group maximum is not set"],
    ["over_limit", "group_over_limit", "more than 19 active members"],
  ] as const)("explains the %s block", (state, reason, wording) => {
    const post: GroupRecruitmentPost = {
      ...availablePost(),
      maxMembers: null,
      capacityState: state,
      applyEnabled: false,
      applyBlockReason: reason,
    };
    const onApply = vi.fn();
    expect(
      renderToStaticMarkup(
        createElement(Stage6ApplyControl, {
          post,
          busy: false,
          applying: false,
          onApply,
        })
      )
    ).toContain(wording);
    getApplyButton(post, false, onApply).props.onClick();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("allows only the server-enabled available post and respects busy state", () => {
    const post = availablePost();
    const onApply = vi.fn();
    expect(canApplyToRecruitmentPost(post)).toBe(true);
    const enabled = getApplyButton(post, false, onApply);
    expect(enabled.props.disabled).toBe(false);
    enabled.props.onClick();
    expect(onApply).toHaveBeenCalledTimes(1);
    const busy = getApplyButton(post, true, onApply);
    expect(busy.props.disabled).toBe(true);
    busy.props.onClick();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("keeps a closed or terminal post non-actionable and displays the server reason", () => {
    const onApply = vi.fn();
    const terminal: GroupRecruitmentPost = {
      ...availablePost(),
      groupId: null,
      groupName: null,
      activeMemberCount: null,
      maxMembers: null,
      capacityCount: null,
      capacityState: null,
      status: "closed",
      applyEnabled: false,
      applyBlockReason: "group_inactive",
    };
    const closed: GroupRecruitmentPost = {
      ...availablePost(),
      status: "closed",
      applyEnabled: false,
      applyBlockReason: "post_closed",
    };
    for (const post of [terminal, closed]) {
      const button = getApplyButton(post, false, onApply);
      expect(button.props.disabled).toBe(true);
      button.props.onClick();
    }
    expect(onApply).not.toHaveBeenCalled();
    expect(
      renderToStaticMarkup(
        createElement(Stage6ApplyControl, {
          post: terminal,
          busy: false,
          applying: false,
          onApply,
        })
      )
    ).toContain("This group is no longer available.");
    expect(
      renderToStaticMarkup(
        createElement(Stage6ApplyControl, {
          post: closed,
          busy: false,
          applying: false,
          onApply,
        })
      )
    ).toContain("This post is closed.");
  });
});
