import React, { type FormEvent } from "react";
import { Save } from "lucide-react";
import {
  GROUP_MAXIMUM_OVER_LIMIT_MESSAGE,
  validateGroupMaximum,
} from "./groupCapacity";

type GroupCapacitySettingsProps = {
  activeCount: number | null;
  maxMembers: number | null;
  canManage: boolean;
  value: string;
  busy: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function GroupCapacitySettings({
  activeCount,
  maxMembers,
  canManage,
  value,
  busy,
  saving,
  onChange,
  onSave,
}: GroupCapacitySettingsProps) {
  const validation = validateGroupMaximum(value, activeCount ?? 0);
  const changed = validation.value !== null && validation.value !== maxMembers;
  const overLimit = activeCount !== null && activeCount > 19;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && canManage && changed && !validation.error) onSave();
  }

  return (
    <div className="group-name-form">
      <p>
        {activeCount === null
          ? "Current member count is unavailable in this view."
          : maxMembers === null
            ? `${activeCount} ${activeCount === 1 ? "member" : "members"} counted`
            : `${activeCount} / ${maxMembers} members`}
      </p>
      {activeCount === null && maxMembers !== null && (
        <p>Group maximum: {maxMembers}</p>
      )}
      {maxMembers === null && <p>Group maximum is not set</p>}
      {overLimit ? (
        <p>{GROUP_MAXIMUM_OVER_LIMIT_MESSAGE}</p>
      ) : activeCount !== null &&
        maxMembers !== null &&
        activeCount >= maxMembers ? (
        <p>Group is full</p>
      ) : null}
      {canManage ? (
        <form className="group-name-form" onSubmit={submit} noValidate>
          <label htmlFor="group-maximum">Group maximum</label>
          <input
            id="group-maximum"
            type="number"
            min={2}
            max={19}
            step={1}
            required
            value={value}
            onChange={event => onChange(event.target.value)}
            disabled={busy}
            aria-describedby="group-maximum-help"
          />
          <p id="group-maximum-help">
            Choose a whole number from 2 to 19, at least the current active
            member count. Remove members individually before choosing a lower
            maximum. Pending invitations do not reserve a place. The server
            checks the current count before saving.
          </p>
          {validation.error && (value !== "" || overLimit) && !overLimit && (
            <p role="alert">{validation.error}</p>
          )}
          <button
            className="primary"
            type="submit"
            disabled={busy || !changed || validation.error !== null}
          >
            <Save size={15} /> {saving ? "Saving…" : "Save maximum"}
          </button>
        </form>
      ) : (
        <p>Only the current group leader can change the maximum.</p>
      )}
    </div>
  );
}
