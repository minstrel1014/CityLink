import { describe, expect, it } from "vitest";
import { sumUnreadCounts } from "@/lib/directMessageBadge";

describe("sumUnreadCounts", () => {
  it("adds the unread counts of every thread", () => {
    expect(sumUnreadCounts([{ unreadCount: 2 }, { unreadCount: 3 }])).toBe(5);
  });

  it("returns zero for an empty or fully read inbox", () => {
    expect(sumUnreadCounts([])).toBe(0);
    expect(sumUnreadCounts([{ unreadCount: 0 }, { unreadCount: 0 }])).toBe(0);
  });

  it("ignores negative and non-finite counts", () => {
    expect(
      sumUnreadCounts([
        { unreadCount: -4 },
        { unreadCount: Number.NaN },
        { unreadCount: 1 },
      ])
    ).toBe(1);
  });
});
