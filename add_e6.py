import io

p = "docs/team/DECISIONS.md"
s = io.open(p, encoding="utf-8").read()

# 1) the supplementary line on the previous (UTC) entry — additive, history untouched
heading = "## 2026-11-25 — Adam rules the AI-chat day boundary to UTC; deploy 2 changes again, deploy 1 does not\n"
assert s.count(heading) == 1
note = "\n**補充（後補，2026-11-25）：** 同日第三批裁決其實含三項，本條只記了日界那一項；另外兩項見下一條。\n"
s = s.replace(heading, heading + note, 1)

entry = """
## 2026-11-25 — Adam rules option A: a unique index, a contract sentence, and the last SHA change

**The ruling, as given.** The two remaining items from Role 6's third review were put to Adam
together and he chose **A**: adopt **3(a)**, making `group_chat_messages_ai_request` a **unique**
partial index, and **2(B)**, which changes no code and adds the missing half-sentence to the
contract. Both land in one batch, so deploy 2 changes exactly once more. This is a dated technical
decision by Adam; it authorises no database write, migration, merge, deployment or publication.

**Why uniqueness is not cosmetic.** The index exists so `finish_group_ai_request` can find the
message it already wrote. Nothing in the schema stopped a second row carrying the same
`ai_request_id`: the state machine in `finish` refuses a second finish, but a direct insert, an
import or a second writer never passes through it. `get_group_ai_request_status` joins those
messages, so a duplicate would have surfaced as two status rows for one request. Uniqueness now
belongs to the database rather than to a code path.

**Why the contract had to move in the same commit.** The contract does not merely describe the
index; it pastes the DDL at §1. Changing the SQL alone would have produced exactly the defect class
this cycle has been closing — S-4's missing SQLSTATE, S-5's daily count, G-5's in-flight wording.
§1.1 also gained the half-sentence naming the unique index as the enforcement point.

**Scope — four places, nothing else.**

- Deploy 2: the index expression (`create index` → `create unique index`, name and partial predicate
  unchanged) and one line in the header's change list. Nothing else in the file was touched.
- Contract: the §1 DDL snippet, one half-sentence in §1.1, and the operational definition at the end
  of §2.1 G-5 (Adam's 2(B): "in flight" is measured from `created_at`; the `claimed_at` form
  survives only inside the daily-quota exclusion). G-3's approved wording was not touched.
- `server/stage6AiChatSqlContract.test.ts`: the pinned literal becomes
  `create unique index if not exists group_chat_messages_ai_request`.
- `server/stage6AiChatMigrationApplies.test.ts`: one new test writes a second AI message carrying
  the same `ai_request_id` and requires `23505` naming the index.

**Blobs.** Deploy 1 is byte-identical to the entry above — `57e4c5265da487073683436fa385a4ce79a06403`,
299 lines, 18,653 bytes, sha256 `4effbf5d69bbf92d6275c2af1b6ca6d62dd9a2a0be6bb421ffd4d8ab5abb179d`;
its diff against the previous head is **0 bytes**. Deploy 2 becomes
`2c66691b2e1f780498f1cca1e9c603a5a2053364`, 721 lines, 33,989 bytes, sha256
`9700679905c11e3d2b5046080f6ebccdf06288729ba909da1e2ca6a1b90ad15e`, superseding
`748a87f1969a58967d6cbf297077755c274ce522` / `8e4d18910d2ece5b75901373c53c7f731a72c8c03f64059b49c42f8e06b75f19`.
The contract becomes `45e95cda15dc76ba9c6a1f4a364bacdf29ea366c`, 528 lines, 96,704 bytes, sha256
`66160e6805b516da0bcaa998d5a7a158c7978044e0d92ac73bcea0bd1cdb12c2`. Any authorisation must name
**the deploy-1 blob above and this deploy-2 blob**, and nothing older.

**The contract's line citations moved by one.** The new header line shifts the deploy-2 body, so §2.1
G-5 now cites 340/346/352 where it used to say 339/345/351. The three cited lines were re-read after
the edit and say what the contract says they say.

**Checks, recorded separately from claims.** `pnpm check` exit 0. `pnpm test` exit 0 — 54 files,
**825 tests** passed, of which the apply suite is **29/29** on the sandbox cluster (**PostgreSQL
16.15**; the targets run 17.11, so this is weaker evidence on version, exactly as the harness header
warns). The new test is the only assertion in the suite that would have failed before E1: the
`pg_indexes` count cannot tell a plain index from a unique one.
**Discrimination measured, not assumed:** the same probe — one request, two messages carrying the
same `ai_request_id` — was run against both blobs, deploy 1 applied first in each case. Old blob
(`8e4d1891…`, 720 lines): the index installs as `CREATE INDEX`, the second insert is **accepted**,
two rows remain. New blob (`97006799…`, 721 lines): `CREATE UNIQUE INDEX`, the second insert fails
`ERROR: 23505: duplicate key value violates unique constraint "group_chat_messages_ai_request"`,
one row remains.

**This is the last SHA change.** After this commit the sequence is only gate 3 (Launch read-only
preflight), gate 4 (Adam's dated authorisation naming both blobs) and gate 5 (same-window apply,
1→2, `ON_ERROR_STOP=1`; deploy 2 failing does not roll deploy 1 back). No further SQL change is
expected; if one becomes necessary it is a new blob and needs its own authorisation. Local green is
not applied: no Supabase project was connected, no preflight was run, nothing was applied, promoted,
merged, deployed or published, and PR #67 stays draft.
"""

if not s.endswith("\n"):
    s += "\n"
s += entry
io.open(p, "w", encoding="utf-8").write(s)
print("E6 written")
