type ViewRegistration = {
  refresh: () => Promise<void>;
  detached: Promise<void>;
  detach: () => void;
  active: boolean;
};

type AccountState = {
  busyInvitationId: string | null;
  listeners: Set<() => void>;
  views: Set<ViewRegistration>;
};

/**
 * Coordinates only within this JS runtime. Entries contain a busy invitation ID,
 * not invitation data or feedback, and are accessible only by account ID.
 */
export function createInvitationActionCoordinator() {
  const accounts = new Map<string, AccountState>();

  function getOrCreate(userId: string): AccountState {
    let state = accounts.get(userId);
    if (!state) {
      state = {
        busyInvitationId: null,
        listeners: new Set(),
        views: new Set(),
      };
      accounts.set(userId, state);
    }
    return state;
  }

  function discardIfUnused(userId: string, state: AccountState) {
    if (
      accounts.get(userId) === state &&
      state.busyInvitationId === null &&
      !state.listeners.size &&
      !state.views.size
    ) {
      accounts.delete(userId);
    }
  }

  function notify(state: AccountState) {
    for (const listener of [...state.listeners]) listener();
  }

  return {
    getBusyInvitationId(userId: string): string | null {
      return accounts.get(userId)?.busyInvitationId ?? null;
    },

    subscribe(userId: string, listener: () => void): () => void {
      const state = getOrCreate(userId);
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
        discardIfUnused(userId, state);
      };
    },

    registerView(userId: string, refresh: () => Promise<void>): () => void {
      const state = getOrCreate(userId);
      let detach!: () => void;
      const detached = new Promise<void>(resolve => {
        detach = resolve;
      });
      const view: ViewRegistration = {
        refresh,
        detached,
        detach,
        active: true,
      };
      state.views.add(view);
      return () => {
        view.active = false;
        state.views.delete(view);
        view.detach();
        discardIfUnused(userId, state);
      };
    },

    /** Acquire synchronously, before starting the RPC. */
    tryAcquire(userId: string, invitationId: string): (() => void) | null {
      const state = getOrCreate(userId);
      if (state.busyInvitationId !== null) return null;
      state.busyInvitationId = invitationId;
      notify(state);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        state.busyInvitationId = null;
        notify(state);
        discardIfUnused(userId, state);
      };
    },

    /** Refresh views mounted for this account at settlement, not the old view. */
    async refreshMountedViews(userId: string): Promise<void> {
      const views = [...(accounts.get(userId)?.views ?? [])];
      await Promise.allSettled(
        views.map(async view => {
          if (!view.active) return;
          // An unmounted view must not keep a remounted view locked while its
          // abandoned read is still pending. Its late result is guarded by the view.
          await Promise.race([view.refresh(), view.detached]);
        })
      );
    },
  };
}

export type InvitationActionCoordinator = ReturnType<
  typeof createInvitationActionCoordinator
>;

export const invitationActionCoordinator = createInvitationActionCoordinator();
