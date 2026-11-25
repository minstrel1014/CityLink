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
  create: vi.fn(),
  createGroup: vi.fn(),
  edit: vi.fn(),
  stageError: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  loadOwn: vi.fn(),
  listGroups: vi.fn(),
  listPosts: vi.fn(),
  persistentRefs: false,
  refIndex: 0,
  refs: [] as Array<{ current: any }>,
  session: { status: "ready", user: { id: "user-1" } } as {
    status: string;
    user: { id: string } | null;
  },
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => {
      const index = mocks.stateIndex++;
      return [mocks.state[index], mocks.setters[index]];
    },
    useRef: (value: unknown) => {
      if (!mocks.persistentRefs) return { current: value };
      const index = mocks.refIndex++;
      return (mocks.refs[index] ??= { current: value });
    },
    useLayoutEffect: () => {},
    useEffect: (effect: () => void | (() => void)) => {
      mocks.effects.push(effect);
    },
  };
});
vi.mock("@/contexts/SupabaseSessionContext", () => ({
  useSupabaseSession: () => mocks.session,
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
  createGroupAlone: mocks.createGroup,
  getGroupWorkflowErrorMessage: mocks.groupError,
  loadOwnCourseGroupSnapshot: mocks.loadOwn,
  requestToJoinGroup: mocks.request,
}));
vi.mock("@/lib/supabaseCourses", () => ({
  loadCourseDirectory: vi.fn(async () => ({
    courses: [],
    enrolledCourseIds: [],
  })),
}));
vi.mock("@/lib/supabaseStage6", () => ({
  closeGroupRecruitmentPost: vi.fn(),
  createGroupRecruitmentPost: mocks.create,
  editGroupRecruitmentPost: mocks.edit,
  getStage6ErrorMessage: mocks.stageError,
  listCurrentTermCourseGroups: mocks.listGroups,
  listGroupRecruitmentPosts: mocks.listPosts,
  MAX_RECRUITMENT_POST_LENGTH: 2000,
}));

import GroupWorkspacePage, {
  GroupWorkspaceContent,
} from "./GroupWorkspacePage";
import { GroupWorkspaceScope } from "./GroupWorkspaceScope";
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
  editingPostId: string | null = null,
  options: {
    creatingGroupId?: string | null;
    draft?: string;
    subject?: string;
    scope?: GroupWorkspaceScope;
    busy?: string | null;
    ownGroupsStatus?: "loading" | "ready" | "error";
    noPosts?: boolean;
  } = {}
) {
  mocks.stateIndex = 0;
  mocks.effects = [];
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
              canCreatePost: false,
            },
          ]
        : [],
      groupsHasMore: false,
      groupsCursor: null,
      groupsState: "ready",
      groupsError: "",
      posts: options.noPosts ? [] : [post],
      postsHasMore: false,
      postsCursor: null,
      postsState: "ready",
      postsError: "",
      ownGroups: {
        status: options.ownGroupsStatus ?? "ready",
        groups: withGroup
          ? [
              {
                id: "own-1",
                course_id: "course-1",
                creator_id: "leader-2",
                status: "active",
                name: "My team",
                max_members: null,
                created_at: "2026-11-17T09:00:00.000Z",
              },
            ]
          : [],
      },
      token: { userId: "user-1", courseId: "course-1", generation: 0 },
    },
    "ready",
    "",
    0,
    "",
    options.busy ?? null,
    false,
    false,
    false,
    [],
    0,
    editingPostId,
    options.draft ?? "",
    options.subject ?? "",
    false,
    "", // courseLabel
    "", // groupSearch
  ];
  mocks.setters = mocks.state.map((_, index) =>
    vi.fn(value => {
      mocks.state[index] =
        typeof value === "function" ? value(mocks.state[index]) : value;
    })
  );
  return GroupWorkspaceContent({
    courseId: "course-1",
    userId: "user-1",
    sessionStatus: "ready",
    scope:
      options.scope ??
      new GroupWorkspaceScope({
        status: "ready",
        userId: "user-1",
        courseId: "course-1",
      }),
  });
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
  mocks.persistentRefs = false;
  mocks.refIndex = 0;
  mocks.refs = [];
  mocks.session = { status: "ready", user: { id: "user-1" } };
  mocks.request.mockResolvedValue("request-1");
  mocks.groupError.mockReturnValue("Group is full");
  mocks.stageError.mockReturnValue("Post error");
  mocks.create.mockResolvedValue("new-post");
  mocks.edit.mockResolvedValue("post-1");
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
    expect(mocks.request).toHaveBeenCalledWith(
      "user-1",
      "group-1",
      expect.any(Function)
    );
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

describe("context-keyed form reset (isolated render mocks)", () => {
  it("keys the content tree by session readiness, account and course", () => {
    const original = GroupWorkspacePage({ courseId: "course-1" }).key;
    const otherCourse = GroupWorkspacePage({ courseId: "course-2" }).key;
    mocks.session = { status: "ready", user: { id: "user-2" } };
    const otherAccount = GroupWorkspacePage({ courseId: "course-1" }).key;
    mocks.session = { status: "loading", user: null };
    const loading = GroupWorkspacePage({ courseId: "course-1" }).key;
    expect(new Set([original, otherCourse, otherAccount, loading]).size).toBe(
      4
    );
  });
});

describe("actual load effect with mocked services", () => {
  const ownGroup = {
    id: "own-1",
    course_id: "course-1",
    creator_id: "leader-2",
    status: "active",
    name: "My team",
    max_members: null,
    created_at: "2026-11-17T09:00:00Z",
  };
  const ownMember = {
    id: "member-1",
    group_id: "own-1",
    course_id: "course-1",
    profile_id: "user-1",
    membership_status: "active",
    display_name_snapshot: "Student",
    joined_at: "2026-11-17T09:00:00Z",
  };
  const browse = {
    groupId: "group-1",
    groupName: "Design team",
    status: "active",
    activeMemberCount: 2,
    maxMembers: 2,
    capacityCount: 2,
    capacityState: "full",
    canCreatePost: false,
  };
  const page = (items: unknown[]) => ({
    items,
    hasMore: false,
    nextCursor: null,
  });
  function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }
  const own = () => ({
    groups: [ownGroup],
    memberships: [ownMember],
    incomingInvitations: [],
    outgoingInvitations: [],
    joinRequests: [],
  });
  const initialContext = {
    status: "ready",
    userId: "user-1",
    courseId: "course-1",
  };
  function arrange() {
    mocks.listGroups.mockResolvedValue(page([browse]));
    mocks.listPosts.mockResolvedValue(page([availablePost()]));
    mocks.loadOwn.mockResolvedValue(own());
  }
  function mount(
    scope = new GroupWorkspaceScope(initialContext),
    context = initialContext
  ) {
    mocks.persistentRefs = true;
    mocks.refIndex = 0;
    mocks.refs = [];
    mocks.state = [
      null,
      "loading",
      "",
      0,
      "",
      null,
      false,
      false,
      false,
      [],
      0,
      null,
      "",
      "",
      false,
      "", // courseLabel
      "", // groupSearch
      false, // createPostOpen
      "", // createSubject
      "", // createBody
      "", // createGroupId
      false, // newGroupOpen
      "", // newGroupName
      6, // newGroupMax
    ];
    mocks.setters = mocks.state.map((_, index) =>
      vi.fn(value => {
        mocks.state[index] =
          typeof value === "function" ? value(mocks.state[index]) : value;
      })
    );
    const setters = mocks.setters;
    const render = () => {
      mocks.stateIndex = 0;
      mocks.refIndex = 0;
      mocks.effects = [];
      return GroupWorkspaceContent({
        courseId: context.courseId,
        userId: context.userId,
        sessionStatus: context.status,
        scope,
      });
    };
    render();
    const cleanup = mocks.effects[0]();
    return { render, cleanup, setters, scope };
  }
  const nodes = (instance: ReturnType<typeof mount>) =>
    descendants(instance.render());
  const status = (instance: ReturnType<typeof mount>, title: string) =>
    nodes(instance).find(node => node.props.title === title);
  const button = (instance: ReturnType<typeof mount>, text: string) =>
    nodes(instance).find(
      node => node.type === "button" && node.props.children === text
    );
  const hasHeading = (instance: ReturnType<typeof mount>, text: string) =>
    nodes(instance).some(
      node => node.type === "h3" && node.props.children === text
    );

  it("shows each browse response while the own-group read is still pending", async () => {
    arrange();
    const ownWait = pending<ReturnType<typeof own>>();
    const postsWait = pending<ReturnType<typeof page>>();
    mocks.loadOwn.mockReturnValueOnce(ownWait.promise);
    mocks.listPosts.mockReturnValueOnce(postsWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    expect(status(instance, "Loading recruitment posts…")).toBeDefined();
    expect(mocks.loadOwn).toHaveBeenCalledWith("user-1", "course-1");
    expect(mocks.listGroups).toHaveBeenCalledWith("user-1", "course-1");
    expect(mocks.listPosts).toHaveBeenCalledWith("user-1", "course-1");
    postsWait.resolve(page([availablePost()]));
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Looking for a teammate")).toBe(true)
    );
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    ownWait.resolve(own());
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    instance.cleanup?.();
  });

  it("preserves each list when the own-group read completes before the lists", async () => {
    arrange();
    const groupsWait = pending<ReturnType<typeof page>>();
    const postsWait = pending<ReturnType<typeof page>>();
    mocks.listGroups.mockReturnValueOnce(groupsWait.promise);
    mocks.listPosts.mockReturnValueOnce(postsWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(status(instance, "Loading browseable groups…")).toBeDefined();
    expect(status(instance, "Loading recruitment posts…")).toBeDefined();
    postsWait.resolve(page([availablePost()]));
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Looking for a teammate")).toBe(true)
    );
    expect(status(instance, "Loading browseable groups…")).toBeDefined();
    groupsWait.resolve(page([browse]));
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    instance.cleanup?.();
  });

  it("keeps the own-group card when it arrives before both lists", async () => {
    arrange();
    const groupsWait = pending<ReturnType<typeof page>>();
    const postsWait = pending<ReturnType<typeof page>>();
    mocks.listGroups.mockReturnValueOnce(groupsWait.promise);
    mocks.listPosts.mockReturnValueOnce(postsWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(status(instance, "Loading browseable groups…")).toBeDefined();
    expect(status(instance, "Loading recruitment posts…")).toBeDefined();
    groupsWait.resolve(page([browse]));
    postsWait.resolve(page([availablePost()]));
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    expect(button(instance, "Create recruitment post")).toBeDefined();
    instance.cleanup?.();
  });

  it("never claims an empty list before the list read settles", async () => {
    arrange();
    const groupsWait = pending<ReturnType<typeof page>>();
    const postsWait = pending<ReturnType<typeof page>>();
    mocks.listGroups.mockReturnValueOnce(groupsWait.promise);
    mocks.listPosts.mockReturnValueOnce(postsWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(status(instance, "No browseable groups yet")).toBeUndefined();
    expect(status(instance, "No recruitment posts yet")).toBeUndefined();
    groupsWait.resolve(page([]));
    postsWait.resolve(page([]));
    await vi.waitFor(() =>
      expect(status(instance, "No browseable groups yet")).toBeDefined()
    );
    expect(status(instance, "No recruitment posts yet")).toBeDefined();
    expect(
      status(instance, "Browseable groups could not be confirmed")
    ).toBeUndefined();
    expect(
      status(instance, "Recruitment posts could not be confirmed")
    ).toBeUndefined();
    instance.cleanup?.();
  });

  it.each(["groups", "posts"])(
    "isolates a %s list failure and its retry from the other list and the own-group read",
    async failed => {
      arrange();
      if (failed === "groups")
        mocks.listGroups.mockRejectedValueOnce(new Error("failed"));
      else mocks.listPosts.mockRejectedValueOnce(new Error("failed"));
      const instance = mount();
      const title =
        failed === "groups"
          ? "Group discovery is unavailable"
          : "Recruitment posts are unavailable";
      await vi.waitFor(() => expect(status(instance, title)).toBeDefined());
      await vi.waitFor(() =>
        expect(button(instance, "Create recruitment post")).toBeDefined()
      );
      expect(
        hasHeading(
          instance,
          failed === "groups" ? "Looking for a teammate" : "Design team"
        )
      ).toBe(true);
      status(instance, title)!.props.retry();
      await vi.waitFor(() =>
        expect(
          hasHeading(
            instance,
            failed === "groups" ? "Design team" : "Looking for a teammate"
          )
        ).toBe(true)
      );
      expect(mocks.loadOwn).toHaveBeenCalledTimes(1);
      instance.cleanup?.();
    }
  );

  it("merges a page completed after the own-group read without losing either update", async () => {
    arrange();
    const ownWait = pending<ReturnType<typeof own>>();
    const nextWait = pending<ReturnType<typeof page>>();
    mocks.loadOwn.mockReturnValueOnce(ownWait.promise);
    mocks.listGroups
      .mockResolvedValueOnce({
        ...page([browse]),
        hasMore: true,
        nextCursor: { createdAt: "2026-11-17", id: "group-1" },
      })
      .mockReturnValueOnce(nextWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Load more groups")).toBeDefined()
    );
    button(instance, "Load more groups")!.props.onClick();
    ownWait.resolve(own());
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    nextWait.resolve(
      page([{ ...browse, groupId: "group-2", groupName: "Second team" }])
    );
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Second team")).toBe(true)
    );
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(button(instance, "Create recruitment post")).toBeDefined();
    instance.cleanup?.();
  });

  it("hides the Your group section and offers creation at the foot of the posts section", async () => {
    arrange();
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(hasHeading(instance, "Your group")).toBe(false);
    expect(
      nodes(instance).some(node => node.props.children === "YOUR GROUP")
    ).toBe(false);
    expect(hasHeading(instance, "Design team")).toBe(true);
    instance.cleanup?.();
  });

  it("asks for a group instead of offering creation when the student has none", async () => {
    arrange();
    mocks.loadOwn.mockResolvedValue({ groups: [], memberships: [] });
    const instance = mount();
    await vi.waitFor(() =>
      expect(
        nodes(instance).some(
          node => node.props.className === "stage6-create-post-note"
        )
      ).toBe(true)
    );
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(
      JSON.stringify(nodes(instance)).includes(
        "You need a group in this course before you can publish a recruitment post."
      )
    ).toBe(true);
    expect(button(instance, "Create a group")).toBeDefined();
    instance.cleanup?.();
  });

  it("creates a group for the student without inviting anyone", async () => {
    arrange();
    mocks.loadOwn.mockResolvedValue({ groups: [], memberships: [] });
    mocks.createGroup.mockResolvedValue("new-group");
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create a group")).toBeDefined()
    );
    button(instance, "Create a group")!.props.onClick();
    const form = nodes(instance).find(
      node => node.props.className === "stage6-create-group-form"
    );
    expect(form).toBeDefined();
    form!.props.onSubmit({ preventDefault: () => {} });
    await vi.waitFor(() => expect(mocks.createGroup).toHaveBeenCalled());
    expect(mocks.createGroup).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      "",
      6,
      expect.any(Function)
    );
    instance.cleanup?.();
  });

  it("publishes a recruitment post for the student's own group", async () => {
    arrange();
    const instance = mount();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    button(instance, "Create recruitment post")!.props.onClick();
    const form = nodes(instance).find(node => node.type === "form");
    expect(form).toBeDefined();
    mocks.state[18] = "Need a designer";
    mocks.state[19] = "We need a designer for the project.";
    // Re-render so the submit handler closes over the typed values.
    const filled = nodes(instance).find(node => node.type === "form");
    expect(filled).toBeDefined();
    filled!.props.onSubmit({ preventDefault: () => {} });
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith(
      "user-1",
      "own-1",
      "Need a designer",
      "We need a designer for the project.",
      expect.any(Function)
    );
    instance.cleanup?.();
  });

  it("shows the failure line instead of an empty result when the own-group read fails", async () => {
    arrange();
    mocks.loadOwn.mockRejectedValueOnce(new Error("own groups unavailable"));
    const instance = mount();
    await vi.waitFor(() =>
      expect(
        nodes(instance).some(
          node => node.props.children === "Your group could not be loaded."
        )
      ).toBe(true)
    );
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    // The two browse lists are independent reads and still render.
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    instance.cleanup?.();
  });

  it.each([
    [
      "account",
      "success",
      { status: "ready", userId: "user-2", courseId: "course-1" },
    ],
    [
      "account",
      "rejection",
      { status: "ready", userId: "user-2", courseId: "course-1" },
    ],
    [
      "course",
      "success",
      { status: "ready", userId: "user-1", courseId: "course-2" },
    ],
    [
      "course",
      "rejection",
      { status: "ready", userId: "user-1", courseId: "course-2" },
    ],
  ])(
    "does not apply delayed old list or %s-switch evidence %s",
    async (_, outcome, next) => {
      arrange();
      const oldGroups = pending<ReturnType<typeof page>>();
      const oldPosts = pending<ReturnType<typeof page>>();
      const oldOwn = pending<ReturnType<typeof own>>();
      mocks.listGroups.mockReturnValueOnce(oldGroups.promise);
      mocks.listPosts.mockReturnValueOnce(oldPosts.promise);
      mocks.loadOwn.mockReturnValueOnce(oldOwn.promise);
      const scope = new GroupWorkspaceScope(initialContext);
      const previous = mount(scope);
      await vi.waitFor(() => expect(mocks.loadOwn).toHaveBeenCalledTimes(1));
      scope.updateContext(next);
      for (const setter of previous.setters) setter.mockClear();
      // The keyed content tree is remounted with the new identity.
      mocks.loadOwn.mockResolvedValue({ groups: [], memberships: [] });
      mocks.listGroups.mockResolvedValue(
        page([{ ...browse, groupName: "New context team" }])
      );
      mocks.listPosts.mockResolvedValue(page([]));
      const current = mount(scope, next);
      await vi.waitFor(() =>
        expect(hasHeading(current, "New context team")).toBe(true)
      );
      oldGroups.resolve(page([browse]));
      oldPosts.resolve(page([availablePost()]));
      if (outcome === "success") oldOwn.resolve(own());
      else oldOwn.reject(new Error("stale own-group failure"));
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const setter of previous.setters)
        expect(setter).not.toHaveBeenCalled();
      expect(hasHeading(current, "New context team")).toBe(true);
      expect(hasHeading(current, "Design team")).toBe(false);
      expect(hasHeading(current, "My team")).toBe(false);
      expect(hasHeading(current, "Looking for a teammate")).toBe(false);
      previous.cleanup?.();
      current.cleanup?.();
    }
  );
});
