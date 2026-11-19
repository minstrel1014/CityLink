import { describe, expect, it } from "vitest";
import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";
import {
  getInviteGroupCapacity,
  inviteCapacityGuidance,
  inviteCapacityMessage,
} from "./AuthenticatedCoursePeers";
import { getGroupCapacityState } from "./groupCapacity";

const group = (overrides: Partial<StudyGroupRow> = {}): StudyGroupRow => ({
  id: "group-1",
  course_id: "course-1",
  creator_id: "other-user",
  status: "active",
  name: "Group",
  max_members: 5,
  created_at: "2026-11-19T00:00:00Z",
  ...overrides,
});

const member = (
  overrides: Partial<GroupMembershipRow> = {}
): GroupMembershipRow => ({
  id: "membership-1",
  group_id: "group-1",
  course_id: "course-1",
  profile_id: "viewer",
  display_name_snapshot: "Viewer",
  membership_status: "active",
  joined_at: "2026-11-19T00:00:00Z",
  ...overrides,
});

const roster = (count: number, groupId = "group-1") =>
  Array.from({ length: count }, (_, index) =>
    member({
      id: `membership-${index}`,
      group_id: groupId,
      profile_id: index === 0 ? "viewer" : `peer-${index}`,
    })
  );

describe("People invite capacity", () => {
  it("uses the full roster to detect a 2/2 group even when the viewer has one row", () => {
    const capacity = getInviteGroupCapacity(
      group({ max_members: 2 }),
      roster(2),
      "viewer"
    );
    expect(capacity).toEqual({ count: 2, maximum: 2 });
    expect(getGroupCapacityState(capacity.count!, capacity.maximum)).toBe(
      "full"
    );
  });

  it("detects an over-19 group from the full roster", () => {
    const capacity = getInviteGroupCapacity(
      group({ max_members: 19 }),
      roster(20),
      "viewer"
    );
    expect(capacity).toEqual({ count: 20, maximum: 19 });
    expect(getGroupCapacityState(capacity.count!, capacity.maximum)).toBe(
      "over_limit"
    );
  });

  it("preserves the unset-maximum state", () => {
    const capacity = getInviteGroupCapacity(
      group({ max_members: null }),
      roster(1),
      "viewer"
    );
    expect(capacity).toEqual({ count: 1, maximum: null });
    expect(getGroupCapacityState(capacity.count!, capacity.maximum)).toBe(
      "maximum_not_set"
    );
  });

  it("counts a forming creator as one when the roster omits that creator", () => {
    expect(
      getInviteGroupCapacity(
        group({ status: "forming", creator_id: "viewer", max_members: 2 }),
        [],
        "viewer"
      )
    ).toEqual({ count: 1, maximum: 2 });
  });

  it("fails closed to unknown when a full roster read is unavailable", () => {
    expect(getInviteGroupCapacity(group(), null, "viewer")).toEqual({
      count: null,
      maximum: 5,
    });
  });

  it("uses the exact approved strings and keeps guidance separate", () => {
    expect(inviteCapacityMessage("full", 2, 2)).toBe("Group is full");
    expect(inviteCapacityMessage("maximum_not_set", 1, null)).toBe(
      "Group maximum is not set"
    );
    expect(inviteCapacityGuidance("full", 2, 2)).toContain(
      "2/2 active members"
    );
    expect(inviteCapacityGuidance("maximum_not_set", 1, null)).toContain(
      "2 to 19"
    );
  });

  it("blocks a pending or failed roster read instead of inviting blindly", () => {
    expect(inviteCapacityMessage("checking", null, 5)).toMatch(
      /Checking group capacity/
    );
    expect(inviteCapacityMessage("unknown", null, 5)).toMatch(
      /could not be verified/
    );
  });

  it("evaluates multiple invite groups independently", () => {
    const second = group({
      id: "group-2",
      creator_id: "viewer",
      status: "forming",
      max_members: 2,
    });
    expect(getInviteGroupCapacity(group(), roster(2), "viewer")).toEqual({
      count: 2,
      maximum: 5,
    });
    expect(getInviteGroupCapacity(second, [], "viewer")).toEqual({
      count: 1,
      maximum: 2,
    });
  });
});
