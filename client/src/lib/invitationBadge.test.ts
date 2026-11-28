// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupWorkflowSnapshot,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const snapshotState = vi.hoisted(() => ({
  current: null as GroupWorkflowSnapshot | null,
  calls: 0,
  fail: false,
}));

vi.mock("@/lib/supabaseGroups", () => ({
  loadGroupWorkflowSnapshot: () => {
    snapshotState.calls += 1;
    if (snapshotState.fail) return Promise.reject(new Error("read failed"));
    return Promise.resolve(snapshotState.current);
  },
}));

const { pendingInvitationItemIds, useInvitationBadge } = await import(
  "./invitationBadge"
);

const LEADER = "leader-1";
const OTHER = "student-2";

function group(id: string, creator: string | null): StudyGroupRow {
  return {
    id,
    course_id: "course-1",
    creator_id: creator,
    status: "active",
    name: `Group ${id}`,
    max_members: 19,
    created_at: "2026-11-23T00:00:00.000Z",
  };
}

function invitation(
  id: string,
  status: GroupInvitationRow["status"],
  recipientId: string | null
): GroupInvitationRow {
  return {
    id,
    group_id: "group-mine",
    course_id: "course-1",
    sender_id: OTHER,
    recipient_id: recipientId,
    sender_name_snapshot: "Someone",
    recipient_name_snapshot: "Me",
    status,
    created_at: "2026-11-23T00:00:00.000Z",
  };
}

function request(
  id: string,
  status: GroupJoinRequestRow["status"],
  requesterId: string | null,
  groupId: string
): GroupJoinRequestRow {
  return {
    id,
    group_id: groupId,
    course_id: "course-1",
    requester_id: requesterId,
    requester_name_snapshot: "Someone",
    status,
    created_at: "2026-11-23T00:00:00.000Z",
  };
}

function snapshot(
  overrides: Partial<GroupWorkflowSnapshot> = {}
): GroupWorkflowSnapshot {
  return {
    groups: [group("group-mine", LEADER), group("group-other", OTHER)],
    memberships: [],
    incomingInvitations: [],
    outgoingInvitations: [],
    joinRequests: [],
    ...overrides,
  };
}

describe("pendingInvitationItemIds", () => {
  it("counts only pending invitations addressed to the signed-in account", () => {
    const ids = pendingInvitationItemIds(
      snapshot({
        incomingInvitations: [
          invitation("invite-pending", "pending", LEADER),
          invitation("invite-accepted", "accepted", LEADER),
          invitation("invite-elsewhere", "pending", OTHER),
        ],
      }),
      LEADER
    );
    expect(ids).toEqual(["invitation:invite-pending"]);
  });

  it("counts pending requests on groups the account leads but not its own requests", () => {
    const ids = pendingInvitationItemIds(
      snapshot({
        joinRequests: [
          request("req-mine-group", "pending", OTHER, "group-mine"),
          request("req-own", "pending", LEADER, "group-other"),
          request("req-not-leader", "pending", OTHER, "group-other"),
          request("req-approved", "approved", OTHER, "group-mine"),
        ],
      }),
      LEADER
    );
    expect(ids).toEqual(["request:req-mine-group"]);
  });

  it("returns an empty list when there is nothing to act on", () => {
    expect(pendingInvitationItemIds(snapshot(), LEADER)).toEqual([]);
  });
});

type Mounted = { root: Root; container: HTMLDivElement };
let mounted: Mounted | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function Harness({ userId }: { userId: string }) {
  const { unseenCount, markSeen } = useInvitationBadge({
    userId,
    authGeneration: 1,
    refreshKey: "/dashboard",
  });
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "count" }, String(unseenCount)),
    createElement(
      "button",
      { type: "button", onClick: () => markSeen() },
      "seen"
    )
  );
}

async function renderHarness(userId: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(createElement(Harness, { userId }));
  });
  await flush();
  return container;
}

function count(container: HTMLElement) {
  return container.querySelector('[data-testid="count"]')?.textContent;
}

afterEach(async () => {
  if (mounted) {
    const { root, container } = mounted;
    mounted = null;
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  snapshotState.current = null;
  snapshotState.calls = 0;
  snapshotState.fail = false;
});

describe("useInvitationBadge", () => {
  it("lights the dot for unseen actionable items and clears it once seen", async () => {
    snapshotState.current = snapshot({
      incomingInvitations: [invitation("invite-pending", "pending", LEADER)],
      joinRequests: [request("req-pending", "pending", OTHER, "group-mine")],
    });
    const container = await renderHarness(LEADER);
    expect(count(container)).toBe("2");

    const button = container.querySelector("button");
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(count(container)).toBe("0");
  });

  it("keeps the seen set per account", async () => {
    const first = "leader-per-account-a";
    const second = "leader-per-account-b";
    snapshotState.current = snapshot({
      groups: [group("group-mine", first)],
      incomingInvitations: [invitation("invite-pending", "pending", first)],
    });
    const container = await renderHarness(first);
    expect(count(container)).toBe("1");
    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(count(container)).toBe("0");

    // A different account signing in on the same tab starts unseen again.
    snapshotState.current = snapshot({
      groups: [group("group-mine", second)],
      incomingInvitations: [invitation("invite-pending", "pending", second)],
    });
    const other = await renderHarness(second);
    expect(count(other)).toBe("1");
  });

  it("stays quiet when the snapshot cannot be read", async () => {
    snapshotState.fail = true;
    const container = await renderHarness(LEADER);
    expect(count(container)).toBe("0");
    expect(snapshotState.calls).toBe(1);
  });
});
