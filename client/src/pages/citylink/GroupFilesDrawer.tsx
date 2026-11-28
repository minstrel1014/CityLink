import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import {
  deleteGroupFile,
  downloadGroupFile,
  formatBytes,
  getGroupFileUsage,
  groupFileErrorMessage,
  listGroupFiles,
  uploadGroupFile,
  type GroupFile,
  type GroupFileUsage,
} from "@/lib/supabaseGroupFiles";
import "./GroupFilesDrawer.css";

type DrawerState = "idle" | "loading" | "ready" | "error";

/**
 * Files panel for one group, opened from the chat header.
 *
 * A drawer rather than a page: the chat stays visible behind it, so a student can
 * keep reading while they look for an attachment. Every action goes through the
 * RPCs and the signer; this component never holds an object key.
 */
export default function GroupFilesDrawer({
  groupId,
  open,
  onClose,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const session = useSupabaseSession();
  const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
  const [state, setState] = useState<DrawerState>("idle");
  const [files, setFiles] = useState<GroupFile[]>([]);
  const [usage, setUsage] = useState<GroupFileUsage | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setState("loading");
    setError("");
    try {
      const [nextFiles, nextUsage] = await Promise.all([
        listGroupFiles(groupId),
        getGroupFileUsage(groupId),
      ]);
      if (generation.current !== current) return;
      setFiles(nextFiles);
      setUsage(nextUsage);
      setState("ready");
    } catch (caught) {
      if (generation.current !== current) return;
      setFiles([]);
      setUsage(null);
      setError(groupFileErrorMessage((caught as Error).message));
      setState("error");
    }
  }, [groupId]);

  useEffect(() => {
    if (!open) {
      generation.current += 1;
      setState("idle");
      setFiles([]);
      setUsage(null);
      setError("");
      setNotice("");
      return;
    }
    void load();
  }, [open, load, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      await uploadGroupFile(groupId, file);
      setNotice(`${file.name} uploaded.`);
      await load();
    } catch (caught) {
      setError(groupFileErrorMessage((caught as Error).message));
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(file: GroupFile) {
    setBusyFileId(file.id);
    setError("");
    try {
      await downloadGroupFile(file.id);
    } catch (caught) {
      setError(groupFileErrorMessage((caught as Error).message));
    } finally {
      setBusyFileId(null);
    }
  }

  async function onDelete(file: GroupFile) {
    if (!window.confirm(`Delete ${file.originalName}? This cannot be undone.`)) {
      return;
    }
    setBusyFileId(file.id);
    setError("");
    setNotice("");
    try {
      await deleteGroupFile(file.id);
      setNotice(`${file.originalName} deleted.`);
      await load();
    } catch (caught) {
      setError(groupFileErrorMessage((caught as Error).message));
    } finally {
      setBusyFileId(null);
    }
  }

  const usedPercent =
    usage && usage.groupLimitBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.groupLimitBytes) * 100))
      : 0;

  return (
    <>
      <div
        className={open ? "group-files-scrim is-open" : "group-files-scrim"}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={open ? "group-files-drawer is-open" : "group-files-drawer"}
        aria-label="Group files"
        aria-hidden={!open}
      >
        <header className="group-files-header">
          <div>
            <h2>Files</h2>
            <p>Shared with everyone in this group.</p>
          </div>
          <button
            className="group-files-close"
            type="button"
            onClick={onClose}
            aria-label="Close files"
          >
            <X size={18} />
          </button>
        </header>

        {usage && (
          <div className="group-files-usage">
            <div className="group-files-usage-row">
              <span>
                {formatBytes(usage.usedBytes)} of{" "}
                {formatBytes(usage.groupLimitBytes)} used
              </span>
              <span>{usedPercent}%</span>
            </div>
            <div className="group-files-usage-bar" role="presentation">
              <span style={{ width: `${usedPercent}%` }} />
            </div>
            {usage.globalLimitReached && (
              <p className="group-files-usage-note">
                Platform storage is full; uploads are paused until space frees up.
              </p>
            )}
          </div>
        )}

        <div className="group-files-actions">
          <input
            ref={inputRef}
            type="file"
            className="group-files-input"
            onChange={event => void onPickFile(event)}
            disabled={uploading}
          />
          <button
            className="primary group-files-upload"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={16} className="group-files-spin" />
            ) : (
              <Upload size={16} />
            )}
            {uploading ? "Uploading…" : "Upload a file"}
          </button>
        </div>

        {notice && (
          <p className="group-files-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="group-files-error" role="alert">
            {error}
          </p>
        )}

        <div className="group-files-body">
          {state === "loading" && (
            <p className="group-files-empty">
              <Loader2 size={16} className="group-files-spin" /> Loading files…
            </p>
          )}
          {state === "error" && (
            <button
              className="secondary group-files-retry"
              type="button"
              onClick={() => void load()}
            >
              Try again
            </button>
          )}
          {state === "ready" && files.length === 0 && (
            <p className="group-files-empty">
              <Paperclip size={16} /> No files yet.
            </p>
          )}
          {state === "ready" && files.length > 0 && (
            <ul className="group-files-list">
              {files.map(file => (
                <li className="group-files-item" key={file.id}>
                  <div className="group-files-item-main">
                    <strong title={file.originalName}>{file.originalName}</strong>
                    <span>
                      {formatBytes(file.byteSize)} ·{" "}
                      {new Date(file.createdAt).toLocaleDateString()}
                      {file.uploadedBy && file.uploadedBy === userId
                        ? " · you"
                        : ""}
                    </span>
                  </div>
                  <div className="group-files-item-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void onDownload(file)}
                      disabled={busyFileId === file.id}
                      aria-label={`Download ${file.originalName}`}
                    >
                      <Download size={15} />
                    </button>
                    {file.uploadedBy && file.uploadedBy === userId && (
                      <button
                        className="secondary group-files-delete"
                        type="button"
                        onClick={() => void onDelete(file)}
                        disabled={busyFileId === file.id}
                        aria-label={`Delete ${file.originalName}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
