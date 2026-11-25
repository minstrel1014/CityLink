import io

p = "server/stage6AiChatMigrationApplies.test.ts"
s = io.open(p, encoding="utf-8").read()

anchor = "\"select count(*) from pg_indexes where indexname = 'group_chat_messages_ai_request'\""
i = s.index(anchor)
# find the end of the enclosing `it(...)` block: the first "\n  });\n" after the anchor
j = s.index("\n  });\n", i) + len("\n  });\n")

block = '''
  it("makes the AI request id unique, not merely indexed (E1)", () => {
    // The pg_indexes count above cannot tell a plain index from a unique one: both return
    // 1. This one can, and it is the only assertion here that would have failed before E1.
    // The state machine in finish() cannot prove it either — a second finish is idempotent
    // by design and never reaches the index — so the duplicate is written directly, as the
    // owner, exactly as a stray import or a second writer would.
    provisioned(database => {
      const group = "aaaaaaaa-0000-0000-0000-000000000001";
      const request = "cccccccc-0000-0000-0000-000000000001";
      exec(
        database,
        "insert into public.group_ai_requests " +
          "(id, group_id, asked_by, idempotency_key, question) values " +
          `('${request}', '${group}', '11111111-1111-1111-1111-111111111111', ` +
          "gen_random_uuid(), 'unique index probe');"
      );
      const insert = (body: string) =>
        sql(
          database,
          "insert into public.group_chat_messages " +
            "(group_id, sender_id, sender_name_snapshot, body, author_kind, ai_request_id) " +
            `values ('${group}', null, 'CityLink AI', '${body}', 'ai', '${request}');`
        );
      expect(insert("first answer").status).toBe(0);
      const second = insert("second answer");
      expect(second.status).not.toBe(0);
      // Named, not just numbered: a 23505 from some other constraint would not prove E1.
      expect(second.stderr).toContain("23505");
      expect(second.stderr).toContain("group_chat_messages_ai_request");
    });
  });
'''

s = s[:j] + block + s[j:]
io.open(p, "w", encoding="utf-8").write(s)
print("E5 inserted")
