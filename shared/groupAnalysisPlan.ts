/**
 * The shared analysis plan (`public.group_analysis_plans`), and the one thing
 * about it that is not decided yet: what happens when two members save at once.
 *
 * Contract section 10 lays out three options and deliberately does not choose:
 *
 *   A `last_write_wins` - simplest; one editor's text disappears silently.
 *   B `optimistic`      - the save carries `expected_revision`; a mismatch is
 *                         refused with the current revision so the UI can show
 *                         both versions.
 *   C `serialized`      - one writer at a time; consistent, worst for editing.
 *
 * Adam has not chosen. So the mode is `undecided`, and `buildSavePlanRequest`
 * throws rather than defaulting. A default here would be the quiet kind of
 * product decision that later looks like an implementation detail - and option A
 * loses a member's work without telling them, which is exactly the kind of
 * default that must not be chosen by whoever writes the client first.
 */

export type PlanConcurrencyMode =
  | "last_write_wins"
  | "optimistic"
  | "serialized";

export const PLAN_CONCURRENCY_MODE: PlanConcurrencyMode | "undecided" =
  "undecided";

export const PLAN_ERROR_TOKENS = {
  conflict: "group_analysis_plan_conflict",
  undecided: "group_analysis_plan_concurrency_undecided",
  noPermission: "group_files_no_permission",
  abandoned: "group_files_group_abandoned",
} as const;

export class PlanConcurrencyUndecidedError extends Error {
  readonly code = PLAN_ERROR_TOKENS.undecided;
  constructor() {
    super(
      "Plan concurrency is undecided. Adam must choose last_write_wins, optimistic or serialized before a save request can be built."
    );
    this.name = "PlanConcurrencyUndecidedError";
  }
}

export interface SavePlanInput {
  content: Record<string, unknown>;
  /** Revision the client loaded, used only by the optimistic mode. */
  currentRevision: number;
  mode?: PlanConcurrencyMode | "undecided";
}

export interface SavePlanRequest {
  p_content: Record<string, unknown>;
  /** Null for modes that do not compare revisions. */
  p_expected_revision: number | null;
  mode: PlanConcurrencyMode;
}

export function buildSavePlanRequest(input: SavePlanInput): SavePlanRequest {
  const mode = input.mode ?? PLAN_CONCURRENCY_MODE;
  if (mode === "undecided") {
    throw new PlanConcurrencyUndecidedError();
  }
  if (mode === "optimistic") {
    return {
      p_content: input.content,
      p_expected_revision: input.currentRevision,
      mode,
    };
  }
  return { p_content: input.content, p_expected_revision: null, mode };
}
