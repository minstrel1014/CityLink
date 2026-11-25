import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import GroupThreadsList from "@/pages/citylink/GroupThreadsList";
import { Link, useRoute } from "wouter";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { EmptyState } from "@/components/citylink/Shared";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  getDirectThreadState,
  listDirectMessages,
  listDirectThreads,
  markDirectThreadRead,
  sendDirectMessage,
  type DirectMessage,
  type DirectThreadSummary,
} from "@/lib/supabaseDirectMessages";
import "./DirectMessages.css";

const POLL_INTERVAL_MS = 2000;

function useSignedInUserId() {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  return { session, userId, configured: Boolean(supabaseClient) };
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DirectMessagesInbox() {
  const { session, userId, configured } = useSignedInUserId();
  const [threads, setThreads] = useState<DirectThreadSummary[]>([]);
  const [cursor, setCursor] = useState<{
    lastMessageAt: string;
    threadId: string;
  } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const load = useCallback(
    async (after?: { lastMessageAt: string; threadId: string }) => {
      if (!userId) return;
      const page = await listDirectThreads(userId, after);
      setThreads(current => (after ? [...current, ...page.items] : page.items));
      setHasMore(page.hasMore);
      const last = page.items[page.items.length - 1];
      setCursor(
        last
          ? { lastMessageAt: last.lastMessageAt, threadId: last.threadId }
          : null
      );
    },
    [userId]
  );

  useEffect(() => {
    let active = true;
    if (session.status !== "ready" || !userId || !configured) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");
    load()
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Conversations could not be loaded."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.status, userId, configured, load, retry]);

  return (
    <div className="dm-page">
      <AccountHeader
        email={session.status === "ready" ? session.user?.email : undefined}
      />
      <header className="dm-head">
        <p className="dm-eyebrow">MESSAGES</p>
        <h1>Direct messages</h1>
        <p className="dm-muted">
          Private conversations with classmates in your current-term courses.
        </p>
      </header>
      {error ? (
        <div className="dm-notice dm-notice-error">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="dm-muted">Loading conversations…</p>
      ) : threads.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Open a classmate's profile, or use the Message button beside Invite on the course People page."
        >
          <Link href="/courses" className="dm-link-button">
            Browse courses <ArrowRight size={16} />
          </Link>
        </EmptyState>
      ) : (
        <ul className="dm-thread-list">
          {threads.map(thread => (
            <li key={thread.threadId}>
              <Link
                href={`/messages/${thread.threadId}`}
                className="dm-thread-row"
              >
                <span className="dm-avatar" aria-hidden="true">
                  {thread.otherDisplayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="dm-thread-text">
                  <span className="dm-thread-name">
                    {thread.otherDisplayName}
                  </span>
                  <span className="dm-thread-preview">
                    {thread.lastMessageBody ?? "No messages yet"}
                  </span>
                </span>
                <span className="dm-thread-meta">
                  <span>{formatWhen(thread.lastMessageAt)}</span>
                  {thread.unreadCount > 0 ? (
                    <span className="dm-unread">{thread.unreadCount}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && cursor && !loading ? (
        <button
          type="button"
          className="dm-more"
          onClick={() => {
            load(cursor).catch(() =>
              setError("More conversations could not be loaded.")
            );
          }}
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}

export function DirectThreadRoom() {
  const [, params] = useRoute("/messages/:threadId");
  const threadId = params?.threadId ?? "";
  const { session, userId, configured } = useSignedInUserId();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastSeenId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !threadId) return;
    const rows = await listDirectMessages(userId, threadId);
    setMessages(rows);
    const newest = rows[0];
    if (newest && newest.messageId !== lastSeenId.current) {
      lastSeenId.current = newest.messageId;
      await markDirectThreadRead(userId, threadId).catch(() => 0);
    }
  }, [userId, threadId]);

  useEffect(() => {
    let active = true;
    if (session.status !== "ready" || !userId || !configured || !threadId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    refresh()
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "This conversation could not be opened."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.status, userId, configured, threadId, refresh]);

  useEffect(() => {
    if (!userId || !configured || !threadId) return;
    let active = true;
    const timer = window.setInterval(() => {
      getDirectThreadState(userId, threadId)
        .then(state => {
          if (!active) return;
          if (
            state.lastMessageId &&
            state.lastMessageId !== lastSeenId.current
          ) {
            return refresh();
          }
          return undefined;
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, configured, threadId, refresh]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || !userId || sending) return;
    setSending(true);
    setError("");
    try {
      await sendDirectMessage(userId, threadId, body);
      setDraft("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The message could not be sent."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dm-page">
      <div className="dm-room-head">
        <Link href="/messages" className="dm-back">
          <ArrowLeft size={16} /> All conversations
        </Link>
      </div>
      {error ? <div className="dm-notice dm-notice-error">{error}</div> : null}
      <div className="dm-messages" ref={listRef}>
        {loading ? (
          <p className="dm-muted">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="dm-muted">No messages yet. Say hello.</p>
        ) : (
          [...messages].reverse().map(message => {
            const mine = message.senderId === userId;
            return (
              <div
                key={message.messageId}
                className={mine ? "dm-bubble dm-mine" : "dm-bubble"}
              >
                {!mine ? (
                  <span className="dm-sender">
                    <span className="dm-sender-avatar" aria-hidden="true">
                      {message.senderDisplayName.slice(0, 1).toUpperCase()}
                    </span>
                    {message.senderDisplayName}
                  </span>
                ) : null}
                <p>{message.body}</p>
                <span className="dm-time">
                  {formatWhen(message.createdAt)}
                  {mine && message.readAt ? " · Read" : ""}
                </span>
              </div>
            );
          })
        )}
      </div>
      <form
        className="dm-composer"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={draft}
          maxLength={2000}
          placeholder="Write a message"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="submit"
          className="dm-send"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          title="Send message"
        >
          <Send size={22} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}

export default DirectMessagesInbox;

type MessageTab = "direct" | "groups";

export function MessagesHub() {
  const [tab, setTab] = useState<MessageTab>("direct");
  return (
    <div className="dm-hub">
      <div className="dm-tabs" role="tablist" aria-label="Message type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "direct"}
          className={tab === "direct" ? "dm-tab dm-tab-active" : "dm-tab"}
          onClick={() => setTab("direct")}
        >
          Direct
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "groups"}
          className={tab === "groups" ? "dm-tab dm-tab-active" : "dm-tab"}
          onClick={() => setTab("groups")}
        >
          Groups
        </button>
      </div>
      {tab === "direct" ? <DirectMessagesInbox /> : <GroupThreadsList />}
    </div>
  );
}
