import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  MAX_DISPLAY_NAME_LENGTH,
  updateOwnDisplayName,
} from "@/lib/supabaseProfile";

const DEFAULT_NAME = "New CityLink member";
type GateState = "checking" | "ready" | "needs-name" | "error";

export default function DisplayNameGate({ children }: { children: ReactNode }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const authGeneration = session.authGeneration ?? 0;
  const sessionIdentity = `${userId ?? "signed-out"}:${authGeneration}`;
  const [state, setState] = useState<GateState>("checking");
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const saveGeneration = useRef(0);
  useEffect(() => {
    saveGeneration.current += 1;
    setSaving(false);
  }, [authGeneration, session.status, userId]);

  useEffect(() => {
    let active = true;
    setError("");
    setName("");
    setReadyIdentity(null);
    if (session.status === "loading") {
      setState("checking");
      return () => {
        active = false;
      };
    }
    if (!userId) {
      setState("ready");
      setReadyIdentity(sessionIdentity);
      return () => {
        active = false;
      };
    }
    if (!supabaseClient) {
      setState("error");
      setError("Supabase is not configured, so your name cannot be checked.");
      return () => {
        active = false;
      };
    }
    setState("checking");
    void (async () => {
      try {
        const { data, error: loadError } = await supabaseClient
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        if (!active) return;
        if (loadError) {
          setState("error");
          setError(
            "CityLink could not confirm your stored display name. Check your connection and try again."
          );
          return;
        }
        if (!data) {
          setState("error");
          setError(
            "Your signed-in account has no profile row, so CityLink cannot confirm your name."
          );
          return;
        }
        const current = data.display_name;
        if (
          typeof current !== "string" ||
          !current.trim() ||
          current === DEFAULT_NAME
        ) {
          setState("needs-name");
          return;
        }
        setState("ready");
        setReadyIdentity(sessionIdentity);
      } catch {
        if (!active) return;
        setState("error");
        setError(
          "CityLink could not confirm your stored display name. Check your connection and try again."
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [authGeneration, retryToken, session.status, userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;
    const value = name.trim();
    if (!value || value.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(
        `Enter a name between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters.`
      );
      return;
    }
    if (value === DEFAULT_NAME) {
      setError("Please choose your own display name.");
      return;
    }
    const saveUserId = userId;
    const generation = saveGeneration.current;
    const isCurrentSave = () =>
      saveGeneration.current === generation && userIdRef.current === saveUserId;
    setSaving(true);
    setError("");
    try {
      await updateOwnDisplayName(saveUserId, value, undefined, isCurrentSave);
      if (!isCurrentSave()) return;
      setState("ready");
      setReadyIdentity(sessionIdentity);
    } catch {
      if (!isCurrentSave()) return;
      setError("Your name was not saved. Check your connection and try again.");
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut({ scope: "local" });
    window.location.assign("/");
  }

  const identityMatches = !userId || readyIdentity === sessionIdentity;
  const effectiveState = userId && !identityMatches ? "checking" : state;
  const canRenderChildren =
    session.status === "unconfigured" ||
    session.status === "error" ||
    (session.status === "ready" && effectiveState === "ready");

  return (
    <>
      {canRenderChildren ? children : null}
      {effectiveState !== "ready" && (
        <div
          className="display-name-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="display-name-title"
        >
          {effectiveState === "checking" && (
            <div className="display-name-gate-card" role="status">
              <p className="eyebrow">CHECKING YOUR ACCOUNT</p>
              <h1 id="display-name-title">Confirming your display name…</h1>
              <p>
                CityLink blocks group pages until your stored name is confirmed.
              </p>
            </div>
          )}
          {effectiveState === "error" && (
            <div className="display-name-gate-card" role="alert">
              <p className="eyebrow">NAME CHECK UNAVAILABLE</p>
              <h1 id="display-name-title">We could not confirm your name.</h1>
              <p>{error}</p>
              <p>
                Your account stays blocked until CityLink can read a valid
                stored name. Retry the check; if it keeps failing, sign out and
                sign in again, or ask the project owner to check your profile
                row.
              </p>
              <button
                className="primary"
                type="button"
                onClick={() => setRetryToken(value => value + 1)}
              >
                Try again
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          )}
          {effectiveState === "needs-name" && (
            <form className="display-name-gate-card" onSubmit={save}>
              <p className="eyebrow">WELCOME TO CITYLINK</p>
              <h1 id="display-name-title">Set your display name</h1>
              <p>
                Your coursemates see this name on group and recruitment pages.
                Choose it once; you can change it later in your profile.
              </p>
              <label htmlFor="display-name-input">Display name</label>
              <input
                id="display-name-input"
                value={name}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                onChange={event => setName(event.target.value)}
                autoFocus
                disabled={saving}
              />
              <span className="display-name-count">
                {name.trim().length}/{MAX_DISPLAY_NAME_LENGTH}
              </span>
              {error && <p role="alert">{error}</p>}
              <button className="primary" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save and continue"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
