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
  listCourseGroupInviteCandidates,
  loadGroupWorkflowSnapshot,
  sendGroupInvitation,
  type StudyGroupRow,
} from "@/lib/supabaseGroups";
import {
  getCurrentTermCoursemateProfile,
  getStage6ErrorMessage,
  type CoursemateProfile,
} from "@/lib/supabaseStage6";
import { getProfileInitials } from "@/lib/supabaseProfile";
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

export default function CoursemateProfilePage({
  courseId,
  profileId,
}: {
  courseId: string;
  profileId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<InviteFeedback | null>(
    null
  );
  const requestGeneration = useRef(0);

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
  }, [courseId, profileId, reloadToken, session.status, userId]);

  async function invite(profile: CoursemateProfile) {
    if (!userId || !snapshot || busy) return;
    setBusy(true);
    setInviteFeedback(null);
    try {
      if (snapshot.inviteGroups.length === 0) {
        const groupName = window
          .prompt("Name your new group (1-50 characters):", "Study group")
          ?.trim();
        if (!groupName) return;
        if (groupName.length > 50) {
          setInviteFeedback({
            tone: "error",
            message: "Group names must be 1–50 characters.",
          });
          return;
        }
        await createGroupAndInvite(
          userId,
          courseId,
          profile.profileId,
          groupName
        );
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
        await sendGroupInvitation(userId, selectedGroupId, profile.profileId);
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
      setBusy(false);
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

          {invitationState === "sent" ? (
            <Link href="/my-groups" className="invite-status">
              <Clock3 size={16} />
              <span>Invitation sent</span>
            </Link>
          ) : invitationState === "received" ? (
            <Link href="/my-groups" className="invite-status">
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
                  {inviteGroups.map(group => (
                    <option value={group.id} key={group.id}>
                      {group.name || "Study group"} · {group.status}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary"
                  disabled={!chosenGroupId || busy}
                  onClick={() => void invite(profile)}
                >
                  <Send size={17} />
                  {busy ? "Sending…" : "Send invite"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void invite(profile)}
              >
                <Send size={17} />
                {busy ? "Sending…" : inviteLabel}
              </button>
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
    </ProfileShell>
  );
}
