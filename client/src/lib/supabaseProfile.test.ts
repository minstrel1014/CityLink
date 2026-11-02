import { describe, expect, it } from "vitest";
import {
  buildOwnProfileUpdate,
  classifyOwnProfileResult,
  getProfileInitials,
  isAuthenticatedProfileOwner,
  isCurrentProfileOperation,
  parseOwnProfile,
} from "./supabaseProfile";

const userId = "8f490bf9-0fb6-4b11-a51b-f290260a9ac3";
const row = {
  id: userId,
  student_id: "DEMO10001",
  display_name: "Alex Wong",
  major: "Information Systems",
  year: 3,
  bio: "Looking for a project team.",
  skills: ["Python", "Research"],
  status: "open",
};

describe("Supabase own-profile handling", () => {
  it("invalidates in-flight operations after a user change or unmount generation change", () => {
    expect(isCurrentProfileOperation(userId, userId, 3, 3)).toBe(true);
    expect(isCurrentProfileOperation(userId, "another-user", 3, 3)).toBe(false);
    expect(isCurrentProfileOperation(userId, userId, 3, 4)).toBe(false);
  });

  it("requires a successful current-user lookup with the matching profile UUID", () => {
    expect(isAuthenticatedProfileOwner(userId, userId, null)).toBe(true);
    expect(isAuthenticatedProfileOwner(userId, "another-user", null)).toBe(
      false
    );
    expect(
      isAuthenticatedProfileOwner(userId, userId, new Error("failed"))
    ).toBe(false);
    expect(isAuthenticatedProfileOwner(userId, undefined, null)).toBe(false);
  });

  it("maps the expected user's profile into the UI shape", () => {
    expect(parseOwnProfile(row, userId)).toEqual({
      id: userId,
      studentId: "DEMO10001",
      displayName: "Alex Wong",
      major: "Information Systems",
      year: 3,
      bio: "Looking for a project team.",
      skills: ["Python", "Research"],
      status: "open",
    });
  });

  it("rejects a row belonging to a different user", () => {
    expect(parseOwnProfile(row, "another-auth-user")).toBeNull();
    expect(classifyOwnProfileResult(row, null, "another-auth-user").state).toBe(
      "error"
    );
  });

  it("distinguishes a missing row from a failed query without exposing details", () => {
    expect(classifyOwnProfileResult(null, null, userId)).toEqual({
      state: "missing",
    });
    expect(
      classifyOwnProfileResult(
        null,
        { message: "private database detail" },
        userId
      )
    ).toEqual({ state: "error" });
    expect(classifyOwnProfileResult({ ...row, year: 7 }, null, userId)).toEqual(
      {
        state: "error",
      }
    );
  });

  it("builds an update containing only the five grant-permitted profile columns", () => {
    const payload = buildOwnProfileUpdate({
      major: "  Information Systems ",
      year: 4,
      bio: "A short bio.",
      skillsText: "Python, Research, Python, ",
      status: "considering",
      // Runtime extras are ignored; identity and non-editable fields never pass through.
      ...({
        id: "attacker-selected-id",
        display_name: "Changed name",
        color: "red",
        student_id: "OTHER",
      } as unknown as object),
    });

    expect(payload).toEqual({
      major: "Information Systems",
      year: 4,
      bio: "A short bio.",
      skills: ["Python", "Research"],
      status: "considering",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["major", "year", "bio", "skills", "status"].sort()
    );
  });

  it("rejects invalid years and status values", () => {
    expect(() =>
      buildOwnProfileUpdate({
        major: "",
        year: 7,
        bio: "",
        skillsText: "",
        status: "open",
      })
    ).toThrow(/year of study/i);
    expect(() =>
      buildOwnProfileUpdate({
        major: "",
        year: 1,
        bio: "",
        skillsText: "",
        status: "unknown" as "open",
      })
    ).toThrow(/valid group-forming status/i);
  });

  it("trims bio and individual skill values before returning the update payload", () => {
    const payload = buildOwnProfileUpdate({
      major: "",
      year: 2,
      bio: "  A trimmed bio.  ",
      skillsText: "  Research  , Writing ",
      status: "open",
    });

    expect(payload.bio).toBe("A trimmed bio.");
    expect(payload.skills).toEqual(["Research", "Writing"]);
  });

  it("rejects too many skills and overlong individual skill names", () => {
    expect(() =>
      buildOwnProfileUpdate({
        major: "",
        year: 2,
        bio: "",
        skillsText: Array.from(
          { length: 11 },
          (_, index) => `Skill ${index + 1}`
        ).join(", "),
        status: "open",
      })
    ).toThrow(/10 items or fewer/i);

    expect(() =>
      buildOwnProfileUpdate({
        major: "",
        year: 2,
        bio: "",
        skillsText: "x".repeat(41),
        status: "open",
      })
    ).toThrow(/40 characters or fewer/i);
  });

  it("derives initials without exposing or substituting a demo identity", () => {
    expect(getProfileInitials("Ada Lovelace")).toBe("AL");
    expect(getProfileInitials(" ")).toBe("CL");
  });
});
