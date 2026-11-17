import { describe, expect, it } from "vitest";
import {
  getCourseInviteGroups,
  getInvitationHistoryLabel,
  getJoinActionState,
  getOwnCourseGroup,
  getPeerInvitationState,
  isCoursePeerInviteable,
  splitCoursePeersByGroup,
} from "@/lib/courseDetailActions";
import type {
  CourseGroupSummary,
  GroupCoursePeer,
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

const groups: StudyGroupRow[] = [
  {
    id: "active-member",
    course_id: "course-1",
    creator_id: "leader-1",
    status: "active",
    name: "Active group",
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "forming-creator",
    course_id: "course-1",
    creator_id: "user-1",
    status: "forming",
    name: "Forming group",
    created_at: "2026-11-02T00:00:00Z",
  },
  {
    id: "forming-other",
    course_id: "course-1",
    creator_id: "other-user",
    status: "forming",
    name: "Other forming group",
    created_at: "2026-11-03T00:00:00Z",
  },
  {
    id: "other-course",
    course_id: "course-2",
    creator_id: "user-1",
    status: "forming",
    name: "Other course",
    created_at: "2026-11-04T00:00:00Z",
  },
];

const invitations: GroupInvitationRow[] = [
  {
    id: "sent-pending",
    group_id: "group-1",
    course_id: "course-1",
    sender_id: "user-1",
    recipient_id: "peer-1",
    sender_name_snapshot: "Student One",
    recipient_name_snapshot: "Student Two",
    status: "pending",
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "received-pending",
    group_id: "group-2",
    course_id: "course-1",
    sender_id: "peer-2",
    recipient_id: "user-1",
    sender_name_snapshot: "Student Two",
    recipient_name_snapshot: "Student One",
    status: "pending",
    created_at: "2026-11-02T00:00:00Z",
  },
  {
    id: "accepted",
    group_id: "group-3",
    course_id: "course-1",
    sender_id: "user-1",
    recipient_id: "peer-3",
    sender_name_snapshot: "Student One",
    recipient_name_snapshot: "Student Three",
    status: "accepted",
    created_at: "2026-11-03T00:00:00Z",
  },
];

describe("authenticated course detail invitation actions", () => {
  it("allows active members and a forming-group creator, not unrelated students", () => {
    const memberships: GroupMembershipRow[] = [
      {
        id: "membership-1",
        group_id: "active-member",
        course_id: "course-1",
        profile_id: "user-1",
        display_name_snapshot: "Student One",
        membership_status: "active",
        joined_at: "2026-11-01T00:00:00Z",
      },
    ];

    expect(
      getCourseInviteGroups(groups, memberships, "course-1", "user-1").map(
        group => group.id
      )
    ).toEqual(["active-member", "forming-creator"]);
  });

  it("only offers invite actions to open or considering peers", () => {
    expect(isCoursePeerInviteable("open")).toBe(true);
    expect(isCoursePeerInviteable("considering")).toBe(true);
    expect(isCoursePeerInviteable("full")).toBe(false);
  });

  it("shows pending incoming/outgoing invitations before accepted history", () => {
    expect(
      getPeerInvitationState("user-1", "peer-1", "course-1", invitations)
    ).toBe("sent");
    expect(
      getPeerInvitationState("user-1", "peer-2", "course-1", invitations)
    ).toBe("received");
    expect(
      getPeerInvitationState("user-1", "peer-3", "course-1", invitations)
    ).toBe("connected");
    expect(
      getPeerInvitationState("user-1", "unknown", "course-1", invitations)
    ).toBeNull();
  });
});

describe("two-view course detail helpers", () => {
  it("locates only the signed-in student's active group or forming creator group", () => {
    const memberships: GroupMembershipRow[] = [
      {
        id: "membership-1",
        group_id: "active-member",
        course_id: "course-1",
        profile_id: "user-1",
        display_name_snapshot: "Student One",
        membership_status: "active",
        joined_at: "2026-11-01T00:00:00Z",
      },
    ];
    expect(
      getOwnCourseGroup(groups, memberships, "course-1", "user-1")?.id
    ).toBe("active-member");
    expect(getOwnCourseGroup(groups, [], "course-1", "user-1")?.id).toBe(
      "forming-creator"
    );
    expect(getOwnCourseGroup(groups, [], "course-1", "peer-1")).toBeNull();
  });

  it("splits real coursemates by the server-returned group association", () => {
    const peers: GroupCoursePeer[] = [
      {
        profile_id: "peer-1",
        student_id: null,
        display_name: "Avery Chan",
        major: null,
        year: 2,
        bio: "",
        skills: [],
        status: "open",
      },
      {
        profile_id: "peer-2",
        student_id: null,
        display_name: "Blair Lam",
        major: null,
        year: 3,
        bio: "",
        skills: [],
        status: "considering",
      },
    ];
    const summaries: CourseGroupSummary[] = [
      {
        profile_id: "peer-2",
        group_id: "group-2",
        group_name: "Research team",
        group_status: "active",
        group_size: 3,
      },
    ];
    const result = splitCoursePeersByGroup(peers, summaries);
    expect(result.inGroup.map(peer => peer.profile_id)).toEqual(["peer-2"]);
    expect(result.lookingForGroup.map(peer => peer.profile_id)).toEqual([
      "peer-1",
    ]);
  });

  it("preserves first-pending-action rules and only permits requests to active groups", () => {
    const group: CourseGroupSummary = {
      profile_id: "peer-1",
      group_id: "group-1",
      group_name: "Research team",
      group_status: "active",
      group_size: 2,
    };
    const request: GroupJoinRequestRow = {
      id: "request-1",
      group_id: "group-1",
      course_id: "course-1",
      requester_id: "user-1",
      requester_name_snapshot: "Student One",
      status: "pending",
      created_at: "2026-11-04T00:00:00Z",
    };
    const pendingInvite: GroupInvitationRow = {
      id: "invite-1",
      group_id: "group-1",
      course_id: "course-1",
      sender_id: "peer-1",
      recipient_id: "user-1",
      sender_name_snapshot: "Student Two",
      recipient_name_snapshot: "Student One",
      status: "pending",
      created_at: "2026-11-04T00:00:00Z",
    };
    const base = {
      userHasGroup: false,
      userStatus: "open" as const,
      group,
      userId: "user-1",
      invitations: [] as GroupInvitationRow[],
      joinRequests: [] as GroupJoinRequestRow[],
    };
    expect(getJoinActionState({ ...base, invitations: [pendingInvite] })).toBe(
      "invitation-pending"
    );
    expect(getJoinActionState({ ...base, joinRequests: [request] })).toBe(
      "request-pending"
    );
    expect(getJoinActionState({ ...base, userHasGroup: true })).toBe(
      "already-grouped"
    );
    expect(
      getJoinActionState({
        ...base,
        group: { ...group, group_status: "forming" },
      })
    ).toBe("forming-group");
  });

  it("uses the requested 'Rejected' label for the stored declined status", () => {
    expect(getInvitationHistoryLabel("declined")).toBe("Rejected");
    expect(getInvitationHistoryLabel("pending")).toBe("Pending");
  });
});
