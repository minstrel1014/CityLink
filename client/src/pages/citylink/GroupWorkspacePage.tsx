import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Users } from "lucide-react";
import { Link } from "wouter";
import { GroupChatLink } from "@/components/citylink/GroupNavigationLinks";
import { PageHeading } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  closeGroupRecruitmentPost,
  createGroupRecruitmentPost,
  editGroupRecruitmentPost,
  getStage6ErrorMessage,
  listCourseUngroupedClassmates,
  listCurrentTermCourseGroups,
  listGroupRecruitmentPosts,
  MAX_RECRUITMENT_POST_LENGTH,
  type CourseGroupCursor,
  type CourseGroupSummary,
  type GroupRecruitmentPost,
  type RecruitmentPostCursor,
  type UngroupedCoursemate,
  type UngroupedCoursemateCursor,
} from "@/lib/supabaseStage6";
import {
  getGroupWorkflowErrorMessage,
  loadGroupWorkflowSnapshot,
  requestToJoinGroup,
  sendGroupInvitation,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

type LoadState = "loading" | "ready" | "error";
type Snapshot = {
  groups: CourseGroupSummary[];
  groupsHasMore: boolean;
  groupsCursor: CourseGroupCursor | null;
  posts: GroupRecruitmentPost[];
  postsHasMore: boolean;
  postsCursor: RecruitmentPostCursor | null;
  ungrouped: UngroupedCoursemate[];
  ungroupedHasMore: boolean;
  ungroupedCursor: UngroupedCoursemateCursor | null;
  ownGroups: StudyGroupRow[];
  activeGroupIds: string[];
  userId: string;
  generation: number;
};

export default function GroupWorkspacePage({ courseId }: { courseId: string }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [groupsPageBusy, setGroupsPageBusy] = useState(false);
  const [postsPageBusy, setPostsPageBusy] = useState(false);
  const [ungroupedPageBusy, setUngroupedPageBusy] = useState(false);
  const [personGroupChoice, setPersonGroupChoice] = useState<
    Record<string, string>
  >({});
  const [invitingPersonId, setInvitingPersonId] = useState<string | null>(null);
  const [creatingGroupId, setCreatingGroupId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [postSubject, setPostSubject] = useState("");
  const loadGeneration = useRef(0);

  useEffect(() => {
    const generation = ++loadGeneration.current;
    let active = true;
    const isCurrent = () =>
      active &&
      loadGeneration.current === generation &&
      currentUserId.current === userId;
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
    setFeedback("");
    void Promise.all([
      listCurrentTermCourseGroups(userId, courseId),
      listGroupRecruitmentPosts(userId, courseId),
      listCourseUngroupedClassmates(userId, courseId),
      loadGroupWorkflowSnapshot(userId),
    ])
      .then(([groupsPage, postsPage, ungroupedPage, ownSnapshot]) => {
        if (!isCurrent()) return;
        setSnapshot({
          groups: groupsPage.items,
          groupsHasMore: groupsPage.hasMore,
          groupsCursor: groupsPage.nextCursor,
          posts: postsPage.items,
          postsHasMore: postsPage.hasMore,
          postsCursor: postsPage.nextCursor,
          ungrouped: ungroupedPage.items,
          ungroupedHasMore: ungroupedPage.hasMore,
          ungroupedCursor: ungroupedPage.nextCursor,
          ownGroups: ownSnapshot.groups,
          activeGroupIds: ownSnapshot.memberships
            .filter(membership => membership.membership_status === "active")
            .map(membership => membership.group_id),
          userId,
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
      if (loadGeneration.current === generation) loadGeneration.current += 1;
    };
  }, [courseId, reloadToken, session.status, userId]);

  async function reload() {
    setReloadToken(value => value + 1);
  }

  async function loadMoreGroups() {
    if (
      !userId ||
      !ownSnapshot?.groupsHasMore ||
      !ownSnapshot.groupsCursor ||
      groupsPageBusy
    )
      return;
    setGroupsPageBusy(true);
    setFeedback("");
    const expectedGeneration = loadGeneration.current;
    try {
      const page = await listCurrentTermCourseGroups(
        userId,
        courseId,
        ownSnapshot.groupsCursor
      );
      if (
        currentUserId.current !== userId ||
        loadGeneration.current !== expectedGeneration
      )
        return;
      setSnapshot(previous => {
        if (
          !previous ||
          previous.userId !== userId ||
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
      setFeedback(getStage6ErrorMessage(pageError));
    } finally {
      setGroupsPageBusy(false);
    }
  }

  async function loadMorePosts() {
    if (
      !userId ||
      !ownSnapshot?.postsHasMore ||
      !ownSnapshot.postsCursor ||
      postsPageBusy
    )
      return;
    setPostsPageBusy(true);
    setFeedback("");
    const expectedGeneration = loadGeneration.current;
    try {
      const page = await listGroupRecruitmentPosts(
        userId,
        courseId,
        ownSnapshot.postsCursor
      );
      if (
        currentUserId.current !== userId ||
        loadGeneration.current !== expectedGeneration
      )
        return;
      setSnapshot(previous => {
        if (
          !previous ||
          previous.userId !== userId ||
          previous.generation !== expectedGeneration
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
      });
    } catch (pageError) {
      setFeedback(getStage6ErrorMessage(pageError));
    } finally {
      setPostsPageBusy(false);
    }
  }

  async function loadMoreUngrouped() {
    if (
      !userId ||
      !ownSnapshot?.ungroupedHasMore ||
      !ownSnapshot.ungroupedCursor ||
      ungroupedPageBusy
    )
      return;
    setUngroupedPageBusy(true);
    setFeedback("");
    const expectedGeneration = loadGeneration.current;
    try {
      const page = await listCourseUngroupedClassmates(
        userId,
        courseId,
        ownSnapshot.ungroupedCursor
      );
      if (
        currentUserId.current !== userId ||
        loadGeneration.current !== expectedGeneration
      )
        return;
      setSnapshot(previous => {
        if (
          !previous ||
          previous.userId !== userId ||
          previous.generation !== expectedGeneration
        )
          return previous;
        const known = new Set(
          previous.ungrouped.map(person => person.profileId)
        );
        return {
          ...previous,
          ungrouped: [
            ...previous.ungrouped,
            ...page.items.filter(person => !known.has(person.profileId)),
          ],
          ungroupedHasMore: page.hasMore,
          ungroupedCursor: page.nextCursor,
        };
      });
    } catch (pageError) {
      setFeedback(getStage6ErrorMessage(pageError));
    } finally {
      setUngroupedPageBusy(false);
    }
  }

  async function applyToJoin(post: GroupRecruitmentPost) {
    if (!userId || !post.groupId || !post.applyEnabled || busyAction) return;
    setBusyAction(`apply:${post.id}`);
    setFeedback("");
    try {
      await requestToJoinGroup(userId, post.groupId);
      setFeedback(
        "Join request sent. The group’s authorized reviewer still needs to decide; you are not added automatically."
      );
    } catch (applyError) {
      const message = getGroupWorkflowErrorMessage(applyError);
      setFeedback(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function createPost(
    event: FormEvent<HTMLFormElement>,
    group: CourseGroupSummary
  ) {
    event.preventDefault();
    if (!userId || busyAction || !draft.trim() || !postSubject.trim()) return;
    setBusyAction(`create:${group.groupId}`);
    setFeedback("");
    try {
      await createGroupRecruitmentPost(
        userId,
        group.groupId,
        postSubject,
        draft
      );
      setDraft("");
      setPostSubject("");
      setCreatingGroupId(null);
      setFeedback("Recruitment post created.");
      await reload();
    } catch (createError) {
      setFeedback(getStage6ErrorMessage(createError));
    } finally {
      setBusyAction(null);
    }
  }

  async function savePost(
    event: FormEvent<HTMLFormElement>,
    post: GroupRecruitmentPost
  ) {
    event.preventDefault();
    if (!userId || busyAction || !draft.trim() || !postSubject.trim()) return;
    setBusyAction(`edit:${post.id}`);
    setFeedback("");
    try {
      await editGroupRecruitmentPost(userId, post.id, postSubject, draft);
      setEditingPostId(null);
      setDraft("");
      setPostSubject("");
      setFeedback("Recruitment post updated.");
      await reload();
    } catch (editError) {
      setFeedback(getStage6ErrorMessage(editError));
    } finally {
      setBusyAction(null);
    }
  }

  async function closePost(post: GroupRecruitmentPost) {
    if (!userId || busyAction) return;
    setBusyAction(`close:${post.id}`);
    setFeedback("");
    try {
      await closeGroupRecruitmentPost(userId, post.id);
      setFeedback(
        "Recruitment post closed. It remains visible but can no longer receive applications."
      );
      await reload();
    } catch (closeError) {
      setFeedback(getStage6ErrorMessage(closeError));
    } finally {
      setBusyAction(null);
    }
  }

  const ownSnapshot = snapshot?.userId === userId ? snapshot : null;
  const inviteableGroups = ownSnapshot
    ? ownSnapshot.ownGroups.filter(
        group =>
          group.course_id === courseId &&
          (group.status === "forming" || group.status === "active") &&
          ownSnapshot.activeGroupIds.includes(group.id)
      )
    : [];

  async function invitePerson(person: UngroupedCoursemate) {
    if (!userId || !ownSnapshot || invitingPersonId) return;
    const groupId =
      personGroupChoice[person.profileId] ?? inviteableGroups[0]?.id;
    if (!groupId) return;
    setInvitingPersonId(person.profileId);
    setFeedback("");
    try {
      await sendGroupInvitation(userId, groupId, person.profileId);
      setFeedback(
        `Invitation sent to ${person.displayName}. They will appear in My Groups until they respond.`
      );
      await reload();
    } catch (inviteError) {
      setFeedback(getGroupWorkflowErrorMessage(inviteError));
    } finally {
      setInvitingPersonId(null);
    }
  }

  return (
    <Stage6Layout title="Study groups and recruitment">
      <PageHeading
        eyebrow="CURRENT-TERM COURSEMATES"
        title="Study groups and recruitment"
        description="Browse current-term groups and recruitment posts. The server rechecks your eligibility for every request."
      />
      <div className="stage6-notice" role="note">
        These screens use the authenticated Supabase APIs. No fictional group or
        student records are substituted. Apply to join calls Roy’s existing
        request service; it never adds you directly to a group.
      </div>
      {feedback && (
        <p className="stage6-feedback" role="status" aria-live="polite">
          {feedback}
        </p>
      )}

      {session.status === "loading" || state === "loading" ? (
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
            aria-labelledby="stage6-people-heading"
          >
            <div className="stage6-section-heading">
              <div>
                <p className="eyebrow">PEOPLE</p>
                <h2 id="stage6-people-heading">Coursemates without a group</h2>
              </div>
              <span className="stage6-count">
                {ownSnapshot?.ungrouped.length ?? 0}
              </span>
            </div>
            {!ownSnapshot?.ungrouped.length ? (
              <Stage6Status
                kind="empty"
                title="Everyone has a group"
                message="No current-term coursemates without a group are visible to you."
              />
            ) : (
              <div className="stage6-group-grid">
                {ownSnapshot.ungrouped.map(person => (
                  <article
                    className="stage6-group-card stage6-person-card"
                    key={person.profileId}
                  >
                    <div className="stage6-person-main">
                      <h3>{person.displayName}</h3>
                      <p className="stage6-group-caption">
                        {person.major ?? "Major not set"} · Year {person.year}
                      </p>
                      {person.skills.length > 0 && (
                        <p className="stage6-group-caption">
                          {person.skills.join(", ")}
                        </p>
                      )}
                      <Link
                        className="text-link"
                        href={`/my-courses/${encodeURIComponent(courseId)}/people/${encodeURIComponent(person.profileId)}`}
                      >
                        View profile <ArrowRight size={14} />
                      </Link>
                    </div>
                    <div className="stage6-person-actions">
                      {inviteableGroups.length > 0 ? (
                        <>
                          {inviteableGroups.length > 1 && (
                            <select
                              aria-label={`Choose a group for ${person.displayName}`}
                              value={
                                personGroupChoice[person.profileId] ??
                                inviteableGroups[0].id
                              }
                              onChange={event =>
                                setPersonGroupChoice(previous => ({
                                  ...previous,
                                  [person.profileId]: event.target.value,
                                }))
                              }
                            >
                              {inviteableGroups.map(group => (
                                <option value={group.id} key={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            className="secondary stage6-invite-button"
                            type="button"
                            disabled={invitingPersonId !== null}
                            onClick={() => void invitePerson(person)}
                          >
                            {invitingPersonId === person.profileId
                              ? "Sending…"
                              : "Invite to my group"}
                          </button>
                        </>
                      ) : (
                        <Link
                          className="secondary stage6-invite-button"
                          href={`/my-groups?courseId=${encodeURIComponent(courseId)}&invitee=${encodeURIComponent(person.profileId)}`}
                        >
                          Create a group
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {ownSnapshot?.ungroupedHasMore && (
              <button
                className="secondary"
                type="button"
                disabled={ungroupedPageBusy}
                onClick={() => void loadMoreUngrouped()}
              >
                {ungroupedPageBusy
                  ? "Loading more people…"
                  : "Load more people"}
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
