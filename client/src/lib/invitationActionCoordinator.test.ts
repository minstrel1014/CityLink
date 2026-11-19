import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReceivedInvitationCard } from "@/pages/citylink/ReceivedInvitationCard";
import {
  acceptReceivedInvitation,
  findAcceptableReceivedInvitation,
  refreshInvitationSnapshot,
  type InvitationFeedback,
} from "./invitationAcceptance";
import {
  createInvitationActionCoordinator,
  type InvitationActionCoordinator,
} from "./invitationActionCoordinator";
import type { GroupInvitationRow } from "./supabaseGroups";

const pending: GroupInvitationRow = {
  id: "invite-1",
  group_id: "group-1",
  course_id: "course-1",
  sender_id: "sender-1",
  recipient_id: "user-a",
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

// Mirrors a view's account check, registered reload, local guard, and
// generation-protected snapshot without a browser or a live service.
function mountView({
  coordinator,
  userId,
  session,
  load,
  respond,
}: {
  coordinator: InvitationActionCoordinator;
  userId: string;
  session: { current: string | null };
  load: () => Promise<GroupInvitationRow[]>;
  respond: (
    userId: string,
    invitationId: string,
    accept: boolean
  ) => Promise<string>;
}) {
  let mounted = true;
  let snapshot: GroupInvitationRow[] | null = null;
  let loading = false;
  let loadError: unknown = null;
  const feedback: (InvitationFeedback | null)[] = [];
  const busy = { current: false };
  const generation = { current: 0 };
  const isCurrent = () => mounted && session.current === userId;
  const reload = vi.fn(() =>
    refreshInvitationSnapshot({
      generation,
      isCurrent,
      load,
      onLoading: () => {
        snapshot = null;
        loading = true;
        loadError = null;
      },
      onLoaded: value => {
        snapshot = value;
        loading = false;
      },
      onError: error => {
        snapshot = null;
        loading = false;
        loadError = error;
      },
    })
  );
  const unsubscribeView = coordinator.registerView(userId, reload);
  const busyChanges: (string | null)[] = [];
  const unsubscribeBusy = coordinator.subscribe(userId, () => {
    busyChanges.push(coordinator.getBusyInvitationId(userId));
  });
  return {
    reload,
    feedback,
    busyChanges,
    get snapshot() {
      return snapshot;
    },
    get loading() {
      return loading;
    },
    get loadError() {
      return loadError;
    },
    get busyId() {
      return coordinator.getBusyInvitationId(userId);
    },
    accept(invitationId = pending.id) {
      const invitation = findAcceptableReceivedInvitation(
        snapshot ?? [],
        invitationId,
        userId
      );
      if (!invitation) return Promise.resolve();
      return acceptReceivedInvitation({
        userId,
        invitation,
        busy,
        coordinator,
        isCurrent,
        respond,
        errorMessage: () => "Network error.",
        onFeedback: value => feedback.push(value),
      });
    },
    unmount() {
      mounted = false;
      generation.current += 1;
      unsubscribeView();
      unsubscribeBusy();
    },
  };
}

describe("account-scoped invitation action lifecycle", () => {
  it.each([
    ["accepted", "accepted", false],
    ["expired", "expired", false],
    ["ambiguous failure", "accepted", true],
  ] as const)(
    "blocks a remount and refreshes its post-settlement snapshot for %s",
    async (_label, serverStatus, rejects) => {
      const coordinator = createInvitationActionCoordinator();
      const session = { current: "user-a" as string | null };
      const response = deferred<string>();
      const refreshed = deferred<GroupInvitationRow[]>();
      const respond = vi.fn(() => response.promise);
      const old = mountView({
        coordinator,
        userId: "user-a",
        session,
        load: async () => [pending],
        respond,
      });
      await old.reload();
      const action = old.accept();
      expect(respond).toHaveBeenCalledTimes(1);
      expect(old.busyChanges).toEqual([pending.id]);
      old.unmount();

      let read = 0;
      const current = mountView({
        coordinator,
        userId: "user-a",
        session,
        respond,
        load: () =>
          ++read === 1 ? Promise.resolve([pending]) : refreshed.promise,
      });
      await current.reload();
      expect(current.busyId).toBe(pending.id);
      const html = renderToStaticMarkup(
        createElement(ReceivedInvitationCard, {
          invitation: pending,
          formattedDate: "today",
          userId: "user-a",
          busyInvitationId: current.busyId,
          isRefreshing: current.loading,
          onAccept: vi.fn(),
        })
      );
      expect(html).toMatch(/<button[^>]*disabled[^>]*>Accepting…<\/button>/);
      await current.accept();
      expect(respond).toHaveBeenCalledTimes(1);

      if (rejects) response.reject(new Error("response lost"));
      else response.resolve(serverStatus);
      await vi.waitFor(() => expect(current.reload).toHaveBeenCalledTimes(2));
      expect(current.snapshot).toBeNull();
      expect(current.loading).toBe(true);
      expect(current.busyId).toBe(pending.id);
      expect(old.feedback).toEqual([null]);
      expect(current.feedback).toEqual([]);
      await current.accept();
      expect(respond).toHaveBeenCalledTimes(1);
      refreshed.resolve([{ ...pending, status: serverStatus }]);
      await action;
      expect(current.snapshot?.[0].status).toBe(serverStatus);
      expect(current.busyId).toBeNull();
      expect(current.busyChanges).toEqual([null]);
      await current.accept();
      expect(respond).toHaveBeenCalledTimes(1);
      current.unmount();
    }
  );

  it("discards a late pending read started before settlement", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const response = deferred<string>();
    const staleRead = deferred<GroupInvitationRow[]>();
    const respond = vi.fn(() => response.promise);
    const old = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [pending],
    });
    await old.reload();
    const action = old.accept();
    old.unmount();
    let read = 0;
    const current = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: () =>
        ++read === 1
          ? staleRead.promise
          : Promise.resolve([{ ...pending, status: "accepted" }]),
    });
    const earlierLoad = current.reload();
    response.resolve("accepted");
    await action;
    expect(current.snapshot?.[0].status).toBe("accepted");
    staleRead.resolve([pending]);
    await earlierLoad;
    expect(current.snapshot?.[0].status).toBe("accepted");
    await current.accept();
    expect(respond).toHaveBeenCalledTimes(1);
    current.unmount();
  });

  it("isolates locks, notifications, reloads and feedback between accounts", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const aResponse = deferred<string>();
    const bResponse = deferred<string>();
    const respond = vi.fn((userId: string) =>
      userId === "user-a" ? aResponse.promise : bResponse.promise
    );
    const a = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [pending],
    });
    await a.reload();
    const aAction = a.accept();
    session.current = "user-b";
    a.unmount();
    const bInvitation = { ...pending, recipient_id: "user-b" };
    const b = mountView({
      coordinator,
      userId: "user-b",
      session,
      respond,
      load: async () => [bInvitation],
    });
    await b.reload();
    expect(b.busyId).toBeNull();
    expect(b.busyChanges).toEqual([]);
    const bAction = b.accept();
    expect(respond).toHaveBeenCalledTimes(2);
    expect(b.busyId).toBe(bInvitation.id);
    aResponse.resolve("accepted");
    await aAction;
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(b.feedback).toEqual([null]);
    expect(b.busyId).toBe(bInvitation.id);
    expect(b.busyChanges).toEqual([bInvitation.id]);
    bResponse.resolve("expired");
    await bAction;
    expect(b.feedback).toEqual([
      null,
      { tone: "error", message: expect.stringMatching(/expired/i) },
    ]);
    expect(b.reload).toHaveBeenCalledTimes(2);
    expect(b.busyId).toBeNull();
    expect(a.feedback).toEqual([null]);
    b.unmount();
  });

  it("keeps the original account locked after switching away and back", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const response = deferred<string>();
    const respond = vi.fn(() => response.promise);
    const a = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [pending],
    });
    await a.reload();
    const action = a.accept();
    session.current = "user-b";
    a.unmount();
    const b = mountView({
      coordinator,
      userId: "user-b",
      session,
      respond,
      load: async () => [],
    });
    await b.reload();
    expect(b.busyId).toBeNull();
    session.current = "user-a";
    b.unmount();
    let status: GroupInvitationRow["status"] = "pending";
    const returned = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [{ ...pending, status }],
    });
    await returned.reload();
    expect(returned.busyId).toBe(pending.id);
    await returned.accept();
    expect(respond).toHaveBeenCalledTimes(1);
    status = "accepted";
    response.resolve("accepted");
    await action;
    expect(returned.reload).toHaveBeenCalledTimes(2);
    expect(returned.snapshot?.[0].status).toBe("accepted");
    expect(returned.feedback).toEqual([]);
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(b.feedback).toEqual([]);
    returned.unmount();
  });

  it("blocks another invitation on the same account and refreshes every mounted view", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const response = deferred<string>();
    const respond = vi.fn(() => response.promise);
    const another = { ...pending, id: "invite-2" };
    const load = async () => [pending, another];
    const first = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load,
    });
    const second = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load,
    });
    await Promise.all([first.reload(), second.reload()]);
    const action = first.accept();
    expect(second.busyId).toBe(pending.id);
    await second.accept(another.id);
    expect(respond).toHaveBeenCalledTimes(1);
    response.resolve("expired");
    await action;
    expect(first.reload).toHaveBeenCalledTimes(2);
    expect(second.reload).toHaveBeenCalledTimes(2);
    expect(second.feedback).toEqual([]);
    expect(second.busyId).toBeNull();
    first.unmount();
    second.unmount();
  });

  it("unlocks after an ambiguous failure and a failed refresh without enabling a stale action", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const response = deferred<string>();
    const respond = vi.fn(() => response.promise);
    const old = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [pending],
    });
    await old.reload();
    const action = old.accept();
    old.unmount();
    let read = 0;
    const failure = new Error("read failed");
    const current = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: () =>
        ++read === 1 ? Promise.resolve([pending]) : Promise.reject(failure),
    });
    await current.reload();
    response.reject(new Error("response lost"));
    await action;
    expect(current.loadError).toBe(failure);
    expect(current.snapshot).toBeNull();
    expect(current.loading).toBe(false);
    expect(current.busyId).toBeNull();
    await current.accept();
    expect(respond).toHaveBeenCalledTimes(1);
    current.unmount();
  });

  it("does not keep a remount locked by an abandoned in-progress refresh", async () => {
    const coordinator = createInvitationActionCoordinator();
    const session = { current: "user-a" as string | null };
    const response = deferred<string>();
    const abandonedRead = deferred<GroupInvitationRow[]>();
    const respond = vi.fn(() => response.promise);
    let read = 0;
    const old = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: () =>
        ++read === 1 ? Promise.resolve([pending]) : abandonedRead.promise,
    });
    await old.reload();
    const action = old.accept();
    response.resolve("accepted");
    await vi.waitFor(() => expect(old.reload).toHaveBeenCalledTimes(2));
    old.unmount();
    const current = mountView({
      coordinator,
      userId: "user-a",
      session,
      respond,
      load: async () => [{ ...pending, status: "accepted" }],
    });
    await current.reload();
    await action;
    expect(current.busyId).toBeNull();
    expect(current.snapshot?.[0].status).toBe("accepted");
    abandonedRead.resolve([pending]);
    current.unmount();
  });
});
