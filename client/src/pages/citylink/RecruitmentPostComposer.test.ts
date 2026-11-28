import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseStage6", () => ({
  createGroupRecruitmentPost: vi.fn(),
  getStage6ErrorMessage: () => "Post error",
  MAX_RECRUITMENT_POST_LENGTH: 2000,
}));

const { RecruitmentPostComposer } = await import("./RecruitmentPostComposer");

function render(canCreate: boolean) {
  return renderToStaticMarkup(
    createElement(RecruitmentPostComposer, {
      userId: "user-1",
      groupId: "group-1",
      groupName: "Pitch Team",
      courseCode: "COMM105",
      memberCount: 3,
      maxMembers: 19,
      canCreate,
      onPosted: vi.fn(),
    })
  );
}

describe("recruitment post composer", () => {
  it("shows the create entry and the group facts for the current leader", () => {
    const html = render(true);
    expect(html).toContain("Pitch Team");
    expect(html).toContain("COMM105 · 3 / 19 members");
    expect(html).toContain(">Create recruitment post</button>");
  });

  it("hides the create entry for an active member who is not the leader", () => {
    const html = render(false);
    expect(html).toContain("Pitch Team");
    expect(html).not.toContain("Create recruitment post");
    expect(html).not.toContain("<button");
  });

  it("reports a group with no maximum without inventing a capacity", () => {
    const html = renderToStaticMarkup(
      createElement(RecruitmentPostComposer, {
        userId: "user-1",
        groupId: "group-2",
        groupName: "Fieldwork Five",
        courseCode: "COMM105",
        memberCount: 2,
        maxMembers: null,
        canCreate: true,
        onPosted: vi.fn(),
      })
    );
    expect(html).toContain("COMM105 · 2 members");
    expect(html).not.toContain(" / ");
  });

  it("does not invent a member count when the roster could not be read", () => {
    const html = renderToStaticMarkup(
      createElement(RecruitmentPostComposer, {
        userId: "user-1",
        groupId: "group-3",
        groupName: "Pitch Team",
        courseCode: "COMM105",
        memberCount: null,
        maxMembers: 19,
        canCreate: true,
        onPosted: vi.fn(),
      })
    );
    expect(html).toContain("COMM105 · Member count unavailable");
    expect(html).not.toContain(" / 19 members");
  });
});
