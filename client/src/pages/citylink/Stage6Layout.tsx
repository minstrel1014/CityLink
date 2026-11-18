import type { ReactNode } from "react";
import { ArrowLeft, LockKeyhole, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import "./MyCourses.css";
import "./Stage6.css";

export function Stage6Layout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const session = useSupabaseSession();
  return (
    <div className="authenticated-courses-page">
      <header className="authenticated-courses-header">
        <Link href="/my-courses" className="authenticated-courses-brand">
          city<span>link</span>.
        </Link>
        <div className="authenticated-courses-account">
          <span className="account-indicator" />
          <span>{session.user?.email || "Supabase account"}</span>
        </div>
        <nav aria-label="Account navigation">
          <Link href="/my-courses">My Courses</Link>
          <Link href="/me">My profile</Link>
          <Link href="/demo">Fictional demo</Link>
        </nav>
      </header>
      <main className="authenticated-courses-main">
        <div className="stage6-breadcrumb">
          <Link href="/my-courses">
            <ArrowLeft size={15} /> My Courses
          </Link>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </div>
        {children}
      </main>
      <footer className="authenticated-courses-footer">
        Authenticated Stage 6 feature · no sample records are substituted
      </footer>
    </div>
  );
}

export function Stage6Status({
  title,
  message,
  retry,
  kind = "error",
}: {
  title: string;
  message: string;
  retry?: () => void;
  kind?: "error" | "loading" | "empty" | "unauthorized";
}) {
  return (
    <section
      className={`stage6-status ${kind}`}
      role={kind === "error" || kind === "unauthorized" ? "alert" : "status"}
      aria-live="polite"
    >
      {kind === "loading" ? (
        <span className="spinner" />
      ) : (
        <span className="stage6-status-icon" aria-hidden="true">
          {kind === "unauthorized" ? <LockKeyhole size={22} /> : "i"}
        </span>
      )}
      <h2>{title}</h2>
      <p>{message}</p>
      {retry && (
        <button className="secondary" type="button" onClick={retry}>
          <RefreshCw size={15} /> Try again
        </button>
      )}
      {kind === "unauthorized" && (
        <Link href="/my-courses" className="secondary">
          Return to My Courses
        </Link>
      )}
    </section>
  );
}

export function useStage6Identity() {
  const session = useSupabaseSession();
  return {
    session,
    userId: session.status === "ready" ? (session.user?.id ?? null) : null,
  };
}
