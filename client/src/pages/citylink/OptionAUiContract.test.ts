import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function pageSource(filename: string): string {
  return readFileSync(
    fileURLToPath(new URL(filename, import.meta.url)),
    "utf8"
  );
}

describe("Option A presentation-only contract", () => {
  it("keeps direct request calls out of My Groups while retaining existing request management", () => {
    const workflow = pageSource("./GroupWorkflows.tsx");
    expect(workflow).not.toMatch(
      /\brequestToJoinGroup\b|request_to_join_group/
    );
    expect(workflow).toContain("<ActiveGroupsPanel");
    expect(workflow).toContain("cancelGroupJoinRequest");
    expect(workflow).toContain("reviewGroupJoinRequest");
  });

  it("keeps the People-page guidance neutral rather than claiming server-side post-only enforcement", () => {
    const people = pageSource("./AuthenticatedCoursePeers.tsx").replace(
      /\s+/g,
      " "
    );
    expect(people).toContain("browse the course’s recruitment posts");
    expect(people).not.toMatch(
      /join requests are available only from recruitment posts/i
    );
  });

  it("preserves the recruitment-post application call through the existing shared service", () => {
    const recruitment = pageSource("./GroupWorkspacePage.tsx");
    expect(recruitment).toMatch(
      /requestToJoinGroup\(userId,\s*post\.groupId!\)/
    );
    expect(recruitment).toContain("post.applyEnabled");
    expect(recruitment).toContain("Apply to join");
  });
});
