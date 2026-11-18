import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useCityLink } from "@/data/AppContext";
import { getClassmates } from "@/data/repository";
import { DEMO_USER_ID } from "@/data/sampleData";
import {
  Avatar,
  CourseIcon,
  EmptyState,
  InviteButton,
  PageHeading,
  Shell,
  Status,
} from "@/components/citylink/Shared";
import NotFound from "@/pages/NotFound";
export function Classmates({ courseId }: { courseId: string }) {
  const { courses, students, enrolments } = useCityLink();
  const course = courses.find(c => c.id === courseId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  if (!course) return <NotFound />;
  const all = getClassmates(course.id, students, enrolments);
  const people = getClassmates(course.id, students, enrolments, search).filter(
    s => filter === "all" || s.status === filter
  );
  const enrolled = enrolments.some(
    e => e.studentId === DEMO_USER_ID && e.courseId === course.id
  );
  return (
    <Shell title={course.code}>
      <Link href="/demo/courses" className="back-link">
        <ArrowLeft size={17} /> Back to courses
      </Link>
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
      <p className="course-description">{course.description}</p>
      {!enrolled && (
        <div className="info-banner">
          You’re not enrolled in this sample course. Browse profiles, but group
          invitations are only available for your enrolled courses.
        </div>
      )}
      <div className="classmates-section-title">
        <h2>
          Meet your classmates <span className="count-pill">{all.length}</span>
        </h2>
        <span>
          <i className="green-dot" />
          {all.filter(s => s.status === "open").length} looking for a group
        </span>
      </div>
      <div className="classmates-toolbar">
        <div className="directory-search">
          <Search size={18} />
          <input
            aria-label="Search classmates by name or student ID"
            placeholder="Search by name or student ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              aria-label="Clear classmate search"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        <div className="filter-select">
          <SlidersHorizontal size={17} />
          <select
            aria-label="Filter classmates by group status"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All group statuses</option>
            <option value="open">Looking for a group</option>
            <option value="considering">Open to invitations</option>
            <option value="full">Group formed</option>
          </select>
        </div>
        <span className="results-label">
          {people.length} {people.length === 1 ? "classmate" : "classmates"}
        </span>
      </div>
      <div className="classmate-list">
        {people.map(s => (
          <article className="classmate-card" key={s.id}>
            <Link
              href={`/demo/students/${s.id}/${course.id}`}
              className="classmate-person"
            >
              <Avatar student={s} />
              <div>
                <h3>
                  {s.name} <ArrowUpRight size={15} />
                </h3>
                <p>
                  {s.major} <span>·</span> Year {s.year}
                </p>
                <small>{s.studentId}</small>
              </div>
            </Link>
            <div className="classmate-detail">
              <Status status={s.status} />
              <div className="skill-tags">
                {s.skills.slice(0, 3).map(skill => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </div>
            <div className="classmate-actions">
              <InviteButton student={s} courseId={course.id} compact />
              <Link
                href={`/demo/students/${s.id}/${course.id}`}
                className="view-profile"
              >
                View profile <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!people.length && (
        <EmptyState
          title="No classmates found"
          description="Search by a different name or student ID, or try another group status."
        >
          <button
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
      <p className="data-footnote">
        Only fictional students enrolled in {course.code} are shown. You are not
        included in your own classmate list.
      </p>
    </Shell>
  );
}
export function StudentProfile({
  studentId,
  courseId,
}: {
  studentId: string;
  courseId: string;
}) {
  const { students, courses, enrolments } = useCityLink();
  const student = students.find(s => s.id === studentId);
  const course = courses.find(c => c.id === courseId);
  if (
    !student ||
    !course ||
    !enrolments.some(e => e.studentId === studentId && e.courseId === courseId)
  )
    return <NotFound />;
  const studied = courses.filter(c =>
    enrolments.some(e => e.studentId === student.id && e.courseId === c.id)
  );
  const shared = studied.filter(c =>
    enrolments.some(e => e.studentId === DEMO_USER_ID && e.courseId === c.id)
  );
  return (
    <Shell title="Student profile">
      <Link href={`/demo/courses/${course.id}`} className="back-link">
        <ArrowLeft size={17} /> Back to {course.code} classmates
      </Link>
      <div className="profile-layout">
        <div className="profile-main">
          <section className="profile-header-card">
            <div className={`profile-cover ${student.color}`}>
              <span className="cover-circle" />
              <span className="cover-circle cover-circle-two" />
              <span className="profile-cover-label">
                A CLASSMATE. A POSSIBLE TEAMMATE.
              </span>
            </div>
            <div className="profile-header-body">
              <Avatar student={student} size="large" />
              <div className="profile-name-row">
                <div>
                  <h1>{student.name}</h1>
                  <p>{student.studentId}</p>
                </div>
                <Status status={student.status} />
              </div>
              <div className="academic-facts">
                <span>
                  <GraduationCap size={18} />
                  {student.major}
                </span>
                <span>
                  <BookOpen size={17} />
                  Year {student.year}
                </span>
              </div>
            </div>
          </section>
          <section className="profile-section">
            <p className="eyebrow">THE PERSON BEHIND THE PROFILE</p>
            <h2>A little about {student.name.split(" ")[0]}</h2>
            <p className="bio-text">{student.bio}</p>
          </section>
          <section className="profile-section">
            <h2>What I bring to a team</h2>
            <p className="section-description">
              Different strengths make a stronger group.
            </p>
            <div className="skill-tags large-tags">
              {student.skills.map(s => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </section>
          <section className="profile-section">
            <div className="section-title">
              <h2>
                Courses this semester{" "}
                <span className="count-pill">{studied.length}</span>
              </h2>
            </div>
            <div className="studied-course-list">
              {studied.map(c => (
                <Link key={c.id} href={`/demo/courses/${c.id}`}>
                  <CourseIcon course={c} size={19} />
                  <div>
                    <strong>{c.title}</strong>
                    <small>{c.code}</small>
                  </div>
                  {shared.some(sc => sc.id === c.id) && (
                    <span className="shared-badge">In common</span>
                  )}
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          </section>
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
          <p>
            Invite {student.name.split(" ")[0]} to work with you on your next
            group project.
          </p>
          <div className="invite-course-context">
            <CourseIcon course={course} size={19} />
            <div>
              <small>INVITING FOR</small>
              <strong>{course.code}</strong>
              <p>{course.title}</p>
            </div>
          </div>
          {student.id !== DEMO_USER_ID ? (
            <InviteButton student={student} courseId={course.id} />
          ) : (
            <Link href="/demo/me" className="secondary">
              Edit my profile
            </Link>
          )}
          <p className="invite-disclaimer">
            Demo invitations are saved in this browser, not delivered to real
            students.
          </p>
          <div className="shared-info">
            <BookOpen size={18} />
            <span>
              You share{" "}
              <strong>
                {shared.length} {shared.length === 1 ? "course" : "courses"}
              </strong>{" "}
              this semester.
            </span>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
