import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
/**
 * Applies the group-AI-chat migration proposal to a disposable PostgreSQL database and
 * exercises the write path against it.
 *
 * Why this exists: a text-only review cannot see a PL/pgSQL syntax error, a
 * `returns table` that disagrees with its `return query`, or a RAISE that supplies both
 * a message and a MESSAGE option (PostgreSQL rejects that with 42601). All three were
 * real defects in the first draft of this file and only the run caught them.
 *
 * It runs only where a PostgreSQL server is reachable; otherwise it is skipped with a
 * loud warning, so a green suite is never read as proof the migration applies. Nothing
 * here contacts a Supabase project: server/fixtures/aiChatStubSchema.sql is a stand-in,
 * so a pass proves the SQL parses, applies and behaves as specified — not that live
 * Auth, RLS on the real schema, or a real provider works.
 *
 * Engine note (carried over from the P1 review): both Supabase targets run PostgreSQL 17
 * while this harness may be 16. This proposal uses nothing 17-specific, so a 16 pass is
 * weaker evidence rather than a failure; the version is printed so the recorded run
 * states its own limits.
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
const stubPath = path.resolve(here, "fixtures/aiChatStubSchema.sql");
const scenarioPath = path.resolve(here, "fixtures/aiChatScenario.sql");
const baseUri = process.env.CITYLINK_TEST_PG_URI ?? "postgres:///postgres";
const LAUNCH_REF = "pijslbchvstkoweslymr";
const PROTOTYPE_REF = "wkzclgmhrtecnpexfesr";

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
  const run = psql(database, ["-c", text]);
  if (run.status !== 0) {
    throw new Error(`setup failed: ${run.stderr}`);
  }
}

/**
 * Assert a refusal by naming both halves: the SQLSTATE and the token. Matching only the
 * token would still pass if the errcode were edited, and the numbered codes exist so a
 * log line says which gate refused.
 */
function refused(run: Run, code: string, token: string): void {
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain(code);
  expect(run.stderr).toContain(token);
}

function serverAvailable(): boolean {
  return (
    psql(baseUri, ["-v", "ON_ERROR_STOP=1", "-tAc", "select 1"]).status === 0
  );
}

const available = serverAvailable();
if (!available) {
  console.warn(
    "[stage6AiChatMigrationApplies] SKIPPED: no reachable PostgreSQL. The claims that " +
      "the AI-chat proposal applies, refuses a wrong target and behaves as specified are " +
      "NOT covered by this run."
  );
}
const serverVersion = available ? one(baseUri, "show server_version") : "";
const serverMajor = Number(serverVersion.split(".")[0]);

const GROUP = "aaaaaaaa-0000-0000-0000-000000000001";
const ABANDONED = "aaaaaaaa-0000-0000-0000-000000000002";
const QUOTA_GROUP = "aaaaaaaa-0000-0000-0000-000000000003";
const STALE_GROUP = "aaaaaaaa-0000-0000-0000-000000000005";
const OTHER_GROUP = "aaaaaaaa-0000-0000-0000-000000000006";
const BUDGET_GROUP = "aaaaaaaa-0000-0000-0000-000000000007";
const ASKER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const LEFT = "44444444-4444-4444-4444-444444444444";
const FRESH = "55555555-5555-5555-5555-555555555555";
const BUDGET = "66666666-6666-6666-6666-666666666666";
const FILE_OK = "bbbbbbbb-0000-0000-0000-000000000001";
const FILE_EXPIRED = "bbbbbbbb-0000-0000-0000-000000000002";
const FILE_OTHER_GROUP = "bbbbbbbb-0000-0000-0000-000000000003";
const FILE_DELETED = "bbbbbbbb-0000-0000-0000-000000000004";
const FILE_OK2 = "bbbbbbbb-0000-0000-0000-000000000005";

function as(actor: string, body: string): string {
  return `set citylink.test_uid='${actor}'; ${body}`;
}

/**
 * `questionExpr` and `files` are raw SQL expressions rather than quoted strings, so a
 * test can pass repeat('q', 4001) without the helper wrapping it in quotes.
 */
function beginSql(
  actor: string,
  group: string,
  questionExpr: string,
  files: string[] = [],
  key?: string
): string {
  const list = files.length > 0 ? `{${files.join(",")}}` : "{}";
  const keyArg = key ? `,'${key}'::uuid` : "";
  return as(
    actor,
    `select request_id, dropped_context, jsonb_array_length(turns) as n_turns, ` +
      `(select count(*) from jsonb_array_elements(turns) e ` +
      `where e->>'authorKind' = 'ai') as ai_turns ` +
      `from public.begin_group_ai_request('${group}', ${questionExpr}, ` +
      `'${list}'::uuid[]${keyArg});`
  );
}

function askOnce(
  database: string,
  actor: string,
  group: string,
  question: string,
  key: string,
  files: string[] = []
): Run {
  return sql(
    database,
    beginSql(actor, group, `'${question}'::text`, files, key)
  );
}

function requestIdFrom(run: Run): string {
  const match = run.stdout.match(/[0-9a-f]{8}-[0-9a-f-]{27}/);
  if (!match) {
    throw new Error(`no request id in output: ${run.stdout}${run.stderr}`);
  }
  return match[0];
}

/** End every open request in a group, so the one-in-flight rule does not mask a case. */
function drain(database: string, group: string): void {
  exec(
    database,
    `update public.group_ai_requests set status = 'ready', finished_at = now() ` +
      `where group_id = '${group}' and status in ('queued', 'processing');`
  );
}

function accept(database: string, actor: string): void {
  exec(database, as(actor, "select public.accept_ai_disclosure();"));
}

function withDatabase(run: (database: string) => void): void {
  const database = `citylink_aichat_${process.pid}_${Date.now()}_${Math.floor(
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

/** Stub schema plus a marker; the marker ref is a parameter to prove the guard works. */
function provision(
  run: (database: string) => void,
  markerRef = LAUNCH_REF
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
    run(database);
  });
}

function applyFile(database: string, file: string): Run {
  // VERBOSITY=verbose is not cosmetic: psql hides the SQLSTATE at the default level, so
  // without it these tests could only match the message text. The token-to-code pairing
  // in the file itself is checked statically in stage6AiChatSqlContract.test.ts.
  return psql(database, [
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-f",
    file,
  ]);
}

/** Deploy 1 of Adam's S-9 ruling (b): tables, consent, columns, unvalidated constraints. */
function applyDeploy1(database: string): Run {
  return applyFile(database, proposalPath);
}

/** Deploy 2: validation, indexes, the read/write path, the status RPC and all grants. */
function applyDeploy2(database: string): Run {
  return applyFile(database, deploy2Path);
}
/** Deploy 3: the service-role-only claim that returns the row the executor must answer. */
function applyDeploy3(database: string): Run {
  return applyFile(database, deploy3Path);
}

/**
 * The whole proposal, in the order the operator must run it. A failed deploy 1 is returned
 * without attempting deploy 2: running the second half anyway is exactly the "apply then
 * fix" move the project rules forbid, so the harness refuses to model it.
 */
function apply(database: string): Run {
  const first = applyDeploy1(database);
  if (first.status !== 0) {
    return first;
  }
  return applyDeploy2(database);
}

function withScenario(database: string): void {
  expect(
    psql(database, ["-v", "ON_ERROR_STOP=1", "-f", scenarioPath]).status
  ).toBe(0);
}

function provisioned(run: (database: string) => void): void {
  provision(database => {
    const first = apply(database);
    expect(first.stderr).not.toContain("ERROR");
    expect(first.status).toBe(0);
    withScenario(database);
    run(database);
  });
}

/** Only deploy 1 has run. Used to prove the split is real, not cosmetic. */
function provisionedDeploy1(run: (database: string) => void): void {
  provision(database => {
    const first = applyDeploy1(database);
    expect(first.stderr).not.toContain("ERROR");
    expect(first.status).toBe(0);
    withScenario(database);
    run(database);
  });
}

const READ_AI =
  "public.list_group_chat_messages_ai(uuid,timestamptz,uuid,integer)";
const READ_PAGE =
  "private.list_group_chat_messages_page(uuid,timestamptz,uuid,integer)";
const BEGIN = "public.begin_group_ai_request(uuid,text,uuid[],uuid)";
const CLEAR = "public.clear_group_ai_context(uuid)";
const ACCEPT = "public.accept_ai_disclosure()";
const CLAIM = "public.claim_group_ai_request(uuid)";
const FINISH =
  "public.finish_group_ai_request(uuid,text,boolean,boolean,integer,integer,integer,text)";
const STATUS = "public.get_group_ai_request_status(uuid)";
const ALL_FUNCTIONS = [
  READ_AI,
  READ_PAGE,
  BEGIN,
  CLEAR,
  ACCEPT,
  CLAIM,
  FINISH,
  STATUS,
];

/** Objects that only the second deploy creates, so a refused deploy 2 proves nothing landed. */
const DEPLOY2_PROBE =
  "select ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
  "where (n.nspname = 'public' and p.proname in ('list_group_chat_messages_ai', " +
  "'begin_group_ai_request', 'clear_group_ai_context', 'claim_group_ai_request', " +
  "'finish_group_ai_request', 'get_group_ai_request_status')) " +
  "or (n.nspname = 'private' and p.proname = 'list_group_chat_messages_page')))::text";

/** The five constraints Section 3 adds `not valid` and Section 3.1 validates. */
const FIVE_CONSTRAINTS =
  "('group_chat_messages_author_kind', 'group_chat_messages_ai_has_no_sender', " +
  "'group_chat_messages_ai_name', 'group_chat_messages_ai_request_only_for_ai', " +
  "'group_chat_messages_ai_request_fkey')";

/**
 * Every object the proposal creates: two tables plus seven functions. A refused apply
 * must leave this at zero, which is what makes section 0 a guard rather than a notice.
 */
const CREATED_PROBE =
  "select ((select count(*) from pg_tables where schemaname = 'public' " +
  "and tablename in ('group_ai_context', 'group_ai_requests')) + " +
  "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
  "where (n.nspname = 'public' and p.proname in ('list_group_chat_messages_ai', " +
  "'begin_group_ai_request', 'clear_group_ai_context', 'accept_ai_disclosure', " +
  "'claim_group_ai_request', 'finish_group_ai_request', " +
  "'get_group_ai_request_status')) " +
  "or (n.nspname = 'private' and p.proname = 'list_group_chat_messages_page')))::text";

describe.skipIf(!available)("group ai chat migration proposal applies", () => {
  it("states the engine the evidence was produced on", () => {
    expect(serverMajor).toBeGreaterThanOrEqual(16);
    console.log(
      `[stage6AiChatMigrationApplies] harness PostgreSQL ${serverVersion}; the ` +
        `Supabase targets are 17.11. Nothing in this proposal needs 17.`
    );
  });

  it("refuses when the target marker is missing, creating nothing", () => {
    withDatabase(database => {
      expect(
        psql(database, ["-v", "ON_ERROR_STOP=1", "-f", stubPath]).status
      ).toBe(0);
      const run = apply(database);
      refused(run, "45M01", "citylink_target_marker_missing");
      expect(one(database, CREATED_PROBE)).toBe("0");
    });
  });

  it("refuses when the marker names another project, creating nothing", () => {
    // The 2026-11-24 incident: work ran against the frozen Prototype because nothing in
    // the SQL could tell one project from another.
    provision(database => {
      const run = apply(database);
      refused(run, "45M02", "citylink_target_mismatch");
      expect(one(database, CREATED_PROBE)).toBe("0");
    }, PROTOTYPE_REF);
  });

  it("refuses when the cluster identity changed", () => {
    // 45M03: right marker row, different physical cluster (restore or clone).
    provision(database => {
      exec(
        database,
        "update private.citylink_target set system_identifier = '1'::text"
      );
      const run = apply(database);
      refused(run, "45M03", "citylink_target_cluster_changed");
      expect(one(database, CREATED_PROBE)).toBe("0");
    });
  });

  it("applies cleanly, is re-appliable, and creates the expected shape", () => {
    provision(database => {
      expect(apply(database).status).toBe(0);
      // Re-applying must also succeed: constraints are guarded by DO blocks and
      // functions by create or replace, so a partial retry cannot abort.
      const second = apply(database);
      expect(second.stderr).not.toContain("ERROR");
      expect(second.status).toBe(0);
      expect(one(database, CREATED_PROBE)).toBe("10");
      expect(
        one(
          database,
          "select count(*) from pg_constraint where conname in " +
            FIVE_CONSTRAINTS
        )
      ).toBe("5");
      // N-4: the constraints are created `not valid` and validated in section 3.1, so a
      // completed apply must end with all five validated. A leftover `not valid` constraint
      // would let a future row break the AI identity rules without error.
      expect(
        one(
          database,
          "select count(*) from pg_constraint where conname in " +
            "('group_chat_messages_author_kind', 'group_chat_messages_ai_has_no_sender', " +
            "'group_chat_messages_ai_name', 'group_chat_messages_ai_request_only_for_ai', " +
            "'group_chat_messages_ai_request_fkey') and convalidated"
        )
      ).toBe("5");
      const oids = ALL_FUNCTIONS.map(f => `'${f}'::regprocedure`).join(",");
      expect(
        one(
          database,
          `select count(*) from pg_proc where oid in (${oids}) and prosecdef`
        )
      ).toBe("8");
      // search_path = '' appears in proconfig as search_path="".
      expect(
        one(
          database,
          `select count(*) from pg_proc where oid in (${oids}) ` +
            `and proconfig @> array['search_path=""']`
        )
      ).toBe("8");
      expect(
        one(
          database,
          "select count(*) from pg_class where relname in ('group_ai_context', " +
            "'group_ai_requests') and relrowsecurity"
        )
      ).toBe("2");
      expect(
        one(
          database,
          "select count(*) from pg_policies where tablename in " +
            "('group_ai_context', 'group_ai_requests')"
        )
      ).toBe("0");
      expect(
        one(
          database,
          "select count(*) from pg_constraint where conname = 'group_ai_requests_idempotent'"
        )
      ).toBe("1");
      expect(
        one(
          database,
          "select count(*) from pg_indexes where indexname = 'group_chat_messages_ai_request'"
        )
      ).toBe("1");
    });
  });

  it("makes the AI request id unique, not merely indexed (E1)", () => {
    // The pg_indexes count above cannot tell a plain index from a unique one: both return
    // 1. This one can, and it is the only assertion here that would have failed before E1.
    // The state machine in finish() cannot prove it either — a second finish is idempotent
    // by design and never reaches the index — so the duplicate is written directly, as the
    // owner, exactly as a stray import or a second writer would.
    provisioned(database => {
      const group = "aaaaaaaa-0000-0000-0000-000000000001";
      const request = "cccccccc-0000-0000-0000-000000000001";
      exec(
        database,
        "insert into public.group_ai_requests " +
          "(id, group_id, asked_by, idempotency_key, question) values " +
          `('${request}', '${group}', '11111111-1111-1111-1111-111111111111', ` +
          "gen_random_uuid(), 'unique index probe');"
      );
      const insert = (body: string) =>
        sql(
          database,
          "insert into public.group_chat_messages " +
            "(group_id, sender_id, sender_name_snapshot, body, author_kind, ai_request_id) " +
            `values ('${group}', null, 'CityLink AI', '${body}', 'ai', '${request}');`
        );
      expect(insert("first answer").status).toBe(0);
      const second = insert("second answer");
      expect(second.status).not.toBe(0);
      // Named, not just numbered: a 23505 from some other constraint would not prove E1.
      expect(second.stderr).toContain("23505");
      expect(second.stderr).toContain("group_chat_messages_ai_request");
    });
  });

  it("grants execute only where the rulings put it, and no table rights at all", () => {
    provisioned(database => {
      const fn = (role: string, sig: string) =>
        one(
          database,
          `select has_function_privilege('${role}','${sig}','execute')::text`
        );
      expect(fn("authenticated", BEGIN)).toBe("true");
      expect(fn("authenticated", READ_AI)).toBe("true");
      expect(fn("authenticated", ACCEPT)).toBe("true");
      expect(fn("authenticated", CLEAR)).toBe("true");
      // S-2 (Adam's option b): the disclosure counters are readable by anyone who can
      // read the chat, because that is how the notice reaches a client at all.
      expect(fn("authenticated", STATUS)).toBe("true");
      expect(fn("service_role", STATUS)).toBe("false");
      expect(fn("authenticated", FINISH)).toBe("false");
      expect(fn("authenticated", CLAIM)).toBe("false");
      // The private helper stays internal: only the definer wrapper calls it.
      expect(fn("authenticated", READ_PAGE)).toBe("false");
      expect(fn("service_role", CLAIM)).toBe("true");
      expect(fn("service_role", FINISH)).toBe("true");
      expect(fn("service_role", BEGIN)).toBe("false");
      expect(fn("service_role", READ_AI)).toBe("false");
      // R-2: PostgreSQL grants EXECUTE to PUBLIC by default, so a missing revoke would
      // let any signed-in user — and anon — post as CityLink AI. anon is a real role and
      // holds no explicit grant, which is what makes it the probe for PUBLIC.
      for (const sig of ALL_FUNCTIONS) {
        expect(fn("anon", sig), `anon execute ${sig}`).toBe("false");
      }

      const tbl = (role: string, table: string, priv: string) =>
        one(
          database,
          `select has_table_privilege('${role}','${table}','${priv}')::text`
        );
      for (const role of ["service_role", "authenticated", "anon"]) {
        for (const table of [
          "public.group_ai_requests",
          "public.group_ai_context",
        ]) {
          for (const priv of ["select", "insert", "update", "delete"]) {
            expect(tbl(role, table, priv), `${role} ${table} ${priv}`).toBe(
              "false"
            );
          }
        }
      }
      // F-1: with no table privileges, service_role cannot mark a request ready without
      // inserting the chat message that says it answered.
      const bypass = sql(
        database,
        "set role service_role; update public.group_ai_requests set status = 'ready';"
      );
      expect(bypass.stderr).toContain("permission denied");
    });
  });

  it("refuses the write path before writing anything", () => {
    provisioned(database => {
      refused(
        sql(database, beginSql(OUTSIDER, GROUP, "'hi'::text")),
        "45N01",
        "group_ai_no_permission"
      );
      refused(
        sql(database, beginSql(ASKER, ABANDONED, "'hi'::text")),
        "45N01",
        "group_ai_no_permission"
      );
      // F-11: an active member who never accepted the disclosure cannot ask.
      refused(
        sql(database, beginSql(FRESH, STALE_GROUP, "'hi'::text")),
        "45N09",
        "group_ai_disclosure_required"
      );
      accept(database, FRESH);
      refused(
        sql(database, beginSql(FRESH, STALE_GROUP, "'   '::text")),
        "45N03",
        "group_ai_question_empty"
      );
      expect(one(database, CREATED_PROBE)).toBe("10");
      expect(
        one(database, "select count(*) from public.group_ai_requests")
      ).toBe("0");
      expect(
        one(
          database,
          "select count(*) from public.profiles where ai_disclosure_accepted_at is not null"
        )
      ).toBe("1");
    });
  });

  it("checks file eligibility on the server, not on the client's word", () => {
    provisioned(database => {
      accept(database, BUDGET);
      refused(
        sql(
          database,
          beginSql(BUDGET, GROUP, "'three'::text", [
            FILE_OK,
            FILE_OK2,
            FILE_EXPIRED,
          ])
        ),
        "45N05",
        "group_ai_too_many_files"
      );
      for (const file of [FILE_EXPIRED, FILE_OTHER_GROUP, FILE_DELETED]) {
        refused(
          sql(database, beginSql(BUDGET, GROUP, "'bad file'::text", [file])),
          "45N04",
          "group_ai_file_not_eligible"
        );
      }
      // Two eligible files, passed out of order: ids are stored sorted so a retry
      // compares equal (F-2), and the log keeps names but no extracted text.
      const run = sql(
        database,
        beginSql(
          BUDGET,
          GROUP,
          "'two files'::text",
          [FILE_OK2, FILE_OK],
          KEY(1)
        )
      );
      expect(run.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select array_length(file_ids, 1) || '/' || (file_ids[1] < file_ids[2])::text " +
            "|| '/' || jsonb_array_length(files) || '/' || files_used::text " +
            "from public.group_ai_requests where idempotency_key = " +
            `'${KEY(1)}'`
        )
      ).toBe("2/true/2/2");
      expect(
        one(
          database,
          "select string_agg(e->>'name', ',' order by e->>'name') " +
            "from public.group_ai_requests r, jsonb_array_elements(r.files) e " +
            `where r.idempotency_key = '${KEY(1)}'`
        )
      ).toBe("ok.pdf,second.pdf");
      expect(
        one(
          database,
          "select count(*) from public.group_ai_requests where turns::text like '%\"text\"%' " +
            "or files::text like '%\"text\"%'"
        )
      ).toBe("0");
    });
  });

  it("applies the four context rules with a 4,000-character budget", () => {
    provisioned(database => {
      accept(database, BUDGET);
      // Group 7 interleaves five 1,500-char member messages with four 500-char AI
      // answers. Newest first the budget fits c(500), w(1500), d(500), v(1500) = 4,000,
      // so exactly two AI answers and two member messages survive (rules 2 and 3).
      const run = sql(
        database,
        beginSql(BUDGET, BUDGET_GROUP, "'budget'::text", [], KEY(2))
      );
      expect(run.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select jsonb_array_length(turns) || '/' || dropped_context::text || '/' || " +
            "(select count(*) from jsonb_array_elements(turns) e where e->>'authorKind' = 'ai')::text " +
            "|| '/' || chat_chars::text from public.group_ai_requests where idempotency_key = " +
            `'${KEY(2)}'`
        )
      ).toBe("4/true/2/4000");
      // The two AI answers kept are the two most recent ones, oldest dropped first.
      expect(
        one(
          database,
          "select string_agg(left(e->>'body', 1), '' order by e->>'createdAt') " +
            "from public.group_ai_requests r, jsonb_array_elements(r.turns) e " +
            `where r.idempotency_key = '${KEY(2)}' and e->>'authorKind' = 'ai'`
        )
      ).toBe("cd");
      // Rule 1: the question is never charged against the history budget.
      drain(database, BUDGET_GROUP);
      const long = sql(
        database,
        beginSql(BUDGET, BUDGET_GROUP, "repeat('問', 4000)::text", [], KEY(3))
      );
      expect(long.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select chat_chars::text || '/' || char_length(question)::text " +
            "from public.group_ai_requests where idempotency_key = " +
            `'${KEY(3)}'`
        )
      ).toBe("4000/4000");
      // 4,001 characters is refused rather than quietly clipped.
      refused(
        sql(
          database,
          beginSql(BUDGET, BUDGET_GROUP, "repeat('問', 4001)::text", [], KEY(4))
        ),
        "45N11",
        "group_ai_question_too_long"
      );
    });
  });

  it("replays an identical request and refuses a changed one", () => {
    provisioned(database => {
      accept(database, ASKER);
      const first = askOnce(database, ASKER, GROUP, "same", KEY(5), [FILE_OK]);
      expect(first.stderr).not.toContain("ERROR");
      const id = requestIdFrom(first);
      const replay = askOnce(database, ASKER, GROUP, "same", KEY(5), [FILE_OK]);
      expect(replay.stdout).toContain(id);
      expect(
        one(
          database,
          "select count(*) from public.group_ai_requests where idempotency_key = " +
            `'${KEY(5)}'`
        )
      ).toBe("1");
      refused(
        askOnce(database, ASKER, GROUP, "changed", KEY(5), [FILE_OK]),
        "45N07",
        "group_ai_idempotency_conflict"
      );
      refused(
        askOnce(database, ASKER, GROUP, "same", KEY(5)),
        "45N07",
        "group_ai_idempotency_conflict"
      );
      // The reply that was already produced is replayed verbatim, so a retry after a
      // refresh cannot answer the same question twice.
      exec(
        database,
        `select public.finish_group_ai_request('${id}', 'first answer', false, false, 10, 0, 1, null);`
      );
      const afterFinish = askOnce(database, ASKER, GROUP, "same", KEY(5), [
        FILE_OK,
      ]);
      expect(afterFinish.stdout).toContain(id);
      expect(
        one(
          database,
          "select count(*) from public.group_chat_messages where author_kind = 'ai' " +
            `and group_id = '${GROUP}'`
        )
      ).toBe("1");
    });
  });

  it("enforces the three rate limits inside the transaction", () => {
    provisioned(database => {
      accept(database, ASKER);
      accept(database, OTHER);
      accept(database, FRESH);
      // One in flight per group. The second question is refused with the short wait,
      // because an answer in progress clears in seconds rather than at midnight.
      const first = askOnce(database, ASKER, GROUP, "in flight", KEY(6));
      expect(first.stderr).not.toContain("ERROR");
      const blocked = askOnce(database, OTHER, GROUP, "second", KEY(7));
      refused(blocked, "45N06", "group_ai_rate_limited");
      expect(blocked.stderr).toContain("reason=in_flight");
      expect(blocked.stderr).toContain("retry_after=15");
      // G-3: a queued row nobody ever claimed produced no provider call, so it must not
      // burn the day's quota, and once stale it must stop blocking the group.
      exec(
        database,
        "update public.group_ai_requests set created_at = now() - interval '200 seconds' " +
          `where idempotency_key = '${KEY(6)}'`
      );
      const afterStale = askOnce(database, OTHER, GROUP, "after stale", KEY(8));
      expect(afterStale.stderr).not.toContain("ERROR");
      drain(database, GROUP);

      // 20 per group per UTC day.
      exec(
        database,
        "insert into public.group_ai_requests (group_id, asked_by, idempotency_key, " +
          "question, status, created_at) " +
          `select '${QUOTA_GROUP}','${OTHER}', gen_random_uuid(), 'q', 'ready', now() ` +
          "from generate_series(1, 20);"
      );
      const groupRun = askOnce(
        database,
        OTHER,
        QUOTA_GROUP,
        "group cap",
        KEY(9)
      );
      refused(groupRun, "45N06", "group_ai_rate_limited");
      expect(groupRun.stderr).toContain("reason=group_daily");
      expect(groupRun.stderr).toContain("group_today=20");

      // 10 per member per UTC day, counted across every group: a group-only advisory
      // lock cannot cover this, hence the second lock keyed on the actor (G-2).
      exec(
        database,
        "insert into public.group_ai_requests (group_id, asked_by, idempotency_key, " +
          "question, status, created_at) " +
          `select '${OTHER_GROUP}','${FRESH}', gen_random_uuid(), 'q', 'ready', now() ` +
          "from generate_series(1, 10);"
      );
      const userRun = askOnce(
        database,
        FRESH,
        STALE_GROUP,
        "user cap",
        KEY(10)
      );
      refused(userRun, "45N06", "group_ai_rate_limited");
      expect(userRun.stderr).toContain("reason=user_daily");
      expect(userRun.stderr).toContain("group_today=0");
      // retry_after is seconds until the UTC reset, clamped to at least one.
      const seconds = Number(
        userRun.stderr.match(/retry_after=(\d+)/)?.[1] ?? "0"
      );
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(86400);
    });
  });

  it("moves through the claim and finish state machine exactly once", () => {
    provisioned(database => {
      accept(database, ASKER);
      const run = askOnce(database, ASKER, GROUP, "state", KEY(11), [FILE_OK]);
      expect(run.stderr).not.toContain("ERROR");
      const id = requestIdFrom(run);
      // G-4: processing has to be reachable, otherwise the stale-row rule is dead code.
      expect(
        one(database, `select public.claim_group_ai_request('${id}')::text`)
      ).toBe("true");
      expect(
        one(database, `select public.claim_group_ai_request('${id}')::text`)
      ).toBe("false");
      expect(
        one(
          database,
          `select status from public.group_ai_requests where id = '${id}'`
        )
      ).toBe("processing");

      const message = one(
        database,
        `select public.finish_group_ai_request('${id}', 'answer text', false, false, 900, 0, 1, null)`
      );
      expect(message).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/);
      const again = one(
        database,
        `select public.finish_group_ai_request('${id}', 'second attempt', false, false, 900, 0, 1, null)`
      );
      expect(again).toBe(message);
      expect(
        one(
          database,
          `select count(*) from public.group_chat_messages where ai_request_id = '${id}'`
        )
      ).toBe("1");
      // Decision 1 and 3: the answer carries no sender and the fixed display name.
      expect(
        one(
          database,
          "select author_kind || '/' || coalesce(sender_id::text, 'null') || '/' || " +
            "sender_name_snapshot || '/' || truncated::text || '/' || " +
            "(coalesce(ai_request_id::text, 'null') = '" +
            id +
            "')::text " +
            `from public.group_chat_messages where id = '${message}'`
        )
      ).toBe("ai/null/CityLink AI/false/true");
      expect(
        one(
          database,
          "select status || '/' || (claimed_at is not null)::text || '/' || " +
            `(finished_at is not null)::text from public.group_ai_requests where id = '${id}'`
        )
      ).toBe("ready/true/true");

      // Failure path: no message, but the row is terminal and auditable, and the group
      // is unblocked.
      const failed = askOnce(database, ASKER, GROUP, "failure", KEY(12));
      const fid = requestIdFrom(failed);
      expect(
        one(
          database,
          `select coalesce(public.finish_group_ai_request('${fid}', null, false, false, 0, 0, 0, 'provider_timeout')::text, 'none')`
        )
      ).toBe("none");
      expect(
        one(
          database,
          `select status || '/' || error_code from public.group_ai_requests where id = '${fid}'`
        )
      ).toBe("failed/provider_timeout");
      expect(
        one(
          database,
          `select count(*) from public.group_chat_messages where ai_request_id = '${fid}'`
        )
      ).toBe("0");
      // An answer without a body is not a success.
      refused(
        sql(
          database,
          `select public.finish_group_ai_request('${fid}', '   ', false, false, 0, 0, 0, null);`
        ),
        "45N10",
        "group_ai_answer_empty"
      );
      // F-4: finish and claim need no auth.uid() — service_role carries no JWT. Calling
      // them as that role must work, which a literal "actor from auth.uid()" check would
      // break. The same calls as authenticated must be refused instead (R-2).
      exec(
        database,
        "insert into public.group_ai_requests (group_id, asked_by, idempotency_key, " +
          `question) values ('${GROUP}', '${ASKER}', '${KEY(90)}', 'svc');`
      );
      const svcId = one(
        database,
        "select id from public.group_ai_requests where idempotency_key = " +
          `'${KEY(90)}'`
      );
      const asService = sql(
        database,
        "set role service_role; select public.claim_group_ai_request(" +
          `'${svcId}'); select public.finish_group_ai_request('${svcId}', ` +
          "'by service role', false, false, 0, 0, 0, null); reset role;"
      );
      expect(asService.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select count(*) from public.group_chat_messages where ai_request_id = " +
            `'${svcId}'`
        )
      ).toBe("1");
      const claimProbe = sql(
        database,
        `set role authenticated; select public.claim_group_ai_request('${id}');`
      );
      expect(claimProbe.stderr).toContain("permission denied");
      const finishProbe = sql(
        database,
        "set role authenticated; select public.finish_group_ai_request(" +
          `'${id}', 'forged', false, false, 0, 0, 0, null);`
      );
      expect(finishProbe.stderr).toContain("permission denied");

      refused(
        sql(
          database,
          "select public.finish_group_ai_request(" +
            "'99999999-9999-9999-9999-999999999999', 'x', false, false, 0, 0, 0, null);"
        ),
        "45N08",
        "group_ai_request_unknown"
      );
      // The existing 4,000-character column CHECK still wins over a huge answer, which
      // is why the application layer truncates first (decision 4).
      const huge = sql(
        database,
        "with n as (insert into public.group_ai_requests (group_id, asked_by, " +
          "idempotency_key, question) values " +
          `('${GROUP}','${ASKER}','${KEY(13)}','huge') returning id) ` +
          `select public.finish_group_ai_request(n.id, repeat('超', 5000), true, true, 4000, 10000, 2, null) from n;`
      );
      expect(huge.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select max(char_length(body)) from public.group_chat_messages where author_kind = 'ai'"
        )
      ).toBe("4000");
    });
  });

  it("returns author_kind to readers and keeps former members reading", () => {
    provisioned(database => {
      accept(database, ASKER);
      const run = askOnce(database, ASKER, GROUP, "readable", KEY(14));
      const id = requestIdFrom(run);
      exec(
        database,
        `select public.finish_group_ai_request('${id}', 'shown to all', false, false, 0, 0, 0, null);`
      );
      expect(
        one(
          database,
          as(
            ASKER,
            "select string_agg(author_kind, ',' order by created_at desc) from " +
              `public.list_group_chat_messages_ai('${GROUP}', null, null, 20)`
          )
        )
      ).toBe("ai,member,member,member");
      // Decisions 7 and 9: leaving the group does not hide the shared conversation.
      expect(
        one(
          database,
          as(
            LEFT,
            `select count(*) from public.list_group_chat_messages_ai('${GROUP}', null, null, 20)`
          )
        )
      ).toBe("4");
      refused(
        sql(
          database,
          as(
            OUTSIDER,
            `select * from public.list_group_chat_messages_ai('${GROUP}', null, null, 20);`
          )
        ),
        "P0001",
        "not authorized to read this group chat"
      );
      // F-5: cursor and page-size validation live in the shared helper, so the old
      // function and this one cannot drift apart.
      refused(
        sql(
          database,
          as(
            ASKER,
            `select * from public.list_group_chat_messages_ai('${GROUP}', null, null, 500);`
          )
        ),
        "P0001",
        "page size must be between 1 and 100"
      );
      refused(
        sql(
          database,
          as(
            ASKER,
            `select * from public.list_group_chat_messages_ai('${GROUP}', now(), null, 10);`
          )
        ),
        "P0001",
        "both pagination cursor fields must be supplied together"
      );
      // The cursor pair is honoured, and returns strictly older rows.
      const oldest = one(
        database,
        as(
          ASKER,
          "select created_at::text || '|' || message_id::text from " +
            `public.list_group_chat_messages_ai('${GROUP}', null, null, 20) ` +
            "order by created_at asc limit 1"
        )
      );
      const [cursorTime, cursorId] = oldest.split("|");
      expect(
        one(
          database,
          as(
            ASKER,
            "select count(*) from public.list_group_chat_messages_ai(" +
              `'${GROUP}', '${cursorTime}'::timestamptz, '${cursorId}'::uuid, 20)`
          )
        )
      ).toBe("0");
      expect(
        one(
          database,
          as(
            ASKER,
            "select count(*) from public.list_group_chat_messages_ai(" +
              `'${GROUP}', (select max(created_at) from public.group_chat_messages ` +
              `where group_id = '${GROUP}'), ` +
              `(select message_id from public.list_group_chat_messages_ai('${GROUP}', null, null, 1)), 20)`
          )
        )
      ).toBe("3");
    });
  });

  it("clears context by moving a timestamp and deleting nothing", () => {
    provisioned(database => {
      accept(database, BUDGET);
      expect(
        one(
          database,
          `select count(*) from public.group_chat_messages where group_id = '${BUDGET_GROUP}'`
        )
      ).toBe("9");
      // C-3: any active member may clear, repeatedly, with no throttle and no audit row.
      exec(
        database,
        as(BUDGET, `select public.clear_group_ai_context('${BUDGET_GROUP}');`)
      );
      exec(
        database,
        as(BUDGET, `select public.clear_group_ai_context('${BUDGET_GROUP}');`)
      );
      expect(
        one(
          database,
          `select count(*) from public.group_chat_messages where group_id = '${BUDGET_GROUP}'`
        )
      ).toBe("9");
      expect(
        one(
          database,
          `select updated_by::text from public.group_ai_context where group_id = '${BUDGET_GROUP}'`
        )
      ).toBe(BUDGET);
      // N-1: the context row is created by clear itself (upsert), so a group that never
      // cleared has no row and begin still works from the beginning of time.
      expect(
        one(
          database,
          "select count(*) from public.group_ai_context where group_id = " +
            `'${QUOTA_GROUP}'`
        )
      ).toBe("0");
      const next = sql(
        database,
        beginSql(BUDGET, BUDGET_GROUP, "'after clear'::text", [], KEY(15))
      );
      expect(next.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select jsonb_array_length(turns)::text || '/' || dropped_context::text " +
            `from public.group_ai_requests where idempotency_key = '${KEY(15)}'`
        )
      ).toBe("0/false");
      refused(
        sql(
          database,
          as(OUTSIDER, `select public.clear_group_ai_context('${GROUP}');`)
        ),
        "45N01",
        "group_ai_no_permission"
      );
      expect(
        one(
          database,
          `select count(*) from public.group_ai_requests where group_id = '${BUDGET_GROUP}'`
        )
      ).toBe("1");
    });
  });

  it("blocks forged rows at the constraint level", () => {
    provisioned(database => {
      expect(
        sql(
          database,
          "insert into public.group_chat_messages (group_id, sender_id, " +
            "sender_name_snapshot, body, author_kind) values " +
            `('${GROUP}','${ASKER}','CityLink AI','pretend','ai');`
        ).stderr
      ).toContain("group_chat_messages_ai_has_no_sender");
      expect(
        sql(
          database,
          "insert into public.group_chat_messages (group_id, sender_id, " +
            "sender_name_snapshot, body, author_kind, ai_request_id) values " +
            `('${GROUP}',null,'Someone','link','member',gen_random_uuid());`
        ).stderr
      ).toContain("group_chat_messages_ai_request_only_for_ai");
      expect(
        sql(
          database,
          "insert into public.group_chat_messages (group_id, sender_id, " +
            "sender_name_snapshot, body, author_kind) values " +
            `('${GROUP}',null,'Assistant','mislabelled','ai');`
        ).stderr
      ).toContain("group_chat_messages_ai_name");
      expect(
        sql(
          database,
          "insert into public.group_chat_messages (group_id, sender_id, " +
            "sender_name_snapshot, body, author_kind) values " +
            `('${GROUP}',null,'Someone','bad','bot');`
        ).stderr
      ).toContain("group_chat_messages_author_kind");
      // A deleted account's real message keeps sender_id NULL with author_kind member,
      // which is precisely why NULL alone cannot identify the AI (decision 3).
      const legitimate = sql(
        database,
        "insert into public.group_chat_messages (group_id, sender_id, " +
          "sender_name_snapshot, body, author_kind) values " +
          `('${GROUP}',null,'Ghost','deleted account','member');`
      );
      expect(legitimate.stderr).not.toContain("ERROR");
    });
  });

  it("leaves the approved objects alone", () => {
    provisioned(database => {
      // B-2: a new read function rather than DROP + CREATE on the old one, so clients
      // already deployed keep working.
      expect(
        one(
          database,
          "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
            "where n.nspname = 'public' and p.proname in ('list_group_chat_messages', " +
            "'send_group_chat_message')"
        )
      ).toBe("2");
      expect(
        one(
          database,
          "select pg_get_function_result(p.oid) from pg_proc p " +
            "join pg_namespace n on n.oid = p.pronamespace " +
            "where n.nspname = 'public' and p.proname = 'list_group_chat_messages'"
        )
      ).toContain("message_id");
      // The old four-column shape is what already-deployed clients compiled against; it
      // must not have grown author_kind (B-2 chose an additive function for that reason).
      expect(
        one(
          database,
          "select pg_get_function_result(p.oid) from pg_proc p " +
            "join pg_namespace n on n.oid = p.pronamespace " +
            "where n.nspname = 'public' and p.proname = 'list_group_chat_messages'"
        )
      ).not.toContain("author_kind");
      // The existing body CHECK survives unchanged: 4,000 characters is not this
      // proposal's business (decision 4).
      expect(
        sql(
          database,
          "insert into public.group_chat_messages (group_id, sender_id, " +
            "sender_name_snapshot, body) values " +
            `('${GROUP}','${ASKER}','Someone', repeat('x', 4001));`
        ).stderr
      ).toContain("group_chat_messages_body_check");
      // F-11: the disclosure column is nullable with no backfill, so nobody is treated
      // as having accepted a disclosure they were never shown.
      expect(
        one(
          database,
          "select is_nullable from information_schema.columns where table_name = " +
            "'profiles' and column_name = 'ai_disclosure_accepted_at'"
        )
      ).toBe("YES");
      expect(
        one(
          database,
          "select count(*) from public.profiles where ai_disclosure_accepted_at is not null"
        )
      ).toBe("0");
    });
  });

  it("splits the lock across two deploys and validates only in the second", () => {
    // Adam's S-9 ruling (b) is only worth anything if the split is real. The proof is
    // timing-shaped rather than prose-shaped: after deploy 1 the five constraints exist
    // but are still `not valid`, which is precisely the state that lets Section 3's
    // ACCESS EXCLUSIVE go out at the first commit instead of being held through the
    // scans, the function definitions and every grant.
    provisionedDeploy1(database => {
      expect(
        one(
          database,
          `select count(*) from pg_constraint where conname in ${FIVE_CONSTRAINTS}`
        )
      ).toBe("5");
      expect(
        one(
          database,
          `select count(*) from pg_constraint where conname in ${FIVE_CONSTRAINTS} ` +
            "and not convalidated"
        )
      ).toBe("5");
      // The three columns are already usable, so member chat keeps working untouched,
      // and a member row still lands on the 'member' default without any new write path.
      const plain = sql(
        database,
        "insert into public.group_chat_messages (group_id, sender_id, " +
          "sender_name_snapshot, body) values " +
          `('${GROUP}','${ASKER}','Someone','plain member message') ` +
          "returning author_kind;"
      );
      expect(plain.stderr).not.toContain("ERROR");
      expect(plain.stdout).toContain("member");
      expect(applyDeploy2(database).status).toBe(0);
      expect(
        one(
          database,
          `select count(*) from pg_constraint where conname in ${FIVE_CONSTRAINTS} ` +
            "and not convalidated"
        )
      ).toBe("0");
    });
  });

  it("does not half-deploy the AI write path between the two runs", () => {
    // After deploy 1 alone there is no begin/claim/finish at all: the feature is absent,
    // not present-but-broken, which is what makes a pause between deploys survivable.
    provisionedDeploy1(database => {
      for (const sig of [BEGIN, CLAIM, FINISH, READ_AI, STATUS, READ_PAGE]) {
        expect(
          one(database, `select (to_regprocedure('${sig}') is null)::text`),
          sig
        ).toBe("true");
      }
      // The consent function deploy 1 does create is already at its final ACL, because
      // leaving the grants to deploy 2 would expose default PUBLIC EXECUTE in between.
      expect(
        one(
          database,
          `select has_function_privilege('anon','${ACCEPT}','execute')::text`
        )
      ).toBe("false");
      expect(
        one(
          database,
          `select has_function_privilege('authenticated','${ACCEPT}','execute')::text`
        )
      ).toBe("true");
      expect(
        one(
          database,
          "select (count(*) > 0)::text from public.group_chat_messages"
        )
      ).toBe("true");
    });
  });

  it("deploy 2 re-asserts the target after deploy 1 committed", () => {
    // The split Adam approved buys a shorter lock; the condition attached to it is that
    // the second deploy cannot trust the first one's verdict. This is the only test that
    // would fail if someone deleted Section 0 from DEPLOY2 as a "duplicate".
    provision(database => {
      expect(applyDeploy1(database).status).toBe(0);
      exec(
        database,
        "update private.citylink_target set system_identifier = '1'::text"
      );
      const second = applyDeploy2(database);
      refused(second, "45M03", "citylink_target_cluster_changed");
      // Nothing from deploy 2 landed, and no privilege was rewritten.
      expect(
        one(database, `select (to_regprocedure('${BEGIN}') is null)::text`)
      ).toBe("true");
      expect(
        one(
          database,
          "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
            "where n.nspname = 'public' and p.proname = 'get_group_ai_request_status'"
        )
      ).toBe("0");
      // The same file then succeeds once the cluster is recognised again, which is what
      // makes this a guard rather than a permanent lockout.
      exec(
        database,
        "update private.citylink_target set system_identifier = " +
          "(select system_identifier::text from pg_control_system())"
      );
      expect(applyDeploy2(database).status).toBe(0);
      expect(one(database, DEPLOY2_PROBE)).toBe("7");
    });
  });

  it("keeps the counters begin computed when finish omits them", () => {
    // S-1, Adam's option (a). The old defaults made this call silently rewrite the audit
    // row: finish(id, body) wrote dropped_context = false and chat_chars = 0 over the
    // values begin had just measured, which is the whole reason the table exists.
    provisioned(database => {
      accept(database, BUDGET);
      const run = sql(
        database,
        beginSql(BUDGET, BUDGET_GROUP, "'budget question'::text", [], KEY(91))
      );
      expect(run.stderr).not.toContain("ERROR");
      const id = requestIdFrom(run);
      expect(
        one(
          database,
          "select dropped_context::text || '/' || chat_chars::text from " +
            `public.group_ai_requests where id = '${id}'`
        )
      ).toBe("true/4000");

      const twoArg = sql(
        database,
        `select public.finish_group_ai_request('${id}', 'two argument answer');`
      );
      expect(twoArg.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select dropped_context::text || '/' || chat_chars::text || '/' || " +
            "truncated::text || '/' || files_used::text from " +
            `public.group_ai_requests where id = '${id}'`
        )
      ).toBe("true/4000/false/0");

      // Coalesce must not become "ignore the caller": an explicit value still wins. This
      // is also the pairing that keeps an existing test honest — the same call with a
      // supplied 200 must overwrite, not merge.
      const id2 = requestIdFrom(
        sql(
          database,
          beginSql(
            BUDGET,
            BUDGET_GROUP,
            "'budget question two'::text",
            [],
            KEY(92)
          )
        )
      );
      sql(
        database,
        `select public.finish_group_ai_request('${id2}', 'explicit', false, true, ` +
          "200, 0, 0, null);"
      );
      expect(
        one(
          database,
          "select chat_chars::text || '/' || dropped_context::text from " +
            `public.group_ai_requests where id = '${id2}'`
        )
      ).toBe("200/true");
    });
  });

  it("records the first disclosure acceptance and never rewrites it", () => {
    // S-3, approved with S-4. §7 item 5 makes the client tick the disclosure for every
    // question, so calling this function repeatedly is the normal path — under the old
    // body the column tracked the last click and could not answer "when did this member
    // first accept", which is the only reason F-11 asked for it server-side.
    provisioned(database => {
      const first = one(
        database,
        as(ASKER, "select public.accept_ai_disclosure();")
      );
      expect(first).not.toBe("");
      exec(database, as(ASKER, "select public.accept_ai_disclosure();"));
      const third = one(
        database,
        as(ASKER, "select public.accept_ai_disclosure();")
      );
      expect(third).toBe(first);
      expect(
        one(
          database,
          "select (ai_disclosure_accepted_at = " +
            `'${first}'::timestamptz)::text from public.profiles where id = '${ASKER}'`
        )
      ).toBe("true");
      // The return value is the evidence, not the wall clock: a caller that re-accepts
      // still learns when the acceptance actually happened.
      expect(
        one(
          database,
          as(
            ASKER,
            `select (public.accept_ai_disclosure() = '${first}'::timestamptz)::text;`
          )
        )
      ).toBe("true");
    });
  });

  it("delivers the file counters through the status RPC without leaking content", () => {
    // S-2, Adam's option (b). files_requested comes from file_ids and files_used is what
    // the worker reports at finish, so the gap between them is the F-8 notice's evidence.
    provisioned(database => {
      accept(database, BUDGET);
      const id = requestIdFrom(
        sql(
          database,
          beginSql(
            BUDGET,
            GROUP,
            "'two files please'::text",
            [FILE_OK, FILE_OK2],
            KEY(93)
          )
        )
      );
      const row = one(
        database,
        as(
          BUDGET,
          `select status || '|' || files_requested::text || '|' || files_used::text ` +
            `from public.get_group_ai_request_status('${id}');`
        )
      );
      expect(row).toBe("queued|2|2");

      // One of the two could not be read: the worker says so at finish and the reader sees
      // the gap. Nothing about the question or the file names crosses this boundary.
      const text = one(
        database,
        as(
          BUDGET,
          `select coalesce(string_agg(g::text, ','), '') ` +
            `from public.get_group_ai_request_status('${id}') g;`
        )
      );
      expect(text).not.toContain("two files please");
      expect(text).not.toContain("ok.pdf");

      sql(
        database,
        `select public.finish_group_ai_request('${id}', 'an answer', null, null, ` +
          "null, null, 1, null);"
      );
      expect(
        one(
          database,
          as(
            BUDGET,
            `select files_requested::text || '|' || files_used::text || '|' || ` +
              `(message_id is not null)::text ` +
              `from public.get_group_ai_request_status('${id}');`
          )
        )
      ).toBe("2|1|true");

      // Fail closed as an empty set, never as a distinguishing error: an outsider must not
      // learn that this request id exists somewhere it cannot see.
      expect(
        one(
          database,
          as(
            OUTSIDER,
            `select count(*)::text from public.get_group_ai_request_status('${id}');`
          )
        )
      ).toBe("0");
      expect(
        one(
          database,
          as(
            ASKER,
            "select count(*)::text from " +
              "public.get_group_ai_request_status('00000000-0000-4000-8000-000000000000');"
          )
        )
      ).toBe("0");
      expect(
        one(
          database,
          "select count(*)::text from public.get_group_ai_request_status(null);"
        )
      ).toBe("0");
    });
  });
  it("keeps the context a strict prefix when a recent message does not fit", () => {
    // Role 6 S-6. Group 6 carries no chat rows in the fixture, so this window is built
    // here: 3,000 chars newest, 1,500 next, 10 oldest. The newest fits and the second does
    // not, so the honest answer is "newest only". Before the fix the loop kept scanning
    // past the refusal and picked up the 10-char tail, leaving a hole in the middle while
    // the notice promised only older history was missing.
    provisioned(database => {
      accept(database, FRESH);
      exec(
        database,
        "insert into public.group_chat_messages (group_id, sender_id, " +
          "sender_name_snapshot, body, author_kind, created_at) values " +
          `('${OTHER_GROUP}','${FRESH}','Fresh', repeat('t', 10), 'member', ` +
          "now() - interval '50 minutes')," +
          `('${OTHER_GROUP}','${FRESH}','Fresh', repeat('m', 1500), 'member', ` +
          "now() - interval '40 minutes')," +
          `('${OTHER_GROUP}','${FRESH}','Fresh', repeat('b', 3000), 'member', ` +
          "now() - interval '30 minutes');"
      );
      const run = askOnce(database, FRESH, OTHER_GROUP, "prefix", KEY(31));
      expect(run.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select jsonb_array_length(turns)::text || '/' || dropped_context::text " +
            "from public.group_ai_requests where idempotency_key = " +
            `'${KEY(31)}'`
        )
      ).toBe("1/true");
      expect(
        one(
          database,
          "select left(e->>'body', 1) from public.group_ai_requests r, " +
            "jsonb_array_elements(r.turns) e where r.idempotency_key = " +
            `'${KEY(31)}'`
        )
      ).toBe("b");
    });
  });

  it("admits that the 200-message scan window leaves a gap", () => {
    // Second reviewer item 1, the same band as S-6: 200 short member messages all fit
    // inside the 4,000-character budget, so nothing was refused by size — yet the scan
    // stopped at its cap and anything older was never examined. The cap stays (a live
    // table should not be walked backwards without limit) and dropped_context says so.
    provisioned(database => {
      accept(database, FRESH);
      exec(
        database,
        "insert into public.group_chat_messages (group_id, sender_id, " +
          "sender_name_snapshot, body, author_kind, created_at) " +
          `select '${OTHER_GROUP}','${FRESH}','Fresh', repeat('s', 5), 'member', ` +
          "now() - make_interval(mins => n) from generate_series(1, 200) as n;"
      );
      const run = askOnce(database, FRESH, OTHER_GROUP, "cap", KEY(32));
      expect(run.stderr).not.toContain("ERROR");
      expect(
        one(
          database,
          "select jsonb_array_length(turns)::text || '/' || dropped_context::text " +
            "from public.group_ai_requests where idempotency_key = " +
            `'${KEY(32)}'`
        )
      ).toBe("200/true");
    });
  });

  it("counts only claimed rows against the daily quota", () => {
    // Role 6 S-5: the SQL now says the contract's sentence — every row of today's except a
    // queued row nobody ever claimed. Ten never-claimed rows created seconds ago used to
    // consume a member's whole day through the "or within 120 seconds" clause, even though
    // they produced no provider call and cost nothing.
    provisioned(database => {
      accept(database, FRESH);
      exec(
        database,
        "insert into public.group_ai_requests (group_id, asked_by, idempotency_key, " +
          "question, status, created_at) " +
          `select '${OTHER_GROUP}','${FRESH}', gen_random_uuid(), 'q', 'queued', now() ` +
          "from generate_series(1, 10);"
      );
      const free = askOnce(database, FRESH, STALE_GROUP, "unclaimed", KEY(33));
      expect(free.stderr).not.toContain("ERROR");
      // Once claimed, the same rows represent work already paid for, so they count.
      exec(
        database,
        `update public.group_ai_requests set claimed_at = now() ` +
          `where group_id = '${OTHER_GROUP}';`
      );
      drain(database, STALE_GROUP);
      const spent = askOnce(database, FRESH, STALE_GROUP, "claimed", KEY(34));
      refused(spent, "45N06", "group_ai_rate_limited");
      expect(spent.stderr).toContain("reason=user_daily");
    });
  });

  it("keeps the quota day on UTC whatever the session timezone is", () => {
    // Adam's 2026-11-25 ruling on the second reviewer's item 4 ("follow suggestions"): the
    // window is named UTC in the SQL, so a connection reporting a different zone still sees
    // the same reset point the client computes with Date.UTC. Without the pin this case
    // passes no refusal at all — measured against the previous blob in this same harness,
    // the ten rows fell before a session-local "today" and the member got an extra question.
    provisioned(database => {
      accept(database, FRESH);
      // Rows at 00:30 UTC today: inside the UTC day, but before the local midnight of a
      // connection eight hours behind UTC (Etc/GMT+8 means UTC-8 in POSIX form).
      exec(
        database,
        "insert into public.group_ai_requests (group_id, asked_by, idempotency_key, " +
          "question, status, created_at) " +
          `select '${OTHER_GROUP}','${FRESH}', gen_random_uuid(), 'q', 'ready', ` +
          "date_trunc('day', now(), 'UTC') + interval '30 minutes' " +
          "from generate_series(1, 10);"
      );
      const shifted = sql(
        database,
        "set time zone 'Etc/GMT+8'; " +
          beginSql(FRESH, STALE_GROUP, "'shifted'::text", [], KEY(35))
      );
      refused(shifted, "45N06", "group_ai_rate_limited");
      expect(shifted.stderr).toContain("reason=user_daily");
      expect(shifted.stderr).toContain("user_today=10");
      // retry_after comes from the same v_day_start, so it is the wait until the UTC reset:
      // positive and never longer than one day, even on a shifted connection.
      const seconds = Number(
        shifted.stderr.match(/retry_after=(\d+)/)?.[1] ?? "0"
      );
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(86400);
      // And the same question on a plain UTC connection is refused identically: the zone
      // stopped mattering, it did not merely move the failure somewhere else.
      const plain = askOnce(database, FRESH, STALE_GROUP, "plain", KEY(36));
      refused(plain, "45N06", "group_ai_rate_limited");
      expect(plain.stderr).toContain("user_today=10");
    });
  });

  it("lets the 4,000-character clamp admit that it truncated", () => {
    // Role 6 S-8: the message insert clamps with left(..., 4000). A 4,001-character answer
    // written as finish(id, body) used to log truncated = false while the stored body had
    // in fact been cut, so the log understated what the member saw.
    provisioned(database => {
      accept(database, ASKER);
      const run = askOnce(database, ASKER, GROUP, "clamp", KEY(35));
      expect(run.stderr).not.toContain("ERROR");
      const id = requestIdFrom(run);
      exec(database, `select public.claim_group_ai_request('${id}');`);
      const message = one(
        database,
        `select public.finish_group_ai_request('${id}', repeat('答', 4001))`
      );
      expect(
        one(
          database,
          "select truncated::text || '/' || char_length(body)::text " +
            "from public.group_chat_messages " +
            `where id = '${message}'`
        )
      ).toBe("true/4000");
      expect(
        one(
          database,
          `select truncated::text from public.group_ai_requests where id = '${id}'`
        )
      ).toBe("true");
    });
  });

  it("refuses an error_code outside the two documented values", () => {
    // Role 6 S-10. The CHECK is written into deploy 1's CREATE TABLE, so it is validated at
    // creation on an empty table and never scans. Null stays legal: most rows finish fine.
    provisioned(database => {
      accept(database, ASKER);
      const run = askOnce(database, ASKER, GROUP, "codes", KEY(36));
      expect(run.stderr).not.toContain("ERROR");
      const id = requestIdFrom(run);
      refused(
        sql(
          database,
          `update public.group_ai_requests set error_code = 'provider_slow' ` +
            `where id = '${id}';`
        ),
        "23514",
        "group_ai_requests_error_code_check"
      );
      exec(
        database,
        `update public.group_ai_requests set error_code = 'provider_failed' ` +
          `where id = '${id}';`
      );
      exec(
        database,
        `update public.group_ai_requests set error_code = null where id = '${id}';`
      );
      expect(
        one(
          database,
          "select count(*) from public.group_ai_requests " +
            "where error_code is not null and error_code <> 'provider_failed'"
        )
      ).toBe("0");
    });
  });
});

/** Stable idempotency keys per case, so a rerun cannot collide with itself. */
function KEY(n: number): string {
  return `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("deploy 3, the executor's claim", () => {
  /** Deploy 1 and 2, then deploy 3, then the scenario rows. */
  function provisionedWithDeploy3(run: (database: string) => void): void {
    provisioned(database => {
      const third = applyDeploy3(database);
      expect(third.stderr).not.toContain("ERROR");
      expect(third.status).toBe(0);
      run(database);
    });
  }
  it("returns the oldest queued request, whole row, and marks it processing", () => {
    provisionedWithDeploy3(database => {
      accept(database, ASKER);
      const oldest = requestIdFrom(
        askOnce(database, ASKER, GROUP, "oldest", KEY(41))
      );
      // Two queued rows are otherwise unreachable: in-flight is 1 per group. Pushing
      // the first past the 120-second window is the documented stale-row rule, not a
      // test-only bypass, and it is also what makes "oldest first" observable.
      exec(
        database,
        `update public.group_ai_requests set created_at = now() - interval '10 minutes' ` +
          `where id = '${oldest}';`
      );
      const newer = requestIdFrom(
        askOnce(database, ASKER, GROUP, "newer", KEY(42))
      );
      // One call, one claim: every call consumes the next row, so the whole row has to
      // be read in the same statement as the id, not in a follow-up probe.
      expect(
        one(
          database,
          "set role service_role; select id::text || '/' || question || '/' || " +
            "group_id::text || '/' || jsonb_array_length(files)::text " +
            "from public.claim_next_group_ai_request()"
        )
      ).toBe(`${oldest}/oldest/${GROUP}/0`);
      expect(
        one(
          database,
          `select status from public.group_ai_requests where id = '${oldest}'`
        )
      ).toBe("processing");
      expect(
        one(
          database,
          "set role service_role; select id::text from public.claim_next_group_ai_request()"
        )
      ).toBe(newer);
    });
  });
  it("returns no rows, and no error, when the queue is empty", () => {
    provisionedWithDeploy3(database => {
      // `sql()` keeps psql's table decoration; `one()` is the -tA form this suite uses
      // whenever the value itself is the assertion.
      expect(
        one(
          database,
          "set role service_role; select count(*)::text from public.claim_next_group_ai_request()"
        )
      ).toBe("0");
    });
  });
  it("refuses authenticated and anon outright", () => {
    provisionedWithDeploy3(database => {
      const asUser = sql(
        database,
        "set role authenticated; select * from public.claim_next_group_ai_request();"
      );
      expect(asUser.stderr).toContain("permission denied");
      const asAnon = sql(
        database,
        "set role anon; select * from public.claim_next_group_ai_request();"
      );
      expect(asAnon.stderr).toContain("permission denied");
    });
  });
});
