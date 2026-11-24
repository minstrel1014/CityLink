import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, Send, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { PageHeading } from "@/components/citylink/Shared";
import GroupAiDrawer from "@/components/citylink/GroupAiDrawer";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { AI_AUTHOR_NAME } from "@shared/chatAuthor";
import type { ChatTurn } from "@shared/aiChatContext";
import {
  CHAT_PAGE_SIZE,
  getGroupChatAccess,
  getStage6ErrorMessage,
  listGroupChatMessages,
  MAX_CHAT_MESSAGE_LENGTH,
  sendGroupChatMessage,
  type GroupChatAccess,
  type GroupChatMessage,
} from "@/lib/supabaseStage6";
import { Stage6Layout, Stage6Status } from "./Stage6Layout";

type LoadState = "loading" | "ready" | "error" | "unauthorized";

export default function GroupChatPage({ groupId }: { groupId: string }) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const authGeneration = session.authGeneration ?? 0;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const authGenerationRef = useRef(authGeneration);
  authGenerationRef.current = authGeneration;
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;
  const [state, setState] = useState<LoadState>("loading");
  const [access, setAccess] = useState<GroupChatAccess | null>(null);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [olderBusy, setOlderBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    setDraft("");
    setBusy(false);
    setOlderBusy(false);
    const isCurrent = () =>
      active &&
      generation.current === currentGeneration &&
      userIdRef.current === userId &&
      authGenerationRef.current === authGeneration &&
      groupIdRef.current === groupId;

    if (session.status === "loading") {
      setState("loading");
      setMessages([]);
      return () => {
        active = false;
      };
    }
    if (!userId) {
      setState("unauthorized");
      setAccess(null);
      setMessages([]);
      setError("Sign in with a Supabase account before opening group chat.");
      return () => {
        active = false;
      };
    }

    setState("loading");
    setAccess(null);
    setMessages([]);
    setError("");
    setFeedback("");
    void (async () => {
      try {
        const permitted = await getGroupChatAccess(userId, groupId);
        if (!isCurrent()) return;
        setAccess(permitted);
        const page = await listGroupChatMessages(userId, groupId);
        if (!isCurrent()) return;
        const ordered = [...page].reverse();
        setMessages(ordered);
        setHasOlder(page.length === CHAT_PAGE_SIZE);
        setState("ready");
      } catch (loadError) {
        if (!isCurrent()) return;
        const message = getStage6ErrorMessage(loadError);
        setError(message);
        setState(
          message.toLocaleLowerCase().includes("not authorized")
            ? "unauthorized"
            : "error"
        );
      }
    })();

    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [authGeneration, groupId, reloadToken, session.status, userId]);

  async function loadOlder() {
    if (!userId || !messages.length || olderBusy || !hasOlder) return;
    const expectedGeneration = generation.current;
    const cursorMessage = messages[0];
    setOlderBusy(true);
    setFeedback("");
    try {
      const page = await listGroupChatMessages(userId, groupId, {
        createdAt: cursorMessage.createdAt,
        id: cursorMessage.id,
      });
      if (
        generation.current !== expectedGeneration ||
        userIdRef.current !== userId ||
        authGenerationRef.current !== authGeneration ||
        groupIdRef.current !== groupId
      )
        return;
      setMessages(previous => [...[...page].reverse(), ...previous]);
      setHasOlder(page.length === CHAT_PAGE_SIZE);
    } catch (loadError) {
      if (
        generation.current === expectedGeneration &&
        userIdRef.current === userId &&
        authGenerationRef.current === authGeneration &&
        groupIdRef.current === groupId
      ) {
        setFeedback(getStage6ErrorMessage(loadError));
      }
    } finally {
      if (
        generation.current === expectedGeneration &&
        userIdRef.current === userId &&
        authGenerationRef.current === authGeneration &&
        groupIdRef.current === groupId
      )
        setOlderBusy(false);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !access?.canSend || busy) return;
    const text = draft.trim();
    if (!text) return;
    const expectedGeneration = generation.current;
    setBusy(true);
    setFeedback("");
    try {
      await sendGroupChatMessage(
        userId,
        groupId,
        text,
        () =>
          generation.current === expectedGeneration &&
          userIdRef.current === userId &&
          authGenerationRef.current === authGeneration &&
          groupIdRef.current === groupId
      );
      if (
        generation.current !== expectedGeneration ||
        userIdRef.current !== userId ||
        authGenerationRef.current !== authGeneration ||
        groupIdRef.current !== groupId
      )
        return;
      setDraft("");
      const latest = await listGroupChatMessages(userId, groupId);
      if (
        generation.current !== expectedGeneration ||
        userIdRef.current !== userId ||
        authGenerationRef.current !== authGeneration ||
        groupIdRef.current !== groupId
      )
        return;
      setMessages([...latest].reverse());
      setHasOlder(latest.length === CHAT_PAGE_SIZE);
    } catch (sendError) {
      if (
        generation.current === expectedGeneration &&
        userIdRef.current === userId &&
        authGenerationRef.current === authGeneration &&
        groupIdRef.current === groupId
      ) {
        setFeedback(getStage6ErrorMessage(sendError));
      }
    } finally {
      if (
        generation.current === expectedGeneration &&
        userIdRef.current === userId &&
        authGenerationRef.current === authGeneration &&
        groupIdRef.current === groupId
      )
        setBusy(false);
    }
  }

  return (
    <Stage6Layout title="Group chat">
      <PageHeading
        eyebrow="STUDY GROUP · CHAT"
        title="Group chat"
        description="Plain-text messages are saved by the approved group-chat API. No fictional messages are shown."
      />
      <div className="stage6-notice" role="note">
        Chat access is checked by the server for this group on every request.
        Active members can read and send, including in archived groups. Former
        members can read history but cannot send; abandoned groups are
        read-only. Pending invitations and join requests do not grant chat
        access.
      </div>

      {session.status === "loading" || state === "loading" ? (
        <Stage6Status
          kind="loading"
          title="Checking group chat access…"
          message="CityLink is verifying your sign-in and group permissions."
        />
      ) : !userId ? (
        <Stage6Status
          kind="unauthorized"
          title="Sign in to open group chat"
          message="Group chat is part of the authenticated CityLink experience. The fictional demo is separate."
        />
      ) : state === "unauthorized" ? (
        <Stage6Status
          kind="unauthorized"
          title="You cannot view this group chat"
          message={
            error || "Your account does not have permission to view this chat."
          }
        />
      ) : state === "error" ? (
        <Stage6Status
          title="Group chat is unavailable"
          message={error}
          retry={() => setReloadToken(value => value + 1)}
        />
      ) : (
        <section className="stage6-chat-panel" aria-label="Group conversation">
          <header className="stage6-chat-header">
            <div>
              <h2>Conversation</h2>
              <p>
                Messages are plain text and cannot be edited in this version.
              </p>
            </div>
            <div className="stage6-chat-header-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setAiOpen(true)}
                aria-expanded={aiOpen}
              >
                <Sparkles size={15} /> Ask CityLink AI
              </button>
              <Link className="secondary" href="/my-courses">
                View My Courses
              </Link>
            </div>
          </header>

          {hasOlder && (
            <button
              className="secondary stage6-load-older"
              type="button"
              disabled={olderBusy}
              onClick={() => void loadOlder()}
            >
              <ArrowDown size={15} />
              {olderBusy ? "Loading older messages…" : "Load older messages"}
            </button>
          )}

          {feedback && (
            <p className="stage6-feedback error" role="alert">
              {feedback}
            </p>
          )}

          {messages.length === 0 ? (
            <Stage6Status
              kind="empty"
              title="No messages yet"
              message="When an authorized active member sends a message, it will appear here."
            />
          ) : (
            <ol className="stage6-message-list" aria-live="polite">
              {messages.map(message => (
                <li
                  className={
                    message.senderName === AI_AUTHOR_NAME
                      ? "stage6-message stage6-message-ai"
                      : "stage6-message"
                  }
                  key={message.id}
                >
                  <div className="stage6-message-meta">
                    <strong>{message.senderName}</strong>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </li>
              ))}
            </ol>
          )}

          <GroupAiDrawer
            groupId={groupId}
            open={aiOpen}
            history={messages.map<ChatTurn>(message => ({
              id: message.id,
              authorKind: message.senderName === AI_AUTHOR_NAME ? "ai" : "member",
              authorName: message.senderName,
              body: message.body,
              createdAt: message.createdAt,
            }))}
            files={[]}
            onClose={() => setAiOpen(false)}
            onAiMessage={body => {
              setMessages(current => [
                ...current,
                {
                  id: `local-ai-${current.length}-${Date.now()}`,
                  senderName: AI_AUTHOR_NAME,
                  body,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }}
          />

          {access?.canSend ? (
            <form className="stage6-chat-form" onSubmit={submitMessage}>
              <label htmlFor="stage6-chat-message">Write a message</label>
              <textarea
                id="stage6-chat-message"
                rows={3}
                maxLength={MAX_CHAT_MESSAGE_LENGTH}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder="Keep it clear and considerate."
                disabled={busy}
              />
              <div className="stage6-form-footer">
                <span>
                  {draft.trim().length}/{MAX_CHAT_MESSAGE_LENGTH} characters ·
                  plain text only
                </span>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !draft.trim()}
                >
                  <Send size={16} /> {busy ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          ) : (
            <p className="stage6-readonly-note" role="status">
              This chat is read-only for your account. This can mean
              former-member history access or an abandoned group; the server
              decides whether sending is allowed.
            </p>
          )}
        </section>
      )}
    </Stage6Layout>
  );
}
