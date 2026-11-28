import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import AppShell from "@/components/citylink/AppShell";
import { CourseIcon } from "@/components/citylink/Shared";
import type { Course } from "@/data/sampleData";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
} from "@/lib/supabaseCourses";
import {
  getCourseInviteGroups,
  getPeerInvitationState,
  type PeerInvitationState,
} from "@/lib/courseDetailActions";
import {
  createGroupAndInvite,
  getGroupWorkflowErrorMessage,
  listActiveGroupMembers,
  listCourseGroupInviteCandidates,
  loadGroupWorkflowSnapshot,
  sendGroupInvitation,
  type GroupMembershipRow,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  getCurrentTermCoursemateProfile,
  getStage6ErrorMessage,
  type CoursemateProfile,
} from "@/lib/supabaseStage6";
import { getProfileInitials } from "@/lib/supabaseProfile";
import { CreatePeopleGroupInviteDialog } from "./PeopleCapacity";
import { MessageButton } from "./MessageButton";
import { getGroupCapacityState, validateGroupMaximum } from "./groupCapacity";
import { Stage6Status } from "./Stage6Layout";
import "./Stage6.css";

type InviteFeedback = { tone: "success" | "error"; message: string };

type PortfolioSnapshot = {
  profile: CoursemateProfile;
  course: Course;
  inviteGroups: StudyGroupRow[];
  invitationState: PeerInvitationState | null;
  canInvite: boolean;
  inviteError: string;
};

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Coursemate profile">
      <div className="authenticated-courses-page authenticated-courses-embedded">
        <main className="authenticated-courses-main authenticated-courses-main-embedded">
          {children}
        </main>
      </div>
    </AppShell>
  );
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || "this coursemate";
}

type PortfolioInviteOption = {
  group: StudyGroupRow;
  visibleCount: number | null;
  maximum: number | null;
  capacityState: string;
};

export function getPortfolioInviteCapacity(
  group: StudyGroupRow,
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

export function portfolioInviteCapacityMessage(
  capacityState: string,
  visibleCount: number | null,
  maximum: number | null
): string | null {
  if (capacityState === "full") {
    return "Group is full";
  }
  if (capacityState === "maximum_not_set") {
    return "Group maximum is not set";
  }
  if (capacityState === "over_limit") {
    return "This group has more than 19 active members. The leader must remove members before anyone can be added.";
  }
  if (capacityState === "checking") {
    return "Checking group capacity…";
  }
  if (capacityState === "unknown") {
    return "Group capacity could not be verified. Refresh the page before inviting.";
  }
  return null;
}

export function portfolioInviteCapacityGuidance(
  capacityState: string,
  visibleCount: number | null,
  maximum: number | null
): string | null {
  if (capacityState === "full") {
    return maximum !== null && visibleCount !== null
      ? `This group has ${visibleCount}/${maximum} active members. The leader must open a place before you can invite.`
      : "The leader must open a place before you can invite.";
  }
  if (capacityState === "maximum_not_set") {
    return "The leader must set a maximum from 2 to 19 before anyone can be invited.";
  }
  return null;
}

export default function CoursemateProfilePage({
  courseId,
  profileId,
}: {
  courseId: string;
  profileId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const authGeneration = session.authGeneration ?? 0;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const mountedRef = useRef(true);
  const actionContext = useRef({
    userId,
    courseId,
    profileId,
    authGeneration,
    status: session.status,
  });
  actionContext.current = {
    userId,
    courseId,
    profileId,
    authGeneration,
    status: session.status,
  };
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback | null>(
    null
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [inviteRosters, setInviteRosters] = useState<
    Record<string, GroupMembershipRow[] | null>
  >({});
  const requestGeneration = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    let active = true;
    const isCurrent = () => active && requestGeneration.current === generation;

    if (session.status !== "ready" || !userId) {
      setSnapshot(null);
      setLoading(false);
      setError("Sign in to view this coursemate profile.");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    setInviteFeedback(null);
    setChosenGroupId("");
    void Promise.allSettled([
      getCurrentTermCoursemateProfile(userId, courseId, profileId),
      loadCourseDirectory(userId),
      loadGroupWorkflowSnapshot(userId),
      listCourseGroupInviteCandidates(userId, courseId),
    ])
      .then(
        ([profileResult, directoryResult, groupsResult, candidatesResult]) => {
          if (!isCurrent()) return;

          if (profileResult.status === "rejected") {
            setSnapshot(null);
            setError(getStage6ErrorMessage(profileResult.reason));
            setLoading(false);
            return;
          }

          if (directoryResult.status === "rejected") {
            setSnapshot(null);
            setError(
              getCourseDirectoryErrorMessage(directoryResult.reason, "read")
            );
            setLoading(false);
            return;
          }

          const directory = directoryResult.value;
          const course = directory.courses.find(item => item.id === courseId);
          if (!course || !directory.enrolledCourseIds.includes(courseId)) {
            setSnapshot(null);
            setError(
              "This course is not in your enrolled current-term courses. Add the course before opening a coursemate portfolio."
            );
            setLoading(false);
            return;
          }

          const groups =
            groupsResult.status === "fulfilled" ? groupsResult.value : null;
          const candidateIds =
            candidatesResult.status === "fulfilled"
              ? candidatesResult.value
              : null;
          const inviteError = !groups
            ? "Invitation status could not be verified. Refresh before inviting."
            : !candidateIds
              ? "Invitation eligibility could not be verified. Refresh before inviting."
              : "";
          const inviteGroups = groups
            ? getCourseInviteGroups(
                groups.groups,
                groups.memberships,
                courseId,
                userId
              )
            : [];
          const invitationState = groups
            ? getPeerInvitationState(userId, profileId, courseId, [
                ...groups.incomingInvitations,
                ...groups.outgoingInvitations,
              ])
            : null;
          const canInvite = Boolean(
            !inviteError &&
              !invitationState &&
              candidateIds?.includes(profileId)
          );

          setSnapshot({
            profile: profileResult.value,
            course,
            inviteGroups,
            invitationState,
            canInvite,
            inviteError,
          });
          setLoading(false);
        }
      )
      .catch(() => {
        if (!isCurrent()) return;
        setSnapshot(null);
        setError(
          "CityLink could not load this portfolio. Check your connection and try again."
        );
        setLoading(false);
      });

    return () => {
      active = false;
      if (requestGeneration.current === generation)
        requestGeneration.current += 1;
    };
  }, [
    authGeneration,
    courseId,
    profileId,
    reloadToken,
    session.status,
    userId,
  ]);

  useEffect(() => {
    let active = true;
    const groups = snapshot?.inviteGroups ?? [];
    if (!userId || groups.length === 0) {
      setInviteRosters({});
      return () => {
        active = false;
      };
    }
    void Promise.all(
      groups.map(async group => {
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
  }, [authGeneration, reloadToken, session.status, snapshot, userId]);

  const inviteGroupOptions: PortfolioInviteOption[] =
    !snapshot || !userId
      ? []
      : snapshot.inviteGroups.map(group => {
          // The workflow snapshot contains only the viewer's own membership rows;
          // use the separately loaded full roster. Pending and failed reads both
          // block the local action; the server remains authoritative only after
          // the client has a usable roster.
          const rosterEntry = inviteRosters[group.id];
          const rosterLoaded = Object.prototype.hasOwnProperty.call(
            inviteRosters,
            group.id
          );
          const capacity = getPortfolioInviteCapacity(
            group,
            rosterEntry ?? null,
            userId
          );
          const visibleCount = capacity.count;
          const maximum = capacity.maximum;
          const capacityState =
            visibleCount === null
              ? maximum === null
                ? "maximum_not_set"
                : rosterLoaded
                  ? "unknown"
                  : "checking"
              : getGroupCapacityState(visibleCount, maximum);
          return { group, visibleCount, maximum, capacityState };
        });
  const selectedInviteOption = inviteGroupOptions.find(
    option => option.group.id === chosenGroupId
  );
  const activeInviteOption =
    selectedInviteOption ??
    (inviteGroupOptions.length === 1 ? inviteGroupOptions[0] : undefined);
  const activeInviteBlockedMessage = activeInviteOption
    ? portfolioInviteCapacityMessage(
        activeInviteOption.capacityState,
        activeInviteOption.visibleCount,
        activeInviteOption.maximum
      )
    : null;
  const activeInviteGuidance = activeInviteOption
    ? portfolioInviteCapacityGuidance(
        activeInviteOption.capacityState,
        activeInviteOption.visibleCount,
        activeInviteOption.maximum
      )
    : null;

  async function invite(profile: CoursemateProfile) {
    if (!userId || !snapshot || busy) return;
    const context = { ...actionContext.current };
    const generation = requestGeneration.current;
    const isCurrent = () =>
      mountedRef.current &&
      requestGeneration.current === generation &&
      actionContext.current.userId === context.userId &&
      actionContext.current.courseId === context.courseId &&
      actionContext.current.profileId === context.profileId &&
      actionContext.current.authGeneration === context.authGeneration &&
      actionContext.current.status === context.status;
    setBusy(true);
    setInviteFeedback(null);
    try {
      if (snapshot.inviteGroups.length === 0) {
        setCreatingGroup(true);
        setBusy(false);
        return;
      } else {
        const selectedGroupId =
          snapshot.inviteGroups.length === 1
            ? snapshot.inviteGroups[0].id
            : chosenGroupId;
        if (!selectedGroupId) {
          setInviteFeedback({
            tone: "error",
            message: "Choose one of your groups before sending the invitation.",
          });
          return;
        }
        if (activeInviteBlockedMessage) {
          setInviteFeedback({
            tone: "error",
            message: activeInviteBlockedMessage,
          });
          return;
        }
        await sendGroupInvitation(
          userId,
          selectedGroupId,
          profile.profileId,
          isCurrent
        );
        if (!isCurrent()) return;
      }
      setSnapshot(previous =>
        previous
          ? {
              ...previous,
              invitationState: "sent",
              canInvite: false,
            }
          : previous
      );
      setInviteFeedback({
        tone: "success",
        message:
          "Invitation sent. It stays pending until your coursemate responds.",
      });
    } catch (inviteError) {
      setInviteFeedback({
        tone: "error",
        message: getGroupWorkflowErrorMessage(inviteError),
      });
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function createGroupAndInviteFromProfile(
    name: string,
    maxMembers: number
  ) {
    if (!userId || !snapshot || busy) return;
    const context = { ...actionContext.current };
    const generation = requestGeneration.current;
    const isCurrent = () =>
      mountedRef.current &&
      requestGeneration.current === generation &&
      actionContext.current.userId === context.userId &&
      actionContext.current.courseId === context.courseId &&
      actionContext.current.profileId === context.profileId &&
      actionContext.current.authGeneration === context.authGeneration &&
      actionContext.current.status === context.status;
    const validation = validateGroupMaximum(String(maxMembers), 1);
    const maximum = validation.value;
    if (maximum === null) {
      setCreationError(validation.error ?? "Enter a maximum from 2 to 19.");
      return;
    }
    setBusy(true);
    setCreationError("");
    try {
      await createGroupAndInvite(
        userId,
        courseId,
        profileId,
        name,
        maximum,
        isCurrent
      );
      if (!isCurrent()) return;
      setCreatingGroup(false);
      setSnapshot(previous =>
        previous
          ? { ...previous, invitationState: "sent", canInvite: false }
          : previous
      );
      setInviteFeedback({
        tone: "success",
        message:
          "Invitation sent. It stays pending until your coursemate responds.",
      });
    } catch (error) {
      if (!isCurrent()) return;
      setCreationError(getGroupWorkflowErrorMessage(error));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  if (session.status === "loading") {
    return (
      <ProfileShell>
        <Stage6Status
          kind="loading"
          title="Loading portfolio…"
          message="CityLink is restoring your sign-in and checking the current-term course."
        />
      </ProfileShell>
    );
  }

  if (session.status === "error") {
    return (
      <ProfileShell>
        <Stage6Status
          kind="error"
          title="Your sign-in is unavailable"
          message="We could not restore your account session. Return to the sign-in page and try again."
          retry={() => setReloadToken(value => value + 1)}
        />
      </ProfileShell>
    );
  }

  if (!userId) {
    return (
      <ProfileShell>
        <Stage6Status
          kind="unauthorized"
          title="Sign in to view this portfolio"
          message="Coursemate profiles are available only through an authenticated current-term course."
        />
      </ProfileShell>
    );
  }

  if (loading) {
    return (
      <ProfileShell>
        <Stage6Status
          kind="loading"
          title="Loading profile…"
          message="CityLink is checking that you share this current-term course."
        />
      </ProfileShell>
    );
  }

  if (!snapshot) {
    return (
      <ProfileShell>
        <Link
          className="back-link"
          href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
        >
          <ArrowLeft size={17} /> Back to classmates
        </Link>
        <Stage6Status
          kind="error"
          title="Portfolio unavailable"
          message={error}
          retry={() => setReloadToken(value => value + 1)}
        />
      </ProfileShell>
    );
  }

  const { profile, course, inviteGroups, invitationState, canInvite } =
    snapshot;
  const person = firstName(profile.displayName);
  const initials = getProfileInitials(profile.displayName);
  const inviteLabel = inviteGroups.length
    ? "Invite to Group"
    : "Create group & invite";

  return (
    <ProfileShell>
      <Link
        className="back-link"
        href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
      >
        <ArrowLeft size={17} /> Back to {course.code} classmates
      </Link>

      <div className="profile-layout coursemate-portfolio">
        <div className="profile-main">
          <section className="profile-header-card">
            <div className="profile-cover">
              <span className="cover-circle" />
              <span className="cover-circle cover-circle-two" />
              <span className="profile-cover-label">
                A CLASSMATE. A POSSIBLE TEAMMATE.
              </span>
            </div>
            <div className="profile-header-body">
              <span
                className="avatar peach large"
                aria-label={profile.displayName}
              >
                {initials}
              </span>
              <div className="profile-name-row">
                <div>
                  <h1>{profile.displayName}</h1>
                  <p>Current-term coursemate</p>
                </div>
                <span className="status">
                  <span /> Shared course
                </span>
              </div>
              <div className="academic-facts">
                <span>
                  <GraduationCap size={18} />
                  {profile.major || "Major not set"}
                </span>
                <span>
                  <BookOpen size={17} />
                  Year {profile.year}
                </span>
              </div>
            </div>
          </section>

          <section className="profile-section">
            <p className="eyebrow">THE PERSON BEHIND THE PROFILE</p>
            <h2>A little about {person}</h2>
            <p className="bio-text">
              {profile.bio || "This coursemate has not added a bio yet."}
            </p>
          </section>

          <section className="profile-section">
            <h2>What I bring to a team</h2>
            <p className="section-description">
              Different strengths make a stronger group.
            </p>
            {profile.skills.length ? (
              <div className="skill-tags large-tags">
                {profile.skills.map((skill, index) => (
                  <span key={`${skill}-${index}`}>{skill}</span>
                ))}
              </div>
            ) : (
              <p className="section-description">No skills added yet.</p>
            )}
          </section>

          <section className="profile-section">
            <div className="section-title">
              <h2>
                Courses this semester <span className="count-pill">1</span>
              </h2>
            </div>
            <div className="studied-course-list">
              <Link href={`/my-courses/${encodeURIComponent(courseId)}/groups`}>
                <CourseIcon course={course} size={19} />
                <div>
                  <strong>{course.title}</strong>
                  <small>{course.code}</small>
                </div>
                <span className="shared-badge">In common</span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className="section-description portfolio-course-note">
              Only courses you share with this coursemate are shown here.
            </p>
          </section>

          <div className="portfolio-privacy-note">
            <ShieldCheck size={16} />
            <span>
              Only approved shared-course fields are shown. Email, student ID,
              account status and private records are not included.
            </span>
          </div>
        </div>

        <aside className="profile-invite-panel">
          <span className="invite-panel-icon">
            <Users size={26} />
          </span>
          <h2>
            Good work starts
            <br />
            with a hello.
          </h2>
          <p>Invite {person} to work with you on your next group project.</p>
          <div className="invite-course-context">
            <CourseIcon course={course} size={19} />
            <div>
              <small>INVITING FOR</small>
              <strong>{course.code}</strong>
              <p>{course.title}</p>
            </div>
          </div>

          {inviteFeedback && (
            <p
              className={`portfolio-invite-feedback ${inviteFeedback.tone}`}
              role={inviteFeedback.tone === "error" ? "alert" : "status"}
            >
              {inviteFeedback.message}
            </p>
          )}

          <div className="profile-message-row">
            <MessageButton otherProfileId={profile.profileId} />
          </div>

          {invitationState === "sent" ? (
            <Link href="/invitations" className="invite-status">
              <Clock3 size={16} />
              <span>Invitation sent</span>
            </Link>
          ) : invitationState === "received" ? (
            <Link href="/invitations" className="invite-status">
              <Clock3 size={16} />
              <span>Invitation received</span>
            </Link>
          ) : invitationState === "connected" ? (
            <button type="button" className="invite-disabled" disabled>
              Previously connected
            </button>
          ) : canInvite ? (
            inviteGroups.length > 1 ? (
              <div className="portfolio-invite-choice">
                <label htmlFor={`portfolio-group-${profile.profileId}`}>
                  Choose your group
                </label>
                <select
                  id={`portfolio-group-${profile.profileId}`}
                  value={chosenGroupId}
                  onChange={event => setChosenGroupId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Select a group</option>
                  {inviteGroupOptions.map(option => {
                    const blockedMessage = portfolioInviteCapacityMessage(
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
                  <p className="portfolio-capacity-hint" role="status">
                    {activeInviteBlockedMessage}
                  </p>
                )}
                {activeInviteGuidance && (
                  <p className="portfolio-capacity-hint" role="note">
                    {activeInviteGuidance}
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={
                    !chosenGroupId ||
                    busy ||
                    Boolean(activeInviteBlockedMessage)
                  }
                  onClick={() => void invite(profile)}
                >
                  <Send size={17} />
                  {busy ? "Sending…" : "Send invite"}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || Boolean(activeInviteBlockedMessage)}
                  onClick={() => void invite(profile)}
                >
                  <Send size={17} />
                  {busy ? "Sending…" : inviteLabel}
                </button>
                {activeInviteBlockedMessage && (
                  <p className="portfolio-capacity-hint" role="status">
                    {activeInviteBlockedMessage}
                  </p>
                )}
                {activeInviteGuidance && (
                  <p className="portfolio-capacity-hint" role="note">
                    {activeInviteGuidance}
                  </p>
                )}
              </>
            )
          ) : (
            <button
              type="button"
              className="invite-disabled"
              disabled
              title={
                snapshot.inviteError ||
                "This coursemate is not currently eligible for a new invitation."
              }
            >
              Invite unavailable
            </button>
          )}

          <p className="invite-disclaimer">
            Invitations use the existing CityLink group service. The server
            checks eligibility again when you send.
          </p>
          <div className="shared-info">
            <BookOpen size={18} />
            <span>
              You share <strong>this course</strong> this semester.
            </span>
          </div>
        </aside>
      </div>
      {creatingGroup && (
        <CreatePeopleGroupInviteDialog
          peerName={profile.displayName}
          busy={busy}
          serverError={creationError}
          onCancel={() => {
            if (busy) return;
            setCreatingGroup(false);
            setCreationError("");
          }}
          onSubmit={(name, maxMembers) =>
            void createGroupAndInviteFromProfile(name, maxMembers)
          }
          onCloseAutoFocus={event => event.preventDefault()}
        />
      )}
    </ProfileShell>
  );
}
