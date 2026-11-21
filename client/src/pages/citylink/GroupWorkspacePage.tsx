import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight, Users } from "lucide-react";
import { Link } from "wouter";
import { PageHeading } from "@/components/citylink/Shared";
import AuthenticatedCoursePeers from "@/pages/citylink/AuthenticatedCoursePeers";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { hasCurrentTermCourseEnrollment } from "@/lib/supabaseCourses";
import {
  closeGroupRecruitmentPost,
  createGroupRecruitmentPost,
  editGroupRecruitmentPost,
  getStage6ErrorMessage,
  listCurrentTermCourseGroups,
  listGroupRecruitmentPosts,
  MAX_RECRUITMENT_POST_LENGTH,
  type CourseGroupCursor,
  type CourseGroupSummary,
  type GroupRecruitmentPost,
  type RecruitmentPostCursor,
} from "@/lib/supabaseStage6";
import {
  getGroupWorkflowErrorMessage,
  loadOwnCourseGroupSnapshot,
  requestToJoinGroup,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  canApplyToRecruitmentPost,
  Stage6ApplyControl,
  Stage6CapacityCount,
  Stage6CapacityStatus,
  withLocalPendingState,
} from "./Stage6Capacity";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";
import {
  GroupWorkspaceScope,
  recruitmentEligibility,
  runScoped,
  runScopedAction,
  type WorkspaceToken,
} from "./GroupWorkspaceScope";
import {
  RefreshQueue,
  type RefreshQueueState,
  type RefreshRequestResult,
} from "@/lib/refreshQueue";

// Adam's approved decision 2A: a Refresh requested while Load more runs is
// queued rather than silently rejected, and is never reported as finished
// before it has actually run.
const REFRESH_QUEUED_MESSAGE =
  "Refresh queued. CityLink will refresh group status as soon as the current load finishes.";
const REFRESH_RUNNING_MESSAGE = "Refreshing group status…";
const REFRESH_SUCCESS_MESSAGE =
  "Group capacity refreshed. Unsaved drafts, loaded posts, and loaded group cards were kept.";

type LoadState = "loading" | "ready" | "error";
type Snapshot = {
  groups: CourseGroupSummary[];
  groupsState: LoadState;
  groupsError: string;
  groupsHasMore: boolean;
  groupsCursor: CourseGroupCursor | null;
  posts: GroupRecruitmentPost[];
  postsState: LoadState;
  postsError: string;
  postsHasMore: boolean;
  postsCursor: RecruitmentPostCursor | null;
  eligibility: {
    status: "checking" | "complete";
    verified: boolean;
    groups: StudyGroupRow[];
  };
  token: WorkspaceToken;
};

// A new keyed content tree resets both creation and editing drafts when the
// account, session readiness or course changes. The commit-phase layout effect
// invalidates old callbacks before the browser can interact with the new tree.
export default function GroupWorkspacePage({ courseId }: { courseId: string }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const sessionGeneration = session.authGeneration ?? 0;
  const context = {
    status: session.status,
    userId,
    courseId,
    authGeneration: sessionGeneration,
  };
  const scope = useRef(new GroupWorkspaceScope(context)).current;
  useLayoutEffect(() => {
    scope.updateContext({
      status: session.status,
      userId,
      courseId,
      authGeneration: sessionGeneration,
    });
    return () => scope.invalidate();
  }, [scope, session.status, userId, courseId, sessionGeneration]);
  return (
    <GroupWorkspaceContent
      key={JSON.stringify([
        session.status,
        userId,
        courseId,
        sessionGeneration,
      ])}
      courseId={courseId}
      userId={userId}
      sessionStatus={session.status}
      sessionGeneration={sessionGeneration}
      scope={scope}
    />
  );
}

export function GroupWorkspaceContent({
  courseId,
  userId,
  sessionStatus,
  sessionGeneration = 0,
  scope,
}: {
  courseId: string;
  userId: string | null;
  sessionStatus: string;
  sessionGeneration?: number;
  scope: GroupWorkspaceScope;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [groupsPageBusy, setGroupsPageBusy] = useState(false);
  const [postsPageBusy, setPostsPageBusy] = useState(false);
  const [postsRefreshBusy, setPostsRefreshBusy] = useState(false);
  const [locallyPendingPostIds, setLocallyPendingPostIds] = useState<string[]>(
    []
  );
  const [peopleRefreshToken, setPeopleRefreshToken] = useState(0);
  const [creatingGroupId, setCreatingGroupId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [postSubject, setPostSubject] = useState("");
  // Appended last so the existing capacity-test state slots keep their meaning.
  // True only while a coalesced Refresh intent is waiting for a Load more.
  const [refreshQueued, setRefreshQueued] = useState(false);
  const groupsAttempt = useRef(0);
  const postsAttempt = useRef(0);
  const eligibilityAttempt = useRef(0);
  const groupsOperation = useRef(false);
  const postsOperation = useRef(false);
  const latestSnapshot = useRef<Snapshot | null>(null);
  latestSnapshot.current = snapshot;
  const capacityRefresh = useRef<RefreshQueue<WorkspaceToken> | null>(null);
  if (!capacityRefresh.current) {
    capacityRefresh.current = new RefreshQueue<WorkspaceToken>({
      isCurrent: token => scope.isCurrent(token),
      isBlocked: () => postsOperation.current || groupsOperation.current,
      run: token => runCapacityRefresh(token),
      onStateChange: state => {
        setRefreshQueued(state === "queued");
        if (state === "queued") setFeedback(REFRESH_QUEUED_MESSAGE);
        if (state === "running") setFeedback(REFRESH_RUNNING_MESSAGE);
      },
    });
  }

  /**
   * Ask for the capacity refresh Adam approved as decision 2A. The request is
   * never silently rejected: it either starts now, becomes the single queued
   * intent, or is dropped when the workspace context no longer matches.
   */
  function requestCapacityRefresh(): RefreshRequestResult {
    const token = ownSnapshot?.token;
    if (!token) return "stale";
    return capacityRefresh.current?.request(token) ?? "stale";
  }

  function clearCapacityQueue(): void {
    capacityRefresh.current?.discard();
    setRefreshQueued(false);
  }

  // Recheck the token and attempt inside React's updater too: it may be applied
  // after another retry, refresh, or context change has already begun.
  function updateSnapshot(
    token: WorkspaceToken,
    isLatest: () => boolean,
    update: (previous: Snapshot) => Snapshot
  ) {
    setSnapshot(previous =>
      previous &&
      scope.isCurrent(token) &&
      previous.token.generation === token.generation &&
      isLatest()
        ? update(previous)
        : previous
    );
  }

  function loadGroups(token: WorkspaceToken) {
    if (!scope.isCurrent(token)) return;
    const attempt = ++groupsAttempt.current;
    const isLatest = () => groupsAttempt.current === attempt;
    updateSnapshot(token, isLatest, previous => ({
      ...previous,
      groupsState: "loading",
      groupsError: "",
    }));
    void runScoped(
      scope,
      token,
      () => listCurrentTermCourseGroups(token.userId, token.courseId),
      {
        success: page =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            groups: page.items,
            groupsHasMore: page.hasMore,
            groupsCursor: page.nextCursor,
            groupsState: "ready",
          })),
        error: loadError =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            groupsState: "error",
            groupsError: getStage6ErrorMessage(loadError),
          })),
      }
    );
  }

  function loadPosts(token: WorkspaceToken) {
    if (!scope.isCurrent(token)) return;
    const attempt = ++postsAttempt.current;
    const isLatest = () => postsAttempt.current === attempt;
    updateSnapshot(token, isLatest, previous => ({
      ...previous,
      postsState: "loading",
      postsError: "",
    }));
    void runScoped(
      scope,
      token,
      () => listGroupRecruitmentPosts(token.userId, token.courseId),
      {
        success: page =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            posts: page.items,
            postsHasMore: page.hasMore,
            postsCursor: page.nextCursor,
            postsState: "ready",
          })),
        error: loadError =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            postsState: "error",
            postsError: getStage6ErrorMessage(loadError),
          })),
      }
    );
  }

  function loadEligibility(token: WorkspaceToken) {
    if (!scope.isCurrent(token)) return;
    const attempt = ++eligibilityAttempt.current;
    const isLatest = () => eligibilityAttempt.current === attempt;
    updateSnapshot(token, isLatest, previous => ({
      ...previous,
      eligibility: { status: "checking", verified: false, groups: [] },
    }));
    void runScoped(
      scope,
      token,
      () => {
        // Start both reads independently, and fail immediately on a rejection
        // or false course evidence even if the other read never settles.
        const ownGroups = Promise.resolve().then(() =>
          loadOwnCourseGroupSnapshot(token.userId, token.courseId)
        );
        const course = Promise.resolve()
          .then(() =>
            hasCurrentTermCourseEnrollment(token.userId, token.courseId)
          )
          .then(eligible => {
            if (eligible !== true)
              throw new Error("Course eligibility not confirmed");
            return eligible;
          });
        return Promise.all([ownGroups, course]);
      },
      {
        success: ([ownGroups, currentCourseEligible]) =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            eligibility: {
              status: "complete",
              ...recruitmentEligibility(
                token.userId,
                token.courseId,
                currentCourseEligible,
                ownGroups.groups,
                ownGroups.memberships
              ),
            },
          })),
        error: () =>
          updateSnapshot(token, isLatest, previous => ({
            ...previous,
            eligibility: { status: "complete", verified: false, groups: [] },
          })),
      }
    );
  }

  useEffect(() => {
    if (
      !scope.matchesContext({
        status: sessionStatus,
        userId,
        courseId,
        authGeneration: sessionGeneration,
      })
    )
      return;
    const token = scope.startLoad();
    setSnapshot(null);
    setBusyAction(null);
    setGroupsPageBusy(false);
    setPostsPageBusy(false);
    setPostsRefreshBusy(false);
    clearCapacityQueue();
    setLocallyPendingPostIds([]);
    setCreatingGroupId(null);
    setEditingPostId(null);
    setDraft("");
    setPostSubject("");
    if (sessionStatus === "loading") {
      setState("loading");
    } else if (!token) {
      setState("error");
      setError(
        "Sign in with a Supabase account to browse current-term groups."
      );
    } else {
      setError("");
      setSnapshot({
        groups: [],
        groupsState: "loading",
        groupsError: "",
        groupsHasMore: false,
        groupsCursor: null,
        posts: [],
        postsState: "loading",
        postsError: "",
        postsHasMore: false,
        postsCursor: null,
        eligibility: { status: "checking", verified: false, groups: [] },
        token,
      });
      setState("ready");
      loadGroups(token);
      loadPosts(token);
      loadEligibility(token);
    }
    return () => {
      // A queued intent belongs to the workspace generation that created it,
      // so it is dropped instead of refreshing an account or course that is
      // already gone.
      clearCapacityQueue();
      if (token && scope.isCurrent(token)) scope.invalidate();
    };
  }, [courseId, reloadToken, sessionGeneration, sessionStatus, userId, scope]);

  const ownSnapshot =
    sessionStatus === "ready" &&
    snapshot &&
    snapshot.token.userId === userId &&
    snapshot.token.courseId === courseId &&
    scope.isCurrent(snapshot.token)
      ? snapshot
      : null;
  const renderToken = scope.matchesContext({
    status: sessionStatus,
    userId,
    courseId,
    authGeneration: sessionGeneration,
  })
    ? scope.currentToken()
    : null;

  function reload(expectedToken: WorkspaceToken | null = renderToken) {
    if (!expectedToken || !scope.isCurrent(expectedToken)) return;
    scope.invalidate();
    setSnapshot(null);
    setBusyAction(null);
    setGroupsPageBusy(false);
    setPostsPageBusy(false);
    setPostsRefreshBusy(false);
    clearCapacityQueue();
    setLocallyPendingPostIds([]);
    setReloadToken(value => value + 1);
  }

  async function loadMoreGroups() {
    const token = ownSnapshot?.token;
    if (
      !token ||
      !scope.isCurrent(token) ||
      !ownSnapshot.groupsHasMore ||
      !ownSnapshot.groupsCursor ||
      groupsPageBusy ||
      groupsOperation.current
    )
      return;
    groupsOperation.current = true;
    setGroupsPageBusy(true);
    setFeedback("");
    await runScoped(
      scope,
      token,
      () =>
        listCurrentTermCourseGroups(
          token.userId,
          token.courseId,
          ownSnapshot.groupsCursor!
        ),
      {
        success: page =>
          setSnapshot(previous => {
            if (
              !previous ||
              !scope.isCurrent(previous.token) ||
              previous.token.generation !== token.generation
            )
              return previous;
            const known = new Set(previous.groups.map(group => group.groupId));
            return {
              ...previous,
              groups: [
                ...previous.groups,
                ...page.items.filter(group => !known.has(group.groupId)),
              ],
              groupsHasMore: page.hasMore,
              groupsCursor: page.nextCursor,
            };
          }),
        error: pageError => setFeedback(getStage6ErrorMessage(pageError)),
        settle: () => {
          groupsOperation.current = false;
          setGroupsPageBusy(false);
          // Whether this page succeeded or failed, a queued Refresh is owed a
          // run now that the shared group read is free.
          capacityRefresh.current?.settle();
        },
      }
    );
  }

  async function loadMorePosts() {
    const token = ownSnapshot?.token;
    if (
      !token ||
      !scope.isCurrent(token) ||
      !ownSnapshot.postsHasMore ||
      !ownSnapshot.postsCursor ||
      postsPageBusy ||
      postsOperation.current
    )
      return;
    postsOperation.current = true;
    setPostsPageBusy(true);
    setFeedback("");
    await runScoped(
      scope,
      token,
      () =>
        listGroupRecruitmentPosts(
          token.userId,
          token.courseId,
          ownSnapshot.postsCursor!
        ),
      {
        success: page =>
          setSnapshot(previous => {
            if (
              !previous ||
              !scope.isCurrent(previous.token) ||
              previous.token.generation !== token.generation
            )
              return previous;
            const known = new Set(previous.posts.map(post => post.id));
            return {
              ...previous,
              posts: [
                ...previous.posts,
                ...page.items.filter(post => !known.has(post.id)),
              ],
              postsHasMore: page.hasMore,
              postsCursor: page.nextCursor,
            };
          }),
        error: pageError => setFeedback(getStage6ErrorMessage(pageError)),
        settle: () => {
          postsOperation.current = false;
          setPostsPageBusy(false);
          // Whether this page succeeded or failed, a queued Refresh is owed a
          // run now that the shared post read is free.
          capacityRefresh.current?.settle();
        },
      }
    );
  }

  /**
   * Re-reads the loaded group-card range for the current capacity refresh.
   *
   * The caller holds both shared read locks for the whole attempt, so a group
   * refresh that was asked for can no longer be skipped here and then reported
   * to the user as completed. Errors propagate to the single refresh caller.
   */
  async function refreshGroupsForCapacity(token: WorkspaceToken) {
    const knownIds = new Set(
      (latestSnapshot.current?.groups ?? []).map(group => group.groupId)
    );
    const targetCount = Math.max(1, knownIds.size);
    const refreshed: CourseGroupSummary[] = [];
    let cursor: CourseGroupCursor | undefined;
    let hasMore = false;
    let nextCursor: CourseGroupCursor | null = null;
    let pages = 0;
    do {
      const page = await listCurrentTermCourseGroups(
        token.userId,
        token.courseId,
        cursor
      );
      if (!scope.isCurrent(token)) return;
      refreshed.push(...page.items);
      hasMore = page.hasMore;
      nextCursor = page.nextCursor;
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      const refreshedIds = new Set(refreshed.map(group => group.groupId));
      if (
        !page.items.length ||
        !page.hasMore ||
        !page.nextCursor ||
        (refreshed.length >= targetCount &&
          [...knownIds].every(id => refreshedIds.has(id))) ||
        pages >= 20
      )
        break;
    } while (true);
    if (!scope.isCurrent(token)) return;
    setSnapshot(previous => {
      if (
        !previous ||
        !scope.isCurrent(previous.token) ||
        previous.token.generation !== token.generation ||
        (previous.token.authGeneration ?? 0) !== (token.authGeneration ?? 0)
      )
        return previous;
      const refreshedIds = new Set(refreshed.map(group => group.groupId));
      const missing = previous.groups.filter(
        group => !refreshedIds.has(group.groupId)
      );
      return {
        ...previous,
        groups: [...refreshed, ...missing],
        groupsHasMore: hasMore,
        groupsCursor: nextCursor,
      };
    });
  }

  /**
   * One capacity refresh: the loaded posts first, then the loaded group cards,
   * then the People summaries that render the same numbers. A failed attempt
   * keeps the drafts and loaded ranges and is reported as a failure; only a
   * refresh that actually reached the server claims it refreshed anything.
   */
  async function runCapacityRefresh(token: WorkspaceToken) {
    if (!scope.isCurrent(token)) return;
    postsOperation.current = true;
    groupsOperation.current = true;
    setPostsRefreshBusy(true);
    try {
      const knownIds = new Set(
        (latestSnapshot.current?.posts ?? []).map(post => post.id)
      );
      const targetCount = Math.max(1, knownIds.size);
      const refreshed: GroupRecruitmentPost[] = [];
      let cursor: RecruitmentPostCursor | undefined;
      let hasMore = false;
      let nextCursor: RecruitmentPostCursor | null = null;
      let pages = 0;
      do {
        const page = await listGroupRecruitmentPosts(
          token.userId,
          token.courseId,
          cursor
        );
        if (!scope.isCurrent(token)) return;
        refreshed.push(...page.items);
        hasMore = page.hasMore;
        nextCursor = page.nextCursor;
        cursor = page.nextCursor ?? undefined;
        pages += 1;
        const refreshedIds = new Set(refreshed.map(post => post.id));
        if (
          !page.items.length ||
          !page.hasMore ||
          !page.nextCursor ||
          (refreshed.length >= targetCount &&
            [...knownIds].every(id => refreshedIds.has(id))) ||
          pages >= 20
        )
          break;
      } while (true);
      if (!scope.isCurrent(token)) return;
      setSnapshot(previous => {
        if (
          !previous ||
          !scope.isCurrent(previous.token) ||
          previous.token.generation !== token.generation ||
          (previous.token.authGeneration ?? 0) !== (token.authGeneration ?? 0)
        )
          return previous;
        const refreshedIds = new Set(refreshed.map(post => post.id));
        const missing = previous.posts.filter(
          post => !refreshedIds.has(post.id)
        );
        return {
          ...previous,
          posts: [...refreshed, ...missing],
          postsHasMore: hasMore,
          postsCursor: nextCursor,
        };
      });
      await refreshGroupsForCapacity(token);
      if (!scope.isCurrent(token)) return;
      // People cards load their own summaries. Revalidate them too so a
      // refreshed post and its People card cannot show contradictory capacity.
      setPeopleRefreshToken(value => value + 1);
      setFeedback(REFRESH_SUCCESS_MESSAGE);
    } catch (refreshError) {
      if (scope.isCurrent(token)) {
        setFeedback(getStage6ErrorMessage(refreshError));
      }
    } finally {
      postsOperation.current = false;
      groupsOperation.current = false;
      if (scope.isCurrent(token)) setPostsRefreshBusy(false);
    }
  }

  async function applyToJoin(post: GroupRecruitmentPost) {
    const token = ownSnapshot?.token;
    if (
      !token ||
      !userId ||
      !post.groupId ||
      !canApplyToRecruitmentPost(post) ||
      busyAction
    )
      return;
    await runScopedAction(
      scope,
      token,
      () =>
        requestToJoinGroup(userId, post.groupId!, () => scope.isCurrent(token)),
      {
        start: () => {
          setBusyAction(`apply:${post.id}`);
          setFeedback("");
        },
        success: () => {
          setLocallyPendingPostIds(previous =>
            previous.includes(post.id) ? previous : [...previous, post.id]
          );
          setFeedback(
            "Join request sent. The group’s authorized reviewer still needs to decide; you are not added automatically."
          );
          // The pending state recorded above is durable: it stays visible even
          // when this refresh has to wait for a Load more or then fails.
          requestCapacityRefresh();
        },
        error: applyError =>
          setFeedback(getGroupWorkflowErrorMessage(applyError)),
        finally: () => setBusyAction(null),
      }
    );
  }

  async function createPost(
    event: FormEvent<HTMLFormElement>,
    group: StudyGroupRow
  ) {
    event.preventDefault();
    const token = ownSnapshot?.token;
    if (
      !token ||
      !ownSnapshot.eligibility.verified ||
      !ownSnapshot.eligibility.groups.some(item => item.id === group.id) ||
      creatingGroupId !== group.id ||
      busyAction ||
      !draft.trim() ||
      !postSubject.trim()
    )
      return;
    // Recheck synchronously after the last render/state checks and immediately
    // before claiming the write, so a course/account change cannot dispatch.
    if (!scope.isCurrent(token)) return;
    await runScopedAction(
      scope,
      token,
      () =>
        createGroupRecruitmentPost(
          token.userId,
          group.id,
          postSubject,
          draft,
          () => scope.isCurrent(token)
        ),
      {
        start: () => {
          setBusyAction(`create:${group.id}`);
          setFeedback("");
        },
        success: () => {
          setDraft("");
          setPostSubject("");
          setCreatingGroupId(null);
          setFeedback("Recruitment post created.");
          reload(token);
        },
        error: createError => setFeedback(getStage6ErrorMessage(createError)),
        finally: () => setBusyAction(null),
      }
    );
  }

  async function savePost(
    event: FormEvent<HTMLFormElement>,
    post: GroupRecruitmentPost
  ) {
    event.preventDefault();
    const token = ownSnapshot?.token;
    if (!token || busyAction || !draft.trim() || !postSubject.trim()) return;
    await runScopedAction(
      scope,
      token,
      () =>
        editGroupRecruitmentPost(
          token.userId,
          post.id,
          postSubject,
          draft,
          () => scope.isCurrent(token)
        ),
      {
        start: () => {
          setBusyAction(`edit:${post.id}`);
          setFeedback("");
        },
        success: () => {
          setEditingPostId(null);
          setDraft("");
          setPostSubject("");
          setFeedback("Recruitment post updated.");
          reload(token);
        },
        error: editError => setFeedback(getStage6ErrorMessage(editError)),
        finally: () => setBusyAction(null),
      }
    );
  }

  async function closePost(post: GroupRecruitmentPost) {
    const token = ownSnapshot?.token;
    if (!token || busyAction) return;
    await runScopedAction(
      scope,
      token,
      () =>
        closeGroupRecruitmentPost(token.userId, post.id, () =>
          scope.isCurrent(token)
        ),
      {
        start: () => {
          setBusyAction(`close:${post.id}`);
          setFeedback("");
        },
        success: () => {
          setFeedback(
            "Recruitment post closed. It remains visible but can no longer receive applications."
          );
          reload(token);
        },
        error: closeError => setFeedback(getStage6ErrorMessage(closeError)),
        finally: () => setBusyAction(null),
      }
    );
  }

  return (
    <Stage6Layout title="Study groups and recruitment">
      <PageHeading
        eyebrow="CURRENT-TERM COURSEMATES"
        title="Find your groupmate"
        description="See who is already in a group, who is looking for one, and browse recruitment posts below. The server rechecks your eligibility for every action."
      />
      <div className="stage6-notice" role="note">
        These screens use the authenticated Test APIs. No fictional group or
        student records are substituted. Apply to join calls Roy’s existing
        request service; it never adds you directly to a group.
      </div>
      {feedback && (
        <p className="stage6-feedback" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      <AuthenticatedCoursePeers
        embedded
        courseId={courseId}
        refreshToken={peopleRefreshToken}
      />

      {sessionStatus === "loading" ||
      state === "loading" ||
      (state === "ready" && !ownSnapshot) ? (
        <Stage6Status
          kind="loading"
          title="Loading current-term groups…"
          message="CityLink is checking the approved group and recruitment APIs."
        />
      ) : !userId ? (
        <Stage6Status
          kind="unauthorized"
          title="Sign in to browse groups"
          message={error}
        />
      ) : state === "error" ? (
        <Stage6Status
          title="Group discovery is unavailable"
          message={error}
          retry={() => reload()}
        />
      ) : (
        <>
          <section
            className="stage6-section"
            aria-labelledby="stage6-your-group-heading"
          >
            <div className="stage6-section-heading">
              <div>
                <p className="eyebrow">YOUR GROUP</p>
                <h2 id="stage6-your-group-heading">
                  Create a recruitment post
                </h2>
              </div>
            </div>
            {ownSnapshot?.eligibility.status === "checking" ? (
              <Stage6Status
                kind="loading"
                title="Checking posting eligibility…"
                message="Your group membership and current-term course enrolment are being checked. You can keep browsing or retry the check."
                retry={() => loadEligibility(ownSnapshot.token)}
              />
            ) : !ownSnapshot?.eligibility.verified ? (
              <Stage6Status
                title="Posting eligibility could not be verified"
                message="Your group membership, current-term course, or enrolment could not be confirmed. Check your connection and enrolment, then retry."
                retry={() => ownSnapshot && loadEligibility(ownSnapshot.token)}
              />
            ) : !ownSnapshot.eligibility.groups.length ? (
              <Stage6Status
                kind="empty"
                title="No eligible group found in this view"
                message="An active member of an active group can create a recruitment post. If your group is missing, check your course enrolment and retry."
                retry={() => loadEligibility(ownSnapshot.token)}
              />
            ) : (
              <div className="stage6-group-grid">
                {ownSnapshot.eligibility.groups.map(group => (
                  <article className="stage6-group-card" key={group.id}>
                    <span className="stage6-group-status active">Active</span>
                    <h3>{group.name || "Study group"}</h3>
                    <p className="stage6-group-caption">
                      You are an active member of this group. The server checks
                      your eligibility when you publish.
                    </p>
                    {creatingGroupId === group.id ? (
                      <form
                        className="stage6-post-form"
                        onSubmit={event => void createPost(event, group)}
                      >
                        <label htmlFor={`new-post-subject-${group.id}`}>
                          Subject
                        </label>
                        <input
                          id={`new-post-subject-${group.id}`}
                          value={postSubject}
                          maxLength={120}
                          onChange={event => setPostSubject(event.target.value)}
                          placeholder="e.g. Looking for a frontend teammate"
                          required
                          disabled={busyAction !== null}
                        />
                        <label htmlFor={`new-post-${group.id}`}>
                          Recruitment post
                        </label>
                        <textarea
                          id={`new-post-${group.id}`}
                          rows={4}
                          maxLength={MAX_RECRUITMENT_POST_LENGTH}
                          value={draft}
                          onChange={event => setDraft(event.target.value)}
                          placeholder="Describe the project and the type of teammate you are looking for."
                          disabled={busyAction !== null}
                        />
                        <div className="stage6-form-footer">
                          <span>
                            {draft.trim().length}/{MAX_RECRUITMENT_POST_LENGTH}{" "}
                            characters
                          </span>
                          <button
                            className="primary"
                            type="submit"
                            disabled={
                              !draft.trim() ||
                              !postSubject.trim() ||
                              busyAction !== null
                            }
                          >
                            {busyAction === `create:${group.id}`
                              ? "Publishing…"
                              : "Publish post"}
                          </button>
                        </div>
                        <button
                          className="text-button"
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => {
                            setCreatingGroupId(null);
                            setDraft("");
                            setPostSubject("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="stage6-create-post"
                        disabled={busyAction !== null}
                        onClick={() => {
                          if (busyAction !== null || scope.hasPendingAction())
                            return;
                          setCreatingGroupId(group.id);
                          setEditingPostId(null);
                          setDraft("");
                          setPostSubject("");
                        }}
                      >
                        Create recruitment post
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="stage6-section"
            aria-labelledby="stage6-groups-heading"
          >
            <div className="stage6-section-heading">
              <div>
                <p className="eyebrow">GROUPS</p>
                <h2 id="stage6-groups-heading">Browseable study groups</h2>
              </div>
              <span className="stage6-count">
                {ownSnapshot?.groups.length ?? 0}
              </span>
            </div>
            {ownSnapshot?.groupsState === "loading" ? (
              <Stage6Status
                kind="loading"
                title="Loading browseable groups…"
                message="CityLink is loading current-term groups for this course."
              />
            ) : ownSnapshot?.groupsState === "error" ? (
              <Stage6Status
                title="Group discovery is unavailable"
                message={ownSnapshot.groupsError}
                retry={() => loadGroups(ownSnapshot.token)}
              />
            ) : !ownSnapshot?.groups.length ? (
              <Stage6Status
                kind={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "loading"
                    : "empty"
                }
                title={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "Checking browseable group availability…"
                    : ownSnapshot?.eligibility.verified
                      ? "No browseable groups yet"
                      : "Browseable groups could not be confirmed"
                }
                message={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "The group list is empty; course and group information is still being checked."
                    : ownSnapshot?.eligibility.verified
                      ? "There are no forming or active groups with at least two active members available in this course’s current term. Pending invitations do not count as members."
                      : "Course or group information could not be confirmed, so group availability may be incomplete. Check your connection and enrolment, then retry."
                }
              />
            ) : (
              <div className="stage6-group-grid">
                {ownSnapshot.groups.map(group => (
                  <article className="stage6-group-card" key={group.groupId}>
                    <div className="stage6-card-topline">
                      <span className={`stage6-group-status ${group.status}`}>
                        {group.status === "forming" ? "Forming" : "Active"}
                      </span>
                      <span className="stage6-members-count">
                        <Users size={15} />
                        <Stage6CapacityCount
                          count={group.capacityCount}
                          maximum={group.maxMembers}
                        />
                      </span>
                    </div>
                    <h3>{group.groupName || "Study group"}</h3>
                    <Stage6CapacityStatus state={group.capacityState} />
                    <p className="stage6-group-caption">
                      Group details and member lists are checked again by the
                      server when opened.
                    </p>
                    <div className="stage6-card-actions">
                      <Link
                        className="secondary"
                        href={`/groups/${encodeURIComponent(group.groupId)}/members`}
                      >
                        View members
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {ownSnapshot?.groupsState === "ready" &&
              ownSnapshot.groupsHasMore && (
                <button
                  className="secondary"
                  type="button"
                  disabled={groupsPageBusy || postsRefreshBusy}
                  onClick={() => void loadMoreGroups()}
                >
                  {groupsPageBusy ? "Loading more groups…" : "Load more groups"}
                </button>
              )}
          </section>

          <section
            className="stage6-section"
            aria-labelledby="stage6-posts-heading"
          >
            <div className="stage6-section-heading">
              <div>
                <p className="eyebrow">RECRUITMENT</p>
                <h2 id="stage6-posts-heading">Posts for this course</h2>
              </div>
              <span className="stage6-count">
                {ownSnapshot?.posts.length ?? 0}
              </span>
            </div>
            {ownSnapshot?.postsState === "loading" ? (
              <Stage6Status
                kind="loading"
                title="Loading recruitment posts…"
                message="CityLink is loading recruitment posts for this course."
              />
            ) : ownSnapshot?.postsState === "error" ? (
              <Stage6Status
                title="Recruitment posts are unavailable"
                message={ownSnapshot.postsError}
                retry={() => loadPosts(ownSnapshot.token)}
              />
            ) : !ownSnapshot?.posts.length ? (
              <Stage6Status
                kind={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "loading"
                    : "empty"
                }
                title={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "Checking recruitment post availability…"
                    : ownSnapshot?.eligibility.verified
                      ? "No recruitment posts yet"
                      : "Recruitment posts could not be confirmed"
                }
                message={
                  ownSnapshot?.eligibility.status === "checking"
                    ? "The recruitment post list is empty; course and group information is still being checked."
                    : ownSnapshot?.eligibility.verified
                      ? "When an eligible active group member publishes a post, it will appear here."
                      : "Course or group information could not be confirmed, so post availability may be incomplete. Check your connection and enrolment, then retry."
                }
              />
            ) : (
              <div className="stage6-post-list">
                {ownSnapshot.posts.map(post => (
                  <article className="stage6-post-card" key={post.id}>
                    <div className="stage6-post-heading">
                      <div>
                        <span className={`stage6-post-status ${post.status}`}>
                          {post.status === "open" ? "Open" : "Closed"}
                        </span>
                        <h3>{post.subject}</h3>
                        <p className="stage6-post-group">
                          {post.groupName ?? "Group details unavailable"}
                        </p>
                        <p>
                          Posted by {post.authorName} ·{" "}
                          {new Date(post.createdAt).toLocaleDateString()}
                        </p>
                        {post.capacityCount !== null && (
                          <p>
                            <Stage6CapacityCount
                              count={post.capacityCount}
                              maximum={post.maxMembers}
                            />
                          </p>
                        )}
                      </div>
                      {post.groupId && post.groupName && (
                        <Link
                          className="text-link"
                          href={`/groups/${encodeURIComponent(post.groupId)}/members`}
                        >
                          Group details <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                    {post.capacityState !== null && (
                      <Stage6CapacityStatus state={post.capacityState} />
                    )}
                    <p className="stage6-post-body">{post.body}</p>
                    {post.groupId === null && (
                      <p className="stage6-readonly-note">
                        This post remains visible, but its group is not
                        available for coursemate browsing. Group details and all
                        actions are disabled.
                      </p>
                    )}
                    {post.status === "closed" && post.groupId !== null && (
                      <p className="stage6-readonly-note">
                        This post is closed. It remains visible, but cannot be
                        edited, reopened, or applied to.
                      </p>
                    )}
                    {editingPostId === post.id &&
                    post.groupId !== null &&
                    post.canManage &&
                    post.status === "open" ? (
                      <form
                        className="stage6-post-form"
                        onSubmit={event => void savePost(event, post)}
                      >
                        <label htmlFor={`edit-post-subject-${post.id}`}>
                          Subject
                        </label>
                        <input
                          id={`edit-post-subject-${post.id}`}
                          value={postSubject}
                          maxLength={120}
                          onChange={event => setPostSubject(event.target.value)}
                          required
                          disabled={busyAction !== null}
                        />
                        <label htmlFor={`edit-post-${post.id}`}>
                          Edit recruitment post
                        </label>
                        <textarea
                          id={`edit-post-${post.id}`}
                          rows={4}
                          maxLength={MAX_RECRUITMENT_POST_LENGTH}
                          value={draft}
                          onChange={event => setDraft(event.target.value)}
                          disabled={busyAction !== null}
                        />
                        <div className="stage6-form-footer">
                          <span>
                            {draft.trim().length}/{MAX_RECRUITMENT_POST_LENGTH}{" "}
                            characters
                          </span>
                          <button
                            className="primary"
                            type="submit"
                            disabled={
                              !draft.trim() ||
                              !postSubject.trim() ||
                              busyAction !== null
                            }
                          >
                            {busyAction === `edit:${post.id}`
                              ? "Saving…"
                              : "Save changes"}
                          </button>
                        </div>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setEditingPostId(null);
                            setDraft("");
                            setPostSubject("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="stage6-post-actions">
                        {post.groupId !== null &&
                          post.canManage &&
                          post.status === "open" && (
                            <>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busyAction !== null}
                                onClick={() => {
                                  if (
                                    busyAction !== null ||
                                    scope.hasPendingAction()
                                  )
                                    return;
                                  setEditingPostId(post.id);
                                  setCreatingGroupId(null);
                                  setDraft(post.body);
                                  setPostSubject(post.subject);
                                }}
                              >
                                Edit post
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busyAction !== null}
                                onClick={() => void closePost(post)}
                              >
                                {busyAction === `close:${post.id}`
                                  ? "Closing…"
                                  : "Close post"}
                              </button>
                            </>
                          )}
                        <Stage6ApplyControl
                          post={withLocalPendingState(
                            post,
                            locallyPendingPostIds.includes(post.id)
                          )}
                          busy={
                            busyAction !== null ||
                            postsRefreshBusy ||
                            postsPageBusy
                          }
                          applying={busyAction === `apply:${post.id}`}
                          onApply={() => void applyToJoin(post)}
                          onRefresh={() => {
                            requestCapacityRefresh();
                          }}
                          refreshState={
                            postsRefreshBusy
                              ? "running"
                              : refreshQueued
                                ? "queued"
                                : "idle"
                          }
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {ownSnapshot?.postsState === "ready" &&
              ownSnapshot.postsHasMore && (
                <button
                  className="secondary"
                  type="button"
                  disabled={postsPageBusy || postsRefreshBusy}
                  onClick={() => void loadMorePosts()}
                >
                  {postsPageBusy ? "Loading more posts…" : "Load more posts"}
                </button>
              )}
          </section>
        </>
      )}
    </Stage6Layout>
  );
}
