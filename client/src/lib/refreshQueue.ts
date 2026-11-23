export type RefreshQueueState = "idle" | "queued" | "running";

export type RefreshRequestResult = "running" | "queued" | "stale";

export type RefreshQueueOptions<TToken> = {
  /** False discards the intent without issuing another service call. */
  isCurrent: (token: TToken) => boolean;
  /** True while a Load more page or another refresh owns the shared reads. */
  isBlocked: () => boolean;
  /**
   * Performs one refresh. It resolves when the refreshed data has been applied
   * and rejects when the attempt failed; a rejection never auto-retries.
   */
  run: (token: TToken) => Promise<void>;
  /** Reports the presentation state so feedback stays truthful. */
  onStateChange?: (state: RefreshQueueState) => void;
};

/**
 * Coalesces capacity-refresh intents (Adam's approved decision 2A).
 *
 * A Refresh requested while `Load more posts` or `Load more groups` is in
 * flight must not be silently rejected, but repeated clicks must also not build
 * an unbounded queue: at most one intent is retained, and it runs once the
 * blocking read settles — whether that read succeeded or failed. A refresh
 * requested while a queued refresh is already running follows the same
 * single-intent rule, and an auth, course, session or workspace change
 * discards the retained intent without any service call.
 */
export class RefreshQueue<TToken> {
  private readonly options: RefreshQueueOptions<TToken>;
  private intent: TToken | null = null;
  private running = false;
  private reported: RefreshQueueState = "idle";

  constructor(options: RefreshQueueOptions<TToken>) {
    this.options = options;
  }

  get state(): RefreshQueueState {
    if (this.running) return "running";
    return this.intent === null ? "idle" : "queued";
  }

  get hasQueuedRefresh(): boolean {
    return this.intent !== null;
  }

  /**
   * Records a refresh request. Returns "running" when the caller's request
   * started immediately, "queued" when it became the single retained intent,
   * and "stale" when the context no longer matches, in which case nothing runs.
   */
  request(token: TToken): RefreshRequestResult {
    if (!this.options.isCurrent(token)) return "stale";
    if (this.running || this.options.isBlocked()) {
      this.setIntent(token);
      return "queued";
    }
    void this.pump(token);
    return "running";
  }

  /** Re-check the retained intent after a blocking read settles. */
  settle(): void {
    if (this.running) return;
    void this.pump(null);
  }

  /** Drop the retained intent, e.g. after invalidation, reload or unmount. */
  discard(): void {
    this.setIntent(null);
  }

  private async pump(startToken: TToken | null): Promise<void> {
    if (this.running) return;
    let token = startToken ?? this.takeIntent();
    try {
      while (token !== null) {
        if (!this.options.isCurrent(token)) return;
        this.running = true;
        this.notify();
        try {
          await this.options.run(token);
        } catch {
          // A failed attempt must not silently re-run the coalesced intent:
          // the caller reports the failure and the user decides whether to
          // ask for another refresh.
          this.setIntent(null);
        } finally {
          this.running = false;
          this.notify();
        }
        // Another read may have claimed the shared pagination while this
        // refresh ran; keep the intent and let that read's settle resume.
        if (this.intent !== null && this.options.isBlocked()) return;
        token = this.takeIntent();
      }
    } finally {
      this.notify();
    }
  }

  private setIntent(token: TToken | null): void {
    this.intent = token;
    this.notify();
  }

  private takeIntent(): TToken | null {
    const next = this.intent;
    this.intent = null;
    return next;
  }

  private notify(): void {
    const next = this.state;
    // Report a transition once, so a re-render cannot show a phase that has
    // already moved on.
    if (next === this.reported) return;
    this.reported = next;
    this.options.onStateChange?.(next);
  }
}
