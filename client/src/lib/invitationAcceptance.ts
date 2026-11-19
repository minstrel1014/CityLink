import type { GroupInvitationRow } from "@/lib/supabaseGroups";
import type { InvitationActionCoordinator } from "@/lib/invitationActionCoordinator";

export type InvitationFeedback = {
  tone: "success" | "error";
  message: string;
};

export function canAcceptReceivedInvitation(
  invitation: Pick<GroupInvitationRow, "status" | "recipient_id">,
  readyUserId: string | null
): boolean {
  return Boolean(
    readyUserId &&
      invitation.status === "pending" &&
      invitation.recipient_id === readyUserId
  );
}

export function findAcceptableReceivedInvitation(
  invitations: GroupInvitationRow[],
  invitationId: string,
  readyUserId: string | null
): GroupInvitationRow | null {
  const invitation = invitations.find(item => item.id === invitationId);
  return invitation && canAcceptReceivedInvitation(invitation, readyUserId)
    ? invitation
    : null;
}

export function invitationAcceptanceFeedback(
  status: unknown
): InvitationFeedback {
  if (status === "accepted") {
    return {
      tone: "success",
      message: "You accepted the invitation and joined the group.",
    };
  }
  if (status === "expired") {
    return {
      tone: "error",
      message: "This invitation has expired. You did not join the group.",
    };
  }
  return {
    tone: "error",
    message:
      "The invitation response was not confirmed. Check its latest status before trying again.",
  };
}

/** Discard late results from an old load, identity, or unmounted view. */
export async function refreshInvitationSnapshot<T>({
  generation,
  isCurrent,
  load,
  onLoading,
  onLoaded,
  onError,
}: {
  generation: { current: number };
  isCurrent: () => boolean;
  load: () => Promise<T>;
  onLoading: () => void;
  onLoaded: (snapshot: T) => void;
  onError: (error: unknown) => void;
}): Promise<void> {
  if (!isCurrent()) return;
  const requestGeneration = ++generation.current;
  onLoading();
  try {
    const snapshot = await load();
    if (isCurrent() && generation.current === requestGeneration) {
      onLoaded(snapshot);
    }
  } catch (error) {
    if (isCurrent() && generation.current === requestGeneration) {
      onError(error);
    }
  }
}

/** The guard is set before the first await, and held through the refresh. */
export async function acceptReceivedInvitation({
  userId,
  invitation,
  busy,
  coordinator,
  isCurrent,
  respond,
  errorMessage,
  onFeedback,
}: {
  userId: string | null;
  invitation: GroupInvitationRow;
  busy: { current: boolean };
  coordinator: InvitationActionCoordinator;
  isCurrent: () => boolean;
  respond: (
    userId: string,
    invitationId: string,
    accept: boolean
  ) => Promise<string>;
  errorMessage: (error: unknown) => string;
  onFeedback: (feedback: InvitationFeedback | null) => void;
}): Promise<void> {
  if (
    busy.current ||
    !userId ||
    !isCurrent() ||
    !canAcceptReceivedInvitation(invitation, userId)
  ) {
    return;
  }

  const release = coordinator.tryAcquire(userId, invitation.id);
  if (!release) return;
  busy.current = true;
  try {
    onFeedback(null);
    let feedback: InvitationFeedback;
    try {
      const status = await respond(userId, invitation.id, true);
      feedback = invitationAcceptanceFeedback(status);
    } catch (error) {
      feedback = {
        tone: "error",
        message: `${errorMessage(error)} The outcome may be unconfirmed; check the refreshed status before trying again.`,
      };
    }
    if (isCurrent()) onFeedback(feedback);

    // A failed response may have reached the server. Refresh whichever views
    // are now mounted for this account, even if the initiating view is gone.
    await coordinator.refreshMountedViews(userId);
  } finally {
    busy.current = false;
    release();
  }
}
