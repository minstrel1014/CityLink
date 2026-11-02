import { describe, expect, it } from "vitest";
import {
  COURSE_ENROLMENT_WRITES_ENABLED,
  COURSE_ENROLMENT_EMPTY_MESSAGE,
  filterCourseDirectory,
  getCourseDirectoryErrorMessage,
  mapOwnEnrolledCourseIds,
  mapSupabaseCourseRows,
} from "@/lib/supabaseCourses";

const courseRows = [
  {
    id: "course-uuid-1",
    code: "IS3100",
    title: "Business Application Development",
    department: "Information Systems",
    credits: "3.0",
    semester: "Semester A 2026/27",
    description: "Build a useful business application.",
    color: "sage",
  },
  {
    id: "course-uuid-2",
    code: "CB2500",
    title: "Information Management",
    department: "Business",
    credits: 3,
    semester: "Semester B 2026/27",
    description: "Explore information in organisations.",
    color: "untrusted-css-class",
  },
];

describe("Supabase course directory mapping", () => {
  it("maps database course rows to the existing display type", () => {
    const courses = mapSupabaseCourseRows(courseRows);
    expect(courses[0]).toEqual({
      id: "course-uuid-1",
      code: "IS3100",
      title: "Business Application Development",
      department: "Information Systems",
      credits: 3,
      semester: "Semester A 2026/27",
      description: "Build a useful business application.",
      color: "sage",
    });
    expect(courses[1].color).toBe("sage");
  });

  it("rejects malformed rows rather than displaying partial course data", () => {
    expect(() =>
      mapSupabaseCourseRows([{ id: "course-uuid", credits: 3 }])
    ).toThrow(/invalid course record/i);
    expect(() => mapSupabaseCourseRows({})).toThrow(/response is invalid/i);
  });

  it("maps only the signed-in user's enrolments and removes duplicate IDs", () => {
    expect(
      mapOwnEnrolledCourseIds(
        [
          { student_id: "user-a", course_id: "course-1" },
          { student_id: "user-a", course_id: "course-1" },
          { student_id: "user-a", course_id: "course-2" },
        ],
        "user-a"
      )
    ).toEqual(["course-1", "course-2"]);
  });

  it("fails closed if another user's row is returned by the database", () => {
    expect(() =>
      mapOwnEnrolledCourseIds(
        [{ student_id: "user-b", course_id: "course-1" }],
        "user-a"
      )
    ).toThrow(/another account/i);
  });

  it("filters by course code/title, department, semester, and own-course scope", () => {
    const courses = mapSupabaseCourseRows(courseRows);
    const enrolled = new Set(["course-uuid-1"]);

    expect(
      filterCourseDirectory(courses, enrolled, {
        scope: "catalogue",
        query: "is3100",
        department: "",
        semester: "",
      }).map(course => course.id)
    ).toEqual(["course-uuid-1"]);
    expect(
      filterCourseDirectory(courses, enrolled, {
        scope: "catalogue",
        query: "",
        department: "Business",
        semester: "Semester B 2026/27",
      }).map(course => course.id)
    ).toEqual(["course-uuid-2"]);
    expect(
      filterCourseDirectory(courses, enrolled, {
        scope: "mine",
        query: "",
        department: "",
        semester: "",
      }).map(course => course.id)
    ).toEqual(["course-uuid-1"]);
  });

  it("enables enrolment writes and explains how to start when no courses are enrolled", () => {
    expect(COURSE_ENROLMENT_WRITES_ENABLED).toBe(true);
    expect(COURSE_ENROLMENT_EMPTY_MESSAGE).toMatch(/browse the catalogue/i);
  });
});
