import type { Course } from "@/data/sampleData";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  assertDispatchAllowed,
  bindRequestToken,
  verifyRequestSession,
} from "@/lib/supabaseRequestAuth";

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

export function mapCurrentTermCourseEnrollmentCounts(
  value: unknown
): Map<string, number> {
  if (!Array.isArray(value)) {
    throw new Error("The course enrolment-count response is invalid.");
  }

  const counts = new Map<string, number>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        key => key !== "course_id" && key !== "enrolled_count"
      )
    ) {
      throw new Error("The course enrolment-count response is invalid.");
    }
    const courseId = candidate.course_id;
    const rawCount = candidate.enrolled_count;
    const enrolledCount =
      typeof rawCount === "number"
        ? rawCount
        : typeof rawCount === "string" && /^\d+$/.test(rawCount)
          ? Number(rawCount)
          : Number.NaN;
    if (
      typeof courseId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        courseId
      ) ||
      !Number.isSafeInteger(enrolledCount) ||
      enrolledCount < 0 ||
      counts.has(courseId)
    ) {
      throw new Error(
        "The course enrolment-count response contains invalid data."
      );
    }
    counts.set(courseId, enrolledCount);
  }
  return counts;
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

export async function loadCurrentTermCourseEnrollmentCounts(
  userId: string
): Promise<Map<string, number>> {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error("A signed-in CityLink account is required.");
  }
  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();
  if (authError || authData.user?.id !== userId) {
    throw new Error(
      "Your sign-in could not be verified. Sign in again before viewing course counts."
    );
  }
  const { data, error } = await supabaseClient.rpc(
    "list_current_course_enrolment_counts"
  );
  if (error) throw error;
  return mapCurrentTermCourseEnrollmentCounts(data ?? []);
}

/**
 * Check only the selected course, without depending on catalogue-wide results.
 * The two reads are not transactional; inconsistent evidence fails closed.
 */
export async function hasCurrentTermCourseEnrollment(
  userId: string,
  courseId: string
): Promise<boolean> {
  const client = supabaseClient;
  if (!client) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("A signed-in CityLink account is required.");
  }
  if (typeof courseId !== "string" || !courseId.trim()) {
    throw new Error("A selected course is required.");
  }

  // PostgreSQL emits canonical UUIDs in lowercase, including for uppercase
  // input. Check the selected ID as a UUID without imposing a version policy.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isSelectedCourseId = (value: unknown) =>
    typeof value === "string" &&
    uuidPattern.test(value) &&
    value.toLowerCase() === courseId.toLowerCase();

  const verifyUser = async () => {
    const { data, error } = await client.auth.getUser();
    if (error || data?.user?.id !== userId) {
      throw new Error(
        "Your sign-in could not be verified. Sign in again before checking course enrolment."
      );
    }
  };

  await verifyUser();
  let readResults;
  try {
    readResults = await Promise.allSettled([
      client
        .from("enrolments")
        .select("student_id, course_id")
        .eq("student_id", userId)
        .eq("course_id", courseId)
        .limit(2),
      client
        .rpc("list_current_course_enrolment_counts")
        .eq("course_id", courseId)
        .limit(2),
    ]);
  } finally {
    // Also verify on read failure; never return evidence from a changed session.
    await verifyUser();
  }

  const [enrolmentRead, countRead] = readResults;
  if (enrolmentRead.status === "rejected") throw enrolmentRead.reason;
  if (countRead.status === "rejected") throw countRead.reason;
  const enrolmentResult = enrolmentRead.value;
  const countResult = countRead.value;
  if (enrolmentResult.error) throw enrolmentResult.error;
  if (countResult.error) throw countResult.error;
  if (!Array.isArray(enrolmentResult.data) || enrolmentResult.data.length > 1) {
    throw new Error("The course enrolment response is invalid or duplicated.");
  }
  if (!Array.isArray(countResult.data) || countResult.data.length > 1) {
    throw new Error(
      "The course enrolment-count response is invalid or duplicated."
    );
  }

  const hasEnrolment = enrolmentResult.data.length === 1;
  const enrolment = enrolmentResult.data[0];
  if (
    hasEnrolment &&
    (!isRecord(enrolment) ||
      Object.keys(enrolment).some(
        key => key !== "student_id" && key !== "course_id"
      ) ||
      typeof enrolment.student_id !== "string" ||
      !uuidPattern.test(enrolment.student_id) ||
      enrolment.student_id !== userId ||
      !isSelectedCourseId(enrolment.course_id))
  ) {
    throw new Error(
      "The course enrolment response contains an invalid record."
    );
  }

  const hasCount = countResult.data.length === 1;
  const countRow = countResult.data[0];
  let count: number | undefined;
  if (hasCount) {
    if (
      !isRecord(countRow) ||
      Object.keys(countRow).some(
        key => key !== "course_id" && key !== "enrolled_count"
      ) ||
      !isSelectedCourseId(countRow.course_id)
    ) {
      throw new Error(
        "The course enrolment-count response contains an invalid record."
      );
    }
    const rawCount = countRow.enrolled_count;
    count =
      typeof rawCount === "number"
        ? rawCount
        : typeof rawCount === "string" && /^\d+$/.test(rawCount)
          ? Number(rawCount)
          : Number.NaN;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        "The course enrolment-count response contains an invalid count."
      );
    }
  }

  if (hasEnrolment && count === 0) {
    throw new Error("The course enrolment evidence is inconsistent.");
  }
  return hasEnrolment && count !== undefined && count >= 1;
}

async function verifyCurrentOwner(
  userId: string,
  shouldDispatch?: () => boolean
) {
  const session = await verifyRequestSession(
    userId,
    "Your sign-in could not be verified. Sign in again before changing courses."
  );
  assertDispatchAllowed(shouldDispatch, session.authGeneration);
  return session;
}

export async function addOwnCourseEnrolment(
  userId: string,
  courseId: string,
  shouldDispatch?: () => boolean
): Promise<void> {
  if (!COURSE_ENROLMENT_WRITES_ENABLED) {
    throw new Error(COURSE_ENROLMENT_WRITE_GATE_MESSAGE);
  }
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  const { client, accessToken, authGeneration } = await verifyCurrentOwner(
    userId,
    shouldDispatch
  );
  assertDispatchAllowed(shouldDispatch, authGeneration);
  const { error } = await bindRequestToken(
    client.from("enrolments").insert({
      student_id: userId,
      course_id: courseId,
    }),
    accessToken
  );
  if (error) throw error;
}

export async function removeOwnCourseEnrolment(
  userId: string,
  courseId: string,
  shouldDispatch?: () => boolean
): Promise<void> {
  if (!COURSE_ENROLMENT_WRITES_ENABLED) {
    throw new Error(COURSE_ENROLMENT_WRITE_GATE_MESSAGE);
  }
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  const { client, accessToken, authGeneration } = await verifyCurrentOwner(
    userId,
    shouldDispatch
  );
  assertDispatchAllowed(shouldDispatch, authGeneration);
  const { data, error } = await bindRequestToken(
    client
      .from("enrolments")
      .delete()
      .eq("student_id", userId)
      .eq("course_id", courseId)
      .select("student_id, course_id")
      .maybeSingle(),
    accessToken
  );
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
