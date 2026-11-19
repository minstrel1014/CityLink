import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { ArrowRight, MessageCircle, Users } from "lucide-react";
import { Link } from "wouter";
import { PageHeading } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  acceptReceivedInvitation,
  findAcceptableReceivedInvitation,
  invitationViewKey,
  isInvitationViewCurrent,
  refreshInvitationSnapshot,
  type InvitationFeedback,
} from "@/lib/invitationAcceptance";
import { invitationActionCoordinator } from "@/lib/invitationActionCoordinator";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";
import {
  getGroupWorkflowErrorMessage,
  loadGroupWorkflowSnapshot,
  respondToGroupInvitation,
  type GroupInvitationRow,
  type GroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  activeMemberGroups,
  visiblePendingJoinRequests,
} from "@/lib/workspaceRouteRules";
import { ReceivedInvitationCard } from "./ReceivedInvitationCard";
import "./GroupWorkflows.css";
import "./AuthenticatedWorkspacePages.css";

interface WorkspaceData {
  userId: string;
  courses: CourseDirectorySnapshot;
  groups: GroupWorkflowSnapshot;
}

function useWorkspaceData() {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (session.status !== "ready" || !userId || !supabaseClient) {
      setData(null);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    void Promise.all([
      loadCourseDirectory(userId),
      loadGroupWorkflowSnapshot(userId),
    ])
      .then(([courses, groups]) => {
        if (!active) return;
        setData({ userId, courses, groups });
        setLoading(false);
      })
      .catch(reason => {
        if (!active) return;
        setData(null);
        const courseError = getCourseDirectoryErrorMessage(reason, "read");
        setError(
          courseError !==
            "CityLink could not load the Supabase course catalogue. Check your connection and try again."
            ? courseError
            : getGroupWorkflowErrorMessage(reason)
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retry, session.status, userId]);

  return {
    data: data?.userId === userId ? data : null,
    loading,
    error,
    retry: () => setRetry(value => value + 1),
    email: session.user?.email,
  };
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="course-directory-state" role="status">
      <span className="spinner" /> Loading {label} from Supabase Test…
    </div>
  );
}

function WorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="course-directory-feedback error" role="alert">
      {message}{" "}
      <button className="text-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function GroupWorkflowLink() {
  return (
    <Link href="/my-groups" className="secondary">
      Manage group workflows <ArrowRight size={16} />
    </Link>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function AuthenticatedInvitations() {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const authGeneration = session.authGeneration ?? 0;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  // A new identity gets a fresh state and guard; old async work is ignored.
  return (
    <AuthenticatedInvitationsForUser
      key={invitationViewKey(userId, authGeneration)}
      userId={userId}
      authGeneration={authGeneration}
      currentUserId={currentUserId}
    />
  );
}

function AuthenticatedInvitationsForUser({
  userId,
  authGeneration,
  currentUserId,
}: {
  userId: string | null;
  authGeneration: number;
  currentUserId: RefObject<string | null>;
}) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<InvitationFeedback | null>(null);
  const subscribeToBusy = useCallback(
    (listener: () => void) =>
      userId
        ? invitationActionCoordinator.subscribe(userId, listener)
        : () => {},
    [userId]
  );
  const getBusyInvitationId = useCallback(
    () =>
      userId ? invitationActionCoordinator.getBusyInvitationId(userId) : null,
    [userId]
  );
  const busyInvitationId = useSyncExternalStore(
    subscribeToBusy,
    getBusyInvitationId,
    () => null
  );
  const busy = useRef(false);
  const mounted = useRef(false);
  const snapshot = useRef<WorkspaceData | null>(null);
  const loadGeneration = useRef(0);
  const currentAuthGeneration = useRef(authGeneration);
  currentAuthGeneration.current = authGeneration;
  const isCurrent = () =>
    isInvitationViewCurrent({
      mounted: mounted.current,
      userId,
      currentUserId: currentUserId.current,
      authGeneration,
      currentAuthGeneration: currentAuthGeneration.current,
    });

  useLayoutEffect(() => {
    mounted.current = true;
    const unregister = userId
      ? invitationActionCoordinator.registerView(userId, () =>
          reload().catch(showLoadError)
        )
      : () => {};
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
      unregister();
    };
  }, [authGeneration, userId]);

  function showLoadError() {
    if (!isCurrent()) return;
    snapshot.current = null;
    setData(null);
    setLoading(false);
    setError(
      "Could not load the latest invitations. Check your connection or account access and try again before taking another action."
    );
  }

  function reload() {
    if (!userId || !supabaseClient) return Promise.resolve();
    return refreshInvitationSnapshot({
      generation: loadGeneration,
      isCurrent,
      load: async () => {
        const [courses, groups] = await Promise.all([
          loadCourseDirectory(userId),
          loadGroupWorkflowSnapshot(userId),
        ]);
        return { userId, courses, groups };
      },
      onLoading: () => {
        snapshot.current = null;
        setData(null);
        setLoading(true);
        setError("");
      },
      onLoaded: result => {
        snapshot.current = result;
        setData(result);
        setLoading(false);
      },
      onError: showLoadError,
    });
  }

  useEffect(() => {
    if (!userId || !supabaseClient) {
      setLoading(false);
      return;
    }
    void reload().catch(showLoadError);
  }, [authGeneration, userId]);

  function accept(invitation: GroupInvitationRow) {
    const currentInvitation = findAcceptableReceivedInvitation(
      snapshot.current?.groups.incomingInvitations ?? [],
      invitation.id,
      userId
    );
    if (!currentInvitation) return;
    void acceptReceivedInvitation({
      userId,
      invitation: currentInvitation,
      busy,
      coordinator: invitationActionCoordinator,
      isCurrent,
      respond: (currentUserId, invitationId, accept) =>
        respondToGroupInvitation(
          currentUserId,
          invitationId,
          accept,
          isCurrent
        ),
      errorMessage: getGroupWorkflowErrorMessage,
      onFeedback: setFeedback,
    });
  }

  const retry = () => void reload().catch(showLoadError);
  const coursesById = useMemo(
    () =>
      new Map((data?.courses.courses ?? []).map(course => [course.id, course])),
    [data]
  );
  const groupsById = useMemo(
    () => new Map((data?.groups.groups ?? []).map(group => [group.id, group])),
    [data]
  );
  const incoming = data?.groups.incomingInvitations ?? [];
  const outgoing = data?.groups.outgoingInvitations ?? [];
  const pendingRequests = visiblePendingJoinRequests(
    data?.groups.joinRequests ?? [],
    data?.groups.groups ?? [],
    data?.userId ?? ""
  );

  return (
    <main className="authenticated-workspace-page">
      <PageHeading
        eyebrow="YOUR TEST-BACKED GROUP WORKFLOWS"
        title="Invitations"
        description="Review invitations and pending join requests, and accept invitations sent to your account."
      >
        <GroupWorkflowLink />
      </PageHeading>
      <p className="group-workflows-intro" role="note">
        You can accept pending invitations sent to your account here. This view
        also shows your pending requests and requests for groups where you are
        the current leader, whether the original leader or a successor. Only the
        current active group leader can review requests in group workflows;
        server-side enforcement still needs review.
      </p>
      {feedback && (
        <div
          className={`group-workflow-feedback ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      )}
      {loading && <WorkspaceLoading label="invitations" />}
      {!loading && error && <WorkspaceError message={error} onRetry={retry} />}
      {!error && data && (
        <div className="group-workflow-grid authenticated-workspace-lists">
          <section className="group-workflow-panel">
            <h2>Received invitations</h2>
            <div className="group-workflow-list">
              {incoming.length ? (
                incoming.map(invitation => {
                  const group = groupsById.get(invitation.group_id);
                  const course = coursesById.get(invitation.course_id);
                  return (
                    <ReceivedInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      groupName={group?.name}
                      courseCode={course?.code}
                      formattedDate={formatDate(invitation.created_at)}
                      userId={userId}
                      busyInvitationId={busyInvitationId}
                      isRefreshing={loading}
                      onAccept={accept}
                    />
                  );
                })
              ) : (
                <div className="group-workflow-empty">
                  <strong>No received invitations.</strong> New invitations will
                  appear here.
                </div>
              )}
            </div>
          </section>
          <section className="group-workflow-panel">
            <h2>Sent invitations</h2>
            <div className="group-workflow-list">
              {outgoing.length ? (
                outgoing.map(invitation => {
                  const group = groupsById.get(invitation.group_id);
                  const course = coursesById.get(invitation.course_id);
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
                          {formatStatus(invitation.status)}
                        </span>
                      </div>
                      <p className="authenticated-workspace-date">
                        {formatDate(invitation.created_at)}
                      </p>
                    </article>
                  );
                })
              ) : (
                <div className="group-workflow-empty">
                  <strong>No sent invitations.</strong> Invitations you send
                  will appear here.
                </div>
              )}
            </div>
          </section>
          <section className="group-workflow-panel wide">
            <h2>Pending join requests</h2>
            <div className="group-workflow-list">
              {pendingRequests.length ? (
                pendingRequests.map(request => {
                  const group = groupsById.get(request.group_id);
                  const course = coursesById.get(request.course_id);
                  const isOwnRequest = request.requester_id === data.userId;
                  return (
                    <article className="group-workflow-item" key={request.id}>
                      <div className="group-workflow-item-top">
                        <div>
                          <h3>{group?.name || "Study group"}</h3>
                          <p>
                            {course?.code || "Course"} ·{" "}
                            {isOwnRequest
                              ? "Your request"
                              : `Request from ${request.requester_name_snapshot}`}
                          </p>
                        </div>
                        <span className="group-workflow-status pending">
                          Pending
                        </span>
                      </div>
                      <p className="authenticated-workspace-date">
                        {formatDate(request.created_at)}
                      </p>
                    </article>
                  );
                })
              ) : (
                <div className="group-workflow-empty">
                  <strong>No pending join requests.</strong> Requests visible to
                  your account will appear here.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export function AuthenticatedMessages() {
  const { data, loading, error, retry } = useWorkspaceData();
  const groupsById = useMemo(
    () => new Map((data?.groups.groups ?? []).map(group => [group.id, group])),
    [data]
  );
  const coursesById = useMemo(
    () =>
      new Map((data?.courses.courses ?? []).map(course => [course.id, course])),
    [data]
  );
  const groupChats = activeMemberGroups(
    [...groupsById.values()],
    data?.groups.memberships ?? []
  );

  return (
    <main className="authenticated-workspace-page">
      <PageHeading
        eyebrow="GROUP CONVERSATIONS"
        title="Messages"
        description="Your active group chat destinations are listed here. The actual chat is still a placeholder."
      />
      {loading && <WorkspaceLoading label="your group list" />}
      {!loading && error && <WorkspaceError message={error} onRetry={retry} />}
      {!loading && !error && data && (
        <div className="group-workflow-grid authenticated-workspace-lists">
          <section className="group-workflow-panel wide">
            <h2>
              <Users size={18} /> Group chats
            </h2>
            {groupChats.length ? (
              <div className="group-workflow-list">
                {groupChats.map(group => {
                  const course = coursesById.get(group.course_id);
                  return (
                    <article className="group-workflow-item" key={group.id}>
                      <div className="group-workflow-item-top">
                        <div>
                          <h3>{group.name || "Study group"}</h3>
                          <p>
                            {course?.code || "Course"} ·{" "}
                            {course?.title || "Course details unavailable"}
                          </p>
                        </div>
                        <span className="group-workflow-status active">
                          Group
                        </span>
                      </div>
                      <div className="group-workflow-actions">
                        <Link
                          href={`/groups/${group.id}/chat`}
                          className="secondary"
                        >
                          <MessageCircle size={15} /> Open Group Chat{" "}
                          <ArrowRight size={15} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="group-workflow-empty">
                <strong>No active group chats yet.</strong> Active groups will
                be listed here when you join one.
                <div className="authenticated-workspace-empty-action">
                  <GroupWorkflowLink />
                </div>
              </div>
            )}
          </section>
          <section className="group-workflow-panel authenticated-private-messages-soon">
            <h2>
              <MessageCircle size={18} /> Private messages <span>SOON</span>
            </h2>
            <p>Private messaging is not part of this release.</p>
          </section>
        </div>
      )}
    </main>
  );
}

export function AuthenticatedAbout() {
  return (
    <main className="authenticated-workspace-page">
      <PageHeading
        eyebrow="CITYLINK · CURRENT PREVIEW"
        title="About this demo"
        description="CityLink keeps its fictional sample experience separate from signed-in Supabase Test workflows."
      />
      <div className="group-workflow-grid authenticated-workspace-lists">
        <section className="group-workflow-panel">
          <h2>Fictional demo</h2>
          <p>
            The /demo experience uses fictional course, student, and invitation
            data stored by the browser. Those records are not connected to
            university systems or to your signed-in Test account.
          </p>
        </section>
        <section className="group-workflow-panel">
          <h2>Signed-in Test workflows</h2>
          <p>
            Dashboard courses, course enrolments, your profile, invitations, and
            group workflows use the existing Supabase Auth and Test-backed
            services. Self-enrolment does not verify actual university
            registration.
          </p>
        </section>
        <section className="group-workflow-panel wide">
          <h2>Messaging is not built yet</h2>
          <p>
            Messages can list active groups and link to the existing Group Chat
            placeholder. Private messages and group chat sending/receiving are
            not implemented in this release.
          </p>
          <div className="authenticated-workspace-empty-action">
            <Link href="/dashboard" className="primary">
              Open your dashboard <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
