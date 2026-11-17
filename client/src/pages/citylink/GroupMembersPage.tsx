import { useEffect, useRef, useState } from "react";
import { ArrowRight, UserRound, Users } from "lucide-react";
import { Link } from "wouter";
import { PageHeading } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  getCurrentTermGroupMemberProfile,
  getStage6ErrorMessage,
  listCurrentTermGroupMembers,
  type CurrentTermGroupMember,
  type GroupMemberCursor,
} from "@/lib/supabaseStage6";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

type LoadState = "loading" | "ready" | "error" | "unauthorized";

export function GroupMembersPage({ groupId }: { groupId: string }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [members, setMembers] = useState<CurrentTermGroupMember[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<GroupMemberCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    const isCurrent = () =>
      active &&
      generation.current === currentGeneration &&
      currentUserId.current === userId;
    if (session.status === "loading") {
      setState("loading");
      return () => {
        active = false;
      };
    }
    if (!userId) {
      setMembers([]);
      setError("Sign in with a Supabase account to view group members.");
      setState("unauthorized");
      return () => {
        active = false;
      };
    }
    setMembers([]);
    setHasMore(false);
    setCursor(null);
    setLoadingMore(false);
    setState("loading");
    setError("");
    void listCurrentTermGroupMembers(userId, groupId)
      .then(result => {
        if (!isCurrent()) return;
        setMembers(result.items);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
        setState("ready");
      })
      .catch(loadError => {
        if (!isCurrent()) return;
        const message = getStage6ErrorMessage(loadError);
        setError(message);
        setState(
          message.toLocaleLowerCase().includes("not authorized")
            ? "unauthorized"
            : "error"
        );
      });
    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [groupId, reloadToken, session.status, userId]);

  async function loadMore() {
    if (!userId || !hasMore || !cursor || loadingMore) return;
    const expectedGeneration = generation.current;
    setLoadingMore(true);
    try {
      const page = await listCurrentTermGroupMembers(userId, groupId, cursor);
      if (
        currentUserId.current !== userId ||
        generation.current !== expectedGeneration
      )
        return;
      setMembers(previous => {
        const known = new Set(previous.map(member => member.profileId));
        return [
          ...previous,
          ...page.items.filter(member => !known.has(member.profileId)),
        ];
      });
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
      setError("");
    } catch (loadError) {
      if (generation.current === expectedGeneration) {
        setError(getStage6ErrorMessage(loadError));
      }
    } finally {
      if (generation.current === expectedGeneration) setLoadingMore(false);
    }
  }

  return (
    <Stage6Layout title="Group members">
      <PageHeading
        eyebrow="CURRENT-TERM GROUP"
        title="Group members"
        description="The server limits this roster to the existing any-shared-course audience. The group itself must be in the current term and have at least two active members."
      />
      <div className="stage6-notice" role="note">
        Only the approved profile fields are requested: name, major, year, bio
        and skills. Email, student ID, account status and raw membership rows
        are not displayed or requested by this page.
      </div>
      {session.status === "loading" || state === "loading" ? (
        <Stage6Status
          kind="loading"
          title="Checking group access…"
          message="The member list is loaded only after server-side authorization succeeds."
        />
      ) : !userId || state === "unauthorized" ? (
        <Stage6Status
          kind="unauthorized"
          title="You cannot view this member list"
          message={
            error ||
            "Sign in and confirm that you are eligible under the group’s server-checked audience rules."
          }
        />
      ) : state === "error" ? (
        <Stage6Status
          title="Group members are unavailable"
          message={error}
          retry={() => setReloadToken(value => value + 1)}
        />
      ) : members.length === 0 ? (
        <Stage6Status
          kind="empty"
          title="No eligible active members were returned"
          message="The group may have changed, or its current member list is not available to your account."
        />
      ) : (
        <section
          className="stage6-member-list"
          aria-label="Current active group members"
        >
          {error && (
            <p className="stage6-feedback error" role="alert">
              {error}
            </p>
          )}
          {members.map(member => (
            <article className="stage6-member-card" key={member.profileId}>
              <span className="stage6-member-avatar" aria-hidden="true">
                {member.displayName
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(part => part[0]?.toUpperCase())
                  .join("") || "CL"}
              </span>
              <div className="stage6-member-summary">
                <h2>{member.displayName}</h2>
                <p>
                  {member.major || "Major not provided"} · Year {member.year}
                </p>
              </div>
              <Link
                className="secondary"
                href={`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(member.profileId)}`}
                aria-label={`View ${member.displayName}'s profile`}
              >
                View profile <ArrowRight size={15} />
              </Link>
            </article>
          ))}
          {hasMore && (
            <button
              className="secondary"
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading members…" : "Load more members"}
            </button>
          )}
        </section>
      )}
    </Stage6Layout>
  );
}

export function GroupMemberProfilePage({
  groupId,
  profileId,
}: {
  groupId: string;
  profileId: string;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [profile, setProfile] = useState<CurrentTermGroupMember | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    const isCurrent = () =>
      active &&
      generation.current === currentGeneration &&
      currentUserId.current === userId;
    if (session.status === "loading") {
      setState("loading");
      return () => {
        active = false;
      };
    }
    if (!userId) {
      setProfile(null);
      setState("unauthorized");
      setError("Sign in with a Supabase account to view a coursemate profile.");
      return () => {
        active = false;
      };
    }
    setProfile(null);
    setState("loading");
    setError("");
    void getCurrentTermGroupMemberProfile(userId, groupId, profileId)
      .then(result => {
        if (!isCurrent()) return;
        setProfile(result);
        setState("ready");
      })
      .catch(loadError => {
        if (!isCurrent()) return;
        const message = getStage6ErrorMessage(loadError);
        setError(message);
        setState(
          message.toLocaleLowerCase().includes("not authorized")
            ? "unauthorized"
            : "error"
        );
      });
    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [groupId, profileId, reloadToken, session.status, userId]);

  return (
    <Stage6Layout title="Coursemate profile">
      <PageHeading
        eyebrow="GROUP MEMBER PROFILE"
        title="Coursemate profile"
        description="This profile is re-authorized by the server each time it is opened."
      />
      <div className="stage6-notice" role="note">
        This page requests only display name, major, year, bio and skills. It
        does not request email, student ID, account status or membership
        records.
      </div>
      {session.status === "loading" || state === "loading" ? (
        <Stage6Status
          kind="loading"
          title="Checking profile access…"
          message="The profile is not opened from the route ID alone; the server rechecks the approved group and shared-course audience."
        />
      ) : !userId || state === "unauthorized" ? (
        <Stage6Status
          kind="unauthorized"
          title="This coursemate profile is unavailable"
          message={
            error || "Your account is not eligible to view this profile."
          }
        />
      ) : state === "error" || !profile ? (
        <Stage6Status
          title="Profile could not be loaded"
          message={error}
          retry={() => setReloadToken(value => value + 1)}
        />
      ) : (
        <article className="stage6-profile-card">
          <span className="stage6-profile-icon" aria-hidden="true">
            <UserRound size={28} />
          </span>
          <h2>{profile.displayName}</h2>
          <p className="stage6-profile-major">
            {profile.major || "Major not provided"} · Year {profile.year}
          </p>
          <section>
            <h3>About</h3>
            <p>{profile.bio || "No bio has been added."}</p>
          </section>
          <section>
            <h3>Skills</h3>
            {profile.skills.length ? (
              <ul className="stage6-skill-list">
                {profile.skills.map((skill, index) => (
                  <li key={`${skill}-${index}`}>{skill}</li>
                ))}
              </ul>
            ) : (
              <p>No skills have been added.</p>
            )}
          </section>
          <Link
            className="secondary"
            href={`/groups/${encodeURIComponent(groupId)}/members`}
          >
            <Users size={15} /> Back to group members
          </Link>
        </article>
      )}
    </Stage6Layout>
  );
}
