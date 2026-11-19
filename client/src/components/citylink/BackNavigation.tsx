import { useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { findBackTarget, initialAppHistory } from "@/lib/appHistory";
import {
  getAppHistoryStore,
  type AppHistoryStore,
  type HistorySnapshot,
} from "@/lib/appHistoryStore";
import "./BackNavigation.css";

const emptySnapshot: HistorySnapshot = {
  history: initialAppHistory({ href: "/", key: null }),
  pending: false,
};
const noSubscription = () => () => {};
const getEmptySnapshot = () => emptySnapshot;

export function BackControl({
  allowSignIn,
  store = getAppHistoryStore(),
}: {
  allowSignIn: boolean;
  store?: AppHistoryStore;
}) {
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getSnapshot ?? getEmptySnapshot,
    store?.getSnapshot ?? getEmptySnapshot
  );
  const available =
    !!store &&
    !snapshot.pending &&
    !!findBackTarget(snapshot.history, allowSignIn);
  return (
    <nav className="citylink-back-navigation" aria-label="Page navigation">
      <button
        className="citylink-back-control"
        type="button"
        aria-label="Go back to previous page"
        title={
          available ? "Go back to previous page" : "No previous page available"
        }
        disabled={!available}
        onClick={() => store?.goBack(allowSignIn)}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </button>
    </nav>
  );
}

/** Remains inside DisplayNameGate so navigation cannot uncover gated content. */
export function BackNavigationFrame({
  children,
  store,
}: {
  children: ReactNode;
  store?: AppHistoryStore;
}) {
  const session = useSupabaseSession();
  const allowSignIn =
    session.status === "unconfigured" ||
    (session.status === "ready" && !session.user);
  return (
    <div className="citylink-route-frame">
      <BackControl allowSignIn={allowSignIn} store={store} />
      {children}
    </div>
  );
}
