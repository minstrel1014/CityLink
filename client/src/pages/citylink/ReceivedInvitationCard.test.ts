import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GroupInvitationRow } from "@/lib/supabaseGroups";
import { ReceivedInvitationCard } from "./ReceivedInvitationCard";

const invitation: GroupInvitationRow = {
  id: "invite-1",
  group_id: "group-1",
  course_id: "course-1",
  sender_id: "sender-1",
  recipient_id: "user-1",
  sender_name_snapshot: "Avery",
  recipient_name_snapshot: "Jordan",
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
};

function renderCard({
  record = invitation,
  userId = "user-1",
  busyInvitationId = null,
  isRefreshing = false,
}: {
  record?: GroupInvitationRow;
  userId?: string | null;
  busyInvitationId?: string | null;
  isRefreshing?: boolean;
} = {}) {
  return renderToStaticMarkup(
    createElement(ReceivedInvitationCard, {
      invitation: record,
      groupName: "Study Team",
      courseCode: "CS101",
      formattedDate: "1 Jan 2026",
      userId,
      busyInvitationId,
      isRefreshing,
      onAccept: vi.fn(),
    })
  );
}

describe("received invitation card", () => {
  it("shows an accessible Accept button on a pending invitation for this user", () => {
    const html = renderCard();
    expect(html).toContain("Study Team");
    expect(html).toContain("CS101 · From Avery");
    expect(html).toContain('class="group-workflow-status pending"');
    expect(html).toContain('type="button"');
    expect(html).toContain(
      'aria-label="Accept invitation to Study Team from Avery"'
    );
    expect(html).toContain(">Accept</button>");
    expect(html).not.toContain("Decline</button>");
  });

  it("passes the selected received invitation to its action", () => {
    const onAccept = vi.fn();
    const card = ReceivedInvitationCard({
      invitation,
      groupName: "Study Team",
      courseCode: "CS101",
      formattedDate: "1 Jan 2026",
      userId: "user-1",
      busyInvitationId: null,
      isRefreshing: false,
      onAccept,
    });
    const actions = Children.toArray(card.props.children).find(
      child =>
        isValidElement<{ className?: string }>(child) &&
        child.props.className === "group-workflow-actions"
    );
    if (!isValidElement<{ children: React.ReactNode }>(actions)) {
      throw new Error("Accept action was not rendered");
    }
    const acceptButton = Children.toArray(actions.props.children).find(
      child =>
        isValidElement<{ "aria-label"?: string }>(child) &&
        (child.props["aria-label"] ?? "").startsWith("Accept invitation")
    );
    if (!isValidElement<{ onClick: () => void }>(acceptButton)) {
      throw new Error("Accept action was not rendered");
    }
    acceptButton.props.onClick();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledWith(invitation);
  });

  it("offers a Decline action that passes the same invitation", () => {
    const onDecline = vi.fn();
    const card = ReceivedInvitationCard({
      invitation,
      groupName: "Study Team",
      courseCode: "CS101",
      formattedDate: "1 Jan 2026",
      userId: "user-1",
      busyInvitationId: null,
      isRefreshing: false,
      onAccept: vi.fn(),
      onDecline,
    });
    const actions = Children.toArray(card.props.children).find(
      child =>
        isValidElement<{ className?: string }>(child) &&
        child.props.className === "group-workflow-actions"
    );
    if (!isValidElement<{ children: React.ReactNode }>(actions)) {
      throw new Error("Decline action was not rendered");
    }
    const declineButton = Children.toArray(actions.props.children).find(
      child =>
        isValidElement<{ "aria-label"?: string }>(child) &&
        (child.props["aria-label"] ?? "").startsWith("Decline invitation")
    );
    if (!isValidElement<{ onClick: () => void }>(declineButton)) {
      throw new Error("Decline action was not rendered");
    }
    declineButton.props.onClick();
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledWith(invitation);
  });

  it("hides Accept for terminal records, another recipient, or no ready user", () => {
    for (const status of [
      "accepted",
      "declined",
      "cancelled",
      "expired",
    ] as const) {
      const html = renderCard({ record: { ...invitation, status } });
      expect(html).toContain(`group-workflow-status ${status}`);
      expect(html).not.toContain("<button");
    }
    expect(renderCard({ userId: "user-2" })).not.toContain("<button");
    expect(renderCard({ userId: null })).not.toContain("<button");
    expect(
      renderCard({ record: { ...invitation, recipient_id: null } })
    ).not.toContain("<button");
  });

  it("disables every available Accept control until the action and refresh finish", () => {
    expect(renderCard({ busyInvitationId: "invite-1" })).toMatch(
      /<button[^>]*disabled[^>]*>Accepting…<\/button>/
    );
    expect(renderCard({ busyInvitationId: "invite-1" })).toContain(
      'aria-busy="true"'
    );
    expect(renderCard({ busyInvitationId: "another-invite" })).toMatch(
      /<button[^>]*disabled[^>]*>Accept<\/button>/
    );
    expect(renderCard({ isRefreshing: true })).toMatch(
      /<button[^>]*disabled[^>]*>Accept<\/button>/
    );
    expect(renderCard()).not.toContain("disabled");
  });
});
