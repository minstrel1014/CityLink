import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCurrentTermCoursemateProfile,
  getStage6ErrorMessage,
  type CoursemateProfile,
} from "@/lib/supabaseStage6";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

export default function CoursemateProfilePage({
  courseId,
  profileId,
}: {
  courseId: string;
  profileId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const [profile, setProfile] = useState<CoursemateProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLoading(false);
      setError("Sign in to view this coursemate profile.");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");
    void getCurrentTermCoursemateProfile(userId, courseId, profileId)
      .then(result => {
        if (active) {
          setProfile(result);
          setLoading(false);
        }
      })
      .catch(loadError => {
        if (active) {
          setError(getStage6ErrorMessage(loadError));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, profileId, userId]);

  return (
    <Stage6Layout title="Coursemate profile">
      <Link
        className="text-link"
        href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
      >
        <ArrowLeft size={14} /> Back to people
      </Link>
      {loading ? (
        <Stage6Status
          kind="loading"
          title="Loading profile…"
          message="CityLink is checking that you share this current-term course."
        />
      ) : !profile ? (
        <Stage6Status
          kind="unauthorized"
          title="Profile unavailable"
          message={error}
        />
      ) : (
        <section className="stage6-section">
          <p className="eyebrow">CURRENT-TERM COURSEMATE</p>
          <h1>{profile.displayName}</h1>
          <p>
            {profile.major ?? "Major not set"} · Year {profile.year}
          </p>
          <h2>About</h2>
          <p className="bio-text">{profile.bio || "No bio added yet."}</p>
          <h2>Skills</h2>
          <div className="skill-tags large-tags">
            {profile.skills.length ? (
              profile.skills.map((skill, index) => (
                <span key={`${skill}-${index}`}>{skill}</span>
              ))
            ) : (
              <span>No skills added yet</span>
            )}
          </div>
        </section>
      )}
    </Stage6Layout>
  );
}
