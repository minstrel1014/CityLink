import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";

export const GROUP_MAXIMUM_OVER_LIMIT_MESSAGE =
  "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.";
export const GROUP_MAXIMUM_TOO_LOW_MESSAGE =
  "Maximum cannot be lower than the current number of active members. Remove members first.";

/** Validation is a convenience; the server makes the authoritative decision. */
export function validateGroupMaximum(
  raw: string,
  activeCount = 0
): {
  value: number | null;
  error: string | null;
} {
  if (activeCount > 19) {
    return { value: null, error: GROUP_MAXIMUM_OVER_LIMIT_MESSAGE };
  }
  const input = raw.trim();
  if (!/^\d+$/.test(input)) {
    return { value: null, error: "Enter a whole number from 2 to 19." };
  }
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 2 || value > 19) {
    return { value: null, error: "Enter a whole number from 2 to 19." };
  }
  if (value < activeCount) {
    return { value: null, error: GROUP_MAXIMUM_TOO_LOW_MESSAGE };
  }
  return { value, error: null };
}

export function getGroupCapacityCount(
  group: Pick<StudyGroupRow, "id" | "status" | "creator_id">,
  members: GroupMembershipRow[]
): number {
  const active = members.filter(
    member =>
      member.group_id === group.id && member.membership_status === "active"
  );
  const missingFormingCreator =
    group.status === "forming" &&
    group.creator_id !== null &&
    !active.some(member => member.profile_id === group.creator_id);
  return active.length + (missingFormingCreator ? 1 : 0);
}

/** A forming creator without active membership may receive only a partial roster. */
export function getVisibleGroupCapacityCount(
  group: Pick<StudyGroupRow, "id" | "status" | "creator_id">,
  members: GroupMembershipRow[],
  userId: string
): number | null {
  const viewerHasActiveMembership = members.some(
    member =>
      member.group_id === group.id &&
      member.profile_id === userId &&
      member.membership_status === "active"
  );
  return viewerHasActiveMembership
    ? getGroupCapacityCount(group, members)
    : null;
}

export function getGroupCapacityState(
  activeCount: number,
  maximum: number | null
) {
  if (activeCount > 19) return "over_limit";
  if (maximum == null) return "maximum_not_set";
  if (activeCount >= maximum) return "full";
  return "available";
}

export function canManageGroupCapacity(
  group: Pick<StudyGroupRow, "id" | "status" | "creator_id">,
  members: GroupMembershipRow[],
  userId: string
): boolean {
  if (group.creator_id !== userId) return false;
  if (group.status === "forming") return true;
  return (
    group.status === "active" &&
    members.some(
      member =>
        member.group_id === group.id &&
        member.profile_id === userId &&
        member.membership_status === "active"
    )
  );
}

export function canRemoveGroupMember(
  group: Pick<StudyGroupRow, "id" | "status" | "creator_id">,
  members: GroupMembershipRow[],
  userId: string,
  member: GroupMembershipRow
): boolean {
  return (
    canManageGroupCapacity(group, members, userId) &&
    member.group_id === group.id &&
    member.membership_status === "active" &&
    member.profile_id !== null &&
    member.profile_id !== userId &&
    member.profile_id !== group.creator_id &&
    getGroupCapacityCount(group, members) > 1
  );
}
