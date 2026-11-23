# Coordinator offline verification of the Role 6 successor guard draft (2026-11-22)

Engine: disposable LOCAL PostgreSQL 16.15 in the coordinator sandbox, unix socket only, no network listener. NOT Supabase Test `wkzclgmhrtecnpexfesr`, NOT Main `pijslbchvstkoweslymr`. No cloud database was contacted.
Subject: PR #51 head `bc6a6d557cba1d4a61c6cabd48ec181b4e3da098`, file `docs/capacity-successor/20261122180000_stage7_group_capacity_prerequisite_guard_DRAFT.sql` (608 lines).

## Results kept as raw psql output

                                                                 version

---

PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
(1 row)

== P1: does pg_proc.proallargnames exist? ==
proallargnames_exists

---

                     0

(1 row)

    attname

---

proallargtypes
proargmodes
proargnames
(3 rows)

== P2: does pg_default_acl.roleid exist? ==
attname

---

oid
defaclrole
defaclnamespace
defaclobjtype
defaclacl
(5 rows)

== P3: the guard G6 expression as written, then with the documented column ==
psql:/tmp/verify-role6-guard-offline.sql:34: NOTICE: G6_AS_WRITTEN_RAISED: 42703 / column p.proallargnames does not exist
DO
psql:/tmp/verify-role6-guard-offline.sql:49: NOTICE: G6_WITH_PROARGNAMES_RAISED: 42883 / function "pg_catalog.array_append(anyarray, anyelement)" does not exist
DO
== P4: text[] || untyped literal, exactly the guard accumulator pattern ==
psql:/tmp/verify-role6-guard-offline.sql:60: NOTICE: P4A_COMMA_FREE_LITERAL_RAISED: 22P02 / malformed array literal: "G2 public.academic_terms missing"
DO
psql:/tmp/verify-role6-guard-offline.sql:70: NOTICE: P4B_NO_COMMA_LITERAL_RAISED: 22P02 / malformed array literal: "G8 no CREATE on schema public for the runner"
DO
psql:/tmp/verify-role6-guard-offline.sql:81: NOTICE: P4C_TEXTVAR_PARTICIPATES_RAISED: 22P02 / malformed array literal: "G3 "
DO
psql:/tmp/verify-role6-guard-offline.sql:93: NOTICE: P4D_MULTI_LITERAL_CHAIN_RAISED: 22P02 / malformed array literal: "G5 study_groups.max_members already present; the "
DO
psql:/tmp/verify-role6-guard-offline.sql:104: NOTICE: P4E_ARRAY_APPEND_RESULT: {"G2 public.academic_terms missing","G8 no CREATE on schema public for the runner"}
DO
psql:/tmp/verify-role6-guard-offline.sql:116: NOTICE: P4F_TEXTARRAY_COERCED_CHAIN_RAISED: 22P02 / malformed array literal: "G6 list_course_group_summaries output columns are "
DO
== P5: messages that contain commas or quotes, as several guard lines do ==
psql:/tmp/verify-role6-guard-offline.sql:128: NOTICE: P5A_COMMA_IN_MESSAGE_RAISED: 22P02 / malformed array literal: "G11 default privilege posture captured (no assertion, no change): {}"
DO
psql:/tmp/verify-role6-guard-offline.sql:139: NOTICE: P5B_QUOTED_MESSAGE_RAISED: 22P02 / malformed array literal: "G3 helper search_path pin is not empty; "
DO
psql:/tmp/verify-role6-guard-offline.sql:152: NOTICE: P5C_RAISED: 22P02 / malformed array literal: "G7 the two-argument create_group_and_invite still "
DO
== P6: what the final mismatch message would report after a comma-bearing entry ==
psql:/tmp/verify-role6-guard-offline.sql:166: NOTICE: P6_RAISED: 22P02 / malformed array literal: "G2 public.academic_terms missing"
DO

## End-to-end execution of the guard file as drafted

```text
== E2E: guard file executed with the Test ref pinned, on an empty local database ==
SET
psql:/tmp/guard-e2e.sql:609: ERROR:  syntax error at or near "||"
LINE 506:     || 'failure for target "%". G4 pinning and the applicati...
              ^
```

`LINE 506` is relative to the `do $capacity_guard$` statement, which starts at guard line 100, so the failing token is guard line 605: the final `raise notice` concatenates string literals with `||`. In PL/pgSQL the RAISE format must be a string constant, not an expression, so the block fails to compile and no check runs.

## OUT-parameter semantics with the documented columns

```text
NOTICE:  FUNC demo_all_in OUT_NAMES=<null> PROARGMODES_IS_NULL=t
NOTICE:  FUNC demo_shape  OUT_NAMES={p_post_id,p_group_id,p_subject} PROARGMODES_IS_NULL=f
NOTICE:  FUNC demo_tbl    OUT_NAMES={q_id,q_name} PROARGMODES_IS_NULL=f
```

So `unnest(p.proargnames, p.proargmodes)` does return OUT and TABLE names in order, which supports the rename fix, but `proargmodes` is null for an all-`IN` function, so the guard must keep its existing null-as-mismatch handling rather than reading a null aggregate as an empty shape.

## `to_regfunction(text)` does not exist on this engine

Captured by the local server log during the same session (`/tmp/pg-server.log`, 11:52:42 UTC):

```text
ERROR:  function to_regfunction(unknown) does not exist at character 65
HINT:  No function matches the given name and argument types. You might need to add explicit type casts.
STATEMENT:  select to_regclass('public.demo_shape') is null as regclass_ok, to_regfunction('now()') is not null as regfunc_noargs, to_regfunction('array_append(text[],text)') is not null as regfunc_args
```

The guard file uses `to_regfunction(` at 19 call sites (G3, G5, G6 lookups, G7, G8, G10). `to_regclass(text)` is documented and worked in the same session. The documented text-to-`regprocedure` lookup is `to_regprocedure(text)`; whether any `to_regfunction` overload exists depends on the target's major version and must be confirmed against the actual Test engine during the separately authorized preflight, not assumed.

## Evidence-class boundary and cleanup

Local, disposable PostgreSQL 16.15 in the coordinator sandbox, initialised and started by this task with `initdb -A trust` and a unix socket only (`listen_addresses=''`, so no TCP listener), then stopped with `-m fast` and its data/socket directories deleted. The Supabase Test and Main projects were never contacted, and no project credentials were read, printed or used. These results prove the draft does not compile or execute on one real PostgreSQL parser; they do not certify behaviour on the actual Test target, whose major version this task has not verified, and they grant no migration, preflight, QA, merge or release approval.
