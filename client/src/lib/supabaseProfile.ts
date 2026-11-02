import type { GroupStatus } from "@/data/sampleData";

export const OWN_PROFILE_COLUMNS =
  "id,student_id,display_name,major,year,bio,skills,status";

export interface OwnProfile {
  id: string;
  studentId: string | null;
  displayName: string;
  major: string | null;
  year: number;
  bio: string;
  skills: string[];
  status: GroupStatus;
}

export interface ProfileEditDraft {
  major: string;
  year: number;
  bio: string;
  skillsText: string;
  status: GroupStatus;
}

export interface OwnProfileUpdate {
  major: string | null;
  year: number;
  bio: string;
  skills: string[];
  status: GroupStatus;
}

export function isCurrentProfileOperation(
  requestedUserId: string,
  currentUserId: string | undefined,
  requestGeneration: number,
  currentGeneration: number
) {
  return (
    requestedUserId === currentUserId && requestGeneration === currentGeneration
  );
}

export function isAuthenticatedProfileOwner(
  expectedUserId: string,
  authenticatedUserId: string | undefined,
  authenticationError: unknown
) {
  return !authenticationError && authenticatedUserId === expectedUserId;
}

export type OwnProfileResult =
  | { state: "ready"; profile: OwnProfile }
  | { state: "missing" }
  | { state: "error" };

const groupStatuses = new Set<GroupStatus>(["open", "considering", "full"]);
export const MAX_PROFILE_BIO_LENGTH = 2_000;
export const MAX_PROFILE_SKILL_COUNT = 10;
export const MAX_PROFILE_SKILL_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOwnProfile(
  value: unknown,
  expectedUserId: string
): OwnProfile | null {
  if (!isRecord(value)) return null;
  if (
    value.id !== expectedUserId ||
    typeof value.display_name !== "string" ||
    (value.student_id !== null && typeof value.student_id !== "string") ||
    (value.major !== null && typeof value.major !== "string") ||
    typeof value.year !== "number" ||
    !Number.isInteger(value.year) ||
    value.year < 1 ||
    value.year > 6 ||
    typeof value.bio !== "string" ||
    !Array.isArray(value.skills) ||
    !value.skills.every(skill => typeof skill === "string") ||
    typeof value.status !== "string" ||
    !groupStatuses.has(value.status as GroupStatus)
  ) {
    return null;
  }

  return {
    id: value.id,
    studentId: value.student_id,
    displayName: value.display_name,
    major: value.major,
    year: value.year,
    bio: value.bio,
    skills: [...value.skills],
    status: value.status as GroupStatus,
  };
}

export function classifyOwnProfileResult(
  row: unknown,
  error: unknown,
  expectedUserId: string
): OwnProfileResult {
  if (error) return { state: "error" };
  if (row === null || row === undefined) return { state: "missing" };

  const profile = parseOwnProfile(row, expectedUserId);
  return profile ? { state: "ready", profile } : { state: "error" };
}

export function buildOwnProfileUpdate(
  draft: ProfileEditDraft
): OwnProfileUpdate {
  if (!Number.isInteger(draft.year) || draft.year < 1 || draft.year > 6) {
    throw new Error("Choose a year of study from 1 to 6.");
  }
  if (draft.major.trim().length > 120) {
    throw new Error("Major must be 120 characters or fewer.");
  }
  const bio = draft.bio.trim();
  if (bio.length > MAX_PROFILE_BIO_LENGTH) {
    throw new Error(
      `Bio must be ${MAX_PROFILE_BIO_LENGTH} characters or fewer.`
    );
  }
  if (!groupStatuses.has(draft.status)) {
    throw new Error("Choose a valid group-forming status.");
  }

  const skills = [
    ...new Set(
      draft.skillsText
        .split(",")
        .map(skill => skill.trim())
        .filter(Boolean)
    ),
  ];
  if (skills.length > MAX_PROFILE_SKILL_COUNT) {
    throw new Error(
      `Keep your skills to ${MAX_PROFILE_SKILL_COUNT} items or fewer.`
    );
  }
  if (skills.some(skill => skill.length > MAX_PROFILE_SKILL_LENGTH)) {
    throw new Error(
      `Each skill must be ${MAX_PROFILE_SKILL_LENGTH} characters or fewer.`
    );
  }

  return {
    major: draft.major.trim() || null,
    year: draft.year,
    bio,
    skills,
    status: draft.status,
  };
}

export function getProfileInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "CL";
}
