import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Download,
  Info,
  LogOut,
  MessageCircle,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DEMO_USER_ID } from "@/data/sampleData";
import { useCityLink } from "@/data/AppContext";
import { hasDemoStorage } from "@/data/repository";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import AuthenticatedProfile from "@/pages/citylink/AuthenticatedProfile";
import {
  Avatar,
  CourseIcon,
  EmptyState,
  PageHeading,
  Shell,
  Status,
} from "@/components/citylink/Shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function Invitations() {
  const { invitations, students, courses, respond } = useCityLink();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [busy, setBusy] = useState("");
  const items = invitations
    .filter(i =>
      tab === "incoming"
        ? i.recipientId === DEMO_USER_ID
        : i.senderId === DEMO_USER_ID
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = (direction: "incoming" | "outgoing") =>
    invitations.filter(
      i =>
        (direction === "incoming"
          ? i.recipientId === DEMO_USER_ID
          : i.senderId === DEMO_USER_ID) && i.status === "pending"
    ).length;
  async function update(
    id: string,
    status: "accepted" | "declined" | "cancelled"
  ) {
    setBusy(id);
    await respond(id, status);
    setBusy("");
  }
  return (
    <Shell title="Invitations">
      <PageHeading
        eyebrow="LET’S MAKE SOMETHING TOGETHER"
        title="Your invitations"
        description="A new connection could be the start of your next great project."
      />
      <div className="info-banner">
        <Info size={18} />
        <span>
          {hasDemoStorage
            ? "Invitation records are saved and retrieved in this browser."
            : "Browser storage is unavailable; records last only for this session."}{" "}
          This is a fictional demo, not a live messaging service.
        </span>
      </div>
      <div className="invitation-tabs segmented-control">
        <button
          className={tab === "incoming" ? "active" : ""}
          onClick={() => setTab("incoming")}
        >
          Received <span>{count("incoming")}</span>
        </button>
        <button
          className={tab === "outgoing" ? "active" : ""}
          onClick={() => setTab("outgoing")}
        >
          Sent <span>{count("outgoing")}</span>
        </button>
      </div>
      <div className="invitation-list">
        {items.map(i => {
          const person = students.find(
            s => s.id === (tab === "incoming" ? i.senderId : i.recipientId)
          );
          const course = courses.find(c => c.id === i.courseId);
          if (!person || !course) return null;
          return (
            <article className="invitation-card" key={i.id}>
              <div className="invitation-person-row">
                <Link href={`/demo/students/${person.id}/${course.id}`}>
                  <Avatar student={person} />
                  <div>
                    <h3>
                      {person.name} <ArrowUpRight size={15} />
                    </h3>
                    <p>
                      {tab === "incoming"
                        ? "Invited you to form a group"
                        : "You invited this classmate"}
                    </p>
                  </div>
                </Link>
                <span className={`invitation-badge ${i.status}`}>
                  {i.status === "pending"
                    ? "Pending"
                    : i.status === "accepted"
                      ? "Accepted"
                      : i.status === "declined"
                        ? "Declined"
                        : "Cancelled"}
                </span>
              </div>
              <div className="invitation-course">
                <CourseIcon course={course} size={18} />
                <div>
                  <strong>{course.code}</strong>
                  <p>{course.title}</p>
                </div>
              </div>
              <div className="invitation-bottom">
                <span>
                  {new Date(i.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {i.status === "pending" &&
                  (tab === "incoming" ? (
                    <div>
                      <button
                        className="secondary"
                        disabled={busy === i.id}
                        onClick={() => update(i.id, "declined")}
                      >
                        Decline
                      </button>
                      <button
                        className="primary"
                        disabled={busy === i.id}
                        onClick={() => update(i.id, "accepted")}
                      >
                        <Check size={17} />
                        {busy === i.id ? "Saving…" : "Accept invitation"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy === i.id}
                      onClick={() => update(i.id, "cancelled")}
                    >
                      {busy === i.id ? "Saving…" : "Cancel invitation"}
                    </button>
                  ))}
              </div>
            </article>
          );
        })}
      </div>
      {!items.length && (
        <EmptyState
          title={
            tab === "incoming"
              ? "No invitations yet"
              : "Your first hello starts here"
          }
          description={
            tab === "incoming"
              ? "New demo invitations will appear here. In this version, there are no real students receiving or sending messages."
              : "Browse your course, find a classmate, and send your first group invitation."
          }
        >
          <Link href="/demo/courses" className="primary">
            Browse courses <ArrowRight size={17} />
          </Link>
        </EmptyState>
      )}
    </Shell>
  );
}
export function MyProfile() {
  const session = useSupabaseSession();
  if (session.status === "loading") {
    return <AuthenticatedProfile view="loading" />;
  }
  if (session.status === "error") {
    return <AuthenticatedProfile view="session-error" />;
  }
  if (session.user) {
    return <AuthenticatedProfile userId={session.user.id} />;
  }
  return <DemoMyProfile />;
}

export function DemoMyProfile() {
  const { me, courses, enrolments, saveProfile } = useCityLink();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me);
  const [skillsText, setSkillsText] = useState(me.skills.join(", "));
  const [busy, setBusy] = useState(false);
  const mine = courses.filter(c =>
    enrolments.some(e => e.courseId === c.id && e.studentId === DEMO_USER_ID)
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveProfile({
        ...draft,
        skills: [
          ...new Set(
            skillsText
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
          ),
        ],
      });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="My profile">
      <PageHeading
        eyebrow="PUT YOUR BEST SELF FORWARD"
        title="Your student profile"
        description="Give future teammates a little insight into who you are."
      >
        <button
          className="secondary"
          onClick={() => {
            setDraft(me);
            setSkillsText(me.skills.join(", "));
            setEditing(!editing);
          }}
        >
          {editing ? <X size={17} /> : <Pencil size={17} />}{" "}
          {editing ? "Cancel editing" : "Edit profile"}
        </button>
      </PageHeading>
      <div className="my-profile-grid">
        <section className="my-student-card">
          <div className="eyebrow">CITYLINK STUDENT CARD</div>
          <Avatar student={me} size="large" />
          <h2>{me.name}</h2>
          <p>{me.studentId}</p>
          <Status status={me.status} />
          <div className="my-card-facts">
            <span>
              Major<strong>{me.major}</strong>
            </span>
            <span>
              Year of study<strong>Year {me.year}</strong>
            </span>
            <span>
              Enrolled courses<strong>{mine.length} courses</strong>
            </span>
          </div>
          <Link href="/" className="exit-demo">
            <LogOut size={16} /> Back to demo entry
          </Link>
        </section>
        <section className="profile-form-panel">
          <div className="info-banner">
            <ShieldCheck size={18} />
            <span>
              Fictional profile. Edits are saved only in this browser.
            </span>
          </div>
          {editing ? (
            <form onSubmit={save} className="profile-form">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                rows={4}
                maxLength={600}
                required
                value={draft.bio}
                onChange={e => setDraft({ ...draft, bio: e.target.value })}
              />
              <label htmlFor="major">Major</label>
              <textarea
                id="major"
                rows={2}
                maxLength={100}
                required
                value={draft.major}
                onChange={e => setDraft({ ...draft, major: e.target.value })}
              />
              <div className="profile-field-grid">
                <div>
                  <label htmlFor="year">Year of study</label>
                  <select
                    id="year"
                    value={draft.year}
                    onChange={e =>
                      setDraft({ ...draft, year: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map(y => (
                      <option value={y} key={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="group-status">Group-forming status</label>
                  <select
                    id="group-status"
                    value={draft.status}
                    onChange={e =>
                      setDraft({
                        ...draft,
                        status: e.target.value as typeof draft.status,
                      })
                    }
                  >
                    <option value="open">Looking for a group</option>
                    <option value="considering">Open to invitations</option>
                    <option value="full">Group formed</option>
                  </select>
                </div>
              </div>
              <label htmlFor="skills">
                Skills <span>Separate with commas</span>
              </label>
              <input
                id="skills"
                maxLength={200}
                value={skillsText}
                onChange={e => setSkillsText(e.target.value)}
              />
              <label htmlFor="studied-courses">
                Studied courses <span>Managed by enrolments</span>
              </label>
              <textarea
                id="studied-courses"
                rows={4}
                readOnly
                value={mine.map(c => `${c.code} · ${c.title}`).join("\n")}
              />
              <button className="primary" disabled={busy}>
                <Check size={17} />
                {busy ? "Saving…" : "Save demo profile"}
              </button>
            </form>
          ) : (
            <>
              <section className="profile-section no-border">
                <h2>About me</h2>
                <p className="bio-text">{me.bio}</p>
              </section>
              <section className="profile-section">
                <h2>My strengths</h2>
                <div className="skill-tags large-tags">
                  {me.skills.map(s => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              </section>
              <section className="profile-section">
                <h2>Studied courses</h2>
                <div className="studied-course-list">
                  {mine.map(c => (
                    <Link key={c.id} href={`/demo/courses/${c.id}`}>
                      <CourseIcon course={c} size={18} />
                      <div>
                        <strong>{c.title}</strong>
                        <small>{c.code}</small>
                      </div>
                      <ArrowUpRight size={17} />
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
export function Messages() {
  return (
    <Shell title="Messages">
      <PageHeading
        eyebrow="MORE WAYS TO CONNECT"
        title="Good conversations are coming."
        description="For now, make your first connection with a group invitation."
      />
      <section className="coming-soon">
        <span className="coming-soon-icon">
          <MessageCircle size={42} />
        </span>
        <span className="coming-soon-label">NEXT CHAPTER</span>
        <h2>From a hello to a whole project.</h2>
        <p>
          Course-based chat is a planned next step. It is not implemented in
          this demo, and no messages can be sent or received.
        </p>
        <Link href="/demo/invitations" className="primary">
          Check your invitations <ArrowRight size={17} />
        </Link>
        <Link href="/demo/courses" className="text-link">
          Find a classmate instead <ArrowUpRight size={16} />
        </Link>
      </section>
    </Shell>
  );
}
export function About() {
  const { reset } = useCityLink();
  const [confirm, setConfirm] = useState(false);
  return (
    <Shell title="About the demo">
      <PageHeading
        eyebrow="A STUDENT PROJECT, BUILT WITH PURPOSE"
        title="A clear picture of this demo."
        description="CityLink helps students find groupmates in the courses they share."
      />
      <div className="about-grid">
        <section className="about-card">
          <span className="about-icon sage">
            <CheckCircle2 size={25} />
          </span>
          <h2>Working with sample data</h2>
          <p>
            Course browsing and filters, enrolled classmate search, academic
            profiles, and group invitations are functional. Every student, ID,
            course record and enrolment is fictional.
          </p>
          <p>
            Invitations are actual demo records, saved to browser localStorage
            and retrieved after refresh. Incoming invitations can be accepted or
            declined, and pending sent invitations can be cancelled. The
            demo-only profile editor saves to this browser.
          </p>
          <span className="about-badge">SAMPLE DATA · BROWSER STORAGE</span>
        </section>
        <section className="about-card">
          <span className="about-icon lavender">
            <ShieldCheck size={25} />
          </span>
          <h2>Supabase Auth and your own profile</h2>
          <p>
            Email/password sign-up, sign-in, password reset, and sign-out use
            Supabase Auth in a configured environment. On /me, a signed-in user
            loads their own public.profiles row and may edit only major, year,
            bio, skills, and status. Supabase RLS and column grants enforce
            ownership and field access.
          </p>
          <p>
            The /demo profile, courses, enrolments, classmate directory, and
            invitations still use separate fictional browser data. No CityU,
            Canvas, or institutional login connection exists.
          </p>
          <span className="about-badge neutral">
            AUTH + OWN PROFILE · OTHER DATA LOCAL
          </span>
        </section>
        <section className="about-card">
          <span className="about-icon peach">
            <Sparkles size={25} />
          </span>
          <h2>Authenticated course catalogue</h2>
          <p>
            The separate /my-courses page reads the Supabase course catalogue
            and the signed-in user's own enrolments. Add/remove controls remain
            paused until the separate database permission review is approved.
            The existing /courses directory still belongs to the fictional demo.
          </p>
          <p>
            Self-enrolment does not verify university registration. Under the
            current schema, people who share a course may discover one another's
            profiles. That visibility is intentional for this prototype, not
            strict profile privacy. Real classmates, invitations, and chat
            remain disconnected.
          </p>
          <span className="about-badge neutral">
            STAGE 4 · COURSE READS · WRITES GATED
          </span>
        </section>
      </div>
      <section className="backend-guide">
        <div>
          <p className="eyebrow">READY FOR THE NEXT CHAPTER</p>
          <h2>Connect CityLink student data.</h2>
          <p>
            Supabase Auth and the signed-in user's own editable profile are
            connected separately from the fictional student-data repository. The
            authenticated course catalogue is read-only pending separate
            enrolment-policy approval. Course rosters, invitations, and chat
            remain disconnected. This demo does not send real group invitations.
          </p>
          <div className="guide-links">
            <a href="/docs/SUPABASE_SETUP.md" download className="primary">
              <Download size={17} /> Supabase setup guide
            </a>
            <a href="/docs/schema.sql" download className="secondary">
              <Download size={17} /> Proposed SQL schema
            </a>
          </div>
        </div>
        <span className="backend-mark">
          DB
          <span>
            <Check size={16} />
          </span>
        </span>
      </section>
      <section className="demo-reset">
        <div>
          <h3>A fresh start for your presentation</h3>
          <p>
            Reset this browser’s invitations and profile edits to the original
            fictional data.
          </p>
        </div>
        <button className="secondary" onClick={() => setConfirm(true)}>
          <RotateCcw size={16} /> Reset demo
        </button>
      </section>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this demo?</DialogTitle>
            <DialogDescription>
              This removes locally saved invitations and profile edits in this
              browser and restores the original fictional records. No real
              account or database is affected.
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConfirm(false)}>
              Keep my changes
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await reset();
                  setConfirm(false);
                } catch {
                  toast.error("Unable to clear browser storage.");
                }
              }}
            >
              Reset demo
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
