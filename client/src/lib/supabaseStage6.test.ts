import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabaseClient: {
    auth: { getUser: supabaseMocks.getUser },
    rpc: supabaseMocks.rpc,
  },
}));

import {
  createGroupRecruitmentPost,
  getGroupChatAccess,
  getStage6ErrorMessage,
  listCurrentTermCourseGroups,
  listCurrentTermGroupMembers,
  listGroupChatMessages,
  listGroupRecruitmentPosts,
  sendGroupChatMessage,
} from "@/lib/supabaseStage6";

const userId = "user-1";
const groupId = "group-1";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  supabaseMocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe("Stage 6 RPC service (isolated mocks; no database connection)", () => {
  it("maps only the proposed course-group fields and uses the narrow RPC", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: [
        {
          group_id: groupId,
          group_name: "Design team",
          group_status: "active",
          active_member_count: "3",
          can_create_post: true,
        },
      ],
      error: null,
    });

    await expect(
      listCurrentTermCourseGroups(userId, "course-1")
    ).resolves.toEqual([
      {
        groupId,
        groupName: "Design team",
        status: "active",
        activeMemberCount: 3,
        canCreatePost: true,
      },
    ]);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_current_term_course_groups",
      { p_course_id: "course-1" }
    );
  });

  it("fails closed if an RPC returns unapproved extra identity fields", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: [
        {
          group_id: groupId,
          group_name: "Design team",
          group_status: "active",
          active_member_count: 3,
          can_create_post: true,
          student_id: "not-allowed",
        },
      ],
      error: null,
    });
    await expect(
      listCurrentTermCourseGroups(userId, "course-1")
    ).rejects.toThrow(/unexpected fields/i);
  });

  it("rejects malformed profile skills instead of silently filtering them", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: [
        {
          profile_id: "profile-1",
          display_name: "A Student",
          major: "Design",
          year: 2,
          bio: "",
          skills: ["Research", 17],
        },
      ],
      error: null,
    });
    await expect(listCurrentTermGroupMembers(userId, groupId)).rejects.toThrow(
      /invalid profile details/i
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

  it("maps former-member access as readable but not sendable", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
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

  it("requests an older message page with both cursor fields and the fixed page limit", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
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
    supabaseMocks.rpc.mockResolvedValueOnce({ data: "message-3", error: null });
    await expect(
      sendGroupChatMessage(userId, groupId, "  Hello  ")
    ).resolves.toBe("message-3");
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("send_group_chat_message", {
      p_group_id: groupId,
      p_body: "Hello",
    });
    await expect(sendGroupChatMessage(userId, groupId, "   ")).rejects.toThrow(
      /1–4000 characters/i
    );
  });

  it("maps recruitment posts without accepting extra fields and wires author creation", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: [
        {
          post_id: "post-1",
          group_id: groupId,
          group_name: "Design team",
          active_member_count: 3,
          author_name: "A Student",
          body: "Looking for a designer.",
          post_status: "open",
          created_at: "2026-11-17T09:00:00.000Z",
          updated_at: "2026-11-17T09:00:00.000Z",
          closed_at: null,
          apply_enabled: true,
          can_manage: false,
        },
      ],
      error: null,
    });
    await expect(
      listGroupRecruitmentPosts(userId, "course-1")
    ).resolves.toMatchObject([
      {
        id: "post-1",
        groupId,
        activeMemberCount: 3,
        applyEnabled: true,
        canManage: false,
      },
    ]);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      "list_group_recruitment_posts",
      { p_course_id: "course-1" }
    );

    supabaseMocks.rpc.mockResolvedValueOnce({ data: "post-2", error: null });
    await expect(
      createGroupRecruitmentPost(userId, groupId, "  Need a researcher.  ")
    ).resolves.toBe("post-2");
    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith(
      "create_group_recruitment_post",
      { p_group_id: groupId, p_body: "Need a researcher." }
    );
  });

  it("explains a missing proposed RPC without implying sample data is live", () => {
    expect(getStage6ErrorMessage({ code: "PGRST202" })).toMatch(
      /migration has not been applied/i
    );
  });
});
