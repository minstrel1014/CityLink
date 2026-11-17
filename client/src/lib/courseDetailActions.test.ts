import { describe, expect, it } from "vitest";
import {
  getCourseInviteGroups,
  getPeerInvitationState,
  isCoursePeerInviteable,
} from "@/lib/courseDetailActions";
import type {
  GroupInvitationRow,
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
