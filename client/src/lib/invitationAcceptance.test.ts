import { describe, expect, it, vi } from "vitest";
import type { GroupInvitationRow } from "./supabaseGroups";
import {
  acceptReceivedInvitation,
  canAcceptReceivedInvitation,
  findAcceptableReceivedInvitation,
  invitationViewKey,
  invitationAcceptanceFeedback,
  isInvitationViewCurrent,
  refreshInvitationSnapshot,
} from "./invitationAcceptance";
import { createInvitationActionCoordinator } from "./invitationActionCoordinator";

const pending: GroupInvitationRow = {
  id: "invitation-1",
  group_id: "group-1",
  course_id: "course-1",
  sender_id: "sender-1",
  recipient_id: "user-1",
  sender_name_snapshot: "Avery",
  recipient_name_snapshot: "Jordan",
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function actionOptions() {
  const options = {
    userId: "user-1" as string | null,
    invitation: pending,
    busy: { current: false },
    coordinator: createInvitationActionCoordinator(),
    isCurrent: vi.fn(() => true),
    respond: vi.fn(async () => "accepted"),
    refresh: vi.fn(async () => {}),
    errorMessage: vi.fn(() => "Mapped group error."),
    onFeedback: vi.fn(),
    onRefreshError: vi.fn(),
  };
  options.coordinator.registerView("user-1", async () => {
    if (!options.isCurrent()) return;
    try {
      await options.refresh();
    } catch (error) {
      if (options.isCurrent()) options.onRefreshError(error);
    }
  });
  return options;
}

describe("received invitation eligibility and outcomes", () => {
  it("treats a same-user auth-generation change as a new page boundary", () => {
    expect(invitationViewKey("user-1", 1)).not.toBe(
      invitationViewKey("user-1", 2)
    );
    expect(
      isInvitationViewCurrent({
        mounted: true,
        userId: "user-1",
        currentUserId: "user-1",
        authGeneration: 1,
        currentAuthGeneration: 1,
      })
    ).toBe(true);
    expect(
      isInvitationViewCurrent({
        mounted: true,
        userId: "user-1",
        currentUserId: "user-1",
        authGeneration: 1,
        currentAuthGeneration: 2,
      })
    ).toBe(false);
  });

  it("only permits a pending invitation belonging to the ready user", () => {
    expect(canAcceptReceivedInvitation(pending, "user-1")).toBe(true);
    expect(canAcceptReceivedInvitation(pending, null)).toBe(false);
    expect(canAcceptReceivedInvitation(pending, "")).toBe(false);
    expect(canAcceptReceivedInvitation(pending, "user-2")).toBe(false);
    expect(
      canAcceptReceivedInvitation({ ...pending, recipient_id: null }, "user-1")
    ).toBe(false);
    for (const status of [
      "accepted",
      "declined",
      "cancelled",
      "expired",
    ] as const) {
      expect(
        canAcceptReceivedInvitation({ ...pending, status }, "user-1")
      ).toBe(false);
    }
  });

  it("checks the current received snapshot instead of a stale card", () => {
    expect(
      findAcceptableReceivedInvitation([pending], pending.id, "user-1")
    ).toBe(pending);
    expect(
      findAcceptableReceivedInvitation([], pending.id, "user-1")
    ).toBeNull();
    expect(
      findAcceptableReceivedInvitation(
        [{ ...pending, status: "accepted" }],
        pending.id,
        "user-1"
      )
    ).toBeNull();
    expect(
      findAcceptableReceivedInvitation([pending], pending.id, "user-2")
    ).toBeNull();
  });

  it.each([
    ["accepted", "success", /accepted.*joined/i],
    ["expired", "error", /expired.*did not join/i],
    ["declined", "error", /not confirmed/i],
    ["pending", "error", /not confirmed/i],
    ["unexpected", "error", /not confirmed/i],
    [null, "error", /not confirmed/i],
  ])("maps %s without falsely asserting membership", (status, tone, text) => {
    const feedback = invitationAcceptanceFeedback(status);
    expect(feedback.tone).toBe(tone);
    expect(feedback.message).toMatch(text);
    if (status !== "accepted") {
      expect(feedback.message).not.toMatch(/you (?:have )?joined/i);
    }
  });

  it("rechecks eligibility before making the service call", async () => {
    const options = actionOptions();
    for (const invitation of [
      { ...pending, status: "expired" as const },
      { ...pending, recipient_id: "other" },
    ]) {
      await acceptReceivedInvitation({ ...options, invitation });
    }
    await acceptReceivedInvitation({ ...options, userId: null });
    await acceptReceivedInvitation({ ...options, isCurrent: () => false });
    expect(options.respond).not.toHaveBeenCalled();
    expect(options.refresh).not.toHaveBeenCalled();
    expect(options.coordinator.getBusyInvitationId("user-1")).toBeNull();
  });

  it.each(["accepted", "expired", "unexpected"])(
    "refreshes after the actual %s response and reports that outcome",
    async status => {
      const options = actionOptions();
      options.respond.mockResolvedValue(status);
      await acceptReceivedInvitation(options);
      expect(options.respond).toHaveBeenCalledWith(
        "user-1",
        "invitation-1",
        true
      );
      expect(options.onFeedback).toHaveBeenLastCalledWith(
        invitationAcceptanceFeedback(status)
      );
      expect(options.refresh).toHaveBeenCalledOnce();
      expect(options.coordinator.getBusyInvitationId("user-1")).toBeNull();
    }
  );

  it("holds a synchronous shared guard through the whole refresh and retains success feedback", async () => {
    const response = deferred<string>();
    const refresh = deferred<void>();
    const options = actionOptions();
    options.respond.mockReturnValue(response.promise);
    options.refresh.mockReturnValue(refresh.promise);

    const first = acceptReceivedInvitation(options);
    const duplicate = acceptReceivedInvitation({
      ...options,
      invitation: { ...pending, id: "invitation-2" },
    });
    expect(options.busy.current).toBe(true);
    expect(options.coordinator.getBusyInvitationId("user-1")).toBe(pending.id);
    expect(options.respond).toHaveBeenCalledTimes(1);
    await duplicate;
    response.resolve("accepted");
    await Promise.resolve();
    expect(options.refresh).toHaveBeenCalledOnce();
    expect(options.onFeedback).toHaveBeenLastCalledWith(
      invitationAcceptanceFeedback("accepted")
    );
    expect(options.busy.current).toBe(true);
    await acceptReceivedInvitation(options);
    expect(options.respond).toHaveBeenCalledTimes(1);
    expect(options.coordinator.getBusyInvitationId("user-1")).toBe(pending.id);
    refresh.resolve();
    await first;
    expect(options.busy.current).toBe(false);
    expect(options.coordinator.getBusyInvitationId("user-1")).toBeNull();
    expect(options.onFeedback).toHaveBeenCalledTimes(2); // Clear, then result; reload does not clear it.
  });

  it("maps response failures and refreshes because the outcome may be unconfirmed", async () => {
    const options = actionOptions();
    const failure = new Error("connection lost");
    options.respond.mockRejectedValue(failure);
    await acceptReceivedInvitation(options);
    expect(options.errorMessage).toHaveBeenCalledWith(failure);
    expect(options.onFeedback).toHaveBeenLastCalledWith({
      tone: "error",
      message: expect.stringMatching(
        /Mapped group error.*outcome may be unconfirmed/i
      ),
    });
    expect(options.refresh).toHaveBeenCalledOnce();
    expect(options.busy.current).toBe(false);
  });

  it("handles an unexpected refresh rejection without losing accepted feedback", async () => {
    const options = actionOptions();
    const failure = new Error("reload failed");
    options.refresh.mockRejectedValue(failure);
    await acceptReceivedInvitation(options);
    expect(options.onFeedback).toHaveBeenLastCalledWith(
      invitationAcceptanceFeedback("accepted")
    );
    expect(options.onRefreshError).toHaveBeenCalledWith(failure);
    expect(options.busy.current).toBe(false);
  });

  it("keeps accepted feedback while a failed snapshot reload blocks stale actions", async () => {
    const options = actionOptions();
    let snapshot: GroupInvitationRow[] | null = [pending];
    const loadError = vi.fn();
    options.refresh.mockImplementation(() =>
      refreshInvitationSnapshot({
        generation: { current: 0 },
        isCurrent: options.isCurrent,
        load: () => Promise.reject(new Error("offline")),
        onLoading: () => {
          snapshot = null;
        },
        onLoaded: (value: GroupInvitationRow[]) => {
          snapshot = value;
        },
        onError: loadError,
      })
    );
    await acceptReceivedInvitation(options);
    expect(options.onFeedback).toHaveBeenLastCalledWith(
      invitationAcceptanceFeedback("accepted")
    );
    expect(loadError).toHaveBeenCalledOnce();
    expect(snapshot).toBeNull();
    expect(
      findAcceptableReceivedInvitation(snapshot ?? [], pending.id, "user-1")
    ).toBeNull();
  });

  it.each([
    "sign-out",
    "user change",
    "same-user generation change",
    "unmount",
  ])("ignores an in-flight response after %s", async change => {
    const response = deferred<string>();
    let user: string | null = "user-1";
    let mounted = true;
    let generation = 1;
    const options = actionOptions();
    options.isCurrent.mockImplementation(
      () => mounted && user === "user-1" && generation === 1
    );
    options.respond.mockReturnValue(response.promise);
    const work = acceptReceivedInvitation(options);
    if (change === "sign-out") user = null;
    if (change === "user change") user = "user-2";
    if (change === "same-user generation change") generation = 2;
    if (change === "unmount") mounted = false;
    response.resolve("accepted");
    await work;
    expect(options.onFeedback.mock.calls).toEqual([[null]]);
    expect(options.refresh).not.toHaveBeenCalled();
    expect(options.coordinator.getBusyInvitationId("user-1")).toBeNull();
  });
});

describe("invitation snapshot refresh", () => {
  function reloadOptions(load: () => Promise<string>) {
    return {
      generation: { current: 0 },
      isCurrent: vi.fn(() => true),
      load,
      onLoading: vi.fn(),
      onLoaded: vi.fn(),
      onError: vi.fn(),
    };
  }

  it("reports a failed reload rather than applying a stale snapshot", async () => {
    const failure = new Error("offline");
    const options = reloadOptions(() => Promise.reject(failure));
    await refreshInvitationSnapshot(options);
    expect(options.onLoading).toHaveBeenCalledOnce();
    expect(options.onLoaded).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledWith(failure);
  });

  it("only applies the latest refresh if older requests finish late", async () => {
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const options = reloadOptions(() => oldRequest.promise);
    const oldLoad = refreshInvitationSnapshot(options);
    const newLoad = refreshInvitationSnapshot({
      ...options,
      load: () => newRequest.promise,
    });
    newRequest.resolve("new snapshot");
    await newLoad;
    oldRequest.resolve("old snapshot");
    await oldLoad;
    expect(options.onLoaded.mock.calls).toEqual([["new snapshot"]]);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"])(
    "ignores a refresh %s after identity change or unmount",
    async outcome => {
      const request = deferred<string>();
      const options = reloadOptions(() => request.promise);
      const work = refreshInvitationSnapshot(options);
      options.isCurrent.mockReturnValue(false);
      options.generation.current += 1;
      if (outcome === "resolve") request.resolve("old account snapshot");
      else request.reject(new Error("old account error"));
      await work;
      expect(options.onLoaded).not.toHaveBeenCalled();
      expect(options.onError).not.toHaveBeenCalled();
    }
  );
});
