import { supabaseClient } from "./supabaseClient";

export type DirectThreadSummary = {
  threadId: string;
  otherProfileId: string;
  otherDisplayName: string;
  lastMessageBody: string | null;
  lastMessageAt: string;
  unreadCount: number;
  hasMore: boolean;
};

export type DirectMessage = {
  messageId: string;
  senderId: string | null;
  senderDisplayName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type DirectThreadState = {
  lastMessageId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type DirectThreadCursor = { lastMessageAt: string; threadId: string };
export type DirectMessageCursor = { createdAt: string; messageId: string };

type RpcName =
  | "start_direct_thread"
  | "send_direct_message"
  | "list_direct_threads"
  | "list_direct_messages"
  | "mark_direct_thread_read"
  | "get_direct_thread_state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(
      `The direct-message service returned an invalid ${key} value.`
    );
  }
  return value;
}

function optionalString(
  row: Record<string, unknown>,
  key: string
): string | null {
  const value = row[key];
  return typeof value === "string" && value ? value : null;
}

function requiredNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value === "number") return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  throw new Error(
    `The direct-message service returned an invalid ${key} value.`
  );
}

async function authenticatedClient(userId: string) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured in this environment.");
  }
  if (!userId) {
    throw new Error("Sign in with your CityLink account to use this feature.");
  }
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error("Your sign-in could not be verified. Sign in again.");
  }
  return supabaseClient;
}

async function callRpc<T>(userId: string, name: RpcName, args: object) {
  const client = await authenticatedClient(userId);
  const { data, error } = await client.rpc(name, args as never);
  if (error) throw error;
  return data as T;
}

export function mapThreadSummaries(value: unknown): {
  items: DirectThreadSummary[];
  hasMore: boolean;
} {
  if (!Array.isArray(value)) {
    throw new Error("The conversation list response is invalid.");
  }
  const items = value.map(row => {
    if (!isRecord(row))
      throw new Error("The conversation list response is invalid.");
    return {
      threadId: requiredString(row, "thread_id"),
      otherProfileId: requiredString(row, "other_profile_id"),
      otherDisplayName: requiredString(row, "other_display_name"),
      lastMessageBody: optionalString(row, "last_message_body"),
      lastMessageAt: requiredString(row, "last_message_at"),
      unreadCount: requiredNumber(row, "unread_count"),
      hasMore: row.has_more === true,
    };
  });
  return { items, hasMore: items.length > 0 && items[0].hasMore };
}

export function mapDirectMessages(value: unknown): DirectMessage[] {
  if (!Array.isArray(value)) {
    throw new Error("The message response is invalid.");
  }
  return value.map(row => {
    if (!isRecord(row)) throw new Error("The message response is invalid.");
    return {
      messageId: requiredString(row, "message_id"),
      senderId: optionalString(row, "sender_id"),
      senderDisplayName: requiredString(row, "sender_display_name"),
      body: requiredString(row, "body"),
      createdAt: requiredString(row, "created_at"),
      readAt: optionalString(row, "read_at"),
    };
  });
}

export async function startDirectThread(
  userId: string,
  otherProfileId: string
) {
  const data = await callRpc<string>(userId, "start_direct_thread", {
    p_other_profile_id: otherProfileId,
  });
  if (typeof data !== "string" || !data) {
    throw new Error("The conversation could not be started.");
  }
  return data;
}

export async function sendDirectMessage(
  userId: string,
  threadId: string,
  body: string
) {
  const data = await callRpc<string>(userId, "send_direct_message", {
    p_thread_id: threadId,
    p_body: body,
  });
  if (typeof data !== "string" || !data) {
    throw new Error("The message could not be sent.");
  }
  return data;
}

export async function listDirectThreads(
  userId: string,
  after?: DirectThreadCursor,
  limit = 30
) {
  const data = await callRpc<unknown>(userId, "list_direct_threads", {
    p_after_last_message_at: after?.lastMessageAt ?? null,
    p_after_thread_id: after?.threadId ?? null,
    p_limit: limit,
  });
  return mapThreadSummaries(data);
}

export async function listDirectMessages(
  userId: string,
  threadId: string,
  before?: DirectMessageCursor,
  limit = 50
) {
  const data = await callRpc<unknown>(userId, "list_direct_messages", {
    p_thread_id: threadId,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.messageId ?? null,
    p_limit: limit,
  });
  return mapDirectMessages(data);
}

export async function markDirectThreadRead(userId: string, threadId: string) {
  const data = await callRpc<number>(userId, "mark_direct_thread_read", {
    p_thread_id: threadId,
  });
  return typeof data === "number" ? data : 0;
}

export async function getDirectThreadState(userId: string, threadId: string) {
  const data = await callRpc<unknown>(userId, "get_direct_thread_state", {
    p_thread_id: threadId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) {
    throw new Error("The conversation state response is invalid.");
  }
  return {
    lastMessageId: optionalString(row, "last_message_id"),
    lastMessageAt: optionalString(row, "last_message_at"),
    unreadCount: requiredNumber(row, "unread_count"),
  } satisfies DirectThreadState;
}
