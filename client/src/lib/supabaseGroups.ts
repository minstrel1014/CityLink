import { supabaseClient } from "@/lib/supabaseClient";
import {
  assertDispatchAllowed,
  bindRequestToken,
  verifyRequestSession,
} from "@/lib/supabaseRequestAuth";

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
  max_members: number | null;
  capacity_count: number;
  capacity_state: "available" | "full" | "maximum_not_set" | "over_limit";
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
  max_members: number | null;
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
  const byGroup = new Map<string, CourseGroupSummary>();
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
            "max_members",
            "capacity_count",
            "capacity_state",
          ].includes(key)
      ) ||
      Object.keys(candidate).length !== 8
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
    const maxMembers = candidate.max_members;
    const capacityCount = candidate.capacity_count;
    const capacityState = candidate.capacity_state;
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
      groupSize < 2 ||
      (maxMembers !== null &&
        (typeof maxMembers !== "number" ||
          !Number.isSafeInteger(maxMembers) ||
          maxMembers < 2 ||
          maxMembers > 19)) ||
      typeof capacityCount !== "number" ||
      !Number.isSafeInteger(capacityCount) ||
      capacityCount !== groupSize ||
      (capacityState !== "available" &&
        capacityState !== "full" &&
        capacityState !== "maximum_not_set" &&
        capacityState !== "over_limit") ||
      capacityState !==
        (capacityCount > 19
          ? "over_limit"
          : maxMembers === null
            ? "maximum_not_set"
            : capacityCount >= maxMembers
              ? "full"
              : "available") ||
      byProfile.has(profileId)
    ) {
      throw new Error(
        "The coursemate group-summary response contains invalid data."
      );
    }
    const summary: CourseGroupSummary = {
      profile_id: profileId,
      group_id: groupId,
      group_name: groupName,
      group_status: groupStatus,
      group_size: groupSize,
      max_members: maxMembers,
      capacity_count: capacityCount,
      capacity_state: capacityState,
    };
    const group = byGroup.get(groupId);
    if (
      group &&
      (group.group_name !== summary.group_name ||
        group.group_status !== summary.group_status ||
        group.group_size !== summary.group_size ||
        group.max_members !== summary.max_members ||
        group.capacity_count !== summary.capacity_count ||
        group.capacity_state !== summary.capacity_state)
    ) {
      throw new Error(
        "The coursemate group-summary response contains inconsistent group data."
      );
    }
    byProfile.set(profileId, summary);
    byGroup.set(groupId, summary);
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
  const getSession = supabaseClient.auth.getSession;
  const sessionData =
    typeof getSession === "function"
      ? await getSession.call(supabaseClient.auth)
      : null;
  const accessToken = sessionData?.data.session?.access_token;
  if (
    sessionData?.error ||
    (typeof getSession === "function" &&
      (typeof accessToken !== "string" || !accessToken.trim()))
  ) {
    throw new Error(
      "Your sign-in could not be verified. Sign in again before continuing."
    );
  }
  // Validate the captured token without asking the SDK to remove a newer
  // cross-tab session if this old request belongs to a replaced account.
  const { data, error } = accessToken
    ? await supabaseClient.auth.getUser(accessToken)
    : await supabaseClient.auth.getUser();
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
  const pageSize = 100;
  const members: GroupMembershipRow[] = [];
  const seenIds = new Set<string>();
  let expectedCount: number | null = null;
  while (true) {
    const { data, error, count } = await client
      .from("group_memberships")
      .select(
        "id, group_id, course_id, profile_id, display_name_snapshot, membership_status, joined_at",
        { count: "exact" }
      )
      .eq("group_id", groupId)
      .eq("membership_status", "active")
      .order("joined_at", { ascending: true })
      .order("id", { ascending: true })
      .range(members.length, members.length + pageSize - 1);
    if (error) throw error;
    if (
      count === null ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      (expectedCount !== null && count !== expectedCount)
    ) {
      throw new Error(
        "The group member list changed or could not be counted. Refresh and try again."
      );
    }
    expectedCount = count;
    const page = mapActiveGroupMemberships(data);
    for (const member of page) {
      if (member.group_id !== groupId || seenIds.has(member.id)) {
        throw new Error(
          "The group member list changed while loading. Refresh and try again."
        );
      }
      seenIds.add(member.id);
      members.push(member);
    }
    if (members.length === expectedCount) return members;
    if (page.length === 0 || members.length > expectedCount) {
      throw new Error(
        "The group member list was incomplete. Refresh and try again."
      );
    }
  }
}

export interface OwnCourseGroupSnapshot {
  groups: StudyGroupRow[];
  memberships: GroupMembershipRow[];
}

// Both the row count and the total request count are bounded. A server-side
// row limit may make a page shorter than requested, so advance by actual rows.
const OWN_GROUP_PAGE_SIZE = 50;
const OWN_GROUP_BATCH_SIZE = 50;
const OWN_GROUP_MAX_ROWS = 500;
const OWN_GROUP_MAX_REQUESTS = 64;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWN_GROUP_RETRY_MESSAGE =
  "Your group membership could not be verified. Refresh and try again.";

function ownGroupReadFailed(): never {
  throw new Error(OWN_GROUP_RETRY_MESSAGE);
}

function ownGroupId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return ownGroupReadFailed();
  }
  return value;
}

function ownGroupTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return ownGroupReadFailed();
  }
  return value;
}

function hasExactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(row).length === keys.length &&
    keys.every(key => Object.hasOwn(row, key))
  );
}

function mapOwnMembership(
  value: unknown,
  userId: string,
  courseId: string
): GroupMembershipRow {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "group_id",
      "course_id",
      "profile_id",
      "display_name_snapshot",
      "membership_status",
      "joined_at",
    ])
  ) {
    return ownGroupReadFailed();
  }
  const id = ownGroupId(value.id);
  const groupId = ownGroupId(value.group_id);
  const rowCourseId = ownGroupId(value.course_id);
  const profileId = ownGroupId(value.profile_id);
  if (
    profileId !== userId ||
    rowCourseId !== courseId ||
    value.membership_status !== "active" ||
    typeof value.display_name_snapshot !== "string" ||
    !value.display_name_snapshot.length
  ) {
    return ownGroupReadFailed();
  }
  return {
    id,
    group_id: groupId,
    course_id: rowCourseId,
    profile_id: profileId,
    display_name_snapshot: value.display_name_snapshot,
    membership_status: "active",
    joined_at: ownGroupTimestamp(value.joined_at),
  };
}

function mapOwnGroup(
  value: unknown,
  courseId: string,
  expectedIds: ReadonlySet<string>
): StudyGroupRow {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "course_id",
      "creator_id",
      "status",
      "name",
      "max_members",
      "created_at",
    ])
  ) {
    return ownGroupReadFailed();
  }
  const id = ownGroupId(value.id);
  const rowCourseId = ownGroupId(value.course_id);
  const creatorId =
    value.creator_id === null ? null : ownGroupId(value.creator_id);
  const status = value.status;
  const maxMembers = value.max_members;
  if (
    !expectedIds.has(id) ||
    rowCourseId !== courseId ||
    (status !== "forming" &&
      status !== "active" &&
      status !== "abandoned" &&
      status !== "archived") ||
    typeof value.name !== "string" ||
    (maxMembers !== null &&
      (typeof maxMembers !== "number" ||
        !Number.isSafeInteger(maxMembers) ||
        maxMembers < 2 ||
        maxMembers > 19))
  ) {
    return ownGroupReadFailed();
  }
  return {
    id,
    course_id: rowCourseId,
    creator_id: creatorId,
    status,
    name: value.name,
    max_members: maxMembers,
    created_at: ownGroupTimestamp(value.created_at),
  };
}

/**
 * Load only the viewer's active memberships in one course and their groups.
 * These RLS-protected reads are UI evidence, not authorization: the server
 * remains responsible for checking eligibility when a write is attempted.
 */
export async function loadOwnCourseGroupSnapshot(
  userId: string,
  courseId: string
): Promise<OwnCourseGroupSnapshot> {
  const client = await verifyCurrentUser(userId);
  ownGroupId(userId);
  ownGroupId(courseId);
  let requests = 0;

  async function readPages<T extends { id: string }>(
    readPage: (
      from: number,
      to: number
    ) => PromiseLike<{ data: unknown; error: unknown; count: number | null }>,
    mapRow: (value: unknown) => T,
    requiredCount?: number
  ): Promise<T[]> {
    const rows: T[] = [];
    let expectedCount: number | undefined;
    let previousId: string | undefined;
    while (true) {
      if (++requests > OWN_GROUP_MAX_REQUESTS) return ownGroupReadFailed();
      let response: unknown;
      try {
        response = await readPage(
          rows.length,
          rows.length + OWN_GROUP_PAGE_SIZE - 1
        );
      } catch {
        return ownGroupReadFailed();
      }
      if (!isRecord(response)) return ownGroupReadFailed();
      const { data, error, count } = response;
      if (
        error !== null ||
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > OWN_GROUP_MAX_ROWS ||
        (requiredCount !== undefined && count !== requiredCount) ||
        (expectedCount !== undefined && count !== expectedCount) ||
        !Array.isArray(data) ||
        data.length > OWN_GROUP_PAGE_SIZE ||
        rows.length + data.length > count
      ) {
        return ownGroupReadFailed();
      }
      expectedCount = count;
      for (const value of data) {
        const row = mapRow(value);
        // UUID order is deterministic and unique, including across pages.
        const id = row.id.toLowerCase();
        if (previousId !== undefined && id <= previousId) {
          return ownGroupReadFailed();
        }
        previousId = id;
        rows.push(row);
      }
      if (rows.length === expectedCount) return rows;
      if (data.length === 0) return ownGroupReadFailed();
    }
  }

  const memberships = await readPages(
    (from, to) =>
      client
        .from("group_memberships")
        .select(
          "id, group_id, course_id, profile_id, display_name_snapshot, membership_status, joined_at",
          { count: "exact" }
        )
        .eq("profile_id", userId)
        .eq("course_id", courseId)
        .eq("membership_status", "active")
        .order("id", { ascending: true })
        .range(from, to),
    row => mapOwnMembership(row, userId, courseId)
  );

  const groupIds = memberships.map(membership => membership.group_id);
  if (new Set(groupIds.map(id => id.toLowerCase())).size !== groupIds.length) {
    return ownGroupReadFailed();
  }
  const groups: StudyGroupRow[] = [];
  for (let i = 0; i < groupIds.length; i += OWN_GROUP_BATCH_SIZE) {
    const batch = groupIds.slice(i, i + OWN_GROUP_BATCH_SIZE);
    const expectedIds = new Set(batch);
    const groupPage = await readPages(
      (from, to) =>
        client
          .from("study_groups")
          .select(
            "id, course_id, creator_id, status, name, max_members, created_at",
            { count: "exact" }
          )
          .eq("course_id", courseId)
          .in("id", batch)
          .order("id", { ascending: true })
          .range(from, to),
      row => mapOwnGroup(row, courseId, expectedIds),
      batch.length
    );
    groups.push(...groupPage);
  }

  // Do not return a snapshot if the signed-in account changed during the read.
  await verifyCurrentUser(userId);
  return { groups, memberships };
}

function mapWorkflowGroup(value: unknown): StudyGroupRow {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "course_id",
      "creator_id",
      "status",
      "name",
      "max_members",
      "created_at",
    ])
  ) {
    throw new Error("The group workflow returned an invalid group record.");
  }
  const id = ownGroupId(value.id);
  const courseId = ownGroupId(value.course_id);
  const creatorId =
    value.creator_id === null ? null : ownGroupId(value.creator_id);
  const status = value.status;
  const maxMembers = value.max_members;
  if (
    (status !== "forming" &&
      status !== "active" &&
      status !== "abandoned" &&
      status !== "archived") ||
    typeof value.name !== "string" ||
    typeof value.created_at !== "string" ||
    !value.created_at.trim() ||
    (maxMembers !== null &&
      (typeof maxMembers !== "number" ||
        !Number.isSafeInteger(maxMembers) ||
        maxMembers < 2 ||
        maxMembers > 19))
  ) {
    throw new Error("The group workflow returned invalid group data.");
  }
  return {
    id,
    course_id: courseId,
    creator_id: creatorId,
    status,
    name: value.name,
    max_members: maxMembers,
    created_at: value.created_at,
  };
}

export async function loadGroupWorkflowSnapshot(
  userId: string
): Promise<GroupWorkflowSnapshot> {
  const client = await verifyCurrentUser(userId);
  const [groups, memberships, incoming, outgoing, requests] = await Promise.all(
    [
      client
        .from("study_groups")
        .select(
          "id, course_id, creator_id, status, name, max_members, created_at"
        )
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
    groups: (groups.data ?? []).map(mapWorkflowGroup),
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
    | "rename_study_group"
    | "set_group_max_members"
    | "remove_group_member",
  args: Record<string, unknown>,
  shouldDispatch?: () => boolean
): Promise<T> {
  const { client, accessToken, authGeneration } =
    await verifyRequestSession(userId);
  assertDispatchAllowed(shouldDispatch, authGeneration);
  const { data, error } = await bindRequestToken(
    client.rpc(name, args as never),
    accessToken
  );
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
  name: string,
  maxMembers: number,
  shouldDispatch?: () => boolean
): Promise<CreatedGroupAndInvitation> {
  validateGroupMaxMembers(maxMembers);
  const rows = await callGroupRpc<CreatedGroupAndInvitation[]>(
    userId,
    "create_group_and_invite",
    {
      p_course_id: courseId,
      p_recipient_id: recipientId,
      p_name: name.trim(),
      p_max_members: maxMembers,
    },
    shouldDispatch
  );
  const created = rows?.[0];
  if (!created?.group_id || !created?.invitation_id) {
    throw new Error(
      "CityLink did not return the new group and invitation IDs. Refresh before trying again."
    );
  }
  return created;
}

function validateGroupMaxMembers(maxMembers: number): void {
  if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 19) {
    throw new Error("Group maximum must be a whole number between 2 and 19.");
  }
}

export async function setGroupMaxMembers(
  userId: string,
  groupId: string,
  maxMembers: number,
  shouldDispatch?: () => boolean
): Promise<number> {
  validateGroupMaxMembers(maxMembers);
  return callGroupRpc<number>(
    userId,
    "set_group_max_members",
    { p_group_id: groupId, p_max_members: maxMembers },
    shouldDispatch
  );
}

export function removeGroupMember(
  userId: string,
  groupId: string,
  profileId: string,
  shouldDispatch?: () => boolean
): Promise<string> {
  return callGroupRpc<string>(
    userId,
    "remove_group_member",
    { p_group_id: groupId, p_profile_id: profileId },
    shouldDispatch
  );
}

export function sendGroupInvitation(
  userId: string,
  groupId: string,
  recipientId: string,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<string>(
    userId,
    "send_group_invitation",
    { p_group_id: groupId, p_recipient_id: recipientId },
    shouldDispatch
  );
}

export function respondToGroupInvitation(
  userId: string,
  invitationId: string,
  accept: boolean,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<string>(
    userId,
    "respond_to_group_invitation",
    { p_invitation_id: invitationId, p_accept: accept },
    shouldDispatch
  );
}

export function cancelGroupInvitation(
  userId: string,
  invitationId: string,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<void>(
    userId,
    "cancel_group_invitation",
    { p_invitation_id: invitationId },
    shouldDispatch
  );
}

export function renameStudyGroup(
  userId: string,
  groupId: string,
  name: string,
  shouldDispatch?: () => boolean
) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 50) {
    return Promise.reject(
      new Error("Group names must contain between 1 and 50 characters.")
    );
  }
  return callGroupRpc<void>(
    userId,
    "rename_study_group",
    { p_group_id: groupId, p_name: normalizedName },
    shouldDispatch
  );
}

export function requestToJoinGroup(
  userId: string,
  groupId: string,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<string>(
    userId,
    "request_to_join_group",
    { p_group_id: groupId },
    shouldDispatch
  );
}

export function reviewGroupJoinRequest(
  userId: string,
  requestId: string,
  approve: boolean,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<string>(
    userId,
    "review_group_join_request",
    { p_request_id: requestId, p_approve: approve },
    shouldDispatch
  );
}

export function cancelGroupJoinRequest(
  userId: string,
  requestId: string,
  shouldDispatch?: () => boolean
) {
  return callGroupRpc<void>(
    userId,
    "cancel_group_join_request",
    { p_request_id: requestId },
    shouldDispatch
  );
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

  if (message.includes("group is full")) {
    return "Group is full";
  }
  if (message.includes("group maximum is not set")) {
    return "Group maximum is not set";
  }
  if (message.includes("group has more than 19 active members")) {
    return "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.";
  }
  if (
    message.includes(
      "maximum cannot be lower than the current number of active members"
    )
  ) {
    return "Maximum cannot be lower than the current number of active members. Remove members first.";
  }
  if (message.includes("group maximum does not match this group")) {
    return "The chosen maximum does not match this group's maximum. The leader must edit the maximum before inviting.";
  }
  if (
    message.includes("group maximum must be between 2 and 19") ||
    message.includes("group maximum must be a whole number between 2 and 19")
  ) {
    return "Choose a whole-number group maximum between 2 and 19.";
  }
  if (message.includes("only the current group leader may set the maximum")) {
    return "Only the current group leader can set the maximum. Refresh the page to update your access.";
  }
  if (message.includes("only the current group leader may remove members")) {
    return "Only the current group leader can remove members. Refresh the page to update your access.";
  }
  if (message.includes("the current group leader cannot remove themselves")) {
    return "The current group leader cannot remove themselves through this action.";
  }
  if (message.includes("the last active member cannot be removed")) {
    return "The last active group member cannot be removed through this action.";
  }
  if (
    message.includes("target is not an active member of this group") ||
    message.includes("target is no longer an active member of this group")
  ) {
    return "This person is no longer an active member of the group. Refresh the page to see the current members.";
  }
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
