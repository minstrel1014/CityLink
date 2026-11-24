import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Applies the P1 migration proposal to a disposable PostgreSQL database.
 *
 * The static contract test reads text; it cannot detect a syntax error inside a
 * PL/pgSQL body, a misspelled column, or a `returns table` that disagrees with
 * its `return query`. This test can, because it actually runs the DDL. It also
 * exercises section 0, the fail-closed target assertion, on both of its branches:
 * a stub database without the capacity-era markers must refuse, and a
 * Launch-shaped stub must pass.
 *
 * It runs only where a PostgreSQL server is reachable. Set CITYLINK_TEST_PG_URI
 * to target a specific server, otherwise a local peer-auth connection to the
 * `postgres` database is probed. When no server is available the test is skipped
 * rather than failing, so an ordinary checkout stays green; a CI job that wants
 * this signal must provide PostgreSQL.
 *
 * Nothing here contacts a Supabase project. The fixtures under server/fixtures
 * are stand-ins, not the CityLink schema, so a pass proves the SQL applies and
 * refuses the wrong shape, not that live behaviour is correct.
 *
 * Engine parity: both Supabase targets run PostgreSQL 17 (Prototype 17.11.0.011,
 * Launch 17.11.0.003) and the repo's earlier SQL evidence was produced on a local
 * 17.12 harness, so this test reports the server version it ran against and
 * requires at least 16. A 16 result is weaker evidence, not a failure; the
 * recorded run for PR #59 used 17.12 from the PGDG suite on a unix-socket-only
 * cluster, matching the no-TCP-listener hygiene of that earlier harness.
 *
 * Known limitation, stated rather than papered over: psql does not print the
 * SQLSTATE of an error at its default verbosity, so these tests assert the refusal
 * token at runtime and leave the token-to-SQLSTATE pairing to the static contract
 * test, which reads `using errcode = ...` alongside each token.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const proposalPath = path.resolve(
  here,
  "../docs/stage6/KAYK_FILE_AI_MIGRATION_PROPOSAL.sql"
);
const stubPath = path.resolve(here, "fixtures/groupFilesStubSchema.sql");
const markersPath = path.resolve(
  here,
  "fixtures/groupFilesLaunchMarkersFixture.sql"
);
const baseUri = process.env.CITYLINK_TEST_PG_URI ?? "postgres:///postgres";

type Run = { status: number; stdout: string; stderr: string };

function psql(database: string, args: string[]): Run {
  const result = spawnSync("psql", [database, "-X", "-q", ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function scalar(database: string, query: string): string {
  const run = psql(database, ["-v", "ON_ERROR_STOP=1", "-tAc", query]);
  if (run.status !== 0) {
    throw new Error(`probe failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

function serverAvailable(): boolean {
  return (
    psql(baseUri, ["-v", "ON_ERROR_STOP=1", "-tAc", "select 1"]).status === 0
  );
}

const available = serverAvailable();
if (!available) {
  // Role 6 N-1: make the skip loud rather than silent, so nobody reads a green
  // suite as proof that the migration was applied anywhere.
  console.warn(
    "[stage6GroupFilesMigrationApplies] SKIPPED: no reachable PostgreSQL. " +
      "The 'it applies cleanly' and 'it refuses the wrong target' claims are NOT " +
      "covered by this run."
  );
}
const serverVersion = available ? scalar(baseUri, "show server_version") : "";
const serverMajor = Number(serverVersion.split(".")[0]);

/** Every P1 object, so a refusal can be proven to have created nothing. */
const CREATED_PROBE =
  "select (select count(*) from pg_tables where schemaname = 'public' " +
  "and tablename in ('group_files', 'group_analysis_plans', 'group_analysis_jobs'))::text " +
  "|| '/' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
  "where n.nspname = 'public' and p.proname like '%group_file%')::text";

function withDatabase(run: (database: string) => void): void {
  const database = `citylink_p1_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const created = psql(baseUri, [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `create database ${database}`,
  ]);
  if (created.status !== 0) {
    throw new Error(`create database failed: ${created.stderr}`);
  }
  try {
    run(database);
  } finally {
    psql(baseUri, ["-c", `drop database if exists ${database}`]);
  }
}

describe.skipIf(!available)("group files migration proposal applies", () => {
  it(`applies cleanly, twice, against a Launch-shaped stub schema (PostgreSQL ${serverVersion})`, () => {
    expect(serverMajor).toBeGreaterThanOrEqual(16);
    withDatabase(database => {
      expect(psql(database, ["-f", stubPath]).status).toBe(0);
      expect(psql(database, ["-f", markersPath]).status).toBe(0);

      // First application must succeed, and section 0 must report the target verified.
      const first = psql(database, [
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        proposalPath,
      ]);
      expect(first.stderr).toContain("kayk_p1_target_verified");
      expect(first.status).toBe(0);

      // Second application must also succeed: the file is meant to be idempotent.
      const second = psql(database, [
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        proposalPath,
      ]);
      expect(second.status).toBe(0);
      expect(second.stderr).toContain("kayk_p1_target_verified");

      expect(scalar(database, CREATED_PROBE)).toBe("3/6");

      const rls = scalar(
        database,
        "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
          "where n.nspname = 'public' and c.relrowsecurity " +
          "and c.relname in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')"
      );
      expect(rls).toBe("3");

      const policies = scalar(
        database,
        "select count(*) from pg_policies where schemaname = 'public' " +
          "and tablename in ('group_files', 'group_analysis_plans', 'group_analysis_jobs')"
      );
      expect(policies).toBe("0");
    });
  });

  it("refuses a target without the capacity-era markers and applies nothing", () => {
    // The stub schema alone is the pre-capacity shape: a CityLink-shaped database that
    // never received 20261119090000, which is what the frozen Prototype looked like on
    // 2026-11-24. The guard has to stop a run aimed at it.
    withDatabase(database => {
      expect(psql(database, ["-f", stubPath]).status).toBe(0);

      const attempt = psql(database, [
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        proposalPath,
      ]);
      expect(attempt.status).not.toBe(0);
      expect(attempt.stderr).toContain("kayk_p1_target_out_of_scope");
      expect(attempt.stderr).not.toContain("kayk_p1_prerequisite_missing");
      expect(attempt.stderr).not.toContain(
        "kayk_p1_target_evidence_unreadable"
      );

      // Refused means nothing reached the schema.
      expect(scalar(database, CREATED_PROBE)).toBe("0/0");
      expect(
        scalar(database, "select to_regclass('public.group_files') is null")
      ).toBe("t");
    });
  });

  it("still applies nothing when the runner ignores errors", () => {
    // Placement of the guard inside the file's own begin;/commit; is the reason a
    // careless invocation cannot half-apply the migration: once the guard raises, the
    // transaction is aborted and every later statement fails with 25P02 until the
    // final commit turns into a rollback. Note psql is deliberately run WITHOUT
    // ON_ERROR_STOP here, which is the unsafe case being defended against.
    withDatabase(database => {
      expect(psql(database, ["-f", stubPath]).status).toBe(0);

      psql(database, ["-f", proposalPath]);

      expect(scalar(database, CREATED_PROBE)).toBe("0/0");
    });
  });

  it("refuses a database that is not CityLink at all", () => {
    // Layer 1 of the guard: prerequisites missing is also a refusal, not a pass.
    withDatabase(database => {
      const attempt = psql(database, [
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        proposalPath,
      ]);
      expect(attempt.status).not.toBe(0);
      expect(attempt.stderr).toContain("kayk_p1_prerequisite_missing");
      expect(scalar(database, CREATED_PROBE)).toBe("0/0");
    });
  });
});
