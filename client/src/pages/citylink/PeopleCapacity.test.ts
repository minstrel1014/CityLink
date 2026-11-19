import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The Radix portal is intentionally replaced for server-side markup inspection.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) =>
    createElement("div", { role: "dialog", "aria-modal": true }, children),
  DialogContent: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  DialogHeader: ({ children }: { children: ReactNode }) =>
    createElement("header", null, children),
  DialogTitle: ({ children }: { children: ReactNode }) =>
    createElement("h2", null, children),
  DialogDescription: ({ children }: { children: ReactNode }) =>
    createElement("p", null, children),
}));

import {
  CreatePeopleGroupInviteDialog,
  getPeopleInviteErrorMessage,
  PeopleGroupCapacity,
  validatePeopleGroupCreation,
} from "./PeopleCapacity";

describe("People group capacity", () => {
  it.each([
    [3, 5, "available", "3 / 5 members", "Places available"],
    [5, 5, "full", "5 / 5 members", "Group is full"],
    [1, null, "maximum_not_set", "1 member", "Group maximum is not set"],
    [1, 5, "available", "1 member / 5 max", "Places available"],
    [20, null, "over_limit", "20 members", "over the 19-member limit"],
    [20, 19, "over_limit", "20 / 19 members", "over the 19-member limit"],
  ] as const)(
    "shows server count and %s capacity state",
    (count, maximum, state, countText, stateText) => {
      const html = renderToStaticMarkup(
        createElement(PeopleGroupCapacity, { count, maximum, state })
      );
      expect(html).toContain(countText);
      expect(html).toContain(stateText);
      if (maximum === null) expect(html).not.toMatch(/\d+ \/ \d+/);
    }
  );

  it("preserves exact full and unset server errors while falling back for unrelated errors", () => {
    expect(getPeopleInviteErrorMessage({ message: "Group is full" })).toBe(
      "Group is full"
    );
    expect(
      getPeopleInviteErrorMessage(
        new Error(
          "Group maximum is not set; set a maximum before adding members"
        )
      )
    ).toBe("Group maximum is not set");
    expect(
      getPeopleInviteErrorMessage({
        message: "This group has more than 19 active members.",
      })
    ).toContain("leader must remove members");
    expect(
      getPeopleInviteErrorMessage({
        message: "recipient is not accepting invitations",
      })
    ).toBe("This classmate is not currently accepting group invitations.");
  });
});

describe("People first invitation creation", () => {
  it("renders both required fields together with no preselected maximum or name", () => {
    const html = renderToStaticMarkup(
      createElement(CreatePeopleGroupInviteDialog, {
        peerName: "Alex",
        busy: false,
        serverError: "",
        onCancel: () => {},
        onSubmit: () => {},
        onCloseAutoFocus: () => {},
      })
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('for="people-group-name"');
    expect(html).toContain('for="people-group-maximum"');
    const nameInput =
      html.match(/<input id="people-group-name"[^>]*\/>/)?.[0] ?? "";
    const maximumInput =
      html.match(/<input id="people-group-maximum"[^>]*\/>/)?.[0] ?? "";
    for (const input of [nameInput, maximumInput]) {
      expect(input).toContain('required=""');
      expect(input).toContain('value=""');
    }
    expect(nameInput).toContain('name="groupName"');
    expect(maximumInput).toContain('name="maxMembers"');
    expect(maximumInput).toContain('type="number"');
    expect(maximumInput).toContain('min="2"');
    expect(maximumInput).toContain('max="19"');
    expect(maximumInput).toContain('step="1"');
    expect(html).toContain("19 is the upper limit, not a default");
    expect(html).toContain("Pending invitations do not reserve a place");
  });

  it.each(["", "1", "20", "2.5", "-2", "1e1", "abc", "9007199254740992"])(
    "rejects an absent or invalid maximum %s",
    maximum => {
      const result = validatePeopleGroupCreation("Group", maximum);
      expect(result.value).toBeNull();
      expect(result.errors.maximum).toBe("Enter a whole number from 2 to 19.");
    }
  );

  it.each(["2", "19"])("accepts explicitly entered boundary %s", maximum => {
    expect(validatePeopleGroupCreation("  Group name  ", maximum)).toEqual({
      errors: {},
      value: { name: "Group name", maxMembers: Number(maximum) },
    });
  });

  it.each(["", "   ", "x".repeat(51)])("rejects invalid group names", name => {
    expect(validatePeopleGroupCreation(name, "2").errors.name).toBeDefined();
    expect(validatePeopleGroupCreation(name, "2").value).toBeNull();
  });

  it("renders a server error and disables the form while sending", () => {
    const html = renderToStaticMarkup(
      createElement(CreatePeopleGroupInviteDialog, {
        peerName: "Alex",
        busy: true,
        serverError: "Group is full",
        onCancel: () => {},
        onSubmit: () => {},
        onCloseAutoFocus: () => {},
      })
    );
    expect(html).toContain('role="alert">Group is full');
    expect(html).toContain("Sending…");
    expect(html.match(/disabled=""/g)).toHaveLength(4);
  });
});
