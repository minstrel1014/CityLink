import { useEffect, useState } from "react";
import {
  listDirectThreads,
  markDirectThreadRead,
} from "@/lib/supabaseDirectMessages";

/** How often the sidebar re-reads the unread totals while a tab stays open. */
export const DIRECT_MESSAGE_BADGE_POLL_MS = 20000;

type ThreadLike = { unreadCount: number };
type ThreadSummary = ThreadLike & { threadId: string };

/**
 * Total unread direct messages across the account's threads. Negative or
 * non-finite counts are ignored so a malformed row can never light the dot with
 * a nonsense number.
 */
export function sumUnreadCounts(threads: readonly ThreadLike[]): number {
  return threads.reduce(
    (total, thread) =>
      Number.isFinite(thread.unreadCount) && thread.unreadCount > 0
        ? total + thread.unreadCount
        : total,
    0
  );
}

/**
 * Red-dot state for the sidebar Messages link.
 *
 * Mirrors the approved Invitations dot behaviour: it lights up when the account
 * has unread direct messages and goes out once the Messages area is opened.
 * Opening a conversation is what actually marks it read on the server, so the
 * next poll returns zero and the dot stays out.
 */
export function useDirectMessageBadge({
  userId,
  authGeneration,
  refreshKey,
  suppressed,
}: {
  userId: string | null;
  authGeneration: number;
  refreshKey: string;
  suppressed: boolean;
}): number {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    let active = true;
    const load = () => {
      listDirectThreads(userId, undefined, 50)
        .then(result => {
          if (!active) return;
          const threads = (result as { items?: ThreadLike[] }).items ?? [];
          setUnreadCount(sumUnreadCounts(threads));
        })
        .catch(() => {
          // Fail quiet: a dot is decoration, never an authority signal.
        });
    };
    load();
    const timer = window.setInterval(load, DIRECT_MESSAGE_BADGE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authGeneration, refreshKey, suppressed, userId]);

  if (!userId || suppressed) return 0;
  return unreadCount;
}
