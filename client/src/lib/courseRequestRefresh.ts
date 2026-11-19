import type {
  GroupRecruitmentPost,
  PageResult,
  RecruitmentPostCursor,
} from "@/lib/supabaseStage6";

export type CourseScope = { userId: string; courseId: string };

const REQUEST_INVALIDATED = "citylink:course-request-invalidated";

export function matchesCourseScope(
  value: { userId: string | null; courseId: string } | null | undefined,
  scope: { userId: string | null; courseId: string }
): boolean {
  return Boolean(
    value &&
      scope.userId &&
      value.userId === scope.userId &&
      value.courseId === scope.courseId
  );
}

export function isCurrentCourseSnapshot(
  value: { userId: string; courseId: string; generation: number } | null,
  scope: { userId: string | null; courseId: string },
  generation: number
): boolean {
  return matchesCourseScope(value, scope) && value?.generation === generation;
}

// Only identity and course are broadcast, never the group, result, or request.
// Each matching screen re-reads its own data using the existing authorized APIs.
export function publishCourseRequestInvalidation(
  scope: CourseScope,
  target: EventTarget = window
) {
  target.dispatchEvent(
    new CustomEvent(REQUEST_INVALIDATED, {
      detail: { userId: scope.userId, courseId: scope.courseId },
    })
  );
}

export function subscribeCourseRequestInvalidation(
  getScope: () => { userId: string | null; courseId: string },
  onInvalidate: () => void,
  target: EventTarget = window
) {
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") return;
    const candidate = detail as Record<string, unknown>;
    if (
      typeof candidate.userId === "string" &&
      typeof candidate.courseId === "string" &&
      matchesCourseScope(
        { userId: candidate.userId, courseId: candidate.courseId },
        getScope()
      )
    ) {
      onInvalidate();
    }
  };
  target.addEventListener(REQUEST_INVALIDATED, listener);
  return () => target.removeEventListener(REQUEST_INVALIDATED, listener);
}

// A rejected transport can still mean that the server committed the request.
// Invalidate on either outcome; the caller retains the original result/error.
export async function requestWithCourseInvalidation<T>(
  scope: CourseScope,
  request: () => Promise<T>,
  target: EventTarget = window
): Promise<T> {
  try {
    return await request();
  } finally {
    publishCourseRequestInvalidation(scope, target);
  }
}

export function createRequestGeneration() {
  let generation = 0;
  return {
    invalidate: () => ++generation,
    current: () => generation,
    isCurrent: (expected: number) => generation === expected,
  };
}

// Each keyed account/course view has its own action owner. An old completion
// cannot clear a later action or write to a new view after unmount.
export function createActionOwner() {
  let mounted = false;
  let action: symbol | null = null;
  return {
    mount: () => {
      mounted = true;
    },
    unmount: () => {
      mounted = false;
      action = null;
    },
    begin: () => {
      if (!mounted || action) return null;
      action = Symbol("course-action");
      return action;
    },
    isCurrent: (token: symbol) => mounted && action === token,
    finish: (token: symbol) => {
      if (!mounted || action !== token) return false;
      action = null;
      return true;
    },
  };
}

type PostsSnapshot = CourseScope & {
  generation: number;
  posts: GroupRecruitmentPost[];
  postsHasMore: boolean;
  postsCursor: RecruitmentPostCursor | null;
};

export function appendCurrentRecruitmentPage<T extends PostsSnapshot>(
  previous: T | null,
  scope: CourseScope,
  expectedGeneration: number,
  currentGeneration: number,
  page: PageResult<GroupRecruitmentPost, RecruitmentPostCursor>
): T | null {
  if (
    !previous ||
    !isCurrentCourseSnapshot(previous, scope, expectedGeneration) ||
    currentGeneration !== expectedGeneration
  )
    return previous;
  const known = new Set(previous.posts.map(post => post.id));
  return {
    ...previous,
    posts: [
      ...previous.posts,
      ...page.items.filter(post => !known.has(post.id)),
    ],
    postsHasMore: page.hasMore,
    postsCursor: page.nextCursor,
  };
}
