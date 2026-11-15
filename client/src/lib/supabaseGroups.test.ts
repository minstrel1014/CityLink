import { describe, expect, it } from "vitest";
import {
  getGroupWorkflowErrorMessage,
  mapGroupCoursePeers,
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
