import { describe, expect, it } from "vitest";
import {
  CITYU_SIGNUP_REJECTION_MESSAGE,
  cleanSupabaseRecoveryCallbackUrl,
  getAuthEmailRedirectTo,
  getRegistrationPendingMessage,
  getSupabaseAuthErrorMessage,
  isDuplicateRegistration,
  isSupabaseRecoveryCallback,
} from "./supabaseAuthMessages";

describe("Supabase Auth form helpers", () => {
  it("redirects email verification to the current application root", () => {
    expect(getAuthEmailRedirectTo("https://citylink.example")).toBe(
      "https://citylink.example/"
    );
  });

  it("detects Supabase's obfuscated duplicate signup response", () => {
    expect(isDuplicateRegistration([])).toBe(true);
    expect(isDuplicateRegistration([{ provider: "email" }])).toBe(false);
    expect(isDuplicateRegistration(null)).toBe(false);
  });

  it("does not reveal whether an email is already registered", () => {
    expect(
      getSupabaseAuthErrorMessage(
        { message: "User already registered" },
        "sign-up"
      )
    ).toBe(
      "An account may already exist for this email. Try signing in instead."
    );
  });

  it("shows a generic incorrect-credentials message", () => {
    expect(
      getSupabaseAuthErrorMessage(
        { message: "Invalid login credentials" },
        "sign-in"
      )
    ).toBe("The email or password isn't correct.");
  });

  it("asks an unverified user to confirm their email", () => {
    expect(
      getSupabaseAuthErrorMessage({ code: "email_not_confirmed" }, "sign-in")
    ).toMatch(/verify your email/i);
  });

  it("keeps password-reset errors generic", () => {
    expect(
      getSupabaseAuthErrorMessage(
        { message: "private account lookup details" },
        "password-reset"
      )
    ).not.toContain("private account lookup details");
  });

  it("keeps password-update errors generic", () => {
    expect(
      getSupabaseAuthErrorMessage(
        { message: "private account lookup details" },
        "password-update"
      )
    ).not.toContain("private account lookup details");
  });

  it("recognizes Supabase recovery callback parameters in the URL", () => {
    expect(
      isSupabaseRecoveryCallback(
        "https://citylink.example/?campaign=fall#access_token=a&type=recovery"
      )
    ).toBe(true);
    expect(
      isSupabaseRecoveryCallback("https://citylink.example/#profile")
    ).toBe(false);
  });

  it("removes only Auth callback parameters and preserves unrelated URL state", () => {
    expect(
      cleanSupabaseRecoveryCallbackUrl(
        "https://citylink.example/me?campaign=fall&code=pkce#access_token=a&refresh_token=b&type=recovery&section=profile"
      )
    ).toBe("/me?campaign=fall#section=profile");
    expect(
      cleanSupabaseRecoveryCallbackUrl("https://citylink.example/me#profile")
    ).toBe("/me#profile");
  });

  it("does not promise that a verification email was delivered", () => {
    const message = getRegistrationPendingMessage();
    expect(message).toMatch(/may send a verification email/i);
    expect(message).not.toMatch(/email has been sent/i);
  });

  it("relays the CityU signup hook rejection instead of a generic failure", () => {
    expect(
      getSupabaseAuthErrorMessage(
        {
          code: "hook_rejected",
          message:
            "Registration requires a CityU email address ending in @my.cityu.edu.hk.",
        },
        "sign-up"
      )
    ).toBe(CITYU_SIGNUP_REJECTION_MESSAGE);
  });

  it("uses the approved CityU wording when only the error code is known", () => {
    expect(
      getSupabaseAuthErrorMessage({ code: "hook_rejected" }, "sign-up")
    ).toBe(
      "Registration requires a CityU email address ending in @my.cityu.edu.hk."
    );
  });

  it("still hides unrelated signup failures behind the generic message", () => {
    expect(
      getSupabaseAuthErrorMessage(
        {
          code: "unexpected_failure",
          message: "Database error saving new user",
        },
        "sign-up"
      )
    ).toBe(
      "Unable to create the account. Please try again or check the Supabase Auth settings."
    );
  });
});
