# Stage 6 Test demo samples — Adam’s enrolled courses (2026-11-18)

## Purpose

Adam reported that the People page showed no browseable groups. The earlier QA groups and recruitment posts were in **MATH120 — Statistics for University Students**, but Adam’s Test account is enrolled in **BUS101, BUS220 and COMM105**. A user only sees groups and posts for courses they are enrolled in, so the MATH120 samples could not appear on his pages.

This record documents the labelled demo records added to the disposable Test project only (`wkzclgmhrtecnpexfesr`). No schema, RLS policy, RPC, API contract or Supabase Main change was made.

## Existing MATH120 QA samples

These are the earlier QA records and remain in MATH120:

| Group             | Group id                               | Active QA members    | Posts                    |
| ----------------- | -------------------------------------- | -------------------- | ------------------------ |
| QA Marketing Team | `e875a6d9-8a58-4414-aaff-3ff4dc8b3970` | Alice, Dave, Bob QA  | Three open, one closed   |
| QA Finance Circle | `e6f05643-6ed5-4699-8e6b-042feb4ae926` | Cara, Emma, Frank QA | Included in the same set |

The exact QA account names and data are recorded in the Stage 6 live QA record.

## New labelled Test demo records

All three groups use the current term `3f27c5c8-e294-4b08-a7a0-0a0fb4abdde2` (2026-Fall). Each group is `active`, has three active sample-student memberships, and has one `open` recruitment post. The sample students already existed in Test and were enrolled in the relevant courses; they did not have memberships in these courses before this seed.

| Course  | Group name                      | Group id                               | Active members                   | Open post id                           | Post subject                         |
| ------- | ------------------------------- | -------------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------ |
| BUS101  | BUS101 Demo Case Team           | `53ce10bf-89b8-40e8-b54c-19db31b8dfcb` | Ava Wong, Chloe Chan, Emma Lau   | `1c9832d5-6d47-4875-aded-882e7912bd94` | Demo: case study partners for BUS101 |
| BUS220  | BUS220 Demo Marketing Circle    | `ac7c64a6-a2e6-40d0-9b58-86bfb5a7bedd` | Ethan Lee, Leo Chan, Lucas Ng    | `58c8a5b0-46ae-4af8-8f92-9a2a1f54c60f` | Demo: marketing campaign teammates   |
| COMM105 | COMM105 Demo Presentation Group | `1fa9a40f-f72e-4768-9aca-a1ec6b816b96` | Mia Ho, Noah Tsang, Olivia Yeung | `baa53555-2491-4710-a223-9788cbf888d6` | Demo: presentation practice partners |

The groups are intentionally **not** joined by Adam. They are browseable course peers, so Adam can see them in the People page. His own BUS101 and BUS220 groups are shown under **My Group**, not as browseable groups. COMM105 had no group for Adam before this seed, so its demo post can be used to test the pending request flow; the demo leader is Mia Ho and no automatic approval is expected.

## Verification performed

Read-only Test SQL checks confirmed:

1. `citylink_settings.current_term_id` equals the term used by all three groups.
2. Each group is `active` and belongs to the intended BUS101, BUS220 or COMM105 course.
3. Each group has exactly three `active` memberships.
4. Each group has one `open` recruitment post with the subject shown above.
5. No schema, RLS, RPC, API or Main change was made.

This is database-row verification, not a signed-in click-through. The signed-in People page should be refreshed after the seed; if a group still does not appear, record the exact course and page state before changing data again.

## Cleanup

The project forbids deleting or resetting Test data without explicit lead approval. If Adam later approves cleanup, remove only these labelled demo records by their listed IDs, in dependency order (post, memberships, group), and verify the affected courses afterward. Do not delete the existing MATH120 QA records or any non-demo account as part of this cleanup.

## Related records

- `docs/stage6/STAGE6_LIVE_QA.md` — earlier Stage 6 live QA accounts and behaviour.
- `docs/stage6/PEOPLE_PAGE_TEST_MIGRATION.md` — People page and naming work.
