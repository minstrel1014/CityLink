import React from "react";
import { canAcceptReceivedInvitation } from "@/lib/invitationAcceptance";
import type { GroupInvitationRow } from "@/lib/supabaseGroups";

export function ReceivedInvitationCard({
  invitation,
  groupName,
  courseCode,
  formattedDate,
  userId,
  busyInvitationId,
  isRefreshing,
  onAccept,
}: {
  invitation: GroupInvitationRow;
  groupName?: string;
  courseCode?: string;
  formattedDate: string;
  userId: string | null;
  busyInvitationId: string | null;
  isRefreshing: boolean;
  onAccept: (invitation: GroupInvitationRow) => void;
}) {
  const displayGroupName = groupName || "Study group invitation";
  return (
    <article className="group-workflow-item">
      <div className="group-workflow-item-top">
        <div>
          <h3>{displayGroupName}</h3>
          <p>
            {courseCode || "Course"} · From {invitation.sender_name_snapshot}
          </p>
        </div>
        <span className={`group-workflow-status ${invitation.status}`}>
          {invitation.status.replaceAll("_", " ")}
        </span>
      </div>
      <p className="authenticated-workspace-date">{formattedDate}</p>
      {canAcceptReceivedInvitation(invitation, userId) && (
        <div className="group-workflow-actions">
          <button
            type="button"
            className="primary"
            aria-label={`Accept invitation to ${displayGroupName} from ${invitation.sender_name_snapshot}`}
            aria-busy={busyInvitationId === invitation.id}
            disabled={busyInvitationId !== null || isRefreshing}
            onClick={() => onAccept(invitation)}
          >
            {busyInvitationId === invitation.id ? "Accepting…" : "Accept"}
          </button>
        </div>
      )}
    </article>
  );
}
