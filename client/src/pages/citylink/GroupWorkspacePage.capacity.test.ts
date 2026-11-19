import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRecruitmentPost } from "@/lib/supabaseStage6";

const mocks = vi.hoisted(() => ({
  state: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  stateIndex: 0,
  request: vi.fn(),
  groupError: vi.fn(),
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
    useEffect: () => {},
  };
});
vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: () => ({ status: "ready", user: { id: "user-1" } }),
}));
vi.mock("@/pages/citylink/AuthenticatedCoursePeers", () => ({
  default: () => null,
}));
vi.mock("@/components/citylink/Shared", () => ({ PageHeading: () => null }));
vi.mock("@/components/citylink/GroupNavigationLinks", () => ({
  GroupChatLink: () => null,
}));
vi.mock("wouter", () => ({ Link: () => null }));
vi.mock("./Stage6Layout", () => ({
  Stage6Layout: () => null,
  Stage6Status: () => null,
}));
vi.mock("@/lib/supabaseGroups", () => ({
  getGroupWorkflowErrorMessage: mocks.groupError,
  loadGroupWorkflowSnapshot: vi.fn(),
  requestToJoinGroup: mocks.request,
}));
vi.mock("@/lib/supabaseStage6", () => ({
  closeGroupRecruitmentPost: vi.fn(),
  createGroupRecruitmentPost: vi.fn(),
  editGroupRecruitmentPost: vi.fn(),
  getStage6ErrorMessage: vi.fn(),
  listCurrentTermCourseGroups: vi.fn(),
  listGroupRecruitmentPosts: vi.fn(),
  MAX_RECRUITMENT_POST_LENGTH: 2000,
}));

import GroupWorkspacePage from "./GroupWorkspacePage";
import {
  Stage6ApplyControl,
  Stage6CapacityCount,
  Stage6CapacityStatus,
} from "./Stage6Capacity";

const availablePost = (): GroupRecruitmentPost => ({
  id: "post-1",
  groupId: "group-1",
  groupName: "Design team",
  activeMemberCount: 3,
  maxMembers: 5,
  capacityCount: 3,
  capacityState: "available",
  authorName: "A Student",
  subject: "Looking for a teammate",
  body: "Looking for a designer.",
  status: "open",
  createdAt: "2026-11-17T09:00:00.000Z",
  updatedAt: "2026-11-17T09:00:00.000Z",
  closedAt: null,
  applyEnabled: true,
  applyBlockReason: null,
  canManage: false,
});

function pageWith(
  post: GroupRecruitmentPost,
  withGroup = true,
  editingPostId: string | null = null
) {
  mocks.stateIndex = 0;
  mocks.state = [
    {
      groups: withGroup
        ? [
            {
              groupId: "group-1",
              groupName: "Design team",
              status: "active",
              activeMemberCount: 5,
              maxMembers: 5,
              capacityCount: 5,
              capacityState: "full",
              canCreatePost: true,
            },
          ]
        : [],
      groupsHasMore: false,
      groupsCursor: null,
      posts: [post],
      postsHasMore: false,
      postsCursor: null,
      ownGroups: [],
      activeGroupIds: [],
      userId: "user-1",
      generation: 0,
    },
    "ready",
    "",
    0,
    "",
    null,
    false,
    false,
    null,
    editingPostId,
    "",
    "",
  ];
  mocks.setters = mocks.state.map(() => vi.fn());
  return GroupWorkspacePage({ courseId: "course-1" });
}

function descendants(node: ReactNode): ReactElement<any>[] {
  if (!isValidElement(node)) return [];
  const children: ReactElement<any>[] = [];
  Children.forEach((node.props as { children?: ReactNode }).children, child => {
    children.push(...descendants(child));
  });
  return [node, ...children];
}

function applicationButton(page: ReactElement) {
  const control = descendants(page).find(
    element => element.type === Stage6ApplyControl
  );
  expect(control).toBeDefined();
  const rendered = Stage6ApplyControl(control!.props);
  const button = descendants(rendered).find(
    element => element.type === "button"
  );
  expect(button).toBeDefined();
  return button! as ReactElement<{ disabled: boolean; onClick: () => void }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue("request-1");
  mocks.groupError.mockReturnValue("Group is full");
});

describe("workspace capacity integration (isolated mocks)", () => {
  it("wires full cards to capacity controls and blocks the request without changing post actions", () => {
    const post: GroupRecruitmentPost = {
      ...availablePost(),
      activeMemberCount: 5,
      capacityCount: 5,
      capacityState: "full",
      applyEnabled: false,
      applyBlockReason: "group_full",
      canManage: true,
    };
    const page = pageWith(post);
    const nodes = descendants(page);
    expect(
      nodes
        .filter(node => node.type === Stage6CapacityCount)
        .map(node => node.props)
    ).toEqual([
      { count: 5, maximum: 5 },
      { count: 5, maximum: 5 },
    ]);
    expect(
      nodes
        .filter(node => node.type === Stage6CapacityStatus)
        .map(node => node.props.state)
    ).toEqual(["full", "full"]);
    const button = applicationButton(page);
    expect(button.props.disabled).toBe(true);
    button.props.onClick();
    expect(mocks.request).not.toHaveBeenCalled();
    const textButtons = nodes
      .filter(node => node.type === "button")
      .map(node => node.props.children);
    expect(textButtons).toContain("Create recruitment post");
    expect(textButtons).toContain("Edit post");
    expect(
      textButtons.some(children =>
        Array.isArray(children)
          ? children.includes("Close post")
          : children === "Close post"
      )
    ).toBe(true);
  });

  it("routes an available application's race error through the existing group mapper", async () => {
    const raceError = { message: "Group is full" };
    mocks.request.mockRejectedValueOnce(raceError);
    const button = applicationButton(pageWith(availablePost()));
    expect(button.props.disabled).toBe(false);
    button.props.onClick();
    await vi.waitFor(() =>
      expect(mocks.groupError).toHaveBeenCalledWith(raceError)
    );
    expect(mocks.request).toHaveBeenCalledWith("user-1", "group-1");
    expect(mocks.setters[4]).toHaveBeenCalledWith("Group is full");
  });

  it("keeps successful requests on the existing pending-review path", async () => {
    const button = applicationButton(pageWith(availablePost()));
    button.props.onClick();
    await vi.waitFor(() =>
      expect(mocks.setters[4]).toHaveBeenCalledWith(
        "Join request sent. The group’s authorized reviewer still needs to decide; you are not added automatically."
      )
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.groupError).not.toHaveBeenCalled();
  });

  it("renders no capacity data or actionable apply for a redacted terminal post", () => {
    const post: GroupRecruitmentPost = {
      ...availablePost(),
      groupId: null,
      groupName: null,
      activeMemberCount: null,
      maxMembers: null,
      capacityCount: null,
      capacityState: null,
      status: "closed",
      applyEnabled: false,
      applyBlockReason: "group_inactive",
      canManage: false,
    };
    const page = pageWith(post, false, post.id);
    const nodes = descendants(page);
    expect(
      nodes.some(
        node =>
          node.type === Stage6CapacityCount ||
          node.type === Stage6CapacityStatus
      )
    ).toBe(false);
    expect(nodes.some(node => node.type === "form")).toBe(false);
    const button = applicationButton(page);
    expect(button.props.disabled).toBe(true);
    button.props.onClick();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
