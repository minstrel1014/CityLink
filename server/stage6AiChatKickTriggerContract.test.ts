import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static pins for the one-shot kick.
 *
 * Adam's 2026-11-25 scope is narrow and mostly negative: no pg_cron, no sweep, no
 * polling, no retry, and a failed kick must not roll back the request. Those are
 * properties of the SQL text, so they are pinned here rather than left to review.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_KICK_TRIGGER_PROPOSAL.sql"
);
const sql = readFileSync(sqlPath, "utf8");
/** Comments explain the ban; they are not the ban. Strip them before scanning. */
const sqlCode = sql
  .split("\n")
  .filter(line => !line.trimStart().startsWith("--"))
  .join("\n");
const drawerPath = path.resolve(
  here,
  "../client/src/components/citylink/GroupAiDrawer.tsx"
);
const drawer = readFileSync(drawerPath, "utf8");

describe("kick trigger — shape", () => {
  it("fires after insert, once per queued row", () => {
    expect(sql).toContain("after insert on public.group_ai_requests");
    expect(sql).toContain("for each row");
    expect(sql).toContain("when (new.status = 'queued')");
  });

  it("makes exactly one HTTP attempt per insert", () => {
    expect(sql.match(/net\.http_post\(/g)).toHaveLength(1);
  });

  it("cannot abort the insert that created the request", () => {
    expect(sql).toContain("exception");
    expect(sql).toContain("when others then");
    // A re-raise would defeat the guard.
    expect(sql).not.toMatch(/when others then[\s\S]*?raise\s*;/);
  });

  it("has no scheduler, no loop and no retry", () => {
    expect(sqlCode).not.toContain("cron.schedule");
    expect(sqlCode).not.toContain("pg_cron");
    expect(sqlCode).not.toMatch(/\bloop\b/i);
    expect(sqlCode).not.toMatch(/retry/i);
  });

  it("keeps the secret out of the file", () => {
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("group_ai_executor_key");
    expect(sql).not.toContain("service_role");
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("is a definer function with a pinned search_path and no public execute", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke all on function private.kick_group_ai_executor() from anon"
    );
    expect(sql).toContain(
      "revoke all on function private.kick_group_ai_executor() from authenticated"
    );
  });

  it("says it is a draft", () => {
    expect(sql).toContain("Draft. Not applied.");
  });
});

describe("drawer — no pretending", () => {
  it("never renders an answer from a local copy", () => {
    expect(drawer).not.toContain("composeMockReply");
    expect(drawer).not.toContain("setAnswer");
  });

  it("asks the server and waits", () => {
    expect(drawer).toContain("beginGroupAiRequest");
    expect(drawer).toContain("waitForAiAnswer");
  });

  it("shows a distinct still-pending message instead of a fake failure", () => {
    expect(drawer).toContain("stillPending");
  });

  it("shows the context and the daily allowance without hardcoding them", () => {
    // Adam, 2026-11-25 14:55. The numbers must come from shared/aiRateLimit.ts,
    // which a static SQL test already pins against the RPC's literals; retyping
    // 10 or 20 here would create a second source of truth.
    expect(drawer).toContain("AI_RATE_LIMITS.perUserPerDay");
    expect(drawer).toContain("AI_RATE_LIMITS.perGroupPerDay");
    expect(drawer).toContain("AI_CHAT_LIMITS.chatChars");
    expect(drawer).toContain("這次送出");
    expect(drawer).toContain("每日額度");
    expect(drawer).toContain("AI_CHAT_COPY.sending");
    expect(drawer).toContain("AI_CHAT_COPY.waitingForAnswer");
  });

  it("posts the question into the room, after begin and before polling", () => {
    // Adam, 2026-11-25 14:52: a question sent to the AI should appear in the chat
    // like any other message. Order matters twice: posting after `begin` keeps the
    // question out of its own context, and posting before the poll keeps the
    // question above the answer rather than below it.
    const begin = drawer.indexOf("await beginGroupAiRequest");
    const post = drawer.indexOf("await sendGroupChatMessage");
    const poll = drawer.indexOf("await waitForAiAnswer");
    expect(begin).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(begin);
    expect(poll).toBeGreaterThan(post);
  });
});
