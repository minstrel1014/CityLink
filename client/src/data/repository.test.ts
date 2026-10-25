import { describe, expect, it } from "vitest";
import {
  createSampleRepository,
  getClassmates,
  type DemoStorage,
} from "./repository";
import { sampleStudents, sampleEnrolments, DEMO_USER_ID } from "./sampleData";
function memoryStorage(): DemoStorage {
  const data = new Map<string, string>();
  return {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: k => {
      data.delete(k);
    },
  };
}
describe("course-scoped directory", () => {
  it("shows only enrolled peers, never the current user", () => {
    const results = getClassmates("is3100", sampleStudents, sampleEnrolments);
    expect(results).toHaveLength(6);
    expect(results.some(s => s.id === DEMO_USER_ID)).toBe(false);
    expect(results.some(s => s.id === "stu08")).toBe(false);
  });
  it("searches by name and student ID within course only", () => {
    expect(
      getClassmates("is3100", sampleStudents, sampleEnrolments, "ethan")[0].id
    ).toBe("stu03");
    expect(
      getClassmates("is3100", sampleStudents, sampleEnrolments, "DEMO10006")[0]
        .name
    ).toBe("Natalie Ho");
    expect(
      getClassmates("is3100", sampleStudents, sampleEnrolments, "DEMO10008")
    ).toHaveLength(0);
  });
});
describe("saved invitation records", () => {
  it("saves and retrieves the actual record from a new repository instance", async () => {
    const storage = memoryStorage();
    const repo = createSampleRepository(storage);
    const invitation = await repo.sendInvitation("stu03", "is3100");
    const reopened = createSampleRepository(storage);
    expect(await reopened.listInvitations()).toContainEqual(invitation);
  });
  it("rejects duplicate, self, non-enrolled and fully grouped invites", async () => {
    const repo = createSampleRepository(memoryStorage());
    await repo.sendInvitation("stu03", "is3100");
    await expect(repo.sendInvitation("stu03", "is3100")).rejects.toThrow(
      "active invitation"
    );
    await expect(repo.sendInvitation("stu01", "is3100")).rejects.toThrow(
      "yourself"
    );
    await expect(repo.sendInvitation("stu08", "is3100")).rejects.toThrow(
      "enrolled"
    );
    await expect(repo.sendInvitation("stu07", "is3100")).rejects.toThrow(
      "already has a group"
    );
  });
  it("does not falsely succeed if persistence fails", async () => {
    const repo = createSampleRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    await expect(repo.sendInvitation("stu03", "is3100")).rejects.toThrow(
      "Could not save"
    );
    expect(
      (await repo.listInvitations()).some(i => i.recipientId === "stu03")
    ).toBe(false);
  });
  it("lets only the recipient accept, and persists updates", async () => {
    const storage = memoryStorage();
    const repo = createSampleRepository(storage);
    await repo.respondInvitation("seed-incoming-1", "accepted");
    expect(
      (await createSampleRepository(storage).listInvitations()).find(
        i => i.id === "seed-incoming-1"
      )?.status
    ).toBe("accepted");
    await expect(
      repo.respondInvitation("seed-incoming-2", "cancelled")
    ).rejects.toThrow("cannot change");
  });
  it("allows cancelling a sent pending invite and sending again", async () => {
    const repo = createSampleRepository(memoryStorage());
    const i = await repo.sendInvitation("stu03", "is3100");
    await repo.respondInvitation(i.id, "cancelled");
    expect((await repo.sendInvitation("stu03", "is3100")).status).toBe(
      "pending"
    );
  });
  it("restores fictional records on reset", async () => {
    const storage = memoryStorage();
    const repo = createSampleRepository(storage);
    await repo.sendInvitation("stu03", "is3100");
    await repo.resetDemo();
    expect(await repo.listInvitations()).toHaveLength(3);
    expect(
      await createSampleRepository(storage).listInvitations()
    ).toHaveLength(3);
  });
});

describe("profile storage integrity", () => {
  it("falls back to the complete fictional profile for partial saved JSON", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "citylink.demo.profile.v1",
      JSON.stringify({ id: DEMO_USER_ID, name: "Alex", skills: [] })
    );
    const repo = createSampleRepository(storage);
    const me = (await repo.getStudents()).find(s => s.id === DEMO_USER_ID)!;
    expect(me).toEqual(sampleStudents[0]);
    await expect(
      repo.updateProfile({ ...me, bio: "Updated demo biography." })
    ).resolves.toMatchObject({ bio: "Updated demo biography." });
  });
  it("persists valid edited fields and retrieves them in a new session", async () => {
    const storage = memoryStorage();
    const updated = {
      ...sampleStudents[0],
      bio: "I like collaborative work.",
      skills: ["Python", "SQL"],
      year: 4,
    };
    await createSampleRepository(storage).updateProfile(updated);
    expect(
      (await createSampleRepository(storage).getStudents()).find(
        s => s.id === DEMO_USER_ID
      )
    ).toEqual(updated);
  });
});
