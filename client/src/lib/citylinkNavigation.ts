/**
 * My Courses uses a course ID to open the group-management panel.
 * The panel then uses the group's own ID to open the existing chat screen.
 */
export function courseGroupManagementPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`;
}

export function courseGroupsWorkspacePath(courseId: string) {
  return `/my-courses/${encodeURIComponent(courseId)}/groups`;
}

export function groupChatPath(groupId: string) {
  return `/groups/${encodeURIComponent(groupId)}/chat`;
}
