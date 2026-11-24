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

function apply(database: string): Run {
  // VERBOSITY=verbose is not cosmetic: psql hides the SQLSTATE at the default level, so
  // without it these tests could only match the message text. The token-to-code pairing
  // in the file itself is checked statically in stage6AiChatSqlContract.test.ts.
  return psql(database, [
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-f",
    proposalPath,
  ]);
}

function provisioned(run: (database: string) => void): void {
  provision(database => {
    const first = apply(database);
    expect(first.stderr).not.toContain("ERROR");
    expect(first.status).toBe(0);
    expect(
      psql(database, ["-v", "ON_ERROR_STOP=1", "-f", scenarioPath]).status
    ).toBe(0);
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
const ALL_FUNCTIONS = [READ_AI, READ_PAGE, BEGIN, CLEAR, ACCEPT, CLAIM, FINISH];

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
  "'claim_group_ai_request', 'finish_group_ai_request')) " +
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
      expect(one(database, CREATED_PROBE)).toBe("9");
      expect(
        one(
          database,
          "select count(*) from pg_constraint where conname in " +
            "('group_chat_messages_author_kind', 'group_chat_messages_ai_has_no_sender', " +
            "'group_chat_messages_ai_name', 'group_chat_messages_ai_request_only_for_ai', " +
            "'group_chat_messages_ai_request_fkey')"
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
      ).toBe("7");
      // search_path = '' appears in proconfig as search_path="".
      expect(
        one(
          database,
          `select count(*) from pg_proc where oid in (${oids}) ` +
            `and proconfig @> array['search_path=""']`
        )
      ).toBe("7");
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
      expect(one(database, CREATED_PROBE)).toBe("9");
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
});

/** Stable idempotency keys per case, so a rerun cannot collide with itself. */
function KEY(n: number): string {
  return `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
