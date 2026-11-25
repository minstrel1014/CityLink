import { describe, expect, it } from "vitest";
import {
  systemPrompt,
  turnLine,
  userPrompt,
  type ClaimedTurn,
} from "../supabase/functions/group-ai-executor/prompt.ts";
import { AI_REPLY_HARD_LIMIT } from "../shared/aiChatReply";

/**
 * What the model is actually told.
 *
 * Adam's report of 2026-11-25 was an answer claiming 「目前群組聊天記錄顯示為空——
 * 沒有人發言過」, while the stored request behind it (measured on Launch the next day)
 * carried 8 real turns. The queue was not empty and the transcript was assembled
 * correctly — `index.ts` read `turn.sender_name`, while the applied
 * `begin_group_ai_request` writes `'authorName'` (deploy 2 line 438), so every line
 * arrived as an anonymous 「成員」 and nothing said how many lines there were.
 *
 * These cases run the same module the Edge Function runs, so the fix is executed
 * rather than eyeballed.
 */

const turns = (...items: Array<Partial<ClaimedTurn>>): ClaimedTurn[] =>
  items as ClaimedTurn[];

describe("executor transcript rendering", () => {
  it("uses the keys the applied function actually sends", () => {
    // The regression itself: camelCase in, name out.
    expect(
      turnLine({ authorKind: "member", authorName: "woohoo", body: "123" })
    ).toBe("woohoo：123");
  });

  it("still accepts the old snake_case shape", () => {
    expect(
      turnLine({
        author_kind: "member",
        sender_name: "hello world",
        body: "hi",
      })
    ).toBe("hello world：hi");
  });

  it("labels the assistant's own earlier answers instead of hiding them", () => {
    // A member may set their display name to "CityLink AI" (contract §1.3, ruling
    // C-2), so author_kind decides and the stored name is ignored for ai rows.
    expect(
      turnLine({ authorKind: "ai", authorName: "CityLink AI", body: "答案" })
    ).toBe("CityLink AI：答案");
    expect(
      turnLine({ authorKind: "member", authorName: "CityLink AI", body: "x" })
    ).toBe("CityLink AI：x");
  });

  it("falls back to a plain label when a name is missing", () => {
    expect(turnLine({ authorKind: "member", body: "no name" })).toBe(
      "成員：no name"
    );
    expect(
      turnLine({ authorKind: "member", authorName: "   ", body: "blank" })
    ).toBe("成員：blank");
  });

  it("collapses whitespace so blank lines cannot spend the 4,000-character budget", () => {
    expect(
      turnLine({
        authorKind: "member",
        authorName: "a",
        body: "\n\n  x  \n\n y \n",
      })
    ).toBe("a：x y");
    // Runs of whitespace, including the newlines a pasted message carries, collapse
    // to one space: five blank lines must not cost five units of the transcript
    // budget, and one message must not become several transcript lines.
    expect(
      turnLine({ authorKind: "member", authorName: "a", body: "x\n\n\n\n\ny" })
        .length
    ).toBe("a：x y".length);
    expect(
      userPrompt(turns({ authorKind: "member", body: "\n \n" }), [], "q")
    ).toContain("沒有可帶入的對話記錄");
  });

  it("states the number of turns, so a thin chat is not read as none", () => {
    const prompt = userPrompt(
      turns(
        { authorKind: "member", authorName: "woohoo", body: "123" },
        { authorKind: "member", authorName: "hello world", body: "ok" },
        { authorKind: "ai", authorName: "CityLink AI", body: "previous answer" }
      ),
      [],
      "deadline and work distribution"
    );
    expect(prompt).toContain("共 3 則");
    // Every student's words survive into the prompt.
    expect(prompt).toContain("woohoo：123");
    expect(prompt).toContain("hello world：ok");
    expect(prompt).toContain("問題：deadline and work distribution");
  });

  it("drops empty rows rather than rendering bare labels", () => {
    const prompt = userPrompt(
      turns(
        { authorKind: "member", authorName: "a", body: "real" },
        { authorKind: "member", authorName: "b", body: "   " },
        { authorKind: "member", authorName: "c", body: null }
      ),
      [],
      "q"
    );
    expect(prompt).toContain("共 1 則");
    expect(prompt).not.toContain("b：");
    expect(prompt).not.toContain("c：");
  });

  it("keeps the file block ahead of the transcript and the question last", () => {
    const prompt = userPrompt(
      turns({ authorKind: "member", authorName: "a", body: "chat" }),
      ["file text here", "  "],
      "the question"
    );
    expect(prompt.indexOf("檔案內容：")).toBeLessThan(
      prompt.indexOf("最近的對話")
    );
    expect(prompt.indexOf("最近的對話")).toBeLessThan(prompt.indexOf("問題："));
    expect(prompt).toContain("file text here");
    // A blank extraction result is not a section.
    expect(prompt).not.toContain("\n\n  \n");
  });

  it("answers the empty-group case honestly", () => {
    const prompt = userPrompt([], [], "q");
    expect(prompt).toContain("這個群組目前沒有可帶入的對話記錄。");
    expect(prompt).not.toContain("共 0 則");
  });
});

describe("executor standing instructions", () => {
  const prompt = systemPrompt(2500);

  it("forbids claiming an empty room when lines were supplied", () => {
    expect(prompt).toContain("不得說群組沒有發言過或記錄是空的");
    expect(prompt).toContain("只能說明其中沒有與問題相關的內容");
  });

  it("explains the label so a prior AI answer is not cited as a member's decision", () => {
    expect(prompt).toContain("發言者：內容");
    expect(prompt).toContain("標示為 CityLink AI 的是系統先前的回答，不是成員");
  });

  it("keeps the general-knowledge ruling and the no-invention ruling together", () => {
    expect(prompt).toContain("像一般生成式 AI 一樣回答");
    expect(prompt).toContain("不需要先有群組資料");
    expect(prompt).toContain("不要編造這個群組裡沒發生過的事");
    expect(prompt).not.toContain("只根據提供的對話與檔案內容回答");
  });

  it("carries the answer cap it was handed", () => {
    expect(prompt).toContain("長度不超過 2500 字元");
    // The value passed in is the shared hard limit, not a number invented here;
    // `index.ts` is pinned to that constant by the contract suite.
    expect(prompt).toContain(`長度不超過 ${AI_REPLY_HARD_LIMIT} 字元`);
  });
});
