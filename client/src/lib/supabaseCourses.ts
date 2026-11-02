import type { Course } from "@/data/sampleData";
import { supabaseClient } from "@/lib/supabaseClient";

export type CourseDirectoryScope = "catalogue" | "mine";

export interface CourseDirectoryFilters {
  scope: CourseDirectoryScope;
  query: string;
  department: string;
  semester: string;
}

export interface CourseDirectorySnapshot {
  courses: Course[];
  enrolledCourseIds: string[];
}

/**
 * The owner reports the reviewed owner-only enrolment grants and RLS policies
 * have been applied and verified. Writes still verify the authenticated user
 * locally and remain subject to Supabase RLS; never use service-role access.
 */
export const COURSE_ENROLMENT_WRITES_ENABLED = true;
export const COURSE_ENROLMENT_WRITE_GATE_MESSAGE =
  "Adding and removing courses is paused until the enrolment permissions receive separate review and approval.";
export const COURSE_ENROLMENT_EMPTY_MESSAGE =
  "You are not enrolled in any courses yet. Browse the catalogue and add a course to get started.";

const allowedCourseColors = new Set([
  "sage",
  "peach",
  "lavender",
  "blue",
  "yellow",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The course catalogue contains an invalid course record.");
  }
  return value;
}

export function mapSupabaseCourseRows(value: unknown): Course[] {
  if (!Array.isArray(value)) {
    throw new Error("The course catalogue response is invalid.");
  }

  return value.map(rowValue => {
    if (!isRecord(rowValue)) {
      throw new Error(
        "The course catalogue contains an invalid course record."
      );
    }

    const rawCredits = rowValue.credits;
    const credits =
      typeof rawCredits === "number"
        ? rawCredits
        : typeof rawCredits === "string"
          ? Number(rawCredits)
          : Number.NaN;
    if (!Number.isFinite(credits) || credits < 0 || credits > 99.9) {
      throw new Error("The course catalogue contains invalid credit values.");
    }

    const rawColor = rowValue.color;
    const color =
      typeof rawColor === "string" && allowedCourseColors.has(rawColor)
        ? rawColor
        : "sage";
    const description = rowValue.description;

    return {
      id: requiredText(rowValue, "id"),
      code: requiredText(rowValue, "code"),
      title: requiredText(rowValue, "title"),
      department: requiredText(rowValue, "department"),
      credits,
      semester: requiredText(rowValue, "semester"),
      description: typeof description === "string" ? description : "",
      color,
    };
  });
}

export function mapOwnEnrolledCourseIds(
  value: unknown,
  userId: string
): string[] {
  if (!Array.isArray(value)) {
    throw new Error("The enrolment response is invalid.");
  }

  const courseIds = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || typeof row.student_id !== "string") {
      throw new Error("The enrolment response contains an invalid record.");
    }
    if (row.student_id !== userId) {
      throw new Error(
        "The database returned an enrolment for another account."
      );
    }
    if (typeof row.course_id !== "string" || !row.course_id) {
      throw new Error("The enrolment response contains an invalid course ID.");
    }
    courseIds.add(row.course_id);
  }
  return [...courseIds];
}

export function filterCourseDirectory(
  courses: Course[],
  enrolledCourseIds: ReadonlySet<string>,
  filters: CourseDirectoryFilters
): Course[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return courses.filter(course => {
    const isEnrolled = enrolledCourseIds.has(course.id);
    if (filters.scope === "mine" && !isEnrolled) return false;
    if (filters.department && course.department !== filters.department) {
      return false;
    }
    if (filters.semester && course.semester !== filters.semester) return false;
    if (!query) return true;

    return [course.code, course.title, course.department, course.semester]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

export async function loadCourseDirectory(
  userId: string
): Promise<CourseDirectorySnapshot> {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error("A signed-in CityLink account is required.");
  }

  const [coursesResult, enrolmentsResult] = await Promise.all([
    supabaseClient
      .from("courses")
      .select(
        "id, code, title, department, credits, semester, description, color"
      )
      .order("semester", { ascending: false })
      .order("code", { ascending: true }),
    supabaseClient
      .from("enrolments")
      .select("student_id, course_id")
      .eq("student_id", userId),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (enrolmentsResult.error) throw enrolmentsResult.error;

  return {
    courses: mapSupabaseCourseRows(coursesResult.data ?? []),
    enrolledCourseIds: mapOwnEnrolledCourseIds(
      enrolmentsResult.data ?? [],
      userId
    ),
  };
}

async function verifyCurrentOwner(userId: string) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error(
      "Your sign-in could not be verified. Sign in again before changing courses."
    );
  }
  return data.user.id;
}

export async function addOwnCourseEnrolment(
  userId: string,
  courseId: string
): Promise<void> {
  if (!COURSE_ENROLMENT_WRITES_ENABLED) {
    throw new Error(COURSE_ENROLMENT_WRITE_GATE_MESSAGE);
  }
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  const ownerId = await verifyCurrentOwner(userId);
  const { error } = await supabaseClient.from("enrolments").insert({
    student_id: ownerId,
    course_id: courseId,
  });
  if (error) throw error;
}

export async function removeOwnCourseEnrolment(
  userId: string,
  courseId: string
): Promise<void> {
  if (!COURSE_ENROLMENT_WRITES_ENABLED) {
    throw new Error(COURSE_ENROLMENT_WRITE_GATE_MESSAGE);
  }
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  const ownerId = await verifyCurrentOwner(userId);
  const { data, error } = await supabaseClient
    .from("enrolments")
    .delete()
    .eq("student_id", ownerId)
    .eq("course_id", courseId)
    .select("student_id, course_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No matching course enrolment was found.");
}

export function getCourseDirectoryErrorMessage(
  error: unknown,
  operation: "read" | "write"
): string {
  const candidate = isRecord(error) ? error : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const details =
    error instanceof Error ? error.message.toLocaleLowerCase() : "";

  if (operation === "write") {
    if (
      details.includes(COURSE_ENROLMENT_WRITE_GATE_MESSAGE.toLocaleLowerCase())
    ) {
      return COURSE_ENROLMENT_WRITE_GATE_MESSAGE;
    }
    if (code === "23505") {
      return "You are already enrolled in this course. Refresh your course list.";
    }
    if (code === "23503") {
      return "That course is no longer available. Refresh the course catalogue.";
    }
    if (
      code === "42501" ||
      details.includes("row-level security") ||
      details.includes("permission denied")
    ) {
      return "Your account is not permitted to make that course change. Refresh your courses; if the problem continues, contact the project owner.";
    }
    return "The course change could not be completed. Your enrolments have not been confirmed; refresh and try again later.";
  }

  if (code === "42501" || details.includes("permission denied")) {
    return "Your signed-in account cannot read the course catalogue or its own enrolments.";
  }
  return "CityLink could not load the Supabase course catalogue. Check your connection and try again.";
}
