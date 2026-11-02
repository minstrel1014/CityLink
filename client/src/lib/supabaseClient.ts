import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseClientConfiguration =
  | "missing"
  | "incomplete"
  | "invalid-url"
  | "ready";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !!url.host
    );
  } catch {
    return false;
  }
}

export const supabaseClientConfiguration: SupabaseClientConfiguration =
  !supabaseUrl && !publishableKey
    ? "missing"
    : !supabaseUrl || !publishableKey
      ? "incomplete"
      : !isValidHttpUrl(supabaseUrl)
        ? "invalid-url"
        : "ready";

export const supabaseClient: SupabaseClient | null =
  supabaseClientConfiguration === "ready"
    ? createClient(supabaseUrl, publishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;
