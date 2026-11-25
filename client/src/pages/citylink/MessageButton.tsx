import { MessageCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { startDirectThread } from "@/lib/supabaseDirectMessages";
import "./DirectMessages.css";

// Module-level guard so a double click cannot open two threads; deliberately not React state,
// because the capacity tests render these pages as plain function calls and only mock a small
// subset of hooks.
const inFlight = new Set<string>();

/**
 * Opens (or creates) the 1:1 conversation with another profile and navigates into the room.
 * The database refuses the call unless the two people share a current-term course, so the
 * button needs no client-side eligibility check of its own.
 */
export function MessageButton({
  otherProfileId,
  label = "Message",
}: {
  otherProfileId: string;
  label?: string;
}) {
  const session = useSupabaseSession();
  const [, navigate] = useLocation();
  // Read the id defensively: some pages mount before the session status flips to "ready", and a
  // status check here made the button disappear entirely.
  const userId =
    (session as { user?: { id?: string } | null }).user?.id ?? null;

  return (
    <span className="dm-message-wrap">
      <button
        type="button"
        className="dm-message-button"
        onClick={() => {
          if (!userId) {
            if (typeof window !== "undefined")
              window.alert("Sign in again to send a message.");
            return;
          }
          if (inFlight.has(otherProfileId)) return;
          inFlight.add(otherProfileId);
          startDirectThread(userId, otherProfileId)
            .then(threadId => {
              inFlight.delete(otherProfileId);
              navigate(`/messages/${threadId}`);
            })
            .catch((cause: unknown) => {
              inFlight.delete(otherProfileId);
              const message =
                cause instanceof Error
                  ? cause.message
                  : "The conversation could not be opened.";
              if (typeof window !== "undefined") window.alert(message);
            });
        }}
      >
        <MessageCircle size={14} /> {label}
      </button>
    </span>
  );
}

export default MessageButton;
