import { describe, expect, it } from "vitest";
import { DEMO_USER_ID } from "./sampleData";
import { getFictionalCourseClassmates } from "./fictionalCourseClassmates";

describe("fictional course classmates", () => {
  it("uses the matching sample-course roster and excludes the demo account", () => {
    const classmates = getFictionalCourseClassmates(" is3100 ");

    expect(classmates.map(student => student.id)).toEqual([
      "stu02",
      "stu03",
      "stu04",
      "stu06",
    ]);
    expect(classmates.every(student => student.id !== DEMO_USER_ID)).toBe(true);
  });

  it("provides generic fictional examples for an unknown course code", () => {
    const classmates = getFictionalCourseClassmates("NEW-COURSE");

    expect(classmates.map(student => student.id)).toEqual([
      "stu02",
      "stu03",
      "stu04",
      "stu05",
    ]);
    expect(classmates).toHaveLength(4);
    expect(classmates.every(student => student.id !== DEMO_USER_ID)).toBe(true);
  });
});
