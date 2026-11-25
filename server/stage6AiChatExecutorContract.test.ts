import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTEXT_DROPPED_NOTICE } from "../shared/aiChatContext";
import {
  AI_REPLY_HARD_LIMIT,
  AI_REPLY_TRUNCATION_NOTICE,
} from "../shared/aiChatReply";

/**
 * The executor cannot import `shared/` — Deno rejects the extensionless relative
 * imports those modules use — so it carries copies of three constants and two
 * notices. Copies drift; these assertions are the reason they cannot drift
 * silently.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const executor = readFileSync(
  path.resolve(here, "../supabase/functions/group-ai-executor/index.ts"),
  "utf8"
);

describe("group AI executor, statically", () => {
  it("caps answers at the shared hard limit, notice included", () => {
    expect(executor).toContain(`const ANSWER_CAP = ${AI_REPLY_HARD_LIMIT};`);
    expect(executor).toContain(AI_REPLY_TRUNCATION_NOTICE);
    // The notice has to be subtracted from the cap, not appended after it.
    expect(executor).toMatch(
      /ANSWER_CAP - Array\.from\(TRUNCATION_NOTICE\)\.length/
    );
  });

  it("uses the shared dropped-context notice verbatim", () => {
    expect(executor).toContain(CONTEXT_DROPPED_NOTICE);
  });

  it("reaches the queue only through the two service-role functions", () => {
    expect(executor).toContain('rpc("claim_next_group_ai_request")');
    expect(executor).toContain('rpc("finish_group_ai_request"');
    // No table reads: both tables are revoked from service_role, so a `.from(`
    // call here would fail at runtime rather than at review time.
    expect(executor).not.toMatch(/\.from\("/);
  });

  it("uses the finish parameter names that exist", () => {
    for (const name of [
      "p_request_id",
      "p_body",
      "p_truncated",
      "p_dropped_context",
      "p_chat_chars",
      "p_file_chars",
      "p_files_used",
      "p_error_code",
    ]) {
      expect(executor, name).toContain(name);
    }
    // A near-miss name is a runtime 404 from PostgREST, not a type error.
    expect(executor).not.toContain("p_files_truncated");
  });

  it("takes the model id and the key from the environment", () => {
    expect(executor).toContain('Deno.env.get("XAI_MODEL")');
    expect(executor).toContain('Deno.env.get("XAI_API_KEY")');
    // An unset model falls back to an empty string, and `readEnv` refuses to run
    // with one: that is the fail-closed path, so no model name may appear here.
    expect(executor).toContain('["XAI_MODEL", xaiModel]');
    expect(executor).not.toMatch(/model:\s*"grok/);
  });

  it("refuses callers that do not present the service-role key", () => {
    expect(executor).toContain('request.headers.get("authorization")');
    // Deployed version 6 reports why it refused: the role claim it saw and how
    // long the token was. A bare 401 cost three debugging rounds on 2026-11-25.
    expect(executor).toContain('error: "unauthorized"');
    expect(executor).toContain("role:");
    expect(executor).toContain("token_length:");
  });
});
