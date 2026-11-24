import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, TriangleAlert } from "lucide-react";
import {
  fetchGroupFileUsage,
  formatBytes,
  type GroupFileUsage,
} from "../../lib/supabaseGroupFiles";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; usage: GroupFileUsage }
  | { status: "error"; message: string };

/**
 * Current file storage usage for one group, with the limit it is measured against.
 *
 * Two figures, not one: the group limit is 1 GiB but the 8 GiB total is shared by
 * every group on the deployment, so a group at 5% can still be refused because
 * someone else filled the disk. Showing only the group bar would make that refusal
 * look like a bug.
 */
export function GroupFileUsageCard({ groupId }: { groupId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const usage = await fetchGroupFileUsage(groupId);
      setState({ status: "ready", usage });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Usage could not be read right now.",
      });
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">
            Storage used by this group
          </h3>
        </div>
        {state.status !== "loading" ? (
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        ) : null}
      </header>

      {state.status === "loading" ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-2 w-2/3 animate-pulse rounded-full bg-muted" />
          <span className="sr-only">Reading current usage</span>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-sm text-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              Usage is unknown, not zero. Uploads still check the limit on the
              server.
            </p>
          </div>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="space-y-4">
          <UsageBar
            label="This group"
            used={state.usage.usedBytes}
            limit={state.usage.groupLimitBytes}
          />
          <UsageBar
            label="All groups on this deployment"
            used={state.usage.globalUsedBytes}
            limit={state.usage.globalLimitBytes}
          />
          <p className="text-xs text-muted-foreground">
            Pending uploads are not counted until they are confirmed.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const near = percent >= 90;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-foreground">
          {formatBytes(used)} of {formatBytes(limit)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={
            near
              ? "h-full rounded-full bg-destructive transition-[width]"
              : "h-full rounded-full bg-primary transition-[width]"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
