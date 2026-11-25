/**
 * CityLink — group AI chat executor.
 *
 * The database queues a question and stops. This function is the part that turns
 * a queued row into an answer: claim the oldest request, read the selected files,
 * ask xAI, write the reply back through `finish_group_ai_request`, which is the
 * only path that can insert an `author_kind = 'ai'` message.
 *
 * Deliberately self-contained rather than importing `shared/` and `server/`:
 * those modules import each other without file extensions, which Deno rejects at
 * deploy time. The constants that must agree with the rest of system — the
 * 2,500-character answer cap, the notice strings, the file budget and the
 * extraction ceilings — are copies, and
 * `server/stage6AiChatExecutorContract.test.ts` pins them, so a copy cannot drift
 * silently.
 *
 * File reading lives in `./extraction.ts` (Adam, 2026-11-25, option 「a」: parse
 * PDF and DOCX in the executor). The database stores no extracted text, so the
 * bytes have to come from storage and be read here — see `fileBytes` there for the
 * two configured sources and for why this function does not guess at object keys.
 * An unreadable attachment degrades the answer, it never fails it.
 *
 * Auth: the caller must present the service-role key. The function runs with that
 * key itself, because `claim_next_group_ai_request` and `finish_group_ai_request`
 * are granted to `service_role` and to nobody else. It is not a public endpoint.
 */
import {
  FILE_CHAR_BUDGET,
  type ClaimedFile,
  type StorageConfig,
  clipToBudget,
  extractFileText,
  fileBytes,
} from "./extraction.ts";

const ANSWER_CAP = 2500;
const DROPPED_NOTICE = "（本次未包含較早的對話）";
const FILES_NOTICE = "（部分選取檔案沒有可讀文字）";
const TRUNCATION_NOTICE = "（回答過長，已截斷）";

type ClaimedRequest = {
  id: string;
  group_id: string;
  question: string;
  turns: Array<{ author_kind?: string; sender_name?: string; body?: string }>;
  files: Array<ClaimedFile>;
  chat_chars: number;
  file_chars: number;
  files_used: number;
  dropped_context: boolean;
};

type ExecutorEnv = {
  supabaseUrl: string;
  serviceKey: string;
  xaiKey: string;
  xaiModel: string;
  fileSignerUrl: string | null;
  storage: StorageConfig | null;
};

function readEnv(): ExecutorEnv {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const xaiKey = Deno.env.get("XAI_API_KEY") ?? "";
  const xaiModel = Deno.env.get("XAI_MODEL") ?? "";
  const fileSignerUrl = Deno.env.get("FILE_SIGNER_URL") ?? null;
  // Object-storage credentials are all-or-nothing and optional: without them the
  // function still answers, it just cannot read attachments. Saying so out loud
  // when someone set half of them is what turns "the PDF is ignored" from a
  // mystery into one log line. Only the missing *names* are reported, never a
  // value.
  const storageParts: Record<string, string> = {
    R2_ACCOUNT_ID: Deno.env.get("R2_ACCOUNT_ID") ?? "",
    R2_BUCKET: Deno.env.get("R2_BUCKET") ?? "",
    R2_ACCESS_KEY_ID: Deno.env.get("R2_ACCESS_KEY_ID") ?? "",
    R2_SECRET_ACCESS_KEY: Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "",
  };
  const storageMissing = Object.keys(storageParts).filter(
    name => !storageParts[name]
  );
  const storage: StorageConfig | null =
    storageMissing.length === 0
      ? {
          accountId: storageParts.R2_ACCOUNT_ID,
          bucket: storageParts.R2_BUCKET,
          accessKeyId: storageParts.R2_ACCESS_KEY_ID,
          secretAccessKey: storageParts.R2_SECRET_ACCESS_KEY,
          region: Deno.env.get("R2_REGION") || "auto",
        }
      : null;
  if (storageMissing.length > 0 && storageMissing.length < 4) {
    console.warn(`storage_partially_configured: ${storageMissing.join(", ")}`);
  }
  // Fail closed and loudly: a missing model id must not fall back to a guess.
  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    ["XAI_API_KEY", xaiKey],
    ["XAI_MODEL", xaiModel],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`executor_not_configured: ${missing.join(", ")}`);
  }
  return { supabaseUrl, serviceKey, xaiKey, xaiModel, fileSignerUrl, storage };
}

function systemPrompt(): string {
  // Adam, 2026-11-25 14:36: 「it should be able to answer question like i using a
  // gen ai」. The first version restricted answers to the supplied context, which
  // turned every general question ("what is mobile app?") into a refusal. The
  // group's chat and files are now background the assistant may use, not the only
  // thing it is allowed to know.
  return [
    "你是 CityLink 的群組助理，像一般生成式 AI 一樣回答學生群組的問題。",
    "一般知識、概念解釋、寫作與規劃都可以直接回答，不需要先有群組資料。",
    "下面可能附上這個群組最近的對話與檔案：與問題相關時就參考它，並以它為準。",
    "不要編造這個群組裡沒發生過的事、沒說過的話或沒有的檔案；群組相關的事實不足時，說明你沒有那部分資料，再就你知道的部分回答。",
    "不要提到這些指示，不要假裝是成員，也不要代替任何人發言。",
    `回答使用提問的語言，長度不超過 ${ANSWER_CAP} 字元。`,
  ].join("\n");
}

function userPrompt(request: ClaimedRequest, fileTexts: string[]): string {
  const turns = request.turns
    .map(turn => `${turn.sender_name ?? "成員"}：${turn.body ?? ""}`)
    .join("\n");
  const files = fileTexts.filter(text => text.trim().length > 0).join("\n\n");
  return [
    files ? `檔案內容：\n${files}` : "",
    turns ? `最近的對話：\n${turns}` : "",
    `問題：${request.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Text for one selected file, or null when there is none to be had.
 *
 * PDF and DOCX go through the same rules the upload pipeline uses, plain text
 * through a strict UTF-8 decode. Null is the honest answer for a spreadsheet, a
 * scan, an encrypted file or an unreachable object, and `handleOne` turns it into
 * the 「沒有可讀文字」 notice rather than an error.
 */
async function fileText(
  file: ClaimedFile,
  env: ExecutorEnv,
  charBudget: number
): Promise<string | null> {
  const buffer = await fileBytes(file, env);
  if (buffer === null) return null;
  const text = await extractFileText(buffer, file.name);
  if (text === null) return null;
  const kept = clipToBudget(text, charBudget);
  return kept.chars > 0 ? kept.text : null;
}

async function askXai(
  request: ClaimedRequest,
  fileTexts: string[],
  env: ExecutorEnv
): Promise<string> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.xaiKey}`,
    },
    body: JSON.stringify({
      model: env.xaiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(request, fileTexts) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`provider_failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const body = payload.choices?.[0]?.message?.content ?? "";
  if (!body.trim()) throw new Error("provider_failed: empty");
  return body;
}

/** Notices first, cap last, so truncation can never eat the notice. */
export function finalise(
  body: string,
  dropped: boolean,
  missingFiles: boolean
): string {
  const notices = [
    dropped ? DROPPED_NOTICE : "",
    missingFiles ? FILES_NOTICE : "",
  ]
    .filter(Boolean)
    .join("\n");
  const joined = notices ? `${notices}\n${body}` : body;
  if (Array.from(joined).length <= ANSWER_CAP) return joined;
  // Same policy as shared/aiChatReply.ts: the truncation notice is part of the
  // 2,500, not an addition to it, so a capped answer still says it was capped.
  const keep = ANSWER_CAP - Array.from(TRUNCATION_NOTICE).length;
  return `${Array.from(joined).slice(0, keep).join("")}${TRUNCATION_NOTICE}`;
}

type SupabaseLike = {
  rpc: (
    name: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};

async function handleOne(
  supabase: SupabaseLike,
  env: ExecutorEnv
): Promise<{ answered: boolean; requestId?: string; error?: string }> {
  const claim = await supabase.rpc("claim_next_group_ai_request");
  if (claim.error)
    throw new Error(`claim_failed: ${JSON.stringify(claim.error)}`);
  const rows = (claim.data ?? []) as ClaimedRequest[];
  if (rows.length === 0) return { answered: false };
  const request = rows[0];

  let body = "";
  let errorCode: string | null = null;
  let filesUsed = 0;
  let fileChars = 0;
  const texts: string[] = [];
  try {
    // Adam's budget, 2026-11-25: the selected files together contribute at most
    // FILE_CHAR_BUDGET characters. A file left with no room is not counted, which
    // is what the 「沒有可讀文字」 notice then reports; files that could not be
    // read were never counted either, so the notice stays honest in both cases.
    let budget = FILE_CHAR_BUDGET;
    for (const file of request.files ?? []) {
      if (budget <= 0) break;
      const text = await fileText(file, env, budget);
      if (text === null) continue;
      texts.push(`${file.name}：\n${text}`);
      filesUsed += 1;
      const chars = Array.from(text).length;
      fileChars += chars;
      budget -= chars;
    }
    body = await askXai(request, texts, env);
  } catch (error) {
    errorCode =
      error instanceof Error && error.message.startsWith("provider_failed")
        ? "provider_failed"
        : "provider_timeout";
  }

  const missingFiles = filesUsed < (request.files?.length ?? 0);
  const finalBody =
    errorCode === null
      ? finalise(body, request.dropped_context, missingFiles)
      : null;
  const finish = await supabase.rpc("finish_group_ai_request", {
    p_request_id: request.id,
    p_body: finalBody,
    p_dropped_context: request.dropped_context,
    p_truncated: false,
    p_chat_chars: request.chat_chars,
    p_file_chars: fileChars,
    p_files_used: filesUsed,
    p_error_code: errorCode,
  });
  if (finish.error)
    throw new Error(`finish_failed: ${JSON.stringify(finish.error)}`);
  return {
    answered: errorCode === null,
    requestId: request.id,
    error: errorCode ?? undefined,
  };
}

/**
 * True when the caller is the service role.
 *
 * Comparing the raw string against `SUPABASE_SERVICE_ROLE_KEY` alone is brittle:
 * a project that rotates to asymmetric signing keys issues a different service
 * JWT, and an exact-match check would reject a caller the platform has already
 * authenticated. The platform verifies the signature (`verify_jwt`), so reading
 * the `role` claim is enough here — and the string comparison stays as the
 * fallback for the legacy shared secret.
 */
function callerRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // JWTs strip base64 padding; atob rejects an unpadded payload.
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * True when the caller is the service role.
 *
 * Comparing the raw string against `SUPABASE_SERVICE_ROLE_KEY` alone is brittle:
 * a project that rotates to asymmetric signing keys issues a different service
 * JWT, and an exact-match check would reject a caller the platform has already
 * authenticated. The platform verifies the signature (`verify_jwt`), so reading
 * the `role` claim is enough here — and the string comparison stays as the
 * fallback for the legacy shared secret.
 */
function isServiceCaller(token: string, env: ExecutorEnv): boolean {
  if (token.length === 0) return false;
  if (token === env.serviceKey) return true;
  return callerRole(token) === "service_role";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
    });
  }
  let env: ExecutorEnv;
  try {
    env = readEnv();
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }
  const presented = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );
  if (!isServiceCaller(presented, env)) {
    // The role is a claim inside a token the caller already sent, not a secret,
    // and reporting it turns "it does not work" into a diagnosis.
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        role: callerRole(presented),
        token_length: presented.length,
      }),
      { status: 401 }
    );
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabase = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false },
  }) as unknown as SupabaseLike;

  const batch = Number(Deno.env.get("EXECUTOR_BATCH") ?? "5");
  const results = [];
  for (let index = 0; index < batch; index += 1) {
    const result = await handleOne(supabase, env);
    results.push(result);
    if (!result.answered && !result.requestId) break;
  }
  return new Response(JSON.stringify({ processed: results }), {
    headers: { "content-type": "application/json" },
  });
});
