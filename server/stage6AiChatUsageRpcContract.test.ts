import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_RATE_LIMITS } from "@shared/aiRateLimit";
import { AI_CHAT_COPY } from "@/lib/aiChatConsent";

/**
 * Static contract for the read-only usage RPC.
 *
 * The function exists so the drawer can show today's numbers before asking. That
 * is only honest if its counts are produced by the same predicates as
 * `begin_group_ai_request`: a reader shown "3 used" who is then refused at 3
 * would be looking at a lie. SQL cannot import TypeScript, so the binding is
 * these assertions on the text — the same arrangement as the rate-limit literals.
 *
 * Runtime behaviour (counts, refusal, UTC boundary, read-only) is proven
 * separately against a disposable PostgreSQL cluster; this file cannot see that.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const usagePath = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_USAGE_RPC_PROPOSAL.sql"
);
const deploy2Path = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql"
);
const drawerPath = path.resolve(
  here,
  "../client/src/components/citylink/GroupAiDrawer.tsx"
);
const requestsPath = path.resolve(here, "../client/src/lib/aiChatRequests.ts");

const usageSql = readFileSync(usagePath, "utf8");
const deploy2 = readFileSync(deploy2Path, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const requests = readFileSync(requestsPath, "utf8");
const code = usageSql
  .split("\n")
  .map(line => line.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

describe("group AI usage RPC, statically", () => {
  it("counts with the same predicates as begin_group_ai_request", () => {
    // The three fragments that decide the numbers, copied verbatim from the
    // quota block. If either side is edited alone, this fails.
    for (const predicate of [
      "  where q.group_id = p_group_id\n    and q.created_at >= v_day_start\n    and not (q.status = 'queued' and q.claimed_at is null);",
      "  where q.asked_by = v_actor\n    and q.created_at >= v_day_start\n    and not (q.status = 'queued' and q.claimed_at is null);",
    ]) {
      expect(deploy2).toContain(predicate);
      expect(usageSql).toContain(predicate);
    }
    // The per-user count must not grow a group filter: the personal cap is one
    // allowance across every group, and the drawer says so.
    const userCount = usageSql
      .slice(usageSql.indexOf("into v_user_today"))
      .split(";")[0];
    expect(userCount).not.toContain("group_id");
  });

  it("uses the same UTC day boundary as the refusal path", () => {
    expect(deploy2).toContain(
      "v_day_start := date_trunc('day', now(), 'UTC');"
    );
    expect(usageSql).toContain(
      "v_day_start := date_trunc('day', now(), 'UTC');"
    );
    // No unqualified date_trunc: the whole point of the pin is that a session
    // timezone cannot move the reset.
    expect(code).not.toMatch(/date_trunc\('day', now\(\)\)/);
  });

  it("derives its limits and stale window from the same numbers as the client", () => {
    expect(usageSql).toContain(
      `c_group_limit constant integer := ${AI_RATE_LIMITS.perGroupPerDay};`
    );
    expect(usageSql).toContain(
      `c_user_limit constant integer := ${AI_RATE_LIMITS.perUserPerDay};`
    );
    expect(usageSql).toContain(
      `c_stale constant interval := interval '${AI_RATE_LIMITS.inFlightStaleSeconds} seconds';`
    );
  });

  it("computes retry_after the same way as the refusal", () => {
    expect(usageSql).toContain(
      "extract(epoch from ((v_day_start + interval '1 day') - now()))"
    );
    expect(usageSql).toContain("greatest(1, floor(");
  });

  it("is read-only and definer-only with a pinned search path", () => {
    expect(usageSql).toMatch(/language plpgsql\s+stable\s+security definer/);
    expect(usageSql).toContain("set search_path to ''");
    for (const verb of ["insert", "update ", "delete ", "alter ", "drop "]) {
      expect(code).not.toContain(verb);
    }
    // The prose in `comment on function` names it; the body must not call it.
    expect(code).not.toContain("public.begin_group_ai_request(");
  });

  it("admits active members only and refuses everyone else identically", () => {
    expect(usageSql).toContain(
      "not private.is_active_group_member(p_group_id, v_actor)"
    );
    // One message and one SQLSTATE for "not a member" and "no such group", so a
    // stranger cannot use the error to learn whether a group exists.
    const refusals = usageSql.match(/not authorized to read group ai usage/g);
    expect(refusals).toHaveLength(2);
    expect(usageSql.match(/errcode = '42501'/g)).toHaveLength(2);
  });

  it("grants execute to authenticated only", () => {
    expect(usageSql).toContain(
      "revoke all on function public.get_group_ai_usage(uuid) from public, anon;"
    );
    expect(usageSql).toContain(
      "grant execute on function public.get_group_ai_usage(uuid) to authenticated;"
    );
    expect(code).not.toContain("to service_role");
  });

  it("returns limits alongside counts so the UI cannot invent its own", () => {
    for (const column of [
      "group_today integer",
      "group_limit integer",
      "user_today integer",
      "user_limit integer",
      "in_flight integer",
      "retry_after_seconds integer",
    ]) {
      expect(usageSql).toContain(column);
    }
  });
});

describe("usage panel wiring, statically", () => {
  it("reads usage through the RPC rather than guessing from the clock", () => {
    expect(requests).toContain('supabaseClient.rpc("get_group_ai_usage"');
    expect(requests).toContain("export async function getGroupAiUsage");
    expect(drawer).toContain("getGroupAiUsage");
    expect(drawer).toContain("void loadUsage();");
  });

  it("shows the server's numbers and keeps the refusal fallback labelled", () => {
    expect(drawer).toContain("AI_CHAT_COPY.usageToday(");
    expect(AI_CHAT_COPY.usageToday(3, 10, 4, 20)).toContain(
      "今天已用 3／10 次"
    );
    expect(AI_CHAT_COPY.usageToday(3, 10, 4, 20)).toContain("此群組 4／20 次");
    // The fallback must stay distinguishable: it is old evidence, not a live read.
    expect(drawer).toContain("上次查詢：今天已用");
    // The fallback lives inside the branch where no live numbers exist.
    expect(drawer).toContain('usagePhase === "ready" && liveUsage ? (');
    expect(drawer).toContain("usage && (");
  });

  it("keeps the numbers on their own line instead of one run-on sentence", () => {
    // The limits are not restated beside the numbers: the denominators are the
    // limits, and repeating them is what made the line wrap mid-clause.
    expect(drawer).toContain('className="citylink-ai-drawer__usage"');
    expect(drawer).toContain("AI_CHAT_COPY.usageShared(");
    expect(drawer).toContain("AI_CHAT_COPY.resetIn(");
    expect(AI_CHAT_COPY.usageShared(10, "約 16 小時")).toBe(
      "每人每天 10 次・所有群組共用・約 16 小時後重置"
    );
    expect(AI_CHAT_COPY.usageShared(10, "約 16 小時")).not.toContain("每群組");
  });

  it("turns seconds into a duration rather than a UTC timestamp", () => {
    expect(AI_CHAT_COPY.resetIn(59_753)).toBe("約 17 小時");
    expect(AI_CHAT_COPY.resetIn(2_700)).toBe("約 45 分鐘");
    expect(AI_CHAT_COPY.resetIn(45)).toBe("約 45 秒");
    expect(AI_CHAT_COPY.resetIn(0)).toBe("約 1 秒");
  });

  it("never renders zero for a failed read", () => {
    // A null read is reported as unavailable; only a ready row prints numbers.
    expect(drawer).toContain('usagePhase === "unavailable"');
    expect(AI_CHAT_COPY.usageUnavailable).toContain("暫時讀不到");
    expect(drawer).not.toContain("liveUsage?.userToday ?? 0");
  });
});
