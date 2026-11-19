import { describe, expect, it } from "vitest";
import {
  filterCoursePeers,
  getCourseInviteGroups,
  getInvitationHistoryLabel,
  getJoinActionState,
  getOwnCourseGroup,
  getPeerInvitationState,
  getViewerGroupRelationship,
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

  it("allows a currently eligible person to be invited again after an accepted invitation", () => {
    expect(
      getPeerInvitationState("user-1", "peer-3", "course-1", invitations, true)
    ).toBeNull();
    expect(
      getPeerInvitationState("user-1", "peer-3", "course-1", invitations, false)
    ).toBe("connected");
    expect(
      getPeerInvitationState("user-1", "peer-1", "course-1", invitations, true)
    ).toBe("sent");
    expect(
      getPeerInvitationState("user-1", "peer-2", "course-1", invitations, true)
    ).toBe("received");
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

  it("filters one mixed list in service order without grouping students", () => {
    const peers: GroupCoursePeer[] = [
      {
        profile_id: "one",
        student_id: "ST01",
        display_name: "Avery",
        major: "Business",
        year: 1,
        bio: "",
        skills: [],
        status: "considering",
      },
      {
        profile_id: "two",
        student_id: "ST02",
        display_name: "Blair",
        major: "Computing",
        year: 2,
        bio: "",
        skills: [],
        status: "open",
      },
      {
        profile_id: "three",
        student_id: null,
        display_name: "Casey",
        major: null,
        year: 3,
        bio: "",
        skills: [],
        status: "full",
      },
    ];
    const noGroups = new Map<string, CourseGroupSummary>();
    expect(
      filterCoursePeers(peers, "", "all", noGroups).map(p => p.profile_id)
    ).toEqual(["one", "two", "three"]);
    expect(
      filterCoursePeers(peers, "st02", "all", noGroups).map(p => p.profile_id)
    ).toEqual(["two"]);
    expect(
      filterCoursePeers(peers, "business", "considering", noGroups).map(
        p => p.profile_id
      )
    ).toEqual(["one"]);
    expect(
      filterCoursePeers(peers, "", "full", noGroups).map(p => p.profile_id)
    ).toEqual(["three"]);
    expect(filterCoursePeers(peers, "business", "open", noGroups)).toEqual([]);
  });

  it("filters by card status, not a grouped student's stale profile availability", () => {
    const peers: GroupCoursePeer[] = (
      ["open", "considering", "full"] as const
    ).flatMap(status =>
      [true, false].map(grouped => ({
        profile_id: `${status}-${grouped ? "grouped" : "ungrouped"}`,
        student_id: null,
        display_name: status,
        major: null,
        year: 1,
        bio: "",
        skills: [],
        status,
      }))
    );
    const summaries = new Map<string, CourseGroupSummary>(
      peers
        .filter(peer => peer.profile_id.endsWith("-grouped"))
        .map(peer => [
          peer.profile_id,
          {
            profile_id: peer.profile_id,
            group_id: "g",
            group_name: "G",
            group_status: "active",
            group_size: 2,
          },
        ])
    );
    expect(
      filterCoursePeers(peers, "", "all", summaries).map(p => p.profile_id)
    ).toEqual(peers.map(p => p.profile_id));
    for (const status of ["open", "considering", "full"] as const) {
      expect(
        filterCoursePeers(peers, "", status, summaries).map(p => p.profile_id)
      ).toEqual([`${status}-ungrouped`]);
      expect(
        filterCoursePeers(peers, status, status, summaries).map(
          p => p.profile_id
        )
      ).toEqual([`${status}-ungrouped`]);
    }
  });

  it("labels only the viewer's active membership or pending request for the same group and course", () => {
    const request: GroupJoinRequestRow = {
      id: "request-1",
      group_id: "group-1",
      course_id: "course-1",
      requester_id: "user-1",
      requester_name_snapshot: "Student One",
      status: "pending",
      created_at: "2026-11-04T00:00:00Z",
    };
    const membership: GroupMembershipRow = {
      id: "membership-1",
      group_id: "group-1",
      course_id: "course-1",
      profile_id: "user-1",
      display_name_snapshot: "Student One",
      membership_status: "active",
      joined_at: "2026-11-04T00:00:00Z",
    };
    const base = {
      userId: "user-1",
      courseId: "course-1",
      groupId: "group-1",
      memberships: [] as GroupMembershipRow[],
      joinRequests: [request],
    };
    expect(getViewerGroupRelationship(base)).toBe("requested");
    expect(
      getViewerGroupRelationship({ ...base, memberships: [membership] })
    ).toBe("member");
    const memberOnly = { ...base, memberships: [membership], joinRequests: [] };
    expect(
      getViewerGroupRelationship({ ...memberOnly, userId: "other-user" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({ ...memberOnly, courseId: "other-course" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({ ...memberOnly, groupId: "other-group" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({ ...base, userId: "other-user" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({ ...base, courseId: "other-course" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({ ...base, groupId: "other-group" })
    ).toBeNull();
    expect(
      getViewerGroupRelationship({
        ...base,
        joinRequests: [{ ...request, requester_id: "other-user" }],
      })
    ).toBeNull();
    for (const status of [
      "approved",
      "rejected",
      "cancelled",
      "expired",
    ] as const) {
      expect(
        getViewerGroupRelationship({
          ...base,
          joinRequests: [{ ...request, status }],
        })
      ).toBeNull();
    }
    for (const membership_status of [
      "left",
      "removed",
      "account_deleted",
    ] as const) {
      expect(
        getViewerGroupRelationship({
          ...base,
          joinRequests: [],
          memberships: [{ ...membership, membership_status }],
        })
      ).toBeNull();
    }
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
