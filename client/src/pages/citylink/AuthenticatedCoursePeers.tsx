import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { CoursePeerList } from "@/components/citylink/CoursePeerList";
import { CourseIcon, EmptyState, Status } from "@/components/citylink/Shared";
import {
  useSupabaseSession,
  type SupabaseSessionState,
} from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";
import {
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listActiveGroupMembers,
  listCourseGroupInviteCandidates,
  listCourseGroupPeers,
  listCourseGroupSummaries,
  loadGroupWorkflowSnapshot,
  loadOwnCourseProfile,
  sendGroupInvitation,
  type CourseGroupSummary,
  type GroupCoursePeer,
  type GroupMembershipRow,
  type GroupWorkflowSnapshot,
  type OwnCourseProfile,
} from "@/lib/supabaseGroups";
import {
  filterCoursePeers,
  getCourseInviteGroups,
  getPeerInvitationState,
  getViewerGroupRelationship,
  isCoursePeerInviteable,
  splitCoursePeersByGroup,
} from "@/lib/courseDetailActions";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  createActionOwner,
  createRequestGeneration,
  isCurrentCourseSnapshot,
  matchesCourseScope,
  subscribeCourseRequestInvalidation,
} from "@/lib/courseRequestRefresh";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import {
  CreatePeopleGroupInviteDialog,
  getPeopleInviteErrorMessage,
  PeopleGroupCapacity,
} from "./PeopleCapacity";
import { getGroupCapacityState } from "./groupCapacity";
import "./CourseDetail.css";

type DetailData = {
  userId: string;
  courseId: string;
  generation: number;
  directory: CourseDirectorySnapshot;
  groups: GroupWorkflowSnapshot;
  ownProfile: OwnCourseProfile;
};
type RosterData = {
  userId: string;
  courseId: string;
  generation: number;
  peers: GroupCoursePeer[];
  summaries: CourseGroupSummary[];
  inviteCandidateIds: string[];
};
type Feedback = { tone: "success" | "error"; message: string };
type RosterFilter = "all" | "open" | "considering" | "full";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toLocaleUpperCase() ?? "")
      .join("") || "?"
  );
}

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
          <p className="eyebrow">COURSE DETAIL · CLASSMATES</p>
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

function groupStatusLabel(status: CourseGroupSummary["group_status"]) {
  return status === "forming"
    ? "Forming · awaiting first acceptance"
    : "Active";
}

function inviteCapacityMessage(
  capacityState: string,
  visibleCount: number | null,
  maximum: number | null
): string | null {
  if (capacityState === "full") {
    return maximum !== null && visibleCount !== null
      ? `Group is full (${visibleCount}/${maximum} members). The leader must open a place before you can invite.`
      : "Group is full. The leader must open a place before you can invite.";
  }
  if (capacityState === "maximum_not_set") {
    return "Group maximum is not set. The leader must set a maximum from 2 to 19 before anyone can be invited.";
  }
  if (capacityState === "over_limit") {
    return "This group has more than 19 active members. The leader must remove members before anyone can be added.";
  }
  return null;
}

export function getInviteGroupCapacity(
  group: GroupWorkflowSnapshot["groups"][number],
  roster: GroupMembershipRow[] | null,
  userId: string
): { count: number | null; maximum: number | null } {
  if (roster === null) {
    // A failed or incomplete roster read must remain server-checked.
    return { count: null, maximum: group.max_members };
  }
  const creatorIncluded = roster.some(
    member => member.profile_id === group.creator_id
  );
  const formingCreator =
    group.status === "forming" &&
    group.creator_id === userId &&
    !creatorIncluded;
  return {
    count: roster.length + (formingCreator ? 1 : 0),
    maximum: group.max_members,
  };
}

export default function AuthenticatedCoursePeers({
  courseId,
  embedded = false,
  refreshToken = 0,
}: {
  courseId: string;
  embedded?: boolean;
  refreshToken?: number;
}) {
  const session = useSupabaseSession();
  const authGeneration = session.authGeneration ?? 0;
  // Remount the whole view when its account or course changes. This prevents
  // feedback, drafts, and pending actions from crossing into another view.
  const key = JSON.stringify([
    session.status,
    session.user?.id ?? null,
    courseId,
    authGeneration,
  ]);
  return (
    <CoursePeersView
      key={key}
      courseId={courseId}
      embedded={embedded}
      refreshToken={refreshToken}
      session={session}
    />
  );
}

function CoursePeersView({
  courseId,
  embedded,
  refreshToken,
  session,
}: {
  courseId: string;
  embedded: boolean;
  refreshToken: number;
  session: SupabaseSessionState;
}) {
  const userId = session.user?.id ?? null;
  const authGeneration = session.authGeneration ?? 0;
  const scope = { userId, courseId };
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mountedRef = useRef(true);
  const actionContext = useRef({ userId, courseId, authGeneration });
  const pendingInvite = useRef<symbol | null>(null);
  if (
    actionContext.current.userId !== userId ||
    actionContext.current.courseId !== courseId ||
    actionContext.current.authGeneration !== authGeneration
  ) {
    actionContext.current = { userId, courseId, authGeneration };
    pendingInvite.current = null;
  }
  const createDialogTrigger = useRef<HTMLButtonElement | null>(null);

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState("");
  const [groupSummaryError, setGroupSummaryError] = useState("");
  const [inviteEligibilityError, setInviteEligibilityError] = useState("");
  const [inviteRosters, setInviteRosters] = useState<
    Record<string, GroupMembershipRow[] | null>
  >({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [busyPeerId, setBusyPeerId] = useState("");
  const [choosingPeerId, setChoosingPeerId] = useState("");
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [creatingPeer, setCreatingPeer] = useState<GroupCoursePeer | null>(
    null
  );
  const [creationError, setCreationError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const requestGeneration = useRef(createRequestGeneration()).current;
  const rosterGeneration = useRef(createRequestGeneration()).current;
  const actions = useRef(createActionOwner()).current;
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingInvite.current = null;
      actionContext.current = {
        userId: null,
        courseId: "",
        authGeneration: -1,
      };
    };
  }, []);
  useEffect(() => {
    setFeedback(null);
    setSearch("");
    setFilter("all");
    setChoosingPeerId("");
    setChosenGroupId("");
    setCreatingPeer(null);
    setCreationError("");
    setBusyPeerId("");
  }, [authGeneration, courseId, userId]);

  useEffect(() => {
    actions.mount();
    return () => {
      actions.unmount();
    };
  }, [actions]);

  // Listen before starting the reads, so a request settling after a remount
  // invalidates any read that may have started before the server committed it.
  useEffect(
    () =>
      subscribeCourseRequestInvalidation(
        () => currentScope.current,
        () => {
          requestGeneration.invalidate();
          rosterGeneration.invalidate();
          setData(null);
          setRoster(null);
          setLoading(true);
          setPeerLoading(true);
          setRetryToken(value => value + 1);
        }
      ),
    [requestGeneration, rosterGeneration]
  );

  useEffect(() => {
    const generation = requestGeneration.invalidate();
    let active = true;
    const isCurrent = () =>
      active &&
      requestGeneration.isCurrent(generation) &&
      matchesCourseScope(currentScope.current, scope);
    if (session.status !== "ready" || !userId || !supabaseClient) {
      setData(null);
      setLoading(false);
      setLoadError("");
      return () => {
        active = false;
        if (requestGeneration.isCurrent(generation))
          requestGeneration.invalidate();
      };
    }
    setLoading(true);
    setLoadError("");
    void Promise.all([
      loadCourseDirectory(userId),
      loadGroupWorkflowSnapshot(userId),
      loadOwnCourseProfile(userId),
    ])
      .then(([directory, groups, ownProfile]) => {
        if (!isCurrent()) return;
        setData({
          userId,
          courseId,
          generation,
          directory,
          groups,
          ownProfile,
        });
        setLoading(false);
      })
      .catch(error => {
        if (!isCurrent()) return;
        const courseMessage = getCourseDirectoryErrorMessage(error, "read");
        const groupMessage = getGroupWorkflowErrorMessage(error);
        setLoadError(
          courseMessage !==
            "CityLink could not load the Supabase course catalogue. Check your connection and try again."
            ? courseMessage
            : groupMessage
        );
        setLoading(false);
      });
    return () => {
      active = false;
      if (requestGeneration.isCurrent(generation))
        requestGeneration.invalidate();
    };
  }, [
    authGeneration,
    courseId,
    requestGeneration,
    retryToken,
    session.status,
    userId,
  ]);

  const ownData = isCurrentCourseSnapshot(
    data,
    scope,
    requestGeneration.current()
  )
    ? data
    : null;
  const course = ownData?.directory.courses.find(item => item.id === courseId);
  const enrolled = Boolean(
    ownData?.directory.enrolledCourseIds.includes(courseId)
  );

  useEffect(() => {
    const generation = rosterGeneration.invalidate();
    let active = true;
    const isCurrent = () =>
      active &&
      rosterGeneration.isCurrent(generation) &&
      matchesCourseScope(currentScope.current, scope);
    if (session.status !== "ready" || !userId || !ownData || !enrolled) {
      setRoster(null);
      setPeerError("");
      setGroupSummaryError("");
      setInviteEligibilityError("");
      setPeerLoading(false);
      return () => {
        active = false;
      };
    }
    setPeerLoading(true);
    setRoster(null);
    setPeerError("");
    setGroupSummaryError("");
    setInviteEligibilityError("");
    void Promise.allSettled([
      listCourseGroupPeers(userId, courseId),
      listCourseGroupSummaries(userId, courseId),
      listCourseGroupInviteCandidates(userId, courseId),
    ]).then(([rosterResult, summaryResult, eligibilityResult]) => {
      if (!isCurrent()) return;
      setRoster({
        userId,
        courseId,
        generation,
        peers:
          rosterResult.status === "fulfilled"
            ? rosterResult.value.filter(peer => peer.profile_id !== userId)
            : [],
        summaries:
          summaryResult.status === "fulfilled" ? summaryResult.value : [],
        inviteCandidateIds:
          eligibilityResult.status === "fulfilled"
            ? eligibilityResult.value
            : [],
      });
      if (rosterResult.status === "rejected")
        setPeerError(getGroupWorkflowErrorMessage(rosterResult.reason));
      if (summaryResult.status === "rejected")
        setGroupSummaryError(
          "Group membership could not be verified. The coursemate list and group actions are hidden until the group-summary service is available."
        );
      if (eligibilityResult.status === "rejected")
        setInviteEligibilityError(
          "Invitation eligibility could not be verified. Invite actions are hidden until the Test eligibility service is available."
        );
      setPeerLoading(false);
    });
    return () => {
      active = false;
      if (rosterGeneration.isCurrent(generation)) rosterGeneration.invalidate();
    };
  }, [
    authGeneration,
    courseId,
    enrolled,
    ownData,
    refreshToken,
    retryToken,
    rosterGeneration,
    session.status,
    userId,
  ]);

  const ownRoster = isCurrentCourseSnapshot(
    roster,
    scope,
    rosterGeneration.current()
  )
    ? roster
    : null;
  const peers = ownRoster?.peers ?? [];
  const summaries = ownRoster?.summaries ?? [];
  const inviteCandidateIds = ownRoster?.inviteCandidateIds ?? [];
  const isPeerLoading =
    peerLoading || (!ownRoster && !peerError && !groupSummaryError);

  const inviteGroups = useMemo(
    () =>
      ownData && userId
        ? getCourseInviteGroups(
            ownData.groups.groups,
            ownData.groups.memberships,
            courseId,
            userId
          )
        : [],
    [courseId, ownData, userId]
  );
  useEffect(() => {
    let active = true;
    if (!userId || inviteGroups.length === 0) {
      setInviteRosters({});
      return () => {
        active = false;
      };
    }
    void Promise.all(
      inviteGroups.map(async group => {
        try {
          return [
            group.id,
            await listActiveGroupMembers(userId, group.id),
          ] as const;
        } catch {
          return [group.id, null] as const;
        }
      })
    ).then(entries => {
      if (!active) return;
      setInviteRosters(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [authGeneration, inviteGroups, refreshToken, userId]);
  const inviteGroupOptions = useMemo(() => {
    if (!ownData || !userId) return [];
    return inviteGroups.map(group => {
      // The workflow snapshot contains only the viewer's own membership row.
      // Use the separately loaded full roster; a failed read stays unknown.
      const capacity = getInviteGroupCapacity(
        group,
        inviteRosters[group.id] ?? null,
        userId
      );
      const visibleCount = capacity.count;
      const maximum = capacity.maximum;
      const capacityState =
        visibleCount === null
          ? maximum === null
            ? "maximum_not_set"
            : "unknown"
          : getGroupCapacityState(visibleCount, maximum);
      return { group, visibleCount, maximum, capacityState };
    });
  }, [inviteGroups, inviteRosters, ownData, userId]);
  const selectedInviteOption = inviteGroupOptions.find(
    option => option.group.id === chosenGroupId
  );
  const activeInviteOption =
    selectedInviteOption ??
    (inviteGroupOptions.length === 1 ? inviteGroupOptions[0] : undefined);
  const activeInviteBlockedMessage = activeInviteOption
    ? inviteCapacityMessage(
        activeInviteOption.capacityState,
        activeInviteOption.visibleCount,
        activeInviteOption.maximum
      )
    : null;
  const splitPeers = useMemo(
    () => splitCoursePeersByGroup(peers, summaries),
    [peers, summaries]
  );
  const summaryByProfile = splitPeers.summaryByProfile;
  const myCourseGroup = useMemo(() => {
    if (!ownData || !userId) return null;
    const activeIds = new Set(
      ownData.groups.memberships
        .filter(
          row =>
            row.course_id === courseId &&
            row.profile_id === userId &&
            row.membership_status === "active"
        )
        .map(row => row.group_id)
    );
    return (
      ownData.groups.groups.find(
        group =>
          group.course_id === courseId &&
          ((group.status === "active" && activeIds.has(group.id)) ||
            (group.status === "forming" && group.creator_id === userId))
      ) ?? null
    );
  }, [courseId, ownData, userId]);
  const visiblePeers = filterCoursePeers(
    peers,
    search,
    filter,
    summaryByProfile
  );
  const visibleCount = visiblePeers.length;

  async function sendInvite(
    peer: GroupCoursePeer,
    creation?: { name: string; maxMembers: number }
  ) {
    if (
      !userId ||
      !ownData ||
      !ownRoster ||
      !requestGeneration.isCurrent(ownData.generation) ||
      !rosterGeneration.isCurrent(ownRoster.generation) ||
      busyPeerId ||
      pendingInvite.current ||
      groupSummaryError ||
      inviteEligibilityError ||
      !isCoursePeerInviteable(peer.status) ||
      !inviteCandidateIds.includes(peer.profile_id) ||
      summaryByProfile.has(peer.profile_id)
    ) {
      if (creation && !pendingInvite.current) {
        setCreationError(
          "Invitation eligibility could not be confirmed. Close this dialog and refresh the page."
        );
      }
      return;
    }
    if (inviteGroups.length === 0 && !creation) {
      setCreationError("");
      setCreatingPeer(peer);
      return;
    }
    if (creation && inviteGroups.length !== 0) {
      setCreationError(
        "Your group status has changed. Close this dialog and refresh the page before inviting."
      );
      return;
    }
    const selectedGroupId =
      inviteGroups.length === 1 ? inviteGroups[0].id : chosenGroupId;
    if (!creation && !selectedGroupId) return;
    if (!creation) {
      const selectedOption = inviteGroupOptions.find(
        option => option.group.id === selectedGroupId
      );
      const blockedMessage = selectedOption
        ? inviteCapacityMessage(
            selectedOption.capacityState,
            selectedOption.visibleCount,
            selectedOption.maximum
          )
        : null;
      if (blockedMessage) {
        setFeedback({ tone: "error", message: blockedMessage });
        return;
      }
    }
    const action = actions.begin();
    if (!action) return;
    const context = actionContext.current;
    const attempt = Symbol("people-invitation");
    const isCurrent = () =>
      mountedRef.current &&
      actionContext.current === context &&
      pendingInvite.current === attempt &&
      actions.isCurrent(action);
    pendingInvite.current = attempt;
    setBusyPeerId(peer.profile_id);
    setFeedback(null);
    setCreationError("");
    try {
      if (creation) {
        await createGroupAndInvite(
          userId,
          courseId,
          peer.profile_id,
          creation.name,
          creation.maxMembers,
          isCurrent
        );
        if (!isCurrent()) return;
        setCreatingPeer(null);
        setFeedback({
          tone: "success",
          message:
            "Your first invitation was sent. A forming group has been created with you as its leader; it becomes active when the invitee accepts.",
        });
      } else {
        await sendGroupInvitation(
          userId,
          selectedGroupId,
          peer.profile_id,
          isCurrent
        );
        if (!isCurrent()) return;
        setFeedback({
          tone: "success",
          message: "Your group invitation was sent.",
        });
      }
      setChoosingPeerId("");
      setChosenGroupId("");
      setRetryToken(value => value + 1);
    } catch (error) {
      if (!isCurrent()) return;
      const message = getPeopleInviteErrorMessage(error);
      if (creation) setCreationError(message);
      else setFeedback({ tone: "error", message });
    } finally {
      if (isCurrent()) {
        pendingInvite.current = null;
        setBusyPeerId("");
      }
      actions.finish(action);
    }
  }

  function renderPeerCard(peer: GroupCoursePeer) {
    const summary = summaryByProfile.get(peer.profile_id);
    const relationship =
      summary && ownData && userId
        ? getViewerGroupRelationship({
            userId,
            courseId,
            groupId: summary.group_id,
            memberships: ownData.groups.memberships,
            joinRequests: ownData.groups.joinRequests,
          })
        : null;
    const invitationState =
      ownData && userId
        ? getPeerInvitationState(
            userId,
            peer.profile_id,
            courseId,
            [
              ...ownData.groups.incomingInvitations,
              ...ownData.groups.outgoingInvitations,
            ],
            !inviteEligibilityError &&
              !groupSummaryError &&
              inviteCandidateIds.includes(peer.profile_id) &&
              !summary
          )
        : null;
    const isChoosing = choosingPeerId === peer.profile_id;
    const inviteable = Boolean(
      !summary &&
        !groupSummaryError &&
        !inviteEligibilityError &&
        invitationState !== "connected" &&
        isCoursePeerInviteable(peer.status) &&
        inviteCandidateIds.includes(peer.profile_id)
    );
    return (
      <article className="classmate-card" key={peer.profile_id}>
        <div className="classmate-person">
          <span className="avatar sage" aria-label={peer.display_name}>
            {initials(peer.display_name)}
          </span>
          <div>
            <h3>{peer.display_name}</h3>
            <p>
              {peer.major || "Major not provided"} <span>·</span> Year{" "}
              {peer.year}
            </p>
            {!embedded && (
              <small>{peer.student_id || "Student ID not provided"}</small>
            )}
            <Link
              className="classmate-portfolio-link"
              href={`/my-courses/${encodeURIComponent(courseId)}/people/${encodeURIComponent(peer.profile_id)}`}
            >
              View portfolio
            </Link>
          </div>
        </div>
        <div className="classmate-detail">
          {summary ? (
            <span className="status full">
              <span /> In a group
            </span>
          ) : peer.status === "full" ? (
            <span className="status full">
              <span /> Not accepting invitations
            </span>
          ) : (
            <Status status={peer.status} />
          )}
          {summary ? (
            <div className="classmate-group-meta">
              <strong>{summary.group_name || "Study group"}</strong>
              <span>{groupStatusLabel(summary.group_status)}</span>
              <PeopleGroupCapacity
                count={summary.capacity_count}
                maximum={summary.max_members}
                state={summary.capacity_state}
              />
            </div>
          ) : (
            <div className="classmate-group-meta looking">
              <strong>No current group</strong>
            </div>
          )}
          <div className="skill-tags">
            {peer.skills.slice(0, 3).map(skill => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </div>
        <div className="classmate-actions course-detail-actions">
          {summary ? (
            relationship === "member" ? (
              <button
                type="button"
                className="invite-disabled course-detail-member-label"
                disabled
                title="This is already your group"
              >
                You are in this group already
              </button>
            ) : relationship === "requested" ? (
              <Link href="/my-groups" className="invite-status compact">
                Requested
              </Link>
            ) : summary.group_id === myCourseGroup?.id ? (
              <button
                type="button"
                className="invite-disabled compact"
                disabled
              >
                Your forming group
              </button>
            ) : (
              <Link
                href={`/groups/${encodeURIComponent(summary.group_id)}/members`}
                className="secondary invite-compact"
              >
                Group details
              </Link>
            )
          ) : invitationState === "sent" ? (
            <Link href="/my-groups" className="invite-status compact">
              Invitation sent
            </Link>
          ) : invitationState === "received" ? (
            <Link href="/my-groups" className="invite-status compact">
              Invitation received
            </Link>
          ) : invitationState === "connected" ? (
            <button type="button" className="invite-disabled compact" disabled>
              Previously connected
            </button>
          ) : inviteable ? (
            isChoosing && inviteGroups.length > 1 ? (
              <div className="course-detail-group-choice">
                <label htmlFor={`invite-group-${peer.profile_id}`}>
                  Choose your group
                </label>
                <select
                  id={`invite-group-${peer.profile_id}`}
                  value={chosenGroupId}
                  onChange={event => setChosenGroupId(event.target.value)}
                >
                  <option value="">Select a group</option>
                  {inviteGroupOptions.map(option => {
                    const blockedMessage = inviteCapacityMessage(
                      option.capacityState,
                      option.visibleCount,
                      option.maximum
                    );
                    return (
                      <option
                        value={option.group.id}
                        key={option.group.id}
                        disabled={Boolean(blockedMessage)}
                      >
                        {option.group.name || "Study group"} ·{" "}
                        {option.group.status}
                        {blockedMessage ? ` · ${blockedMessage}` : ""}
                      </option>
                    );
                  })}
                </select>
                {activeInviteBlockedMessage && (
                  <p className="course-detail-capacity-hint" role="status">
                    {activeInviteBlockedMessage}
                  </p>
                )}
                <button
                  type="button"
                  className="primary invite-compact"
                  disabled={
                    !chosenGroupId ||
                    Boolean(busyPeerId) ||
                    Boolean(activeInviteBlockedMessage)
                  }
                  onClick={() => void sendInvite(peer)}
                >
                  {busyPeerId === peer.profile_id ? "Sending…" : "Send invite"}
                </button>
                <button
                  type="button"
                  className="course-detail-cancel-choice"
                  onClick={() => {
                    setChoosingPeerId("");
                    setChosenGroupId("");
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="primary invite-compact"
                  disabled={
                    Boolean(busyPeerId) || Boolean(activeInviteBlockedMessage)
                  }
                  aria-label={`Invite ${peer.display_name}`}
                  onClick={event => {
                    if (inviteGroups.length > 1) {
                      setChoosingPeerId(peer.profile_id);
                      setChosenGroupId("");
                    } else {
                      if (inviteGroups.length === 0) {
                        createDialogTrigger.current = event.currentTarget;
                      }
                      void sendInvite(peer);
                    }
                  }}
                >
                  <Send size={15} />{" "}
                  {busyPeerId === peer.profile_id ? "Sending…" : "Invite"}
                </button>
                {activeInviteBlockedMessage && (
                  <p className="course-detail-capacity-hint" role="status">
                    {activeInviteBlockedMessage}
                  </p>
                )}
              </>
            )
          ) : (
            <button
              type="button"
              className="invite-disabled compact"
              disabled
              title={
                groupSummaryError ||
                inviteEligibilityError ||
                (peer.status === "full"
                  ? "This student is not currently accepting invitations"
                  : "This student is not eligible under the existing invite rules")
              }
            >
              Invite
            </button>
          )}
        </div>
      </article>
    );
  }

  if (embedded && session.status === "loading")
    return (
      <div className="course-directory-state" role="status">
        <span className="spinner" /> Checking your sign-in…
      </div>
    );
  if (embedded && session.status === "error")
    return (
      <div className="course-directory-feedback error" role="alert">
        Your sign-in is unavailable. Return to the sign-in page and try again.
      </div>
    );
  if (embedded && !userId) return null;
  if (embedded && !supabaseClient)
    return (
      <div className="course-directory-feedback error" role="alert">
        Supabase is not configured, so coursemates cannot be loaded.
      </div>
    );
  if (session.status === "loading")
    return (
      <AccessScreen
        title="Checking your sign-in…"
        message="CityLink is restoring your Supabase Auth session before loading coursemates."
      />
    );
  if (session.status === "error")
    return (
      <AccessScreen
        title="Your sign-in is unavailable"
        message="We could not restore your account session. Return to the sign-in page and try again."
      />
    );
  if (!userId)
    return (
      <AccessScreen
        title="Sign in to view coursemates"
        message="Course and group information is loaded from the authenticated Test database."
      />
    );
  if (!supabaseClient)
    return (
      <AccessScreen
        email={session.user?.email}
        title="Course data is unavailable"
        message="Supabase is not configured. This page does not fall back to fictional samples."
      />
    );

  const content = (
    <>
      {!embedded && (
        <Link href={`/courses/${courseId}`} className="back-link">
          <ArrowLeft size={17} /> My Group
        </Link>
      )}
      {loading && (
        <div className="course-directory-state" role="status">
          <span className="spinner" /> Loading Test coursemates and group
          status…
        </div>
      )}
      {!loading && loadError && (
        <EmptyState
          title="Course data could not be loaded"
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
      {!loading && !loadError && !course && (
        <EmptyState
          title="Course not found"
          description="This course ID is not in the authenticated Test catalogue."
        >
          <Link href="/my-courses" className="secondary">
            Open My Courses
          </Link>
        </EmptyState>
      )}
      {!loading && !loadError && course && (
        <>
          {!embedded && (
            <>
              <div className="course-page-heading">
                <CourseIcon course={course} size={28} />
                <div>
                  <p className="eyebrow">{course.code} · COURSE DETAIL</p>
                  <h1>{course.title}</h1>
                  <p>
                    {course.department} · {course.semester}
                  </p>
                </div>
              </div>
              <p className="course-description">
                {course.description || "No course description is available."}
              </p>
              <div className="course-detail-list-link">
                <Users size={17} />
                <span>
                  Classmate group status and actions are shown below. Students
                  see only the group name, size and status—not other groups’
                  private requests.
                </span>
              </div>
            </>
          )}
          {!enrolled && (
            <div className="course-detail-enrolment-gate" role="status">
              <strong>You are not enrolled in this course.</strong> The
              classmate roster and group associations are hidden until you add
              the course.
              <Link href="/my-courses">Browse and add courses</Link>
            </div>
          )}
          {enrolled && (
            <>
              <div className="course-detail-invite-rule" role="note">
                Invite actions follow the existing server eligibility rules. Any
                active member may invite to a group; the creator may also send
                the first invitation while a group is forming. Group leaders set
                a maximum, and pending invitations do not reserve a place. To
                find groups seeking members, browse the course’s recruitment
                posts.
              </div>
              {feedback && (
                <p
                  className={`group-workflow-feedback ${feedback.tone}`}
                  role={feedback.tone === "error" ? "alert" : "status"}
                >
                  {feedback.message}
                </p>
              )}
              <div className="classmates-section-title">
                <h2>
                  Coursemates <span className="count-pill">{peers.length}</span>
                </h2>
                {!isPeerLoading &&
                  !groupSummaryError &&
                  !inviteEligibilityError && (
                    <span>
                      <i className="green-dot" />
                      {inviteCandidateIds.length} eligible to invite
                    </span>
                  )}
              </div>
              <div className="classmates-toolbar">
                <label className="directory-search">
                  <Search size={18} />
                  <span className="sr-only">Search coursemates</span>
                  <input
                    aria-label="Search coursemates by name, student ID, or major"
                    placeholder="Search coursemates…"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear classmate search"
                      onClick={() => setSearch("")}
                    >
                      ×
                    </button>
                  )}
                </label>
                <label className="filter-select">
                  <span className="sr-only">Filter by availability</span>
                  <select
                    aria-label="Filter coursemates by availability"
                    value={filter}
                    onChange={event =>
                      setFilter(event.target.value as RosterFilter)
                    }
                  >
                    <option value="all">All availability</option>
                    <option value="open">Looking for a group</option>
                    <option value="considering">Open to invitations</option>
                    <option value="full">Not accepting invitations</option>
                  </select>
                </label>
                <span className="results-label">
                  {visibleCount}{" "}
                  {visibleCount === 1 ? "coursemate" : "coursemates"}
                </span>
              </div>
              {peerError && (
                <div className="course-directory-feedback error" role="alert">
                  {peerError}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRetryToken(value => value + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {groupSummaryError && (
                <div className="course-directory-feedback error" role="alert">
                  {groupSummaryError}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRetryToken(value => value + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {inviteEligibilityError && (
                <div className="course-directory-feedback info" role="status">
                  {inviteEligibilityError}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRetryToken(value => value + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {isPeerLoading && (
                <div className="course-directory-state" role="status">
                  <span className="spinner" /> Loading current coursemates…
                </div>
              )}
              {!isPeerLoading && !peerError && peers.length === 0 && (
                <EmptyState
                  title="No other coursemates are enrolled yet"
                  description="This list is based on current Test enrolment records. No sample names are added by the page."
                />
              )}
              {!isPeerLoading &&
                !peerError &&
                peers.length > 0 &&
                !groupSummaryError &&
                visibleCount === 0 && (
                  <EmptyState
                    title="No coursemates match those filters"
                    description="Try another name or availability status."
                  >
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </EmptyState>
                )}
              {!isPeerLoading &&
                !peerError &&
                peers.length > 0 &&
                !groupSummaryError &&
                visibleCount > 0 && (
                  <CoursePeerList
                    peers={visiblePeers}
                    renderPeer={renderPeerCard}
                  />
                )}
              <p className="data-footnote">
                Group summaries return only each coursemate’s group association,
                name, capacity and status. The Test server remains authoritative
                for invite, request and cancellation eligibility.
              </p>
              {creatingPeer && (
                <CreatePeopleGroupInviteDialog
                  peerName={creatingPeer.display_name}
                  busy={busyPeerId === creatingPeer.profile_id}
                  serverError={creationError}
                  onCancel={() => {
                    setCreatingPeer(null);
                    setCreationError("");
                  }}
                  onSubmit={(name, maxMembers) =>
                    void sendInvite(creatingPeer, { name, maxMembers })
                  }
                  onCloseAutoFocus={event => {
                    if (createDialogTrigger.current?.isConnected) {
                      event.preventDefault();
                      createDialogTrigger.current.focus();
                    }
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="course-detail-embedded">{content}</div>;
  }

  return (
    <div className="authenticated-courses-page course-detail-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">{content}</main>
      <footer className="authenticated-courses-footer">
        Supabase Test course data · not verified university registration
      </footer>
    </div>
  );
}
