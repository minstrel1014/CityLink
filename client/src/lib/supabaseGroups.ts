import { supabaseClient } from "@/lib/supabaseClient";

export interface GroupCoursePeer {
  profile_id: string;
  student_id: string | null;
  display_name: string;
  major: string | null;
  year: number;
  bio: string;
  skills: string[];
  status: "open" | "considering" | "full";
}

export interface CourseGroupSummary {
  profile_id: string;
  group_id: string;
  group_name: string;
  group_status: "forming" | "active";
  group_size: number;
}

export interface OwnCourseProfile {
  id: string;
  display_name: string;
  status: "open" | "considering" | "full";
}

export interface StudyGroupRow {
  id: string;
  course_id: string;
  creator_id: string | null;
  status: "forming" | "active" | "abandoned" | "archived";
  name: string;
  created_at: string;
}

export interface GroupMembershipRow {
  id: string;
  group_id: string;
  course_id: string;
  profile_id: string | null;
  display_name_snapshot: string;
  membership_status: "active" | "left" | "removed" | "account_deleted";
  joined_at: string;
}

export interface GroupInvitationRow {
  id: string;
  group_id: string;
  course_id: string;
  sender_id: string | null;
  recipient_id: string | null;
  sender_name_snapshot: string;
  recipient_name_snapshot: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
}

export interface GroupJoinRequestRow {
  id: string;
  group_id: string;
  course_id: string;
  requester_id: string | null;
  requester_name_snapshot: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  created_at: string;
}

export interface GroupWorkflowSnapshot {
  groups: StudyGroupRow[];
  memberships: GroupMembershipRow[];
  incomingInvitations: GroupInvitationRow[];
  outgoingInvitations: GroupInvitationRow[];
  joinRequests: GroupJoinRequestRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The group service returned an invalid ${key} value.`);
  }
  return value;
}

export function mapGroupCoursePeers(value: unknown): GroupCoursePeer[] {
  if (!Array.isArray(value)) {
    throw new Error("The coursemate list response is invalid.");
  }

  return value.map(candidate => {
    if (!isRecord(candidate)) {
      throw new Error("The coursemate list contains an invalid record.");
    }
    const status = candidate.status;
    if (status !== "open" && status !== "considering" && status !== "full") {
      throw new Error(
        "The coursemate list contains an invalid availability status."
      );
    }
    const rawYear = candidate.year;
    const year = typeof rawYear === "number" ? rawYear : Number(rawYear);
    if (!Number.isInteger(year) || year < 1 || year > 12) {
      throw new Error("The coursemate list contains an invalid study year.");
    }
    const rawStudentId = candidate.student_id;
    const rawMajor = candidate.major;
    const rawBio = candidate.bio;
    const rawSkills = candidate.skills;
    if (rawStudentId !== null && typeof rawStudentId !== "string") {
      throw new Error("The coursemate list contains an invalid student ID.");
    }
    if (rawMajor !== null && typeof rawMajor !== "string") {
      throw new Error("The coursemate list contains an invalid major.");
    }
    if (typeof rawBio !== "string" || !Array.isArray(rawSkills)) {
      throw new Error("The coursemate list contains invalid profile details.");
    }

    return {
      profile_id: requiredString(candidate, "profile_id"),
      student_id: rawStudentId,
      display_name: requiredString(candidate, "display_name"),
      major: rawMajor,
      year,
      bio: rawBio,
      skills: rawSkills.filter(
        (skill): skill is string => typeof skill === "string"
      ),
      status,
    };
  });
}

export function mapCourseInviteCandidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("The invitation eligibility response is invalid.");
  }

  const profileIds = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      throw new Error("The invitation eligibility response is invalid.");
    }
    if (Object.keys(candidate).some(key => key !== "profile_id")) {
      throw new Error("The invitation eligibility response is invalid.");
    }
    const profileId = requiredString(candidate, "profile_id");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        profileId
      )
    ) {
      throw new Error("The invitation eligibility profile_id is invalid.");
    }
    profileIds.add(profileId);
  }
  return [...profileIds];
}

export function mapCourseGroupSummaries(value: unknown): CourseGroupSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("The coursemate group-summary response is invalid.");
  }

  const byProfile = new Map<string, CourseGroupSummary>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        key =>
          ![
            "profile_id",
            "group_id",
            "group_name",
            "group_status",
            "group_size",
          ].includes(key)
      )
    ) {
      throw new Error("The coursemate group-summary response is invalid.");
    }
    const profileId = requiredString(candidate, "profile_id");
    const groupId = requiredString(candidate, "group_id");
    const groupName = candidate.group_name;
    const groupStatus = candidate.group_status;
    const rawGroupSize = candidate.group_size;
    const groupSize =
      typeof rawGroupSize === "number"
        ? rawGroupSize
        : typeof rawGroupSize === "string" && /^\d+$/.test(rawGroupSize)
          ? Number(rawGroupSize)
          : Number.NaN;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        profileId
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        groupId
      ) ||
      typeof groupName !== "string" ||
      (groupStatus !== "forming" && groupStatus !== "active") ||
      !Number.isSafeInteger(groupSize) ||
      groupSize < 1 ||
      byProfile.has(profileId)
    ) {
      throw new Error(
        "The coursemate group-summary response contains invalid data."
      );
    }
    byProfile.set(profileId, {
      profile_id: profileId,
      group_id: groupId,
      group_name: groupName,
      group_status: groupStatus,
      group_size: groupSize,
    });
  }
  return [...byProfile.values()];
}

export function mapOwnCourseProfile(
  value: unknown,
  expectedUserId: string
): OwnCourseProfile {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      key => !["id", "display_name", "status"].includes(key)
    )
  ) {
    throw new Error("Your course profile response is invalid.");
  }
  const id = requiredString(value, "id");
  const displayName = requiredString(value, "display_name");
  const status = value.status;
  if (
    id !== expectedUserId ||
    (status !== "open" && status !== "considering" && status !== "full")
  ) {
    throw new Error(
      "Your course profile did not match your signed-in account."
    );
  }
  return { id, display_name: displayName, status };
}

export function mapActiveGroupMemberships(
  value: unknown
): GroupMembershipRow[] {
  if (!Array.isArray(value)) {
    throw new Error("The group member list response is invalid.");
  }
  return value.map(candidate => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        key =>
          ![
            "id",
            "group_id",
            "course_id",
            "profile_id",
            "display_name_snapshot",
            "membership_status",
            "joined_at",
          ].includes(key)
      )
    ) {
      throw new Error("The group member list response is invalid.");
    }
    const profileId = candidate.profile_id;
    if (
      candidate.membership_status !== "active" ||
      (profileId !== null && typeof profileId !== "string")
    ) {
      throw new Error(
        "The group member list contains invalid membership data."
      );
    }
    return {
      id: requiredString(candidate, "id"),
      group_id: requiredString(candidate, "group_id"),
      course_id: requiredString(candidate, "course_id"),
      profile_id: profileId,
      display_name_snapshot: requiredString(candidate, "display_name_snapshot"),
      membership_status: "active",
      joined_at: requiredString(candidate, "joined_at"),
    };
  });
}

async function verifyCurrentUser(userId: string) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error(
      "Sign in with a Supabase account before using group features."
    );
  }
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error(
      "Your sign-in could not be verified. Sign in again before continuing."
    );
  }
  return supabaseClient;
}

export async function listCourseGroupPeers(userId: string, courseId: string) {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client.rpc("list_course_classmates", {
    p_course_id: courseId,
  });
  if (error) throw error;
  return mapGroupCoursePeers(data ?? []);
}

export async function listCourseGroupInviteCandidates(
  userId: string,
  courseId: string
) {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client.rpc(
    "list_course_group_invite_candidates",
    { p_course_id: courseId }
  );
  if (error) throw error;
  return mapCourseInviteCandidateIds(data ?? []);
}

export async function listCourseGroupSummaries(
  userId: string,
  courseId: string
): Promise<CourseGroupSummary[]> {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client.rpc("list_course_group_summaries", {
    p_course_id: courseId,
  });
  if (error) throw error;
  return mapCourseGroupSummaries(data ?? []);
}

export async function loadOwnCourseProfile(
  userId: string
): Promise<OwnCourseProfile> {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return mapOwnCourseProfile(data, userId);
}

export async function listActiveGroupMembers(
  userId: string,
  groupId: string
): Promise<GroupMembershipRow[]> {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client
    .from("group_memberships")
    .select(
      "id, group_id, course_id, profile_id, display_name_snapshot, membership_status, joined_at"
    )
    .eq("group_id", groupId)
    .eq("membership_status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return mapActiveGroupMemberships(data ?? []);
}

export async function loadGroupWorkflowSnapshot(
  userId: string
): Promise<GroupWorkflowSnapshot> {
  const client = await verifyCurrentUser(userId);
  const [groups, memberships, incoming, outgoing, requests] = await Promise.all(
    [
      client
        .from("study_groups")
        .select("id, course_id, creator_id, status, name, created_at")
        .order("created_at", { ascending: false }),
      client
        .from("group_memberships")
        .select(
          "id, group_id, course_id, profile_id, display_name_snapshot, membership_status, joined_at"
        )
        .eq("profile_id", userId)
        .order("joined_at", { ascending: false }),
      client
        .from("group_invitations")
        .select(
          "id, group_id, course_id, sender_id, recipient_id, sender_name_snapshot, recipient_name_snapshot, status, created_at"
        )
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("group_invitations")
        .select(
          "id, group_id, course_id, sender_id, recipient_id, sender_name_snapshot, recipient_name_snapshot, status, created_at"
        )
        .eq("sender_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("group_join_requests")
        .select(
          "id, group_id, course_id, requester_id, requester_name_snapshot, status, created_at"
        )
        .order("created_at", { ascending: false }),
    ]
  );

  if (groups.error) throw groups.error;
  if (memberships.error) throw memberships.error;
  if (incoming.error) throw incoming.error;
  if (outgoing.error) throw outgoing.error;
  if (requests.error) throw requests.error;

  return {
    groups: (groups.data ?? []) as StudyGroupRow[],
    memberships: (memberships.data ?? []) as GroupMembershipRow[],
    incomingInvitations: (incoming.data ?? []) as GroupInvitationRow[],
    outgoingInvitations: (outgoing.data ?? []) as GroupInvitationRow[],
    joinRequests: (requests.data ?? []) as GroupJoinRequestRow[],
  };
}

async function callGroupRpc<T>(
  userId: string,
  name:
    | "create_group_and_invite"
    | "send_group_invitation"
    | "respond_to_group_invitation"
    | "cancel_group_invitation"
    | "request_to_join_group"
    | "review_group_join_request"
    | "cancel_group_join_request"
    | "rename_study_group",
  args: Record<string, unknown>
): Promise<T> {
  const client = await verifyCurrentUser(userId);
  const { data, error } = await client.rpc(name, args as never);
  if (error) throw error;
  return data as T;
}

export interface CreatedGroupAndInvitation {
  group_id: string;
  invitation_id: string;
}

export async function createGroupAndInvite(
  userId: string,
  courseId: string,
  recipientId: string,
  name: string
): Promise<CreatedGroupAndInvitation> {
  const rows = await callGroupRpc<CreatedGroupAndInvitation[]>(
    userId,
    "create_group_and_invite",
    {
      p_course_id: courseId,
      p_recipient_id: recipientId,
      p_name: name.trim(),
    }
  );
  const created = rows?.[0];
  if (!created?.group_id || !created?.invitation_id) {
    throw new Error(
      "CityLink did not return the new group and invitation IDs. Refresh before trying again."
    );
  }
  return created;
}

export function sendGroupInvitation(
  userId: string,
  groupId: string,
  recipientId: string
) {
  return callGroupRpc<string>(userId, "send_group_invitation", {
    p_group_id: groupId,
    p_recipient_id: recipientId,
  });
}

export function respondToGroupInvitation(
  userId: string,
  invitationId: string,
  accept: boolean
) {
  return callGroupRpc<string>(userId, "respond_to_group_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
}

export function cancelGroupInvitation(userId: string, invitationId: string) {
  return callGroupRpc<void>(userId, "cancel_group_invitation", {
    p_invitation_id: invitationId,
  });
}

export function renameStudyGroup(
  userId: string,
  groupId: string,
  name: string
) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 50) {
    return Promise.reject(
      new Error("Group names must contain between 1 and 50 characters.")
    );
  }
  return callGroupRpc<void>(userId, "rename_study_group", {
    p_group_id: groupId,
    p_name: normalizedName,
  });
}

export function requestToJoinGroup(userId: string, groupId: string) {
  return callGroupRpc<string>(userId, "request_to_join_group", {
    p_group_id: groupId,
  });
}

export function reviewGroupJoinRequest(
  userId: string,
  requestId: string,
  approve: boolean
) {
  return callGroupRpc<string>(userId, "review_group_join_request", {
    p_request_id: requestId,
    p_approve: approve,
  });
}

export function cancelGroupJoinRequest(userId: string, requestId: string) {
  return callGroupRpc<void>(userId, "cancel_group_join_request", {
    p_request_id: requestId,
  });
}

export function getGroupWorkflowErrorMessage(error: unknown): string {
  const candidate = isRecord(error) ? error : {};
  const rawMessage =
    typeof candidate.message === "string"
      ? candidate.message
      : error instanceof Error
        ? error.message
        : "";
  const message = rawMessage.toLocaleLowerCase();

  if (message.includes("already has a pending join request for this group")) {
    return "This person already asked to join this group. Their request is the first pending action, so send no invitation; the group leader should review that request.";
  }
  if (message.includes("already have a pending invitation to this group")) {
    return "You already have an invitation to this group. That invitation is the first pending action, so respond to it instead of sending a join request.";
  }
  if (message.includes("both students must be enrolled")) {
    return "You and the selected classmate must both be enrolled in this course.";
  }
  if (message.includes("recipient is not accepting invitations")) {
    return "This classmate is not currently accepting group invitations.";
  }
  if (
    message.includes("already belong") ||
    message.includes("already belongs")
  ) {
    return "A student involved already belongs to a group for this course and term. Refresh the group page to see the current status.";
  }
  if (message.includes("only the current group leader")) {
    return "Only the current active group leader can review this request. Refresh the page to update your access.";
  }
  if (message.includes("only the recipient may respond")) {
    return "Only the invited student can accept or decline this invitation.";
  }
  if (message.includes("only the sender may cancel")) {
    return "Only the student who sent this invitation can cancel it.";
  }
  if (message.includes("only the requester may cancel")) {
    return "Only the student who sent this join request can cancel it.";
  }
  if (message.includes("no longer pending")) {
    return "This item is no longer pending. Refresh the page to see its latest status.";
  }
  if (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    candidate.code === "42501"
  ) {
    return "Your account is not permitted to complete that action. Refresh the page; if the issue continues, contact the project owner.";
  }
  if (
    message.includes("authentication required") ||
    message.includes("sign-in")
  ) {
    return "Your sign-in could not be verified. Sign in again before using group features.";
  }
  return "CityLink could not complete that group action. Your request was not confirmed; refresh and try again.";
}
