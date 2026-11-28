import io, sys

p = "docs/stage6/KAYK_AI_CHAT_CONTRACT_DRAFT.md"
lines = io.open(p, encoding="utf-8").read().split("\n")

# 1) DDL snippet: create index -> create unique index
ddl_idx = [i for i, l in enumerate(lines) if l.strip() == "create index if not exists group_chat_messages_ai_request"]
assert len(ddl_idx) == 1, ddl_idx
lines[ddl_idx[0]] = lines[ddl_idx[0]].replace(
    "create index if not exists", "create unique index if not exists", 1
)

# 2) §1.1 paragraph: append the uniqueness half-sentence
c1 = [i for i, l in enumerate(lines) if l.startswith("**`ai_request_id` 的約束（Role 6 C-1）。**")]
assert len(c1) == 1, c1
lines[c1[0]] = lines[c1[0]] + "   **唯一性**另外由 `group_chat_messages_ai_request` 這個 **unique** partial index 強制：一則 request 最多對應一則 AI 訊息，`get_group_ai_request_status` 的 `left join` 因此不可能回傳多列。"

# 3) G-5: insert the operational definition directly after the G-5 bullet
g5 = [i for i, l in enumerate(lines) if l.startswith("- **G-5（時間源）")]
assert len(g5) == 1, g5
opdef = (
    "  **操作性定義（Adam 2026-11-25 第三批裁決 (b)：不改程式，改這半句）：**"
    "「進行中」一律以 **`created_at`** 起算，即 "
    "`status in ('queued','processing') and created_at > now() - interval '120 seconds'`，"
    "也就是部署 2 第 352 行的寫法。本節出現的 `claimed_at` 式子只用於每日配額"
    "「從未被人接手就不計入」那個排除條件（第 340／346 行）。兩者只在"
    "「某列在佇列裡待超過 120 秒才被接手」時不同，那種情況下**以 `created_at` 這句為準**。"
)
lines.insert(g5[0] + 1, opdef)

io.open(p, "w", encoding="utf-8").write("\n".join(lines))
print("contract edits applied")
