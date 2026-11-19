import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Avatar } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import type { Student } from "@/data/sampleData";
import {
  getCurrentTermCoursemateProfile,
  getStage6ErrorMessage,
  type CoursemateProfile,
} from "@/lib/supabaseStage6";
import { getProfileInitials } from "@/lib/supabaseProfile";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

function displayStudent(profile: CoursemateProfile): Student {
  return {
    id: profile.profileId,
    studentId: "Shared course profile",
    name: profile.displayName,
    major: profile.major ?? "Not set",
    year: profile.year,
    bio: profile.bio,
    skills: profile.skills,
    status: "open",
    avatar: getProfileInitials(profile.displayName),
    color: "sage",
  };
}

export default function CoursemateProfilePage({
  courseId,
  profileId,
}: {
  courseId: string;
  profileId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const authGeneration = session.authGeneration ?? 0;
  const [profile, setProfile] = useState<CoursemateProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setProfile(null);
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
  }, [authGeneration, courseId, profileId, userId]);

  return (
    <Stage6Layout title="Coursemate profile">
      <Link
        className="text-link stage6-profile-back"
        href={`/my-courses/${encodeURIComponent(courseId)}/groups`}
      >
        Find your groupmate
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
        <>
          <div className="auth-profile-heading">
            <div>
              <p className="eyebrow">CURRENT-TERM COURSEMATE</p>
              <h1>Coursemate profile</h1>
              <p>
                This profile is visible because you share a current-term course.
              </p>
            </div>
          </div>
          <div className="my-profile-grid auth-profile-grid">
            <section className="my-student-card">
              <div className="eyebrow">AUTHENTICATED PROFILE</div>
              <Avatar student={displayStudent(profile)} size="large" />
              <h2>{profile.displayName}</h2>
              <p>Shared course profile</p>
              <span className="course-membership enrolled">
                Current-term coursemate
              </span>
              <div className="my-card-facts">
                <span>
                  Major<strong>{profile.major || "Not set"}</strong>
                </span>
                <span>
                  Year of study<strong>Year {profile.year}</strong>
                </span>
              </div>
              <div className="auth-profile-separation">
                <ShieldCheck size={16} />
                <span>
                  Only approved shared-course fields are shown. Email, student
                  ID, account status and private records are never included.
                </span>
              </div>
            </section>

            <section className="profile-form-panel">
              <section className="profile-section no-border">
                <h2>About me</h2>
                <p className="bio-text">
                  {profile.bio || "This coursemate has not added a bio yet."}
                </p>
              </section>
              <section className="profile-section">
                <h2>My strengths</h2>
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
              <section className="profile-section">
                <h2>Study information</h2>
                <p className="bio-text">
                  {profile.major || "Major not set"} · Year {profile.year}
                </p>
              </section>
            </section>
          </div>
        </>
      )}
    </Stage6Layout>
  );
}
