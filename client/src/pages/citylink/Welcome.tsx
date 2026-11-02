import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  GraduationCap,
  Link2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Brand, Avatar } from "@/components/citylink/Shared";
import { sampleStudents } from "@/data/sampleData";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  cleanSupabaseRecoveryCallbackUrl,
  getAuthEmailRedirectTo,
  getRegistrationPendingMessage,
  getSupabaseAuthErrorMessage,
  isDuplicateRegistration,
  isSupabaseRecoveryCallback,
} from "@/lib/supabaseAuthMessages";

type Feedback = {
  tone: "error" | "info" | "success";
  text: string;
};

function AuthFeedback({ feedback }: { feedback: Feedback }) {
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

function authUnavailableMessage(configuration: string) {
  if (configuration === "incomplete") {
    return "Supabase Auth is missing a Development setting. The fictional demo is still available.";
  }
  if (configuration === "invalid-url") {
    return "Supabase Auth is not available because its Development URL is invalid.";
  }
  return "Supabase Auth is not configured in this environment. The fictional demo is still available.";
}

export default function Welcome() {
  const [, navigate] = useLocation();
  const sessionState = useSupabaseSession();
  const [visible, setVisible] = useState(false);
  const [dialog, setDialog] = useState<
    "register" | "reset" | "new-password" | null
  >(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [passwordUpdateBusy, setPasswordUpdateBusy] = useState(false);
  const [signInFeedback, setSignInFeedback] = useState<Feedback | null>(null);
  const [registerFeedback, setRegisterFeedback] = useState<Feedback | null>(
    null
  );
  const [resetFeedback, setResetFeedback] = useState<Feedback | null>(null);

  const authConfigured = sessionState.configuration === "ready";
  const signedInUser = sessionState.user;

  useEffect(() => {
    const recoveryInUrl = isSupabaseRecoveryCallback(window.location.href);
    if (recoveryInUrl || sessionState.authEvent === "PASSWORD_RECOVERY") {
      setDialog("new-password");
      setResetFeedback(null);
    }

    if (sessionState.authEvent === "PASSWORD_RECOVERY") {
      window.history.replaceState(
        null,
        "",
        cleanSupabaseRecoveryCallbackUrl(window.location.href)
      );
    }
  }, [sessionState.authEvent]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignInFeedback(null);

    if (!supabaseClient || !authConfigured) {
      setSignInFeedback({
        tone: "info",
        text: authUnavailableMessage(sessionState.configuration),
      });
      return;
    }

    const email = signInEmail.trim();
    if (!email || !signInPassword) {
      setSignInFeedback({
        tone: "error",
        text: "Enter your email address and password.",
      });
      return;
    }

    setSignInBusy(true);
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password: signInPassword,
      });
      if (error) {
        setSignInFeedback({
          tone: "error",
          text: getSupabaseAuthErrorMessage(error, "sign-in"),
        });
      } else if (!data.session) {
        setSignInFeedback({
          tone: "info",
          text: "Your account may need email verification. Check your inbox, then try again.",
        });
      } else {
        setSignInFeedback({
          tone: "success",
          text: "Signed in with Supabase Auth. CityLink's course and invitation demo remains fictional and separate.",
        });
      }
    } catch (error) {
      setSignInFeedback({
        tone: "error",
        text: getSupabaseAuthErrorMessage(error, "sign-in"),
      });
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterFeedback(null);

    if (!supabaseClient || !authConfigured) {
      setRegisterFeedback({
        tone: "info",
        text: authUnavailableMessage(sessionState.configuration),
      });
      return;
    }
    if (signedInUser) {
      setRegisterFeedback({
        tone: "info",
        text: "You are already signed in. Manage your profile or sign out from the account page.",
      });
      return;
    }

    const email = registerEmail.trim();
    if (!email) {
      setRegisterFeedback({
        tone: "error",
        text: "Enter a valid email address.",
      });
      return;
    }
    if (registerPassword.length < 6) {
      setRegisterFeedback({
        tone: "error",
        text: "Choose a password with at least 6 characters.",
      });
      return;
    }
    if (registerPassword !== confirmPassword) {
      setRegisterFeedback({
        tone: "error",
        text: "The passwords do not match.",
      });
      return;
    }

    setRegisterBusy(true);
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: registerPassword,
        options: {
          emailRedirectTo: getAuthEmailRedirectTo(window.location.origin),
        },
      });

      if (error) {
        setRegisterFeedback({
          tone: "error",
          text: getSupabaseAuthErrorMessage(error, "sign-up"),
        });
      } else if (isDuplicateRegistration(data.user?.identities)) {
        setRegisterFeedback({
          tone: "info",
          text: "An account may already exist for this email. Try signing in instead.",
        });
      } else if (!data.session) {
        setRegisterFeedback({
          tone: "info",
          text: getRegistrationPendingMessage(),
        });
      } else {
        setRegisterFeedback({
          tone: "success",
          text: "Your account was created and signed in. CityLink's student data remains separate from the fictional demo.",
        });
        setSignInFeedback({
          tone: "success",
          text: "Signed in with Supabase Auth. CityLink's course and invitation demo remains fictional and separate.",
        });
        setDialog(null);
      }
    } catch (error) {
      setRegisterFeedback({
        tone: "error",
        text: getSupabaseAuthErrorMessage(error, "sign-up"),
      });
    } finally {
      setRegisterBusy(false);
    }
  }

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetFeedback(null);

    if (!supabaseClient || !authConfigured) {
      setResetFeedback({
        tone: "info",
        text: authUnavailableMessage(sessionState.configuration),
      });
      return;
    }

    const email = resetEmail.trim();
    if (!email) {
      setResetFeedback({ tone: "error", text: "Enter your email address." });
      return;
    }

    setResetBusy(true);
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthEmailRedirectTo(window.location.origin),
      });
      if (error) {
        setResetFeedback({
          tone: "error",
          text: getSupabaseAuthErrorMessage(error, "password-reset"),
        });
      } else {
        setResetFeedback({
          tone: "success",
          text: "If an account exists for that address, a password-reset email has been sent. Open its link in this browser to choose a new password.",
        });
      }
    } catch (error) {
      setResetFeedback({
        tone: "error",
        text: getSupabaseAuthErrorMessage(error, "password-reset"),
      });
    } finally {
      setResetBusy(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetFeedback(null);

    if (!supabaseClient || !signedInUser) {
      setResetFeedback({
        tone: "error",
        text: "This password-reset link is unavailable or expired. Request a new one and open it in this browser.",
      });
      return;
    }
    if (newPassword.length < 6) {
      setResetFeedback({
        tone: "error",
        text: "Choose a password with at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setResetFeedback({ tone: "error", text: "The passwords do not match." });
      return;
    }

    setPasswordUpdateBusy(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setResetFeedback({
          tone: "error",
          text: getSupabaseAuthErrorMessage(error, "password-update"),
        });
      } else {
        setNewPassword("");
        setConfirmNewPassword("");
        setDialog(null);
        setSignInFeedback({
          tone: "success",
          text: "Your password has been updated. You are signed in with Supabase Auth.",
        });
      }
    } catch (error) {
      setResetFeedback({
        tone: "error",
        text: getSupabaseAuthErrorMessage(error, "password-update"),
      });
    } finally {
      setPasswordUpdateBusy(false);
    }
  }

  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <Brand />
        <Link href="/about" className="welcome-about">
          A student project <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="welcome-grid">
        <section className="welcome-form">
          <div className="welcome-eyebrow">
            <span /> YOUR CAMPUS. YOUR PEOPLE.
          </div>
          <h1>
            Great things start
            <br />
            with <span>good company.</span>
          </h1>
          <p className="welcome-description">
            Find classmates who share your courses.
            <br className="desktop-only" /> Bring different strengths to the
            same team.
          </p>
          <div className="entry-panel">
            <div className="entry-title">
              <h2>Your next group is one hello away.</h2>
              <p>Explore the fictional demo or use a Supabase Auth account.</p>
            </div>
            <button
              className="primary demo-entry"
              onClick={() => navigate("/demo")}
            >
              Enter the demo <ArrowRight size={19} />
            </button>
            <div className="entry-divider">
              <span />
              or sign in to CityLink Auth
              <span />
            </div>
            {signedInUser && (
              <>
                <AuthFeedback
                  feedback={{
                    tone: "success",
                    text: `Signed in as ${signedInUser.email ?? "your account"}. The sample-data demo remains a separate fictional experience.`,
                  }}
                />
                <button
                  type="button"
                  className="secondary auth-profile-link"
                  onClick={() => navigate("/me")}
                >
                  Manage my profile <ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  className="secondary auth-profile-link"
                  onClick={() => navigate("/my-courses")}
                >
                  My Courses <ArrowRight size={17} />
                </button>
              </>
            )}
            {sessionState.status === "loading" && (
              <AuthFeedback
                feedback={{
                  tone: "info",
                  text: "Restoring your Supabase Auth session…",
                }}
              />
            )}
            {sessionState.status === "error" && (
              <AuthFeedback
                feedback={{
                  tone: "error",
                  text: "The saved Supabase session could not be restored. You can still try signing in again.",
                }}
              />
            )}
            {!authConfigured && (
              <AuthFeedback
                feedback={{
                  tone: "info",
                  text: authUnavailableMessage(sessionState.configuration),
                }}
              />
            )}
            <form onSubmit={handleSignIn}>
              <label htmlFor="email">
                University email <span>Supabase Auth</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.edu"
                autoComplete="email"
                value={signInEmail}
                onChange={event => setSignInEmail(event.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  placeholder="Your account password"
                  minLength={6}
                  autoComplete="current-password"
                  value={signInPassword}
                  onChange={event => setSignInPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="form-meta">
                <span>Demo data stays fictional</span>
                <button
                  type="button"
                  className="text-button"
                  disabled={Boolean(signedInUser)}
                  onClick={() => {
                    setResetEmail(signInEmail);
                    setResetFeedback(null);
                    setDialog("reset");
                  }}
                >
                  Forgot password?
                </button>
              </div>
              {signInFeedback && <AuthFeedback feedback={signInFeedback} />}
              <button
                className="secondary sign-in"
                type="submit"
                disabled={
                  !authConfigured ||
                  signInBusy ||
                  sessionState.status === "loading" ||
                  Boolean(signedInUser)
                }
              >
                {signInBusy
                  ? "Signing in…"
                  : signedInUser
                    ? "Signed in"
                    : "Sign in"}{" "}
                <ArrowRight size={17} />
              </button>
            </form>
            <p className="register-line">
              New around here?{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setRegisterFeedback(null);
                  setDialog("register");
                }}
              >
                Register
              </button>
            </p>
          </div>
          <p className="welcome-disclaimer">
            <ShieldCheck size={15} /> Fictional demo records. No CityU or Canvas
            connection; Auth is separate.
          </p>
        </section>
        <section
          className="welcome-visual"
          aria-label="CityLink connects classmates"
        >
          <div className="visual-top">
            <span className="visual-tag">
              <GraduationCap size={16} /> A little teamwork goes a long way
            </span>
            <h2>
              Different strengths.
              <br />
              One <em>great team.</em>
            </h2>
            <div className="connection-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="connection-core">
                <Link2 size={38} strokeWidth={2.5} />
              </span>
              <Avatar
                student={sampleStudents[1]}
                size="large"
                className="orbit-avatar avatar-one"
              />
              <Avatar
                student={sampleStudents[2]}
                size="large"
                className="orbit-avatar avatar-two"
              />
              <Avatar
                student={sampleStudents[3]}
                size="large"
                className="orbit-avatar avatar-three"
              />
              <div className="connection-chip chip-one">
                <span className="mini-dot" /> Looking for a group
              </div>
              <div className="connection-chip chip-two">
                <Users size={16} /> Better, together
              </div>
              <span className="art-spark spark-one">✳</span>
              <span className="art-spark spark-two">+</span>
            </div>
          </div>
          <div className="campus-photo">
            <img
              src="/images/campus.jpg"
              alt="Students spending time together in a university courtyard"
            />
            <div className="photo-caption">
              <span>FROM CLASSMATES TO TEAMMATES</span>
              <p>Make your next project a shared success.</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="welcome-footer">
        <span>CityLink · A university business project</span>
        <span>Built around people, not just profiles.</span>
      </footer>
      <Dialog
        open={!!dialog}
        onOpenChange={open => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "register"
                ? "Create a CityLink account"
                : dialog === "reset"
                  ? "Reset your password"
                  : "Choose a new password"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "register"
                ? "Use fictional test details only. Creating an account adds a Supabase Auth user. If the project's schema trigger is installed, it may also create a minimal public.profiles row; this form does not verify that row. It does not add you to the fictional courses or invitations."
                : dialog === "reset"
                  ? "Enter your account email. If it matches an account, Supabase will send a secure reset link to your inbox."
                  : "Open this page from your Supabase password-reset email, then choose a new password for your account."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "register" ? (
            <form className="auth-dialog-form" onSubmit={handleRegistration}>
              {!authConfigured && (
                <AuthFeedback
                  feedback={{
                    tone: "info",
                    text: authUnavailableMessage(sessionState.configuration),
                  }}
                />
              )}
              {signedInUser && (
                <AuthFeedback
                  feedback={{
                    tone: "info",
                    text: "You are already signed in. Manage your profile or sign out from the account page.",
                  }}
                />
              )}
              <label htmlFor="register-email">Email address</label>
              <input
                id="register-email"
                type="email"
                placeholder="test@example.test"
                autoComplete="email"
                value={registerEmail}
                onChange={event => setRegisterEmail(event.target.value)}
                required
                disabled={
                  !authConfigured || registerBusy || Boolean(signedInUser)
                }
              />
              <label htmlFor="register-password">Password</label>
              <input
                id="register-password"
                type="password"
                placeholder="At least 6 characters"
                autoComplete="new-password"
                minLength={6}
                value={registerPassword}
                onChange={event => setRegisterPassword(event.target.value)}
                required
                disabled={
                  !authConfigured || registerBusy || Boolean(signedInUser)
                }
              />
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                placeholder="Enter the password again"
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
                disabled={
                  !authConfigured || registerBusy || Boolean(signedInUser)
                }
              />
              {registerFeedback && <AuthFeedback feedback={registerFeedback} />}
              <button
                className="primary"
                type="submit"
                disabled={
                  !authConfigured ||
                  registerBusy ||
                  sessionState.status === "loading" ||
                  Boolean(signedInUser)
                }
              >
                {registerBusy ? "Creating account…" : "Create account"}
              </button>
            </form>
          ) : dialog === "reset" ? (
            <form
              className="auth-dialog-form"
              onSubmit={handlePasswordResetRequest}
            >
              {!authConfigured && (
                <AuthFeedback
                  feedback={{
                    tone: "info",
                    text: authUnavailableMessage(sessionState.configuration),
                  }}
                />
              )}
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.edu"
                value={resetEmail}
                onChange={event => setResetEmail(event.target.value)}
                required
                disabled={!authConfigured || resetBusy}
              />
              {resetFeedback && <AuthFeedback feedback={resetFeedback} />}
              <button
                className="primary"
                type="submit"
                disabled={!authConfigured || resetBusy}
              >
                {resetBusy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          ) : (
            <form className="auth-dialog-form" onSubmit={handlePasswordUpdate}>
              {sessionState.status === "loading" && (
                <AuthFeedback
                  feedback={{
                    tone: "info",
                    text: "Checking your secure reset link…",
                  }}
                />
              )}
              {sessionState.status !== "loading" && !signedInUser && (
                <AuthFeedback
                  feedback={{
                    tone: "error",
                    text: "This reset link is unavailable or expired. Request a new link and open it in this browser.",
                  }}
                />
              )}
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                required
                disabled={!signedInUser || passwordUpdateBusy}
              />
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirmNewPassword}
                onChange={event => setConfirmNewPassword(event.target.value)}
                required
                disabled={!signedInUser || passwordUpdateBusy}
              />
              {resetFeedback && <AuthFeedback feedback={resetFeedback} />}
              <button
                className="primary"
                type="submit"
                disabled={!signedInUser || passwordUpdateBusy}
              >
                {passwordUpdateBusy ? "Updating…" : "Update password"}
              </button>
              {!signedInUser && sessionState.status !== "loading" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setResetFeedback(null);
                    setDialog("reset");
                  }}
                >
                  Request another reset link
                </button>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
