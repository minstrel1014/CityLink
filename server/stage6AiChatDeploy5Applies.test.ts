import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Applies the deploy-5 proposal (`KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY5.sql`) to a
 * disposable PostgreSQL database and asks it for a file key.
 *
 * Deploy 5 is the database half of Adam's 2026-11-25 ruling that the chatroom AI
 * must be able to read the file he attached: the executor now parses PDF and DOCX,
 * but a parser with no bytes reads nothing, and `public.group_files` is revoked from
 * `service_role` on purpose, so the worker cannot find an object on its own. This
 * file is the proof that the proposed fix does what it claims, on a stub schema.
 *
 * A pass proves the SQL parses, applies, and behaves as specified. It proves nothing
 * about a live Supabase project: no connection was made, nothing was applied to
 * Launch, and no Edge Function was deployed. Where a server is unreachable the suite
 * skips loudly, so a green run is never read as "the migration applies".
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const stubPath = path.resolve(here, "fixtures/aiChatStubSchema.sql");
const scenarioPath = path.resolve(here, "fixtures/aiChatScenario.sql");
const deploy1Path = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql"
);
const deploy2Path = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql"
);
const deploy3Path = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY3.sql"
);
const deploy5Path = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY5.sql"
);
const baseUri = process.env.CITYLINK_TEST_PG_URI ?? "postgres:///postgres";
const LAUNCH_REF = "pijslbchvstkoweslymr";
const PROTOTYPE_REF = "wkzclgmhrtecnpexfesr";
const GROUP = "aaaaaaaa-0000-0000-0000-000000000001";
const FILE_OK = "bbbbbbbb-0000-0000-0000-000000000001";
const FILE_EXPIRED = "bbbbbbbb-0000-0000-0000-000000000002";
const FILE_DELETED = "bbbbbbbb-0000-0000-0000-000000000004";
const FILE_OK2 = "bbbbbbbb-0000-0000-0000-000000000005";
const ASKER = "11111111-1111-1111-1111-111111111111";
const OK_KEY = `groups/${GROUP}/${FILE_OK}`;

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

function sql(database: string, text: string): Run {
  return psql(database, ["-v", "VERBOSITY=verbose", "-c", text]);
}

function one(database: string, text: string): string {
  const run = psql(database, ["-tAc", text]);
  if (run.status !== 0) {
    throw new Error(`probe failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

function exec(database: string, text: string): void {
  const run = sql(database, text);
  if (run.status !== 0) {
    throw new Error(`setup failed: ${run.stderr}`);
  }
}

function serverAvailable(): boolean {
  return (
    psql(baseUri, ["-v", "ON_ERROR_STOP=1", "-tAc", "select 1"]).status === 0
  );
}

const available = serverAvailable();
if (!available) {
  console.warn(
    "[stage6AiChatDeploy5Applies] SKIPPED: no reachable PostgreSQL. The claim that " +
      "deploy 5 applies and hands the executor an object key is NOT covered by this run."
  );
}

const serverVersion = available ? one(baseUri, "show server_version") : "";

function applyFile(database: string, file: string): Run {
  return psql(database, [
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-f",
    file,
  ]);
}

function withDatabase(run: (database: string) => void): void {
  const database = `citylink_deploy5_${process.pid}_${Date.now()}_${Math.floor(
    Math.random() * 1000
  )}`;
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

/**
 * Stub schema, a marker naming `markerRef`, deploys 1-3 in order, then the scenario
 * rows. Deploy 5 is deliberately NOT applied: the first case needs to see the shape
 * before the change and the shape after it.
 */
function provisioned(
  run: (database: string) => void,
  markerRef: string = LAUNCH_REF
): void {
  withDatabase(database => {
    expect(
      psql(database, ["-v", "ON_ERROR_STOP=1", "-f", stubPath]).status
    ).toBe(0);
    exec(
      database,
      `insert into private.citylink_target (project_ref, system_identifier) ` +
        `values ('${markerRef}', ` +
        `(select system_identifier::text from pg_control_system()));`
    );
    for (const file of [deploy1Path, deploy2Path, deploy3Path]) {
      const run5 = applyFile(database, file);
      expect(run5.stderr).not.toContain("ERROR");
      expect(run5.status).toBe(0);
    }
    expect(
      psql(database, ["-v", "ON_ERROR_STOP=1", "-f", scenarioPath]).status
    ).toBe(0);
    run(database);
  });
}

function applyDeploy5(database: string): Run {
  return applyFile(database, deploy5Path);
}

/** The same, with the apply itself asserted: a silent failure here would make every
 * key below read null and the suite would look like a behavioural bug. */
function appliedDeploy5(database: string): void {
  const fifth = applyDeploy5(database);
  expect(fifth.stderr).not.toContain("ERROR");
  expect(fifth.status).toBe(0);
}

/** A queued request that selects `files`, written directly: the claim is the subject. */
function queue(
  database: string,
  files: string,
  id = "cccccccc-0000-0000-0000-000000000001"
): void {
  exec(
    database,
    `insert into public.group_ai_requests (id, group_id, asked_by, idempotency_key, ` +
      `question, file_ids, files, status) values (` +
      `'${id}', '${GROUP}', '${ASKER}', ` +
      `'${id.replace(/c/g, "d")}', 'does the worker see the file', ` +
      `'{}'::uuid[], '${files}'::jsonb, 'queued');`
  );
}

/**
 * Ask the worker's role for the next claim, and return the file payload it saw.
 *
 * One call per case on purpose: every call consumes a queued row, so reading
 * element 1 and then element 2 would ask for the *next request* and get nothing.
 */
function claimFiles(database: string): Array<Record<string, string | null>> {
  const payload = one(
    database,
    "set role service_role; select files::text from public.claim_next_group_ai_request()"
  );
  return JSON.parse(payload) as Array<Record<string, string | null>>;
}

describe.skipIf(!available)("deploy 5, the executor's file keys", () => {
  it("states its own engine, because both Supabase targets run 17", () => {
    expect(serverVersion).toMatch(/^\d+/);
  });

  it("adds objectKey to the claim, and nothing else", () => {
    provisioned(database => {
      exec(
        database,
        `update public.group_files set object_key = '${OK_KEY}' where id = '${FILE_OK}';`
      );
      queue(
        database,
        `[{"id": "${FILE_OK}", "name": "Assignment 2.pdf"}]`,
        "cccccccc-0000-0000-0000-0000000000aa"
      );
      // Before: the discriminator. Deploy 3's payload has no key to find, which is
      // half of why Adam's PDF read as 「沒有可讀文字」.
      expect(
        one(
          database,
          "set role service_role; select (files -> 0 ? 'objectKey')::text " +
            "from public.claim_next_group_ai_request()"
        )
      ).toBe("false");
      const fifth = applyDeploy5(database);
      expect(fifth.stderr).not.toContain("ERROR");
      expect(fifth.status).toBe(0);
      queue(
        database,
        `[{"id": "${FILE_OK}", "name": "Assignment 2.pdf"}]`,
        "cccccccc-0000-0000-0000-0000000000bb"
      );
      const after = claimFiles(database);
      // Nothing else about the element changed: same id, same name, one new key.
      expect(after).toHaveLength(1);
      expect(after[0].objectKey).toBe(OK_KEY);
      expect(after[0].name).toBe("Assignment 2.pdf");
      expect(after[0].id).toBe(FILE_OK);
    });
  });

  it("withholds the key once retention has passed or the file is gone", () => {
    provisioned(database => {
      appliedDeploy5(database);
      exec(
        database,
        `update public.group_files set object_key = 'groups/${GROUP}/${FILE_EXPIRED}', ` +
          `retention_expires_at = now() - interval '1 hour' where id = '${FILE_EXPIRED}';` +
          `update public.group_files set object_key = 'groups/${GROUP}/${FILE_DELETED}', ` +
          `deleted_at = now() where id = '${FILE_DELETED}';`
      );
      queue(
        database,
        `[{"id": "${FILE_EXPIRED}", "name": "old.pdf"}, ` +
          `{"id": "${FILE_DELETED}", "name": "removed.pdf"}]`,
        "cccccccc-0000-0000-0000-0000000000cc"
      );
      // A file that stopped being current between the question and the claim is not
      // read, even though its bytes may still sit in the bucket: retention is a
      // decision, and the worker may not extend it by one request.
      const withheld = claimFiles(database);
      expect(withheld).toHaveLength(2);
      expect(withheld[0].objectKey).toBeNull();
      expect(withheld[1].objectKey).toBeNull();
      // The expired row is still `status = 'current'`, the deleted one is not; both
      // are withheld, by different clauses, and neither disappears from the array.
      expect(withheld[0].name).toBe("old.pdf");
      expect(withheld[1].name).toBe("removed.pdf");
    });
  });

  it("keeps the selection intact so the warning still counts correctly", () => {
    provisioned(database => {
      appliedDeploy5(database);
      exec(
        database,
        `update public.group_files set object_key = 'groups/${GROUP}/${FILE_OK2}' ` +
          `where id = '${FILE_OK2}';`
      );
      // One readable file, one id that is not in the table at all. Dropping the
      // second element would hide the 「沒有可讀文字」 notice, because the worker
      // compares files_used with the length of this array.
      queue(
        database,
        `[{"id": "${FILE_OK2}", "name": "notes.pdf"}, ` +
          `{"id": "dddddddd-0000-0000-0000-000000000009", "name": "vanished.pdf"}]`,
        "cccccccc-0000-0000-0000-0000000000dd"
      );
      const payload = one(
        database,
        "set role service_role; select files::text from public.claim_next_group_ai_request()"
      );
      const parsed = JSON.parse(payload) as Array<
        Record<string, string | null>
      >;
      expect(parsed).toHaveLength(2);
      expect(parsed[0].objectKey).toBe(`groups/${GROUP}/${FILE_OK2}`);
      expect(parsed[1].objectKey).toBeNull();
      expect(parsed[1].name).toBe("vanished.pdf");
    });
  });

  it("preserves the queue's own order", () => {
    provisioned(database => {
      appliedDeploy5(database);
      exec(
        database,
        `update public.group_files set object_key = 'k1' where id = '${FILE_OK}';` +
          `update public.group_files set object_key = 'k2' where id = '${FILE_OK2}';`
      );
      queue(
        database,
        `[{"id": "${FILE_OK2}", "name": "b.pdf"}, ` +
          `{"id": "${FILE_OK}", "name": "a.pdf"}]`,
        "cccccccc-0000-0000-0000-0000000000ee"
      );
      // Order is `created_at` at queue time in deploy 2, not this join's choice.
      // Order is `created_at` at queue time in deploy 2, not this join's choice.
      const ordered = claimFiles(database);
      expect(ordered.map(file => file.objectKey)).toEqual(["k2", "k1"]);
    });
  });

  it("cannot be stalled by a payload that is not an array", () => {
    provisioned(database => {
      appliedDeploy5(database);
      // begin always writes an array, but a row is a row: an exception here would
      // wedge the queue for every group behind it.
      queue(database, "null", "cccccccc-0000-0000-0000-0000000000f1");
      expect(
        one(
          database,
          "set role service_role; select files::text from public.claim_next_group_ai_request()"
        )
      ).toBe("null");
      queue(database, '{"id":"x"}', "cccccccc-0000-0000-0000-0000000000f2");
      expect(
        one(
          database,
          "set role service_role; select jsonb_typeof(files) from public.claim_next_group_ai_request()"
        )
      ).toBe("object");
    });
  });

  it("still reaches only the worker", () => {
    provisioned(database => {
      appliedDeploy5(database);
      for (const role of ["authenticated", "anon"]) {
        const refused = sql(
          database,
          `set role ${role}; select * from public.claim_next_group_ai_request();`
        );
        expect(refused.stderr, role).toContain("permission denied");
      }
      expect(
        one(
          database,
          "select pg_get_function_result('public.claim_next_group_ai_request()'::regprocedure)"
        )
      ).toBe(
        "TABLE(id uuid, group_id uuid, question text, turns jsonb, files jsonb, " +
          "chat_chars integer, file_chars integer, files_used integer, " +
          "dropped_context boolean)"
      );
    });
  });

  it("refuses a cluster whose marker names another project", () => {
    provisioned(database => {
      // The guard is the last line, not the first — but if it is missing entirely,
      // this is how it would show up: a silent apply on the frozen Prototype.
      exec(
        database,
        `update private.citylink_target set project_ref = '${PROTOTYPE_REF}';`
      );
      const refused = applyDeploy5(database);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("citylink_target_mismatch");
      expect(refused.stderr).toContain("45M02");
    });
  });
});
