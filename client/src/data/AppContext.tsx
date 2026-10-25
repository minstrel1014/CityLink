import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { repository, hasDemoStorage } from "./repository";
import {
  DEMO_USER_ID,
  type Course,
  type Student,
  type Enrolment,
  type Invitation,
} from "./sampleData";
interface AppState {
  courses: Course[];
  students: Student[];
  enrolments: Enrolment[];
  invitations: Invitation[];
  me: Student;
  invite: (studentId: string, courseId: string) => Promise<void>;
  respond: (
    id: string,
    status: "accepted" | "declined" | "cancelled"
  ) => Promise<void>;
  saveProfile: (profile: Student) => Promise<void>;
  reset: () => Promise<void>;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Omit<
    AppState,
    "invite" | "respond" | "saveProfile" | "reset"
  > | null>(null);
  const [error, setError] = useState("");
  async function load() {
    try {
      const [courses, students, enrolments, invitations] = await Promise.all([
        repository.getCourses(),
        repository.getStudents(),
        repository.getEnrolments(),
        repository.listInvitations(),
      ]);
      setData({
        courses,
        students,
        enrolments,
        invitations,
        me: students.find(s => s.id === DEMO_USER_ID)!,
      });
      setError("");
    } catch {
      setError("The demo could not load. Please try again.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (error)
    return (
      <div className="loading-screen">
        <h2>{error}</h2>
        <button className="primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="loading-screen">
        <span className="brand-icon">c</span>
        <p>Linking things up…</p>
      </div>
    );
  const value: AppState = {
    ...data,
    async invite(studentId, courseId) {
      try {
        await repository.sendInvitation(studentId, courseId);
        await load();
        toast.success("Invitation sent!", {
          description: hasDemoStorage
            ? "Saved in this browser. You can find it in Invitations."
            : "Saved for this session only. Browser storage is unavailable.",
        });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Unable to send invitation."
        );
        throw e;
      }
    },
    async respond(id, status) {
      try {
        await repository.respondInvitation(id, status);
        await load();
        toast.success(
          status === "accepted"
            ? "Invitation accepted"
            : status === "declined"
              ? "Invitation declined"
              : "Invitation cancelled",
          { description: "Your demo invitation record has been updated." }
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Unable to update invitation."
        );
      }
    },
    async saveProfile(profile) {
      await repository.updateProfile(profile);
      await load();
      toast.success("Profile saved", {
        description: "Changes are stored only in this browser.",
      });
    },
    async reset() {
      await repository.resetDemo();
      await load();
      toast.success("Demo reset to the original sample data.");
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCityLink() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("CityLink context missing");
  return ctx;
}
