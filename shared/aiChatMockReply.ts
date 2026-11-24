import { AI_REPLY_TARGET_MIN } from "./aiChatReply";
import type { ChatTurn } from "./aiChatContext";

/**
 * The mock answer, shared by the server provider and the client drawer.
 *
 * One implementation, so what the drawer shows before the real provider exists
 * is the same text the tests assert on. It reads only the assembled context and
 * performs no I/O.
 */
export interface MockReplyInput {
  question: string;
  turns: Pick<ChatTurn, "authorKind" | "body">[];
  files: Array<{ name: string; text: string }>;
}

function charLength(text: string): number {
  return Array.from(text).length;
}

function clip(text: string, limit: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= limit) return chars.join("");
  return `${chars.slice(0, limit).join("")}…`;
}

export function composeMockReply(input: MockReplyInput): string {
  const memberTurns = input.turns.filter(turn => turn.authorKind === "member");
  const aiTurns = input.turns.filter(turn => turn.authorKind === "ai");

  const paragraphs: string[] = [
    `針對你的問題「${clip(input.question, 120)}」，以下是根據本群組目前可用的內容整理出的回應。`,
  ];

  if (memberTurns.length > 0) {
    paragraphs.push(
      `我讀到 ${memberTurns.length} 則成員訊息，其中最近的一則是「${clip(
        memberTurns[memberTurns.length - 1].body,
        90,
      )}」。`,
    );
  } else {
    paragraphs.push("這次的 context 沒有包含成員訊息，所以我只能依你的問題與檔案內容回答。");
  }

  if (aiTurns.length > 0) {
    paragraphs.push(`先前的 AI 回應有 ${aiTurns.length} 則在 context 內，我會避免重複已經講過的部分。`);
  }

  if (input.files.length > 0) {
    const names = input.files.map(file => file.name).join("、");
    paragraphs.push(
      `你選取了 ${input.files.length} 個檔案（${names}）。以「${clip(input.files[0].text, 100)}」這段為例，` +
        "檔案內容看起來與問題相關，建議先確認它的結論是否仍然成立，再決定要不要採用。",
    );
  } else {
    paragraphs.push("這次沒有選取檔案，所以答案只依據聊天 context。");
  }

  paragraphs.push(
    "建議的下一步：先把上面提到的重點寫成兩三句共識，再分配誰去確認哪一項；" +
      "如果有新的成員加入，請把這段結論貼進聊天室，讓後加入的人不必重讀整段歷史。",
  );

  const padding = [
    "補充說明：這個回答由本機的 mock provider 產生，沒有呼叫任何外部服務，也沒有把內容送出 CityLink。",
    "如果你需要更精確的答案，可以在提問裡指明要比較的段落或章節，我會把範圍縮小。",
    "若你認為某一段對話不應該被納入，可以由任何成員清空 context；清空只會移動時間戳，不會刪除任何訊息。",
    "關於 context 的取捨：本次提問一定會保留；AI 的回應最多帶兩則，超出的會從最舊的開始丟；剩下的額度才給成員訊息，取最近的部分。",
    "如果回答開頭出現「本次未包含較早的對話」，代表上面有東西被丟掉了，不是全部對話都被讀過。看到這句話時，值得先確認較早的結論是否仍然有效。",
    "關於檔案：一次最多兩個，而且只會用本群組、狀態為 current、保留期未過的檔案。已替換或已刪除的檔案不會被送進來，即使它們還留在你的裝置上。",
    "關於保留：AI 的回答會成為群組歷史的一部分，成員退出或被移除之後仍然看得到。這是刻意的設計，也是同意畫面必須明講的原因。",
    "關於長度：回答以 1,200 到 1,500 字元為目標，硬上限 2,500 字元；超過會截斷並附上「（回答過長，已截斷）」，同時留下紀錄。",
    "關於提問：一次只處理一個問題。如果同時問了兩件事，我會先回答第一件，再把第二件列成待確認項目，避免兩邊都答得含糊。",
    "關於來源：我只會用你選取的檔案與本群組的聊天記錄，不會讀取其他群組、其他課程，也不會讀取你的私人訊息。",
    "關於不確定：如果 context 不足以回答，我會直接說缺少什麼，而不是補一個聽起來合理的答案。",
    "關於後續：這條對話是全組共用的，所以下一位成員問問題時，會看到我這次的回答；如果你不希望某段被引用，可以先清空 context。",
    "關於格式：回答盡量用短段落，避免長清單；如果真的要列點，會把每一點的依據寫在同一段裡，方便對照原文。",
    "關於成員變動：新加入的成員看不到加入之前的 context 之外的東西，但看得到聊天室歷史，包括我過去的回答。",
    "關於檔案替換：如果某個檔案被上傳者替換，舊版本不會再被選取；這是替換即刪除的設計，不保留版本歷史。",
    "關於到期：保留期以學期計算，到期後檔案會停止可見；AI 不會使用已過期的檔案，即使它的下載連結仍然存在。",
    "關於清空：清空 context 是任何成員都可以做的動作，只會移動一個時間戳，訊息本身一則都不會消失，所以不用擔心按錯。",
    "關於撤回：目前沒有撤回單則 AI 回答的功能；如果你覺得某一則回答有誤，最直接的做法是在聊天室裡指出，讓後續的回答一併修正。",
    "關於語言：我會盡量用你提問的語言回答；如果群組裡混用中文與英文，我會以問題的語言為主，專有名詞保留原文。",
    "關於隱私：我不會把你選取的檔案內容寫進回答之外的任何地方，也不會把它存成新的檔案或新的訊息。",
    "關於限制：我只是一個輔助工具，最終的判斷仍然由你和組員負責；重要的結論請以你們確認過的版本為準。",
  ];
  let index = 0;
  while (charLength(paragraphs.join("\n\n")) < AI_REPLY_TARGET_MIN && index < padding.length) {
    paragraphs.push(padding[index]);
    index += 1;
  }

  return paragraphs.join("\n\n");
}
