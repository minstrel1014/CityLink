import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { GroupChatLink } from "@/components/citylink/GroupNavigationLinks";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
} from "@/lib/supabaseCourses";
import {
  cancelGroupInvitation,
  getGroupWorkflowErrorMessage,
  leaveGroup,
  listActiveGroupMembers,
  loadGroupWorkflowSnapshot,
  loadOwnCourseProfile,
  removeGroupMember,
  renameStudyGroup,
  reviewGroupJoinRequest,
  setGroupMaxMembers,
  type GroupMembershipRow,
  type GroupWorkflowSnapshot,
  type OwnCourseProfile,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  getInvitationHistoryLabel,
  getOwnCourseGroup,
} from "@/lib/courseDetailActions";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  CourseIcon,
  EmptyState,
  PageHeading,
} from "@/components/citylink/Shared";
import { GroupCapacitySettings } from "./GroupCapacitySettings";
import { GroupMemberRemoval } from "./GroupMemberRemoval";
import { RecruitmentPostComposer } from "./RecruitmentPostComposer";
import {
  canManageGroupCapacity,
  canRemoveGroupMember,
  getVisibleGroupCapacityCount,
  validateGroupMaximum,
} from "./groupCapacity";
import "./CourseDetail.css";
import "./AuthenticatedMyGroup.css";

type Notice = { tone: "success" | "error"; message: string };
type MyGroupData = {
  userId: string;
  course: Awaited<ReturnType<typeof loadCourseDirectory>>["courses"][number];
  enrolled: boolean;
  profile: OwnCourseProfile | null;
  workflow: GroupWorkflowSnapshot | null;
  group: StudyGroupRow | null;
  members: GroupMembershipRow[];
};

function AccessScreen({
  title,
  message,
  email,
}: {
  title: string;
  message: string;
  email?: string;
}) {
  return (
    <div className="authenticated-courses-page course-detail-page">
      <AccountHeader email={email} />
      <main className="authenticated-courses-main">
        <section className="authenticated-courses-state" role="status">
          <span className="authenticated-courses-state-icon">
            <BookOpen size={27} />
          </span>
          <p className="eyebrow">MY GROUP · TEST DATABASE</p>
          <h1>{title}</h1>
          <p>{message}</p>
          <div className="authenticated-courses-state-actions">
            <Link href="/my-courses" className="primary">
              My Courses
            </Link>
            <Link href="/demo" className="secondary">
              Fictional demo
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function prettyGroupStatus(status: StudyGroupRow["status"]) {
  return status === "forming"
    ? "Forming · awaiting first acceptance"
    : "Active";
}

function GroupCard({
  eyebrow,
  title,
  count,
  description,
  headerExtra,
  footer,
  className = "",
  children,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  description?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`my-group-card ${className}`.trim()}>
      <header className="my-group-card-header">
        <div>
          <p className="my-group-card-eyebrow">{eyebrow}</p>
          <h2>
            {title}
            {typeof count === "number" && (
              <span className="count-pill">{count}</span>
            )}
          </h2>
        </div>
        {headerExtra}
      </header>
      {description && (
        <p className="my-group-card-description">{description}</p>
      )}
      <div className="my-group-card-body">{children}</div>
      {footer && <footer className="my-group-card-footer">{footer}</footer>}
    </section>
  );
}

export default function AuthenticatedMyGroup({
  courseId,
}: {
  courseId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const authGeneration = session.authGeneration ?? 0;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [data, setData] = useState<MyGroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [groupName, setGroupName] = useState("");
  const [groupMaximum, setGroupMaximum] = useState("");
  const [busyAction, setBusyAction] = useState("");
  // Leaving is one-way for this membership, so it takes a second explicit
  // click instead of firing from a single button.
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const requestGeneration = useRef(0);
  const actionGeneration = useRef(0);
  const actionBusy = useRef(false);
  const actionGroupId =
    data?.userId === userId && data.course.id === courseId
      ? (data.group?.id ?? null)
      : null;
  const actionContext = useRef({
    userId,
    courseId,
    groupId: actionGroupId,
    status: session.status,
    authGeneration,
  });
  actionContext.current = {
    userId,
    courseId,
    groupId: actionGroupId,
    status: session.status,
    authGeneration,
  };

  useEffect(() => {
    setNotice(null);
  }, [authGeneration, courseId, userId]);

  useEffect(() => {
    actionBusy.current = false;
    setBusyAction("");
    return () => {
      actionGeneration.current += 1;
      actionBusy.current = false;
    };
  }, [authGeneration, courseId, userId, actionGroupId, session.status]);

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
        if (requestGeneration.current === generation) {
          requestGeneration.current += 1;
        }
      };
    }

    setLoading(true);
    setLoadError("");
    void loadCourseDirectory(userId)
      .then(async directory => {
        if (!isCurrent()) return;
        const course = directory.courses.find(item => item.id === courseId);
        if (!course)
          throw new Error("This course is not in the Test catalogue.");
        const enrolled = directory.enrolledCourseIds.includes(courseId);
        if (!enrolled) {
          setData({
            userId,
            course,
            enrolled: false,
            profile: null,
            workflow: null,
            group: null,
            members: [],
          });
          setLoading(false);
          return;
        }
        const [workflow, profile] = await Promise.all([
          loadGroupWorkflowSnapshot(userId),
          loadOwnCourseProfile(userId),
        ]);
        if (!isCurrent()) return;
        const group = getOwnCourseGroup(
          workflow.groups,
          workflow.memberships,
          courseId,
          userId
        );
        const members = group
          ? await listActiveGroupMembers(userId, group.id)
          : [];
        if (!isCurrent()) return;
        setData({
          userId,
          course,
          enrolled,
          profile,
          workflow,
          group,
          members,
        });
        setGroupName(group?.name ?? "");
        setGroupMaximum(
          group?.max_members == null ? "" : String(group.max_members)
        );
        setLoading(false);
      })
      .catch(error => {
        if (!isCurrent()) return;
        setLoadError(getGroupWorkflowErrorMessage(error));
        setLoading(false);
      });

    return () => {
      active = false;
      if (requestGeneration.current === generation) {
        requestGeneration.current += 1;
      }
    };
  }, [authGeneration, courseId, retryToken, session.status, userId]);

  async function runAction(
    key: string,
    action: (isCurrent: () => boolean) => Promise<unknown>,
    success: string
  ) {
    if (!userId || actionBusy.current) return;
    const context = { ...actionContext.current };
    const generation = actionGeneration.current;
    const isCurrent = () =>
      actionGeneration.current === generation &&
      actionContext.current.userId === context.userId &&
      actionContext.current.courseId === context.courseId &&
      actionContext.current.groupId === context.groupId &&
      actionContext.current.status === context.status &&
      actionContext.current.authGeneration === context.authGeneration;
    actionBusy.current = true;
    setBusyAction(key);
    setNotice(null);
    try {
      await action(isCurrent);
      if (!isCurrent()) return;
      setNotice({ tone: "success", message: success });
      setRetryToken(value => value + 1);
    } catch (error) {
      if (!isCurrent()) return;
      setNotice({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      if (isCurrent()) {
        actionBusy.current = false;
        setBusyAction("");
      }
    }
  }

  async function saveGroupName() {
    if (!userId || !data?.group || !data.profile) return;
    if (data.group.creator_id !== userId) return;
    await runAction(
      "rename",
      guard => renameStudyGroup(userId, data.group!.id, groupName, guard),
      "The group name was updated."
    );
  }

  async function cancelInvite(invitationId: string) {
    if (!userId) return;
    await runAction(
      `cancel-${invitationId}`,
      guard => cancelGroupInvitation(userId, invitationId, guard),
      "The pending invitation was cancelled."
    );
  }

  async function reviewRequest(requestId: string, approve: boolean) {
    if (!userId) return;
    await runAction(
      `${approve ? "approve" : "reject"}-${requestId}`,
      guard => reviewGroupJoinRequest(userId, requestId, approve, guard),
      approve
        ? "The join request was approved and the student joined the group."
        : "The join request was declined."
    );
  }

  async function saveGroupMaximum() {
    if (
      !userId ||
      !data?.group ||
      data.userId !== userId ||
      data.course.id !== courseId
    )
      return;
    const group = data.group;
    if (!canManageGroupCapacity(group, data.members, userId)) return;
    const validation = validateGroupMaximum(
      groupMaximum,
      getVisibleGroupCapacityCount(group, data.members, userId) ?? 0
    );
    if (validation.value === null) {
      setNotice({ tone: "error", message: validation.error! });
      return;
    }
    const maximum = validation.value;
    await runAction(
      "maximum",
      async guard => {
        const saved: unknown = await setGroupMaxMembers(
          userId,
          group.id,
          maximum,
          guard
        );
        if (saved !== maximum)
          throw new Error("The saved maximum was not confirmed.");
      },
      "The group maximum was updated."
    );
  }

  async function removeMember(member: GroupMembershipRow) {
    if (
      !userId ||
      !data?.group ||
      data.userId !== userId ||
      data.course.id !== courseId ||
      actionBusy.current
    )
      return;
    const group = data.group;
    if (
      !member.profile_id ||
      !canRemoveGroupMember(group, data.members, userId, member)
    )
      return;
    const profileId = member.profile_id;
    await runAction(
      `remove-${member.id}`,
      async guard => {
        const result: unknown = await removeGroupMember(
          userId,
          group.id,
          profileId,
          guard
        );
        if (result !== "removed")
          throw new Error("The member removal was not confirmed.");
      },
      `${member.display_name_snapshot} was removed from the group.`
    );
  }

  async function quitGroup() {
    if (
      !userId ||
      !data?.group ||
      data.userId !== userId ||
      data.course.id !== courseId ||
      actionBusy.current
    )
      return;
    const group = data.group;
    await runAction(
      "leave",
      async guard => {
        const result: unknown = await leaveGroup(userId, group.id, guard);
        if (result !== "left")
          throw new Error("Leaving the group was not confirmed.");
      },
      "You left the group."
    );
    setLeaveConfirm(false);
  }

  if (session.status === "loading") {
    return (
      <AccessScreen
        title="Checking your sign-in…"
        message="CityLink is restoring your Supabase Auth session before loading this group."
      />
    );
  }
  if (session.status === "error") {
    return (
      <AccessScreen
        title="Your sign-in is unavailable"
        message="We could not restore your account session. Return to the sign-in page and try again."
      />
    );
  }
  if (!userId) {
    return (
      <AccessScreen
        title="Sign in to view your group"
        message="Group membership and invitation history are loaded from the authenticated Test database."
      />
    );
  }
  if (!supabaseClient) {
    return (
      <AccessScreen
        email={session.user?.email}
        title="Supabase is not configured"
        message="This page does not fall back to fictional group data."
      />
    );
  }

  const ownData =
    data?.userId === userId && data.course.id === courseId ? data : null;
  const outgoingInvitations = (ownData?.workflow?.outgoingInvitations ?? [])
    .filter(invitation => invitation.course_id === courseId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const members = ownData?.members ?? [];
  const groupSize = ownData?.group
    ? getVisibleGroupCapacityCount(ownData.group, members, userId)
    : null;
  const mayManageCapacity = ownData?.group
    ? canManageGroupCapacity(ownData.group, members, userId)
    : false;
  const mayReviewJoinRequests =
    Boolean(ownData?.group) && ownData?.group?.creator_id === userId;
  const pendingJoinRequests = mayReviewJoinRequests
    ? (ownData?.workflow?.joinRequests ?? []).filter(
        request =>
          request.course_id === courseId &&
          request.group_id === ownData?.group?.id &&
          request.status === "pending" &&
          request.requester_id !== userId
      )
    : [];
  const leaderName =
    ownData?.group?.creator_id === userId
      ? (ownData.profile?.display_name ?? "You")
      : (members.find(
          member => member.profile_id === ownData?.group?.creator_id
        )?.display_name_snapshot ?? "Current leader");
  const groupNameChanged =
    ownData?.group !== null &&
    ownData?.group !== undefined &&
    groupName.trim() !== ownData.group.name;

  const invitationHistoryCard =
    ownData && ownData.enrolled ? (
      <GroupCard
        eyebrow="INVITATIONS"
        title="Invitation history"
        count={outgoingInvitations.length}
        description="Statuses reflect the Test invitation records."
        className="my-group-invitations-card"
      >
        {outgoingInvitations.length > 0 ? (
          <div className="group-invitation-history">
            {outgoingInvitations.map(invitation => {
              const group = ownData.workflow?.groups.find(
                item => item.id === invitation.group_id
              );
              return (
                <article className="group-invitation-row" key={invitation.id}>
                  <div>
                    <strong>{invitation.recipient_name_snapshot}</strong>
                    <span>
                      {group?.name || "Study group"} ·{" "}
                      {new Date(invitation.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span
                    className={`group-workflow-status ${invitation.status}`}
                  >
                    {getInvitationHistoryLabel(invitation.status)}
                  </span>
                  {invitation.status === "pending" && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busyAction !== ""}
                      onClick={() => void cancelInvite(invitation.id)}
                    >
                      {busyAction === `cancel-${invitation.id}`
                        ? "Cancelling…"
                        : "Cancel invitation"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="group-workflow-empty">
            <strong>No outgoing invitations yet.</strong> Invitations you send
            for this course will appear here.
          </div>
        )}
      </GroupCard>
    ) : null;

  const joinRequestCard =
    ownData && ownData.enrolled && mayReviewJoinRequests ? (
      <GroupCard
        eyebrow="REQUESTS"
        title="Join requests"
        count={pendingJoinRequests.length}
        description="Only the current group leader can review requests. Approving adds the student to this group; the server rechecks eligibility."
        className="my-group-invitations-card"
      >
        {pendingJoinRequests.length > 0 ? (
          <div className="group-invitation-history">
            {pendingJoinRequests.map(request => (
              <article className="group-invitation-row" key={request.id}>
                <div>
                  <strong>{request.requester_name_snapshot}</strong>
                  <span>
                    {ownData.group?.name || "Study group"} ·{" "}
                    {new Date(request.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="group-workflow-status pending">Pending</span>
                <div className="group-workflow-actions">
                  <button
                    type="button"
                    className="primary"
                    aria-label={`Approve the join request from ${request.requester_name_snapshot}`}
                    disabled={busyAction !== ""}
                    onClick={() => void reviewRequest(request.id, true)}
                  >
                    {busyAction === `approve-${request.id}`
                      ? "Approving…"
                      : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Decline the join request from ${request.requester_name_snapshot}`}
                    disabled={busyAction !== ""}
                    onClick={() => void reviewRequest(request.id, false)}
                  >
                    {busyAction === `reject-${request.id}`
                      ? "Declining…"
                      : "Decline"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="group-workflow-empty">
            <strong>No pending join requests.</strong> Requests for this group
            will appear here.
          </div>
        )}
      </GroupCard>
    ) : null;

  const classmateListCard =
    ownData && ownData.enrolled ? (
      <GroupCard
        eyebrow="DISCOVER"
        title="Classmate list"
        description="Browse everyone enrolled in this course and see who is already in a group."
        className="my-group-classmates-card"
      >
        <div className="my-group-classmates-intro">
          <span className="my-group-card-icon" aria-hidden="true">
            <Users size={22} />
          </span>
          <p className="my-group-rules-note">
            Choose a maximum from 2 to 19 when starting a group. The first
            invite creates a forming group with you as leader; active members
            may invite, and only the current group leader may review join
            requests.
          </p>
        </div>
        <Link
          href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
          className="secondary my-group-classmates-link"
        >
          Find your groupmate <ArrowRight size={16} />
        </Link>
      </GroupCard>
    ) : null;

  return (
    <div className="authenticated-courses-page course-detail-page my-group-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        {loading && (
          <div className="course-directory-state" role="status">
            <span className="spinner" /> Loading your group and invitation
            history…
          </div>
        )}
        {!loading && loadError && (
          <EmptyState
            title="Group details could not be loaded"
            description={loadError}
          >
            <button
              type="button"
              className="secondary"
              onClick={() => setRetryToken(value => value + 1)}
            >
              <RefreshCw size={16} /> Try again
            </button>
          </EmptyState>
        )}
        {!loading && !loadError && ownData && (
          <>
            <div className="course-page-heading">
              <CourseIcon course={ownData.course} size={28} />
              <div>
                <p className="eyebrow">{ownData.course.code} · MY GROUP</p>
                <h1>{ownData.course.title}</h1>
                <p>
                  {ownData.course.department} · {ownData.course.semester}
                </p>
              </div>
            </div>
            <PageHeading
              eyebrow="YOUR GROUP SITUATION"
              title="My Group"
              description="This view shows your group, its active members, and invitations you have sent for this course."
            />
            {notice && (
              <p
                className={`group-workflow-feedback ${notice.tone}`}
                role={notice.tone === "error" ? "alert" : "status"}
              >
                {notice.message}
              </p>
            )}
            {!ownData.enrolled ? (
              <div className="course-detail-enrolment-gate" role="status">
                <strong>You are not enrolled in this course.</strong> Add it
                from My Courses before creating a group or viewing coursemates.
                <Link href="/my-courses">Browse and add courses</Link>
              </div>
            ) : ownData.group && ownData.profile ? (
              <div className="my-group-card-grid">
                <GroupCard
                  eyebrow="GROUP SETTINGS"
                  title="Group name"
                  className="my-group-name-card"
                  description={
                    ownData.group.creator_id === userId
                      ? "You are the group leader."
                      : `Group leader: ${leaderName}.`
                  }
                  headerExtra={
                    <span
                      className={`group-workflow-status ${ownData.group.status}`}
                    >
                      {prettyGroupStatus(ownData.group.status)}
                    </span>
                  }
                >
                  <form
                    className="group-name-form"
                    onSubmit={event => {
                      event.preventDefault();
                      void saveGroupName();
                    }}
                  >
                    <label htmlFor="course-group-name">Group name</label>
                    <input
                      id="course-group-name"
                      value={groupName}
                      onChange={event => setGroupName(event.target.value)}
                      maxLength={50}
                      disabled={
                        ownData.group.creator_id !== userId || busyAction !== ""
                      }
                      aria-describedby="group-name-help"
                    />
                    <p id="group-name-help">
                      {ownData.group.creator_id === userId
                        ? "Only the current group leader can rename this group. Names may contain up to 50 characters."
                        : "Only the current group leader can rename this group."}
                    </p>
                    {ownData.group.creator_id === userId && (
                      <button
                        className="primary"
                        type="submit"
                        disabled={
                          !groupNameChanged ||
                          !groupName.trim() ||
                          busyAction !== ""
                        }
                      >
                        <Save size={15} />{" "}
                        {busyAction === "rename" ? "Saving…" : "Save name"}
                      </button>
                    )}
                  </form>
                </GroupCard>

                <GroupCard
                  eyebrow="GROUP SETTINGS"
                  title="Group maximum"
                  description="The count includes the forming-group leader, even before their membership is recorded."
                  className="my-group-name-card my-group-capacity-card"
                >
                  <GroupCapacitySettings
                    activeCount={groupSize}
                    maxMembers={ownData.group.max_members}
                    canManage={mayManageCapacity}
                    value={groupMaximum}
                    busy={busyAction !== ""}
                    saving={busyAction === "maximum"}
                    onChange={setGroupMaximum}
                    onSave={() => void saveGroupMaximum()}
                  />
                </GroupCard>

                <GroupCard
                  eyebrow="MEMBERSHIP"
                  title="Current members"
                  count={groupSize ?? undefined}
                  description="Active members in this group; a forming-group leader is included in the count."
                  className="my-group-members-card"
                  footer={
                    <GroupChatLink
                      groupId={ownData.group.id}
                      className="secondary my-group-chat-link"
                    >
                      <MessageCircle size={16} /> Open Group Chat{" "}
                      <ArrowRight size={15} />
                    </GroupChatLink>
                  }
                >
                  {members.length > 0 ? (
                    <div className="group-member-list">
                      {members.map(member => (
                        <article className="group-member-row" key={member.id}>
                          <span className="member-initials" aria-hidden="true">
                            {member.display_name_snapshot
                              .split(/\s+/)
                              .slice(0, 2)
                              .map(part => part[0])
                              .join("")
                              .toLocaleUpperCase()}
                          </span>
                          <div>
                            <strong>{member.display_name_snapshot}</strong>
                            <span>
                              {member.profile_id === ownData.group?.creator_id
                                ? "Group leader"
                                : member.profile_id === userId
                                  ? "You"
                                  : "Active member"}
                            </span>
                          </div>
                          <GroupMemberRemoval
                            group={ownData.group!}
                            members={members}
                            userId={userId}
                            member={member}
                            busy={busyAction !== ""}
                            removing={busyAction === `remove-${member.id}`}
                            onRemove={target => void removeMember(target)}
                          />
                        </article>
                      ))}
                    </div>
                  ) : ownData.group.status === "forming" ? (
                    <div className="group-workflow-empty">
                      <strong>
                        {ownData.profile.display_name} · Group leader
                      </strong>
                      This group is waiting for an invitee to accept. The full
                      member count is not available in this view.
                    </div>
                  ) : (
                    <EmptyState
                      title="No active members are visible"
                      description="Refresh to check the current group membership."
                    />
                  )}
                </GroupCard>

                <GroupCard
                  eyebrow="RECRUITMENT"
                  title="Create a recruitment post"
                  description="Only the current group leader can publish. The server checks eligibility again when the post is submitted."
                  className="my-group-recruitment-card"
                >
                  <RecruitmentPostComposer
                    userId={userId}
                    groupId={ownData.group.id}
                    groupName={ownData.group.name}
                    courseCode={ownData.course.code}
                    memberCount={groupSize}
                    maxMembers={ownData.group.max_members ?? null}
                    canCreate={ownData.group.creator_id === userId}
                    onPosted={() => setRetryToken(value => value + 1)}
                  />
                </GroupCard>

                <GroupCard
                  eyebrow="MEMBERSHIP"
                  title="Leave this group"
                  description="Leaving ends your membership for this course and term. If you are the last member, the group becomes abandoned and its open invitations are expired."
                  className="my-group-leave-card"
                >
                  {leaveConfirm ? (
                    <div className="my-group-leave-confirm">
                      <p>
                        Leave <strong>{ownData.group.name}</strong>? To come
                        back you would need a new invitation, or you would have
                        to create a new group.
                      </p>
                      <div className="my-group-leave-actions">
                        <button
                          className="primary"
                          type="button"
                          disabled={busyAction !== ""}
                          onClick={() => void quitGroup()}
                        >
                          {busyAction === "leave"
                            ? "Leaving…"
                            : "Yes, leave group"}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busyAction !== ""}
                          onClick={() => setLeaveConfirm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="secondary my-group-leave-button"
                      type="button"
                      disabled={busyAction !== ""}
                      onClick={() => setLeaveConfirm(true)}
                    >
                      Quit group
                    </button>
                  )}
                </GroupCard>

                {invitationHistoryCard}
                {joinRequestCard}
                {classmateListCard}
              </div>
            ) : (
              <div className="my-group-card-grid my-group-card-grid-empty">
                <section className="my-group-card my-group-empty-state">
                  <span className="authenticated-courses-state-icon">
                    <Users size={26} />
                  </span>
                  <h2>You do not have a group for this course yet</h2>
                  <p>
                    Browse your coursemates, see who is looking for a group, and
                    invite someone, or browse recruitment posts to find a group
                    seeking members.
                  </p>
                  <div className="authenticated-courses-state-actions">
                    <Link
                      href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
                      className="primary"
                    >
                      <Users size={16} /> Find your groupmate{" "}
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </section>
                {invitationHistoryCard}
                {joinRequestCard}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="authenticated-courses-footer">
        Your group and invitation history · Supabase Test
      </footer>
    </div>
  );
}
