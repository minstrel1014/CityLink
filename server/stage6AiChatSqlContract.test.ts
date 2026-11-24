import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_RATE_LIMITS } from "@shared/aiRateLimit";
import { AI_CHAT_LIMITS, CONTEXT_DROPPED_NOTICE } from "@shared/aiChatContext";
import {
  AI_REPLY_HARD_LIMIT,
  AI_REPLY_TARGET_MAX,
  AI_REPLY_TARGET_MIN,
} from "@shared/aiChatReply";
import { AI_AUTHOR_NAME } from "@shared/chatAuthor";
/**
 * Static contract checks on the group-AI-chat migration proposal.
 *
 * The runtime behaviour of that file is proven by stage6AiChatMigrationApplies.test.ts,
 * which applies it to a disposable database. This file covers what a run cannot see:
 * that the two copies of each constant still agree, and that the proposal did not
 * quietly grow a grant, a drop, or an invented error token.
 *
 * Role 6 G-1 (Adam's ruling, option c): SQL cannot import a TypeScript module, so the
 * limits exist twice by design. This test is the binding between the copies. Its limit
 * is stated where it belongs — a change to shared/aiRateLimit.ts that nobody runs the
 * suite for still ships a mismatched RPC; what this removes is silence.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const proposalPath = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql"
);
const sql = readFileSync(proposalPath, "utf8");
const lines = sql.split("\n");

/** Everything after `--` is commentary; contracts live in the executable text. */
const code = lines
  .map(line => line.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

function section(name: string): string {
  const start = code.indexOf(name.toLowerCase());
  expect(start, `section ${name} missing`).toBeGreaterThan(-1);
  return code.slice(start);
}

const LAUNCH_REF = "pijslbchvstkoweslymr";

describe("ai chat migration proposal, statically", () => {
  it("keeps the rate-limit literals equal to the client constants", () => {
    // Not "the SQL imports the TS module" — impossible. Each number is a literal here
    // and a named constant there, and this test is what makes drifting fail.
    expect(code).toContain(`v_group_today >= ${AI_RATE_LIMITS.perGroupPerDay}`);
    expect(code).toContain(`v_user_today >= ${AI_RATE_LIMITS.perUserPerDay}`);
    expect(code).toContain(
      `v_in_flight >= ${AI_RATE_LIMITS.maxInFlightPerGroup}`
    );
    expect(code).toContain(
      `interval '${AI_RATE_LIMITS.inFlightStaleSeconds} seconds'`
    );
    // The in-flight refusal's short wait is also literal; assert it is a number the
    // client would not contradict (the client computes its own from the UTC day).
    expect(code).toMatch(/retry_after=15 reason=in_flight/);
  });

  it("keeps the context budget equal to the assembler's budget", () => {
    // Same reasoning as the rate limits: the assembler and the RPC must not be able to
    // disagree about how much history leaves the building.
    expect(code).toContain(`v_budget integer := ${AI_CHAT_LIMITS.chatChars}`);
    expect(code).toContain(`v_ai_kept < ${AI_CHAT_LIMITS.maxAiAnswers}`);
    expect(code).toContain(
      `files_used between 0 and ${AI_CHAT_LIMITS.maxFiles}`
    );
    expect(code).toContain(`if v_file_count > ${AI_CHAT_LIMITS.maxFiles} then`);
    // The question bound is the existing column CHECK's bound, not a new number.
    expect(code).toContain("between 1 and 4000");
    // The file-text budget (10,000) is applied by the server when it extracts text, which
    // this migration does not do, so only the client constant is asserted here.
    expect(AI_CHAT_LIMITS.fileChars).toBe(10_000);
  });

  it("pins Adam's four settled numbers where a reader will find them", () => {
    // Decisions 4 and 5 of the design change: reply target and hard cap live in the
    // application layer, and the 4,000-character column CHECK is left alone.
    expect(AI_REPLY_HARD_LIMIT).toBe(2500);
    expect(AI_REPLY_TARGET_MIN).toBe(1200);
    expect(AI_REPLY_TARGET_MAX).toBe(1500);
    expect(AI_CHAT_LIMITS.chatChars).toBe(4000);
    expect(code).not.toMatch(/check \(char_length\(body\)[^)]*2500/);
  });

  it("asserts the target inside the same transaction as the writes", () => {
    const begin = code.indexOf("begin;");
    const assert = code.indexOf(
      `select private.assert_citylink_target('${launchRef()}')`
    );
    const firstDdl = code.indexOf("create table");
    const commit = code.lastIndexOf("commit;");
    expect(begin).toBeGreaterThan(-1);
    expect(assert).toBeGreaterThan(begin);
    expect(assert).toBeLessThan(firstDdl);
    expect(commit).toBeGreaterThan(assert);
    // It must be a call, not a redefinition: this proposal does not own the marker.
    expect(code).not.toContain("create or replace function private.assert");
    expect(code).not.toContain(
      "create table if not exists private.citylink_target"
    );
  });

  function launchRef(): string {
    const match = sql.match(/assert_citylink_target\('([a-z0-9]+)'\)/);
    expect(match, "no target assertion found").not.toBeNull();
    return match?.[1] ?? "";
  }

  it("names Launch, never the frozen Prototype", () => {
    expect(launchRef()).toBe(LAUNCH_REF);
    // wkzclgmhrtecnpexfesr is the 2026-11-24 wrong-target incident; if it ever appears
    // as an assertion target, the guard itself became the bug.
    expect(code).not.toContain("assert_citylink_target('wkzclgmhrtecnpexfesr'");
  });

  it("never grants table rights, including to service_role", () => {
    // F-1 / B-1: the write path is the RPC, not the table. A grant here would let a
    // caller mark a request ready without inserting the message that proves it answered.
    // Match table grants specifically. A plain substring search also hits the function
    // name clear_group_ai_context, which is a legitimate EXECUTE grant.
    for (const table of ["group_ai_context", "group_ai_requests"]) {
      const grants = [
        ...code.matchAll(
          new RegExp(`grant[^;]*\\btable\\s+public\\.${table}\\b`, "g")
        ),
      ];
      expect(
        grants.map(g => g[0]),
        `unexpected grant touching ${table}`
      ).toEqual([]);
    }
    expect(code).not.toMatch(
      /grant\s+(all|select|insert|update|delete)[^;]*to[^;]*service_role/
    );
    // The only service_role grants in the file are EXECUTE on the two worker RPCs.
    const svcGrants = lines
      .map(line => line.replace(/--.*$/, ""))
      .filter(line => /^\s*grant\b/i.test(line) && /service_role/.test(line));
    expect(svcGrants.map(l => l.replace(/\s+/g, " ").trim()).sort()).toEqual([
      "grant execute on function public.claim_group_ai_request(uuid) to service_role;",
      "grant execute on function public.finish_group_ai_request(uuid, text, boolean, boolean, integer, integer, integer, text) to service_role;",
    ]);
  });

  it("revokes the default PUBLIC rights on every new object, naming service_role", () => {
    // Supabase's ALTER DEFAULT PRIVILEGES FOR ROLE postgres auto-grants new objects to
    // anon, authenticated and service_role (measured during the P1 preflight), so a
    // revoke that omits service_role leaves a path nobody authorised.
    // Statements, not lines: every revoke here wraps at the object list.
    const revokes = code
      .split(";")
      .map(part => part.replace(/\s+/g, " ").trim())
      .filter(part => /^revoke\b/.test(part));
    expect(revokes.length).toBeGreaterThanOrEqual(9);
    for (const statement of revokes) {
      expect(statement, `revoke omits service_role: ${statement}`).toContain(
        "service_role"
      );
      expect(statement, `revoke omits anon: ${statement}`).toContain("anon");
      expect(statement, `revoke omits authenticated: ${statement}`).toContain(
        "authenticated"
      );
    }
    // R-2: EXECUTE reaches PUBLIC by default in PostgreSQL, so all seven functions need
    // the revoke; the apply test proves anon cannot execute them.
    for (const fn of [
      "list_group_chat_messages_page",
      "list_group_chat_messages_ai",
      "begin_group_ai_request",
      "clear_group_ai_context",
      "accept_ai_disclosure",
      "claim_group_ai_request",
      "finish_group_ai_request",
    ]) {
      expect(
        revokes.some(l => l.includes(fn)),
        `no revoke for ${fn}`
      ).toBe(true);
    }
  });

  it("makes every new function a definer with a locked search path", () => {
    const names = [
      "public.accept_ai_disclosure",
      "private.list_group_chat_messages_page",
      "public.list_group_chat_messages_ai",
      "public.begin_group_ai_request",
      "public.claim_group_ai_request",
      "public.finish_group_ai_request",
      "public.clear_group_ai_context",
    ];
    for (const name of names) {
      const block = functionBody(name);
      expect(block, `${name} is not a definer`).toContain("security definer");
      expect(block, `${name} has no locked search_path`).toMatch(
        /set search_path = ''/
      );
    }
  });

  function functionBody(name: string): string {
    const start = code.indexOf(`create or replace function ${name}(`);
    expect(start, `function ${name} missing`).toBeGreaterThan(-1);
    const end = code.indexOf("$function$;", start);
    expect(end, `function ${name} unterminated`).toBeGreaterThan(start);
    return code.slice(start, end);
  }

  it("raises only documented tokens with their documented codes", () => {
    const documented = [
      ["45n01", "group_ai_no_permission"],
      ["45n03", "group_ai_question_empty"],
      ["45n11", "group_ai_question_too_long"],
      ["45n04", "group_ai_file_not_eligible"],
      ["45n05", "group_ai_too_many_files"],
      ["45n06", "group_ai_rate_limited"],
      ["45n07", "group_ai_idempotency_conflict"],
      ["45n08", "group_ai_request_unknown"],
      ["45n09", "group_ai_disclosure_required"],
      ["45n10", "group_ai_answer_empty"],
    ] as const;
    // Walk every raise that names a code and check the pairing against the table above;
    // stricter than matching the header text, which a careless edit can satisfy alone.
    let seen = 0;
    for (const match of sql.matchAll(
      /raise exception '([a-z_]+)'\s*\n?\s*using errcode = '([0-9A-Za-z]+)'/g
    )) {
      seen += 1;
      const token = match[1].toLowerCase();
      const codeValue = match[2].toLowerCase();
      const pair = documented.find(([c, t]) => c === codeValue || t === token);
      expect(pair, `undocumented raise ${token} (${codeValue})`).toBeDefined();
      expect(pair?.[0], `${token} mapped to ${codeValue}`).toBe(codeValue);
      expect(pair?.[1], `${codeValue} mapped to ${token}`).toBe(token);
    }
    expect(seen).toBeGreaterThanOrEqual(documented.length - 1);
    // The header must list every code the body can raise, and no others.
    for (const [codeValue, token] of documented) {
      expect(sql.toLowerCase()).toContain(codeValue);
      expect(sql).toContain(token);
    }
  });

  it("locks group before user, in one place only", () => {
    const group = code.indexOf(
      "pg_advisory_xact_lock(hashtextextended('ai-group:'"
    );
    const user = code.indexOf(
      "pg_advisory_xact_lock(hashtextextended('ai-user:'"
    );
    expect(group).toBeGreaterThan(-1);
    expect(user).toBeGreaterThan(group);
    // G-2: the group lock alone cannot cover a cross-group per-member count, so both
    // locks exist. Two locks in a fixed order in one function cannot deadlock; a second
    // call site in a different order could, so the count is checked too.
    expect([...code.matchAll(/pg_advisory_xact_lock/g)].length).toBe(2);
  });

  it("guards the idempotency key against the deletion path", () => {
    // F-2: asked_by is ON DELETE SET NULL, and unique treats NULLs as distinct, so the
    // key must not include it or deprovisioning silently disables dedupe.
    expect(code).toContain(
      "constraint group_ai_requests_idempotent unique (group_id, idempotency_key)"
    );
    expect(code).not.toMatch(/unique \([^)]*asked_by/);
  });

  it("excludes never-claimed rows from the daily counts", () => {
    // G-3: a provider outage must not spend the day's quota on requests that never
    // produced a call. The exclusion has to appear in BOTH daily counts, or a member can
    // be blocked by their own crashed request in one group while another group counts it.
    const begin = functionBody("public.begin_group_ai_request");
    const groupBlock = begin.slice(
      begin.indexOf("into v_group_today"),
      begin.indexOf("into v_user_today")
    );
    const userBlock = begin.slice(
      begin.indexOf("into v_user_today"),
      begin.indexOf("into v_in_flight")
    );
    expect(groupBlock.length).toBeGreaterThan(40);
    expect(userBlock.length).toBeGreaterThan(40);
    for (const block of [groupBlock, userBlock]) {
      expect(block).toContain("q.status in ('processing', 'ready', 'failed')");
      expect(block).toContain("q.created_at > now() - v_stale");
    }
  });

  it("derives every threshold from one time source", () => {
    // G-5: the day boundary, the stale test and retry_after must share now(), or a long
    // transaction can disagree with itself.
    expect(code).toContain("v_day_start := date_trunc('day', now())");
    expect(
      code.match(
        /extract\(epoch from \(\(v_day_start \+ interval '1 day'\) - now\(\)\)\)/g
      )?.length
    ).toBe(1);
  });

  it("makes the claim and finish transitions one-way", () => {
    // G-4: claim is the only writer of processing, and finish may only leave a
    // non-terminal state, which is what stops a retried finish posting twice.
    expect(code).toContain("and q.status = 'queued'");
    expect(code).toContain("and q.status in ('queued', 'processing')");
    expect(code).toContain("set status = 'processing', claimed_at = now()");
  });

  it("creates the context row from clear rather than assuming it exists", () => {
    // N-1: without this, the first clear in a group updates zero rows and begin has no
    // lower bound to read.
    const clear = functionBody("public.clear_group_ai_context");
    expect(clear).toContain("insert into public.group_ai_context");
    expect(clear).toContain("on conflict (group_id) do update");
    const begin = functionBody("public.begin_group_ai_request");
    expect(begin).toContain("to_timestamp(0)");
  });

  it("indexes the idempotent lookup finish needs", () => {
    // N-5: the replay path reads group_chat_messages by ai_request_id.
    expect(code).toContain(
      "create index if not exists group_chat_messages_ai_request"
    );
    expect(code).toContain("where ai_request_id is not null");
  });

  it("never drops, and never touches the frozen or approved objects", () => {
    expect(code).not.toContain("drop table");
    expect(code).not.toContain("drop function");
    expect(code).not.toContain("drop index");
    // Word boundaries matter: the truncated flag on messages contains "truncat".
    expect(/\btruncate\b/.test(code)).toBe(false);
    expect(/\bdelete\s+from\b/.test(code)).toBe(false);
    // B-2: the old read function is not redefined here.
    expect(code).not.toContain(
      "create or replace function public.list_group_chat_messages("
    );
    expect(code).not.toContain(
      "create or replace function public.send_group_chat_message"
    );
    // Adam 2026-11-24: the plan-era tables are retired by decision, not by SQL.
    expect(code).not.toContain("group_analysis_plans");
    expect(code).not.toContain("group_analysis_jobs");
    // No real provider, no keys, no bucket names in the database layer.
    expect(code).not.toMatch(
      /openroute|deepseek|api[_ ]?key|cloudflare|s3|access[_ ]?key/
    );
  });

  it("adds the disclosure column as nullable with no backfill", () => {
    // F-11: acceptance is recorded, not inferred. A default of now() would invent
    // consent for every existing account.
    expect(code).toContain(
      "add column if not exists ai_disclosure_accepted_at timestamptz"
    );
    const columnLine = lines.find(line =>
      line.includes("ai_disclosure_accepted_at timestamptz")
    );
    expect(columnLine).toBeDefined();
    expect(columnLine?.toLowerCase()).not.toContain("not null");
    expect(columnLine?.toLowerCase()).not.toContain("default");
    // And begin has to check it before writing anything.
    const begin = functionBody("public.begin_group_ai_request");
    expect(begin).toContain("group_ai_disclosure_required");
    expect(begin.indexOf("ai_disclosure_accepted_at")).toBeLessThan(
      begin.indexOf("insert into public.group_ai_requests")
    );
  });

  it("keeps the dropped-context notice as a client concern only", () => {
    // Rule 4 is answer text, not a database value: the RPC logs the flag, the server adds
    // the sentence. Asserting the pairing here keeps a future migration from storing the
    // notice and double-prefixing it.
    expect(CONTEXT_DROPPED_NOTICE).toBe("（本次未包含較早的對話）");
    expect(code).toContain("dropped_context");
    expect(sql).not.toContain(CONTEXT_DROPPED_NOTICE);
  });

  it("does not invent a group switch or a member opt-out", () => {
    // F-12, Adam's option c: neither. If either ever appears, that is a new decision and
    // this test is the place that has to be argued about.
    expect(code).not.toMatch(/ai_enabled|allow_ai|ai_opt_out|opt_out_of_ai/);
    // The AI display name is the one already fixed by decision 1, and it is the same
    // string the CHECK constraint and the insert both use.
    expect(sql).toContain(AI_AUTHOR_NAME);
    expect(code).toContain("'citylink ai'");
  });

  it("states the reload step that a pure-SQL review would miss", () => {
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
  it("adds the chat constraints not valid and validates them separately", () => {
    // Role 6 N-4. `add column` plus `check` in one statement takes ACCESS EXCLUSIVE and
    // scans the whole table, which blocks a live chat table for the duration. The proposal
    // therefore creates each constraint `not valid` (catalog-only) and validates them in a
    // separate, splittable section that takes SHARE UPDATE EXCLUSIVE instead.
    const names = [
      "group_chat_messages_author_kind",
      "group_chat_messages_ai_has_no_sender",
      "group_chat_messages_ai_name",
      "group_chat_messages_ai_request_only_for_ai",
      "group_chat_messages_ai_request_fkey",
    ];
    for (const name of names) {
      const added = sql.match(
        new RegExp(`add constraint ${name}[\\s\\S]{0,200}?;`)
      );
      expect(added, `missing add constraint for ${name}`).not.toBeNull();
      expect(added![0]).toContain("not valid");
      expect(sql).toContain(`'${name}'`);
    }
    // The validation loop exists, names the same table, and is its own statement, so a
    // deployer can split it into a second transaction.
    expect(sql).toMatch(/validate constraint/);
    expect(sql).toContain(
      "alter table public.group_chat_messages validate constraint"
    );
    expect(sql).toContain("not convalidated");
    // Adam's lock-cost ruling is a preflight measurement duty, not an assumption.
    expect(sql).toMatch(/pg_total_relation_size/);
  });
});
