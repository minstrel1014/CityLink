# Coordinator Test/Main metadata parity records — 2026-11-22

Status: independently verified live metadata. Capacity migration remains stopped.

## 1. Authorization and method

Adam's 2026-11-22 authorization allows Main read-only inspection and verification, and permits CityLink-scoped Test schema/catalog inspection when exact changes or results are recorded. The coordinator re-verified both Supabase targets immediately before database access:

| Target | Project ref            | Project name           | Status           | Region           |
| ------ | ---------------------- | ---------------------- | ---------------- | ---------------- |
| Test   | `wkzclgmhrtecnpexfesr` | `CityLink-Stage5-Test` | `ACTIVE_HEALTHY` | `eu-west-1`      |
| Main   | `pijslbchvstkoweslymr` | `CityLink Project`     | `ACTIVE_HEALTHY` | `ap-southeast-1` |

Every database call was a `SELECT` against catalog or `information_schema` metadata. No application row, profile, enrolment, group, invitation, request, post, message, setting value, credential, API key or connection string was read. No `INSERT`, `UPDATE`, `DELETE`, DDL, migration, reset, grant change, policy change or function invocation was performed.

Repository source was compared at the current evidence branch head:

```text
docs/citylink-coordinator-evidence-20261122
2f32df4a939881c6ed4e3b2b1ead76a82c40434e
```

## 2. Migration ledger — reconfirmed

Test rows:

| Version          | Name                                                   |
| ---------------- | ------------------------------------------------------ |
| `20261102131343` | `20261102_stage5_groups`                               |
| `20261102140927` | `20261102_stage5_course_roster_rpc`                    |
| `20261114163512` | `20261114162301_stage5_group_authority_and_succession` |
| `20261117044721` | `stage5_course_group_invite_candidates`                |
| `20261117133731` | `stage5_course_detail_group_views`                     |
| `20261118043211` | `stage6_chat_recruitment`                              |
| `20261118082247` | `stage6_people_page_naming`                            |

Main rows:

| Version          | Name                                    |
| ---------------- | --------------------------------------- |
| `20261118033916` | `stage5_term_model`                     |
| `20261118033944` | `stage5_groups`                         |
| `20261118034001` | `stage5_course_roster_rpc`              |
| `20261118034447` | `stage5_group_authority_and_succession` |
| `20261118034458` | `stage5_course_group_invite_candidates` |
| `20261118034505` | `stage5_course_detail_group_views`      |
| `20261118080722` | `stage6_chat_recruitment`               |

The version values are execution timestamps, so repository filename versions cannot be treated as a portable ledger identity.

## 3. Term-model object parity

Repository row 1 is `supabase/migrations/20261102090000_stage5_term_model.sql`. Test has no exact term-model ledger row, while Main has `20261118033916_stage5_term_model`.

The metadata result was byte-for-byte identical between Test and Main for the checked properties:

| Object                                   | Test                                                | Main                                                | Result |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------ |
| `public.academic_terms`                  | present                                             | present                                             | parity |
| `public.citylink_settings`               | present                                             | present                                             | parity |
| `public.courses.term_id`                 | `uuid NOT NULL`                                     | `uuid NOT NULL`                                     | parity |
| `courses_term_id_fkey`                   | valid FK to `academic_terms(id) ON DELETE RESTRICT` | valid FK to `academic_terms(id) ON DELETE RESTRICT` | parity |
| term/settings primary keys and checks    | present and valid                                   | present and valid                                   | parity |
| `citylink_settings_current_term_id_fkey` | valid, `ON DELETE RESTRICT`                         | valid, `ON DELETE RESTRICT`                         | parity |
| RLS on the three tables                  | enabled, not forced                                 | enabled, not forced                                 | parity |

This strongly corroborates Role 6's conclusion that Test's term-model objects were applied without a corresponding ledger row. It does not prove when or how that occurred, and it is not authorization to repair the ledger.

## 4. Private helper origin and live parity

The reviewed helpers are defined by checked-in `supabase/migrations/20261118050000_stage6_chat_recruitment.sql`:

- `private.can_browse_current_term_group(uuid)` at `:133`
- `private.can_manage_recruitment_post(uuid)` at `:160`
- browser-role revocations at `:931`-`:932`

The earlier coordinator wording that these helpers were absent from checked-in migrations was factually wrong and is superseded by this record.

Live helper posture:

| Helper                                        | Targets | Owner      | `SECURITY DEFINER` | `search_path` |  anon | authenticated | service_role |
| --------------------------------------------- | ------- | ---------- | ------------------ | ------------- | ----: | ------------: | -----------: |
| `private.can_browse_current_term_group(uuid)` | both    | `postgres` | yes                | empty         | false |         false |        false |
| `private.can_manage_recruitment_post(uuid)`   | both    | `postgres` | yes                | empty         | false |         false |        false |
| `private.can_view_group(uuid,uuid)`           | both    | `postgres` | yes                | empty         | false |          true |        false |

`can_view_group` returns the same raw-definition SHA-256 on both targets:

```text
4babdf398279519244d6b3eb6f249554b8636c4f77d9212047160f2634e3effc
```

The two Stage 6 helper definitions are not byte-identical between targets because the stored source formatting differs:

| Helper                          | Test raw SHA-256                                                   | Main raw SHA-256                                                   | Main length | Test length |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------: | ----------: |
| `can_browse_current_term_group` | `a29d523e6a5d5e4ff8b48837ae6e3f09c33e8386d8f472c0269113f7fc026b50` | `7cec20ec38fe1f77d1b78e9940cd28e0672b6b874a55fb22349bf5bac0b90591` |         748 |         666 |
| `can_manage_recruitment_post`   | `92b5e9b75964a5c15cb621c50dadbc2cc6ccbf2733d3e042c52bdee94ab8e505` | `e607aa5ced3fbb909f2ad32db7940335f61e2855b84b6c7b04d0658705a5cac7` |        1037 |         864 |

After normalizing SQL comments, whitespace and token spacing, both live bodies match each other and the checked-in helper body. Canonical SHA-256 values are:

```text
can_browse_current_term_group: 5991901a35dcf8480e807091a105dde3cd8f88a3881a032f1820bd1d3a61b3fc
can_manage_recruitment_post:   5e88d56bce2d575a5df97a39bd609746499b0fa4981e6632af6ebbfb25d2d1b5
```

No security-relevant body divergence was detected in this metadata-only comparison. The difference is stored-source formatting, not an observed authorization predicate. This is not a byte-level migration-ledger proof and does not authorize adding a helper-redefinition migration.

## 5. Row 8 (`stage6_people_page_naming`) parity

Repository row 8 is `supabase/migrations/20261118083000_stage6_people_page_naming.sql`.

| Object or contract                                         | Test live result                                | Main live result                                             | Parity                                |
| ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| `update_own_display_name(text)`                            | present, `authenticated` execute only           | absent                                                       | missing on Main                       |
| `list_course_ungrouped_classmates(uuid,text,uuid,integer)` | present, `authenticated` execute only           | absent                                                       | missing on Main                       |
| `get_current_term_coursemate_profile(uuid,uuid)`           | present, `authenticated` execute only           | absent                                                       | missing on Main                       |
| `create_group_and_invite` overload                         | `(uuid,uuid,text)`                              | `(uuid,uuid)`                                                | arity mismatch                        |
| `create_group_recruitment_post`                            | `(uuid,text,text)`                              | `(uuid,text)`                                                | old signature on Main                 |
| `edit_group_recruitment_post`                              | `(uuid,text,text)`                              | `(uuid,text)`                                                | old signature on Main                 |
| `list_group_recruitment_posts` result                      | includes `subject text`                         | no `subject` column                                          | missing on Main                       |
| `group_recruitment_posts.subject`                          | present, `NOT NULL`                             | absent                                                       | missing on Main                       |
| `profiles_display_name_length_chk`                         | present and valid                               | absent                                                       | missing on Main                       |
| `study_groups_name_length_chk`                             | present and valid                               | absent                                                       | missing on Main                       |
| `group_recruitment_posts_subject_length_chk`               | present and valid                               | absent                                                       | missing on Main                       |
| `handle_new_user()`                                        | trigger function, no browser or service execute | trigger function, `service_role` execute, no browser execute | object present; grant posture differs |

All row-8 RPCs present in Test are postgres-owned, `SECURITY DEFINER`, and use an empty `search_path`. In Main, the equivalent older row-8 RPCs are also postgres-owned `SECURITY DEFINER` functions with empty `search_path`, but each explicitly grants `service_role` execute in addition to `authenticated`; anon execute remains false. The capacity client must never assume Main has the newer signatures or subject contract.

## 6. Capacity objects remain absent

Live result on both targets:

| Target | `*_capacity` functions | `max_members` column | `create_group_and_invite` overload |
| ------ | ---------------------: | -------------------: | ---------------------------------- |
| Test   |                   none |                 none | `(uuid,uuid,text)`                 |
| Main   |                   none |                 none | `(uuid,uuid)`                      |

This confirms the prerequisite mismatch directly against the exact live targets. PR #41 remains migration-stopped.

## 7. Checked-in client arity finding

At `main` `1a583e30c019733d1880d2614ca853481509fdad`:

```ts
// client/src/lib/supabaseGroups.ts:465-470
("create_group_and_invite",
  {
    p_course_id: courseId,
    p_recipient_id: recipientId,
    p_name: name.trim(),
  });
```

At client integration head `344c1058e78fd2cccfde89574e226f3e65a1457c`:

```ts
// client/src/lib/supabaseGroups.ts:888-894
("create_group_and_invite",
  {
    p_course_id: courseId,
    p_recipient_id: recipientId,
    p_name: name.trim(),
    p_max_members: maxMembers,
  });
```

Therefore:

1. If a live surface currently serves `main` client code against Main, group creation would call a three-argument RPC that does not exist in Main's two-argument-only catalog.
2. If the PR #37 capacity client were released before the reviewed capacity schema is applied, its four-argument call would not exist in either current Test or Main.
3. The current repository deployment target is not established by code inspection alone. Adam must confirm the actual live surface configuration before this is called a production break.

## 8. Consequences for the next successor SQL

Role 6's successor capacity migration should be forward-only and target-parameterized rather than a blind replay of repository filenames. At minimum it needs per-target prerequisite assertions before capacity DDL:

- Test expects the row-8 three-argument overload and new subject/constraint objects, but no capacity objects.
- Main currently lacks row 8 entirely and has its own older grant posture; capacity migration cannot be assumed sufficient to bring it to the reviewed client contract.
- Main's three write-RPC anon grants and broader service-role grants require a separate, reviewed security remediation rather than being hidden inside capacity rollout.
- Ledger repair, if ever needed, is separate metadata work and requires explicit authorization.
- Helper redefinition is not recommended: the checked-in Stage 6 migration is authoritative for helper origin, and live canonical logic matches it in this bounded comparison.

## 9. Boundary

This document records metadata-only verification. It does not:

- mark any PR ready or merge it into `main`;
- apply PR #41 or any capacity migration;
- authorize Test writes or Main writes;
- authorize deployment or publication;
- establish signed-in application behavior;
- prove the origin of unrecorded Test migrations;
- certify production surface configuration.
