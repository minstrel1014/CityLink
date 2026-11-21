import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  response: vi.fn(),
  ambientToken: "dummy-token-A",
  fetchGate: undefined as Promise<void> | undefined,
  requests: [] as Array<{ supplied: Headers; effective: Headers }>,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: {
      getSession: supabaseMocks.getSession,
      getUser: supabaseMocks.getUser,
    },
    rpc: supabaseMocks.rpc,
  },
}));

import {
  closeGroupRecruitmentPost,
  createGroupRecruitmentPost,
  editGroupRecruitmentPost,
  getGroupChatAccess,
  getStage6ErrorMessage,
  listCurrentTermCourseGroups,
  listCourseUngroupedClassmates,
  listCurrentTermGroupMembers,
  listGroupChatMessages,
  listGroupRecruitmentPosts,
  mapCourseGroupSummaries,
  mapGroupRecruitmentPosts,
  sendGroupChatMessage,
} from "@/lib/supabaseStage6";
import { GroupWorkspaceScope } from "@/pages/citylink/GroupWorkspaceScope";

const userId = "user-1";
const groupId = "group-1";
const tokenA = "dummy-token-A";
const tokenB = "dummy-token-B";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  supabaseMocks.ambientToken = tokenA;
  supabaseMocks.fetchGate = undefined;
  supabaseMocks.requests = [];
  supabaseMocks.getSession.mockResolvedValue({
    data: { session: { access_token: tokenA, user: { id: userId } } },
    error: null,
  });
  supabaseMocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  supabaseMocks.response.mockResolvedValue({ data: [], error: null });
  supabaseMocks.rpc.mockImplementation(() => {
    const supplied = new Headers();
    const builder = {
      setHeader(name: string, value: string) {
        supplied.set(name, value);
        return builder;
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown
      ) {
        return (async () => {
          // Mirror fetchWithAuth: ambient credentials fill only absent headers.
          if (supabaseMocks.fetchGate) await supabaseMocks.fetchGate;
          const effective = new Headers(supplied);
          if (!effective.has("Authorization")) {
            effective.set(
              "Authorization",
              `Bearer ${supabaseMocks.ambientToken}`
            );
          }
          supabaseMocks.requests.push({
            supplied: new Headers(supplied),
            effective,
          });
          return supabaseMocks.response();
        })().then(resolve, reject);
      },
    };
    return builder;
  });
});

describe("Stage 6 RPC service (isolated mocks; no database connection)", () => {
  it("maps only the proposed course-group fields and uses the narrow RPC", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          group_id: groupId,
          group_name: "Design team",
          group_status: "active",
          active_member_count: "3",
          max_members: 5,
          capacity_count: 3,
          capacity_state: "available",
          can_create_post: false,
          has_more: false,
        },
      ],
      error: null,
    });

    await expect(
      listCurrentTermCourseGroups(userId, "course-1")
    ).resolves.toEqual({
      items: [
        {
          groupId,
          groupName: "Design team",
          status: "active",
          activeMemberCount: 3,
          maxMembers: 5,
          capacityCount: 3,
          capacityState: "available",
          canCreatePost: false,
        },
      ],
      hasMore: false,
      nextCursor: { groupName: "Design team", groupId },
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_current_term_course_groups_capacity",
      {
        p_course_id: "course-1",
        p_after_group_name: null,
        p_after_group_id: null,
        p_limit: 25,
      }
    );
  });

  it("fails closed if an RPC returns unapproved extra identity fields", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          group_id: groupId,
          group_name: "Design team",
          group_status: "active",
          active_member_count: 3,
          max_members: 5,
          capacity_count: 3,
          capacity_state: "available",
          can_create_post: true,
          has_more: false,
          student_id: "not-allowed",
        },
      ],
      error: null,
    });
    await expect(
      listCurrentTermCourseGroups(userId, "course-1")
    ).rejects.toThrow(/unexpected fields/i);
  });

  it("uses the group name and ID from the prior page as the v2 keyset cursor", async () => {
    supabaseMocks.response.mockResolvedValueOnce({ data: [], error: null });
    await listCurrentTermCourseGroups(userId, "course-1", {
      groupName: "Design team",
      groupId,
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_current_term_course_groups_capacity",
      {
        p_course_id: "course-1",
        p_after_group_name: "Design team",
        p_after_group_id: groupId,
        p_limit: 25,
      }
    );
  });

  it("rejects malformed profile skills instead of silently filtering them", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          profile_id: "profile-1",
          display_name: "A Student",
          major: "Design",
          year: 2,
          bio: "",
          skills: ["Research", 17],
          cursor_joined_at: "2026-11-17T08:00:00.000Z",
          cursor_membership_id: "membership-1",
          has_more: false,
        },
      ],
      error: null,
    });
    await expect(listCurrentTermGroupMembers(userId, groupId)).rejects.toThrow(
      /invalid profile details/i
    );
  });

  it("maps approved member fields and requests the exact next-page cursor", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          profile_id: "profile-1",
          display_name: "A Student",
          major: "Design",
          year: 2,
          bio: "Designer",
          skills: ["Research"],
          cursor_joined_at: "2026-11-17T08:00:00.000Z",
          cursor_membership_id: "membership-1",
          has_more: true,
        },
      ],
      error: null,
    });
    await expect(
      listCurrentTermGroupMembers(userId, groupId, {
        joinedAt: "2026-11-16T08:00:00.000Z",
        membershipId: "membership-0",
      })
    ).resolves.toMatchObject({
      hasMore: true,
      nextCursor: {
        joinedAt: "2026-11-17T08:00:00.000Z",
        membershipId: "membership-1",
      },
      items: [
        {
          profileId: "profile-1",
          displayName: "A Student",
          skills: ["Research"],
        },
      ],
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_current_term_group_members",
      {
        p_group_id: groupId,
        p_after_joined_at: "2026-11-16T08:00:00.000Z",
        p_after_membership_id: "membership-0",
        p_limit: 50,
      }
    );
  });

  it("does not make an RPC call if the current session does not match the caller", async () => {
    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "different-user" } },
      error: null,
    });
    await expect(getGroupChatAccess(userId, groupId)).rejects.toThrow(
      /sign-in could not be verified/i
    );
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it("does not create a recruitment post for a mismatched signed-in account", async () => {
    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "different-user" } },
      error: null,
    });
    await expect(
      createGroupRecruitmentPost(userId, groupId, "Subject", "Message")
    ).rejects.toThrow(/sign-in could not be verified/i);
    expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenA);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing session", { data: { session: null }, error: null }],
    ["missing token", { data: { session: {} }, error: null }],
    ["blank token", { data: { session: { access_token: "  " } }, error: null }],
    ["session error", { data: { session: null }, error: new Error("failed") }],
  ])("rejects a %s before creating an RPC", async (_, sessionResult) => {
    supabaseMocks.getSession.mockResolvedValueOnce(sessionResult);
    await expect(
      createGroupRecruitmentPost(userId, groupId, "Subject", "Message")
    ).rejects.toThrow(/sign-in could not be verified/i);
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing verified user", { data: { user: null }, error: null }],
    [
      "verification error",
      { data: { user: { id: userId } }, error: new Error("failed") },
    ],
  ])("rejects a %s before creating an RPC", async (_, userResult) => {
    supabaseMocks.getUser.mockResolvedValueOnce(userResult);
    await expect(
      createGroupRecruitmentPost(userId, groupId, "Subject", "Message")
    ).rejects.toThrow(/sign-in could not be verified/i);
    expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenA);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed without exposing a thrown authentication error", async () => {
    supabaseMocks.getUser.mockRejectedValueOnce(
      new Error(`sensitive ${tokenA}`)
    );
    const result = createGroupRecruitmentPost(
      userId,
      groupId,
      "Subject",
      "Message"
    );
    await expect(result).rejects.toThrow(
      "Your sign-in could not be verified. Sign in again."
    );
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a token that resolves to another account after a delayed session lookup", async () => {
    const session = deferred<unknown>();
    supabaseMocks.getSession.mockReturnValueOnce(session.promise);
    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-2" } },
      error: null,
    });
    const result = createGroupRecruitmentPost(
      userId,
      groupId,
      "Subject",
      "Message"
    );
    const rejected = expect(result).rejects.toThrow(
      /sign-in could not be verified/i
    );
    supabaseMocks.ambientToken = tokenB;
    session.resolve({
      data: { session: { access_token: tokenB, user: { id: "user-2" } } },
      error: null,
    });
    await rejected;
    expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenB);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "session",
      "account",
      { status: "ready", userId: "user-2", courseId: "course-1" },
    ],
    ["session", "course", { status: "ready", userId, courseId: "course-2" }],
    [
      "user",
      "account",
      { status: "ready", userId: "user-2", courseId: "course-1" },
    ],
    ["user", "course", { status: "ready", userId, courseId: "course-2" }],
    [
      "user",
      "session readiness",
      { status: "loading", userId: null, courseId: "course-1" },
    ],
  ])(
    "does not create an RPC when %s verification is pending and %s changes",
    async (phase, _, next) => {
      const context = { status: "ready", userId, courseId: "course-1" };
      const scope = new GroupWorkspaceScope(context);
      const workspaceToken = scope.currentToken()!;
      const shouldDispatch = vi.fn(() => scope.isCurrent(workspaceToken));
      const pending = deferred<unknown>();
      if (phase === "session")
        supabaseMocks.getSession.mockReturnValueOnce(pending.promise);
      else supabaseMocks.getUser.mockReturnValueOnce(pending.promise);

      const result = createGroupRecruitmentPost(
        userId,
        groupId,
        "Subject",
        "Message",
        shouldDispatch
      );
      const rejected = expect(result).rejects.toThrow(/workspace changed/i);
      if (phase === "user") {
        await vi.waitFor(() =>
          expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenA)
        );
      }
      scope.updateContext(next);
      // Returning to the original account/course does not revive stale work.
      scope.updateContext(context);
      supabaseMocks.ambientToken = tokenB;
      pending.resolve(
        phase === "session"
          ? { data: { session: { access_token: tokenA } }, error: null }
          : { data: { user: { id: userId } }, error: null }
      );
      await rejected;
      expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenA);
      expect(shouldDispatch).toHaveBeenCalledTimes(1);
      expect(supabaseMocks.rpc).not.toHaveBeenCalled();
      expect(supabaseMocks.requests).toHaveLength(0);
    }
  );

  it("binds the verified token to only this request if the account switches after the guard", async () => {
    const scope = new GroupWorkspaceScope({
      status: "ready",
      userId,
      courseId: "course-1",
    });
    const workspaceToken = scope.currentToken()!;
    const shouldDispatch = vi.fn(() => scope.isCurrent(workspaceToken));
    const fetchGate = deferred<void>();
    supabaseMocks.fetchGate = fetchGate.promise;
    supabaseMocks.response.mockResolvedValueOnce({
      data: "post-2",
      error: null,
    });

    const result = createGroupRecruitmentPost(
      userId,
      groupId,
      " Subject ",
      " Message ",
      shouldDispatch
    );
    await vi.waitFor(() => expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1));
    expect(shouldDispatch).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.getUser).toHaveBeenCalledWith(tokenA);
    scope.updateContext({
      status: "ready",
      userId: "user-2",
      courseId: "course-1",
    });
    supabaseMocks.ambientToken = tokenB;
    fetchGate.resolve();
    await expect(result).resolves.toBe("post-2");
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "create_group_recruitment_post",
      {
        p_group_id: groupId,
        p_subject: "Subject",
        p_body: "Message",
      }
    );
    expect(supabaseMocks.requests[0].supplied.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );
    expect(supabaseMocks.requests[0].effective.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );

    // A later, unrelated request is not contaminated by the create header.
    supabaseMocks.fetchGate = undefined;
    supabaseMocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-2" } },
      error: null,
    });
    supabaseMocks.response.mockResolvedValueOnce({
      data: [{ can_read: true, can_send: false }],
      error: null,
    });
    await getGroupChatAccess("user-2", groupId);
    expect(supabaseMocks.requests[1].supplied.has("Authorization")).toBe(false);
    expect(supabaseMocks.requests[1].effective.get("Authorization")).toBe(
      `Bearer ${tokenB}`
    );
  });

  it("validates create input before authentication or RPC", async () => {
    for (const [subject, body] of [
      [" ", "Message"],
      ["x".repeat(121), "Message"],
      ["Subject", " "],
      ["Subject", "x".repeat(2001)],
    ]) {
      await expect(
        createGroupRecruitmentPost(userId, groupId, subject, body)
      ).rejects.toThrow();
    }
    expect(supabaseMocks.getSession).not.toHaveBeenCalled();
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves RPC errors and rejects an unconfirmed create result", async () => {
    const error = new Error("write rejected");
    supabaseMocks.response.mockResolvedValueOnce({ data: null, error });
    await expect(
      createGroupRecruitmentPost(userId, groupId, "Subject", "Message")
    ).rejects.toBe(error);
    supabaseMocks.response.mockResolvedValueOnce({ data: "", error: null });
    await expect(
      createGroupRecruitmentPost(userId, groupId, "Subject", "Message")
    ).rejects.toThrow(/post was not confirmed/i);
  });

  it("maps former-member access as readable but not sendable", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [{ can_read: true, can_send: false }],
      error: null,
    });
    await expect(getGroupChatAccess(userId, groupId)).resolves.toEqual({
      canRead: true,
      canSend: false,
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("get_group_chat_access", {
      p_group_id: groupId,
    });
  });

  it("preserves the server send flag for active members, including archived groups", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [{ can_read: true, can_send: true }],
      error: null,
    });
    await expect(getGroupChatAccess(userId, groupId)).resolves.toEqual({
      canRead: true,
      canSend: true,
    });
  });

  it("requests an older message page with both cursor fields and the fixed page limit", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          message_id: "message-1",
          sender_name: "A Student",
          body: "Hello",
          created_at: "2026-11-17T10:00:00.000Z",
        },
      ],
      error: null,
    });
    await expect(
      listGroupChatMessages(userId, groupId, {
        createdAt: "2026-11-17T11:00:00.000Z",
        id: "message-2",
      })
    ).resolves.toEqual([
      {
        id: "message-1",
        senderName: "A Student",
        body: "Hello",
        createdAt: "2026-11-17T10:00:00.000Z",
      },
    ]);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("list_group_chat_messages", {
      p_group_id: groupId,
      p_before_created_at: "2026-11-17T11:00:00.000Z",
      p_before_id: "message-2",
      p_limit: 50,
    });
  });

  it("trims plain text before sending through the RPC and rejects empty text locally", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: "message-3",
      error: null,
    });
    await expect(
      sendGroupChatMessage(userId, groupId, "  Hello  ")
    ).resolves.toBe("message-3");
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("send_group_chat_message", {
      p_group_id: groupId,
      p_body: "Hello",
    });
    expect(supabaseMocks.getSession).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.getUser).toHaveBeenLastCalledWith(tokenA);
    expect(supabaseMocks.requests.at(-1)?.supplied.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );
    await expect(sendGroupChatMessage(userId, groupId, "   ")).rejects.toThrow(
      /1–4000 characters/i
    );
  });
  it("binds post edit and close to the captured request token", async () => {
    supabaseMocks.response.mockResolvedValueOnce({ data: null, error: null });
    await editGroupRecruitmentPost(userId, "post-1", "  Subject  ", "  Body  ");
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "edit_group_recruitment_post",
      {
        p_post_id: "post-1",
        p_subject: "Subject",
        p_body: "Body",
      }
    );
    expect(supabaseMocks.requests.at(-1)?.supplied.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );

    supabaseMocks.response.mockResolvedValueOnce({ data: null, error: null });
    await closeGroupRecruitmentPost(userId, "post-1");
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "close_group_recruitment_post",
      { p_post_id: "post-1" }
    );
    expect(supabaseMocks.getSession).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.getUser).toHaveBeenLastCalledWith(tokenA);
    expect(supabaseMocks.requests.at(-1)?.supplied.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );
  });

  it("maps recruitment posts without accepting extra fields and wires author creation", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          post_id: "post-1",
          group_id: groupId,
          group_name: "Design team",
          active_member_count: 3,
          max_members: 5,
          capacity_count: 3,
          capacity_state: "available",
          author_name: "A Student",
          subject: "Looking for a teammate",
          body: "Looking for a designer.",
          post_status: "open",
          created_at: "2026-11-17T09:00:00.000Z",
          updated_at: "2026-11-17T09:00:00.000Z",
          closed_at: null,
          apply_enabled: true,
          apply_block_reason: null,
          can_manage: false,
          has_more: false,
        },
      ],
      error: null,
    });
    await expect(
      listGroupRecruitmentPosts(userId, "course-1")
    ).resolves.toMatchObject({
      items: [
        {
          id: "post-1",
          groupId,
          activeMemberCount: 3,
          maxMembers: 5,
          capacityCount: 3,
          capacityState: "available",
          applyEnabled: true,
          applyBlockReason: null,
          canManage: false,
        },
      ],
      hasMore: false,
      nextCursor: { createdAt: "2026-11-17T09:00:00.000Z", id: "post-1" },
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_group_recruitment_posts",
      {
        p_course_id: "course-1",
        p_after_created_at: null,
        p_after_id: null,
        p_limit: 20,
      }
    );

    supabaseMocks.response.mockResolvedValueOnce({ data: [], error: null });
    await listGroupRecruitmentPosts(userId, "course-1", {
      createdAt: "2026-11-17T09:00:00.000Z",
      id: "post-1",
    });
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "list_group_recruitment_posts",
      {
        p_course_id: "course-1",
        p_after_created_at: "2026-11-17T09:00:00.000Z",
        p_after_id: "post-1",
        p_limit: 20,
      }
    );

    supabaseMocks.response.mockResolvedValueOnce({
      data: "post-2",
      error: null,
    });
    await expect(
      createGroupRecruitmentPost(
        userId,
        groupId,
        "  Research teammate  ",
        "  Need a researcher.  "
      )
    ).resolves.toBe("post-2");
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "create_group_recruitment_post",
      {
        p_group_id: groupId,
        p_subject: "Research teammate",
        p_body: "Need a researcher.",
      }
    );
    expect(supabaseMocks.getSession).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.getUser).toHaveBeenLastCalledWith(tokenA);
    expect(supabaseMocks.requests.at(-1)?.supplied.get("Authorization")).toBe(
      `Bearer ${tokenA}`
    );
  });

  it("pages the ungrouped coursemate list with the returned cursor", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          profile_id: "profile-1",
          display_name: "A Student",
          year: 2,
          major: "Business",
          skills: ["Excel"],
          has_more: true,
        },
      ],
      error: null,
    });
    const first = await listCourseUngroupedClassmates(userId, "course-1");
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({
      displayName: "A Student",
      profileId: "profile-1",
    });
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "list_course_ungrouped_classmates",
      {
        p_course_id: "course-1",
        p_after_display_name: null,
        p_after_profile_id: null,
        p_limit: 50,
      }
    );

    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          profile_id: "profile-2",
          display_name: "B Student",
          year: 3,
          major: null,
          skills: [],
          has_more: false,
        },
      ],
      error: null,
    });
    const second = await listCourseUngroupedClassmates(
      userId,
      "course-1",
      first.nextCursor ?? undefined
    );
    expect(second.hasMore).toBe(false);
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "list_course_ungrouped_classmates",
      {
        p_course_id: "course-1",
        p_after_display_name: "A Student",
        p_after_profile_id: "profile-1",
        p_limit: 50,
      }
    );
  });
  it("keeps terminal-group closed posts visible while hiding group fields and actions", async () => {
    supabaseMocks.response.mockResolvedValueOnce({
      data: [
        {
          post_id: "post-closed",
          group_id: null,
          group_name: null,
          active_member_count: null,
          max_members: null,
          capacity_count: null,
          capacity_state: null,
          author_name: "A Student",
          subject: "Looking for a teammate",
          body: "Still looking for a teammate.",
          post_status: "closed",
          created_at: "2026-11-17T09:00:00.000Z",
          updated_at: "2026-11-17T10:00:00.000Z",
          closed_at: "2026-11-17T10:00:00.000Z",
          apply_enabled: false,
          apply_block_reason: "group_inactive",
          can_manage: false,
          has_more: false,
        },
      ],
      error: null,
    });
    await expect(
      listGroupRecruitmentPosts(userId, "course-1")
    ).resolves.toMatchObject({
      items: [
        {
          id: "post-closed",
          status: "closed",
          groupId: null,
          groupName: null,
          activeMemberCount: null,
          maxMembers: null,
          capacityCount: null,
          capacityState: null,
          applyEnabled: false,
          applyBlockReason: "group_inactive",
          canManage: false,
        },
      ],
      hasMore: false,
    });
  });

  it("explains a missing proposed RPC without implying sample data is live", () => {
    expect(getStage6ErrorMessage({ code: "PGRST202" })).toMatch(
      /migration has not been applied/i
    );
  });
});

describe("unnamed Stage 5 groups", () => {
  it("accepts an empty group name in the course group list", () => {
    const page = mapCourseGroupSummaries([
      {
        group_id: "group-1",
        group_name: "",
        group_status: "active",
        active_member_count: 3,
        max_members: null,
        capacity_count: 3,
        capacity_state: "maximum_not_set",
        can_create_post: false,
        has_more: false,
      },
    ]);
    expect(page.items[0].groupName).toBe("");
    expect(page.nextCursor).toEqual({ groupName: "", groupId: "group-1" });
  });

  it("shows a fallback name for a post whose group is unnamed", () => {
    const page = mapGroupRecruitmentPosts([
      {
        post_id: "post-1",
        group_id: "group-1",
        group_name: "",
        active_member_count: 3,
        max_members: 5,
        capacity_count: 3,
        capacity_state: "available",
        author_name: "A student",
        subject: "Looking for a teammate",
        body: "Looking for teammates",
        post_status: "open",
        created_at: "2026-11-18T00:00:00Z",
        updated_at: "2026-11-18T00:00:00Z",
        closed_at: null,
        apply_enabled: true,
        apply_block_reason: null,
        can_manage: false,
        has_more: false,
      },
    ]);
    expect(page.items[0].groupName).toBe("Study group");
  });
});
