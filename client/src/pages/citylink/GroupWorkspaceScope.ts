import type { GroupMembershipRow, StudyGroupRow } from "@/lib/supabaseGroups";

export type WorkspaceContext = {
  status: string;
  userId: string | null;
  courseId: string;
  authGeneration?: number;
};
export type WorkspaceToken = {
  userId: string;
  courseId: string;
  generation: number;
  authGeneration?: number;
};

type ActionClaim = { token: WorkspaceToken };

/** Invalidates in-flight work immediately when the rendered context changes. */
export class GroupWorkspaceScope {
  private context: WorkspaceContext;
  private generation = 0;
  private action: ActionClaim | null = null;
  contextVersion = 0;

  constructor(context: WorkspaceContext) {
    this.context = context;
  }

  matchesContext(context: WorkspaceContext): boolean {
    return (
      this.context.status === context.status &&
      this.context.userId === context.userId &&
      this.context.courseId === context.courseId &&
      (this.context.authGeneration ?? 0) === (context.authGeneration ?? 0)
    );
  }

  updateContext(context: WorkspaceContext) {
    if (!this.matchesContext(context)) {
      this.context = context;
      this.contextVersion += 1;
      this.invalidate();
    }
  }

  invalidate() {
    this.generation += 1;
    this.action = null;
  }

  startLoad(): WorkspaceToken | null {
    this.invalidate();
    return this.currentToken();
  }

  currentToken(): WorkspaceToken | null {
    const { status, userId, courseId, authGeneration } = this.context;
    return status === "ready" && userId
      ? {
          userId,
          courseId,
          generation: this.generation,
          authGeneration: authGeneration ?? 0,
        }
      : null;
  }

  isCurrent(token: WorkspaceToken): boolean {
    return (
      this.context.status === "ready" &&
      this.context.userId === token.userId &&
      this.context.courseId === token.courseId &&
      (this.context.authGeneration ?? 0) === (token.authGeneration ?? 0) &&
      this.generation === token.generation
    );
  }

  claimAction(token: WorkspaceToken): ActionClaim | null {
    if (!this.isCurrent(token) || this.action) return null;
    const claim = { token };
    this.action = claim;
    return claim;
  }

  hasPendingAction(): boolean {
    return this.action !== null;
  }

  releaseAction(claim: ActionClaim): boolean {
    if (this.action !== claim || !this.isCurrent(claim.token)) return false;
    this.action = null;
    return true;
  }
}

/** Scoped course and own-group reads are UI evidence; the write RPC rechecks. */
export function recruitmentEligibility(
  userId: string,
  courseId: string,
  currentCourseEligible: boolean,
  groups: StudyGroupRow[],
  memberships: GroupMembershipRow[]
): { verified: boolean; groups: StudyGroupRow[] } {
  if (currentCourseEligible !== true) {
    return { verified: false, groups: [] };
  }

  const activeGroupIds = new Set(
    memberships
      .filter(
        membership =>
          membership.profile_id === userId &&
          membership.course_id === courseId &&
          membership.membership_status === "active"
      )
      .map(membership => membership.group_id)
  );
  return {
    verified: true,
    groups: groups.filter(
      group =>
        group.course_id === courseId &&
        group.status === "active" &&
        activeGroupIds.has(group.id)
    ),
  };
}

/** Ignore stale success, failure and finalization, including after unmount. */
export async function runScoped<T>(
  scope: GroupWorkspaceScope,
  token: WorkspaceToken,
  work: () => Promise<T>,
  handlers: {
    success: (value: T) => void;
    error: (error: unknown) => void;
    finally?: () => void;
  }
): Promise<void> {
  try {
    const value = await work();
    if (scope.isCurrent(token)) handlers.success(value);
  } catch (error) {
    if (scope.isCurrent(token)) handlers.error(error);
  } finally {
    if (scope.isCurrent(token)) handlers.finally?.();
  }
}

/** Claim synchronously, before React can rerender, to prevent duplicate writes. */
export async function runScopedAction<T>(
  scope: GroupWorkspaceScope,
  token: WorkspaceToken,
  work: () => Promise<T>,
  handlers: {
    start: () => void;
    success: (value: T) => void;
    error: (error: unknown) => void;
    finally: () => void;
  }
): Promise<boolean> {
  const claim = scope.claimAction(token);
  if (!claim) return false;
  handlers.start();
  await runScoped(scope, token, work, {
    success: handlers.success,
    error: handlers.error,
    finally: () => {
      if (scope.releaseAction(claim)) handlers.finally();
    },
  });
  return true;
}
