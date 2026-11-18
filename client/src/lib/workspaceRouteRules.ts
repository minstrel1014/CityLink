import type { CourseDirectoryScope } from "@/lib/supabaseCourses";
import type {
  GroupJoinRequestRow,
  GroupMembershipRow,
  StudyGroupRow,
} from "@/lib/supabaseGroups";

export type WorkspaceView = "dashboard" | "directory";

export function initialCourseScope(view: WorkspaceView): CourseDirectoryScope {
  return view === "dashboard" ? "mine" : "catalogue";
}

export function courseDetailPath(courseId: string): string {
  return `/courses/${encodeURIComponent(courseId)}`;
}

export function currentTermCourses<T extends { id: string }>(
  courses: T[],
  currentTermCounts: ReadonlyMap<string, number>
): T[] {
  return courses.filter(course => currentTermCounts.has(course.id));
}

export function workspaceSessionMode(
  status: "unconfigured" | "loading" | "ready" | "error",
  userId: string | null | undefined
): "loading" | "error" | "authenticated" | "signed-out" {
  if (status === "loading") return "loading";
  if (status === "error") return "error";
  if (status === "ready" && userId) return "authenticated";
  return "signed-out";
}

export function shouldRedirectToDashboard({
  sessionReady,
  userId,
  authEvent,
  recoveryCallback,
  choosingNewPassword,
}: {
  sessionReady: boolean;
  userId: string | null | undefined;
  authEvent: string | null;
  recoveryCallback: boolean;
  choosingNewPassword: boolean;
}): boolean {
  return Boolean(
    sessionReady &&
      userId &&
      authEvent !== "PASSWORD_RECOVERY" &&
      !recoveryCallback &&
      !choosingNewPassword
  );
}

export function visiblePendingJoinRequests(
  requests: GroupJoinRequestRow[],
  groups: StudyGroupRow[],
  userId: string
): GroupJoinRequestRow[] {
  const groupsCreatedByUser = new Set(
    groups.filter(group => group.creator_id === userId).map(group => group.id)
  );
  return requests.filter(
    request =>
      request.status === "pending" &&
      (request.requester_id === userId ||
        groupsCreatedByUser.has(request.group_id))
  );
}

export function activeMemberGroups(
  groups: StudyGroupRow[],
  memberships: GroupMembershipRow[]
): StudyGroupRow[] {
  const activeGroupIds = new Set(
    memberships
      .filter(membership => membership.membership_status === "active")
      .map(membership => membership.group_id)
  );
  return groups.filter(
    group => group.status === "active" && activeGroupIds.has(group.id)
  );
}
