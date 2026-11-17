import type {
  GroupCoursePeer,
  GroupInvitationRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

export function getCourseInviteGroups(
  groups: StudyGroupRow[],
  memberships: GroupMembershipRow[],
  courseId: string,
  userId: string
): StudyGroupRow[] {
  const activeMembershipGroupIds = new Set(
    memberships
      .filter(
        membership =>
          membership.profile_id === userId &&
          membership.membership_status === "active"
      )
      .map(membership => membership.group_id)
  );

  return groups.filter(
    group =>
      group.course_id === courseId &&
      (group.status === "active" || group.status === "forming") &&
      (activeMembershipGroupIds.has(group.id) ||
        (group.status === "forming" && group.creator_id === userId))
  );
}

export function isCoursePeerInviteable(
  status: GroupCoursePeer["status"]
): boolean {
  return status === "open" || status === "considering";
}

export type PeerInvitationState = "sent" | "received" | "connected";

export function getPeerInvitationState(
  userId: string,
  peerId: string,
  courseId: string,
  invitations: GroupInvitationRow[]
): PeerInvitationState | null {
  const related = invitations.filter(
    invitation =>
      invitation.course_id === courseId &&
      ((invitation.sender_id === userId &&
        invitation.recipient_id === peerId) ||
        (invitation.sender_id === peerId && invitation.recipient_id === userId))
  );

  if (
    related.some(
      invitation =>
        invitation.sender_id === peerId && invitation.status === "pending"
    )
  ) {
    return "received";
  }
  if (
    related.some(
      invitation =>
        invitation.sender_id === userId && invitation.status === "pending"
    )
  ) {
    return "sent";
  }
  if (related.some(invitation => invitation.status === "accepted")) {
    return "connected";
  }
  return null;
}
