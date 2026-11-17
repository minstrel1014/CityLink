import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  Users,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
} from "@/lib/supabaseCourses";
import {
  cancelGroupInvitation,
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listActiveGroupMembers,
  listCourseGroupInviteCandidates,
  listCourseGroupPeers,
  listCourseGroupSummaries,
  loadGroupWorkflowSnapshot,
  loadOwnCourseProfile,
  renameStudyGroup,
  type GroupCoursePeer,
  type GroupMembershipRow,
  type GroupWorkflowSnapshot,
  type OwnCourseProfile,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  getInvitationHistoryLabel,
  getOwnCourseGroup,
  isCoursePeerInviteable,
} from "@/lib/courseDetailActions";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  CourseIcon,
  EmptyState,
  PageHeading,
} from "@/components/citylink/Shared";
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
  const userIdRef = useRef(userId);
  const courseIdRef = useRef(courseId);
  userIdRef.current = userId;
  courseIdRef.current = courseId;

  const [data, setData] = useState<MyGroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [groupName, setGroupName] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [eligiblePeers, setEligiblePeers] = useState<GroupCoursePeer[]>([]);
  const [inviteeId, setInviteeId] = useState("");
  const [inviteOptionsLoading, setInviteOptionsLoading] = useState(false);
  const [inviteOptionsError, setInviteOptionsError] = useState("");
  const requestGeneration = useRef(0);
  const inviteOptionsGeneration = useRef(0);

  useEffect(() => {
    inviteOptionsGeneration.current += 1;
    setNotice(null);
    setCreateOpen(false);
    setEligiblePeers([]);
    setInviteeId("");
    setInviteOptionsError("");
    setInviteOptionsLoading(false);
    return () => {
      inviteOptionsGeneration.current += 1;
    };
  }, [courseId, userId]);

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
  }, [courseId, retryToken, session.status, userId]);

  async function openCreateGroup() {
    if (!userId || !data?.enrolled) return;
    const requestedUserId = userId;
    const requestedCourseId = courseId;
    const generation = ++inviteOptionsGeneration.current;
    const isCurrent = () =>
      inviteOptionsGeneration.current === generation &&
      userIdRef.current === requestedUserId &&
      courseIdRef.current === requestedCourseId;
    setCreateOpen(true);
    setInviteOptionsLoading(true);
    setInviteOptionsError("");
    setInviteeId("");
    try {
      const [peers, eligibleIds, summaries] = await Promise.all([
        listCourseGroupPeers(requestedUserId, requestedCourseId),
        listCourseGroupInviteCandidates(requestedUserId, requestedCourseId),
        listCourseGroupSummaries(requestedUserId, requestedCourseId),
      ]);
      if (!isCurrent()) return;
      const alreadyGrouped = new Set(summaries.map(item => item.profile_id));
      const allowed = new Set(eligibleIds);
      setEligiblePeers(
        peers.filter(
          peer =>
            peer.profile_id !== userId &&
            allowed.has(peer.profile_id) &&
            !alreadyGrouped.has(peer.profile_id) &&
            isCoursePeerInviteable(peer.status)
        )
      );
    } catch (error) {
      if (!isCurrent()) return;
      setEligiblePeers([]);
      setInviteOptionsError(getGroupWorkflowErrorMessage(error));
    } finally {
      if (isCurrent()) setInviteOptionsLoading(false);
    }
  }

  async function createFirstInvite() {
    if (!userId || !inviteeId || busyAction) return;
    setBusyAction("create");
    setNotice(null);
    try {
      await createGroupAndInvite(userId, courseId, inviteeId);
      setNotice({
        tone: "success",
        message:
          "Your group was established and the first invitation was sent. You are its leader; the group becomes active when the invitee accepts.",
      });
      setCreateOpen(false);
      setRetryToken(value => value + 1);
    } catch (error) {
      setNotice({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function saveGroupName() {
    if (!userId || !data?.group || !data.profile) return;
    if (data.group.creator_id !== userId || busyAction) return;
    setBusyAction("rename");
    setNotice(null);
    try {
      await renameStudyGroup(userId, data.group.id, groupName);
      setNotice({ tone: "success", message: "The group name was updated." });
      setRetryToken(value => value + 1);
    } catch (error) {
      setNotice({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      setBusyAction("");
    }
  }

  async function cancelInvite(invitationId: string) {
    if (!userId || busyAction) return;
    setBusyAction(`cancel-${invitationId}`);
    setNotice(null);
    try {
      await cancelGroupInvitation(userId, invitationId);
      setNotice({
        tone: "success",
        message: "The pending invitation was cancelled.",
      });
      setRetryToken(value => value + 1);
    } catch (error) {
      setNotice({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      setBusyAction("");
    }
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
    ? members.length +
      (ownData.group.status === "forming" &&
      !members.some(member => member.profile_id === ownData.group?.creator_id)
        ? 1
        : 0)
    : 0;
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
            Groups have no maximum size. The first invite creates a forming
            group with you as leader; active members may invite, and only the
            original group creator may review join requests.
          </p>
        </div>
        <Link
          href={`/courses/${courseId}/classmates`}
          className="secondary my-group-classmates-link"
        >
          Open the full classmate list <ArrowRight size={16} />
        </Link>
      </GroupCard>
    ) : null;

  return (
    <div className="authenticated-courses-page course-detail-page my-group-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <Link href="/my-courses" className="back-link">
          <ArrowLeft size={17} /> Back to My Courses
        </Link>
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
                      maxLength={120}
                      disabled={
                        ownData.group.creator_id !== userId || busyAction !== ""
                      }
                      aria-describedby="group-name-help"
                    />
                    <p id="group-name-help">
                      {ownData.group.creator_id === userId
                        ? "Only the current group leader can rename this group. Names may contain up to 120 characters."
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
                  eyebrow="MEMBERSHIP"
                  title="Current members"
                  count={groupSize}
                  description="Active members in this group."
                  className="my-group-members-card"
                  footer={
                    <Link
                      href="/group-chat"
                      className="secondary my-group-chat-link"
                    >
                      <MessageCircle size={16} /> Open Group Chat{" "}
                      <ArrowRight size={15} />
                    </Link>
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
                        </article>
                      ))}
                    </div>
                  ) : ownData.group.status === "forming" ? (
                    <div className="group-workflow-empty">
                      <strong>
                        {ownData.profile.display_name} · Group leader
                      </strong>
                      This group is waiting for its first invitee to accept. No
                      active memberships have been recorded yet.
                    </div>
                  ) : (
                    <EmptyState
                      title="No active members are visible"
                      description="Refresh to check the current group membership."
                    />
                  )}
                </GroupCard>

                {invitationHistoryCard}
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
                    Create a group by sending the first invitation, or browse
                    active groups and request to join one.
                  </p>
                  <div className="authenticated-courses-state-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void openCreateGroup()}
                    >
                      <Send size={16} /> Create a group
                    </button>
                    <Link
                      href={`/courses/${courseId}/classmates`}
                      className="secondary"
                    >
                      Request to join <ArrowRight size={16} />
                    </Link>
                  </div>
                  {createOpen && (
                    <div
                      className="first-invite-picker"
                      aria-labelledby="first-invite-heading"
                    >
                      <h3 id="first-invite-heading">
                        Choose the first coursemate to invite
                      </h3>
                      {inviteOptionsLoading && (
                        <p role="status">
                          Checking current invitation eligibility…
                        </p>
                      )}
                      {inviteOptionsError && (
                        <p
                          className="course-directory-feedback error"
                          role="alert"
                        >
                          {inviteOptionsError}
                        </p>
                      )}
                      {!inviteOptionsLoading &&
                        !inviteOptionsError &&
                        eligiblePeers.length === 0 && (
                          <p>
                            No coursemates are currently eligible for an
                            invitation. You can still browse the full classmate
                            list.
                          </p>
                        )}
                      {eligiblePeers.length > 0 && (
                        <>
                          <label htmlFor="first-invitee">First invitee</label>
                          <select
                            id="first-invitee"
                            value={inviteeId}
                            onChange={event => setInviteeId(event.target.value)}
                          >
                            <option value="">Select a coursemate</option>
                            {eligiblePeers.map(peer => (
                              <option
                                key={peer.profile_id}
                                value={peer.profile_id}
                              >
                                {peer.display_name}
                                {peer.major ? ` · ${peer.major}` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="primary"
                            disabled={!inviteeId || busyAction !== ""}
                            onClick={() => void createFirstInvite()}
                          >
                            <Send size={15} />{" "}
                            {busyAction === "create"
                              ? "Creating…"
                              : "Create group and invite"}
                          </button>
                        </>
                      )}
                      <Link
                        href={`/courses/${courseId}/classmates`}
                        className="text-link"
                      >
                        Open all coursemates <ArrowRight size={14} />
                      </Link>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setCreateOpen(false)}
                      >
                        <X size={14} /> Close
                      </button>
                    </div>
                  )}
                </section>
                {invitationHistoryCard}
                {classmateListCard}
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
