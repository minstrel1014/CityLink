import React from "react";
import type {
  GroupInvitationRow,
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

export interface ActiveGroupsPanelProps {
  groups: StudyGroupRow[];
  courseCode?: string;
  userId: string;
  joinRequests: GroupJoinRequestRow[];
  incomingInvitations: GroupInvitationRow[];
  memberships: GroupMembershipRow[];
  busyAction: string;
  onCancelRequest: (requestId: string) => void;
}

export function ActiveGroupsPanel({
  groups,
  courseCode,
  userId,
  joinRequests,
  incomingInvitations,
  memberships,
  busyAction,
  onCancelRequest,
}: ActiveGroupsPanelProps) {
  return (
    <section className="group-workflow-panel wide">
      <h2>Other active groups in this course</h2>
      <p>
        Other active groups in the selected course are listed below. To find
        groups seeking members, browse this course’s recruitment posts.
      </p>
      {groups.length ? (
        <div className="group-workflow-list">
          {groups.map(group => {
            const pendingRequest = joinRequests.find(
              request =>
                request.group_id === group.id &&
                request.requester_id === userId &&
                request.status === "pending"
            );
            const pendingInvitation = incomingInvitations.find(
              invitation =>
                invitation.group_id === group.id &&
                invitation.status === "pending"
            );
            const alreadyGrouped = memberships.some(
              membership =>
                membership.course_id === group.course_id &&
                membership.membership_status === "active"
            );
            return (
              <article className="group-workflow-item" key={group.id}>
                <div className="group-workflow-item-top">
                  <div>
                    <h3>{group.name || "Study group"}</h3>
                    <p>{courseCode} · Active group</p>
                  </div>
                  <span className="group-workflow-status">Active</span>
                </div>
                <div className="group-workflow-item-bottom">
                  {pendingRequest ? (
                    <span className="member-note">
                      Your join request is pending.
                    </span>
                  ) : pendingInvitation ? (
                    <span className="member-note">
                      You have an invitation to this group; respond to it below.
                    </span>
                  ) : alreadyGrouped ? (
                    <span className="member-note">
                      You already belong to a group for this course.
                    </span>
                  ) : null}
                  <div className="group-workflow-actions">
                    {pendingRequest && (
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Cancel join request to ${group.name || "Study group"}`}
                        disabled={busyAction !== ""}
                        onClick={() => onCancelRequest(pendingRequest.id)}
                      >
                        {busyAction === `cancel-request-${pendingRequest.id}`
                          ? "Cancelling…"
                          : "Cancel request"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="group-workflow-empty">
          <strong>No other active groups are visible in this course.</strong>{" "}
          When another eligible group is active, it will appear here.
        </div>
      )}
    </section>
  );
}
