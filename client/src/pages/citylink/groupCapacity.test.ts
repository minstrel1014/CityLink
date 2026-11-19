import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";
import { GroupCapacitySettings } from "./GroupCapacitySettings";
import { GroupMemberRemoval } from "./GroupMemberRemoval";
import {
  canManageGroupCapacity,
  canRemoveGroupMember,
  getGroupCapacityCount,
  getGroupCapacityState,
  getVisibleGroupCapacityCount,
  GROUP_MAXIMUM_OVER_LIMIT_MESSAGE,
  GROUP_MAXIMUM_TOO_LOW_MESSAGE,
  validateGroupMaximum,
} from "./groupCapacity";

const group = {
  id: "group-1",
  creator_id: "leader",
  status: "active",
} satisfies Pick<StudyGroupRow, "id" | "creator_id" | "status">;
afterEach(() => vi.unstubAllGlobals());

function member(
  profileId: string | null,
  overrides: Partial<GroupMembershipRow> = {}
): GroupMembershipRow {
  return {
    id: `membership-${profileId}`,
    group_id: "group-1",
    course_id: "course-1",
    profile_id: profileId,
    display_name_snapshot: "Student",
    membership_status: "active",
    joined_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function settings(
  overrides: Partial<Parameters<typeof GroupCapacitySettings>[0]> = {}
) {
  return renderToStaticMarkup(
    createElement(GroupCapacitySettings, {
      activeCount: 3,
      maxMembers: 5,
      canManage: true,
      value: "5",
      busy: false,
      saving: false,
      onChange: vi.fn(),
      onSave: vi.fn(),
      ...overrides,
    })
  );
}

describe("group maximum input validation", () => {
  it.each(["", " ", "0", "1", "20", "-2", "2.5", "2e1", "NaN", "Infinity"])(
    "rejects an unset or invalid maximum %j",
    value => expect(validateGroupMaximum(value).value).toBeNull()
  );
  it("accepts explicit boundary values and allows the current count", () => {
    expect(validateGroupMaximum("2").value).toBe(2);
    expect(validateGroupMaximum("19").value).toBe(19);
    expect(validateGroupMaximum("4", 4).value).toBe(4);
  });
  it("rejects lower maximums and over-19 groups without changing anyone's membership", () => {
    expect(validateGroupMaximum("3", 4).error).toBe(
      GROUP_MAXIMUM_TOO_LOW_MESSAGE
    );
    expect(validateGroupMaximum("19", 20).error).toBe(
      GROUP_MAXIMUM_OVER_LIMIT_MESSAGE
    );
  });
});

describe("capacity and management eligibility", () => {
  const leader = member("leader");
  const other = member("other");
  it("counts active rows for this group and adds only a missing forming creator", () => {
    const forming = { ...group, status: "forming" as const };
    expect(getGroupCapacityCount(forming, [])).toBe(1);
    expect(getGroupCapacityCount(forming, [leader, other])).toBe(2);
    expect(getGroupCapacityCount(forming, [other])).toBe(2);
    expect(getGroupCapacityCount({ ...forming, creator_id: null }, [])).toBe(0);
    expect(
      getGroupCapacityCount(group, [
        leader,
        other,
        member("gone", { membership_status: "removed" }),
        member("elsewhere", { group_id: "group-2" }),
      ])
    ).toBe(2);
  });
  it("treats a forming creator's restricted roster as unknown, not as one member", () => {
    const forming = { ...group, status: "forming" as const };
    expect(getVisibleGroupCapacityCount(forming, [], "leader")).toBeNull();
    expect(getVisibleGroupCapacityCount(forming, [other], "leader")).toBeNull();
    expect(
      getVisibleGroupCapacityCount(forming, [leader, other], "leader")
    ).toBe(2);
    expect(getVisibleGroupCapacityCount(group, [leader, other], "other")).toBe(
      2
    );
  });
  it("prioritizes over-limit over unset and never treats unset as unlimited", () => {
    expect(getGroupCapacityState(20, null)).toBe("over_limit");
    expect(getGroupCapacityState(2, null)).toBe("maximum_not_set");
    expect(getGroupCapacityState(2, 2)).toBe("full");
    expect(getGroupCapacityState(2, 3)).toBe("available");
  });
  it("offers capacity management only to the current leader of an eligible group", () => {
    expect(canManageGroupCapacity(group, [leader, other], "leader")).toBe(true);
    expect(canManageGroupCapacity(group, [leader, other], "other")).toBe(false);
    expect(canManageGroupCapacity(group, [other], "leader")).toBe(false);
    expect(
      canManageGroupCapacity({ ...group, status: "forming" }, [], "leader")
    ).toBe(true);
    expect(
      canManageGroupCapacity(
        { ...group, status: "archived" },
        [leader],
        "leader"
      )
    ).toBe(false);
  });
  it("allows only individual active nonleader targets with a known profile", () => {
    const members = [leader, other];
    expect(canRemoveGroupMember(group, members, "leader", other)).toBe(true);
    expect(canRemoveGroupMember(group, members, "leader", leader)).toBe(false);
    expect(canRemoveGroupMember(group, members, "other", leader)).toBe(false);
    expect(canRemoveGroupMember(group, members, "leader", member(null))).toBe(
      false
    );
    expect(
      canRemoveGroupMember(
        group,
        members,
        "leader",
        member("old", { membership_status: "removed" })
      )
    ).toBe(false);
    expect(
      canRemoveGroupMember(
        group,
        members,
        "leader",
        member("other", { group_id: "group-2" })
      )
    ).toBe(false);
    expect(
      canRemoveGroupMember(
        { ...group, status: "forming" },
        [other],
        "leader",
        other
      )
    ).toBe(true);
    expect(canRemoveGroupMember(group, [other], "leader", other)).toBe(false);
  });
});

describe("capacity settings presentation", () => {
  it("shows the actual count/maximum and a required bounded numeric leader input", () => {
    const html = settings();
    expect(html).toContain("3 / 5 members");
    expect(html).toContain('type="number"');
    expect(html).toContain('min="2"');
    expect(html).toContain('max="19"');
    expect(html).toContain('step="1"');
    expect(html).toContain("required");
    expect(html).toContain("Save maximum");
  });
  it("shows an unset maximum without inventing a number", () => {
    const html = settings({ activeCount: 1, maxMembers: null, value: "" });
    expect(html).toContain("1 member counted");
    expect(html).toContain("Group maximum is not set");
    expect(html).toContain('value=""');
    expect(html).not.toContain("1 / 19");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("does not invent a count when the viewer cannot see the full roster", () => {
    const html = settings({ activeCount: null, maxMembers: 5, value: "6" });
    expect(html).toContain("Current member count is unavailable in this view.");
    expect(html).toContain("Group maximum: 5");
    expect(html).toContain("server");
    expect(html).not.toContain("1 / 5");
    expect(html).not.toContain("Group is full");
  });
  it("presents full and over-limit states while retaining the unset message", () => {
    expect(settings({ activeCount: 5 })).toContain("Group is full");
    const html = settings({ activeCount: 20, maxMembers: null, value: "19" });
    expect(html).toContain("Group maximum is not set");
    expect(html).toContain(GROUP_MAXIMUM_OVER_LIMIT_MESSAGE);
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("shows the value read-only to nonleaders", () => {
    const html = settings({ canManage: false });
    expect(html).toContain("3 / 5 members");
    expect(html).toContain("Only the current group leader");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Save maximum");
  });
  it("disables saving below the current count or while busy", () => {
    expect(settings({ activeCount: 4, value: "3" })).toContain(
      GROUP_MAXIMUM_TOO_LOW_MESSAGE
    );
    expect(settings({ activeCount: 4, value: "3" })).toMatch(
      /<button[^>]*disabled/
    );
    expect(settings({ busy: true, saving: true, value: "6" })).toMatch(
      /<button[^>]*disabled/
    );
    expect(settings({ busy: true, saving: true, value: "6" })).toContain(
      "Saving…"
    );
  });

  it("only invokes save for a valid, changed value when not busy", () => {
    const onSave = vi.fn();
    const props = {
      activeCount: 3,
      maxMembers: 5,
      canManage: true,
      value: "6",
      busy: false,
      saving: false,
      onChange: vi.fn(),
      onSave,
    };
    const submit = (overrides: Partial<typeof props>) => {
      const tree = GroupCapacitySettings({ ...props, ...overrides });
      const form = tree.props.children.find(
        (child: { type?: string } | null) => child?.type === "form"
      );
      form.props.onSubmit({ preventDefault: vi.fn() });
    };
    submit({ value: "2" });
    submit({ value: "" });
    submit({ value: "5" });
    submit({ value: "6", busy: true });
    expect(onSave).not.toHaveBeenCalled();
    submit({ value: "6" });
    expect(onSave).toHaveBeenCalledOnce();
  });
});

describe("individual member removal control", () => {
  const leader = member("leader");
  const other = member("other", { display_name_snapshot: "Alex" });
  const completeGroup = {
    ...group,
    course_id: "course-1",
    name: "Study group",
    created_at: "2026-11-01T00:00:00Z",
    max_members: null,
  };
  const props = {
    group: completeGroup,
    members: [leader, other],
    userId: "leader",
    member: other,
    busy: false,
    removing: false,
    onRemove: vi.fn(),
  };

  it("does not render an action for the leader, a nonleader viewer, or a null target", () => {
    expect(GroupMemberRemoval({ ...props, member: leader })).toBeNull();
    expect(GroupMemberRemoval({ ...props, userId: "other" })).toBeNull();
    expect(GroupMemberRemoval({ ...props, member: member(null) })).toBeNull();
  });

  it("requires confirmation before invoking removal and does nothing while busy", () => {
    const onRemove = vi.fn();
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal("window", { confirm });
    const button = GroupMemberRemoval({ ...props, onRemove });
    expect(button).not.toBeNull();
    button!.props.onClick();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("Alex");
    expect(confirm.mock.calls[0][0]).toContain("pending invitations");
    expect(onRemove).not.toHaveBeenCalled();
    button!.props.onClick();
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(other);
    const busyButton = GroupMemberRemoval({ ...props, onRemove, busy: true });
    busyButton!.props.onClick();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
