import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, RefreshCw, UserRound } from "lucide-react";
import { Link } from "wouter";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
} from "@/lib/supabaseCourses";
import {
  getGroupWorkflowErrorMessage,
  listCourseGroupPeers,
  type GroupCoursePeer,
} from "@/lib/supabaseGroups";
import { supabaseClient } from "@/lib/supabaseClient";
import { CourseIcon, EmptyState, Status } from "@/components/citylink/Shared";
import "./CourseDetail.css";

type PortfolioData = {
  userId: string;
  course: Awaited<ReturnType<typeof loadCourseDirectory>>["courses"][number];
  enrolled: boolean;
  peer: GroupCoursePeer | null;
};

export default function StudentPortfolio({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    const isCurrent = () =>
      active &&
      generation.current === currentGeneration &&
      userIdRef.current === userId;

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
    void loadCourseDirectory(userId)
      .then(async directory => {
        if (!isCurrent()) return;
        const course = directory.courses.find(item => item.id === courseId);
        if (!course) {
          setData(null);
          setLoading(false);
          setError("This course is not in the authenticated Test catalogue.");
          return;
        }
        if (!directory.enrolledCourseIds.includes(courseId)) {
          setData({ userId, course, enrolled: false, peer: null });
          setLoading(false);
          return;
        }
        const peers = await listCourseGroupPeers(userId, courseId);
        if (!isCurrent()) return;
        const peer = peers.find(item => item.profile_id === studentId) ?? null;
        setData({ userId, course, enrolled: true, peer });
        setLoading(false);
      })
      .catch(reason => {
        if (!isCurrent()) return;
        setData(null);
        const courseMessage = getCourseDirectoryErrorMessage(reason, "read");
        setError(
          courseMessage !==
            "CityLink could not load the Supabase course catalogue. Check your connection and try again."
            ? courseMessage
            : getGroupWorkflowErrorMessage(reason)
        );
        setLoading(false);
      });

    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [courseId, retryToken, session.status, studentId, userId]);

  if (session.status === "loading") {
    return (
      <PortfolioGate
        title="Checking your sign-in…"
        message="CityLink is restoring your account session."
      />
    );
  }
  if (session.status === "error") {
    return (
      <PortfolioGate
        title="Your sign-in is unavailable"
        message="We could not restore your account session. Return to the sign-in page and try again."
      />
    );
  }
  if (!userId) {
    return (
      <PortfolioGate
        title="Sign in to view a student portfolio"
        message="Portfolio details are visible only through the authenticated coursemate roster."
      />
    );
  }
  if (!supabaseClient) {
    return (
      <PortfolioGate
        email={session.user?.email}
        title="Supabase is not configured"
        message="This page does not fall back to fictional profile data."
      />
    );
  }

  const ownData = data?.userId === userId ? data : null;
  return (
    <div className="authenticated-courses-page course-detail-page student-portfolio-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <Link href={`/courses/${courseId}/classmates`} className="back-link">
          <ArrowLeft size={17} /> Back to coursemates
        </Link>
        {loading && (
          <div className="course-directory-state" role="status">
            <span className="spinner" /> Loading the authenticated coursemate
            profile…
          </div>
        )}
        {!loading && error && (
          <EmptyState
            title="Portfolio data could not be loaded"
            description={error}
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
        {!loading && !error && ownData && !ownData.peer && (
          <EmptyState
            title={
              ownData.enrolled
                ? "Student portfolio unavailable"
                : "Course enrollment required"
            }
            description={
              ownData.enrolled
                ? "This account is not present in the current coursemate roster visible to your signed-in account. The page does not fall back to a fictional profile."
                : "Add this course to My Courses before opening a coursemate portfolio. The page does not fall back to a fictional profile."
            }
          >
            <Link
              href={`/courses/${courseId}/classmates`}
              className="secondary"
            >
              Return to coursemates
            </Link>
          </EmptyState>
        )}
        {!loading && !error && ownData?.peer && (
          <>
            <div className="course-page-heading">
              <CourseIcon course={ownData.course} size={28} />
              <div>
                <p className="eyebrow">
                  {ownData.course.code} · STUDENT PORTFOLIO
                </p>
                <h1>{ownData.peer.display_name}</h1>
                <p>{ownData.course.title}</p>
              </div>
            </div>
            <article className="student-portfolio-card">
              <div className="student-portfolio-top">
                <span className="student-portfolio-avatar" aria-hidden="true">
                  {ownData.peer.display_name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map(part => part[0]?.toLocaleUpperCase() ?? "")
                    .join("") || "?"}
                </span>
                <div>
                  <h2>{ownData.peer.display_name}</h2>
                  <p>
                    {ownData.peer.major || "Major not provided"} · Year{" "}
                    {ownData.peer.year}
                  </p>
                  <Status status={ownData.peer.status} />
                </div>
              </div>
              <dl className="student-portfolio-details">
                <div>
                  <dt>Student ID</dt>
                  <dd>{ownData.peer.student_id || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Course</dt>
                  <dd>
                    {ownData.course.code} · {ownData.course.title}
                  </dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>
                    {ownData.peer.status === "open"
                      ? "Looking for a group"
                      : ownData.peer.status === "considering"
                        ? "Open to invitations"
                        : "Group formed"}
                  </dd>
                </div>
              </dl>
              <section>
                <h3>About</h3>
                <p>{ownData.peer.bio || "No biography has been provided."}</p>
              </section>
              <section>
                <h3>Skills</h3>
                {ownData.peer.skills.length ? (
                  <div className="skill-tags">
                    {ownData.peer.skills.map(skill => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                ) : (
                  <p>No skills have been listed.</p>
                )}
              </section>
            </article>
            <p className="data-footnote">
              Only fields returned by the authenticated Test coursemate RPC are
              shown. No portfolio artifacts or private group workflow details
              are exposed here.
            </p>
          </>
        )}
      </main>
      <footer className="authenticated-courses-footer">
        Authenticated coursemate profile · Supabase Test
      </footer>
    </div>
  );
}

function PortfolioGate({
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
            <UserRound size={27} />
          </span>
          <p className="eyebrow">
            <BookOpen size={14} /> COURSE PORTFOLIO
          </p>
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
