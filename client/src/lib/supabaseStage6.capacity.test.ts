import { describe, expect, it } from "vitest";
import {
  mapCourseGroupSummaries,
  mapGroupRecruitmentPosts,
} from "@/lib/supabaseStage6";

const group = () => ({
  group_id: "group-1",
  group_name: "Design team",
  group_status: "active",
  active_member_count: 3,
  max_members: 5,
  capacity_count: 3,
  capacity_state: "available",
  can_create_post: false,
  has_more: true,
});

const post = () => ({
  post_id: "post-1",
  group_id: "group-1" as string | null,
  group_name: "Design team" as string | null,
  active_member_count: 3 as number | null,
  max_members: 5 as number | null,
  capacity_count: 3 as number | null,
  capacity_state: "available" as string | null,
  author_name: "A Student",
  subject: "Looking for a teammate",
  body: "Looking for a designer.",
  post_status: "open",
  created_at: "2026-11-17T09:00:00.000Z",
  updated_at: "2026-11-17T09:00:00.000Z",
  closed_at: null as string | null,
  apply_enabled: true,
  apply_block_reason: null as string | null,
  can_manage: false,
  has_more: true,
});

const terminal = () => ({
  ...post(),
  group_id: null,
  group_name: null,
  active_member_count: null,
  max_members: null,
  capacity_count: null,
  capacity_state: null,
  post_status: "closed",
  closed_at: "2026-11-17T10:00:00.000Z",
  apply_enabled: false,
  apply_block_reason: "group_inactive",
});

describe("Stage 6 capacity RPC response contract", () => {
  it("maps available groups and posts with matching canonical counts", () => {
    expect(mapCourseGroupSummaries([group()]).items[0]).toMatchObject({
      activeMemberCount: 3,
      capacityCount: 3,
      maxMembers: 5,
      capacityState: "available",
    });
    expect(mapGroupRecruitmentPosts([post()]).items[0]).toMatchObject({
      activeMemberCount: 3,
      capacityCount: 3,
      maxMembers: 5,
      capacityState: "available",
      applyEnabled: true,
      applyBlockReason: null,
    });
  });

  it.each([
    ["available", 3, 5, "available"],
    ["full", 5, 5, "full"],
    ["unset", 3, null, "maximum_not_set"],
    ["over-limit", 20, null, "over_limit"],
    ["over-limit with a maximum", 20, 19, "over_limit"],
    ["above an existing maximum", 6, 5, "full"],
  ])("maps the %s group state", (_label, count, maximum, state) => {
    const row = {
      ...group(),
      active_member_count: count,
      capacity_count: count,
      max_members: maximum,
      capacity_state: state,
    };
    expect(mapCourseGroupSummaries([row]).items[0]).toMatchObject({
      capacityCount: count,
      maxMembers: maximum,
      capacityState: state,
    });
  });

  it.each([
    [5, 5, "full", "group_full"],
    [3, null, "maximum_not_set", "maximum_not_set"],
    [20, null, "over_limit", "group_over_limit"],
  ])(
    "maps capacity-blocked posts at count %s",
    (count, maximum, state, reason) => {
      const row = {
        ...post(),
        active_member_count: count,
        capacity_count: count,
        max_members: maximum,
        capacity_state: state,
        apply_enabled: false,
        apply_block_reason: reason,
      };
      expect(mapGroupRecruitmentPosts([row]).items[0]).toMatchObject({
        capacityCount: count,
        maxMembers: maximum,
        capacityState: state,
        applyEnabled: false,
        applyBlockReason: reason,
      });
    }
  );

  it.each([
    "already_member",
    "pending_invitation",
    "pending_request",
    "profile_unavailable",
    "not_eligible",
  ])("preserves the server's %s eligibility reason", reason => {
    expect(
      mapGroupRecruitmentPosts([
        { ...post(), apply_enabled: false, apply_block_reason: reason },
      ]).items[0].applyBlockReason
    ).toBe(reason);
  });

  it("gives a closed post priority over capacity and a terminal group priority over closure", () => {
    const closed = {
      ...post(),
      active_member_count: 5,
      capacity_count: 5,
      capacity_state: "full",
      post_status: "closed",
      closed_at: "2026-11-17T10:00:00.000Z",
      apply_enabled: false,
      apply_block_reason: "post_closed",
    };
    expect(mapGroupRecruitmentPosts([closed]).items[0]).toMatchObject({
      capacityState: "full",
      applyBlockReason: "post_closed",
    });
    expect(mapGroupRecruitmentPosts([terminal()]).items[0]).toMatchObject({
      groupId: null,
      groupName: null,
      activeMemberCount: null,
      maxMembers: null,
      capacityCount: null,
      capacityState: null,
      applyEnabled: false,
      applyBlockReason: "group_inactive",
    });
  });

  it("rejects unexpected fields rather than silently broadening either response", () => {
    expect(() =>
      mapCourseGroupSummaries([{ ...group(), student_id: "private" }])
    ).toThrow(/unexpected fields/i);
    expect(() =>
      mapGroupRecruitmentPosts([{ ...post(), author_id: "private" }])
    ).toThrow(/unexpected fields/i);
  });

  it.each([
    null,
    undefined,
    "",
    " ",
    true,
    false,
    -1,
    1.5,
    "1.5",
    "1e2",
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid required count %s rather than coercing it", count => {
    expect(() =>
      mapCourseGroupSummaries([{ ...group(), capacity_count: count }])
    ).toThrow(/invalid capacity_count/i);
    expect(() =>
      mapGroupRecruitmentPosts([{ ...post(), active_member_count: count }])
    ).toThrow(/invalid active_member_count/i);
  });

  it("accepts integer strings for bigint compatibility but not a missing maximum", () => {
    expect(
      mapCourseGroupSummaries([
        { ...group(), active_member_count: "3", capacity_count: "3" },
      ]).items[0].capacityCount
    ).toBe(3);
    const { max_members: _maximum, ...missingMaximum } = group();
    expect(() => mapCourseGroupSummaries([missingMaximum])).toThrow(
      /invalid max_members/i
    );
  });

  it.each([1, 20, 2.5, true, "", undefined])(
    "rejects invalid maximum %s",
    maximum => {
      expect(() =>
        mapCourseGroupSummaries([{ ...group(), max_members: maximum }])
      ).toThrow(/invalid max_members/i);
    }
  );

  it("rejects inconsistent count and state combinations on both read paths", () => {
    for (const bad of [
      { active_member_count: 2 },
      { capacity_state: "full" },
      { capacity_state: "unknown" },
      { capacity_state: null },
      { max_members: null },
      {
        active_member_count: 20,
        capacity_count: 20,
        max_members: null,
        capacity_state: "maximum_not_set",
      },
    ]) {
      expect(() => mapCourseGroupSummaries([{ ...group(), ...bad }])).toThrow(
        /inconsistent capacity/i
      );
      expect(() => mapGroupRecruitmentPosts([{ ...post(), ...bad }])).toThrow(
        /inconsistent capacity/i
      );
    }
  });

  it("rejects invalid enabled/reason combinations and reason precedence", () => {
    for (const bad of [
      { apply_enabled: true, apply_block_reason: "pending_request" },
      { apply_enabled: false, apply_block_reason: null },
      { apply_enabled: false, apply_block_reason: "unknown" },
      { apply_enabled: false, apply_block_reason: undefined },
      { apply_enabled: false, apply_block_reason: "group_full" },
      { apply_enabled: false, apply_block_reason: "post_closed" },
      { apply_enabled: false, apply_block_reason: "group_inactive" },
      {
        post_status: "closed",
        apply_enabled: false,
        apply_block_reason: "pending_request",
      },
      {
        active_member_count: 5,
        capacity_count: 5,
        capacity_state: "full",
        apply_enabled: true,
      },
      {
        active_member_count: 5,
        capacity_count: 5,
        capacity_state: "full",
        apply_enabled: false,
        apply_block_reason: "pending_request",
      },
      {
        active_member_count: 5,
        capacity_count: 5,
        capacity_state: "full",
        post_status: "closed",
        apply_enabled: false,
        apply_block_reason: "group_full",
      },
    ]) {
      expect(() => mapGroupRecruitmentPosts([{ ...post(), ...bad }])).toThrow(
        /application/i
      );
    }
  });

  it("rejects partial terminal redaction, including missing fields or a non-inactive reason", () => {
    const valid = terminal();
    for (const bad of [
      { group_name: "visible" },
      { group_id: "visible" },
      { active_member_count: 0 },
      { max_members: 5 },
      { capacity_count: 0 },
      { capacity_state: "full" },
      { capacity_count: undefined },
      { apply_block_reason: "post_closed" },
      { apply_enabled: true, apply_block_reason: null },
    ]) {
      expect(() => mapGroupRecruitmentPosts([{ ...valid, ...bad }])).toThrow();
    }
    expect(() =>
      mapGroupRecruitmentPosts([{ ...post(), capacity_count: null }])
    ).toThrow(/invalid capacity_count/i);
  });

  it("preserves cursors and consistent has_more for pages including a terminal last post", () => {
    const groups = mapCourseGroupSummaries([
      group(),
      { ...group(), group_id: "group-2", group_name: "" },
    ]);
    expect(groups.hasMore).toBe(true);
    expect(groups.nextCursor).toEqual({ groupName: "", groupId: "group-2" });
    const posts = mapGroupRecruitmentPosts([
      post(),
      {
        ...terminal(),
        post_id: "post-2",
        created_at: "2026-11-16T09:00:00.000Z",
      },
    ]);
    expect(posts.hasMore).toBe(true);
    expect(posts.nextCursor).toEqual({
      createdAt: "2026-11-16T09:00:00.000Z",
      id: "post-2",
    });
    expect(mapCourseGroupSummaries([])).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(mapGroupRecruitmentPosts([])).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(() =>
      mapCourseGroupSummaries([group(), { ...group(), has_more: false }])
    ).toThrow(/pagination/i);
    expect(() =>
      mapGroupRecruitmentPosts([post(), { ...terminal(), has_more: false }])
    ).toThrow(/pagination/i);
  });
});
