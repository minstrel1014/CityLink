import type {
  CourseGroupSummary,
  GroupCoursePeer,
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

export function getOwnCourseGroup(
  groups: StudyGroupRow[],
  memberships: GroupMembershipRow[],
  courseId: string,
  userId: string
): StudyGroupRow | null {
  const activeMembershipGroupIds = new Set(
    memberships
      .filter(
        membership =>
          membership.course_id === courseId &&
          membership.profile_id === userId &&
          membership.membership_status === "active"
      )
      .map(membership => membership.group_id)
  );
  return (
    groups.find(
      group =>
        group.course_id === courseId &&
        ((group.status === "active" &&
          activeMembershipGroupIds.has(group.id)) ||
          (group.status === "forming" && group.creator_id === userId))
    ) ?? null
  );
}

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

export function filterCoursePeers(
  peers: GroupCoursePeer[],
  search: string,
  filter: "all" | GroupCoursePeer["status"],
  summaryByProfile: ReadonlyMap<string, CourseGroupSummary>
): GroupCoursePeer[] {
  const query = search.trim().toLocaleLowerCase();
  return peers.filter(peer => {
    if (
      filter !== "all" &&
      (summaryByProfile.has(peer.profile_id) || peer.status !== filter)
    )
      return false;
    if (!query) return true;
    return [peer.display_name, peer.student_id ?? "", peer.major ?? ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

export function splitCoursePeersByGroup(
  peers: GroupCoursePeer[],
  summaries: CourseGroupSummary[]
) {
  const summaryByProfile = new Map(
    summaries.map(summary => [summary.profile_id, summary])
  );
  return {
    inGroup: peers.filter(peer => summaryByProfile.has(peer.profile_id)),
    lookingForGroup: peers.filter(
      peer => !summaryByProfile.has(peer.profile_id)
    ),
    summaryByProfile,
  };
}

export type ViewerGroupRelationship = "member" | "requested" | null;

export function getViewerGroupRelationship({
  userId,
  courseId,
  groupId,
  memberships,
  joinRequests,
}: {
  userId: string;
  courseId: string;
  groupId: string;
  memberships: GroupMembershipRow[];
  joinRequests: GroupJoinRequestRow[];
}): ViewerGroupRelationship {
  if (!userId || !courseId || !groupId) return null;
  if (
    memberships.some(
      row =>
        row.profile_id === userId &&
        row.course_id === courseId &&
        row.group_id === groupId &&
        row.membership_status === "active"
    )
  )
    return "member";
  if (
    joinRequests.some(
      row =>
        row.requester_id === userId &&
        row.course_id === courseId &&
        row.group_id === groupId &&
        row.status === "pending"
    )
  )
    return "requested";
  return null;
}

export type JoinActionState =
  | "already-grouped"
  | "not-eligible"
  | "forming-group"
  | "invitation-pending"
  | "request-pending"
  | "request-available";

export function getJoinActionState({
  userHasGroup,
  userStatus,
  group,
  userId,
  invitations,
  joinRequests,
}: {
  userHasGroup: boolean;
  userStatus: GroupCoursePeer["status"];
  group: CourseGroupSummary;
  userId: string;
  invitations: GroupInvitationRow[];
  joinRequests: GroupJoinRequestRow[];
}): JoinActionState {
  if (userHasGroup) return "already-grouped";
  if (!isCoursePeerInviteable(userStatus)) return "not-eligible";
  if (group.group_status !== "active") return "forming-group";
  if (
    invitations.some(
      invitation =>
        invitation.group_id === group.group_id &&
        invitation.recipient_id === userId &&
        invitation.status === "pending"
    )
  ) {
    return "invitation-pending";
  }
  if (
    joinRequests.some(
      request =>
        request.group_id === group.group_id &&
        request.requester_id === userId &&
        request.status === "pending"
    )
  ) {
    return "request-pending";
  }
  return "request-available";
}

export function getInvitationHistoryLabel(
  status: GroupInvitationRow["status"]
): string {
  if (status === "declined") return "Rejected";
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}

export type PeerInvitationState = "sent" | "received" | "connected";

export function getPeerInvitationState(
  userId: string,
  peerId: string,
  courseId: string,
  invitations: GroupInvitationRow[],
  currentlyEligibleForInvitation = false
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
  if (
    !currentlyEligibleForInvitation &&
    related.some(invitation => invitation.status === "accepted")
  ) {
    return "connected";
  }
  return null;
}
