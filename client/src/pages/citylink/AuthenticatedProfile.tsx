import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LogOut,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Avatar, Brand, Status } from "@/components/citylink/Shared";
import type { Student } from "@/data/sampleData";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  buildOwnProfileUpdate,
  classifyOwnProfileResult,
  getProfileInitials,
  isAuthenticatedProfileOwner,
  isCurrentProfileOperation,
  MAX_PROFILE_BIO_LENGTH,
  OWN_PROFILE_COLUMNS,
  type OwnProfile,
  type OwnProfileResult,
  type ProfileEditDraft,
} from "@/lib/supabaseProfile";

type ScreenFeedback = { tone: "success" | "error"; text: string };
type LoadState = "loading" | "ready" | "missing" | "error";

type AuthenticatedProfileProps =
  | { userId: string; view?: never }
  | { userId?: never; view: "loading" | "session-error" };

function ProfileFeedback({ feedback }: { feedback: ScreenFeedback }) {
  return (
    <p
      className={`auth-feedback ${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
    >
      {feedback.text}
    </p>
  );
}

function ProfileFrame({
  children,
  userId,
  onSignOut,
  signingOut,
  headerError,
}: {
  children: ReactNode;
  userId?: string;
  onSignOut?: () => void;
  signingOut?: boolean;
  headerError?: string;
}) {
  return (
    <div className="auth-profile-page">
      <header className="auth-profile-header">
        <Brand />
        <nav aria-label="Account navigation">
          <Link href="/my-courses">My Courses</Link>
          <Link href="/demo">Fictional demo</Link>
          <Link href="/about">About</Link>
          {userId && (
            <button
              className="secondary auth-signout"
              onClick={onSignOut}
              disabled={signingOut}
            >
              <LogOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          )}
        </nav>
      </header>
      {headerError && (
        <div className="auth-profile-alert" role="alert">
          {headerError}
        </div>
      )}
      <main className="auth-profile-main">{children}</main>
      <footer className="auth-profile-footer">
        Supabase Auth profile · course and invitation data remain separate
      </footer>
    </div>
  );
}

function makeDraft(profile: OwnProfile): ProfileEditDraft {
  return {
    major: profile.major ?? "",
    year: profile.year,
    bio: profile.bio,
    skillsText: profile.skills.join(", "),
    status: profile.status,
  };
}

function displayStudent(profile: OwnProfile): Student {
  return {
    id: profile.id,
    studentId: profile.studentId ?? "Not provided",
    name: profile.displayName,
    major: profile.major ?? "Not set",
    year: profile.year,
    bio: profile.bio,
    skills: profile.skills,
    status: profile.status,
    avatar: getProfileInitials(profile.displayName),
    color: "sage",
  };
}

function WaitingScreen() {
  return (
    <ProfileFrame>
      <section className="auth-profile-state" aria-live="polite">
        <span className="auth-profile-state-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">RESTORING YOUR ACCOUNT</p>
        <h1>Checking your sign-in…</h1>
        <p>
          CityLink is checking whether a Supabase Auth session is available.
        </p>
      </section>
    </ProfileFrame>
  );
}

function SessionErrorScreen() {
  return (
    <ProfileFrame>
      <section className="auth-profile-state">
        <span className="auth-profile-state-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">ACCOUNT SESSION UNAVAILABLE</p>
        <h1>We couldn’t restore your sign-in.</h1>
        <p>
          Your CityLink sample demo is still available separately. Return to the
          sign-in page and try again, or open the fictional demo.
        </p>
        <div className="auth-profile-state-actions">
          <Link className="primary" href="/">
            <ArrowLeft size={17} /> Sign-in page
          </Link>
          <Link className="secondary" href="/demo">
            Explore fictional demo
          </Link>
        </div>
      </section>
    </ProfileFrame>
  );
}

export default function AuthenticatedProfile({
  userId,
  view,
}: AuthenticatedProfileProps) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<LoadState>(
    view === "session-error" ? "error" : (view ?? "loading")
  );
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [draft, setDraft] = useState<ProfileEditDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [feedback, setFeedback] = useState<ScreenFeedback | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const profileRequestGeneration = useRef(0);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  useEffect(() => {
    const generation = ++profileRequestGeneration.current;
    let active = true;
    const cleanup = () => {
      active = false;
      if (profileRequestGeneration.current === generation) {
        profileRequestGeneration.current += 1;
      }
    };

    if (view) {
      setState(view === "loading" ? "loading" : "error");
      setProfile(null);
      setDraft(null);
      setSaving(false);
      return cleanup;
    }
    if (!userId || !supabaseClient) {
      setState("error");
      setProfile(null);
      setDraft(null);
      setSaving(false);
      return cleanup;
    }

    setState("loading");
    setProfile(null);
    setDraft(null);
    setSaving(false);
    setEditing(false);
    setFeedback(null);

    void (async () => {
      try {
        const { data, error } = await supabaseClient
          .from("profiles")
          .select(OWN_PROFILE_COLUMNS)
          .eq("id", userId)
          .maybeSingle();
        if (!active) return;

        const result = classifyOwnProfileResult(data, error, userId);
        if (result.state === "ready") {
          setProfile(result.profile);
          setDraft(makeDraft(result.profile));
        } else {
          setProfile(null);
          setDraft(null);
        }
        setState(result.state);
      } catch {
        if (!active) return;
        setProfile(null);
        setDraft(null);
        setState("error");
      }
    })();

    return cleanup;
  }, [reloadToken, userId, view]);

  async function signOut() {
    if (!supabaseClient) return;
    setSigningOut(true);
    setFeedback(null);
    try {
      const { error } = await supabaseClient.auth.signOut({ scope: "local" });
      if (error) {
        setFeedback({
          tone: "error",
          text: "We couldn’t sign you out. Check your connection and try again.",
        });
        return;
      }
      setProfile(null);
      setDraft(null);
      setState("missing");
      navigate("/");
    } catch {
      setFeedback({
        tone: "error",
        text: "We couldn’t sign you out. Check your connection and try again.",
      });
    } finally {
      setSigningOut(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!userId || !supabaseClient || !draft) return;
    const saveUserId = userId;
    const generation = profileRequestGeneration.current;
    const isCurrentRequest = () =>
      isCurrentProfileOperation(
        saveUserId,
        currentUserId.current,
        generation,
        profileRequestGeneration.current
      );

    setSaving(true);
    setFeedback(null);

    let payload: ReturnType<typeof buildOwnProfileUpdate>;
    try {
      payload = buildOwnProfileUpdate(draft);
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Check the profile fields and try again.",
      });
      setSaving(false);
      return;
    }

    try {
      const {
        data: { user: authenticatedUser },
        error: authenticationError,
      } = await supabaseClient.auth.getUser();
      if (!isCurrentRequest()) return;
      if (
        !isAuthenticatedProfileOwner(
          saveUserId,
          authenticatedUser?.id,
          authenticationError
        )
      ) {
        setFeedback({
          tone: "error",
          text: "Your sign-in could not be verified. Sign in again before saving your profile.",
        });
        return;
      }

      const { data, error } = await supabaseClient
        .from("profiles")
        .update(payload)
        .eq("id", saveUserId)
        .select(OWN_PROFILE_COLUMNS)
        .maybeSingle();
      if (!isCurrentRequest()) return;

      if (error) {
        setFeedback({
          tone: "error",
          text: "Your profile wasn’t saved. Check the fields and try again.",
        });
        return;
      }

      const result = classifyOwnProfileResult(data, null, saveUserId);
      if (result.state !== "ready") {
        setProfile(null);
        setDraft(null);
        setState(result.state);
        setEditing(false);
        return;
      }

      setProfile(result.profile);
      setDraft(makeDraft(result.profile));
      setEditing(false);
      setFeedback({ tone: "success", text: "Your profile changes are saved." });
    } catch {
      if (isCurrentRequest()) {
        setFeedback({
          tone: "error",
          text: "Your profile wasn’t saved. Check your sign-in and connection, then try again.",
        });
      }
    } finally {
      if (isCurrentRequest()) setSaving(false);
    }
  }

  if (view === "loading") return <WaitingScreen />;
  if (view === "session-error") return <SessionErrorScreen />;

  const frame = (children: React.ReactNode, headerError?: string) => (
    <ProfileFrame
      userId={userId}
      onSignOut={() => void signOut()}
      signingOut={signingOut}
      headerError={headerError}
    >
      {children}
    </ProfileFrame>
  );

  if (state === "loading") {
    return frame(
      <section className="auth-profile-state" aria-live="polite">
        <span className="auth-profile-state-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">YOUR CITYLINK ACCOUNT</p>
        <h1>Loading your profile…</h1>
        {feedback && <ProfileFeedback feedback={feedback} />}
        <p>Only your signed-in account profile is requested.</p>
      </section>
    );
  }

  if (state === "missing") {
    return frame(
      <section className="auth-profile-state">
        <span className="auth-profile-state-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">PROFILE NOT FOUND</p>
        <h1>Your account is signed in, but its profile is missing.</h1>
        {feedback && <ProfileFeedback feedback={feedback} />}
        <p>
          CityLink won’t create a profile automatically. Ask the project owner
          to check the Auth profile trigger, then try loading your profile
          again.
        </p>
        <div className="auth-profile-state-actions">
          <button
            className="primary"
            onClick={() => setReloadToken(value => value + 1)}
          >
            Try again
          </button>
          <Link className="secondary" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </section>
    );
  }

  if (state === "error" || !profile || !draft) {
    return frame(
      <section className="auth-profile-state">
        <span className="auth-profile-state-icon">
          <ShieldCheck size={27} />
        </span>
        <p className="eyebrow">PROFILE UNAVAILABLE</p>
        <h1>We couldn’t load your profile.</h1>
        {feedback && <ProfileFeedback feedback={feedback} />}
        <p>
          Your data wasn’t changed. Check your connection and profile access,
          then try again. Database details are not shown here.
        </p>
        <div className="auth-profile-state-actions">
          <button
            className="primary"
            onClick={() => setReloadToken(value => value + 1)}
          >
            Try again
          </button>
          <Link className="secondary" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </section>
    );
  }

  const student = displayStudent(profile);

  return frame(
    <>
      <div className="auth-profile-heading">
        <div>
          <p className="eyebrow">YOUR CITYLINK ACCOUNT</p>
          <h1>Your profile</h1>
          <p>Manage the profile associated with your Supabase Auth account.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            if (!editing) setDraft(makeDraft(profile));
            setFeedback(null);
            setEditing(value => !value);
          }}
          disabled={saving}
        >
          {editing ? <X size={17} /> : <Pencil size={17} />}
          {editing ? "Cancel editing" : "Edit profile"}
        </button>
      </div>
      {feedback && <ProfileFeedback feedback={feedback} />}
      <div className="my-profile-grid auth-profile-grid">
        <section className="my-student-card">
          <div className="eyebrow">AUTHENTICATED PROFILE</div>
          <Avatar student={student} size="large" />
          <h2>{profile.displayName}</h2>
          <p>{profile.studentId ?? "Student ID not set"}</p>
          <Status status={profile.status} />
          <div className="my-card-facts">
            <span>
              Major<strong>{profile.major || "Not set"}</strong>
            </span>
            <span>
              Year of study<strong>Year {profile.year}</strong>
            </span>
          </div>
          <div className="auth-profile-separation">
            <ShieldCheck size={16} />
            <span>
              Your signed-in courses and group invitations are separate from the
              fictional demo.
            </span>
          </div>
          <Link href="/dashboard" className="exit-demo">
            View your courses <ArrowRight size={15} />
          </Link>
        </section>

        <section className="profile-form-panel">
          <div className="info-banner">
            <ShieldCheck size={18} />
            <span>
              Only major, year, bio, skills, and group-forming status are
              editable. Supabase RLS checks that this is your own profile.
            </span>
          </div>
          {editing ? (
            <form onSubmit={saveProfile} className="profile-form">
              <label htmlFor="auth-bio">Bio</label>
              <textarea
                id="auth-bio"
                rows={5}
                maxLength={MAX_PROFILE_BIO_LENGTH}
                value={draft.bio}
                onChange={event =>
                  setDraft({ ...draft, bio: event.target.value })
                }
              />
              <label htmlFor="auth-major">Major</label>
              <textarea
                id="auth-major"
                rows={2}
                maxLength={120}
                value={draft.major}
                onChange={event =>
                  setDraft({ ...draft, major: event.target.value })
                }
              />
              <div className="profile-field-grid">
                <div>
                  <label htmlFor="auth-year">Year of study</label>
                  <select
                    id="auth-year"
                    value={draft.year}
                    onChange={event =>
                      setDraft({ ...draft, year: Number(event.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map(year => (
                      <option value={year} key={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="auth-status">Group-forming status</label>
                  <select
                    id="auth-status"
                    value={draft.status}
                    onChange={event =>
                      setDraft({
                        ...draft,
                        status: event.target.value as typeof draft.status,
                      })
                    }
                  >
                    <option value="open">Looking for a group</option>
                    <option value="considering">Open to invitations</option>
                    <option value="full">Group formed</option>
                  </select>
                </div>
              </div>
              <label htmlFor="auth-skills">
                Skills{" "}
                <span>Separate with commas · up to 10, 40 characters each</span>
              </label>
              <input
                id="auth-skills"
                maxLength={500}
                value={draft.skillsText}
                onChange={event =>
                  setDraft({ ...draft, skillsText: event.target.value })
                }
              />
              <button className="primary" disabled={saving}>
                <Check size={17} /> {saving ? "Saving…" : "Save profile"}
              </button>
            </form>
          ) : (
            <>
              <section className="profile-section no-border">
                <h2>About me</h2>
                <p className="bio-text">
                  {profile.bio || "Add a short bio to introduce yourself."}
                </p>
              </section>
              <section className="profile-section">
                <h2>My strengths</h2>
                <div className="skill-tags large-tags">
                  {profile.skills.length ? (
                    profile.skills.map((skill, index) => (
                      <span key={`${skill}-${index}`}>{skill}</span>
                    ))
                  ) : (
                    <span>No skills added yet</span>
                  )}
                </div>
              </section>
              <section className="profile-section">
                <h2>Study information</h2>
                <p className="bio-text">
                  {profile.major || "Major not set"} · Year {profile.year}
                </p>
              </section>
            </>
          )}
        </section>
      </div>
    </>
  );
}
