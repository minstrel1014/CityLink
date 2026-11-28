import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { EmptyState } from "@/components/citylink/Shared";
import {
  getGroupWorkflowErrorMessage,
  loadGroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import { supabaseClient } from "@/lib/supabaseClient";
import { activeMemberGroups } from "@/lib/workspaceRouteRules";
import "./DirectMessages.css";

type ListState = "loading" | "ready" | "error" | "signed-out";

type GroupThread = { id: string; name: string; memberCount: number };

/**
 * The Groups tab of the Messages hub. Rendered as the same row shape as the
 * Direct tab so both lists read the same way: avatar, name, supporting line.
 */
export default function GroupThreadsList() {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const [state, setState] = useState<ListState>("loading");
  const [groups, setGroups] = useState<GroupThread[]>([]);
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
        ).map(group => ({
          id: group.id,
          name: group.name || "Study group",
          memberCount: snapshot.memberships.filter(
            membership =>
              membership.group_id === group.id &&
              membership.membership_status === "active"
          ).length,
        }));
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

  if (state === "loading") {
    return <p className="dm-muted">Loading your group chats…</p>;
  }

  if (state === "signed-out") {
    return (
      <EmptyState
        title="Sign in to open group chat"
        description="Group chat is available to signed-in students who are active members of a study group."
      >
        <Link href="/" className="dm-link-button">
          Go to sign in
        </Link>
      </EmptyState>
    );
  }

  if (state === "error") {
    return (
      <EmptyState title="Could not load your groups" description={error}>
        <button
          type="button"
          className="dm-more"
          onClick={() => setRetry(value => value + 1)}
        >
          Try again
        </button>
      </EmptyState>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No group chats yet"
        description="Chats appear here once you are an active member of a study group. Join or create a group first."
      >
        <Link href="/courses" className="dm-link-button">
          Browse courses
        </Link>
      </EmptyState>
    );
  }

  return (
    <ul className="dm-thread-list">
      {groups.map(group => (
        <li key={group.id}>
          <Link href={`/groups/${group.id}/chat`} className="dm-thread-row">
            <span className="dm-avatar" aria-hidden="true">
              {(group.name.trim()[0] ?? "G").toUpperCase()}
            </span>
            <span className="dm-thread-text">
              <span className="dm-thread-name">{group.name}</span>
              <span className="dm-thread-preview">
                {group.memberCount === 1
                  ? "1 member"
                  : `${group.memberCount} members`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
