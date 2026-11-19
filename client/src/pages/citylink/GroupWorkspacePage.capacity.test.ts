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
  edit: vi.fn(),
  stageError: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  loadOwn: vi.fn(),
  loadCourseEligibility: vi.fn(),
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
  getGroupWorkflowErrorMessage: mocks.groupError,
  loadOwnCourseGroupSnapshot: mocks.loadOwn,
  requestToJoinGroup: mocks.request,
}));
vi.mock("@/lib/supabaseCourses", () => ({
  hasCurrentTermCourseEnrollment: mocks.loadCourseEligibility,
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
    verified?: boolean;
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
      eligibility: {
        status: "complete",
        verified: options.verified ?? true,
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
    options.creatingGroupId ?? null,
    editingPostId,
    options.draft ?? "",
    options.subject ?? "",
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

describe("own-group recruitment form (isolated render mocks)", () => {
  function formFor(page: ReactElement) {
    const form = descendants(page).find(
      node =>
        node.type === "form" &&
        descendants(node).some(
          child =>
            child.type === "input" &&
            child.props.id === "new-post-subject-own-1"
        )
    );
    expect(form).toBeDefined();
    return form!;
  }

  function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  it("shows creation only in the own-group area, not on the other browseable group", () => {
    const nodes = descendants(pageWith(availablePost()));
    const own = nodes.find(
      node =>
        node.type === "section" &&
        node.props["aria-labelledby"] === "stage6-your-group-heading"
    )!;
    const browse = nodes.find(
      node =>
        node.type === "section" &&
        node.props["aria-labelledby"] === "stage6-groups-heading"
    )!;
    expect(
      descendants(own).some(
        node => node.type === "h3" && node.props.children === "My team"
      )
    ).toBe(true);
    expect(
      descendants(own).some(
        node =>
          node.type === "button" &&
          node.props.children === "Create recruitment post"
      )
    ).toBe(true);
    expect(
      descendants(browse).some(
        node => node.type === "h3" && node.props.children === "Design team"
      )
    ).toBe(true);
    expect(
      descendants(browse).some(
        node =>
          node.type === "button" &&
          node.props.children === "Create recruitment post"
      )
    ).toBe(false);
  });

  it("offers retry rather than falsely claiming no group when evidence is unverified", () => {
    const nodes = descendants(
      pageWith(availablePost(), true, null, { verified: false })
    );
    const status = nodes.find(
      node => node.props.title === "Posting eligibility could not be verified"
    );
    expect(status).toBeDefined();
    expect(typeof status!.props.retry).toBe("function");
    expect(
      nodes.some(
        node => node.props.title === "No eligible group found in this view"
      )
    ).toBe(false);
    expect(
      nodes.some(
        node =>
          node.type === "button" &&
          node.props.children === "Create recruitment post"
      )
    ).toBe(false);
  });

  it("describes an empty own-group read without claiming no group exists", () => {
    const nodes = descendants(pageWith(availablePost(), false));
    const status = nodes.find(
      node => node.props.title === "No eligible group found in this view"
    );
    expect(status).toBeDefined();
    expect(status!.props.message).toContain("If your group is missing");
    expect(typeof status!.props.retry).toBe("function");
  });

  it("does not claim there are no browseable groups when evidence is unverified", () => {
    const nodes = descendants(
      pageWith(availablePost(), false, null, { verified: false })
    );
    expect(
      nodes.some(
        node => node.props.title === "Browseable groups could not be confirmed"
      )
    ).toBe(true);
    expect(
      nodes.some(node => node.props.title === "No browseable groups yet")
    ).toBe(false);
    expect(
      nodes.some(
        node => node.props.title === "No eligible group found in this view"
      )
    ).toBe(false);
  });

  it("does not claim there are no posts when course evidence is unverified", () => {
    const nodes = descendants(
      pageWith(availablePost(), false, null, { verified: false, noPosts: true })
    );
    expect(
      nodes.some(
        node => node.props.title === "Recruitment posts could not be confirmed"
      )
    ).toBe(true);
    expect(
      nodes.some(node => node.props.title === "No recruitment posts yet")
    ).toBe(false);
  });

  it("publishes with the existing service arguments, synchronously blocks duplicates, and refreshes on success", async () => {
    const wait = pending<string>();
    mocks.create.mockReturnValueOnce(wait.promise);
    const page = pageWith(availablePost(), true, null, {
      creatingGroupId: "own-1",
      subject: "  Subject  ",
      draft: "  Message  ",
    });
    const form = formFor(page);
    const event = { preventDefault: vi.fn() };
    form.props.onSubmit(event);
    form.props.onSubmit(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      "user-1",
      "own-1",
      "  Subject  ",
      "  Message  ",
      expect.any(Function)
    );
    const shouldDispatch = mocks.create.mock.calls[0][4] as () => boolean;
    expect(shouldDispatch()).toBe(true);
    expect(mocks.setters[5]).toHaveBeenCalledWith("create:own-1");
    wait.resolve("post-new");
    await vi.waitFor(() =>
      expect(mocks.setters[4]).toHaveBeenCalledWith("Recruitment post created.")
    );
    expect(mocks.setters[10]).toHaveBeenCalledWith("");
    expect(mocks.setters[11]).toHaveBeenCalledWith("");
    expect(mocks.setters[8]).toHaveBeenCalledWith(null);
    expect(mocks.setters[3]).toHaveBeenCalled();
    expect(mocks.setters[5]).toHaveBeenCalledWith(null);
    expect(shouldDispatch()).toBe(false);
  });

  it("maps create errors, releases busy state, and does not clear or refresh the draft", async () => {
    const problem = new Error("write rejected");
    mocks.create.mockRejectedValueOnce(problem);
    const form = formFor(
      pageWith(availablePost(), true, null, {
        creatingGroupId: "own-1",
        subject: "Title",
        draft: "Body",
      })
    );
    form.props.onSubmit({ preventDefault: vi.fn() });
    await vi.waitFor(() =>
      expect(mocks.setters[4]).toHaveBeenCalledWith("Post error")
    );
    expect(mocks.stageError).toHaveBeenCalledWith(problem);
    expect(mocks.setters[5]).toHaveBeenLastCalledWith(null);
    expect(mocks.setters[3]).not.toHaveBeenCalled();
    expect(mocks.setters[10]).not.toHaveBeenCalled();
    expect(mocks.setters[11]).not.toHaveBeenCalled();
  });

  it("does not let editing another post overwrite an in-flight draft, including before rerender", async () => {
    const wait = pending<string>();
    mocks.create.mockReturnValueOnce(wait.promise);
    const page = pageWith({ ...availablePost(), canManage: true }, true, null, {
      creatingGroupId: "own-1",
      subject: "My draft",
      draft: "My message",
    });
    const edit = descendants(page).find(
      node => node.type === "button" && node.props.children === "Edit post"
    );
    expect(edit).toBeDefined();
    formFor(page).props.onSubmit({ preventDefault: vi.fn() });
    edit!.props.onClick();
    expect(mocks.setters[9]).not.toHaveBeenCalled();
    expect(mocks.setters[10]).not.toHaveBeenCalled();
    expect(mocks.setters[11]).not.toHaveBeenCalled();
    wait.reject(new Error("write rejected"));
    await vi.waitFor(() =>
      expect(mocks.setters[4]).toHaveBeenCalledWith("Post error")
    );
    expect(mocks.setters[10]).not.toHaveBeenCalled();
    expect(mocks.setters[11]).not.toHaveBeenCalled();
    const busyPage = pageWith(
      { ...availablePost(), canManage: true },
      true,
      null,
      { busy: "create:own-1" }
    );
    const busyEdit = descendants(busyPage).find(
      node => node.type === "button" && node.props.children === "Edit post"
    );
    expect(busyEdit!.props.disabled).toBe(true);
  });

  it("does not let a create click overwrite an in-flight edit before rerender", async () => {
    const wait = pending<string>();
    mocks.edit.mockReturnValueOnce(wait.promise);
    const page = pageWith(
      { ...availablePost(), canManage: true },
      true,
      "post-1",
      { subject: "My edit", draft: "Edit draft" }
    );
    const editForm = descendants(page).find(
      node =>
        node.type === "form" &&
        descendants(node).some(
          child =>
            child.type === "input" &&
            child.props.id === "edit-post-subject-post-1"
        )
    )!;
    const create = descendants(page).find(
      node =>
        node.type === "button" &&
        node.props.children === "Create recruitment post"
    )!;
    editForm.props.onSubmit({ preventDefault: vi.fn() });
    create.props.onClick();
    expect(mocks.setters[8]).not.toHaveBeenCalled();
    expect(mocks.setters[9]).not.toHaveBeenCalled();
    expect(mocks.setters[10]).not.toHaveBeenCalled();
    expect(mocks.setters[11]).not.toHaveBeenCalled();
    wait.reject(new Error("edit rejected"));
    await vi.waitFor(() =>
      expect(mocks.setters[4]).toHaveBeenCalledWith("Post error")
    );
    expect(mocks.setters[10]).not.toHaveBeenCalled();
    expect(mocks.setters[11]).not.toHaveBeenCalled();
  });

  it("renders the in-flight form disabled", () => {
    const form = formFor(
      pageWith(availablePost(), true, null, {
        creatingGroupId: "own-1",
        subject: "Title",
        draft: "Body",
        busy: "create:own-1",
      })
    );
    for (const element of descendants(form).filter(node =>
      ["input", "textarea", "button"].includes(node.type as string)
    )) {
      expect(element.props.disabled).toBe(true);
    }
    expect(
      descendants(form).some(
        node => node.type === "button" && node.props.children === "Publishing…"
      )
    ).toBe(true);
  });

  it.each([
    ["account", { status: "ready", userId: "user-2", courseId: "course-1" }],
    ["course", { status: "ready", userId: "user-1", courseId: "course-2" }],
  ])(
    "ignores a pending publish success or failure after a %s change",
    async (_, next) => {
      for (const outcome of ["success", "error"] as const) {
        vi.clearAllMocks();
        const scope = new GroupWorkspaceScope({
          status: "ready",
          userId: "user-1",
          courseId: "course-1",
        });
        const wait = pending<string>();
        mocks.create.mockReturnValueOnce(wait.promise);
        const form = formFor(
          pageWith(availablePost(), true, null, {
            creatingGroupId: "own-1",
            subject: "Title",
            draft: "Body",
            scope,
          })
        );
        form.props.onSubmit({ preventDefault: vi.fn() });
        const shouldDispatch = mocks.create.mock.calls[0][4] as () => boolean;
        expect(shouldDispatch()).toBe(true);
        for (const setter of mocks.setters) setter.mockClear();
        scope.updateContext(next);
        expect(shouldDispatch()).toBe(false);
        if (outcome === "success") wait.resolve("post-new");
        else wait.reject(new Error("old error"));
        await new Promise(resolve => setTimeout(resolve, 0));
        for (const setter of mocks.setters)
          expect(setter).not.toHaveBeenCalled();
        expect(mocks.stageError).not.toHaveBeenCalled();
      }
    }
  );
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

describe("obsolete render guards", () => {
  it.each([
    ["account", { status: "ready", userId: "user-2", courseId: "course-1" }],
    ["course", { status: "ready", userId: "user-1", courseId: "course-2" }],
    ["session", { status: "loading", userId: null, courseId: "course-1" }],
  ])(
    "does not display or submit the old snapshot after a %s change",
    (_, next) => {
      const scope = new GroupWorkspaceScope({
        status: "ready",
        userId: "user-1",
        courseId: "course-1",
      });
      const oldPage = pageWith(availablePost(), true, null, {
        creatingGroupId: "own-1",
        subject: "Title",
        draft: "Body",
        scope,
      });
      const oldForm = descendants(oldPage).find(node => node.type === "form")!;
      scope.updateContext(next);
      oldForm.props.onSubmit({ preventDefault: vi.fn() });
      expect(mocks.create).not.toHaveBeenCalled();
      const staleRender = pageWith(availablePost(), true, null, {
        creatingGroupId: "own-1",
        subject: "Title",
        draft: "Body",
        scope,
      });
      expect(descendants(staleRender).some(node => node.type === "form")).toBe(
        false
      );
      const currentToken = scope.currentToken();
      const result = mocks.effects[0]();
      expect(result).toBeUndefined();
      expect(scope.currentToken()).toEqual(currentToken);
      expect(mocks.listGroups).not.toHaveBeenCalled();
      expect(mocks.loadCourseEligibility).not.toHaveBeenCalled();
    }
  );
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
    mocks.loadCourseEligibility.mockResolvedValue(true);
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
      null,
      null,
      "",
      "",
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

  it("shows each browse response while both scoped checks are pending", async () => {
    arrange();
    const ownWait = pending<ReturnType<typeof own>>();
    const courseWait = pending<boolean>();
    const postsWait = pending<ReturnType<typeof page>>();
    mocks.loadOwn.mockReturnValueOnce(ownWait.promise);
    mocks.loadCourseEligibility.mockReturnValueOnce(courseWait.promise);
    mocks.listPosts.mockReturnValueOnce(postsWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    expect(
      status(instance, "Checking posting eligibility…")?.props.retry
    ).toBeTypeOf("function");
    expect(status(instance, "Loading recruitment posts…")).toBeDefined();
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(mocks.loadOwn).toHaveBeenCalledWith("user-1", "course-1");
    expect(mocks.loadCourseEligibility).toHaveBeenCalledWith(
      "user-1",
      "course-1"
    );
    expect(mocks.listGroups).toHaveBeenCalledWith("user-1", "course-1");
    expect(mocks.listPosts).toHaveBeenCalledWith("user-1", "course-1");
    postsWait.resolve(page([availablePost()]));
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Looking for a teammate")).toBe(true)
    );
    courseWait.resolve(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(status(instance, "Checking posting eligibility…")).toBeDefined();
    ownWait.resolve(own());
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(hasHeading(instance, "My team")).toBe(true);
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    instance.cleanup?.();
  });

  it("preserves eligibility and each list when evidence completes before the lists", async () => {
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
    expect(button(instance, "Create recruitment post")).toBeDefined();
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    instance.cleanup?.();
  });

  it("does not offer creation when own groups arrive before course eligibility", async () => {
    arrange();
    const ownWait = pending<ReturnType<typeof own>>();
    const courseWait = pending<boolean>();
    mocks.loadOwn.mockReturnValueOnce(ownWait.promise);
    mocks.loadCourseEligibility.mockReturnValueOnce(courseWait.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    ownWait.resolve(own());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(status(instance, "Checking posting eligibility…")).toBeDefined();
    courseWait.resolve(true);
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    instance.cleanup?.();
  });

  it.each(["own groups", "course rejection", "course false"])(
    "fails closed promptly on %s even if the other check never settles",
    async kind => {
      arrange();
      const ownWait = pending<ReturnType<typeof own>>();
      const courseWait = pending<boolean>();
      mocks.loadOwn.mockReturnValueOnce(ownWait.promise);
      mocks.loadCourseEligibility.mockReturnValueOnce(courseWait.promise);
      const instance = mount();
      await vi.waitFor(() =>
        expect(hasHeading(instance, "Design team")).toBe(true)
      );
      if (kind === "own groups")
        ownWait.reject(new Error("own groups unavailable"));
      else if (kind === "course rejection")
        courseWait.reject(new Error("course unavailable"));
      else courseWait.resolve(false);
      await vi.waitFor(() =>
        expect(
          status(instance, "Posting eligibility could not be verified")
        ).toBeDefined()
      );
      expect(
        status(instance, "Posting eligibility could not be verified")?.props
          .retry
      ).toBeTypeOf("function");
      expect(button(instance, "Create recruitment post")).toBeUndefined();
      expect(hasHeading(instance, "Design team")).toBe(true);
      expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
      expect(mocks.stageError).not.toHaveBeenCalled();
      instance.cleanup?.();
    }
  );

  it("keeps the correct unverified empty-list messages and never claims no results", async () => {
    arrange();
    mocks.listGroups.mockResolvedValue(page([]));
    mocks.listPosts.mockResolvedValue(page([]));
    mocks.loadCourseEligibility.mockResolvedValue(false);
    const instance = mount();
    await vi.waitFor(() =>
      expect(
        status(instance, "Recruitment posts could not be confirmed")
      ).toBeDefined()
    );
    expect(
      status(instance, "Browseable groups could not be confirmed")?.props
        .message
    ).toContain("group availability may be incomplete");
    expect(
      status(instance, "Recruitment posts could not be confirmed")?.props
        .message
    ).toContain("post availability may be incomplete");
    expect(status(instance, "No browseable groups yet")).toBeUndefined();
    expect(status(instance, "No recruitment posts yet")).toBeUndefined();
    instance.cleanup?.();
  });

  it("recovers from false course evidence through eligibility-only retry", async () => {
    arrange();
    const retryCourse = pending<boolean>();
    mocks.loadCourseEligibility
      .mockResolvedValueOnce(false)
      .mockReturnValueOnce(retryCourse.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(
        status(instance, "Posting eligibility could not be verified")
      ).toBeDefined()
    );
    status(
      instance,
      "Posting eligibility could not be verified"
    )!.props.retry();
    expect(status(instance, "Checking posting eligibility…")).toBeDefined();
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    retryCourse.resolve(true);
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    expect(mocks.listGroups).toHaveBeenCalledTimes(1);
    expect(mocks.listPosts).toHaveBeenCalledTimes(1);
    instance.cleanup?.();
  });

  it("retries pending eligibility without clearing browsing and ignores the older attempt", async () => {
    arrange();
    const oldOwn = pending<ReturnType<typeof own>>();
    const oldCourse = pending<boolean>();
    const newOwn = pending<ReturnType<typeof own>>();
    const newCourse = pending<boolean>();
    mocks.loadOwn
      .mockReturnValueOnce(oldOwn.promise)
      .mockReturnValueOnce(newOwn.promise);
    mocks.loadCourseEligibility
      .mockReturnValueOnce(oldCourse.promise)
      .mockReturnValueOnce(newCourse.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    status(instance, "Checking posting eligibility…")!.props.retry();
    await vi.waitFor(() => expect(mocks.loadOwn).toHaveBeenCalledTimes(2));
    oldOwn.resolve(own());
    oldCourse.resolve(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(status(instance, "Checking posting eligibility…")).toBeDefined();
    expect(button(instance, "Create recruitment post")).toBeUndefined();
    expect(hasHeading(instance, "Design team")).toBe(true);
    expect(hasHeading(instance, "Looking for a teammate")).toBe(true);
    expect(mocks.listGroups).toHaveBeenCalledTimes(1);
    expect(mocks.listPosts).toHaveBeenCalledTimes(1);
    newCourse.resolve(true);
    newOwn.resolve(own());
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    instance.cleanup?.();
  });

  it("does not let a late failed attempt overwrite successful retry evidence", async () => {
    arrange();
    const oldOwn = pending<ReturnType<typeof own>>();
    mocks.loadOwn.mockReturnValueOnce(oldOwn.promise);
    const instance = mount();
    await vi.waitFor(() =>
      expect(hasHeading(instance, "Design team")).toBe(true)
    );
    status(instance, "Checking posting eligibility…")!.props.retry();
    await vi.waitFor(() =>
      expect(button(instance, "Create recruitment post")).toBeDefined()
    );
    oldOwn.reject(new Error("old failure"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(button(instance, "Create recruitment post")).toBeDefined();
    expect(
      status(instance, "Posting eligibility could not be verified")
    ).toBeUndefined();
    instance.cleanup?.();
  });

  it.each(["groups", "posts"])(
    "isolates a %s list failure and its retry from the other list and eligibility",
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
      expect(button(instance, "Create recruitment post")).toBeDefined();
      expect(mocks.loadOwn).toHaveBeenCalledTimes(1);
      expect(mocks.loadCourseEligibility).toHaveBeenCalledTimes(1);
      instance.cleanup?.();
    }
  );

  it("merges a page completed after eligibility without losing either update", async () => {
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
      const oldCourse = pending<boolean>();
      mocks.listGroups.mockReturnValueOnce(oldGroups.promise);
      mocks.listPosts.mockReturnValueOnce(oldPosts.promise);
      mocks.loadOwn.mockReturnValueOnce(oldOwn.promise);
      mocks.loadCourseEligibility.mockReturnValueOnce(oldCourse.promise);
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
      oldCourse.resolve(true);
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
