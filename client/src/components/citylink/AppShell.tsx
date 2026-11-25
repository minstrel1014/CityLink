import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Send,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Brand } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { supabaseClient } from "@/lib/supabaseClient";
import { useInvitationBadge } from "@/lib/invitationBadge";
import { useDirectMessageBadge } from "@/lib/directMessageBadge";
import "./AppShell.css";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/invitations", label: "Invitations", icon: Send },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/me", label: "My profile", icon: UserRound },
];

export default function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const [location, navigate] = useLocation();
  const session = useSupabaseSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const email = session.user?.email ?? "Signed-in account";
  const badge = useInvitationBadge({
    userId: session.status === "ready" ? (session.user?.id ?? null) : null,
    authGeneration: session.authGeneration ?? 0,
    refreshKey: location,
  });
  useEffect(() => {
    if (location === "/invitations") badge.markSeen();
  }, [badge.markSeen, location]);
  const unreadMessages = useDirectMessageBadge({
    userId: session.status === "ready" ? (session.user?.id ?? null) : null,
    authGeneration: session.authGeneration ?? 0,
    refreshKey: location,
    suppressed: location.startsWith("/messages"),
  });

  const isActive = (href: string) =>
    href === "/courses"
      ? location === href ||
        location.startsWith("/courses/") ||
        location.startsWith("/students/") ||
        location.startsWith("/my-courses/")
      : href === "/invitations"
        ? location === href
        : href === "/messages"
          ? location === href || location === "/group-chat"
          : href === "/dashboard"
            ? location === "/dashboard" || location === "/my-courses"
            : location === href;

  async function signOut() {
    if (!supabaseClient || signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabaseClient.auth.signOut({ scope: "local" });
      if (error) {
        setSignOutError("Could not sign out. Please try again.");
        return;
      }
      navigate("/");
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="citylink-workspace-shell">
      <aside className="citylink-workspace-sidebar">
        <Brand href="/dashboard" />
        <div className="citylink-workspace-label">
          <span className="citylink-workspace-dot" /> STUDENT WORKSPACE
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`citylink-workspace-nav-link ${isActive(href) ? "active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
              {href === "/invitations" && (
                <span
                  className="citylink-workspace-invitations-badge-slot"
                  aria-hidden="true"
                >
                  {badge.unseenCount > 0 && (
                    <span className="citylink-workspace-invitations-dot" />
                  )}
                </span>
              )}
              {href === "/messages" && (
                <span
                  className="citylink-workspace-invitations-badge-slot"
                  aria-hidden="true"
                >
                  {unreadMessages > 0 && (
                    <span className="citylink-workspace-invitations-dot" />
                  )}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="citylink-workspace-sidebar-bottom">
          <section className="citylink-workspace-note">
            <h2>Better, together.</h2>
            <p>Your next great group starts with a hello.</p>
            <Link href="/courses">
              Find your people <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
          <Link href="/about" className="citylink-workspace-about">
            About this demo <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className="citylink-workspace-main-column">
        <header className="citylink-workspace-topbar">
          <div className="citylink-workspace-mobile-brand">
            <Brand small href="/dashboard" />
          </div>
          <Link
            href="/about"
            className="citylink-workspace-mobile-about"
            aria-label="About this demo"
          >
            About
          </Link>
          <div
            className="citylink-workspace-breadcrumb"
            aria-label="Breadcrumb"
          >
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
          </div>
          <div className="citylink-workspace-account">
            <span className="citylink-workspace-account-dot" />
            <span className="citylink-workspace-email">{email}</span>
            <button
              type="button"
              className="citylink-workspace-signout"
              onClick={() => void signOut()}
              disabled={signingOut || !supabaseClient}
            >
              <LogOut size={15} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        {signOutError && (
          <p className="citylink-workspace-signout-error" role="alert">
            {signOutError}
          </p>
        )}
        <div className="citylink-workspace-content">{children}</div>
      </div>
      <nav
        className="citylink-workspace-mobile-nav"
        aria-label="Mobile navigation"
      >
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "active" : ""}
            aria-current={isActive(href) ? "page" : undefined}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label === "My profile" ? "Profile" : label}</span>
            {href === "/invitations" && badge.unseenCount > 0 && (
              <span className="citylink-workspace-invitations-dot" />
            )}
            {href === "/messages" && unreadMessages > 0 && (
              <span className="citylink-workspace-invitations-dot" />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
