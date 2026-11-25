import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  buildAiChatContext,
  clearAiChatContext,
  type ChatTurn,
  type SelectableFile,
} from "@shared/aiChatContext";
import {
  acceptAiDisclosure,
  beginGroupAiRequest,
  newIdempotencyKey,
  waitForAiAnswer,
} from "@/lib/aiChatRequests";
import { sendGroupChatMessage } from "@/lib/supabaseStage6";
import {
  AI_CHAT_CONSENT_STATEMENTS,
  AI_CHAT_COPY,
  decideAskAi,
  initialConsentState,
  isConsentComplete,
  rememberConsent,
  type ConsentState,
} from "@/lib/aiChatConsent";
import "./GroupAiDrawer.css";

/**
 * The group AI drawer.
 *
 * The drawer only asks. It calls `begin_group_ai_request`, waits for the
 * server-side executor to finish, then closes: the answer arrives as a normal
 * chat message, so nothing is rendered from a local copy that the next read
 * would duplicate.
 */
/**
 * Turn a refusal into a sentence.
 *
 * The drawer used to print `45N06 · 65607s`, which is the server's token plus a
 * number of seconds nobody converts in their head. The numbers stay available in
 * the message for logs; the reader gets the meaning.
 */
function describeRefusal(failure: {
  code: string;
  message: string;
  retryAfter: number | null;
  reason: string | null;
}): string {
  if (failure.code === "45N06") {
    if (failure.reason === "in_flight") return AI_CHAT_COPY.inFlight;
    if (failure.retryAfter)
      return AI_CHAT_COPY.rateLimited(failure.retryAfter, failure.reason);
  }
  if (failure.code === "45N09") return AI_CHAT_COPY.disclosureRequired;
  return `${failure.code}: ${failure.message}`;
}

export default function GroupAiDrawer({
  groupId,
  userId,
  open,
  history,
  files,
  filesUnavailable = false,
  onClose,
  onQuestionPosted,
}: {
  groupId: string;
  /** Consent is remembered per user per group, so the drawer needs both. */
  userId?: string | null;
  open: boolean;
  history: ChatTurn[];
  files: SelectableFile[];
  /** The list could not be read; say so rather than implying there are none. */
  filesUnavailable?: boolean;
  onClose: () => void;
  /** Lets the chat re-read at once, so the question shows without waiting. */
  onQuestionPosted?: () => void;
  /** Kept for call-site compatibility; the answer now arrives as a chat message. */
  onAiMessage?: (body: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState<ConsentState>(() =>
    initialConsentState({ userId, groupId })
  );
  const [showConsent, setShowConsent] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [contextStartsAt, setContextStartsAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  const eligibleFiles = useMemo(
    () => files.filter(file => file.status === "current"),
    [files]
  );

  if (!open) return null;

  const toggleFile = (fileId: string) => {
    setSelectedFileIds(current =>
      current.includes(fileId)
        ? current.filter(id => id !== fileId)
        : current.length >= 2
          ? current
          : [...current, fileId]
    );
  };

  const submit = async () => {
    if (!question.trim()) {
      setFeedback(AI_CHAT_COPY.emptyQuestion);
      return;
    }
    if (!decideAskAi(consent).canAsk) {
      setShowConsent(true);
      return;
    }
    setBusy(true);
    setFeedback("");
    setPending(false);
    const alreadyAccepted = rememberConsent({ userId, groupId });
    try {
      // `accept_ai_disclosure` overwrites the timestamp (open item S-3), so it is
      // called only on the first acceptance on this device.
      if (!alreadyAccepted) await acceptAiDisclosure();
      const begun = await beginGroupAiRequest({
        groupId,
        question,
        fileIds: selectedFileIds,
        idempotencyKey: newIdempotencyKey(),
      });
      if (!begun.ok) {
        setFeedback(describeRefusal(begun));
        return;
      }
      // Adam, 2026-11-25 14:52: the question belongs in the room, like any other
      // message the member sends, not only inside this drawer. Posted after
      // `begin` so the request's own context does not carry the question twice.
      // A failed post must not lose the answer, so it is not fatal.
      if (userId) {
        await sendGroupChatMessage(userId, groupId, question)
          .then(() => onQuestionPosted?.())
          .catch(() => {});
      }
      const state = await waitForAiAnswer(begun.requestId);
      if (state.status === "ready") {
        // The answer is already a chat message written by the executor; closing
        // lets the normal chat refresh show it. Injecting it here would duplicate
        // it on the next read.
        setQuestion("");
        onClose();
        return;
      }
      if (state.status === "failed") {
        setFeedback(state.errorCode ?? AI_CHAT_COPY.providerFailed);
      } else {
        // Still queued or processing when the wait ran out. The request is real
        // and the answer may still arrive, so this is not reported as a failure.
        setPending(true);
        setFeedback(AI_CHAT_COPY.stillPending);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setShowConsent(false);
    }
  };
  return (
    <aside className="citylink-ai-drawer" aria-label={AI_CHAT_COPY.drawerTitle}>
      <header className="citylink-ai-drawer__header">
        <div>
          <h2>
            <Sparkles aria-hidden="true" size={18} /> {AI_CHAT_COPY.drawerTitle}
          </h2>
          <p>{AI_CHAT_COPY.drawerSubtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close AI panel">
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <label
        className="citylink-ai-drawer__label"
        htmlFor="citylink-ai-question"
      >
        你的問題
      </label>
      <textarea
        id="citylink-ai-question"
        rows={3}
        value={question}
        onChange={event => setQuestion(event.target.value)}
        placeholder="例如：我們上次對儲存方案決定了什麼？"
        disabled={busy}
      />

      <fieldset className="citylink-ai-drawer__files">
        <legend>選取檔案（最多 2 個）</legend>
        {eligibleFiles.length === 0 ? (
          <p className="citylink-ai-drawer__hint">
            {filesUnavailable
              ? AI_CHAT_COPY.filesUnavailable
              : AI_CHAT_COPY.noFiles}
          </p>
        ) : (
          eligibleFiles.map(file => (
            <label key={file.id}>
              <input
                type="checkbox"
                checked={selectedFileIds.includes(file.id)}
                onChange={() => toggleFile(file.id)}
              />
              <span>{file.name}</span>
            </label>
          ))
        )}
      </fieldset>

      {showConsent && (
        <section
          className="citylink-ai-drawer__consent"
          aria-label="Disclosure"
        >
          <ul className="citylink-ai-drawer__consent-list">
            {AI_CHAT_CONSENT_STATEMENTS.map(statement => (
              <li key={statement.id}>{statement.text}</li>
            ))}
          </ul>
          <label className="citylink-ai-drawer__agree">
            <input
              type="checkbox"
              checked={isConsentComplete(consent)}
              onChange={event =>
                setConsent(
                  Object.fromEntries(
                    AI_CHAT_CONSENT_STATEMENTS.map(s => [
                      s.id,
                      event.target.checked,
                    ])
                  )
                )
              }
            />
            <span>{AI_CHAT_COPY.agreeAll}</span>
          </label>
        </section>
      )}

      {feedback && (
        <p className="citylink-ai-drawer__feedback" role="alert">
          {feedback}
        </p>
      )}
      {pending && (
        <button type="button" className="secondary" onClick={onClose}>
          {AI_CHAT_COPY.reloadThread}
        </button>
      )}

      <div className="citylink-ai-drawer__actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setContextStartsAt(clearAiChatContext());
            setFeedback(AI_CHAT_COPY.contextCleared);
          }}
        >
          {AI_CHAT_COPY.clearContext}
        </button>
        <button
          type="button"
          className="primary"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "…" : showConsent ? AI_CHAT_COPY.send : AI_CHAT_COPY.button}
        </button>
      </div>
    </aside>
  );
}
