import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  MAX_DISPLAY_NAME_LENGTH,
  updateOwnDisplayName,
} from "@/lib/supabaseProfile";

const DEFAULT_NAME = "New CityLink member";

export default function DisplayNameGate({ children }: { children: ReactNode }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? session.user?.id : undefined;
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setNeedsName(false);
    setError("");
    if (!userId || !supabaseClient)
      return () => {
        active = false;
      };
    void supabaseClient
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active || loadError) return;
        const current = data?.display_name;
        if (
          typeof current === "string" &&
          (!current.trim() || current === DEFAULT_NAME)
        ) {
          setName("");
          setNeedsName(true);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

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
    setSaving(true);
    setError("");
    try {
      await updateOwnDisplayName(userId, value);
      setNeedsName(false);
    } catch {
      setError("Your name was not saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {children}
      {needsName && (
        <div
          className="display-name-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="display-name-title"
        >
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
        </div>
      )}
    </>
  );
}
