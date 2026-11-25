import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CourseGroupSummary,
  GroupRecruitmentPost,
} from "@/lib/supabaseStage6";

const mocks = vi.hoisted(() => ({
  state: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  stateIndex: 0,
  effects: [] as Array<() => void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  request: vi.fn(),
  groupError: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  stageError: vi.fn(),
  loadOwn: vi.fn(),
  listGroups: vi.fn(),
  listPosts: vi.fn(),
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

import { GroupWorkspaceContent } from "./GroupWorkspacePage";
import { GroupWorkspaceScope } from "./GroupWorkspaceScope";
import { Stage6ApplyControl } from "./Stage6Capacity";

// Decision 2A copy: a queued request must read as queued, a running one as
// running, and only a finished one may claim the refresh happened.
const QUEUED_MESSAGE =
  "Refresh queued. CityLink will refresh group status as soon as the current load finishes.";
const RUNNING_MESSAGE = "Refreshing group status…";
const SUCCESS_MESSAGE =
  "Group capacity refreshed. Unsaved drafts, loaded posts, and loaded group cards were kept.";

const ownGroup = {
  id: "own-1",
  course_id: "course-1",
  creator_id: "leader-2",
  status: "active" as const,
  name: "My team",
  max_members: null,
  created_at: "2026-11-17T09:00:00.000Z",
};

function recruitmentPost(
  overrides: Partial<GroupRecruitmentPost> = {}
): GroupRecruitmentPost {
  return {
    id: "post-1",
    groupId: "group-1",
    groupName: "Design team",
    activeMemberCount: 5,
    maxMembers: 5,
    capacityCount: 5,
    capacityState: "full",
    authorName: "A Student",
    subject: "Looking for a teammate",
    body: "Looking for a designer.",
    status: "open",
    createdAt: "2026-11-17T09:00:00.000Z",
    updatedAt: "2026-11-17T09:00:00.000Z",
    closedAt: null,
    applyEnabled: false,
    applyBlockReason: "group_full",
    canManage: false,
    ...overrides,
  };
}

function groupSummary(
  overrides: Partial<CourseGroupSummary> = {}
): CourseGroupSummary {
  return {
    groupId: "group-1",
    groupName: "Design team",
    status: "active",
    activeMemberCount: 5,
    maxMembers: 5,
    capacityCount: 5,
    capacityState: "full",
    canCreatePost: false,
    ...overrides,
  } as CourseGroupSummary;
}

const pageOf = <T>(items: T[]) => ({ items, hasMore: false, nextCursor: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type MountOptions = {
  postsHasMore?: boolean;
  groupsHasMore?: boolean;
  post?: GroupRecruitmentPost;
  locallyPending?: string[];
};

function mount(options: MountOptions = {}) {
  mocks.refs = [];
  mocks.refIndex = 0;
  mocks.state = [
    {
      groups: [groupSummary()],
      groupsState: "ready",
      groupsError: "",
      groupsHasMore: options.groupsHasMore ?? false,
      groupsCursor: options.groupsHasMore
        ? { groupName: "Design team", groupId: "group-1" }
        : null,
      posts: [options.post ?? recruitmentPost()],
      postsState: "ready",
      postsError: "",
      postsHasMore: options.postsHasMore ?? false,
      postsCursor: options.postsHasMore
        ? { createdAt: "2026-11-17T09:00:00.000Z", id: "post-1" }
        : null,
      ownGroups: { status: "ready", groups: [ownGroup] },
      token: {
        userId: "user-1",
        courseId: "course-1",
        generation: 0,
        authGeneration: 0,
      },
    },
    "ready", // state
    "", // error
    0, // reloadToken
    "", // feedback
    null, // busyAction
    false, // groupsPageBusy
    false, // postsPageBusy
    false, // postsRefreshBusy
    options.locallyPending ?? [], // locallyPendingPostIds
    0, // peopleRefreshToken
    null, // editingPostId
    "Unsaved body", // draft
    "Unsaved subject", // postSubject
    false, // refreshQueued
    "", // courseLabel
    "", // groupSearch
  ];
  mocks.setters = mocks.state.map((_, index) =>
    vi.fn(value => {
      mocks.state[index] =
        typeof value === "function" ? value(mocks.state[index]) : value;
    })
  );
  const scope = new GroupWorkspaceScope({
    status: "ready",
    userId: "user-1",
    courseId: "course-1",
    authGeneration: 0,
  });
  const render = () => {
    mocks.stateIndex = 0;
    mocks.refIndex = 0;
    mocks.effects = [];
    return GroupWorkspaceContent({
      courseId: "course-1",
      userId: "user-1",
      sessionStatus: "ready",
      sessionGeneration: 0,
      scope,
    });
  };
  render();
  return {
    render,
    scope,
    feedback: () => mocks.state[4] as string,
    queued: () => mocks.state[14] as boolean,
    refreshBusy: () => mocks.state[8] as boolean,
    pendingIds: () => mocks.state[9] as string[],
  };
}

function descendants(node: ReactNode): ReactElement<any>[] {
  if (!isValidElement(node)) return [];
  const children: ReactElement<any>[] = [];
  Children.forEach((node.props as { children?: ReactNode }).children, child => {
    children.push(...descendants(child));
  });
  return [node, ...children];
}

function loadMoreButton(
  instance: ReturnType<typeof mount>,
  text: string
): ReactElement<{ disabled: boolean; onClick: () => void }> | undefined {
  return descendants(instance.render()).find(
    node => node.type === "button" && node.props.children === text
  );
}

function applyControl(
  instance: ReturnType<typeof mount>
): ReactElement<any> | undefined {
  return descendants(instance.render()).find(
    node => node.type === Stage6ApplyControl
  );
}

function refreshButton(instance: ReturnType<typeof mount>) {
  const control = applyControl(instance);
  expect(control).toBeDefined();
  const rendered = Stage6ApplyControl(control!.props);
  const button = descendants(rendered).find(
    node => node.type === "button" && node.props.className === "text-button"
  );
  expect(button).toBeDefined();
  return button! as ReactElement<{ disabled: boolean; onClick: () => void }>;
}

/** Refresh label plus disabled state, read from the rendered control. */
function refreshView(instance: ReturnType<typeof mount>) {
  const control = applyControl(instance)!;
  return {
    label: control.props.refreshState,
    button: refreshButton(instance),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { status: "ready", user: { id: "user-1" } };
  mocks.request.mockResolvedValue("request-1");
  mocks.groupError.mockReturnValue("Group is full");
  mocks.stageError.mockReturnValue("Post error");
  mocks.create.mockResolvedValue("new-post");
  mocks.edit.mockResolvedValue("post-1");
  mocks.listPosts.mockResolvedValue(pageOf([recruitmentPost()]));
  mocks.listGroups.mockResolvedValue(pageOf([groupSummary()]));
});

describe("workspace Refresh queue (decision 2A)", () => {
  it("queues a Refresh asked for during Load more posts and runs it once the page lands", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([recruitmentPost()]))
    );
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    expect(mocks.listPosts).toHaveBeenCalledWith("user-1", "course-1", {
      createdAt: "2026-11-17T09:00:00.000Z",
      id: "post-1",
    });

    refreshButton(instance).props.onClick();

    // Nothing was dispatched for the refresh yet, and nothing claims success.
    expect(instance.queued()).toBe(true);
    expect(instance.feedback()).toBe(QUEUED_MESSAGE);
    expect(refreshButton(instance).props.children).toBe("Refresh queued");
    expect(mocks.listPosts).toHaveBeenCalledTimes(1);
    expect(mocks.listGroups).not.toHaveBeenCalled();

    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));

    expect(mocks.listPosts).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(mocks.listGroups).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(instance.queued()).toBe(false);
    expect(instance.refreshBusy()).toBe(false);
    expect(refreshView(instance).label).toBe("idle");
    expect(refreshButton(instance).props.children).toBe("Refresh group status");
  });

  it("queues a Refresh asked for during Load more groups so group cards are re-read", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listGroups.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([groupSummary()]))
    );
    const instance = mount({ groupsHasMore: true });

    loadMoreButton(instance, "Load more groups")!.props.onClick();
    refreshButton(instance).props.onClick();

    expect(instance.queued()).toBe(true);
    expect(instance.feedback()).toBe(QUEUED_MESSAGE);
    expect(mocks.listPosts).not.toHaveBeenCalled();

    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));
    expect(mocks.listPosts).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(mocks.listGroups).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
  });

  it("coalesces repeated Refresh clicks into a single queued refresh", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([recruitmentPost()]))
    );
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    refreshButton(instance).props.onClick();
    refreshButton(instance).props.onClick();
    refreshButton(instance).props.onClick();
    expect(instance.queued()).toBe(true);

    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));

    // One refresh means one posts read and one group-card read, not three.
    expect(
      mocks.listPosts.mock.calls.filter(([, , cursor]) => !cursor)
    ).toHaveLength(1);
    expect(
      mocks.listGroups.mock.calls.filter(([, , cursor]) => !cursor)
    ).toHaveLength(1);
  });

  it("discards the queued refresh after a course change without another service call", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([recruitmentPost()]))
    );
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    refreshButton(instance).props.onClick();
    expect(instance.queued()).toBe(true);

    // Same user, different course: the queued intent belongs to the old view.
    instance.scope.updateContext({
      status: "ready",
      userId: "user-1",
      courseId: "course-2",
      authGeneration: 0,
    });
    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(mocks.listPosts).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(mocks.listPosts).not.toHaveBeenCalledWith(
      "user-1",
      "course-2",
      undefined
    );
    expect(
      mocks.listPosts.mock.calls.filter(([, , cursor]) => !cursor)
    ).toHaveLength(0);
    expect(instance.queued()).toBe(false);
    expect(instance.feedback()).not.toBe(SUCCESS_MESSAGE);
  });

  it("still runs the queued Refresh when the Load more page fails", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([recruitmentPost()]))
    );
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    refreshButton(instance).props.onClick();
    paging.reject(new Error("page unavailable"));
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));
    const reported = mocks.setters[4].mock.calls.map(call => call[0]);
    // The failed page is reported truthfully, and the owed refresh still ran.
    expect(reported).toContain("Post error");
    expect(mocks.stageError).toHaveBeenCalled();
    expect(mocks.listPosts).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(instance.queued()).toBe(false);
  });

  it("reports a failed Refresh as a failure instead of a completed refresh", async () => {
    const failing = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockReturnValue(failing.promise);
    const instance = mount();

    refreshButton(instance).props.onClick();
    expect(instance.refreshBusy()).toBe(true);
    expect(refreshView(instance).label).toBe("running");
    expect(instance.feedback()).toBe(RUNNING_MESSAGE);

    failing.reject(new Error("refresh unavailable"));
    await vi.waitFor(() => expect(instance.feedback()).toBe("Post error"));
    expect(instance.feedback()).not.toContain("refreshed");
    expect(instance.refreshBusy()).toBe(false);
    expect(instance.queued()).toBe(false);
    expect(mocks.state[10]).toBe(0); // People cards were not revalidated
  });

  it("does not claim success when only the group-card read fails", async () => {
    const instance = mount();
    mocks.listPosts.mockResolvedValue(pageOf([recruitmentPost()]));
    mocks.listGroups.mockRejectedValue(new Error("group read failed"));

    refreshButton(instance).props.onClick();
    await vi.waitFor(() => expect(instance.feedback()).toBe("Post error"));
    // The posts read succeeded, but a half-finished refresh must not be
    // reported as a completed capacity refresh.
    expect(instance.feedback()).not.toContain("Group capacity refreshed");
    expect(mocks.listPosts).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(mocks.listGroups).toHaveBeenCalledWith(
      "user-1",
      "course-1",
      undefined
    );
    expect(mocks.state[10]).toBe(0);
    expect(instance.refreshBusy()).toBe(false);
  });

  it("discards the queued refresh across a same-user auth-generation boundary", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([recruitmentPost()]))
    );
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    refreshButton(instance).props.onClick();
    expect(instance.queued()).toBe(true);

    // Same account and course, new session generation: the previous session
    // must not dispatch a refresh after the boundary moved on.
    instance.scope.updateContext({
      status: "ready",
      userId: "user-1",
      courseId: "course-1",
      authGeneration: 1,
    });
    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(mocks.listPosts).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(
      mocks.listPosts.mock.calls.filter(([, , cursor]) => !cursor)
    ).toHaveLength(0);
    expect(mocks.listGroups).not.toHaveBeenCalled();
    expect(instance.queued()).toBe(false);
    expect(instance.feedback()).not.toBe(SUCCESS_MESSAGE);
  });

  it("keeps at most one pending refresh while a queued refresh is running", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    const runs: Array<ReturnType<typeof deferred>> = [];
    mocks.listPosts.mockImplementation((_u, _c, cursor) => {
      if (cursor) return paging.promise;
      const gate = deferred<ReturnType<typeof pageOf>>();
      runs.push(gate);
      return gate.promise;
    });
    const instance = mount({ postsHasMore: true });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    refreshButton(instance).props.onClick();
    paging.resolve(pageOf([]));

    // The queued intent starts once the page settles, and then holds the reads.
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(instance.refreshBusy()).toBe(true);

    // Requests arriving during that run coalesce into one further run.
    refreshButton(instance).props.onClick();
    refreshButton(instance).props.onClick();
    // While the run is in flight the control keeps saying "refreshing"; the
    // extra clicks are retained as one intent rather than starting parallel runs.
    expect(refreshView(instance).label).toBe("running");
    expect(runs).toHaveLength(1);

    runs[0].resolve(pageOf([recruitmentPost()]));
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    runs[1].resolve(pageOf([recruitmentPost()]));
    // Each completed refresh revalidates the People cards exactly once.
    await vi.waitFor(() => expect(mocks.state[10]).toBe(2));

    // Two clicks produced exactly one extra run, and nothing keeps re-queueing.
    expect(runs).toHaveLength(2);
    expect(instance.queued()).toBe(false);
    expect(instance.refreshBusy()).toBe(false);
  });

  it("keeps a successful application pending through a queued refresh", async () => {
    const paging = deferred<ReturnType<typeof pageOf>>();
    const available = recruitmentPost({
      activeMemberCount: 3,
      capacityCount: 3,
      capacityState: "available",
      applyEnabled: true,
      applyBlockReason: null,
    });
    mocks.listPosts.mockImplementation((_u, _c, cursor) =>
      cursor ? paging.promise : Promise.resolve(pageOf([available]))
    );
    const instance = mount({ postsHasMore: true, post: available });

    loadMoreButton(instance, "Load more posts")!.props.onClick();
    const control = applyControl(instance)!;
    control.props.onApply();
    await vi.waitFor(() => expect(instance.pendingIds()).toEqual(["post-1"]));

    // The refresh the application asks for is queued behind the running page.
    expect(instance.queued()).toBe(true);
    expect(instance.feedback()).toBe(QUEUED_MESSAGE);
    expect(mocks.request).toHaveBeenCalledTimes(1);

    paging.resolve(pageOf([]));
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));

    // The durable pending marker survives the queue and the refresh.
    expect(instance.pendingIds()).toEqual(["post-1"]);
    expect(mocks.setters[9]).not.toHaveBeenCalledWith([]);
    const refreshed = Stage6ApplyControl(applyControl(instance)!.props);
    const apply = descendants(refreshed).find(
      node => node.type === "button" && node.props.className === "primary"
    )!;
    expect(apply.props.disabled).toBe(true);
    expect(
      descendants(refreshed).some(node =>
        Array.isArray(node.props.children)
          ? node.props.children.includes("You already have a pending request")
          : node.props.children ===
            "You already have a pending request to join this group."
      )
    ).toBe(true);
  });

  it("keeps Load more controls out of the way while a refresh runs, then restores them", async () => {
    const gate = deferred<ReturnType<typeof pageOf>>();
    const instance = mount({ postsHasMore: true, groupsHasMore: true });
    // Further pages remain available so the loaded ranges, and the controls
    // attached to them, survive the refresh instead of being reset by it.
    mocks.listPosts.mockReturnValue(gate.promise);
    mocks.listGroups.mockResolvedValue({
      items: [groupSummary()],
      hasMore: true,
      nextCursor: { groupName: "Design team", groupId: "group-1" },
    });

    refreshButton(instance).props.onClick();
    expect(loadMoreButton(instance, "Load more posts")!.props.disabled).toBe(
      true
    );
    expect(loadMoreButton(instance, "Load more groups")!.props.disabled).toBe(
      true
    );
    expect(refreshButton(instance).props.disabled).toBe(true);

    gate.resolve({
      items: [recruitmentPost()],
      hasMore: true,
      nextCursor: { createdAt: "2026-11-17T09:00:00.000Z", id: "post-1" },
    });
    await vi.waitFor(() => expect(instance.feedback()).toBe(SUCCESS_MESSAGE));
    expect(loadMoreButton(instance, "Load more posts")!.props.disabled).toBe(
      false
    );
    expect(loadMoreButton(instance, "Load more groups")!.props.disabled).toBe(
      false
    );
    expect(refreshButton(instance).props.disabled).toBe(false);
    // A refresh that has not been asked for must not look queued.
    expect(refreshView(instance).label).toBe("idle");
  });
});
