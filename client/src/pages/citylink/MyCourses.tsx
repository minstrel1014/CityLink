import { useEffect, useMemo, useRef, useState } from "react";
import "./MyCourses.css";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import {
  CourseIcon,
  EmptyState,
  PageHeading,
} from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  listCourseGroupPeers,
  type GroupCoursePeer,
} from "@/lib/supabaseGroups";
import {
  courseDetailPath,
  currentTermCourses,
  initialCourseScope,
} from "@/lib/workspaceRouteRules";
import {
  addOwnCourseEnrolment,
  COURSE_ENROLMENT_WRITES_ENABLED,
  COURSE_ENROLMENT_EMPTY_MESSAGE,
  filterCourseDirectory,
  getCourseDirectoryErrorMessage,
  loadCurrentTermCourseEnrollmentCounts,
  loadCourseDirectory,
  removeOwnCourseEnrolment,
  type CourseDirectoryScope,
  type CourseDirectorySnapshot,
} from "@/lib/supabaseCourses";

type LoadState = "idle" | "loading" | "ready" | "error";
type Banner = { tone: "success" | "error" | "info"; message: string };
type MyCoursesView = "dashboard" | "directory";
type CoursePeerSnapshot = {
  userId: string;
  peersByCourse: Map<string, GroupCoursePeer[] | null>;
};

export function AccountHeader({ email }: { email?: string }) {
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
        <Link href="/my-courses">My Courses</Link>
        <Link href="/my-groups">My groups</Link>
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

export default function MyCourses({
  view = "directory",
  embedded = false,
}: {
  view?: MyCoursesView;
  embedded?: boolean;
}) {
  const session = useSupabaseSession();
  const userId = session.user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [snapshot, setSnapshot] = useState<
    (CourseDirectorySnapshot & { userId: string }) | null
  >(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [enrollmentCounts, setEnrollmentCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [countsLoading, setCountsLoading] = useState(false);
  const [countsError, setCountsError] = useState("");
  const [notice, setNotice] = useState<Banner | null>(null);
  const [scope, setScope] = useState<CourseDirectoryScope>(
    initialCourseScope(view)
  );
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState("");
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [coursePeerSnapshot, setCoursePeerSnapshot] =
    useState<CoursePeerSnapshot | null>(null);
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
      setEnrollmentCounts(new Map());
      setCountsLoading(false);
      setCountsError("");
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
    setEnrollmentCounts(new Map());
    setCountsLoading(true);
    setCountsError("");
    setNotice(null);
    setBusyCourseId(null);

    void Promise.allSettled([
      loadCourseDirectory(userId),
      loadCurrentTermCourseEnrollmentCounts(userId),
    ]).then(([directoryResult, countResult]) => {
      if (!isCurrent()) return;
      if (directoryResult.status === "fulfilled") {
        setSnapshot({ ...directoryResult.value, userId });
        setLoadState("ready");
      } else {
        setLoadError(
          getCourseDirectoryErrorMessage(directoryResult.reason, "read")
        );
        setLoadState("error");
      }
      if (countResult.status === "fulfilled") {
        setEnrollmentCounts(countResult.value);
        setCountsError("");
      } else {
        setEnrollmentCounts(new Map());
        setCountsError(
          "The current term could not be verified. The course list is hidden until verification succeeds."
        );
      }
      setCountsLoading(false);
    });

    return () => {
      active = false;
      if (requestGeneration.current === generation) {
        requestGeneration.current += 1;
      }
    };
  }, [retryToken, session.status, userId]);

  const ownSnapshot = snapshot?.userId === userId ? snapshot : null;
  const courses = useMemo(
    () => currentTermCourses(ownSnapshot?.courses ?? [], enrollmentCounts),
    [ownSnapshot, enrollmentCounts]
  );
  useEffect(() => {
    if (
      view !== "dashboard" ||
      session.status !== "ready" ||
      !userId ||
      !ownSnapshot
    ) {
      setCoursePeerSnapshot(null);
      return;
    }

    let active = true;
    const enrolledCourseIds = ownSnapshot.enrolledCourseIds.filter(id =>
      enrollmentCounts.has(id)
    );
    setCoursePeerSnapshot({ userId, peersByCourse: new Map() });
    void Promise.all(
      enrolledCourseIds.map(async courseId => {
        try {
          const peers = await listCourseGroupPeers(userId, courseId);
          return [courseId, peers] as const;
        } catch {
          return [courseId, null] as const;
        }
      })
    ).then(results => {
      if (!active) return;
      setCoursePeerSnapshot({ userId, peersByCourse: new Map(results) });
    });

    return () => {
      active = false;
    };
  }, [view, session.status, userId, ownSnapshot, enrollmentCounts]);

  const enrolledIds = useMemo(
    () =>
      new Set(
        (ownSnapshot?.enrolledCourseIds ?? []).filter(id =>
          enrollmentCounts.has(id)
        )
      ),
    [ownSnapshot, enrollmentCounts]
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
      try {
        const refreshedCounts =
          await loadCurrentTermCourseEnrollmentCounts(expectedUserId);
        if (!isCurrent()) return;
        setEnrollmentCounts(refreshedCounts);
        setCountsError("");
      } catch {
        if (!isCurrent()) return;
        setEnrollmentCounts(new Map());
        setCountsError(
          "The course change was saved, but the current term could not be verified. The course list is hidden until verification succeeds."
        );
      }
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
    <div
      className={`authenticated-courses-page${embedded ? " authenticated-courses-embedded" : ""}`}
    >
      {!embedded && <AccountHeader email={session.user?.email} />}
      <main
        className={`authenticated-courses-main${embedded ? " authenticated-courses-main-embedded" : ""}`}
      >
        <PageHeading
          eyebrow="YOUR COURSE MAP · SUPABASE DATA"
          title={view === "dashboard" ? "Your courses" : "Courses"}
          description={
            view === "dashboard"
              ? "See the courses connected to your account and find classmates looking for a group."
              : "Browse all current-term courses and manage your own enrolments."
          }
        >
          {view === "dashboard" && (
            <Link className="secondary dashboard-groups-link" href="/my-groups">
              My groups <ArrowRight size={16} />
            </Link>
          )}
        </PageHeading>

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
              className={scope === "mine" ? "active" : ""}
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              My courses <span>{enrolledIds.size}</span>
            </button>
            <button
              type="button"
              className={scope === "catalogue" ? "active" : ""}
              aria-pressed={scope === "catalogue"}
              onClick={() => setScope("catalogue")}
            >
              All courses <span>{courses.length}</span>
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
        {countsError && (
          <div className="course-directory-feedback info" role="alert">
            <p>{countsError}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => setRetryToken(value => value + 1)}
            >
              <RefreshCw size={16} /> Try again
            </button>
          </div>
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
        {loadState === "ready" && !countsError && courses.length === 0 && (
          <EmptyState
            title="No current-term courses found"
            description="No accessible current-term course rows were returned. This page does not create courses."
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
              return (
                <article className="authenticated-course-card" key={course.id}>
                  <Link
                    className="authenticated-course-name-link"
                    href={courseDetailPath(course.id)}
                    aria-label={`View course details for ${course.code}: ${course.title}`}
                  >
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
                  </Link>
                  <p className="authenticated-course-department">
                    {course.department} · {course.credits} credits
                  </p>
                  <p className="authenticated-course-description">
                    {course.description ||
                      "No course description is available."}
                  </p>
                  {view === "dashboard" && enrolled && (
                    <CoursePeerSignals
                      peers={
                        coursePeerSnapshot?.userId === userId
                          ? coursePeerSnapshot.peersByCourse.get(course.id)
                          : undefined
                      }
                    />
                  )}
                  <p
                    className="authenticated-course-enrollment-count"
                    aria-label={
                      countsLoading
                        ? "Loading current-term enrollment count"
                        : countsError
                          ? "Current-term enrollment count unavailable"
                          : enrollmentCounts.has(course.id)
                            ? `${enrollmentCounts.get(course.id)} students enrolled`
                            : "Course is not in the current term"
                    }
                  >
                    {countsLoading
                      ? "Loading enrollment count…"
                      : countsError
                        ? "Enrollment count unavailable"
                        : enrollmentCounts.has(course.id)
                          ? `${enrollmentCounts.get(course.id)} ${enrollmentCounts.get(course.id) === 1 ? "student" : "students"} enrolled`
                          : "Not in the current term"}
                  </p>
                  <div className="authenticated-course-card-footer">
                    <span>{course.semester}</span>
                    <div className="authenticated-course-card-actions">
                      <Link
                        className="course-detail-link"
                        href={courseDetailPath(course.id)}
                      >
                        My group
                      </Link>
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
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      {!embedded && (
        <footer className="authenticated-courses-footer">
          Authenticated course data · separate from fictional CityLink demo
        </footer>
      )}
    </div>
  );
}

function CoursePeerSignals({
  peers,
}: {
  peers: GroupCoursePeer[] | null | undefined;
}) {
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toLocaleUpperCase() ?? "")
      .join("") || "?";
  return (
    <div className="authenticated-course-signal-row">
      <div
        className="authenticated-course-peer-avatars"
        role="group"
        aria-label={
          peers ? `${peers.length} enrolled coursemates` : "Coursemate preview"
        }
      >
        {peers?.slice(0, 3).map(peer => (
          <span
            className="authenticated-course-peer-avatar"
            key={peer.profile_id}
            title={peer.display_name}
            aria-label={peer.display_name}
          >
            {initials(peer.display_name)}
          </span>
        ))}
        {peers && peers.length > 3 && (
          <span className="authenticated-course-peer-avatar extra">
            +{peers.length - 3}
          </span>
        )}
      </div>
      <span className="authenticated-course-looking-count">
        {peers === undefined
          ? "Loading classmates…"
          : peers === null
            ? "Classmates unavailable"
            : `${peers.filter(peer => peer.status === "open").length} looking`}
      </span>
    </div>
  );
}
