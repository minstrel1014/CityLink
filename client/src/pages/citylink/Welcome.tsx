import { useState } from "react";
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
  X,
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
export default function Welcome() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dialog, setDialog] = useState<"register" | "reset" | null>(null);
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
              <p>Take a look around with our fictional student demo.</p>
            </div>
            <button
              className="primary demo-entry"
              onClick={() => navigate("/demo")}
            >
              Enter the demo <ArrowRight size={19} />
            </button>
            <div className="entry-divider">
              <span />
              or preview the sign-in flow
              <span />
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                navigate("/demo");
              }}
            >
              <label htmlFor="email">
                University email <span>Demo only</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="alex@example.edu"
                autoComplete="off"
                required
              />
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  placeholder="Use an example password"
                  minLength={6}
                  autoComplete="off"
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
                <span>No real credentials needed</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDialog("reset")}
                >
                  Forgot password?
                </button>
              </div>
              <button className="secondary sign-in" type="submit">
                Preview sign-in <ArrowRight size={17} />
              </button>
            </form>
            <p className="register-line">
              New around here?{" "}
              <button
                className="text-button"
                onClick={() => setDialog("register")}
              >
                Register
              </button>
            </p>
          </div>
          <p className="welcome-disclaimer">
            <ShieldCheck size={15} /> Fictional records. No CityU or Canvas
            connection.
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
                ? "Real registration is a next step"
                : "Password reset is not connected yet"}
            </DialogTitle>
            <DialogDescription>
              This version uses a fictional demo profile, so there is no account
              to create or password to reset. Do not enter real university
              credentials. Supabase Auth can provide these features when the
              backend is connected.
            </DialogDescription>
          </DialogHeader>
          <button className="primary" onClick={() => navigate("/demo")}>
            Explore the demo <ArrowRight size={18} />
          </button>
          <Link href="/about" className="text-button">
            See implementation status
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
