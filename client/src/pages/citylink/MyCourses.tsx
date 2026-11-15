import { useEffect, useMemo, useRef, useState } from "react";
import "./MyCourses.css";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import {
  CourseIcon,
  EmptyState,
  PageHeading,
} from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { supabaseClient } from "@/lib/supabaseClient";
import { getFictionalCourseClassmates } from "@/data/fictionalCourseClassmates";
import {
  addOwnCourseEnrolment,
  COURSE_ENROLMENT_WRITES_ENABLED,
  COURSE_ENROLMENT_EMPTY_MESSAGE,
  filterCourseDirectory,
  getCourseDirectoryErrorMessage,
  loadCourseDirectory,
  removeOwnCourseEnrolment,
  type CourseDirectoryScope,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";

type LoadState = "idle" | "loading" | "ready" | "error";
type Banner = { tone: "success" | "error" | "info"; message: string };

function AccountHeader({ email }: { email?: string }) {
  return (
    <header className="authenticated-courses-header">
      <Link href="/" className="authenticated-courses-brand">
        city<span>link</span>.
      </Link>
      <div className="authenticated-courses-account">
        <span className="account-indicator" />
        <span>{email || "Supabase account"}</span>
      </div>
      <nav aria-label="Account navigation">
        <Link href="/me">My profile</Link>
        <Link href="/demo">Fictional demo</Link>
      </nav>
    </header>
  );
}

function GateScreen({
  title,
  message,
  email,
}: {
  title: string;
  message: string;
  email?: string;
}) {
  return (
    <div className="authenticated-courses-page">
      <AccountHeader email={email} />
      <main className="authenticated-courses-main">
        <section className="authenticated-courses-state" role="status">
          <span className="authenticated-courses-state-icon">
            <BookOpen size={27} />
          </span>
          <p className="eyebrow">YOUR COURSE MAP</p>
          <h1>{title}</h1>
          <p>{message}</p>
          <div className="authenticated-courses-state-actions">
            <Link href="/" className="primary">
              <ArrowLeft size={17} /> Sign-in page
            </Link>
            <Link href="/demo" className="secondary">
              Open fictional demo
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function MyCourses() {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [snapshot, setSnapshot] = useState<
    (CourseDirectorySnapshot & { userId: string }) | null
  >(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Banner | null>(null);
  const [scope, setScope] = useState<CourseDirectoryScope>("catalogue");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState("");
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
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
      setSnapshot(null);
      setLoadState("idle");
      setLoadError("");
      setBusyCourseId(null);
      return () => {
        active = false;
        if (requestGeneration.current === generation) {
          requestGeneration.current += 1;
        }
      };
    }

    setLoadState("loading");
    setLoadError("");
    setNotice(null);
    setBusyCourseId(null);

    void loadCourseDirectory(userId)
      .then(result => {
        if (!isCurrent()) return;
        setSnapshot({ ...result, userId });
        setLoadState("ready");
      })
      .catch(error => {
        if (!isCurrent()) return;
        setLoadError(getCourseDirectoryErrorMessage(error, "read"));
        setLoadState("error");
      });

    return () => {
      active = false;
      if (requestGeneration.current === generation) {
        requestGeneration.current += 1;
      }
    };
  }, [retryToken, session.status, userId]);

  const ownSnapshot = snapshot?.userId === userId ? snapshot : null;
  const courses = ownSnapshot?.courses ?? [];
  const enrolledIds = useMemo(
    () => new Set(ownSnapshot?.enrolledCourseIds ?? []),
    [ownSnapshot]
  );
  const departments = useMemo(
    () => [...new Set(courses.map(course => course.department))].sort(),
    [courses]
  );
  const semesters = useMemo(
    () => [...new Set(courses.map(course => course.semester))].sort(),
    [courses]
  );
  const filteredCourses = useMemo(
    () =>
      filterCourseDirectory(courses, enrolledIds, {
        scope,
        query,
        department,
        semester,
      }),
    [courses, enrolledIds, scope, query, department, semester]
  );

  async function changeEnrolment(courseId: string) {
    if (!COURSE_ENROLMENT_WRITES_ENABLED || !userId || busyCourseId !== null) {
      return;
    }

    const expectedUserId = userId;
    const expectedGeneration = requestGeneration.current;
    const isCurrent = () =>
      requestGeneration.current === expectedGeneration &&
      userIdRef.current === expectedUserId;
    const wasEnrolled = enrolledIds.has(courseId);

    setBusyCourseId(courseId);
    setNotice(null);
    try {
      if (wasEnrolled) {
        await removeOwnCourseEnrolment(expectedUserId, courseId);
      } else {
        await addOwnCourseEnrolment(expectedUserId, courseId);
      }
      if (!isCurrent()) return;

      const refreshed = await loadCourseDirectory(expectedUserId);
      if (!isCurrent()) return;
      setSnapshot({ ...refreshed, userId: expectedUserId });
      setNotice({
        tone: "success",
        message: wasEnrolled
          ? "Course removed from your enrolments."
          : "Course added to your enrolments.",
      });
    } catch (error) {
      if (!isCurrent()) return;
      setNotice({
        tone: "error",
        message: getCourseDirectoryErrorMessage(error, "write"),
      });
    } finally {
      if (isCurrent()) setBusyCourseId(null);
    }
  }

  if (session.status === "loading") {
    return (
      <GateScreen
        title="Checking your sign-in…"
        message="CityLink is restoring your Supabase Auth session before loading courses."
      />
    );
  }
  if (session.status === "error") {
    return (
      <GateScreen
        title="Your sign-in is unavailable"
        message="We could not restore your account session. Please return to the sign-in page and try again."
      />
    );
  }
  if (!userId) {
    return (
      <GateScreen
        title="Sign in to view My Courses"
        message="The authenticated course catalogue is separate from CityLink’s fictional demo. Sign in with a Supabase Auth account to view its course data."
      />
    );
  }
  if (!supabaseClient) {
    return (
      <GateScreen
        email={session.user?.email}
        title="Course data is unavailable"
        message="Supabase is not configured in this environment. You can still explore the separate fictional demo."
      />
    );
  }

  return (
    <div className="authenticated-courses-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <PageHeading
          eyebrow="YOUR COURSE MAP · SUPABASE DATA"
          title="My Courses"
          description="Browse the course catalogue and see the courses attached to this signed-in account."
        />

        <div className="course-privacy-notice" role="note">
          <ShieldCheck size={19} />
          <p>
            Self-enrolment does not verify actual university registration. Under
            the current schema, people who share a course may discover one
            another’s profiles. This is intentional for the prototype’s
            group-finding feature, not strict profile privacy.
          </p>
        </div>

        {!COURSE_ENROLMENT_WRITES_ENABLED && (
          <div
            className="course-write-gate"
            id="course-write-gate"
            role="status"
          >
            <strong>Enrolment changes are paused.</strong> The catalogue and
            your own enrolments are read-only until the separate insert/delete
            permissions receive review and approval. No course changes are
            submitted from this page yet.
          </div>
        )}

        <div className="course-directory-toolbar">
          <div
            className="course-directory-tabs"
            role="group"
            aria-label="Course view"
          >
            <button
              type="button"
              className={scope === "catalogue" ? "active" : ""}
              aria-pressed={scope === "catalogue"}
              onClick={() => setScope("catalogue")}
            >
              Course catalogue <span>{courses.length}</span>
            </button>
            <button
              type="button"
              className={scope === "mine" ? "active" : ""}
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              My courses <span>{enrolledIds.size}</span>
            </button>
          </div>
          <div className="course-directory-filters">
            <label className="course-directory-search">
              <Search size={17} />
              <span className="sr-only">Search courses</span>
              <input
                type="search"
                placeholder="Search by course or department"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </label>
            <label className="course-directory-select">
              <span className="sr-only">Filter by department</span>
              <select
                value={department}
                onChange={event => setDepartment(event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="course-directory-select">
              <span className="sr-only">Filter by semester</span>
              <select
                value={semester}
                onChange={event => setSemester(event.target.value)}
              >
                <option value="">All semesters</option>
                {semesters.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {notice && (
          <p
            className={`course-directory-feedback ${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.message}
          </p>
        )}

        {loadState === "loading" && (
          <div className="course-directory-state" role="status">
            <span className="spinner" />
            <p>Loading your Supabase course catalogue…</p>
          </div>
        )}
        {loadState === "error" && (
          <EmptyState
            title="Your course catalogue could not be loaded"
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
        {loadState === "ready" && courses.length === 0 && (
          <EmptyState
            title="The Supabase catalogue is empty"
            description="No course rows were returned from public.courses. This page does not seed or create courses; an authorized project owner must populate the approved fictional course catalogue."
          />
        )}
        {loadState === "ready" &&
          courses.length > 0 &&
          filteredCourses.length === 0 && (
            <EmptyState
              title={
                scope === "mine" && enrolledIds.size === 0
                  ? "No courses in your account yet"
                  : "No courses match those filters"
              }
              description={
                scope === "mine" && enrolledIds.size === 0
                  ? COURSE_ENROLMENT_EMPTY_MESSAGE
                  : "Try another course name, department, or semester."
              }
            >
              {scope === "mine" && enrolledIds.size === 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setScope("catalogue")}
                >
                  Browse the catalogue <ArrowRight size={16} />
                </button>
              )}
            </EmptyState>
          )}
        {loadState === "ready" && filteredCourses.length > 0 && (
          <div className="authenticated-course-grid">
            {filteredCourses.map(course => {
              const enrolled = enrolledIds.has(course.id);
              const classmates = enrolled
                ? getFictionalCourseClassmates(course.code)
                : [];
              return (
                <article className="authenticated-course-card" key={course.id}>
                  <div className="authenticated-course-card-top">
                    <CourseIcon course={course} size={21} />
                    <div>
                      <span className="course-code">{course.code}</span>
                      <span
                        className={`course-membership ${enrolled ? "enrolled" : ""}`}
                      >
                        {enrolled ? "In My Courses" : "Not enrolled"}
                      </span>
                    </div>
                  </div>
                  <h2>{course.title}</h2>
                  <p className="authenticated-course-department">
                    {course.department} · {course.credits} credits
                  </p>
                  <p className="authenticated-course-description">
                    {course.description ||
                      "No course description is available."}
                  </p>
                  {enrolled && (
                    <section
                      className="course-sample-classmates"
                      aria-label={`Fictional sample classmates for ${course.code}`}
                    >
                      <div className="course-sample-classmates-heading">
                        <Users size={16} aria-hidden="true" />
                        <strong>Sample classmates</strong>
                        <span>FICTIONAL</span>
                      </div>
                      <p className="course-sample-classmates-note">
                        Examples only—not the actual student list for this
                        course.
                      </p>
                      <ul>
                        {classmates.map(classmate => (
                          <li key={classmate.id}>
                            <span
                              className={`course-sample-classmate-avatar ${classmate.color}`}
                              aria-hidden="true"
                            >
                              {classmate.avatar}
                            </span>
                            <span className="course-sample-classmate-details">
                              <strong>{classmate.name}</strong>
                              <small>
                                {classmate.major} · Year {classmate.year}
                              </small>
                            </span>
                            <span className="course-sample-classmate-skills">
                              {classmate.skills.slice(0, 2).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="authenticated-course-card-footer">
                    <span>{course.semester}</span>
                    <button
                      type="button"
                      className={`course-enrolment-action ${enrolled ? "remove" : "add"}`}
                      disabled={
                        !COURSE_ENROLMENT_WRITES_ENABLED ||
                        busyCourseId !== null
                      }
                      aria-describedby={
                        COURSE_ENROLMENT_WRITES_ENABLED
                          ? undefined
                          : "course-write-gate"
                      }
                      onClick={() => void changeEnrolment(course.id)}
                    >
                      {busyCourseId === course.id
                        ? "Saving…"
                        : enrolled
                          ? "Remove"
                          : "Add course"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <footer className="authenticated-courses-footer">
        Authenticated course data · separate from fictional CityLink demo
      </footer>
    </div>
  );
}
