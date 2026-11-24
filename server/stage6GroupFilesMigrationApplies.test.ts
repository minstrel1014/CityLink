import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Applies the P1 migration proposal to a disposable PostgreSQL database.
 *
 * The static contract test reads text; it cannot detect a syntax error inside a
 * PL/pgSQL body, a misspelled column, or a `returns table` that disagrees with
 * its `return query`. This test can, because it actually runs the DDL.
 *
 * It runs only where a PostgreSQL server is reachable. Set CITYLINK_TEST_PG_URI
 * to target a specific server, otherwise a local peer-auth connection to the
 * `postgres` database is probed. When no server is available the test is skipped
 * rather than failing, so an ordinary checkout stays green; a CI job that wants
 * this signal must provide PostgreSQL.
 *
 * The stub schema in server/fixtures is a stand-in, not the CityLink schema, so
 * a pass proves the SQL applies and is idempotent, not that behaviour is correct.
 *
 * Engine parity: both Supabase targets run PostgreSQL 17 (Test 17.11.0.011, Main
 * 17.11.0.003) and the repo's earlier SQL evidence was produced on a local 17.12
 * harness, so this test reports the server version it ran against and requires at
 * least 16. A 16 result is weaker evidence, not a failure; the recorded run for
 * PR #59 used 17.12 from the PGDG suite on a unix-socket-only cluster, matching the
 * no-TCP-listener hygiene of that earlier harness.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const proposalPath = path.resolve(
  here,
  "../docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql"
);
const stubPath = path.resolve(here, "fixtures/groupFilesStubSchema.sql");
const baseUri = process.env.CITYLINK_TEST_PG_URI ?? "postgres:///postgres";

function psql(database: string, args: string[]): string {
  return execFileSync(
    "psql",
    [database, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function serverAvailable(): boolean {
  try {
    psql(baseUri, ["-tAc", "select 1"]);
    return true;
  } catch {
    return false;
  }
}

const available = serverAvailable();
const serverVersion = available
  ? psql(baseUri, ["-tAc", "show server_version"]).trim()
  : "";
const serverMajor = Number(serverVersion.split(".")[0]);

describe.skipIf(!available)("group files migration proposal applies", () => {
  it(`applies cleanly, twice, against a stub schema (PostgreSQL ${serverVersion})`, () => {
    expect(serverMajor).toBeGreaterThanOrEqual(16);
    const database = `citylink_p1_${process.pid}_${Date.now()}`;
    psql(baseUri, ["-c", `create database ${database}`]);

    try {
      psql(database, ["-f", stubPath]);

      // First application must succeed.
      expect(() => psql(database, ["-f", proposalPath])).not.toThrow();

      // Second application must also succeed: the file is meant to be idempotent.
      expect(() => psql(database, ["-f", proposalPath])).not.toThrow();

      const tables = psql(database, [
        "-tAc",
        "select count(*) from pg_tables where schemaname = 'public' " +
          "and tablename in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')",
      ]).trim();
      expect(tables).toBe("3");

      const functions = psql(database, [
        "-tAc",
        "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
          "where n.nspname = 'public' and p.proname like '%group_file%'",
      ]).trim();
      expect(Number(functions)).toBeGreaterThanOrEqual(6);

      const rls = psql(database, [
        "-tAc",
        "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
          "where n.nspname = 'public' and c.relrowsecurity " +
          "and c.relname in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')",
      ]).trim();
      expect(rls).toBe("3");

      const policies = psql(database, [
        "-tAc",
        "select count(*) from pg_policies where schemaname = 'public' " +
          "and tablename in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')",
      ]).trim();
      expect(policies).toBe("0");
    } finally {
      psql(baseUri, ["-c", `drop database if exists ${database}`]);
    }
  });
});
