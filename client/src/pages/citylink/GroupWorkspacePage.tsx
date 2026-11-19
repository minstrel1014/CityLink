import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Users } from "lucide-react";
import { Link } from "wouter";
import { GroupChatLink } from "@/components/citylink/GroupNavigationLinks";
import { PageHeading } from "@/components/citylink/Shared";
import AuthenticatedCoursePeers from "@/pages/citylink/AuthenticatedCoursePeers";
import {
  useSupabaseSession,
  type SupabaseSessionState,
} from "@/contexts/SupabaseSessionContext";
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
  loadGroupWorkflowSnapshot,
  requestToJoinGroup,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  appendCurrentRecruitmentPage,
  createActionOwner,
  createRequestGeneration,
  isCurrentCourseSnapshot,
  matchesCourseScope,
  requestWithCourseInvalidation,
  subscribeCourseRequestInvalidation,
} from "@/lib/courseRequestRefresh";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

type LoadState = "loading" | "ready" | "error";
type Snapshot = {
  groups: CourseGroupSummary[];
  groupsHasMore: boolean;
  groupsCursor: CourseGroupCursor | null;
  posts: GroupRecruitmentPost[];
  postsHasMore: boolean;
  postsCursor: RecruitmentPostCursor | null;
  ownGroups: StudyGroupRow[];
  activeGroupIds: string[];
  userId: string;
  courseId: string;
  generation: number;
};

export default function GroupWorkspacePage({ courseId }: { courseId: string }) {
  const session = useSupabaseSession();
  const key = JSON.stringify([
    session.status,
    session.user?.id ?? null,
    courseId,
  ]);
  return <GroupWorkspaceView key={key} courseId={courseId} session={session} />;
}

function GroupWorkspaceView({
  courseId,
  session,
}: {
  courseId: string;
  session: SupabaseSessionState;
}) {
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const scope = { userId, courseId };
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [groupsPageBusy, setGroupsPageBusy] = useState(false);
  const [postsPageBusy, setPostsPageBusy] = useState(false);
  const [creatingGroupId, setCreatingGroupId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [postSubject, setPostSubject] = useState("");
  const loadGeneration = useRef(createRequestGeneration()).current;
  const actions = useRef(createActionOwner()).current;
  const mounted = useRef(false);
  const groupsPageRequest = useRef<symbol | null>(null);
  const postsPageRequest = useRef<symbol | null>(null);

  useEffect(() => {
    mounted.current = true;
    actions.mount();
    return () => {
      mounted.current = false;
      actions.unmount();
      loadGeneration.invalidate();
      groupsPageRequest.current = null;
      postsPageRequest.current = null;
    };
  }, [actions, loadGeneration]);

  function reload() {
    // Invalidate synchronously, before React schedules the fresh reads. This
    // prevents already-running pagination from restoring stale eligibility.
    loadGeneration.invalidate();
    groupsPageRequest.current = null;
    postsPageRequest.current = null;
    setGroupsPageBusy(false);
    setPostsPageBusy(false);
    setSnapshot(null);
    setState("loading");
    setReloadToken(value => value + 1);
  }

  useEffect(
    () =>
      subscribeCourseRequestInvalidation(() => currentScope.current, reload),
    [loadGeneration]
  );

  useEffect(() => {
    const generation = loadGeneration.invalidate();
    let active = true;
    const isCurrent = () =>
      active &&
      loadGeneration.isCurrent(generation) &&
      matchesCourseScope(currentScope.current, scope);
    if (session.status === "loading") {
      setState("loading");
      return () => {
        active = false;
      };
    }
    if (!userId) {
      setSnapshot(null);
      setState("error");
      setError(
        "Sign in with a Supabase account to browse current-term groups."
      );
      return () => {
        active = false;
      };
    }

    setSnapshot(null);
    setState("loading");
    setError("");
    void Promise.all([
      listCurrentTermCourseGroups(userId, courseId),
      listGroupRecruitmentPosts(userId, courseId),
      loadGroupWorkflowSnapshot(userId),
    ])
      .then(([groupsPage, postsPage, ownSnapshot]) => {
        if (!isCurrent()) return;
        setSnapshot({
          groups: groupsPage.items,
          groupsHasMore: groupsPage.hasMore,
          groupsCursor: groupsPage.nextCursor,
          posts: postsPage.items,
          postsHasMore: postsPage.hasMore,
          postsCursor: postsPage.nextCursor,
          ownGroups: ownSnapshot.groups,
          activeGroupIds: ownSnapshot.memberships
            .filter(membership => membership.membership_status === "active")
            .map(membership => membership.group_id),
          userId,
          courseId,
          generation,
        });
        setState("ready");
      })
      .catch(loadError => {
        if (!isCurrent()) return;
        setError(getStage6ErrorMessage(loadError));
        setState("error");
      });

    return () => {
      active = false;
      if (loadGeneration.isCurrent(generation)) loadGeneration.invalidate();
    };
  }, [courseId, loadGeneration, reloadToken, session.status, userId]);

  async function loadMoreGroups() {
    if (
      !userId ||
      !ownSnapshot?.groupsHasMore ||
      !ownSnapshot.groupsCursor ||
      groupsPageRequest.current ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const pageToken = Symbol("groups-page");
    groupsPageRequest.current = pageToken;
    const expectedGeneration = ownSnapshot.generation;
    const isCurrent = () =>
      mounted.current &&
      matchesCourseScope(currentScope.current, scope) &&
      loadGeneration.isCurrent(expectedGeneration) &&
      groupsPageRequest.current === pageToken;
    setGroupsPageBusy(true);
    setFeedback("");
    try {
      const page = await listCurrentTermCourseGroups(
        userId,
        courseId,
        ownSnapshot.groupsCursor
      );
      if (!isCurrent()) return;
      setSnapshot(previous => {
        if (
          !mounted.current ||
          !loadGeneration.isCurrent(expectedGeneration) ||
          !matchesCourseScope(currentScope.current, scope) ||
          !matchesCourseScope(previous, scope) ||
          !previous ||
          previous.generation !== expectedGeneration
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
      });
    } catch (pageError) {
      if (isCurrent()) setFeedback(getStage6ErrorMessage(pageError));
    } finally {
      if (isCurrent()) {
        groupsPageRequest.current = null;
        setGroupsPageBusy(false);
      }
    }
  }

  async function loadMorePosts() {
    if (
      !userId ||
      !ownSnapshot?.postsHasMore ||
      !ownSnapshot.postsCursor ||
      postsPageRequest.current ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const pageToken = Symbol("posts-page");
    postsPageRequest.current = pageToken;
    const expectedGeneration = ownSnapshot.generation;
    const isCurrent = () =>
      mounted.current &&
      matchesCourseScope(currentScope.current, scope) &&
      loadGeneration.isCurrent(expectedGeneration) &&
      postsPageRequest.current === pageToken;
    setPostsPageBusy(true);
    setFeedback("");
    try {
      const page = await listGroupRecruitmentPosts(
        userId,
        courseId,
        ownSnapshot.postsCursor
      );
      if (!isCurrent()) return;
      setSnapshot(previous => {
        if (
          !mounted.current ||
          !matchesCourseScope(currentScope.current, scope)
        )
          return previous;
        return appendCurrentRecruitmentPage(
          previous,
          { userId, courseId },
          expectedGeneration,
          loadGeneration.current(),
          page
        );
      });
    } catch (pageError) {
      if (isCurrent()) setFeedback(getStage6ErrorMessage(pageError));
    } finally {
      if (isCurrent()) {
        postsPageRequest.current = null;
        setPostsPageBusy(false);
      }
    }
  }

  async function applyToJoin(post: GroupRecruitmentPost) {
    if (
      !userId ||
      !post.groupId ||
      !post.applyEnabled ||
      busyAction ||
      !ownSnapshot ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const action = actions.begin();
    if (!action) return;
    setBusyAction(`apply:${post.id}`);
    setFeedback("");
    try {
      await requestWithCourseInvalidation({ userId, courseId }, () =>
        requestToJoinGroup(userId, post.groupId!)
      );
      if (!actions.isCurrent(action)) return;
      setFeedback(
        "Join request sent. The group’s authorized reviewer still needs to decide; you are not added automatically."
      );
    } catch (applyError) {
      if (!actions.isCurrent(action)) return;
      setFeedback(getGroupWorkflowErrorMessage(applyError));
    } finally {
      if (actions.finish(action)) setBusyAction(null);
    }
  }

  async function createPost(
    event: FormEvent<HTMLFormElement>,
    group: CourseGroupSummary
  ) {
    event.preventDefault();
    if (
      !userId ||
      busyAction ||
      !draft.trim() ||
      !postSubject.trim() ||
      !ownSnapshot ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const action = actions.begin();
    if (!action) return;
    setBusyAction(`create:${group.groupId}`);
    setFeedback("");
    try {
      await createGroupRecruitmentPost(
        userId,
        group.groupId,
        postSubject,
        draft
      );
      if (!actions.isCurrent(action)) return;
      setDraft("");
      setPostSubject("");
      setCreatingGroupId(null);
      setFeedback("Recruitment post created.");
      reload();
    } catch (createError) {
      if (actions.isCurrent(action))
        setFeedback(getStage6ErrorMessage(createError));
    } finally {
      if (actions.finish(action)) setBusyAction(null);
    }
  }

  async function savePost(
    event: FormEvent<HTMLFormElement>,
    post: GroupRecruitmentPost
  ) {
    event.preventDefault();
    if (
      !userId ||
      busyAction ||
      !draft.trim() ||
      !postSubject.trim() ||
      !ownSnapshot ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const action = actions.begin();
    if (!action) return;
    setBusyAction(`edit:${post.id}`);
    setFeedback("");
    try {
      await editGroupRecruitmentPost(userId, post.id, postSubject, draft);
      if (!actions.isCurrent(action)) return;
      setEditingPostId(null);
      setDraft("");
      setPostSubject("");
      setFeedback("Recruitment post updated.");
      reload();
    } catch (editError) {
      if (actions.isCurrent(action))
        setFeedback(getStage6ErrorMessage(editError));
    } finally {
      if (actions.finish(action)) setBusyAction(null);
    }
  }

  async function closePost(post: GroupRecruitmentPost) {
    if (
      !userId ||
      busyAction ||
      !ownSnapshot ||
      !loadGeneration.isCurrent(ownSnapshot.generation)
    )
      return;
    const action = actions.begin();
    if (!action) return;
    setBusyAction(`close:${post.id}`);
    setFeedback("");
    try {
      await closeGroupRecruitmentPost(userId, post.id);
      if (!actions.isCurrent(action)) return;
      setFeedback(
        "Recruitment post closed. It remains visible but can no longer receive applications."
      );
      reload();
    } catch (closeError) {
      if (actions.isCurrent(action))
        setFeedback(getStage6ErrorMessage(closeError));
    } finally {
      if (actions.finish(action)) setBusyAction(null);
    }
  }

  const ownSnapshot = isCurrentCourseSnapshot(
    snapshot,
    scope,
    loadGeneration.current()
  )
    ? snapshot
    : null;
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
      <AuthenticatedCoursePeers embedded courseId={courseId} />

      {session.status === "loading" ||
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
          retry={() => void reload()}
        />
      ) : (
        <>
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
            {!ownSnapshot?.groups.length ? (
              <Stage6Status
                kind="empty"
                title="No browseable groups yet"
                message="There are no forming or active groups with at least two active members available in this course’s current term. Pending invitations do not count as members."
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
                        <Users size={15} /> {group.activeMemberCount} active{" "}
                        {group.activeMemberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                    <h3>{group.groupName || "Study group"}</h3>
                    <p className="stage6-group-caption">
                      Group details and member lists are checked again by the
                      server when opened.
                    </p>
                    <div className="stage6-card-actions">
                      {group.canCreatePost && (
                        <GroupChatLink
                          groupId={group.groupId}
                          className="secondary"
                        >
                          Open chat <ArrowRight size={15} />
                        </GroupChatLink>
                      )}
                      <Link
                        className="secondary"
                        href={`/groups/${encodeURIComponent(group.groupId)}/members`}
                      >
                        View members
                      </Link>
                    </div>
                    {group.canCreatePost &&
                      (creatingGroupId === group.groupId ? (
                        <form
                          className="stage6-post-form"
                          onSubmit={event => void createPost(event, group)}
                        >
                          <label htmlFor={`new-post-subject-${group.groupId}`}>
                            Subject
                          </label>
                          <input
                            id={`new-post-subject-${group.groupId}`}
                            value={postSubject}
                            maxLength={120}
                            onChange={event =>
                              setPostSubject(event.target.value)
                            }
                            placeholder="e.g. Looking for a frontend teammate"
                            required
                            disabled={busyAction !== null}
                          />
                          <label htmlFor={`new-post-${group.groupId}`}>
                            Recruitment post
                          </label>
                          <textarea
                            id={`new-post-${group.groupId}`}
                            rows={4}
                            maxLength={MAX_RECRUITMENT_POST_LENGTH}
                            value={draft}
                            onChange={event => setDraft(event.target.value)}
                            placeholder="Describe the project and the type of teammate you are looking for."
                            disabled={busyAction !== null}
                          />
                          <div className="stage6-form-footer">
                            <span>
                              {draft.trim().length}/
                              {MAX_RECRUITMENT_POST_LENGTH} characters
                            </span>
                            <button
                              className="primary"
                              type="submit"
                              disabled={!draft.trim() || busyAction !== null}
                            >
                              {busyAction === `create:${group.groupId}`
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
                            setCreatingGroupId(group.groupId);
                            setDraft("");
                          }}
                        >
                          Create recruitment post
                        </button>
                      ))}
                  </article>
                ))}
              </div>
            )}
            {ownSnapshot?.groupsHasMore && (
              <button
                className="secondary"
                type="button"
                disabled={groupsPageBusy}
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
            {!ownSnapshot?.posts.length ? (
              <Stage6Status
                kind="empty"
                title="No recruitment posts yet"
                message="When an eligible active group member publishes a post, it will appear here."
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
                          {post.activeMemberCount !== null &&
                            ` · ${post.activeMemberCount} active ${post.activeMemberCount === 1 ? "member" : "members"}`}
                        </p>
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
                    {editingPostId === post.id ? (
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
                          disabled={busyAction !== null}
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
                        {post.canManage && post.status === "open" && (
                          <>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busyAction !== null}
                              onClick={() => {
                                setEditingPostId(post.id);
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
                        {post.status === "open" &&
                          post.applyEnabled &&
                          post.groupId && (
                            <button
                              type="button"
                              className="primary"
                              disabled={busyAction !== null}
                              onClick={() => void applyToJoin(post)}
                            >
                              {busyAction === `apply:${post.id}`
                                ? "Sending request…"
                                : "Apply to join"}
                            </button>
                          )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {ownSnapshot?.postsHasMore && (
              <button
                className="secondary"
                type="button"
                disabled={postsPageBusy}
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
