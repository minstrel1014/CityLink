import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  GraduationCap,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { useCityLink } from "@/data/AppContext";
import { DEMO_USER_ID } from "@/data/sampleData";
import {
  Avatar,
  CourseCard,
  EmptyState,
  PageHeading,
  Shell,
  Status,
} from "@/components/citylink/Shared";
export function CourseDirectory({
  dashboard = false,
}: {
  dashboard?: boolean;
}) {
  const { courses, enrolments } = useCityLink();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"my" | "all">("my");
  const [department, setDepartment] = useState("all");
  const mine = new Set(
    enrolments.filter(e => e.studentId === DEMO_USER_ID).map(e => e.courseId)
  );
  const filtered = courses.filter(
    c =>
      (tab === "all" || mine.has(c.id)) &&
      (department === "all" || c.department === department) &&
      `${c.code} ${c.title}`.toLowerCase().includes(search.toLowerCase().trim())
  );
  return (
    <section className="directory-section">
      <div className="section-title">
        <div>
          <h2>
            {dashboard ? "Your courses" : "Course directory"}{" "}
            <span className="count-pill">{filtered.length}</span>
          </h2>
          <p>
            {dashboard
              ? "A familiar class. A fresh connection."
              : "Find your course, then find your people."}
          </p>
        </div>
        {dashboard && (
          <Link href="/demo/courses" className="text-link">
            View directory <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
      <div className="directory-toolbar">
        <div className="segmented-control" aria-label="Course enrolment filter">
          <button
            className={tab === "my" ? "active" : ""}
            onClick={() => setTab("my")}
          >
            My courses <span>{mine.size}</span>
          </button>
          <button
            className={tab === "all" ? "active" : ""}
            onClick={() => setTab("all")}
          >
            All courses <span>{courses.length}</span>
          </button>
        </div>
        <div className="directory-search">
          <Search size={18} />
          <input
            aria-label="Search courses by name or code"
            placeholder="Search course name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              aria-label="Clear course search"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        <div className="filter-select">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter courses by department"
            value={department}
            onChange={e => setDepartment(e.target.value)}
          >
            <option value="all">All departments</option>
            {[...new Set(courses.map(c => c.department))].map(d => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      {filtered.length ? (
        <div className="course-grid">
          {filtered.map(c => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No courses found"
          description="Try another course name or code, or change your department filter."
        >
          <button
            className="secondary"
            onClick={() => {
              setSearch("");
              setDepartment("all");
              setTab("all");
            }}
          >
            Clear filters
          </button>
        </EmptyState>
      )}
    </section>
  );
}
export default function Dashboard() {
  const { me, students, enrolments, invitations } = useCityLink();
  const mine = enrolments.filter(e => e.studentId === DEMO_USER_ID);
  const peers = new Set(
    enrolments
      .filter(
        e =>
          mine.some(m => m.courseId === e.courseId) &&
          e.studentId !== DEMO_USER_ID
      )
      .map(e => e.studentId)
  );
  const pending = invitations.filter(
    i => i.recipientId === DEMO_USER_ID && i.status === "pending"
  ).length;
  return (
    <Shell>
      <div className="greeting-row">
        <div>
          <p className="eyebrow">YOUR CAMPUS CONNECTIONS</p>
          <h1>
            Hey, {me.name.split(" ")[0]}
            <span className="greeting-dot">.</span>{" "}
            <span className="greeting-subtitle">Let’s find your people.</span>
          </h1>
          <p>A good team makes all the difference.</p>
        </div>
        <div className="semester">
          <CalendarDays size={17} />
          <span>
            Semester A <b>2026 / 27</b>
          </span>
        </div>
      </div>
      <div className="dashboard-upper">
        <div className="hero-and-stats">
          <section className="dashboard-hero">
            <div className="hero-copy">
              <span className="hero-kicker">
                <Sparkles size={15} /> SAME COURSE. SHARED POSSIBILITIES.
              </span>
              <h2>
                Your next great team
                <br />
                starts <em>here.</em>
              </h2>
              <p>
                A designer, a problem-solver, a big-picture thinker.
                <br />
                There’s a classmate for every strength.
              </p>
              <Link href="/demo/courses/is3100" className="primary">
                Find a groupmate <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="hero-connections" aria-hidden="true">
              <div className="hero-ring" />
              <div className="hero-ring ring-small" />
              <Avatar
                student={students[1]}
                size="large"
                className="hero-avatar ha-one"
              />
              <Avatar
                student={students[2]}
                size="large"
                className="hero-avatar ha-two"
              />
              <Avatar
                student={students[3]}
                size="large"
                className="hero-avatar ha-three"
              />
              <span className="hero-center">
                <Users size={28} />
              </span>
              <span className="hero-tag">
                <i /> A great match starts here
              </span>
              <span className="hero-plus">+</span>
            </div>
          </section>
          <div className="stats-row">
            <div>
              <span className="stat-icon sage">
                <BookOpen size={20} />
              </span>
              <span>
                <strong>
                  {mine.length}
                  <small>Courses this semester</small>
                </strong>
              </span>
            </div>
            <div>
              <span className="stat-icon peach">
                <Users size={20} />
              </span>
              <span>
                <strong>
                  {peers.size}
                  <small>Classmates to connect with</small>
                </strong>
              </span>
            </div>
            <Link href="/demo/invitations">
              <span className="stat-icon lavender">
                <Send size={20} />
              </span>
              <span>
                <strong>
                  {pending}
                  <small>Invitations waiting for you</small>
                </strong>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <aside className="profile-summary">
          <div className="summary-top">
            <span>Your student card</span>
            <Link href="/demo/me" aria-label="View student card">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <Avatar student={me} size="large" />
          <h3>{me.name}</h3>
          <p>
            {me.major} · Year {me.year}
          </p>
          <Status status={me.status} />
          <div className="summary-skills">
            {me.skills.slice(0, 2).map(s => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <Link href="/demo/me" className="summary-profile-link">
            Make a good first impression <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
      <CourseDirectory dashboard />
      <div className="dashboard-note">
        <span className="note-icon">
          <GraduationCap size={21} />
        </span>
        <div>
          <strong>A small hello can lead to a great project.</strong>
          <p>
            Start with someone in your course. Check their skills, read their
            bio, and send an invitation.
          </p>
        </div>
        <Link href="/demo/about">
          How CityLink works <ArrowUpRight size={16} />
        </Link>
      </div>
    </Shell>
  );
}
export function Courses() {
  return (
    <Shell title="Courses">
      <PageHeading
        eyebrow="FIND COMMON GROUND"
        title="Your courses. Your connections."
        description="Browse the semester’s courses and meet the classmates behind them."
      />
      <CourseDirectory />
    </Shell>
  );
}
