import { useId, useState } from "react";
import { FileWarning, ShieldCheck } from "lucide-react";
import {
  CONSENT_STATEMENTS,
  decideStartAnalysis,
  initialConsentState,
  type ConsentState,
} from "@/lib/groupAnalysisConsent";
import "./GroupAnalysisConsent.css";

/**
 * Shown before any file text is sent for analysis.
 *
 * The dialog owns no network call: `onConfirm` is the caller's job, and the
 * caller is expected to start the analysis only from that callback. There is no
 * effect, no timer and no auto-send path, so opening the dialog cannot send
 * anything.
 */
export default function GroupAnalysisConsent({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<ConsentState>(() => initialConsentState());
  const headingId = useId();
  const decision = decideStartAnalysis(state);

  return (
    <div className="citylink-consent__backdrop" role="presentation">
      <div
        className="citylink-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="citylink-consent__header">
          <ShieldCheck aria-hidden="true" size={20} />
          <h2 id={headingId}>Before this file is analysed</h2>
        </header>

        <p className="citylink-consent__file">
          <FileWarning aria-hidden="true" size={16} />
          <span>{fileName}</span>
        </p>

        <ul className="citylink-consent__statements">
          {CONSENT_STATEMENTS.map(statement => (
            <li key={statement.id}>
              <label>
                <input
                  type="checkbox"
                  checked={state[statement.id] === true}
                  onChange={event =>
                    setState(current => ({
                      ...current,
                      [statement.id]: event.target.checked,
                    }))
                  }
                />
                <span>{statement.text}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className="citylink-consent__note">
          If you would rather not send this file anywhere, close this dialog.
          The file stays in the group and remains downloadable.
        </p>

        <div className="citylink-consent__actions">
          <button
            type="button"
            className="citylink-consent__cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="citylink-consent__confirm"
            disabled={!decision.canStart}
            onClick={() => {
              // Re-check on click, not only on render.
              if (decideStartAnalysis(state).canStart) onConfirm();
            }}
          >
            Send this file for analysis
          </button>
        </div>
      </div>
    </div>
  );
}
