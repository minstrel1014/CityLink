import { describe, expect, it } from "vitest";
import {
  canOfferAnalysis,
  decideGroupFileAccess,
  type GroupAccessInput,
} from "@shared/groupAnalysisAccess";

const activeMember: GroupAccessInput = {
  hasSession: true,
  membership: "active",
  groupStatus: "active",
};

describe("who may touch group files", () => {
  it("allows an active member of an active group", () => {
    expect(decideGroupFileAccess(activeMember)).toEqual({
      allowed: true,
      denial: null,
    });
  });

  it("denies a former member who left, even though chat stays readable", () => {
    const decision = decideGroupFileAccess({
      ...activeMember,
      membership: "left",
    });
    expect(decision).toEqual({
      allowed: false,
      denial: "group_files_no_permission",
    });
  });

  it("denies a removed member", () => {
    const decision = decideGroupFileAccess({
      ...activeMember,
      membership: "removed",
    });
    expect(decision).toEqual({
      allowed: false,
      denial: "group_files_no_permission",
    });
  });

  it("denies someone who was never a member", () => {
    const decision = decideGroupFileAccess({
      ...activeMember,
      membership: "none",
    });
    expect(decision).toEqual({
      allowed: false,
      denial: "group_files_no_permission",
    });
  });

  it("denies every case when there is no session", () => {
    for (const membership of ["active", "left", "removed", "none"] as const) {
      const decision = decideGroupFileAccess({
        ...activeMember,
        hasSession: false,
        membership,
      });
      expect(decision.allowed).toBe(false);
    }
  });

  it("denies an abandoned group even to an active member, with its own token", () => {
    const decision = decideGroupFileAccess({
      ...activeMember,
      groupStatus: "abandoned",
    });
    expect(decision).toEqual({
      allowed: false,
      denial: "group_files_group_abandoned",
    });
  });

  it("keeps an archived group readable, because only abandoned is excluded", () => {
    expect(
      decideGroupFileAccess({ ...activeMember, groupStatus: "archived" })
        .allowed
    ).toBe(true);
  });
});

describe("when the analysis action is offered", () => {
  it("offers it for an analysable file to an active member", () => {
    expect(canOfferAnalysis({ ...activeMember, analysisStatus: "ready" })).toBe(
      true
    );
    expect(
      canOfferAnalysis({ ...activeMember, analysisStatus: "not_requested" })
    ).toBe(true);
  });

  it("withdraws the action, not the file, when the format is unsupported", () => {
    expect(
      canOfferAnalysis({
        ...activeMember,
        analysisStatus: "unsupported_format",
      })
    ).toBe(false);
    expect(
      canOfferAnalysis({ ...activeMember, analysisStatus: "failed" })
    ).toBe(false);
  });

  it("withdraws it entirely for a former member", () => {
    expect(
      canOfferAnalysis({
        ...activeMember,
        membership: "left",
        analysisStatus: "ready",
      })
    ).toBe(false);
  });
});
