import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Code2,
  Database,
  GraduationCap,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Send,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  ChartNoAxesColumn,
  Megaphone,
  Workflow,
  ArrowRight,
  Check,
  Plus,
  Clock3,
  Inbox,
} from "lucide-react";
import { useCityLink } from "@/data/AppContext";
import { DEMO_USER_ID, type Course, type Student } from "@/data/sampleData";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/demo"
      className={`brand ${small ? "small" : ""}`}
      aria-label="CityLink dashboard"
    >
      <span className="brand-icon">
        <Link2 size={24} strokeWidth={2.8} />
      </span>
      <span>
        city<span className="brand-light">link</span>
        <i>.</i>
      </span>
    </Link>
  );
}
export function Avatar({
  student,
  size = "normal",
  className = "",
}: {
  student: Student;
  size?: "small" | "normal" | "large";
  className?: string;
}) {
  return (
    <span
      className={`avatar ${student.color} ${size} ${className}`}
      aria-label={student.name}
    >
      {student.avatar}
    </span>
  );
}
export function Status({ status }: { status: Student["status"] }) {
  const labels = {
    open: "Looking for a group",
    considering: "Open to invitations",
    full: "Group formed",
  };
  return (
    <span className={`status ${status}`}>
      <span />
      {labels[status]}
    </span>
  );
}
export function CourseIcon({
  course,
  size = 23,
}: {
  course: Course;
  size?: number;
}) {
  const icons: Record<string, typeof BookOpen> = {
    is3100: Code2,
    is2200: Code2,
    cb2500: BookOpen,
    is3230: Workflow,
    cb2300: ChartNoAxesColumn,
    is3300: Database,
    mkt3600: Megaphone,
    cs2300: Code2,
  };
  const Icon = icons[course.id] || BookOpen;
  return (
    <span className={`course-icon ${course.color}`}>
      <Icon size={size} strokeWidth={1.7} />
    </span>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Users size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
const nav = [
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/invitations", label: "Invitations", icon: Send },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/me", label: "My profile", icon: UserRound },
];
export function Shell({
  children,
  title = "Overview",
}: {
  children: ReactNode;
  title?: string;
}) {
  const [location] = useLocation();
  const { me, invitations } = useCityLink();
  const incoming = invitations.filter(
    i => i.recipientId === DEMO_USER_ID && i.status === "pending"
  ).length;
  const active = (href: string) =>
    href === "/courses"
      ? location.startsWith("/courses") || location.startsWith("/students")
      : location === href;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-dot" /> STUDENT WORKSPACE
        </div>
        <nav aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${active(href) ? "active" : ""}`}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {href === "/invitations" && incoming > 0 && (
                <b className="nav-count">{incoming}</b>
              )}
              {href === "/messages" && <span className="soon-label">SOON</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={20} />
            <h4>Better, together.</h4>
            <p>Your next great group starts with a hello.</p>
            <Link href="/courses">
              Find your people <ArrowUpRight size={17} />
            </Link>
          </div>
          <Link href="/about" className="help-link">
            <Settings2 size={18} /> About this demo <ArrowUpRight size={14} />
          </Link>
          <Link href="/me" className="sidebar-user">
            <Avatar student={me} size="small" />
            <span>
              <strong>{me.name}</strong>
              <small>Year {me.year} · IS student</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand small />
          </div>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <Link href="/about" className="demo-pill">
              <span /> Sample data demo
            </Link>
            <Link
              href="/invitations"
              className="icon-button notification"
              aria-label={`${incoming} pending invitations`}
            >
              <Bell size={21} />
              {incoming > 0 && <i />}
            </Link>
            <Link href="/me" aria-label="View my profile">
              <Avatar student={me} size="small" />
            </Link>
          </div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="desktop-footer">
          <span>Made for your next great team.</span>
          <Link href="/about">
            Fictional data · No university connection <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={active(href) ? "active" : ""}
            aria-current={active(href) ? "page" : undefined}
          >
            <span>
              <Icon size={21} />
              {href === "/invitations" && incoming > 0 && <i>{incoming}</i>}
            </span>
            <small>{label === "My profile" ? "Profile" : label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}
export function CourseCard({ course }: { course: Course }) {
  const { students, enrolments } = useCityLink();
  const roster = students.filter(
    s =>
      s.id !== DEMO_USER_ID &&
      enrolments.some(e => e.courseId === course.id && e.studentId === s.id)
  );
  const mine = enrolments.some(
    e => e.courseId === course.id && e.studentId === DEMO_USER_ID
  );
  const open = roster.filter(s => s.status === "open").length;
  return (
    <Link href={`/courses/${course.id}`} className="course-card">
      <div className="course-card-top">
        <CourseIcon course={course} />
        <span className="course-code">{course.code}</span>
        <ArrowUpRight size={18} className="card-arrow" />
      </div>
      <h3>{course.title}</h3>
      <p>
        {course.department} <span>·</span> {course.credits} credits
      </p>
      <div className="course-card-bottom">
        <div className="avatar-stack">
          {roster.slice(0, 3).map(s => (
            <Avatar student={s} size="small" key={s.id} />
          ))}
          <span className="classmate-count">{roster.length} classmates</span>
        </div>
        <span className={`open-count ${!mine ? "not-enrolled" : ""}`}>
          {mine ? (
            <>
              <i />
              {open} looking
            </>
          ) : (
            "Not enrolled"
          )}
        </span>
      </div>
    </Link>
  );
}
export function InviteButton({
  student,
  courseId,
  compact = false,
}: {
  student: Student;
  courseId: string;
  compact?: boolean;
}) {
  const { invitations, invite, enrolments } = useCityLink();
  const [busy, setBusy] = useState(false);
  const record = invitations.find(
    i =>
      i.courseId === courseId &&
      ((i.senderId === DEMO_USER_ID && i.recipientId === student.id) ||
        (i.recipientId === DEMO_USER_ID && i.senderId === student.id)) &&
      ["pending", "accepted"].includes(i.status)
  );
  const mine = enrolments.some(
    e => e.studentId === DEMO_USER_ID && e.courseId === courseId
  );
  if (record) {
    const incoming = record.recipientId === DEMO_USER_ID;
    return (
      <Link
        href="/invitations"
        className={`invite-status ${compact ? "compact" : ""}`}
      >
        {record.status === "accepted" ? (
          <Check size={16} />
        ) : (
          <Clock3 size={16} />
        )}
        <span>
          {record.status === "accepted"
            ? "Connected"
            : incoming
              ? "Invitation received"
              : "Invitation sent"}
        </span>
      </Link>
    );
  }
  if (student.status === "full" || !mine)
    return (
      <button
        className={`invite-disabled ${compact ? "compact" : ""}`}
        disabled
      >
        {compact ? (
          <Check size={18} />
        ) : student.status === "full" ? (
          "Group already formed"
        ) : (
          "Enrolment required"
        )}
      </button>
    );
  return (
    <button
      className={`primary ${compact ? "invite-compact" : ""}`}
      disabled={busy}
      aria-label={`Invite ${student.name} to group`}
      onClick={async () => {
        setBusy(true);
        try {
          await invite(student.id, courseId);
        } catch {
          /* feedback owned by context */
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <span className="spinner" />
      ) : compact ? (
        <Plus size={20} />
      ) : (
        <Send size={17} />
      )}
      <span>{busy ? "Sending…" : compact ? "Invite" : "Invite to Group"}</span>
    </button>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
