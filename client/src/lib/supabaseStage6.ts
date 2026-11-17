import { supabaseClient } from "@/lib/supabaseClient";

export const CHAT_PAGE_SIZE = 50;
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const MAX_RECRUITMENT_POST_LENGTH = 2000;

export interface CourseGroupSummary {
  groupId: string;
  groupName: string;
  status: "forming" | "active";
  activeMemberCount: number;
  canCreatePost: boolean;
}

export interface GroupChatAccess {
  canRead: true;
  canSend: boolean;
}

export interface GroupChatMessage {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface GroupChatCursor {
  createdAt: string;
  id: string;
}

export interface CurrentTermGroupMember {
  profileId: string;
  displayName: string;
  major: string | null;
  year: number;
  bio: string;
  skills: string[];
}

export interface GroupRecruitmentPost {
  id: string;
  groupId: string | null;
  groupName: string | null;
  activeMemberCount: number | null;
  authorName: string;
  body: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  applyEnabled: boolean;
  canManage: boolean;
}

type RpcName =
  | "list_current_term_course_groups"
  | "list_current_term_group_members"
  | "get_current_term_group_member_profile"
  | "get_group_chat_access"
  | "list_group_chat_messages"
  | "send_group_chat_message"
  | "list_group_recruitment_posts"
  | "create_group_recruitment_post"
  | "edit_group_recruitment_post"
  | "close_group_recruitment_post";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`The Stage 6 service returned an invalid ${key} value.`);
  }
  return value;
}

function nullableString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(`The Stage 6 service returned an invalid ${key} value.`);
  }
  return value as string | null;
}

function requiredBoolean(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== "boolean") {
    throw new Error(`The Stage 6 service returned an invalid ${key} value.`);
  }
  return value;
}

function requiredCount(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  const count = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The Stage 6 service returned an invalid ${key} value.`);
  }
  return count;
}

function allowOnlyKeys(row: Record<string, unknown>, keys: string[]) {
  if (Object.keys(row).some(key => !keys.includes(key))) {
    throw new Error("The Stage 6 service returned unexpected fields.");
  }
}

function parseRows(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`The ${label} response is invalid.`);
  }
  return value.map(row => {
    if (!isRecord(row)) throw new Error(`The ${label} response is invalid.`);
    return row;
  });
}

async function authenticatedClient(userId: string) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error("Sign in with your CityLink account to use this feature.");
  }
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error("Your sign-in could not be verified. Sign in again.");
  }
  return supabaseClient;
}

async function callRpc<T>(userId: string, name: RpcName, args: object) {
  const client = await authenticatedClient(userId);
  const { data, error } = await client.rpc(name, args as never);
  if (error) throw error;
  return data as T;
}

export function mapCourseGroupSummaries(value: unknown): CourseGroupSummary[] {
  return parseRows(value, "group list").map(row => {
    allowOnlyKeys(row, [
      "group_id",
      "group_name",
      "group_status",
      "active_member_count",
      "can_create_post",
    ]);
    const status = row.group_status;
    if (status !== "forming" && status !== "active") {
      throw new Error("The group list contains an invalid group status.");
    }
    return {
      groupId: requiredString(row, "group_id"),
      groupName: requiredString(row, "group_name"),
      status,
      activeMemberCount: requiredCount(row, "active_member_count"),
      canCreatePost: requiredBoolean(row, "can_create_post"),
    };
  });
}

export function mapGroupChatAccess(value: unknown): GroupChatAccess {
  const rows = parseRows(value, "group chat access");
  const row = rows[0];
  if (!row || rows.length !== 1) {
    throw new Error("You are not authorized to view this group chat.");
  }
  allowOnlyKeys(row, ["can_read", "can_send"]);
  const canRead = requiredBoolean(row, "can_read");
  const canSend = requiredBoolean(row, "can_send");
  if (!canRead)
    throw new Error("You are not authorized to view this group chat.");
  return { canRead: true, canSend };
}

export function mapGroupChatMessages(value: unknown): GroupChatMessage[] {
  return parseRows(value, "group chat messages").map(row => {
    allowOnlyKeys(row, ["message_id", "sender_name", "body", "created_at"]);
    const createdAt = requiredString(row, "created_at");
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new Error("The group chat contains an invalid timestamp.");
    }
    return {
      id: requiredString(row, "message_id"),
      senderName: requiredString(row, "sender_name"),
      body: requiredString(row, "body"),
      createdAt,
    };
  });
}

export function mapCurrentTermGroupMembers(
  value: unknown
): CurrentTermGroupMember[] {
  return parseRows(value, "group member list").map(row => {
    allowOnlyKeys(row, [
      "profile_id",
      "display_name",
      "major",
      "year",
      "bio",
      "skills",
    ]);
    const major = nullableString(row, "major");
    const year = Number(row.year);
    if (!Number.isInteger(year) || year < 1 || year > 12) {
      throw new Error("The member list contains an invalid study year.");
    }
    if (
      typeof row.bio !== "string" ||
      !Array.isArray(row.skills) ||
      !row.skills.every((skill: unknown) => typeof skill === "string")
    ) {
      throw new Error("The member list contains invalid profile details.");
    }
    const skills = row.skills as string[];
    return {
      profileId: requiredString(row, "profile_id"),
      displayName: requiredString(row, "display_name"),
      major,
      year,
      bio: row.bio,
      skills,
    };
  });
}

export function mapGroupRecruitmentPosts(
  value: unknown
): GroupRecruitmentPost[] {
  return parseRows(value, "recruitment post list").map(row => {
    allowOnlyKeys(row, [
      "post_id",
      "group_id",
      "group_name",
      "active_member_count",
      "author_name",
      "body",
      "post_status",
      "created_at",
      "updated_at",
      "closed_at",
      "apply_enabled",
      "can_manage",
    ]);
    const status = row.post_status;
    if (status !== "open" && status !== "closed") {
      throw new Error("The recruitment list contains an invalid post status.");
    }
    const activeMemberCount = row.active_member_count;
    const parsedCount =
      activeMemberCount === null ? null : Number(activeMemberCount);
    if (
      parsedCount !== null &&
      (!Number.isSafeInteger(parsedCount) || parsedCount < 0)
    ) {
      throw new Error("The recruitment list contains an invalid member count.");
    }
    const groupId = nullableString(row, "group_id");
    const groupName = nullableString(row, "group_name");
    if ((groupId === null) !== (groupName === null)) {
      throw new Error(
        "The recruitment list contains incomplete group details."
      );
    }
    const createdAt = requiredString(row, "created_at");
    const updatedAt = requiredString(row, "updated_at");
    const closedAt = nullableString(row, "closed_at");
    if (
      ![createdAt, updatedAt].every(value => Number.isFinite(Date.parse(value)))
    ) {
      throw new Error("The recruitment list contains an invalid timestamp.");
    }
    if (closedAt && !Number.isFinite(Date.parse(closedAt))) {
      throw new Error("The recruitment list contains an invalid close time.");
    }
    return {
      id: requiredString(row, "post_id"),
      groupId,
      groupName,
      activeMemberCount: parsedCount,
      authorName: requiredString(row, "author_name"),
      body: requiredString(row, "body"),
      status,
      createdAt,
      updatedAt,
      closedAt,
      applyEnabled: requiredBoolean(row, "apply_enabled"),
      canManage: requiredBoolean(row, "can_manage"),
    };
  });
}

export async function listCurrentTermCourseGroups(
  userId: string,
  courseId: string
) {
  return mapCourseGroupSummaries(
    await callRpc(userId, "list_current_term_course_groups", {
      p_course_id: courseId,
    })
  );
}

export async function listCurrentTermGroupMembers(
  userId: string,
  groupId: string
) {
  return mapCurrentTermGroupMembers(
    await callRpc(userId, "list_current_term_group_members", {
      p_group_id: groupId,
    })
  );
}

export async function getCurrentTermGroupMemberProfile(
  userId: string,
  groupId: string,
  profileId: string
) {
  const profiles = mapCurrentTermGroupMembers(
    await callRpc(userId, "get_current_term_group_member_profile", {
      p_group_id: groupId,
      p_profile_id: profileId,
    })
  );
  if (profiles.length !== 1 || profiles[0].profileId !== profileId) {
    throw new Error("This coursemate profile is no longer available.");
  }
  return profiles[0];
}

export async function getGroupChatAccess(userId: string, groupId: string) {
  return mapGroupChatAccess(
    await callRpc(userId, "get_group_chat_access", { p_group_id: groupId })
  );
}

export async function listGroupChatMessages(
  userId: string,
  groupId: string,
  before?: GroupChatCursor
) {
  return mapGroupChatMessages(
    await callRpc(userId, "list_group_chat_messages", {
      p_group_id: groupId,
      p_before_created_at: before?.createdAt ?? null,
      p_before_id: before?.id ?? null,
      p_limit: CHAT_PAGE_SIZE,
    })
  );
}

export async function sendGroupChatMessage(
  userId: string,
  groupId: string,
  body: string
) {
  const text = body.trim();
  if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(
      `Messages must be 1–${MAX_CHAT_MESSAGE_LENGTH} characters.`
    );
  }
  const id = await callRpc<unknown>(userId, "send_group_chat_message", {
    p_group_id: groupId,
    p_body: text,
  });
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("The message was not confirmed. Refresh before retrying.");
  }
  return id;
}

export async function listGroupRecruitmentPosts(
  userId: string,
  courseId: string
) {
  return mapGroupRecruitmentPosts(
    await callRpc(userId, "list_group_recruitment_posts", {
      p_course_id: courseId,
    })
  );
}

export async function createGroupRecruitmentPost(
  userId: string,
  groupId: string,
  body: string
) {
  const text = body.trim();
  if (!text || text.length > MAX_RECRUITMENT_POST_LENGTH) {
    throw new Error(
      `Posts must be 1–${MAX_RECRUITMENT_POST_LENGTH} characters.`
    );
  }
  const id = await callRpc<unknown>(userId, "create_group_recruitment_post", {
    p_group_id: groupId,
    p_body: text,
  });
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("The post was not confirmed. Refresh before retrying.");
  }
  return id;
}

export async function editGroupRecruitmentPost(
  userId: string,
  postId: string,
  body: string
) {
  const text = body.trim();
  if (!text || text.length > MAX_RECRUITMENT_POST_LENGTH) {
    throw new Error(
      `Posts must be 1–${MAX_RECRUITMENT_POST_LENGTH} characters.`
    );
  }
  await callRpc(userId, "edit_group_recruitment_post", {
    p_post_id: postId,
    p_body: text,
  });
}

export async function closeGroupRecruitmentPost(
  userId: string,
  postId: string
) {
  await callRpc(userId, "close_group_recruitment_post", { p_post_id: postId });
}

export function getStage6ErrorMessage(error: unknown) {
  const candidate = isRecord(error) ? error : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    error instanceof Error
      ? error.message.toLocaleLowerCase()
      : typeof candidate.message === "string"
        ? candidate.message.toLocaleLowerCase()
        : "";

  if (code === "PGRST202" || code === "42883") {
    return "This feature’s Supabase API is unavailable because its database migration has not been applied. No sample data is being shown; ask the project lead to review and separately approve the Stage 6 migration.";
  }
  if (
    message.includes("not authorized") ||
    message.includes("not active") ||
    message.includes("only active") ||
    code === "42501"
  ) {
    return "Your account is not authorized for this group action. Refresh the page to re-check your current access.";
  }
  if (
    message.includes("authentication required") ||
    message.includes("sign in")
  ) {
    return "Your sign-in could not be verified. Sign in again before using this feature.";
  }
  return "CityLink could not complete this group operation. No change is confirmed. Check your connection and retry.";
}
