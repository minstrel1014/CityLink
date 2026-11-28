import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AI_CHAT_LIMITS,
  CONTEXT_DROPPED_NOTICE,
} from "../shared/aiChatContext";
import {
  AI_REPLY_HARD_LIMIT,
  AI_REPLY_TRUNCATION_NOTICE,
} from "../shared/aiChatReply";

/**
 * The executor cannot import `shared/` — Deno rejects the extensionless relative
 * imports those modules use — so it carries copies of three constants and two
 * notices. Copies drift; these assertions are the reason they cannot drift
 * silently.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const executor = readFileSync(
  path.resolve(here, "../supabase/functions/group-ai-executor/index.ts"),
  "utf8"
);
const extraction = readFileSync(
  path.resolve(here, "../supabase/functions/group-ai-executor/extraction.ts"),
  "utf8"
);
const promptSource = readFileSync(
  path.resolve(here, "../supabase/functions/group-ai-executor/prompt.ts"),
  "utf8"
) as string;
const denoConfig = JSON.parse(
  readFileSync(
    path.resolve(here, "../supabase/functions/group-ai-executor/deno.json"),
    "utf8"
  )
) as { imports?: Record<string, string> };

describe("group AI executor, statically", () => {
  it("caps answers at the shared hard limit, notice included", () => {
    expect(executor).toContain(`const ANSWER_CAP = ${AI_REPLY_HARD_LIMIT};`);
    expect(executor).toContain(AI_REPLY_TRUNCATION_NOTICE);
    // The notice has to be subtracted from the cap, not appended after it.
    expect(executor).toMatch(
      /ANSWER_CAP - Array\.from\(TRUNCATION_NOTICE\)\.length/
    );
  });

  it("answers general questions instead of refusing them", () => {
    // Adam, 2026-11-25 14:36: 「it should be able to answer question like i using a
    // gen ai」. The prompt used to say 「只根據提供的對話與檔案內容回答」, so
    // "what is mobile app?" came back as 資料不足. Pin the two halves that matter:
    // general knowledge is allowed, inventing group facts is not. These strings live
    // in `prompt.ts` since 2026-11-26, so the behaviour suite can execute them; the
    // entry point only has to reach that module.
    expect(promptSource).toContain("像一般生成式 AI 一樣回答");
    expect(promptSource).toContain("不需要先有群組資料");
    expect(promptSource).not.toContain("只根據提供的對話與檔案內容回答");
    expect(promptSource).toContain("不要編造這個群組裡沒發生過的事");
    expect(executor).toContain('from "./prompt.ts"');
    expect(executor).toContain("buildSystemPrompt(ANSWER_CAP)");
    expect(executor).toContain("buildUserPrompt(request.turns");
  });

  it("renders the transcript with the keys the applied function sends", () => {
    // The 2026-11-25 defect: `begin_group_ai_request` writes 'authorName' /
    // 'authorKind' (deploy 2 line 438) and `index.ts` read `turn.sender_name`, so
    // every line — the assistant's own answers included — became 「成員」. The camelCase
    // pair must stay the primary read, and the count must stay in the prompt.
    expect(promptSource).toContain("turn.authorKind ?? turn.author_kind");
    expect(promptSource).toContain("turn.authorName ?? turn.sender_name");
    expect(promptSource).toContain('"CityLink AI"');
    expect(promptSource).toContain("共 ${lines.length} 則");
    expect(promptSource).toContain("不得說群組沒有發言過或記錄是空的");
    // Only one place decides the prompt now; a second copy could drift back in.
    expect(executor).not.toContain("function systemPrompt");
    expect(executor).not.toContain("你是 CityLink 的群組助理");
  });

  it("uses the shared dropped-context notice verbatim", () => {
    expect(executor).toContain(CONTEXT_DROPPED_NOTICE);
  });

  it("reaches the queue only through the two service-role functions", () => {
    expect(executor).toContain('rpc("claim_next_group_ai_request")');
    expect(executor).toContain('rpc("finish_group_ai_request"');
    // No table reads: both tables are revoked from service_role, so a `.from(`
    // call here would fail at runtime rather than at review time.
    expect(executor).not.toMatch(/\.from\("/);
  });

  it("uses the finish parameter names that exist", () => {
    for (const name of [
      "p_request_id",
      "p_body",
      "p_truncated",
      "p_dropped_context",
      "p_chat_chars",
      "p_file_chars",
      "p_files_used",
      "p_error_code",
    ]) {
      expect(executor, name).toContain(name);
    }
    // A near-miss name is a runtime 404 from PostgREST, not a type error.
    expect(executor).not.toContain("p_files_truncated");
  });

  it("takes the model id and the key from the environment", () => {
    expect(executor).toContain('Deno.env.get("XAI_MODEL")');
    expect(executor).toContain('Deno.env.get("XAI_API_KEY")');
    // An unset model falls back to an empty string, and `readEnv` refuses to run
    // with one: that is the fail-closed path, so no model name may appear here.
    expect(executor).toContain('["XAI_MODEL", xaiModel]');
    expect(executor).not.toMatch(/model:\s*"grok/);
  });

  it("refuses callers that do not present the service-role key", () => {
    expect(executor).toContain('request.headers.get("authorization")');
    // Deployed version 6 reports why it refused: the role claim it saw and how
    // long the token was. A bare 401 cost three debugging rounds on 2026-11-25.
    expect(executor).toContain('error: "unauthorized"');
    expect(executor).toContain("role:");
    expect(executor).toContain("token_length:");
  });

  it("reads files by their bytes, not by what storage called them", () => {
    // The bug Adam reported on 2026-11-25: a readable PDF was answered with
    // 「部分選取檔案沒有可讀文字」 because this gate rejected
    // `application/pdf` before any parser ran. It must not come back.
    const oldGate = "!/^text\\/|json|csv|markdown/";
    expect(
      executor,
      "the MIME gate is gone from the entry point"
    ).not.toContain(oldGate);
    expect(extraction).not.toContain(oldGate);
    // ...and neither file consults a declared content type at all: the bytes decide.
    expect(executor + extraction).not.toContain('headers.get("content-type")');
    expect(extraction).toContain('const PDF_MAGIC = "%PDF-"');
    expect(extraction).toContain('const DOCX_MARKER = "word/"');
  });

  it("keeps the file budget and ceilings equal to the rest of the system", () => {
    // The value itself is compared against `server/ai/extraction/extractText.ts`
    // and `shared/aiChatContext.ts` by the behaviour suite, which imports them.
    // Here it is enough that the copy is a literal, because a literal is what a
    // reviewer can read and a re-export in Deno would not be.
    expect(extraction).toContain(
      `export const FILE_CHAR_BUDGET = ${AI_CHAT_LIMITS.fileChars};`
    );
    expect(extraction).toContain(
      "export const EXTRACTION_MAX_BYTES = 20 * 1024 * 1024;"
    );
    expect(extraction).toContain("export const EXTRACTION_MAX_PAGES = 300;");
  });

  it("still reads the queue only through service-role RPCs", () => {
    // Extraction changed how bytes are fetched, not how the queue is reached.
    expect(executor).toContain('rpc("claim_next_group_ai_request")');
    expect(executor).not.toMatch(/\.from\("/);
    expect(extraction).not.toMatch(/\.from\("/);
  });

  it("names the storage settings without carrying a value", () => {
    // Documented names only. A secret, a bucket URL with credentials, or an
    // account id must never appear in this folder's source.
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_ENDPOINT",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_REGION",
    ]) {
      expect(executor, name).toContain(`Deno.env.get("${name}")`);
    }
    expect(executor + extraction).not.toMatch(/r2\.dev|aws_secret_access_key/i);
  });

  it("maps the Deno-only dependency the parser needs", () => {
    // `extraction.ts` imports bare names so the Node test suite can resolve them
    // from node_modules; Deno needs the mapping. Same pattern as the file signer.
    expect(extraction).toContain('from "unpdf"');
    expect(denoConfig.imports?.unpdf).toBe("npm:unpdf@2.2.2");
    // mammoth is deliberately absent: 1.13 mis-detects Deno as Node and throws.
    expect(denoConfig.imports?.mammoth).toBeUndefined();
    expect(extraction).not.toContain('from "mammoth"');
  });
});
