import {
  DEMO_USER_ID,
  sampleCourses,
  sampleEnrolments,
  sampleStudents,
  type Student,
} from "./sampleData";
import { getClassmates } from "./repository";

const SAMPLE_FALLBACK_COUNT = 4;

/**
 * Returns fictional fixture data only. The course code is matched to a known
 * sample course when possible; unknown codes receive generic fictional examples.
 * This helper must not be replaced with a live student query without an approved
 * data/API contract.
 */
export function getFictionalCourseClassmates(courseCode: string): Student[] {
  const normalizedCode = courseCode.trim().toLocaleUpperCase();
  const sampleCourse = sampleCourses.find(
    course => course.code.toLocaleUpperCase() === normalizedCode
  );

  if (sampleCourse) {
    const coursePeers = getClassmates(
      sampleCourse.id,
      sampleStudents,
      sampleEnrolments
    );
    if (coursePeers.length > 0)
      return coursePeers.slice(0, SAMPLE_FALLBACK_COUNT);
  }

  return sampleStudents
    .filter(student => student.id !== DEMO_USER_ID)
    .slice(0, SAMPLE_FALLBACK_COUNT);
}
