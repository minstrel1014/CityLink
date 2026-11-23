import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoursePeerList } from "@/components/citylink/CoursePeerList";
import { filterCoursePeers } from "@/lib/courseDetailActions";
import type { CourseGroupSummary, GroupCoursePeer } from "@/lib/supabaseGroups";

const peers: GroupCoursePeer[] = [
  {
    profile_id: "ungrouped",
    student_id: null,
    display_name: "First Student",
    major: null,
    year: 1,
    bio: "",
    skills: [],
    status: "open",
  },
  {
    profile_id: "grouped",
    student_id: null,
    display_name: "Second Student",
    major: null,
    year: 2,
    bio: "",
    skills: [],
    status: "considering",
  },
];

describe("unified coursemate list", () => {
  it("renders every supplied card together in the given order without group categories", () => {
    const html = renderToStaticMarkup(
      createElement(CoursePeerList, {
        peers,
        renderPeer: peer =>
          createElement("article", { key: peer.profile_id }, peer.display_name),
      })
    );
    expect(html.match(/class="classmate-list"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Coursemates"');
    expect(html.indexOf("First Student")).toBeLessThan(
      html.indexOf("Second Student")
    );
    expect(html).not.toContain('id="classmates-in-group"');
    expect(html).not.toContain('id="classmates-looking"');
  });

  it("renders only ungrouped people for the displayed availability filter", () => {
    const summary: CourseGroupSummary = {
      profile_id: "grouped",
      group_id: "group-1",
      group_name: "Team",
      group_status: "active",
      group_size: 2,
    };
    const sameAvailability = peers.map(peer => ({
      ...peer,
      status: "open" as const,
    }));
    const selected = filterCoursePeers(
      sameAvailability,
      "",
      "open",
      new Map([[summary.profile_id, summary]])
    );
    const html = renderToStaticMarkup(
      createElement(CoursePeerList, {
        peers: selected,
        renderPeer: peer =>
          createElement("article", { key: peer.profile_id }, peer.display_name),
      })
    );
    expect(html).toContain("First Student");
    expect(html).not.toContain("Second Student");
  });
});
