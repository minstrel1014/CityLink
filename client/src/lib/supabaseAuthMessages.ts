export type AuthOperation =
  | "sign-in"
  | "sign-up"
  | "password-reset"
  | "password-update";

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
};

// Mirrors the message returned by public.hook_cityu_signup (Before User Created).
// Only used when Supabase rejects the signup without relaying its own text.
export const CITYU_SIGNUP_REJECTION_MESSAGE =
  "Registration requires a CityU email address ending in @my.cityu.edu.hk.";

export function getAuthEmailRedirectTo(origin: string) {
  return new URL("/", origin).toString();
}

const recoveryCallbackParameters = new Set([
  "access_token",
  "refresh_token",
  "token_hash",
  "code",
  "type",
  "expires_at",
  "expires_in",
  "token_type",
  "provider_token",
  "provider_refresh_token",
]);

function decodedPair(segment: string) {
  const separator = segment.indexOf("=");
  const rawKey = separator === -1 ? segment : segment.slice(0, separator);
  const rawValue = separator === -1 ? "" : segment.slice(separator + 1);
  try {
    return {
      key: decodeURIComponent(rawKey.replace(/\+/g, " ")),
      value: decodeURIComponent(rawValue.replace(/\+/g, " ")),
    };
  } catch {
    return { key: rawKey, value: rawValue };
  }
}

function stripRecoveryCallbackParameters(serialized: string) {
  if (!serialized) return "";
  return serialized
    .split("&")
    .filter(segment => {
      const { key, value } = decodedPair(segment);
      if (!recoveryCallbackParameters.has(key)) return true;
      return key === "type" && value !== "recovery";
    })
    .join("&");
}

export function isSupabaseRecoveryCallback(href: string) {
  const url = new URL(href);
  return (
    url.searchParams.get("type") === "recovery" ||
    new URLSearchParams(url.hash.slice(1)).get("type") === "recovery"
  );
}

export function cleanSupabaseRecoveryCallbackUrl(href: string) {
  const url = new URL(href);
  const search = stripRecoveryCallbackParameters(url.search.slice(1));
  const hash = stripRecoveryCallbackParameters(url.hash.slice(1));
  return `${url.pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

export function getRegistrationPendingMessage() {
  return "Registration was processed. If this address is eligible, Supabase may send a verification email. Check your inbox and spam folder, then verify before signing in. Delivery depends on the project’s Auth and email-provider settings.";
}

export function isDuplicateRegistration(
  identities: readonly unknown[] | null | undefined
) {
  return Array.isArray(identities) && identities.length === 0;
}

export function getSupabaseAuthErrorMessage(
  error: unknown,
  operation: AuthOperation
) {
  const details =
    typeof error === "object" && error !== null ? (error as AuthErrorLike) : {};
  const message =
    typeof details.message === "string" ? details.message.toLowerCase() : "";
  const code =
    typeof details.code === "string" ? details.code.toLowerCase() : "";

  if (
    operation === "sign-up" &&
    (code === "user_already_exists" ||
      message.includes("already registered") ||
      message.includes("already exists"))
  ) {
    return "An account may already exist for this email. Try signing in instead.";
  }

  if (operation === "password-reset") {
    return "We couldn’t request a password reset. Check the address and try again later.";
  }

  if (operation === "password-update") {
    return "We couldn’t update your password. Check the new password and try again.";
  }

  if (
    operation === "sign-in" &&
    (code === "email_not_confirmed" ||
      message.includes("email not confirmed") ||
      message.includes("email is not confirmed"))
  ) {
    return "Please verify your email using the message from Supabase before signing in.";
  }

  if (
    operation === "sign-in" &&
    (message.includes("invalid login credentials") ||
      message.includes("invalid credentials") ||
      message.includes("email or password"))
  ) {
    return "The email or password isn't correct.";
  }

  if (message.includes("invalid email") || code === "email_address_invalid") {
    return "Enter a valid email address.";
  }

  if (
    operation === "sign-up" &&
    (code === "weak_password" ||
      message.includes("weak password") ||
      message.includes("password should be"))
  ) {
    return "Choose a stronger password with at least 6 characters.";
  }

  if (
    code.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "There have been too many attempts. Wait a few minutes and try again.";
  }

  if (
    operation === "sign-up" &&
    (code === "hook_rejected" ||
      message.includes("@my.cityu.edu.hk") ||
      message.includes("cityu"))
  ) {
    const rawMessage =
      typeof details.message === "string" ? details.message.trim() : "";
    return rawMessage && /@my\.cityu\.edu\.hk/i.test(rawMessage)
      ? rawMessage
      : CITYU_SIGNUP_REJECTION_MESSAGE;
  }

  if (operation === "sign-up") {
    return "Unable to create the account. Please try again or check the Supabase Auth settings.";
  }
  return "Unable to sign in. Please check your details and try again.";
}
