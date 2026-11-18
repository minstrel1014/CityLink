import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { EmptyState } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getGroupWorkflowErrorMessage,
  loadGroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import { supabaseClient } from "@/lib/supabaseClient";
import { activeMemberGroups } from "@/lib/workspaceRouteRules";
import "./GroupWorkflows.css";

type PickerState = "loading" | "ready" | "error" | "signed-out";

export default function GroupChatPicker() {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const [state, setState] = useState<PickerState>("loading");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (session.status !== "ready") {
      setState("loading");
      return () => {
        active = false;
      };
    }
    if (!userId || !supabaseClient) {
      setState("signed-out");
      setGroups([]);
      return () => {
        active = false;
      };
    }
    setState("loading");
    setError("");
    void loadGroupWorkflowSnapshot(userId)
      .then(snapshot => {
        if (!active) return;
        const chats = activeMemberGroups(
          snapshot.groups,
          snapshot.memberships
        ).map(group => ({ id: group.id, name: group.name || "Study group" }));
        setGroups(chats);
        setState("ready");
      })
      .catch(reason => {
        if (!active) return;
        setError(getGroupWorkflowErrorMessage(reason));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [session.status, userId, retry]);

  return (
    <div className="authenticated-courses-page course-detail-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <Link href="/my-courses" className="back-link">
          <ArrowLeft size={17} /> Back to My Courses
        </Link>
        {state === "loading" && (
          <p className="authenticated-courses-state">
            Loading your group chats…
          </p>
        )}
        {state === "signed-out" && (
          <EmptyState
            title="Sign in to open group chat"
            description="Group chat is available to signed-in students who are active members of a study group."
          >
            <div className="authenticated-courses-state-actions">
              <Link href="/" className="primary">
                Go to sign in
              </Link>
            </div>
          </EmptyState>
        )}
        {state === "error" && (
          <EmptyState title="Could not load your groups" description={error}>
            <div className="authenticated-courses-state-actions">
              <button
                type="button"
                className="primary"
                onClick={() => setRetry(value => value + 1)}
              >
                Try again
              </button>
            </div>
          </EmptyState>
        )}
        {state === "ready" && groups.length === 0 && (
          <EmptyState
            title="No group chats yet"
            description="Chats appear here once you are an active member of a study group. Join or create a group first."
          >
            <div className="authenticated-courses-state-actions">
              <Link href="/my-groups" className="primary">
                <MessageCircle size={16} /> My Groups
              </Link>
            </div>
          </EmptyState>
        )}
        {state === "ready" && groups.length > 0 && (
          <section className="group-workflow-panel wide">
            <h2>
              <MessageCircle size={18} /> Choose a group chat
            </h2>
            <div className="group-workflow-list">
              {groups.map(group => (
                <article className="group-workflow-item" key={group.id}>
                  <div className="group-workflow-item-top">
                    <h3>{group.name}</h3>
                  </div>
                  <div className="group-workflow-actions">
                    <Link
                      href={`/groups/${group.id}/chat`}
                      className="secondary"
                    >
                      Open Group Chat <ArrowRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
