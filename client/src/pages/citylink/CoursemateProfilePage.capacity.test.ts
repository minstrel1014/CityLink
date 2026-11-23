import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Vitest's SSR transform compiles this page's JSX with the classic runtime
// (React.createElement). CoursemateProfilePage.tsx intentionally imports only
// named hooks, so the harness exposes the namespace here for direct-invocation
// tests without changing production imports.
(globalThis as { React?: typeof import("react") }).React = React;

const mocks = vi.hoisted(() => ({
  state: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  stateIndex: 0,
  effects: [] as Array<() => void | (() => void)>,
  session: {
    status: "ready",
    user: { id: "user-1" },
    authGeneration: 0,
  } as {
    status: string;
    user: { id: string } | null;
    authGeneration?: number;
  },
  sendInvitation: vi.fn(),
  createGroupAndInvite: vi.fn(),
  listMembers: vi.fn(),
  loadSnapshot: vi.fn(),
  listCandidates: vi.fn(),
  loadProfile: vi.fn(),
  loadDirectory: vi.fn(),
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => {
      const index = mocks.stateIndex++;
      return [mocks.state[index], mocks.setters[index]];
    },
    useRef: (value: unknown) => ({ current: value }),
    useEffect: (effect: () => void | (() => void)) => {
      mocks.effects.push(effect);
    },
  };
});
vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: () => mocks.session,
}));
vi.mock("@/lib/supabaseCourses", () => ({
  getCourseDirectoryErrorMessage: vi.fn(() => "Directory error"),
  loadCourseDirectory: mocks.loadDirectory,
}));
vi.mock("@/lib/supabaseGroups", () => ({
  createGroupAndInvite: mocks.createGroupAndInvite,
  getGroupWorkflowErrorMessage: vi.fn(
    (error: unknown) =>
      String((error as { message?: string })?.message ?? "Workflow error")
  ),
  listActiveGroupMembers: mocks.listMembers,
  listCourseGroupInviteCandidates: mocks.listCandidates,
  loadGroupWorkflowSnapshot: mocks.loadSnapshot,
  sendGroupInvitation: mocks.sendInvitation,
}));
vi.mock("@/lib/supabaseStage6", () => ({
  getCurrentTermCoursemateProfile: mocks.loadProfile,
  getStage6ErrorMessage: vi.fn(() => "Stage error"),
}));
vi.mock("@/lib/supabaseProfile", () => ({
  getProfileInitials: () => "PP",
}));
vi.mock("@/components/citylink/AppShell", () => ({
  default: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/components/citylink/Shared", () => ({
  CourseIcon: () => null,
}));
vi.mock("./PeopleCapacity", () => ({
  CreatePeopleGroupInviteDialog: () => null,
}));
vi.mock("./Stage6Layout", () => ({
  Stage6Status: ({ title }: { title?: string }) => title ?? null,
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children?: ReactNode }) => children,
}));

import CoursemateProfilePage, {
  getPortfolioInviteCapacity,
  portfolioInviteCapacityGuidance,
  portfolioInviteCapacityMessage,
} from "./CoursemateProfilePage";
import type {
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

const group = (overrides: Partial<StudyGroupRow> = {}): StudyGroupRow => ({
  id: "group-1",
  course_id: "course-1",
  creator_id: "leader-2",
  status: "active",
  name: "Study team",
  max_members: 5,
  created_at: "2026-11-19T00:00:00Z",
  ...overrides,
});

const member = (id: string): GroupMembershipRow => ({
  id,
  group_id: "group-1",
  course_id: "course-1",
  profile_id: id,
  display_name_snapshot: "Member",
  membership_status: "active",
  joined_at: "2026-11-19T00:00:00Z",
});

const roster = (count: number) =>
  Array.from({ length: count }, (_, index) => member(`member-${index}`));

const snapshotWith = (groups: StudyGroupRow[]) => ({
  profile: {
    profileId: "peer-1",
    displayName: "Peer Person",
    major: "Design",
    year: 3,
    bio: "",
    skills: ["Figma"],
  },
  course: { id: "course-1", code: "CS101", title: "Intro To Design" },
  inviteGroups: groups,
  invitationState: null,
  canInvite: true,
  inviteError: "",
});

type Scenario = {
  groups?: StudyGroupRow[];
  rosters?: Record<string, GroupMembershipRow[] | null>;
  chosen?: string;
};

function flatten(node: ReactNode): ReactElement[] {
  if (node == null || typeof node === "string" || typeof node === "number") {
    return [];
  }
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isValidElement(node)) return [];
  if (typeof node.type === "function") {
    return flatten((node.type as (props: unknown) => ReactNode)(node.props));
  }
  const children = (node.props as { children?: ReactNode }).children;
  return [node, ...flatten(children)];
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function mount(scenario: Scenario = {}) {
  mocks.stateIndex = 0;
  mocks.effects = [];
  const groups = scenario.groups ?? [group()];
  mocks.state = [
    snapshotWith(groups),
    false,
    "",
    0,
    false,
    scenario.chosen ?? "",
    null,
    false,
    "",
    scenario.rosters ?? {},
  ];
  mocks.setters = mocks.state.map((_, index) =>
    vi.fn(value => {
      mocks.state[index] =
        typeof value === "function" ? value(mocks.state[index]) : value;
    })
  );
  const render = () => {
    mocks.stateIndex = 0;
    mocks.effects = [];
    const root = CoursemateProfilePage({
      courseId: "course-1",
      profileId: "peer-1",
    });
    const nodes = flatten(root);
    const buttons = nodes.filter(node => node.type === "button");
    const send = buttons.find(
      node => node.type === "button" && /invite/i.test(textOf(node))
    ) as ReactElement<{
      disabled?: boolean;
      onClick?: () => void;
      title?: string;
    }>;
    const statusHints = nodes
      .filter(
        node =>
          node.type === "p" &&
          (node.props as { role?: string }).role === "status"
      )
      .map(node => textOf((node.props as { children?: ReactNode }).children));
    const guidance = nodes
      .filter(
        node =>
          node.type === "p" &&
          (node.props as { role?: string }).role === "note"
      )
      .map(node => textOf((node.props as { children?: ReactNode }).children));
    const options = nodes
      .filter(node => node.type === "option")
      .map(node => ({
        value: (node.props as { value?: string }).value,
        disabled: (node.props as { disabled?: boolean }).disabled,
        text: textOf((node.props as { children?: ReactNode }).children),
      }));
    return { nodes, buttons, send, options, statusHints, guidance };
  };
  const first = render();
  return {
    ...first,
    render,
    // Callback order in the page: session guard, data load, roster precheck.
    effects: () => mocks.effects,
    feedback: () => mocks.state[6] as { tone: string; message: string } | null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("portfolio invite capacity helpers", () => {
  it("counts a forming creator as one only for that exact case", () => {
    expect(
      getPortfolioInviteCapacity(
        group({ status: "forming", creator_id: "user-1", max_members: 2 }),
        [],
        "user-1"
      )
    ).toEqual({ count: 1, maximum: 2 });
  });

  it("never fabricates a count after a failed roster read", () => {
    expect(
      getPortfolioInviteCapacity(group({ max_members: 2 }), null, "user-1")
    ).toEqual({ count: null, maximum: 2 });
  });

  it("keeps exact labels separate from helper guidance", () => {
    expect(portfolioInviteCapacityMessage("full", 5, 5)).toBe("Group is full");
    expect(portfolioInviteCapacityMessage("maximum_not_set", 1, null)).toBe(
      "Group maximum is not set"
    );
    expect(portfolioInviteCapacityMessage("over_limit", 20, 19)).toBe(
      "This group has more than 19 active members. The leader must remove members before anyone can be added."
    );
    expect(portfolioInviteCapacityGuidance("full", 5, 5)).toContain(
      "This group has 5/5 active members"
    );
  });
});

describe("portfolio invite wiring (isolated render mocks)", () => {
  it("disables Send invite without an RPC while the full roster is loading", () => {
    const view = mount();
    expect(view.send.props.disabled).toBe(true);
    expect(view.statusHints).toContain("Checking group capacity…");
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
    // Matches the established coursemates pattern: a stale click while the
    // roster is loading reports the capacity status instead of dispatching.
    expect(view.feedback()).toEqual({
      tone: "error",
      message: "Checking group capacity…",
    });
  });

  it("fails closed when the roster read failed", () => {
    const view = mount({ rosters: { "group-1": null } });
    expect(view.send.props.disabled).toBe(true);
    expect(view.statusHints).toContain(
      "Group capacity could not be verified. Refresh the page before inviting."
    );
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("shows the exact full label and blocks the request", () => {
    const view = mount({ rosters: { "group-1": roster(5) } });
    expect(view.send.props.disabled).toBe(true);
    expect(view.statusHints).toContain("Group is full");
    expect(view.guidance).toContain(
      "This group has 5/5 active members. The leader must open a place before you can invite."
    );
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("shows the exact unset-maximum label and blocks the request", () => {
    const view = mount({
      groups: [group({ max_members: null })],
      rosters: { "group-1": roster(1) },
    });
    expect(view.send.props.disabled).toBe(true);
    expect(view.statusHints).toContain("Group maximum is not set");
    expect(view.guidance).toContain(
      "The leader must set a maximum from 2 to 19 before anyone can be invited."
    );
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("permits and dispatches the existing service call when a seat is available", async () => {
    const view = mount({ rosters: { "group-1": roster(3) } });
    expect(view.send.props.disabled).toBe(false);
    expect(view.statusHints).toEqual([]);
    view.send.props.onClick?.();
    await vi.waitFor(() => expect(mocks.sendInvitation).toHaveBeenCalledTimes(1));
    expect(mocks.sendInvitation).toHaveBeenCalledWith(
      "user-1",
      "group-1",
      "peer-1",
      expect.any(Function)
    );
    await vi.waitFor(() =>
      expect(view.feedback()?.message).toBe(
        "Invitation sent. It stays pending until your coursemate responds."
      )
    );
  });

  it("counts the forming creator as one seat and dispatches", () => {
    const view = mount({
      groups: [
        group({
          status: "forming",
          creator_id: "user-1",
          max_members: 2,
        }),
      ],
      rosters: { "group-1": [] },
    });
    expect(view.send.props.disabled).toBe(false);
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).toHaveBeenCalledTimes(1);
  });

  it("gates each option of the multi-group picker on its own roster", () => {
    const view = mount({
      groups: [
        group({ id: "group-1", name: "Full team" }),
        group({ id: "group-2", name: "Open team" }),
      ],
      rosters: { "group-1": roster(5), "group-2": roster(3) },
    });
    expect(view.statusHints).toEqual([]);
    expect(view.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "group-1",
          disabled: true,
          text: expect.stringContaining("Group is full"),
        }),
        expect.objectContaining({
          value: "group-2",
          disabled: false,
        }),
      ])
    );
    expect(view.send.props.disabled).toBe(true);
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("blocks dispatch against an unknown roster even after a seat was chosen", () => {
    const view = mount({
      groups: [
        group({ id: "group-1", name: "Full team" }),
        group({ id: "group-2", name: "Open team" }),
      ],
      rosters: { "group-1": roster(5), "group-2": null },
      chosen: "group-2",
    });
    expect(view.statusHints).toContain(
      "Group capacity could not be verified. Refresh the page before inviting."
    );
    expect(view.send.props.disabled).toBe(true);
    view.send.props.onClick?.();
    expect(mocks.sendInvitation).not.toHaveBeenCalled();
  });

  it("reloads a failed roster and re-enables dispatch on retry", async () => {
    const view = mount();
    expect(view.send.props.disabled).toBe(true);
    const rosterEffect = () => view.effects()[2];
    mocks.listMembers.mockRejectedValueOnce(new Error("network down"));
    await rosterEffect()();
    await vi.waitFor(() =>
      expect(mocks.state[9]).toEqual({ "group-1": null })
    );
    const failed = view.render();
    expect(failed.statusHints).toContain(
      "Group capacity could not be verified. Refresh the page before inviting."
    );
    expect(failed.send.props.disabled).toBe(true);
    // The refresh path bumps the reload token; the precheck re-runs.
    mocks.state[3] = 1;
    mocks.listMembers.mockResolvedValue(roster(3));
    await rosterEffect()();
    await vi.waitFor(() =>
      expect(mocks.state[9]).toEqual({ "group-1": roster(3) })
    );
    const retried = view.render();
    expect(retried.statusHints).toEqual([]);
    expect(retried.send.props.disabled).toBe(false);
    retried.send.props.onClick?.();
    await vi.waitFor(() =>
      expect(mocks.sendInvitation).toHaveBeenCalledTimes(1)
    );
  });

  it("keeps the server Group is full error visible after dispatch", async () => {
    const view = mount({ rosters: { "group-1": roster(3) } });
    mocks.sendInvitation.mockRejectedValue(new Error("Group is full"));
    expect(view.send.props.disabled).toBe(false);
    view.send.props.onClick?.();
    await vi.waitFor(() =>
      expect(view.feedback()?.message).toBe("Group is full")
    );
    expect(view.feedback()?.tone).toBe("error");
    expect(mocks.sendInvitation).toHaveBeenCalledTimes(1);
  });
});
