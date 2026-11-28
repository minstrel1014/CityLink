import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static contract tests for the P1 group-files migration proposal.
 *
 * These run without a database. They cannot prove runtime behaviour; they only
 * prove that the reviewed SQL keeps the security posture the design requires:
 * SECURITY DEFINER with an empty search_path, no service_role grants, no table
 * policies, an active-only predicate, and no destructive statements.
 *
 * Live behaviour (RLS, real objects, concurrency) still needs Test QA under a
 * separate authorization.
 *
 * Maintenance: sqlPath points at the proposal under docs/stage6. When the SQL
 * is promoted to supabase/migrations it must be repointed, and the
 * `blocks.length` assertion must be raised when a later phase (P4/P5) adds a
 * function. Both are intentional tripwires, not accidental coupling.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(
  here,
  "../docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql"
);
const sql = readFileSync(sqlPath, "utf8");

/** Comments are stripped before negative assertions so prose cannot trip them. */
const sqlNoComments = sql.replace(/--[^\n]*/g, "");

type SqlFunction = { schema: string; name: string; body: string };

function functionBlocks(source: string): SqlFunction[] {
  // Limitation (Role 6 N-3): argument types are read as the last token of each
  // parameter, which is correct for the current signatures. It would misread a
  // default value (`p_size bigint default 0` -> `0`) or a comma inside a numeric
  // scale (`numeric(10,2)`), producing a misleading failure rather than a wrong pass.
  const found: SqlFunction[] = [];
  const re =
    /create or replace function\s+([a-z_]+)\.([a-z_]+)\s*\(([\s\S]*?)\$function\$;/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    found.push({ schema: match[1], name: match[2], body: match[0] });
  }
  return found;
}

const blocks = functionBlocks(sql);
const publicBlocks = blocks.filter(b => b.schema === "public");
const privateBlocks = blocks.filter(b => b.schema === "private");

describe("group files migration proposal", () => {
  it("names service_role in every revoke so Supabase default privileges cannot leak", () => {
    // Test wkzclgmhrtecnpexfesr has ALTER DEFAULT PRIVILEGES FOR ROLE postgres that
    // auto-grants anon, authenticated and service_role on new tables, functions and
    // sequences. A revoke that omits service_role therefore leaves it effective, which
    // a plain local PostgreSQL harness cannot show. See the probe script.
    const revokes = sql
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("revoke all on "));
    expect(revokes.length).toBe(12);
    for (const statement of revokes) {
      expect(statement).toContain("service_role");
    }
  });

  it("declares every function with SECURITY DEFINER and an empty search_path", () => {
    expect(blocks.length).toBe(9);
    expect(publicBlocks.length).toBe(6);
    expect(privateBlocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.body).toMatch(/security definer/i);
      expect(block.body).toMatch(/set search_path to ''/i);
    }
  });

  it("never grants execute to service_role, anon or public", () => {
    const grants = sql.match(/grant execute[^;]*;/gi) ?? [];
    expect(grants.length).toBeGreaterThanOrEqual(6);
    for (const grant of grants) {
      expect(grant).toMatch(/to authenticated;/i);
      expect(grant).not.toMatch(/service_role/i);
      expect(grant).not.toMatch(/to anon/i);
      expect(grant).not.toMatch(/to public/i);
    }
  });

  it("grants every public RPC to authenticated", () => {
    for (const block of publicBlocks) {
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${block.name}\\(`, "i")
      );
    }
  });

  it("keeps the private helpers out of authenticated reach", () => {
    for (const block of privateBlocks) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function private\\.${block.name}\\([^)]*\\) from public, anon, authenticated`,
          "i"
        )
      );
    }
  });

  it("enables row level security and defines no policies", () => {
    for (const table of [
      "group_files",
      "group_analysis_plans",
      "group_analysis_jobs",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i"
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on table public\\.${table} from public, anon, authenticated`,
          "i"
        )
      );
    }
    expect(sqlNoComments).not.toMatch(/create policy/i);
  });

  it("uses an active-only predicate and never reuses the chat predicate", () => {
    expect(sql).toMatch(/is_active_group_member\(p_group_id, auth\.uid\(\)\)/i);
    expect(sqlNoComments).not.toMatch(/can_read_group_chat/i);
    expect(sql).toMatch(/membership_status = 'active'/i);
  });

  it("keeps the agreed limits", () => {
    expect(sql).toContain("104857600"); // 100 MiB per file
    expect(sql).toContain("8589934592"); // 8 GiB global cap
    expect(sql).toContain("1073741824"); // 1 GiB per group
  });

  it("emits only known error tokens", () => {
    const allowed = new Set([
      // Section 0 target assertion (fail-closed refusal tokens).
      "kayk_p1_prerequisite_missing",
      "kayk_p1_target_evidence_unreadable",
      "kayk_p1_target_out_of_scope",
      "group_files_no_permission",
      "group_files_upload_too_large",
      "group_files_name_required",
      "group_files_storage_limit_reached",
      "group_files_group_limit_reached",
      "group_files_too_many_pending",
      "group_files_not_found",
      "group_files_not_uploader",
      "group_files_not_pending",
      "group_files_not_current",
      "group_files_size_mismatch",
      "group_files_expired",
      "group_files_retention_window_closed",
      "group_files_term_missing",
      "group_files_term_code_unrecognised",
    ]);
    // The leading token only, because the guard's messages continue with the observed
    // evidence after the token; a closing quote here would let an unknown token slip by.
    // Digits are in the class because the refusal tokens name the phase (kayk_p1_*).
    const raised = [...sql.matchAll(/raise exception\s+'([a-z0-9_]+)/gi)].map(
      m => m[1]
    );
    expect(raised.length).toBeGreaterThan(10);
    for (const token of raised) {
      expect(allowed.has(token), `unexpected token: ${token}`).toBe(true);
    }
  });

  it("asserts the apply target fail-closed, with its own SQLSTATEs", () => {
    const start = sql.indexOf("do $kayk_p1_target$");
    const end = sql.indexOf("$kayk_p1_target$;", start);
    expect(start, "section 0 target guard is missing").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const guard = sql.slice(start, end);

    // Requirement: no operator-supplied input. A GUC the applier fills in is a reminder,
    // not a check, so the guard may only read the catalog.
    expect(guard).not.toMatch(/current_setting/i);
    expect(guard).not.toMatch(/set\s+kayk/i);
    expect(guard).toMatch(/pg_catalog\.pg_proc/i);
    expect(guard).toMatch(/pg_catalog\.pg_attribute/i);
    expect(guard).toMatch(/to_regclass/i);
    expect(guard).toMatch(/to_regprocedure/i);

    // The guard grants and revokes nothing; it is a refusal, not a privilege change.
    expect(guard).not.toMatch(/\bgrant\b/i);
    expect(guard).not.toMatch(/\brevoke\b/i);

    // Unknown is never a pass: all three branches raise, each token is immediately
    // followed by its own distinct SQLSTATE, and none of them borrows the capacity
    // line's code. Pairing is asserted by order and distance rather than one regular
    // expression, because the refusal messages carry the observed evidence between them.
    const pairs: [string, string][] = [
      ["kayk_p1_prerequisite_missing", "45K01"],
      ["kayk_p1_target_evidence_unreadable", "45K02"],
      ["kayk_p1_target_out_of_scope", "45K03"],
    ];
    for (const [token, code] of pairs) {
      const at = guard.indexOf(token);
      expect(at, `missing token ${token}`).toBeGreaterThan(-1);
      const codeAt = guard.indexOf(`errcode = '${code}'`);
      expect(codeAt, `missing errcode ${code}`).toBeGreaterThan(at);
      expect(codeAt - at).toBeLessThan(600);
    }
    expect(sqlNoComments).not.toMatch(/45003/);
    expect(guard).toMatch(/exception\s+when others/i);

    // Placement is load-bearing: inside the file's own transaction, before any DDL, so a
    // refusal aborts the transaction instead of leaving a half-applied migration.
    const code = sqlNoComments;
    const guardAt = code.indexOf("do $kayk_p1_target$");
    expect(code.trimStart().startsWith("begin;")).toBe(true);
    expect(guardAt).toBeGreaterThan(code.indexOf("begin;"));
    expect(guardAt).toBeLessThan(code.indexOf("create table"));
    expect(code.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("treats the group leader as study_groups.creator_id", () => {
    // Verified against 20261114163512_stage5_group_authority_and_succession.sql:
    // there is no separate leader column, and succession rewrites creator_id.
    expect(sqlNoComments).toMatch(/g\.creator_id = v_actor/i);
    expect(sqlNoComments).not.toMatch(/leader_id/i);
  });

  it("matches every revoke/grant signature to the function definition", () => {
    // A mismatched signature makes revoke/grant fail and rolls back the whole
    // transaction, which is this repository's most common failure mode.
    const signatures = [
      ...sql.matchAll(
        /create or replace function\s+([a-z_]+)\.([a-z_]+)\s*\(([^)]*)\)/gi
      ),
    ].map(m => ({
      schema: m[1].toLowerCase(),
      name: m[2].toLowerCase(),
      args: m[3]
        .split(",")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => part.split(/\s+/).pop()!.toLowerCase())
        .join(", "),
    }));

    expect(signatures.length).toBe(9);
    for (const sig of signatures) {
      const target = `${sig.schema}.${sig.name}(${sig.args})`;
      expect(sql.toLowerCase()).toContain(
        `revoke all on function ${target} from public, anon, authenticated`
      );
      if (sig.schema === "public") {
        expect(sql.toLowerCase()).toContain(
          `grant execute on function ${target} to authenticated`
        );
      }
    }
  });

  it("wraps the file in a transaction and bounds user-controlled text", () => {
    expect(sqlNoComments.trimStart().startsWith("begin;")).toBe(true);
    expect(sqlNoComments.trimEnd().endsWith("commit;")).toBe(true);
    for (const column of ["declared_mime", "detected_mime", "content_hash"]) {
      expect(sql).toMatch(
        new RegExp(`${column} is null or char_length\\(${column}\\) <=`, "i")
      );
    }
    expect(sql).toMatch(/mime_mismatch boolean not null default false/i);
  });

  it("prevents two pending replacements of the same file", () => {
    expect(sql).toMatch(
      /create unique index if not exists group_files_one_pending_replacement_idx[\s\S]*?where replaces_file_id is not null and status = 'pending'/i
    );
  });

  it("contains no destructive statements", () => {
    expect(sqlNoComments).not.toMatch(/drop table/i);
    expect(sqlNoComments).not.toMatch(/truncate/i);
    expect(sqlNoComments).not.toMatch(/delete from/i);
  });
});
