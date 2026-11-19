import React from "react";
import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";
import { canRemoveGroupMember } from "./groupCapacity";

export function GroupMemberRemoval({
  group,
  members,
  userId,
  member,
  busy,
  removing,
  onRemove,
}: {
  group: StudyGroupRow;
  members: GroupMembershipRow[];
  userId: string;
  member: GroupMembershipRow;
  busy: boolean;
  removing: boolean;
  onRemove: (member: GroupMembershipRow) => void;
}) {
  if (!canRemoveGroupMember(group, members, userId, member)) return null;
  return (
    <button
      type="button"
      className="text-button my-group-remove-member"
      disabled={busy}
      aria-label={`Remove ${member.display_name_snapshot} from group`}
      onClick={() => {
        if (busy) return;
        if (
          window.confirm(
            `Remove ${member.display_name_snapshot} from this group? Their pending invitations sent to others will be cancelled. No one will be approved automatically.`
          )
        ) {
          onRemove(member);
        }
      }}
    >
      {removing ? "Removing…" : "Remove"}
    </button>
  );
}
