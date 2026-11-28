import React, { useState, type FormEvent } from "react";
import {
  createGroupRecruitmentPost,
  getStage6ErrorMessage,
  MAX_RECRUITMENT_POST_LENGTH,
} from "@/lib/supabaseStage6";

/**
 * Current/maximum label for the card. An unreadable roster shows "unavailable"
 * instead of a guessed number; the server still enforces capacity on submit.
 */
export function capacitySummary(
  courseCode: string | undefined,
  memberCount: number | null,
  maxMembers: number | null
): string {
  const prefix = `${courseCode || "Course"} · `;
  if (memberCount === null) return `${prefix}Member count unavailable`;
  if (maxMembers === null) return `${prefix}${memberCount} members`;
  return `${prefix}${memberCount} / ${maxMembers} members`;
}

/**
 * One card for the viewer's group on a course's My group page.
 *
 * Only the current group leader sees "Create recruitment post"; every other
 * active member sees the same card without the control. This is a convenience
 * entry only — the server still decides through
 * private.can_manage_recruitment_post, and `can_create_post` is never treated
 * as an authorization result here.
 */
export function RecruitmentPostComposer({
  userId,
  groupId,
  groupName,
  courseCode,
  memberCount,
  maxMembers,
  canCreate,
  onPosted,
}: {
  userId: string;
  groupId: string;
  groupName: string;
  courseCode?: string;
  memberCount: number | null;
  maxMembers: number | null;
  canCreate: boolean;
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function close() {
    setOpen(false);
    setSubject("");
    setBody("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !subject.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createGroupRecruitmentPost(userId, groupId, subject, body);
      setNotice("Recruitment post published.");
      close();
      onPosted();
    } catch (submitError) {
      setError(getStage6ErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="group-workflow-item">
      <div className="group-workflow-item-top">
        <div>
          <h3>{groupName || "Study group"}</h3>
          <p>{capacitySummary(courseCode, memberCount, maxMembers)}</p>
        </div>
        <span className="group-workflow-status active">Active</span>
      </div>
      {notice && (
        <p className="group-workflow-feedback success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="group-workflow-feedback error" role="alert">
          {error}
        </p>
      )}
      {canCreate &&
        (open ? (
          <form
            className="stage6-post-form"
            onSubmit={event => void submit(event)}
          >
            <label htmlFor={`recruitment-subject-${groupId}`}>Subject</label>
            <input
              id={`recruitment-subject-${groupId}`}
              value={subject}
              maxLength={120}
              onChange={event => setSubject(event.target.value)}
              placeholder="e.g. Looking for a frontend teammate"
              required
              disabled={busy}
            />
            <label htmlFor={`recruitment-body-${groupId}`}>
              Recruitment post
            </label>
            <textarea
              id={`recruitment-body-${groupId}`}
              rows={4}
              maxLength={MAX_RECRUITMENT_POST_LENGTH}
              value={body}
              onChange={event => setBody(event.target.value)}
              placeholder="Describe the project and the type of teammate you are looking for."
              disabled={busy}
            />
            <div className="stage6-form-footer">
              <span>
                {body.trim().length}/{MAX_RECRUITMENT_POST_LENGTH} characters
              </span>
              <button
                className="primary"
                type="submit"
                disabled={busy || !subject.trim() || !body.trim()}
              >
                {busy ? "Publishing…" : "Publish post"}
              </button>
            </div>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="group-workflow-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                setOpen(true);
                setNotice("");
                setError("");
              }}
            >
              Create recruitment post
            </button>
          </div>
        ))}
    </article>
  );
}
