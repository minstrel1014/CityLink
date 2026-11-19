import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, RefreshCw, Send, Users, X } from "lucide-react";
import { Link } from "wouter";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { invitationAcceptanceFeedback } from "@/lib/invitationAcceptance";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  loadCourseDirectory,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";
import {
  cancelGroupInvitation,
  cancelGroupJoinRequest,
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listCourseGroupPeers,
  loadGroupWorkflowSnapshot,
  renameStudyGroup,
  requestToJoinGroup,
  respondToGroupInvitation,
  reviewGroupJoinRequest,
  sendGroupInvitation,
  type GroupCoursePeer,
  type GroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { PageHeading } from "@/components/citylink/Shared";
import { GroupChatLink } from "@/components/citylink/GroupNavigationLinks";
import "./GroupWorkflows.css";

type Feedback = { tone: "success" | "error"; message: string };

type WorkflowData = {
  userId: string;
  courses: CourseDirectorySnapshot;
  groups: GroupWorkflowSnapshot;
};

function AccessMessage({
  email,
  title,
  children,
}: {
  email?: string;
  title: string;
  children: string;
}) {
  return (
    <div className="authenticated-courses-page">
      <AccountHeader email={email} />
      <main className="authenticated-courses-main">
        <section className="authenticated-courses-state" role="status">
          <span className="authenticated-courses-state-icon">
            <Users size={27} />
          </span>
          <p className="eyebrow">SUPABASE GROUP WORKFLOWS</p>
          <h1>{title}</h1>
          <p>{children}</p>
          <div className="authenticated-courses-state-actions">
            <Link href="/" className="primary">
              Sign-in page <ArrowRight size={16} />
            </Link>
            <Link href="/my-courses" className="secondary">
              My Courses
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function prettyStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default function GroupWorkflows() {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [peers, setPeers] = useState<GroupCoursePeer[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState("");
  const [firstInviteeId, setFirstInviteeId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [renameGroupId, setRenameGroupId] = useState("");
  const [existingGroupId, setExistingGroupId] = useState("");
  const [inviteeId, setInviteeId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [prefill] = useState(() => {
    if (typeof window === "undefined") {
      return { courseId: "", inviteeId: "" };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      courseId: params.get("courseId") ?? "",
      inviteeId: params.get("invitee") ?? "",
    };
  });
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    let active = true;
    const isCurrent = () =>
      active &&
      requestGeneration.current === generation &&
      userIdRef.current === userId;

    if (session.status !== "ready" || !userId || !supabaseClient) {
      setData(null);
      setLoading(false);
      setLoadError("");
      return () => {
        active = false;
        if (requestGeneration.current === generation)
          requestGeneration.current += 1;
      };
    }

    setLoading(true);
    setLoadError("");
    void Promise.all([
      loadCourseDirectory(userId),
      loadGroupWorkflowSnapshot(userId),
    ])
      .then(([courses, groups]) => {
        if (!isCurrent()) return;
        setData({ userId, courses, groups });
        setLoading(false);
        setSelectedCourseId(previous => {
          if (previous && courses.enrolledCourseIds.includes(previous)) {
            return previous;
          }
          if (
            prefill.courseId &&
            courses.enrolledCourseIds.includes(prefill.courseId)
          ) {
            return prefill.courseId;
          }
          return courses.enrolledCourseIds[0] ?? "";
        });
      })
      .catch(error => {
        if (!isCurrent()) return;
        setLoadError(getGroupWorkflowErrorMessage(error));
        setLoading(false);
      });

    return () => {
      active = false;
      if (requestGeneration.current === generation)
        requestGeneration.current += 1;
    };
  }, [retryToken, session.status, userId]);

  useEffect(() => {
    let active = true;
    if (!userId || !selectedCourseId) {
      setPeers([]);
      setFirstInviteeId("");
      setExistingGroupId("");
      setInviteeId("");
      setPeerError("");
      setPeerLoading(false);
      return () => {
        active = false;
      };
    }
    setPeerLoading(true);
    setPeerError("");
    setFirstInviteeId("");
    setExistingGroupId("");
    setInviteeId("");
    void listCourseGroupPeers(userId, selectedCourseId)
      .then(result => {
        if (!active) return;
        setPeers(result);
        setFirstInviteeId(
          selectedCourseId === prefill.courseId &&
            result.some(peer => peer.profile_id === prefill.inviteeId)
            ? prefill.inviteeId
            : ""
        );
        setInviteeId("");
        setPeerLoading(false);
      })
      .catch(error => {
        if (!active) return;
        setPeers([]);
        setPeerError(getGroupWorkflowErrorMessage(error));
        setPeerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [prefill.courseId, prefill.inviteeId, selectedCourseId, userId]);

  const ownData = data?.userId === userId ? data : null;
  const enrolledCourses = useMemo(() => {
    if (!ownData) return [];
    const enrolled = new Set(ownData.courses.enrolledCourseIds);
    return ownData.courses.courses.filter(course => enrolled.has(course.id));
  }, [ownData]);
  const selectedCourse = enrolledCourses.find(
    course => course.id === selectedCourseId
  );
  const courseById = useMemo(
    () =>
      new Map(
        (ownData?.courses.courses ?? []).map(course => [course.id, course])
      ),
    [ownData]
  );
  const groupById = useMemo(
    () =>
      new Map((ownData?.groups.groups ?? []).map(group => [group.id, group])),
    [ownData]
  );
  const availablePeers = peers.filter(
    peer => peer.status === "open" || peer.status === "considering"
  );
  const memberships = ownData?.groups.memberships ?? [];
  const activeMembershipGroupIds = new Set(
    memberships
      .filter(membership => membership.membership_status === "active")
      .map(membership => membership.group_id)
  );
  const groupsInCourse = (ownData?.groups.groups ?? []).filter(
    group =>
      group.course_id === selectedCourseId &&
      (group.status === "forming" || group.status === "active")
  );
  const inviteableGroups = groupsInCourse.filter(
    group =>
      activeMembershipGroupIds.has(group.id) ||
      (group.status === "forming" && group.creator_id === userId)
  );
  const requestableGroups = groupsInCourse.filter(
    group =>
      group.status === "active" && !activeMembershipGroupIds.has(group.id)
  );
  const myGroups = groupsInCourse.filter(group =>
    activeMembershipGroupIds.has(group.id)
  );
  const leaderGroupIds = new Set(
    (ownData?.groups.groups ?? [])
      .filter(
        group =>
          group.status === "active" &&
          group.creator_id === userId &&
          activeMembershipGroupIds.has(group.id)
      )
      .map(group => group.id)
  );
  const incomingInvitations = ownData?.groups.incomingInvitations ?? [];
  const outgoingInvitations = ownData?.groups.outgoingInvitations ?? [];
  const joinRequests = ownData?.groups.joinRequests ?? [];

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    success: string | ((result: unknown) => Feedback)
  ) {
    if (!userId || busyAction) return;
    setBusyAction(key);
    setFeedback(null);
    try {
      const result = await action();
      setFeedback(
        typeof success === "function"
          ? success(result)
          : { tone: "success", message: success }
      );
      setNewGroupName("");
      setRenameName("");
      setRenameGroupId("");
      setRetryToken(value => value + 1);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      setBusyAction("");
    }
  }

  function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !selectedCourseId || !firstInviteeId) return;
    const name = newGroupName.trim();
    if (!name || name.length > 50) {
      setFeedback({
        tone: "error",
        message: "Enter a group name between 1 and 50 characters.",
      });
      return;
    }
    void runAction(
      "create",
      () =>
        createGroupAndInvite(userId, selectedCourseId, firstInviteeId, name),
      "Your group is created and the first invitation has been sent."
    );
  }

  function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !existingGroupId || !inviteeId) return;
    void runAction(
      "invite",
      () => sendGroupInvitation(userId, existingGroupId, inviteeId),
      "Your group invitation has been sent."
    );
  }

  if (session.status === "loading") {
    return (
      <AccessMessage title="Checking your sign-in…">
        CityLink is restoring your Supabase session before loading group data.
      </AccessMessage>
    );
  }
  if (session.status === "error") {
    return (
      <AccessMessage title="Your sign-in is unavailable">
        We could not restore your account session. Return to the sign-in page
        and try again.
      </AccessMessage>
    );
  }
  if (!userId) {
    return (
      <AccessMessage title="Sign in to use group features">
        Group creation, invitations, and join requests use your authenticated
        CityLink account.
      </AccessMessage>
    );
  }
  if (!supabaseClient) {
    return (
      <AccessMessage
        email={session.user?.email}
        title="Supabase is not configured"
      >
        This page needs the real Supabase connection. It does not fall back to
        fictional demo data.
      </AccessMessage>
    );
  }

  return (
    <div className="authenticated-courses-page group-workflows-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <PageHeading
          eyebrow="SUPABASE GROUP WORKFLOWS"
          title="Find your group"
          description="Create a group, invite coursemates, or request to join an active group. These actions use your signed-in Supabase account."
        />
        <div className="group-workflows-intro" role="note">
          Group size is not limited. Invitations and join requests follow the
          rule “first pending action wins.” Only the current group leader
          reviews join requests; the server enforces this after leader
          succession.
        </div>

        {prefill.inviteeId &&
          selectedCourseId === prefill.courseId &&
          peers.some(peer => peer.profile_id === prefill.inviteeId) && (
            <div className="group-workflows-intro" role="note">
              Starting a new group with{" "}
              <strong>
                {
                  peers.find(peer => peer.profile_id === prefill.inviteeId)
                    ?.display_name
                }
              </strong>{" "}
              selected as the first invitee from the people list.
            </div>
          )}
        <div className="group-workflows-toolbar">
          <label htmlFor="group-course-filter">
            Choose one of your enrolled courses
            <select
              id="group-course-filter"
              value={selectedCourseId}
              onChange={event => {
                setSelectedCourseId(event.target.value);
                setFirstInviteeId("");
                setExistingGroupId("");
                setInviteeId("");
                setPeers([]);
              }}
              disabled={loading || enrolledCourses.length === 0}
            >
              {enrolledCourses.length === 0 && (
                <option value="">No enrolled courses</option>
              )}
              {enrolledCourses.map(course => (
                <option value={course.id} key={course.id}>
                  {course.code} · {course.title}
                </option>
              ))}
            </select>
          </label>
          {selectedCourse && (
            <span className="course-membership enrolled">
              {selectedCourse.semester}
            </span>
          )}
        </div>

        {feedback && (
          <p
            className={`group-workflow-feedback ${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
        {loadError && (
          <div className="course-directory-feedback error" role="alert">
            {loadError}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => setRetryToken(value => value + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {loading && (
          <div className="course-directory-state" role="status">
            <span className="spinner" /> Loading your Supabase groups and
            invitations…
          </div>
        )}
        {!loading && !loadError && !enrolledCourses.length && (
          <div className="group-workflow-empty">
            <strong>You need an enrolled course first.</strong> Add a course
            from the authenticated catalogue before creating a group or
            requesting to join one.
            <br />
            <Link href="/my-courses">
              Open My Courses <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {!loading && !loadError && enrolledCourses.length > 0 && (
          <div className="group-workflow-grid">
            <section className="group-workflow-panel">
              <h2>Create a group</h2>
              <p>
                The first invited coursemate receives an invitation. The group
                is established by the RPC; the first inviter is its leader.
              </p>
              <form className="group-workflow-form" onSubmit={createGroup}>
                <label htmlFor="new-group-name">Group name</label>
                <input
                  id="new-group-name"
                  value={newGroupName}
                  maxLength={50}
                  onChange={event => setNewGroupName(event.target.value)}
                  placeholder="e.g. Business Strategy Team"
                  required
                  disabled={busyAction !== ""}
                />
                <span className="group-workflow-peek">
                  {newGroupName.trim().length}/50 characters
                </span>
                <label htmlFor="first-group-invitee">
                  Choose the first person to invite
                </label>
                <select
                  id="first-group-invitee"
                  value={firstInviteeId}
                  onChange={event => setFirstInviteeId(event.target.value)}
                  required
                  disabled={peerLoading || !availablePeers.length}
                >
                  <option value="">
                    {peerLoading
                      ? "Loading enrolled coursemates…"
                      : availablePeers.length
                        ? "Select a coursemate"
                        : "No eligible coursemates available"}
                  </option>
                  {availablePeers.map(peer => (
                    <option value={peer.profile_id} key={peer.profile_id}>
                      {peer.display_name}
                      {peer.major ? ` · ${peer.major}` : ""}
                    </option>
                  ))}
                </select>
                {peerError && (
                  <p className="group-workflow-feedback error" role="alert">
                    {peerError}
                  </p>
                )}
                {!peerLoading &&
                  selectedCourseId &&
                  peers.length > 0 &&
                  !availablePeers.length && (
                    <p className="group-workflow-peek">
                      Your enrolled coursemates are not currently accepting
                      group invitations.
                    </p>
                  )}
                <button
                  className="primary"
                  disabled={
                    !newGroupName.trim() ||
                    !firstInviteeId ||
                    busyAction !== "" ||
                    peerLoading
                  }
                >
                  <Users size={16} />
                  {busyAction === "create"
                    ? "Creating group…"
                    : "Create group and invite"}
                </button>
              </form>
            </section>

            {myGroups.length > 0 && (
              <section className="group-workflow-panel wide">
                <h2>Your group</h2>
                <p>
                  Open your private group chat or review the member list. Only
                  the current group leader can rename a group; names must be
                  1–50 characters.
                </p>
                <div className="group-workflow-list">
                  {myGroups.map(group => {
                    const isLeader = group.creator_id === userId;
                    return (
                      <article
                        className="group-workflow-item"
                        key={`manage-${group.id}`}
                      >
                        <div className="group-workflow-item-top">
                          <div>
                            <h3>{group.name || "Study group"}</h3>
                            <p>
                              {prettyStatus(group.status)} ·{" "}
                              {isLeader
                                ? "You are the leader"
                                : "You are a member"}
                            </p>
                          </div>
                          <div className="group-workflow-actions">
                            <GroupChatLink
                              groupId={group.id}
                              className="secondary"
                            >
                              Open private chat
                            </GroupChatLink>
                            <Link
                              className="secondary"
                              href={`/groups/${encodeURIComponent(group.id)}/members`}
                            >
                              View members
                            </Link>
                          </div>
                        </div>
                        {isLeader &&
                          (renameGroupId === group.id ? (
                            <form
                              className="group-workflow-form"
                              onSubmit={event => {
                                event.preventDefault();
                                const name = renameName.trim();
                                if (!name || name.length > 50) {
                                  setFeedback({
                                    tone: "error",
                                    message:
                                      "Enter a group name between 1 and 50 characters.",
                                  });
                                  return;
                                }
                                void runAction(
                                  `rename-${group.id}`,
                                  () =>
                                    renameStudyGroup(userId, group.id, name),
                                  "Your group name was updated."
                                );
                              }}
                            >
                              <label htmlFor={`rename-${group.id}`}>
                                New group name
                              </label>
                              <input
                                id={`rename-${group.id}`}
                                value={renameName}
                                maxLength={50}
                                onChange={event =>
                                  setRenameName(event.target.value)
                                }
                                required
                              />
                              <div className="group-workflow-actions">
                                <button
                                  className="primary"
                                  disabled={
                                    busyAction !== "" || !renameName.trim()
                                  }
                                >
                                  {busyAction === `rename-${group.id}`
                                    ? "Saving…"
                                    : "Save name"}
                                </button>
                                <button
                                  className="secondary"
                                  type="button"
                                  onClick={() => setRenameGroupId("")}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => {
                                setRenameGroupId(group.id);
                                setRenameName(group.name);
                              }}
                            >
                              Rename group
                            </button>
                          ))}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="group-workflow-panel">
              <h2>Invite someone to your group</h2>
              <p>
                Any active member can invite to a forming or active group. If a
                group is forming before it has active members, its creator can
                send the first invitation. You can cancel a pending invitation
                below.
              </p>
              {inviteableGroups.length ? (
                <form className="group-workflow-form" onSubmit={sendInvite}>
                  <label htmlFor="invite-group">Group</label>
                  <select
                    id="invite-group"
                    value={existingGroupId}
                    onChange={event => setExistingGroupId(event.target.value)}
                    required
                  >
                    <option value="">Select your group</option>
                    {inviteableGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.name || "Study group"} ·{" "}
                        {prettyStatus(group.status)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="invite-peer">Coursemate</label>
                  <select
                    id="invite-peer"
                    value={inviteeId}
                    onChange={event => setInviteeId(event.target.value)}
                    required
                    disabled={!availablePeers.length || peerLoading}
                  >
                    <option value="">
                      {peerLoading
                        ? "Loading coursemates…"
                        : "Select a coursemate"}
                    </option>
                    {availablePeers.map(peer => (
                      <option value={peer.profile_id} key={peer.profile_id}>
                        {peer.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary"
                    disabled={
                      !existingGroupId ||
                      !inviteeId ||
                      busyAction !== "" ||
                      peerLoading
                    }
                  >
                    <Send size={15} />
                    {busyAction === "invite" ? "Sending…" : "Send invitation"}
                  </button>
                </form>
              ) : (
                <div className="group-workflow-empty">
                  <strong>No group to invite from in this course yet.</strong>
                  Create a group above or choose a course where you are already
                  an active group member.
                </div>
              )}
            </section>

            <section className="group-workflow-panel wide">
              <h2>Groups you can request to join</h2>
              <p>
                Active groups in the selected course are listed from Supabase.
                If an invitation is already pending for you, respond to it
                rather than sending a second action.
              </p>
              {requestableGroups.length ? (
                <div className="group-workflow-list">
                  {requestableGroups.map(group => {
                    const pendingRequest = joinRequests.find(
                      request =>
                        request.group_id === group.id &&
                        request.requester_id === userId &&
                        request.status === "pending"
                    );
                    const pendingInvitation = incomingInvitations.find(
                      invitation =>
                        invitation.group_id === group.id &&
                        invitation.status === "pending"
                    );
                    const alreadyGrouped = memberships.some(
                      membership =>
                        membership.course_id === group.course_id &&
                        membership.membership_status === "active"
                    );
                    return (
                      <article className="group-workflow-item" key={group.id}>
                        <div className="group-workflow-item-top">
                          <div>
                            <h3>{group.name || "Study group"}</h3>
                            <p>{selectedCourse?.code} · Active group</p>
                          </div>
                          <span className="group-workflow-status">Active</span>
                        </div>
                        <div className="group-workflow-item-bottom">
                          {pendingRequest ? (
                            <span className="member-note">
                              Your join request is pending.
                            </span>
                          ) : pendingInvitation ? (
                            <span className="member-note">
                              You have an invitation to this group; respond to
                              it below.
                            </span>
                          ) : alreadyGrouped ? (
                            <span className="member-note">
                              You already belong to a group for this course.
                            </span>
                          ) : (
                            <span className="group-workflow-peek">
                              No maximum group size.
                            </span>
                          )}
                          <div className="group-workflow-actions">
                            {pendingRequest ? (
                              <button
                                type="button"
                                className="secondary"
                                disabled={busyAction !== ""}
                                onClick={() =>
                                  void runAction(
                                    `cancel-request-${pendingRequest.id}`,
                                    () =>
                                      cancelGroupJoinRequest(
                                        userId,
                                        pendingRequest.id
                                      ),
                                    "Your join request was cancelled."
                                  )
                                }
                              >
                                {busyAction ===
                                `cancel-request-${pendingRequest.id}`
                                  ? "Cancelling…"
                                  : "Cancel request"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="primary"
                                disabled={
                                  Boolean(pendingInvitation) ||
                                  alreadyGrouped ||
                                  busyAction !== ""
                                }
                                onClick={() =>
                                  void runAction(
                                    `request-${group.id}`,
                                    () => requestToJoinGroup(userId, group.id),
                                    "Your request to join has been sent."
                                  )
                                }
                              >
                                {busyAction === `request-${group.id}`
                                  ? "Sending…"
                                  : "Request to join"}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="group-workflow-empty">
                  <strong>
                    No active groups are available in this course.
                  </strong>
                  When an eligible group is active, it will appear here.
                </div>
              )}
            </section>

            <section className="group-workflow-panel">
              <h2>Received invitations</h2>
              <p>Accept or decline invitations sent to your account.</p>
              <div className="group-workflow-list">
                {incomingInvitations.length ? (
                  incomingInvitations.map(invitation => {
                    const group = groupById.get(invitation.group_id);
                    const course = courseById.get(invitation.course_id);
                    return (
                      <article
                        className="group-workflow-item"
                        key={invitation.id}
                      >
                        <div className="group-workflow-item-top">
                          <div>
                            <h3>{group?.name || "Study group invitation"}</h3>
                            <p>
                              {course?.code || "Course"} · From{" "}
                              {invitation.sender_name_snapshot}
                            </p>
                          </div>
                          <span
                            className={`group-workflow-status ${invitation.status}`}
                          >
                            {prettyStatus(invitation.status)}
                          </span>
                        </div>
                        {invitation.status === "pending" && (
                          <div className="group-workflow-actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busyAction !== ""}
                              onClick={() =>
                                void runAction(
                                  `decline-${invitation.id}`,
                                  () =>
                                    respondToGroupInvitation(
                                      userId,
                                      invitation.id,
                                      false
                                    ),
                                  "You declined the group invitation."
                                )
                              }
                            >
                              {busyAction === `decline-${invitation.id}` ? (
                                "Saving…"
                              ) : (
                                <>
                                  <X size={14} /> Decline
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="primary"
                              disabled={busyAction !== ""}
                              onClick={() =>
                                void runAction(
                                  `accept-${invitation.id}`,
                                  () =>
                                    respondToGroupInvitation(
                                      userId,
                                      invitation.id,
                                      true
                                    ),
                                  invitationAcceptanceFeedback
                                )
                              }
                            >
                              {busyAction === `accept-${invitation.id}` ? (
                                "Saving…"
                              ) : (
                                <>
                                  <Check size={14} /> Accept
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <div className="group-workflow-empty">
                    <strong>No invitations received.</strong>Invitations sent to
                    you will appear here.
                  </div>
                )}
              </div>
            </section>

            <section className="group-workflow-panel">
              <h2>Sent invitations</h2>
              <p>Cancel an invitation that is still pending.</p>
              <div className="group-workflow-list">
                {outgoingInvitations.length ? (
                  outgoingInvitations.map(invitation => {
                    const group = groupById.get(invitation.group_id);
                    const course = courseById.get(invitation.course_id);
                    return (
                      <article
                        className="group-workflow-item"
                        key={invitation.id}
                      >
                        <div className="group-workflow-item-top">
                          <div>
                            <h3>{group?.name || "Study group invitation"}</h3>
                            <p>
                              {course?.code || "Course"} · To{" "}
                              {invitation.recipient_name_snapshot}
                            </p>
                          </div>
                          <span
                            className={`group-workflow-status ${invitation.status}`}
                          >
                            {prettyStatus(invitation.status)}
                          </span>
                        </div>
                        {invitation.status === "pending" && (
                          <div className="group-workflow-actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={busyAction !== ""}
                              onClick={() =>
                                void runAction(
                                  `cancel-invite-${invitation.id}`,
                                  () =>
                                    cancelGroupInvitation(
                                      userId,
                                      invitation.id
                                    ),
                                  "Your group invitation was cancelled."
                                )
                              }
                            >
                              {busyAction === `cancel-invite-${invitation.id}`
                                ? "Cancelling…"
                                : "Cancel invitation"}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <div className="group-workflow-empty">
                    <strong>No invitations sent.</strong>Invitations you send
                    will appear here.
                  </div>
                )}
              </div>
            </section>

            <section className="group-workflow-panel wide">
              <h2>Join requests</h2>
              <p>
                Requests shown depend on current server access rules. Only the
                current group leader may review requests; the server enforces
                this after leader succession.
              </p>
              <div className="group-workflow-list">
                {joinRequests.length ? (
                  joinRequests.map(request => {
                    const group = groupById.get(request.group_id);
                    const course = courseById.get(request.course_id);
                    const ownRequest = request.requester_id === userId;
                    const mayReview =
                      !ownRequest &&
                      request.status === "pending" &&
                      leaderGroupIds.has(request.group_id);
                    const mayCancel =
                      ownRequest && request.status === "pending";
                    return (
                      <article className="group-workflow-item" key={request.id}>
                        <div className="group-workflow-item-top">
                          <div>
                            <h3>{group?.name || "Study group"}</h3>
                            <p>
                              {course?.code || "Course"} ·{" "}
                              {ownRequest
                                ? "Your request"
                                : `Request from ${request.requester_name_snapshot}`}
                            </p>
                          </div>
                          <span
                            className={`group-workflow-status ${request.status}`}
                          >
                            {prettyStatus(request.status)}
                          </span>
                        </div>
                        {(mayReview || mayCancel) && (
                          <div className="group-workflow-actions">
                            {mayCancel && (
                              <button
                                type="button"
                                className="secondary"
                                disabled={busyAction !== ""}
                                onClick={() =>
                                  void runAction(
                                    `cancel-request-${request.id}`,
                                    () =>
                                      cancelGroupJoinRequest(
                                        userId,
                                        request.id
                                      ),
                                    "Your join request was cancelled."
                                  )
                                }
                              >
                                {busyAction === `cancel-request-${request.id}`
                                  ? "Cancelling…"
                                  : "Cancel my request"}
                              </button>
                            )}
                            {mayReview && (
                              <>
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={busyAction !== ""}
                                  onClick={() =>
                                    void runAction(
                                      `reject-${request.id}`,
                                      () =>
                                        reviewGroupJoinRequest(
                                          userId,
                                          request.id,
                                          false
                                        ),
                                      "The join request was rejected."
                                    )
                                  }
                                >
                                  {busyAction === `reject-${request.id}`
                                    ? "Saving…"
                                    : "Reject"}
                                </button>
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={busyAction !== ""}
                                  onClick={() =>
                                    void runAction(
                                      `approve-${request.id}`,
                                      () =>
                                        reviewGroupJoinRequest(
                                          userId,
                                          request.id,
                                          true
                                        ),
                                      "The request was approved and the student joined."
                                    )
                                  }
                                >
                                  {busyAction === `approve-${request.id}` ? (
                                    "Saving…"
                                  ) : (
                                    <>
                                      <Check size={14} /> Approve
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <div className="group-workflow-empty">
                    <strong>
                      No join requests are visible to this account.
                    </strong>
                    Requests appear according to current server access rules.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
      <footer className="authenticated-courses-footer">
        Live group workflows · Supabase RLS and RPCs enforce permissions
      </footer>
    </div>
  );
}
