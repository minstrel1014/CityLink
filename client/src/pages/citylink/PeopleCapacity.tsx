import React, { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGroupWorkflowErrorMessage } from "@/lib/supabaseGroups";
import "./PeopleCapacity.css";

export type PeopleCapacityState =
  | "available"
  | "full"
  | "maximum_not_set"
  | "over_limit";

export function PeopleGroupCapacity({
  count,
  maximum,
  state,
}: {
  count: number;
  maximum: number | null;
  state: PeopleCapacityState;
}) {
  const countLabel = maximum === null ? `${count}` : `${count} / ${maximum}`;
  const stateLabel = {
    available: "Places available",
    full: "Group is full",
    maximum_not_set: "Group maximum is not set",
    over_limit:
      "Group is over the 19-member limit. The leader must remove members before anyone can be added.",
  }[state];

  return (
    <>
      <span>
        {countLabel} {count === 1 && maximum === null ? "member" : "members"}
      </span>
      <span className={`people-capacity-state ${state}`}>{stateLabel}</span>
    </>
  );
}

type CreationErrors = { name?: string; maximum?: string };

export function validatePeopleGroupCreation(
  name: string,
  maximum: string
): {
  errors: CreationErrors;
  value: { name: string; maxMembers: number } | null;
} {
  const normalizedName = name.trim();
  const errors: CreationErrors = {};
  if (!normalizedName || normalizedName.length > 50) {
    errors.name = "Enter a group name between 1 and 50 characters.";
  }
  const normalizedMaximum = maximum.trim();
  const maxMembers = Number(normalizedMaximum);
  if (
    !/^\d+$/.test(normalizedMaximum) ||
    !Number.isSafeInteger(maxMembers) ||
    maxMembers < 2 ||
    maxMembers > 19
  ) {
    errors.maximum = "Enter a whole number from 2 to 19.";
  }
  return {
    errors,
    value: Object.keys(errors).length
      ? null
      : { name: normalizedName, maxMembers },
  };
}

// The service owns all admission decisions. Preserve its capacity errors here
// even before the shared error mapper is updated in the coordinated release.
export function getPeopleInviteErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLocaleLowerCase()
      : "";
  if (message.includes("more than 19 active members")) {
    return "This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.";
  }
  if (message.includes("group maximum is not set")) {
    return "Group maximum is not set";
  }
  if (message.includes("group is full")) return "Group is full";
  return getGroupWorkflowErrorMessage(error);
}

export function CreatePeopleGroupInviteForm({
  busy,
  serverError,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  serverError: string;
  onCancel: () => void;
  onSubmit: (name: string, maxMembers: number) => void;
}) {
  const [name, setName] = useState("");
  const [maximum, setMaximum] = useState("");
  const [errors, setErrors] = useState<CreationErrors>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validatePeopleGroupCreation(name, maximum);
    setErrors(result.errors);
    if (result.value) onSubmit(result.value.name, result.value.maxMembers);
  }

  return (
    <form className="people-create-group-form" onSubmit={submit} noValidate>
      <div className="people-create-group-field">
        <label htmlFor="people-group-name">Group name</label>
        <input
          id="people-group-name"
          name="groupName"
          type="text"
          required
          maxLength={50}
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "people-group-name-error" : undefined}
        />
        {errors.name && (
          <p id="people-group-name-error" role="alert">
            {errors.name}
          </p>
        )}
      </div>
      <div className="people-create-group-field">
        <label htmlFor="people-group-maximum">Maximum members</label>
        <input
          id="people-group-maximum"
          name="maxMembers"
          type="number"
          required
          min={2}
          max={19}
          step={1}
          value={maximum}
          onChange={event => setMaximum(event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(errors.maximum)}
          aria-describedby={
            errors.maximum
              ? "people-group-maximum-help people-group-maximum-error"
              : "people-group-maximum-help"
          }
        />
        <small id="people-group-maximum-help">
          Choose a whole number from 2 to 19, including yourself. Pending
          invitations do not reserve a place. 19 is the upper limit, not a
          default.
        </small>
        {errors.maximum && (
          <p id="people-group-maximum-error" role="alert">
            {errors.maximum}
          </p>
        )}
      </div>
      {serverError && (
        <p className="people-create-group-server-error" role="alert">
          {serverError}
        </p>
      )}
      <div className="people-create-group-actions">
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Sending…" : "Create group and send invite"}
        </button>
      </div>
    </form>
  );
}

export function CreatePeopleGroupInviteDialog({
  peerName,
  busy,
  serverError,
  onCancel,
  onSubmit,
  onCloseAutoFocus,
}: {
  peerName: string;
  busy: boolean;
  serverError: string;
  onCancel: () => void;
  onSubmit: (name: string, maxMembers: number) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent
        className="people-create-group-dialog"
        aria-modal="true"
        showCloseButton={!busy}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={event => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a group</DialogTitle>
          <DialogDescription>
            Set the name and maximum before inviting {peerName}.
          </DialogDescription>
        </DialogHeader>
        <CreatePeopleGroupInviteForm
          busy={busy}
          serverError={serverError}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
