import { describe, expect, it, vi } from "vitest";
import { RefreshQueue, type RefreshQueueState } from "./refreshQueue";

type Token = { userId: string; courseId: string; generation: number };

const token = (generation = 0, overrides: Partial<Token> = {}): Token => ({
  userId: "user-1",
  courseId: "course-1",
  generation,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness(
  options: { blocked?: boolean; current?: (token: Token) => boolean } = {}
) {
  const refs = { blocked: options.blocked ?? false };
  const run = vi.fn<(token: Token) => Promise<void>>();
  const states: RefreshQueueState[] = [];
  const queue = new RefreshQueue<Token>({
    isCurrent: options.current ?? (() => true),
    isBlocked: () => refs.blocked,
    run,
    onStateChange: state => {
      states.push(state);
    },
  });
  return { queue, run, refs, states };
}

describe("RefreshQueue (decision 2A coalescing)", () => {
  it("runs immediately when no Load more occupies the reads", async () => {
    const { queue, run, states } = harness();
    run.mockResolvedValue(undefined);

    expect(queue.request(token())).toBe("running");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(token());
    await vi.waitFor(() => expect(queue.state).toBe("idle"));
    expect(states).toEqual(["running", "idle"]);
  });

  it("queues one intent while a Load more is active and runs it on settle", async () => {
    const { queue, run, refs } = harness({ blocked: true });
    run.mockResolvedValue(undefined);

    expect(queue.request(token())).toBe("queued");
    expect(run).not.toHaveBeenCalled();
    expect(queue.state).toBe("queued");

    refs.blocked = false;
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(queue.state).toBe("idle"));
  });

  it("coalesces repeated clicks into a single queued refresh", async () => {
    const { queue, run, refs } = harness({ blocked: true });
    run.mockResolvedValue(undefined);

    expect(queue.request(token())).toBe("queued");
    expect(queue.request(token())).toBe("queued");
    expect(queue.request(token())).toBe("queued");
    expect(queue.hasQueuedRefresh).toBe(true);

    refs.blocked = false;
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(queue.state).toBe("idle"));
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("resumes the queued refresh after a failed Load more settles", async () => {
    const { queue, run, refs } = harness({ blocked: true });
    run.mockResolvedValue(undefined);

    queue.request(token());
    refs.blocked = false;
    // The caller settles the queue for both outcomes, so a rejected page still
    // releases the queued refresh.
    queue.settle();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("discards a queued intent whose context went stale, without a call", async () => {
    let liveGeneration = 3;
    const { queue, run, refs } = harness({
      blocked: true,
      current: candidate => candidate.generation === liveGeneration,
    });
    run.mockResolvedValue(undefined);

    expect(queue.request(token(3))).toBe("queued");
    // The workspace, account or session generation moved on before the Load
    // more finished, so the retained intent belongs to a view that is gone.
    liveGeneration = 4;
    refs.blocked = false;
    queue.settle();
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(queue.state).toBe("idle");

    expect(queue.request(token(3))).toBe("stale");
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps one pending intent per run instead of queueing unboundedly", async () => {
    const { queue, run, refs } = harness({ blocked: true });
    const first = deferred<void>();
    run.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

    queue.request(token());
    refs.blocked = false;
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);

    // Requests arriving during the queued run coalesce again, exactly once.
    queue.request(token());
    queue.request(token());
    expect(queue.hasQueuedRefresh).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(queue.state).toBe("idle"));
    expect(queue.hasQueuedRefresh).toBe(false);
  });

  it("stops after a failed run rather than retrying the queued intent", async () => {
    const { queue, run } = harness();
    const gate = deferred<void>();
    const failure = new Error("refresh failed");
    run.mockImplementationOnce(() =>
      gate.promise.then(() => {
        throw failure;
      })
    );

    expect(queue.request(token(1))).toBe("running");
    // A second request during the failing run must not turn into a silent
    // automatic retry once the failure is reported.
    expect(queue.request(token(2))).toBe("queued");
    gate.resolve();
    await vi.waitFor(() => expect(queue.state).toBe("idle"));
    expect(run).toHaveBeenCalledTimes(1);
    expect(queue.hasQueuedRefresh).toBe(false);
  });

  it("ignores settle while a run is in flight and keeps the intent", async () => {
    const { queue, run } = harness();
    const gate = deferred<void>();
    run.mockReturnValueOnce(gate.promise).mockResolvedValue(undefined);

    queue.request(token(1));
    expect(run).toHaveBeenCalledTimes(1);
    queue.request(token(2));
    // While a run is in flight the visible phase stays "running"; the second
    // request is only retained, never started in parallel.
    expect(queue.state).toBe("running");
    expect(queue.hasQueuedRefresh).toBe(true);
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);

    gate.resolve();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run).toHaveBeenLastCalledWith(token(2));
  });

  it("drops the queued intent on discard", async () => {
    const { queue, run, refs } = harness({ blocked: true });
    run.mockResolvedValue(undefined);

    queue.request(token());
    queue.discard();
    expect(queue.state).toBe("idle");
    refs.blocked = false;
    queue.settle();
    expect(run).not.toHaveBeenCalled();
  });
});
