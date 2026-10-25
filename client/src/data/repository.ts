import {
  DEMO_USER_ID,
  sampleCourses,
  sampleStudents,
  sampleEnrolments,
  sampleInvitations,
  type Course,
  type Student,
  type Enrolment,
  type Invitation,
} from "./sampleData";
export interface CityLinkRepository {
  getCourses(): Promise<Course[]>;
  getStudents(): Promise<Student[]>;
  getEnrolments(): Promise<Enrolment[]>;
  listInvitations(): Promise<Invitation[]>;
  sendInvitation(recipientId: string, courseId: string): Promise<Invitation>;
  respondInvitation(
    id: string,
    status: "accepted" | "declined" | "cancelled"
  ): Promise<void>;
  updateProfile(profile: Student): Promise<Student>;
  resetDemo(): Promise<void>;
}
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const INVITATIONS_KEY = "citylink.demo.invitations.v1";
const PROFILE_KEY = "citylink.demo.profile.v1";
function isDemoProfile(value: unknown): value is Student {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    p.id === DEMO_USER_ID &&
    p.studentId === sampleStudents[0].studentId &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    typeof p.bio === "string" &&
    p.bio.trim().length > 0 &&
    p.bio.length <= 600 &&
    typeof p.major === "string" &&
    p.major.trim().length > 0 &&
    p.major.length <= 100 &&
    typeof p.year === "number" &&
    Number.isInteger(p.year) &&
    p.year >= 1 &&
    p.year <= 6 &&
    typeof p.status === "string" &&
    ["open", "considering", "full"].includes(p.status) &&
    typeof p.avatar === "string" &&
    p.avatar.length > 0 &&
    typeof p.color === "string" &&
    ["sage", "peach", "lavender", "blue", "yellow", "pink"].includes(p.color) &&
    Array.isArray(p.skills) &&
    p.skills.length <= 20 &&
    p.skills.every(
      s => typeof s === "string" && s.trim().length > 0 && s.length <= 60
    )
  );
}
export function createSampleRepository(
  storage?: DemoStorage
): CityLinkRepository {
  let invitations = structuredClone(sampleInvitations);
  let profile = structuredClone(sampleStudents[0]);
  // No silent success on failed writes. The UI only confirms after this returns.
  function persist() {
    storage?.setItem(INVITATIONS_KEY, JSON.stringify(invitations));
  }
  try {
    const saved = storage?.getItem(INVITATIONS_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          i =>
            i &&
            typeof i.id === "string" &&
            typeof i.createdAt === "string" &&
            sampleCourses.some(c => c.id === i.courseId) &&
            sampleStudents.some(s => s.id === i.senderId) &&
            sampleStudents.some(s => s.id === i.recipientId) &&
            ["pending", "accepted", "declined", "cancelled"].includes(i.status)
        )
      )
        invitations = parsed as Invitation[];
    }
    const savedProfile = storage?.getItem(PROFILE_KEY);
    if (savedProfile) {
      const parsed: unknown = JSON.parse(savedProfile);
      if (isDemoProfile(parsed)) profile = parsed;
    }
  } catch {
    /* Corrupt or inaccessible storage starts with fictional fixtures. */
  }
  const enrolled = (studentId: string, courseId: string) =>
    sampleEnrolments.some(
      e => e.studentId === studentId && e.courseId === courseId
    );
  return {
    async getCourses() {
      return structuredClone(sampleCourses);
    },
    async getStudents() {
      return structuredClone(
        sampleStudents.map(s => (s.id === DEMO_USER_ID ? profile : s))
      );
    },
    async getEnrolments() {
      return structuredClone(sampleEnrolments);
    },
    async listInvitations() {
      return structuredClone(
        invitations.filter(
          i => i.senderId === DEMO_USER_ID || i.recipientId === DEMO_USER_ID
        )
      );
    },
    async sendInvitation(recipientId, courseId) {
      if (recipientId === DEMO_USER_ID)
        throw new Error("You cannot invite yourself.");
      if (!enrolled(DEMO_USER_ID, courseId) || !enrolled(recipientId, courseId))
        throw new Error("Both students must be enrolled in this course.");
      const student = sampleStudents.find(s => s.id === recipientId);
      if (!student || student.status === "full")
        throw new Error("This student already has a group.");
      const active = invitations.find(
        i =>
          i.courseId === courseId &&
          ((i.senderId === DEMO_USER_ID && i.recipientId === recipientId) ||
            (i.senderId === recipientId && i.recipientId === DEMO_USER_ID)) &&
          ["pending", "accepted"].includes(i.status)
      );
      if (active)
        throw new Error(
          active.senderId === DEMO_USER_ID
            ? "You already have an active invitation for this course."
            : "This student has already invited you. Check your invitations."
        );
      const record: Invitation = {
        id: crypto.randomUUID(),
        senderId: DEMO_USER_ID,
        recipientId,
        courseId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const previous = invitations;
      invitations = [...invitations, record];
      try {
        persist();
      } catch {
        invitations = previous;
        throw new Error(
          "Could not save this invitation. Please allow browser storage and try again."
        );
      }
      return structuredClone(record);
    },
    async respondInvitation(id, status) {
      const record = invitations.find(i => i.id === id);
      if (!record || record.status !== "pending")
        throw new Error("This invitation is no longer pending.");
      if (
        status === "cancelled"
          ? record.senderId !== DEMO_USER_ID
          : record.recipientId !== DEMO_USER_ID
      )
        throw new Error("You cannot change this invitation.");
      const previous = invitations;
      invitations = invitations.map(i => (i.id === id ? { ...i, status } : i));
      try {
        persist();
      } catch {
        invitations = previous;
        throw new Error("Could not save the invitation update.");
      }
    },
    async updateProfile(updated) {
      if (updated.id !== DEMO_USER_ID)
        throw new Error("You may only edit your own demo profile.");
      if (!isDemoProfile(updated))
        throw new Error(
          "Please enter a valid bio, major, year and skill list."
        );
      storage?.setItem(PROFILE_KEY, JSON.stringify(updated));
      profile = structuredClone(updated);
      return structuredClone(profile);
    },
    async resetDemo() {
      storage?.removeItem(INVITATIONS_KEY);
      storage?.removeItem(PROFILE_KEY);
      invitations = structuredClone(sampleInvitations);
      profile = structuredClone(sampleStudents[0]);
    },
  };
}
let browserStorage: DemoStorage | undefined;
try {
  browserStorage =
    typeof window !== "undefined" ? window.localStorage : undefined;
} catch {
  /* UI displays storage availability separately. */
}
export const repository = createSampleRepository(browserStorage);
export const hasDemoStorage = !!browserStorage;
export function getClassmates(
  courseId: string,
  students: Student[],
  enrolments: Enrolment[],
  search = ""
) {
  const ids = new Set(
    enrolments.filter(e => e.courseId === courseId).map(e => e.studentId)
  );
  const query = search.trim().toLowerCase();
  return students.filter(
    s =>
      s.id !== DEMO_USER_ID &&
      ids.has(s.id) &&
      (!query ||
        s.name.toLowerCase().includes(query) ||
        s.studentId.toLowerCase().includes(query))
  );
}
