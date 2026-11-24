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
    const raised = [...sql.matchAll(/raise exception\s+'([a-z_]+)'/gi)].map(
      m => m[1]
    );
    expect(raised.length).toBeGreaterThan(10);
    for (const token of raised) {
      expect(allowed.has(token), `unexpected token: ${token}`).toBe(true);
    }
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
