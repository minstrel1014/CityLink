import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  supabaseClient,
  supabaseClientConfiguration,
  type SupabaseClientConfiguration,
} from "@/lib/supabaseClient";

export type SupabaseSessionStatus =
  | "unconfigured"
  | "loading"
  | "ready"
  | "error";

export interface SupabaseSessionState {
  configuration: SupabaseClientConfiguration;
  status: SupabaseSessionStatus;
  session: Session | null;
  user: User | null;
  authEvent: AuthChangeEvent | null;
  /**
   * Increments for a new sign-in/sign-out event, but not for an ordinary token
   * refresh. Guards use it to reject actions from an older session.
   */
  authGeneration?: number;
  error: string | null;
}

const SupabaseSessionContext = createContext<SupabaseSessionState | null>(null);

const initialState: SupabaseSessionState = {
  configuration: supabaseClientConfiguration,
  status: supabaseClient ? "loading" : "unconfigured",
  session: null,
  user: null,
  authEvent: null,
  authGeneration: 0,
  error: null,
};

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const authGeneration = useRef(0);

  useEffect(() => {
    if (!supabaseClient) return;

    let isActive = true;
    let receivedAuthEvent = false;

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      receivedAuthEvent = true;
      if (!isActive) return;

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "PASSWORD_RECOVERY"
      ) {
        authGeneration.current += 1;
      }
      setState({
        configuration: "ready",
        status: "ready",
        session,
        user: session?.user ?? null,
        authEvent: event,
        authGeneration: authGeneration.current,
        error: null,
      });
    });

    void supabaseClient.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!isActive || receivedAuthEvent) return;

        if (error) {
          setState({
            configuration: "ready",
            status: "error",
            session: null,
            user: null,
            authEvent: null,
            authGeneration: authGeneration.current,
            error: error.message,
          });
          return;
        }

        setState({
          configuration: "ready",
          status: "ready",
          session: sessionData.session,
          user: sessionData.session?.user ?? null,
          authEvent: null,
          authGeneration: authGeneration.current,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!isActive || receivedAuthEvent) return;

        setState({
          configuration: "ready",
          status: "error",
          session: null,
          user: null,
          authEvent: null,
          authGeneration: authGeneration.current,
          error:
            error instanceof Error
              ? error.message
              : "Could not restore the Supabase session.",
        });
      });

    return () => {
      isActive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <SupabaseSessionContext.Provider value={state}>
      {children}
    </SupabaseSessionContext.Provider>
  );
}

export function useSupabaseSession() {
  const state = useContext(SupabaseSessionContext);
  if (!state) {
    throw new Error(
      "useSupabaseSession must be used within SupabaseSessionProvider."
    );
  }
  return state;
}
