import { describe, expect, it } from "vitest";
import {
  getGroupWorkflowErrorMessage,
  mapCourseInviteCandidateIds,
  mapCourseGroupSummaries,
  mapGroupCoursePeers,
  mapOwnCourseProfile,
  mapActiveGroupMemberships,
} from "@/lib/supabaseGroups";

describe("group workflow Supabase response mapping", () => {
  it("maps the authorized course-roster RPC response", () => {
    expect(
      mapGroupCoursePeers([
        {
          profile_id: "peer-1",
          student_id: "s1234567",
          display_name: "Avery Chan",
          major: "Information Systems",
          year: 2,
          bio: "Interested in building useful tools.",
          skills: ["Research", "React"],
          status: "open",
        },
      ])
    ).toEqual([
      {
        profile_id: "peer-1",
        student_id: "s1234567",
        display_name: "Avery Chan",
        major: "Information Systems",
        year: 2,
        bio: "Interested in building useful tools.",
        skills: ["Research", "React"],
        status: "open",
      },
    ]);
  });

  it("rejects an invalid roster response rather than rendering unverified data", () => {
    expect(() => mapGroupCoursePeers({})).toThrow(/response is invalid/i);
    expect(() =>
      mapGroupCoursePeers([
        { profile_id: "peer-1", display_name: "Avery", status: "unknown" },
      ])
    ).toThrow(/availability status/i);
  });
});

describe("group workflow error feedback", () => {
  it("explains that an existing join request wins over a later invitation", () => {
    expect(
      getGroupWorkflowErrorMessage({
        message:
          "student already has a pending join request for this group; review that request instead of sending an invitation",
      })
    ).toMatch(/first pending action/i);
  });

  it("explains that an existing invitation wins over a later join request", () => {
    expect(
      getGroupWorkflowErrorMessage(
        new Error(
          "you already have a pending invitation to this group; respond to that invitation instead of requesting to join"
        )
      )
    ).toMatch(/first pending action/i);
  });

  it("provides actionable messages for non-leader review and a stale action", () => {
    expect(
      getGroupWorkflowErrorMessage(
        new Error("only the current group leader may review requests")
      )
    ).toMatch(/current active group leader/i);
    expect(
      getGroupWorkflowErrorMessage(new Error("invitation is no longer pending"))
    ).toMatch(/no longer pending/i);
  });
});

describe("course invite eligibility response mapping", () => {
  it("accepts only profile IDs and removes duplicate IDs", () => {
    expect(
      mapCourseInviteCandidateIds([
        { profile_id: "11111111-1111-4111-8111-111111111111" },
        { profile_id: "22222222-2222-4222-8222-222222222222" },
        { profile_id: "11111111-1111-4111-8111-111111111111" },
      ])
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("rejects an invalid eligibility response", () => {
    expect(() => mapCourseInviteCandidateIds({})).toThrow(
      /response is invalid/i
    );
    expect(() =>
      mapCourseInviteCandidateIds([
        {
          profile_id: "11111111-1111-4111-8111-111111111111",
          group_id: "secret-group",
        },
      ])
    ).toThrow(/response is invalid/i);
    expect(() =>
      mapCourseInviteCandidateIds([{ profile_id: "not-a-uuid" }])
    ).toThrow(/profile_id is invalid/i);
  });
});

describe("course detail group data mapping", () => {
  it("accepts only peer-to-group summaries and group-size metadata", () => {
    expect(
      mapCourseGroupSummaries([
        {
          profile_id: "11111111-1111-4111-8111-111111111111",
          group_id: "22222222-2222-4222-8222-222222222222",
          group_name: "Research team",
          group_status: "active",
          group_size: 3,
          max_members: 5,
          capacity_count: 3,
          capacity_state: "available",
        },
      ])
    ).toEqual([
      {
        profile_id: "11111111-1111-4111-8111-111111111111",
        group_id: "22222222-2222-4222-8222-222222222222",
        group_name: "Research team",
        group_status: "active",
        group_size: 3,
        max_members: 5,
        capacity_count: 3,
        capacity_state: "available",
      },
    ]);
    expect(() =>
      mapCourseGroupSummaries([
        {
          profile_id: "11111111-1111-4111-8111-111111111111",
          group_id: "22222222-2222-4222-8222-222222222222",
          group_name: "Research team",
          group_status: "active",
          group_size: 3,
          max_members: 5,
          capacity_count: 3,
          capacity_state: "available",
          member_names: ["Private Name"],
        },
      ])
    ).toThrow(/response is invalid/i);
  });

  it("rejects duplicate peer associations and invalid group sizes", () => {
    const row = {
      profile_id: "11111111-1111-4111-8111-111111111111",
      group_id: "22222222-2222-4222-8222-222222222222",
      group_name: "Research team",
      group_status: "forming",
      group_size: 2,
      max_members: 5,
      capacity_count: 2,
      capacity_state: "available",
    };
    expect(() => mapCourseGroupSummaries([{ ...row, group_size: 0 }])).toThrow(
      /invalid data/i
    );
    expect(() => mapCourseGroupSummaries([row, row])).toThrow(/invalid data/i);
  });

  it("accepts only the signed-in user's minimal own-profile fields", () => {
    expect(
      mapOwnCourseProfile(
        {
          id: "11111111-1111-4111-8111-111111111111",
          display_name: "Chloe Chan",
          status: "open",
        },
        "11111111-1111-4111-8111-111111111111"
      )
    ).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Chloe Chan",
      status: "open",
    });
    expect(() =>
      mapOwnCourseProfile(
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Other student",
          status: "open",
        },
        "11111111-1111-4111-8111-111111111111"
      )
    ).toThrow(/did not match/i);
  });

  it("accepts only active membership rows for the current group list", () => {
    expect(
      mapActiveGroupMemberships([
        {
          id: "membership-1",
          group_id: "22222222-2222-4222-8222-222222222222",
          course_id: "33333333-3333-4333-8333-333333333333",
          profile_id: "11111111-1111-4111-8111-111111111111",
          display_name_snapshot: "Chloe Chan",
          membership_status: "active",
          joined_at: "2026-11-17T00:00:00Z",
        },
      ])
    ).toHaveLength(1);
    expect(() =>
      mapActiveGroupMemberships([{ membership_status: "left" }])
    ).toThrow(/invalid membership data/i);
  });
});
