import { supabaseClient } from "@/lib/supabaseClient";

export const CHAT_PAGE_SIZE = 50;
export const COURSE_GROUPS_PAGE_SIZE = 25;
export const GROUP_MEMBERS_PAGE_SIZE = 50;
export const RECRUITMENT_POSTS_PAGE_SIZE = 20;
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const MAX_RECRUITMENT_POST_LENGTH = 2000;

export interface PageResult<T, C> {
  items: T[];
  hasMore: boolean;
  nextCursor: C | null;
}

export type CapacityState =
  | "available"
  | "full"
  | "maximum_not_set"
  | "over_limit";

export type ApplyBlockReason =
  | "group_full"
  | "maximum_not_set"
  | "group_over_limit"
  | "post_closed"
  | "group_inactive"
  | "already_member"
  | "pending_invitation"
  | "pending_request"
  | "profile_unavailable"
  | "not_eligible";

export interface CourseGroupSummary {
  groupId: string;
  groupName: string;
  status: "forming" | "active";
  activeMemberCount: number;
  maxMembers: number | null;
  capacityCount: number;
  capacityState: CapacityState;
  canCreatePost: boolean;
}

export interface CourseGroupCursor {
  groupName: string;
  groupId: string;
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
  cursorJoinedAt?: string;
  cursorMembershipId?: string;
}

export interface UngroupedCoursemate {
  profileId: string;
  displayName: string;
  year: number;
  major: string | null;
  skills: string[];
}

export interface UngroupedCoursemateCursor {
  displayName: string;
  profileId: string;
}

export interface CoursemateProfile {
  profileId: string;
  displayName: string;
  major: string | null;
  year: number;
  bio: string;
  skills: string[];
}

export interface GroupMemberCursor {
  joinedAt: string;
  membershipId: string;
}

export interface GroupRecruitmentPost {
  id: string;
  groupId: string | null;
  groupName: string | null;
  activeMemberCount: number | null;
  maxMembers: number | null;
  capacityCount: number | null;
  capacityState: CapacityState | null;
  authorName: string;
  subject: string;
  body: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  applyEnabled: boolean;
  applyBlockReason: ApplyBlockReason | null;
  canManage: boolean;
}

export interface RecruitmentPostCursor {
  createdAt: string;
  id: string;
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
  | "close_group_recruitment_post"
  | "list_course_ungrouped_classmates"
  | "get_current_term_coursemate_profile";

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

// Groups created by Stage 5 have no name, so an empty string is valid here.
// Keep the raw value because it is also the pagination cursor.
function optionalGroupName(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
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
  const count =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The Stage 6 service returned an invalid ${key} value.`);
  }
  return count;
}

function mapVisibleCapacity(row: Record<string, unknown>) {
  const activeMemberCount = requiredCount(row, "active_member_count");
  const capacityCount = requiredCount(row, "capacity_count");
  const maxMembers =
    row.max_members === null ? null : requiredCount(row, "max_members");
  if (maxMembers !== null && (maxMembers < 2 || maxMembers > 19)) {
    throw new Error(
      "The Stage 6 service returned an invalid max_members value."
    );
  }
  const capacityState = row.capacity_state;
  const expectedState: CapacityState =
    capacityCount > 19
      ? "over_limit"
      : maxMembers === null
        ? "maximum_not_set"
        : capacityCount >= maxMembers
          ? "full"
          : "available";
  if (activeMemberCount !== capacityCount || capacityState !== expectedState) {
    throw new Error("The Stage 6 service returned inconsistent capacity data.");
  }
  return {
    activeMemberCount,
    capacityCount,
    maxMembers,
    capacityState: expectedState,
  };
}

const applyBlockReasons: readonly ApplyBlockReason[] = [
  "group_full",
  "maximum_not_set",
  "group_over_limit",
  "post_closed",
  "group_inactive",
  "already_member",
  "pending_invitation",
  "pending_request",
  "profile_unavailable",
  "not_eligible",
];

function mapApplyBlockReason(
  row: Record<string, unknown>
): ApplyBlockReason | null {
  const reason = row.apply_block_reason;
  if (reason === null) return null;
  if (
    typeof reason !== "string" ||
    !applyBlockReasons.includes(reason as ApplyBlockReason)
  ) {
    throw new Error(
      "The recruitment list contains an invalid application block reason."
    );
  }
  return reason as ApplyBlockReason;
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

function pageHasMore(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return false;
  const hasMore = requiredBoolean(rows[0], "has_more");
  if (rows.some(row => row.has_more !== hasMore)) {
    throw new Error("The Stage 6 page contains inconsistent pagination data.");
  }
  return hasMore;
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

export function mapCourseGroupSummaries(
  value: unknown
): PageResult<CourseGroupSummary, CourseGroupCursor> {
  const rows = parseRows(value, "group list");
  const hasMore = pageHasMore(rows);
  const items = rows.map(row => {
    allowOnlyKeys(row, [
      "group_id",
      "group_name",
      "group_status",
      "active_member_count",
      "max_members",
      "capacity_count",
      "capacity_state",
      "can_create_post",
      "has_more",
    ]);
    const status = row.group_status;
    if (status !== "forming" && status !== "active") {
      throw new Error("The group list contains an invalid group status.");
    }
    return {
      groupId: requiredString(row, "group_id"),
      groupName: optionalGroupName(row, "group_name"),
      status: status as CourseGroupSummary["status"],
      ...mapVisibleCapacity(row),
      canCreatePost: requiredBoolean(row, "can_create_post"),
    };
  });
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: last
      ? { groupName: last.groupName, groupId: last.groupId }
      : null,
  };
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
): PageResult<CurrentTermGroupMember, GroupMemberCursor> {
  const rows = parseRows(value, "group member list");
  const hasMore = pageHasMore(rows);
  const items = rows.map(row => {
    allowOnlyKeys(row, [
      "profile_id",
      "display_name",
      "major",
      "year",
      "bio",
      "skills",
      "cursor_joined_at",
      "cursor_membership_id",
      "has_more",
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
      cursorJoinedAt: requiredString(row, "cursor_joined_at"),
      cursorMembershipId: requiredString(row, "cursor_membership_id"),
    };
  });
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor:
      last?.cursorJoinedAt && last.cursorMembershipId
        ? {
            joinedAt: last.cursorJoinedAt,
            membershipId: last.cursorMembershipId,
          }
        : null,
  };
}

function mapCurrentTermGroupMemberProfiles(value: unknown) {
  return parseRows(value, "group member profile").map(row => {
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
      throw new Error("The member profile contains an invalid study year.");
    }
    if (
      typeof row.bio !== "string" ||
      !Array.isArray(row.skills) ||
      !row.skills.every((skill: unknown) => typeof skill === "string")
    ) {
      throw new Error("The member profile contains invalid profile details.");
    }
    return {
      profileId: requiredString(row, "profile_id"),
      displayName: requiredString(row, "display_name"),
      major,
      year,
      bio: row.bio,
      skills: row.skills as string[],
    };
  });
}

export function mapGroupRecruitmentPosts(
  value: unknown
): PageResult<GroupRecruitmentPost, RecruitmentPostCursor> {
  const rows = parseRows(value, "recruitment post list");
  const hasMore = pageHasMore(rows);
  const items = rows.map(row => {
    allowOnlyKeys(row, [
      "post_id",
      "group_id",
      "group_name",
      "active_member_count",
      "max_members",
      "capacity_count",
      "capacity_state",
      "author_name",
      "subject",
      "body",
      "post_status",
      "created_at",
      "updated_at",
      "closed_at",
      "apply_enabled",
      "apply_block_reason",
      "can_manage",
      "has_more",
    ]);
    const status = row.post_status;
    if (status !== "open" && status !== "closed") {
      throw new Error("The recruitment list contains an invalid post status.");
    }
    const groupId = nullableString(row, "group_id");
    const rawGroupName = nullableString(row, "group_name");
    const groupName =
      rawGroupName === null || rawGroupName.trim()
        ? rawGroupName
        : "Study group";
    if (
      (groupId === null) !== (groupName === null) ||
      (groupId !== null && !groupId.trim())
    ) {
      throw new Error(
        "The recruitment list contains incomplete group details."
      );
    }
    const applyEnabled = requiredBoolean(row, "apply_enabled");
    const applyBlockReason = mapApplyBlockReason(row);
    if (applyEnabled !== (applyBlockReason === null)) {
      throw new Error(
        "The recruitment list contains inconsistent application data."
      );
    }
    let capacity: {
      activeMemberCount: number | null;
      maxMembers: number | null;
      capacityCount: number | null;
      capacityState: CapacityState | null;
    };
    if (groupId === null) {
      if (
        row.active_member_count !== null ||
        row.max_members !== null ||
        row.capacity_count !== null ||
        row.capacity_state !== null ||
        applyBlockReason !== "group_inactive"
      ) {
        throw new Error(
          "The recruitment list contains incomplete group redaction."
        );
      }
      capacity = {
        activeMemberCount: null,
        maxMembers: null,
        capacityCount: null,
        capacityState: null,
      };
    } else {
      capacity = mapVisibleCapacity(row);
      const capacityReason: Partial<Record<CapacityState, ApplyBlockReason>> = {
        full: "group_full",
        maximum_not_set: "maximum_not_set",
        over_limit: "group_over_limit",
      };
      const expectedReason =
        status === "closed"
          ? "post_closed"
          : capacityReason[capacity.capacityState!];
      if (
        (expectedReason && applyBlockReason !== expectedReason) ||
        (!expectedReason &&
          (applyBlockReason === "post_closed" ||
            applyBlockReason === "group_inactive" ||
            applyBlockReason === "group_full" ||
            applyBlockReason === "maximum_not_set" ||
            applyBlockReason === "group_over_limit"))
      ) {
        throw new Error(
          "The recruitment list contains inconsistent application data."
        );
      }
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
      ...capacity,
      authorName: requiredString(row, "author_name"),
      subject: requiredString(row, "subject"),
      body: requiredString(row, "body"),
      status: status as GroupRecruitmentPost["status"],
      createdAt,
      updatedAt,
      closedAt,
      applyEnabled,
      applyBlockReason,
      canManage: requiredBoolean(row, "can_manage"),
    };
  });
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function listCurrentTermCourseGroups(
  userId: string,
  courseId: string,
  after?: CourseGroupCursor
) {
  return mapCourseGroupSummaries(
    await callRpc(userId, "list_current_term_course_groups", {
      p_course_id: courseId,
      p_after_group_name: after?.groupName ?? null,
      p_after_group_id: after?.groupId ?? null,
      p_limit: COURSE_GROUPS_PAGE_SIZE,
    })
  );
}

export async function listCurrentTermGroupMembers(
  userId: string,
  groupId: string,
  after?: GroupMemberCursor
) {
  return mapCurrentTermGroupMembers(
    await callRpc(userId, "list_current_term_group_members", {
      p_group_id: groupId,
      p_after_joined_at: after?.joinedAt ?? null,
      p_after_membership_id: after?.membershipId ?? null,
      p_limit: GROUP_MEMBERS_PAGE_SIZE,
    })
  );
}

export async function getCurrentTermGroupMemberProfile(
  userId: string,
  groupId: string,
  profileId: string
) {
  const profiles = mapCurrentTermGroupMemberProfiles(
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
  courseId: string,
  after?: RecruitmentPostCursor
) {
  return mapGroupRecruitmentPosts(
    await callRpc(userId, "list_group_recruitment_posts", {
      p_course_id: courseId,
      p_after_created_at: after?.createdAt ?? null,
      p_after_id: after?.id ?? null,
      p_limit: RECRUITMENT_POSTS_PAGE_SIZE,
    })
  );
}

export async function createGroupRecruitmentPost(
  userId: string,
  groupId: string,
  subject: string,
  body: string,
  shouldDispatch: () => boolean = () => true
) {
  const title = subject.trim();
  const text = body.trim();
  if (!title || title.length > 120) {
    throw new Error("Subjects must be 1–120 characters.");
  }
  if (!text || text.length > MAX_RECRUITMENT_POST_LENGTH) {
    throw new Error(
      `Posts must be 1–${MAX_RECRUITMENT_POST_LENGTH} characters.`
    );
  }
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error("Sign in with your CityLink account to use this feature.");
  }

  // Verify the captured token, not the shared client's potentially newer session.
  let accessToken: string;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (error || typeof token !== "string" || !token.trim()) throw new Error();
    accessToken = token;
    const verified = await supabaseClient.auth.getUser(accessToken);
    if (verified.error || verified.data.user?.id !== userId) throw new Error();
  } catch {
    // Do not surface authentication errors that might contain sensitive data.
    throw new Error("Your sign-in could not be verified. Sign in again.");
  }

  if (!shouldDispatch()) {
    throw new Error(
      "The workspace changed before the post could be published."
    );
  }
  // This per-request header prevents a later account switch from changing the
  // authorized user. Once dispatched, the request cannot be undone by a switch.
  const { data: id, error } = await supabaseClient
    .rpc("create_group_recruitment_post", {
      p_group_id: groupId,
      p_subject: title,
      p_body: text,
    })
    .setHeader("Authorization", `Bearer ${accessToken}`);
  if (error) throw error;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("The post was not confirmed. Refresh before retrying.");
  }
  return id;
}

export async function editGroupRecruitmentPost(
  userId: string,
  postId: string,
  subject: string,
  body: string
) {
  const title = subject.trim();
  const text = body.trim();
  if (!title || title.length > 120) {
    throw new Error("Subjects must be 1–120 characters.");
  }
  if (!text || text.length > MAX_RECRUITMENT_POST_LENGTH) {
    throw new Error(
      `Posts must be 1–${MAX_RECRUITMENT_POST_LENGTH} characters.`
    );
  }
  await callRpc(userId, "edit_group_recruitment_post", {
    p_post_id: postId,
    p_subject: title,
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

function mapCoursemateProfileRows(value: unknown) {
  return parseRows(value, "coursemate profile").map(row => {
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
    if (!Number.isInteger(year) || year < 1 || year > 12)
      throw new Error("The profile contains an invalid study year.");
    if (
      typeof row.bio !== "string" ||
      !Array.isArray(row.skills) ||
      !row.skills.every(skill => typeof skill === "string")
    )
      throw new Error("The profile contains invalid details.");
    return {
      profileId: requiredString(row, "profile_id"),
      displayName: requiredString(row, "display_name"),
      major,
      year,
      bio: row.bio,
      skills: row.skills as string[],
    };
  });
}

export async function listCourseUngroupedClassmates(
  userId: string,
  courseId: string,
  after?: UngroupedCoursemateCursor
): Promise<PageResult<UngroupedCoursemate, UngroupedCoursemateCursor>> {
  const rows = parseRows(
    await callRpc(userId, "list_course_ungrouped_classmates", {
      p_course_id: courseId,
      p_after_display_name: after?.displayName ?? null,
      p_after_profile_id: after?.profileId ?? null,
      p_limit: 50,
    }),
    "ungrouped coursemate list"
  );
  const hasMore = pageHasMore(rows);
  const items = rows.map(row => {
    allowOnlyKeys(row, [
      "profile_id",
      "display_name",
      "year",
      "major",
      "skills",
      "has_more",
    ]);
    const major = nullableString(row, "major");
    const year = Number(row.year);
    if (!Number.isInteger(year) || year < 1 || year > 12)
      throw new Error("The coursemate list contains an invalid study year.");
    if (
      !Array.isArray(row.skills) ||
      !row.skills.every(skill => typeof skill === "string")
    )
      throw new Error("The coursemate list contains invalid skills.");
    return {
      profileId: requiredString(row, "profile_id"),
      displayName: requiredString(row, "display_name"),
      year,
      major,
      skills: row.skills as string[],
    };
  });
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: last
      ? { displayName: last.displayName, profileId: last.profileId }
      : null,
  };
}

export async function getCurrentTermCoursemateProfile(
  userId: string,
  courseId: string,
  profileId: string
): Promise<CoursemateProfile> {
  const profiles = mapCoursemateProfileRows(
    await callRpc(userId, "get_current_term_coursemate_profile", {
      p_course_id: courseId,
      p_profile_id: profileId,
    })
  );
  if (profiles.length !== 1 || profiles[0].profileId !== profileId)
    throw new Error("This coursemate profile is no longer available.");
  return profiles[0];
}
