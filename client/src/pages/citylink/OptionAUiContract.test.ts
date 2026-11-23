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

  it("gives neutral recruitment guidance in the My Group empty state and removes unlimited-size claims", () => {
    const myGroup = pageSource("./AuthenticatedMyGroup.tsx").replace(
      /\s+/g,
      " "
    );
    const workflow = pageSource("./GroupWorkflows.tsx").replace(/\s+/g, " ");
    const start = myGroup.indexOf(
      "You do not have a group for this course yet"
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const end = myGroup.indexOf("</section>", start);
    expect(end).toBeGreaterThan(start);
    const emptyState = myGroup.slice(start, end);
    expect(emptyState).toContain(
      "browse recruitment posts to find a group seeking members"
    );
    expect(emptyState).not.toMatch(/request to join an existing group/i);
    expect(myGroup).not.toMatch(/groups have no maximum size/i);
    expect(workflow).not.toMatch(/group size is not limited/i);
    expect(workflow).not.toMatch(
      /the server enforces this after leader succession/i
    );
  });

  it("preserves the recruitment-post application call through the existing shared service", () => {
    const recruitment = pageSource("./GroupWorkspacePage.tsx");
    const control = pageSource("./Stage6Capacity.tsx");
    expect(recruitment).toMatch(
      /requestToJoinGroup\(userId,\s*post\.groupId!?,\s*\(\)\s*=>\s*scope\.isCurrent\(token\)\)/
    );
    expect(recruitment).toContain("<Stage6ApplyControl");
    expect(control).toContain("post.applyEnabled");
    expect(control).toContain("Apply to join");
  });
});
