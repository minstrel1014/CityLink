import { supabaseClient } from "@/lib/supabaseClient";

/**
 * The client half of the group AI chat.
 *
 * The drawer used to answer locally from `composeMockReply`, which meant a
 * student saw an invented reply attributed to `CityLink AI` and nothing was ever
 * queued. This module is the real path: ask, then wait for the executor to write
 * the answer into the chat.
 *
 * Nothing here decides content. The question, the context and the limits are all
 * server-side; the client sends a question, an idempotency key and up to two file
 * ids, and polls a status.
 */

export type AiRequestStatus = "queued" | "processing" | "ready" | "failed";

export type AiRequestState = {
  status: AiRequestStatus;
  messageId: string | null;
  errorCode: string | null;
};

export type BeginResult =
  | { ok: true; requestId: string; status: AiRequestStatus }
  | {
      ok: false;
      code: string;
      message: string;
      retryAfter: number | null;
      /** 45N06 carries `reason=in_flight` or `reason=group_daily|user_daily`. */
      reason: string | null;
      /**
       * Today's counts, but only when the daily-cap branch produced them. This is
       * the only place the client is ever told its own usage, which is why the
       * drawer remembers it rather than recomputing it.
       */
      groupToday: number | null;
      userToday: number | null;
    };

const NOT_CONFIGURED = "Supabase is not configured in this build.";

/** A fresh key per attempt: a retry of the same question must not duplicate. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function readError(error: {
  message?: string;
  details?: string;
  code?: string;
}) {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  // The SQL raises tokens like 45N06; the message carries them verbatim.
  const token = text.match(/45N\d\d/g)?.[0] ?? error.code ?? "unknown";
  const retry = text.match(/retry_after["'\s:=]+(\d+)/)?.[1];
  const reason = text.match(/reason=([a-z_]+)/)?.[1] ?? null;
  // Only the daily-cap branch reports counts; the in-flight branch does not.
  const groupToday = text.match(/group_today=(\d+)/)?.[1];
  const userToday = text.match(/user_today=(\d+)/)?.[1];
  return {
    code: token,
    message: text.trim(),
    retryAfter: retry ? Number(retry) : null,
    reason,
    groupToday: groupToday ? Number(groupToday) : null,
    userToday: userToday ? Number(userToday) : null,
  };
}

export async function beginGroupAiRequest(input: {
  groupId: string;
  question: string;
  fileIds: string[];
  idempotencyKey: string;
}): Promise<BeginResult> {
  if (!supabaseClient) {
    return {
      ok: false,
      code: "not_configured",
      message: NOT_CONFIGURED,
      retryAfter: null,
      reason: null,
      groupToday: null,
      userToday: null,
    };
  }
  const { data, error } = await supabaseClient.rpc("begin_group_ai_request", {
    p_group_id: input.groupId,
    p_question: input.question,
    p_file_ids: input.fileIds,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { ok: false, ...readError(error) };
  const row = Array.isArray(data) ? data[0] : data;
  const requestId: string | undefined = row?.request_id;
  if (!requestId) {
    return {
      ok: false,
      code: "no_request_id",
      message: "begin_group_ai_request returned no request id",
      retryAfter: null,
      reason: null,
      groupToday: null,
      userToday: null,
    };
  }
  return {
    ok: true,
    requestId,
    status: (row?.status as AiRequestStatus) ?? "queued",
  };
}

export async function getGroupAiRequestStatus(
  requestId: string
): Promise<AiRequestState | null> {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.rpc(
    "get_group_ai_request_status",
    {
      p_request_id: requestId,
    }
  );
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    status: row.status as AiRequestStatus,
    messageId: row.message_id ?? null,
    errorCode: row.error_code ?? null,
  };
}

/** Records the disclosure acceptance once; the server keeps the timestamp. */
export async function acceptAiDisclosure(): Promise<boolean> {
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.rpc("accept_ai_disclosure");
  return !error;
}

/**
 * Polls until the request leaves queued/processing.
 *
 * Deliberately bounded: the executor may be asleep, and a student should get a
 * message rather than a spinner that never ends. The server's 120-second
 * staleness rule is the authority on a dead request; this is only a UI bound.
 */
export async function waitForAiAnswer(
  requestId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<AiRequestState> {
  const interval = options.intervalMs ?? 1500;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let last: AiRequestState = {
    status: "queued",
    messageId: null,
    errorCode: null,
  };
  while (Date.now() < deadline) {
    const state = await getGroupAiRequestStatus(requestId);
    if (state) {
      last = state;
      if (state.status === "ready" || state.status === "failed") return state;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return last;
}
