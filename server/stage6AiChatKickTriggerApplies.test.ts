import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Applies the kick trigger to a disposable PostgreSQL database and watches what it
 * actually does.
 *
 * `pg_net` and `vault` do not exist on a bare server, so both are stubbed here: the
 * stub `net.http_post` records every call in a table, and the stub `vault` view
 * returns a known key. That makes the three claims that matter observable rather
 * than argued:
 *
 *   1. a successful `begin_group_ai_request` produces exactly one HTTP attempt;
 *   2. an HTTP failure does not undo the request (the row survives);
 *   3. a missing secret produces no attempt at all, and still no rollback.
 *
 * What a pass does NOT prove: that Launch has `pg_net`, that the real Vault read is
 * permitted to the definer, or that the Edge Function accepts the token. Those are
 * preflight items for the apply window.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const proposalPath = path.resolve(
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
const kickPath = path.resolve(
  here,
  "../docs/stage6/KAYK_AI_CHAT_KICK_TRIGGER_PROPOSAL.sql"
);
const stubPath = path.resolve(here, "fixtures/aiChatStubSchema.sql");
const scenarioPath = path.resolve(here, "fixtures/aiChatScenario.sql");
const baseUri = process.env.CITYLINK_TEST_PG_URI ?? "postgres:///postgres";
const GROUP = "aaaaaaaa-0000-0000-0000-000000000001";
const ASKER = "11111111-1111-1111-1111-111111111111";

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
function exec(database: string, text: string): Run {
  const run = psql(database, ["-c", text]);
  if (run.status !== 0) throw new Error(`setup failed: ${run.stderr}`);
  return run;
}
function one(database: string, text: string): string {
  const run = psql(database, ["-tAc", text]);
  if (run.status !== 0) throw new Error(`probe failed: ${run.stderr}`);
  return run.stdout.trim();
}
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
function serverAvailable(): boolean {
  return (
    psql(baseUri, ["-v", "ON_ERROR_STOP=1", "-tAc", "select 1"]).status === 0
  );
}
const available = serverAvailable();
if (!available) {
  console.warn(
    "[stage6AiChatKickTriggerApplies] SKIPPED: no reachable PostgreSQL. The claims that " +
      "the kick fires once, survives failure and skips without a secret are NOT covered."
  );
}
const serverVersion = available ? one(baseUri, "show server_version") : "";
const serverMajor = Number(serverVersion.split(".")[0]);

/**
 * Stand-ins for the two Supabase-only pieces. `net.calls` is the observation point;
 * `net.mode` lets a test make the next call raise, which is how the no-rollback
 * claim is exercised rather than asserted.
 */
const STUBS = `
create schema if not exists net;
create schema if not exists vault;
create table net.calls (
  id bigserial primary key,
  url text,
  body jsonb,
  headers jsonb,
  called_at timestamptz not null default now()
);
create table net.mode (raise_on_call boolean not null default false);
insert into net.mode default values;
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $stub$
declare v_raise boolean;
begin
  select raise_on_call into v_raise from net.mode limit 1;
  if coalesce(v_raise, false) then
    raise exception 'stub_net_unreachable' using errcode = '08006';
  end if;
  insert into net.calls (url, body, headers)
    values (url, body, headers)
    returning id into v_raise;
  return 1;
end;
$stub$;
create table vault.secret_rows (name text primary key, decrypted_secret text);
create or replace view vault.decrypted_secrets as
  select name, decrypted_secret from vault.secret_rows;
`;

function withDatabase(run: (database: string) => void): void {
  const database = `citylink_kick_${process.pid}_${Date.now()}_${Math.floor(
    Math.random() * 1000
  )}`;
  const created = psql(baseUri, [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `create database ${database}`,
  ]);
  if (created.status !== 0) throw new Error(`create database failed: ${created.stderr}`);
  try {
    run(database);
  } finally {
    psql(baseUri, ["-c", `drop database if exists ${database}`]);
  }
}

/** Real queue table and real `begin_group_ai_request`, then the stubs, then the kick. */
function provisioned(run: (database: string) => void): void {
  withDatabase(database => {
    expect(psql(database, ["-v", "ON_ERROR_STOP=1", "-f", stubPath]).status).toBe(0);
    exec(
      database,
      `insert into private.citylink_target (project_ref, system_identifier) values ` +
        `('pijslbchvstkoweslymr', (select system_identifier::text from pg_control_system()));`
    );
    for (const file of [proposalPath, deploy2Path, deploy3Path]) {
      const applied = applyFile(database, file);
      expect(applied.stderr).not.toContain("ERROR");
      expect(applied.status).toBe(0);
    }
    expect(psql(database, ["-v", "ON_ERROR_STOP=1", "-f", scenarioPath]).status).toBe(0);
    exec(database, STUBS);
    exec(
      database,
      `insert into vault.secret_rows (name, decrypted_secret) ` +
        `values ('group_ai_executor_key', 'stub-service-key');`
    );
    const kick = applyFile(database, kickPath);
    expect(kick.stderr).not.toContain("ERROR");
    expect(kick.status).toBe(0);
    run(database);
  });
}

function begin(database: string): Run {
  return psql(database, [
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-c",
    `set citylink.test_uid='${ASKER}'; select public.accept_ai_disclosure(); ` +
      `select request_id from public.begin_group_ai_request('${GROUP}', 'trigger probe', '{}'::uuid[]);`,
  ]);
}
const calls = (database: string): number =>
  Number(one(database, "select count(*) from net.calls"));

describe.skipIf(!available)("kick trigger — behaviour", () => {
  it(`applies on PostgreSQL ${serverVersion} (major ${serverMajor})`, () => {
    provisioned(() => {
      // The assertion is that provisioning did not throw.
      expect(true).toBe(true);
    });
  });

  it("fires exactly once for a successful begin", () => {
    provisioned(database => {
      const before = calls(database);
      const run = begin(database);
      expect(run.status).toBe(0);
      expect(calls(database) - before).toBe(1);
      const headers = one(database, "select headers::text from net.calls order by id desc limit 1");
      expect(headers).toContain("Bearer stub-service-key");
      const body = one(database, "select body::text from net.calls order by id desc limit 1");
      expect(body).toContain("request_id");
      expect(body).toContain(GROUP);
    });
  });

  it("does not undo the request when the HTTP attempt fails", () => {
    provisioned(database => {
      exec(database, "update net.mode set raise_on_call = true;");
      const before = calls(database);
      const run = begin(database);
      // begin itself must still succeed: the trigger swallowed the transport error.
      expect(run.status).toBe(0);
      expect(run.stderr).toContain("group_ai_kick_failed");
      expect(calls(database)).toBe(before);
      expect(
        one(database, "select count(*) from public.group_ai_requests where question = 'trigger probe'")
      ).toBe("1");
      expect(
        one(database, "select status from public.group_ai_requests where question = 'trigger probe'")
      ).toBe("queued");
    });
  });

  it("makes no attempt and keeps the request when the secret is missing", () => {
    provisioned(database => {
      exec(database, "delete from vault.secret_rows;");
      const before = calls(database);
      const run = begin(database);
      expect(run.status).toBe(0);
      expect(run.stderr).toContain("group_ai_kick_no_secret");
      expect(calls(database)).toBe(before);
      expect(
        one(database, "select count(*) from public.group_ai_requests where question = 'trigger probe'")
      ).toBe("1");
    });
  });

  it("does not fire for a row that is not queued", () => {
    provisioned(database => {
      const before = calls(database);
      exec(
        database,
        `insert into public.group_ai_requests (group_id, asked_by, idempotency_key, question, status)
         values ('${GROUP}', null, gen_random_uuid(), 'already processing', 'processing');`
      );
      expect(calls(database)).toBe(before);
    });
  });
});
