import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { CourseIcon, EmptyState, Status } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";
import {
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listCourseGroupInviteCandidates,
  listCourseGroupPeers,
  loadGroupWorkflowSnapshot,
  sendGroupInvitation,
  type GroupCoursePeer,
  type GroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import {
  getCourseInviteGroups,
  getPeerInvitationState,
  isCoursePeerInviteable,
} from "@/lib/courseDetailActions";
import { supabaseClient } from "@/lib/supabaseClient";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import "./CourseDetail.css";

type DetailData = {
  userId: string;
  directory: CourseDirectorySnapshot;
  groups: GroupWorkflowSnapshot;
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
          <p className="eyebrow">COURSE DETAIL · TEST DATABASE</p>
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

export default function AuthenticatedCourseDetail({
  courseId,
}: {
  courseId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [peers, setPeers] = useState<GroupCoursePeer[]>([]);
  const [inviteCandidateIds, setInviteCandidateIds] = useState<string[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState("");
  const [inviteEligibilityError, setInviteEligibilityError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [busyPeerId, setBusyPeerId] = useState("");
  const [choosingPeerId, setChoosingPeerId] = useState("");
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [retryToken, setRetryToken] = useState(0);
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
        if (requestGeneration.current === generation) {
          requestGeneration.current += 1;
        }
      };
    }

    setLoading(true);
    setLoadError("");
    setPeerError("");
    setFeedback(null);
    void Promise.all([
      loadCourseDirectory(userId),
      loadGroupWorkflowSnapshot(userId),
    ])
      .then(([directory, groups]) => {
        if (!isCurrent()) return;
        setData({ userId, directory, groups });
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
      if (requestGeneration.current === generation) {
        requestGeneration.current += 1;
      }
    };
  }, [retryToken, session.status, userId]);

  const ownData = data?.userId === userId ? data : null;
  const course = ownData?.directory.courses.find(item => item.id === courseId);
  const enrolled = Boolean(
    ownData?.directory.enrolledCourseIds.includes(courseId)
  );

  useEffect(() => {
    let active = true;
    if (
      session.status !== "ready" ||
      !userId ||
      ownData?.userId !== userId ||
      !enrolled
    ) {
      setPeers([]);
      setInviteCandidateIds([]);
      setPeerError("");
      setInviteEligibilityError("");
      setPeerLoading(false);
      return () => {
        active = false;
      };
    }

    setPeerLoading(true);
    setPeerError("");
    setInviteCandidateIds([]);
    setInviteEligibilityError("");
    void Promise.allSettled([
      listCourseGroupPeers(userId, courseId),
      listCourseGroupInviteCandidates(userId, courseId),
    ]).then(([rosterResult, eligibilityResult]) => {
      if (!active || userIdRef.current !== userId) return;
      if (rosterResult.status === "fulfilled") {
        setPeers(rosterResult.value.filter(peer => peer.profile_id !== userId));
      } else {
        setPeers([]);
        setPeerError(getGroupWorkflowErrorMessage(rosterResult.reason));
      }
      if (eligibilityResult.status === "fulfilled") {
        setInviteCandidateIds(eligibilityResult.value);
      } else {
        setInviteCandidateIds([]);
        setInviteEligibilityError(
          "Invitation eligibility could not be verified. Invite actions are hidden until the Test eligibility service is available."
        );
      }
      setPeerLoading(false);
    });

    return () => {
      active = false;
    };
  }, [courseId, enrolled, ownData?.userId, retryToken, session.status, userId]);

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

  const filteredPeers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return peers.filter(peer => {
      if (filter !== "all" && peer.status !== filter) return false;
      if (!query) return true;
      return [peer.display_name, peer.student_id ?? "", peer.major ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [filter, peers, search]);

  async function sendInvite(peer: GroupCoursePeer) {
    if (!userId || !ownData || busyPeerId) return;
    if (!inviteCandidateIds.includes(peer.profile_id)) return;
    setBusyPeerId(peer.profile_id);
    setFeedback(null);
    try {
      if (inviteGroups.length === 0) {
        await createGroupAndInvite(userId, courseId, peer.profile_id);
        setFeedback({
          tone: "success",
          message:
            "Your first invitation was sent. A forming group has been created with you as its leader; it becomes active when the invitee accepts.",
        });
      } else {
        const selectedGroupId =
          inviteGroups.length === 1 ? inviteGroups[0].id : chosenGroupId;
        if (!selectedGroupId) return;
        await sendGroupInvitation(userId, selectedGroupId, peer.profile_id);
        setFeedback({
          tone: "success",
          message: "Your group invitation was sent.",
        });
      }
      setChoosingPeerId("");
      setChosenGroupId("");
      setRetryToken(value => value + 1);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getGroupWorkflowErrorMessage(error),
      });
    } finally {
      setBusyPeerId("");
    }
  }

  if (session.status === "loading") {
    return (
      <AccessScreen
        title="Checking your sign-in…"
        message="CityLink is restoring your Supabase Auth session before loading this course."
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
        title="Sign in to view coursemates"
        message="Course details and classmates are loaded from the authenticated Test database. The fictional demo stays separate."
      />
    );
  }
  if (!supabaseClient) {
    return (
      <AccessScreen
        email={session.user?.email}
        title="Course data is unavailable"
        message="Supabase is not configured in this environment. This page does not fall back to fictional samples."
      />
    );
  }

  return (
    <div className="authenticated-courses-page course-detail-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <Link href="/my-courses" className="back-link">
          <ArrowLeft size={17} /> Back to My Courses
        </Link>

        {loading && (
          <div className="course-directory-state" role="status">
            <span className="spinner" /> Loading the Test course and your group
            access…
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
            title="Course not found in the Test catalogue"
            description="This course ID is not present in the authenticated Supabase course catalogue. Open My Courses to choose a current Test course."
          >
            <Link href="/my-courses" className="secondary">
              Open My Courses
            </Link>
          </EmptyState>
        )}

        {!loading && !loadError && course && (
          <>
            <div className="course-page-heading">
              <CourseIcon course={course} size={28} />
              <div>
                <p className="eyebrow">
                  {course.code} <span>·</span> {course.credits} CREDITS
                </p>
                <h1>{course.title}</h1>
                <p>
                  {course.department} · {course.semester}
                </p>
              </div>
            </div>
            <p className="course-description">
              {course.description || "No course description is available."}
            </p>

            <div className="course-detail-note" role="note">
              <Users size={18} />
              <div>
                <strong>Database-backed course detail</strong>
                <p>
                  Course and classmate details come from Supabase Test. Invite
                  actions use the existing group RPCs and remain subject to
                  server-side membership and enrolment checks.
                </p>
              </div>
            </div>

            {!enrolled && (
              <div className="course-detail-enrolment-gate" role="status">
                <strong>You are not enrolled in this course.</strong>
                The roster is intentionally not queried for a course outside
                your enrolments. Add the course from My Courses to view
                classmates.
                <Link href="/my-courses">Open My Courses</Link>
              </div>
            )}

            {enrolled && (
              <>
                <div className="course-detail-invite-rule" role="note">
                  {inviteGroups.length === 0
                    ? "Your first invite creates a forming group with you as its leader. Accepting the invitation activates the group."
                    : "Any active member can invite to a forming or active group. While a group is forming before active memberships exist, its creator can send the first invitation."}
                  {inviteGroups.length === 0 && " Group size has no maximum."}
                </div>

                <div className="classmates-section-title">
                  <h2>
                    Coursemates{" "}
                    <span className="count-pill">{peers.length}</span>
                  </h2>
                  {!peerLoading && !inviteEligibilityError && (
                    <span>
                      <i className="green-dot" />
                      {inviteCandidateIds.length} available to invite
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
                    <SlidersHorizontal size={17} />
                    <span className="sr-only">Filter by group status</span>
                    <select
                      aria-label="Filter coursemates by group status"
                      value={filter}
                      onChange={event =>
                        setFilter(event.target.value as RosterFilter)
                      }
                    >
                      <option value="all">All statuses</option>
                      <option value="open">Looking for a group</option>
                      <option value="considering">Open to invitations</option>
                      <option value="full">Group formed</option>
                    </select>
                  </label>
                  <span className="results-label">
                    {filteredPeers.length}{" "}
                    {filteredPeers.length === 1 ? "coursemate" : "coursemates"}
                  </span>
                </div>

                {feedback && (
                  <p
                    className={`group-workflow-feedback ${feedback.tone}`}
                    role={feedback.tone === "error" ? "alert" : "status"}
                  >
                    {feedback.message}
                  </p>
                )}
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
                {peerLoading && (
                  <div className="course-directory-state" role="status">
                    <span className="spinner" /> Loading enrolled coursemates…
                  </div>
                )}
                {!peerLoading && !peerError && peers.length === 0 && (
                  <EmptyState
                    title="No other coursemates are enrolled yet"
                    description="This roster comes from Test enrolment records. It does not add sample profiles or guess at class membership."
                  />
                )}
                {!peerLoading &&
                  !peerError &&
                  peers.length > 0 &&
                  filteredPeers.length === 0 && (
                    <EmptyState
                      title="No coursemates match those filters"
                      description="Try another name or group status."
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
                {!peerLoading && !peerError && filteredPeers.length > 0 && (
                  <div className="classmate-list">
                    {filteredPeers.map(peer => {
                      const invitationState = ownData
                        ? getPeerInvitationState(
                            userId,
                            peer.profile_id,
                            courseId,
                            [
                              ...ownData.groups.incomingInvitations,
                              ...ownData.groups.outgoingInvitations,
                            ]
                          )
                        : null;
                      const inviteable =
                        isCoursePeerInviteable(peer.status) &&
                        inviteCandidateIds.includes(peer.profile_id);
                      const isChoosing = choosingPeerId === peer.profile_id;
                      const pendingInvitation =
                        invitationState === "sent" ||
                        invitationState === "received";
                      return (
                        <article
                          className="classmate-card"
                          key={peer.profile_id}
                        >
                          <div className="classmate-person">
                            <span
                              className="avatar sage"
                              aria-label={peer.display_name}
                            >
                              {initials(peer.display_name)}
                            </span>
                            <div>
                              <h3>{peer.display_name}</h3>
                              <p>
                                {peer.major || "Major not provided"}{" "}
                                <span>·</span> Year {peer.year}
                              </p>
                              <small>
                                {peer.student_id || "Student ID not provided"}
                              </small>
                            </div>
                          </div>
                          <div className="classmate-detail">
                            <Status status={peer.status} />
                            <div className="skill-tags">
                              {peer.skills.slice(0, 3).map(skill => (
                                <span key={skill}>{skill}</span>
                              ))}
                            </div>
                          </div>
                          <div className="classmate-actions course-detail-actions">
                            {pendingInvitation ? (
                              <Link
                                href="/my-groups"
                                className="invite-status compact"
                              >
                                {invitationState === "sent"
                                  ? "Invitation sent"
                                  : "Invitation received"}
                              </Link>
                            ) : !inviteable ? (
                              <button
                                type="button"
                                className="invite-disabled compact"
                                disabled
                              >
                                {inviteEligibilityError
                                  ? "Invite unavailable"
                                  : peer.status === "full"
                                    ? "Group formed"
                                    : "Not available to invite"}
                              </button>
                            ) : isChoosing && inviteGroups.length > 1 ? (
                              <div className="course-detail-group-choice">
                                <label
                                  htmlFor={`invite-group-${peer.profile_id}`}
                                >
                                  Choose your group
                                </label>
                                <select
                                  id={`invite-group-${peer.profile_id}`}
                                  value={chosenGroupId}
                                  onChange={event =>
                                    setChosenGroupId(event.target.value)
                                  }
                                >
                                  <option value="">Select a group</option>
                                  {inviteGroups.map(group => (
                                    <option value={group.id} key={group.id}>
                                      {group.name || "Study group"} ·{" "}
                                      {group.status}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="primary invite-compact"
                                  disabled={
                                    !chosenGroupId || Boolean(busyPeerId)
                                  }
                                  onClick={() => void sendInvite(peer)}
                                >
                                  {busyPeerId === peer.profile_id
                                    ? "Sending…"
                                    : "Send invite"}
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
                              <button
                                type="button"
                                className="primary invite-compact"
                                disabled={Boolean(busyPeerId)}
                                aria-label={`Invite ${peer.display_name}`}
                                onClick={() => {
                                  if (inviteGroups.length > 1) {
                                    setChoosingPeerId(peer.profile_id);
                                    setChosenGroupId("");
                                  } else {
                                    void sendInvite(peer);
                                  }
                                }}
                              >
                                <Send size={15} />
                                {busyPeerId === peer.profile_id
                                  ? "Sending…"
                                  : "Invite"}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <p className="data-footnote">
                  Only coursemates returned by the Test roster RPC are shown.
                  Your own profile is excluded; RLS/RPC checks remain
                  authoritative for invite eligibility.
                </p>
              </>
            )}
          </>
        )}
      </main>
      <footer className="authenticated-courses-footer">
        Supabase Test course data · not verified university registration
      </footer>
    </div>
  );
}
