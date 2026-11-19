import React from "react";
import type {
  ApplyBlockReason,
  CapacityState,
  GroupRecruitmentPost,
} from "@/lib/supabaseStage6";
import "./Stage6Capacity.css";

const capacityLabels: Record<CapacityState, string> = {
  available: "Space available",
  full: "Group is full",
  maximum_not_set: "Group maximum is not set",
  over_limit:
    "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.",
};

const applyBlockLabels: Record<ApplyBlockReason, string> = {
  group_full: "Group is full",
  maximum_not_set: "Group maximum is not set",
  group_over_limit: capacityLabels.over_limit,
  post_closed: "This post is closed.",
  group_inactive: "This group is no longer available.",
  already_member: "You already belong to a group for this course and term.",
  pending_invitation: "You already have a pending invitation to this group.",
  pending_request: "You already have a pending request to join this group.",
  profile_unavailable:
    "Your profile is not currently available to join a group.",
  not_eligible: "You cannot apply to this group right now.",
};

export function Stage6CapacityCount({
  count,
  maximum,
}: {
  count: number;
  maximum: number | null;
}) {
  return (
    <span>
      {maximum === null
        ? `${count} ${count === 1 ? "member" : "members"} · Maximum not set`
        : `${count} / ${maximum} members`}
    </span>
  );
}

export function Stage6CapacityStatus({ state }: { state: CapacityState }) {
  return (
    <p className={`stage6-readonly-note stage6-capacity-status ${state}`}>
      {capacityLabels[state]}
    </p>
  );
}

// The RPC is authoritative. This guard only prevents submitting a post the
// current response already marked as blocked; the server must recheck races.
export function canApplyToRecruitmentPost(post: GroupRecruitmentPost) {
  return (
    post.status === "open" &&
    !!post.groupId &&
    post.applyEnabled &&
    post.applyBlockReason === null &&
    post.capacityState === "available"
  );
}

export function Stage6ApplyControl({
  post,
  busy,
  applying,
  onApply,
  onRefresh,
}: {
  post: GroupRecruitmentPost;
  busy: boolean;
  applying: boolean;
  onApply: () => void;
  onRefresh?: () => void;
}) {
  const canApply = canApplyToRecruitmentPost(post);
  const reasonId = `apply-block-reason-${post.id}`;
  return (
    <div className="stage6-apply-control">
      {post.applyBlockReason !== null && (
        <p id={reasonId} className="stage6-readonly-note">
          {applyBlockLabels[post.applyBlockReason]}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={!canApply || busy}
        aria-describedby={post.applyBlockReason !== null ? reasonId : undefined}
        onClick={() => {
          if (!busy && canApplyToRecruitmentPost(post)) onApply();
        }}
      >
        {applying ? "Sending request…" : "Apply to join"}
      </button>
      {onRefresh &&
        (post.applyBlockReason === "group_full" ||
          post.applyBlockReason === "maximum_not_set" ||
          post.applyBlockReason === "group_over_limit") && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onRefresh}
          >
            Refresh group status
          </button>
        )}
    </div>
  );
}
