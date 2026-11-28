import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadGroupWorkflowSnapshot,
  type GroupWorkflowSnapshot,
} from "@/lib/supabaseGroups";
import { visiblePendingJoinRequests } from "@/lib/workspaceRouteRules";

/**
 * Ids the signed-in account has already been shown on the Invitations page in
 * this browser session. Kept in memory only: no web storage, so a manual reload
 * starts a fresh, honest "unseen" state.
 */
const seenByUser = new Map<string, Set<string>>();

function seenFor(userId: string) {
  let set = seenByUser.get(userId);
  if (!set) {
    set = new Set<string>();
    seenByUser.set(userId, set);
  }
  return set;
}

/**
 * Items the Invitations page can act on for this account: pending invitations
 * addressed to it, plus pending join requests for groups it currently leads.
 * The requester's own outgoing requests are excluded because there is nothing
 * to accept or decline there.
 */
export function pendingInvitationItemIds(
  snapshot: GroupWorkflowSnapshot,
  userId: string
): string[] {
  const invitations = snapshot.incomingInvitations
    .filter(
      invitation =>
        invitation.status === "pending" && invitation.recipient_id === userId
    )
    .map(invitation => `invitation:${invitation.id}`);
  const requests = visiblePendingJoinRequests(
    snapshot.joinRequests,
    snapshot.groups,
    userId
  )
    .filter(request => request.requester_id !== userId)
    .map(request => `request:${request.id}`);
  return [...invitations, ...requests];
}

/**
 * Red-dot state for the sidebar Invitations link.
 *
 * Behaviour (b), as approved by Adam on 2026-11-23: the dot lights up when
 * there is at least one actionable item the account has not been shown yet, and
 * goes out once the Invitations page is opened. It does not stay lit until every
 * item is handled.
 */
export function useInvitationBadge({
  userId,
  authGeneration,
  refreshKey,
}: {
  userId: string | null;
  authGeneration: number;
  refreshKey: string;
}) {
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [seenVersion, setSeenVersion] = useState(0);

  useEffect(() => {
    if (!userId) {
      setItemIds([]);
      return;
    }
    let active = true;
    loadGroupWorkflowSnapshot(userId)
      .then(snapshot => {
        if (active) setItemIds(pendingInvitationItemIds(snapshot, userId));
      })
      .catch(() => {
        // Fail quiet: a dot is decoration, never an authority signal.
        if (active) setItemIds([]);
      });
    return () => {
      active = false;
    };
  }, [authGeneration, refreshKey, userId]);

  const unseenCount = useMemo(() => {
    if (!userId) return 0;
    const seen = seenFor(userId);
    return itemIds.filter(id => !seen.has(id)).length;
    // seenVersion is a re-read trigger for the mutable seen set.
  }, [itemIds, seenVersion, userId]);

  const markSeen = useCallback(() => {
    if (!userId || itemIds.length === 0) return;
    const seen = seenFor(userId);
    let changed = false;
    itemIds.forEach(id => {
      if (!seen.has(id)) {
        seen.add(id);
        changed = true;
      }
    });
    if (changed) setSeenVersion(value => value + 1);
  }, [itemIds, userId]);

  return { unseenCount, markSeen };
}
