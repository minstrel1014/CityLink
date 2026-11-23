# F9 — what a Launch run must capture to pin `P-H1-DIG` and `P-H2-DIG`

Status: **prepared, not produced.** This document contains no digest value. No
Supabase project was contacted for it, nothing was executed against Launch or the
Prototype, and every number that appears anywhere in this package today remains
unfit to serve as the Launch pin. What follows is the capture specification: what
to record, how, when a record is still valid, and what makes it stale.

## 1. Why the pin is still `UNPINNED`

`P-H1-DIG` and `P-H2-DIG` (page 05) compare the target's own
`pg_get_functiondef` digest against an operator-declared pin. While no pin is
declared, both rows read `UNPINNED — no expected digest declared`, and wrapper
token 45007 keeps the gate shut. That is the correct state: a digest assertion
without a pinned value asserts nothing, and a digest captured on the wrong target
asserts something false.

F9 was the finding that the pinned values were not reproducible from the
repository. The fix is not to lower the assertion; it is to capture the value once,
on the target that will be applied to, with the published recipe, and record it.

## 2. The two helpers, and what must be captured for each

`P-H1` is the browse helper `private.can_browse_current_term_group`. `P-H2` is the
manage helper `private.can_manage_recruitment_post`. For each, the run must record
six things — the five fields the checklist already names, plus the run id that ties
them to the target-identity evidence:

| Field      | What it is                                                    | Why it is needed                                                                                                                       |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `P-Hn-OID` | `pg_proc.oid`                                                 | ties the digest to one physical function; a re-created helper gets a new OID even when the text matches                                |
| `P-Hn-LEN` | `length()` and `octet_length()` of `pg_get_functiondef`       | a digest cannot be sanity-checked without the size of its input                                                                        |
| `P-Hn-DIG` | the normalized digest, 64 lowercase hex characters, verbatim  | the pin itself                                                                                                                         |
| `P-Hn-CFG` | `proconfig` verdict — is `search_path` empty?                 | the helpers are `security definer`; an empty `search_path` is part of what makes them safe, and a `SET` clause also changes the digest |
| `P-Hn-ACL` | `proacl` as stored (or "default" when null)                   | records who may execute, without interpreting it as security authority                                                                 |
| run id     | the same id as page 00 rows `C-MRK-13`, `C-DB-03`, `C-USR-04` | a digest is only evidence when the target that answered is evidenced                                                                   |

## 3. The exact queries

All five are SELECT-only. None writes, none sets a GUC, none creates anything. Run
them in the same session as page 00 so the run id applies to all of it.

**Q1 — identity and posture, one row per helper.**

```sql
select p.proname,
       p.oid                                   as helper_oid,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_function_result(p.oid)           as result,
       pg_get_userbyid(p.proowner)             as owner,
       p.prosecdef                             as security_definer,
       p.proconfig                             as proconfig,
       p.proacl                                as proacl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'private'
   and p.proname in ('can_browse_current_term_group', 'can_manage_recruitment_post')
 order by 1
 limit 10;
```

Two rows expected. Zero rows for a helper means it is absent: the pin cannot be
produced, and the row is a CAPTURE failure, not a pass.

**Q2 — the digest, with the published recipe, in the published order.**

```sql
with helper as (
  select p.proname, pg_get_functiondef(p.oid) as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('can_browse_current_term_group', 'can_manage_recruitment_post')
),
norm as (
  select proname,
         src,
         btrim(
           lower(
             regexp_replace(
               regexp_replace(
                 regexp_replace(src, '--.*', '', 'gn'),
                 '[[:space:]]+', ' ', 'g'),
               ' *([(),;]) *', '\1', 'g'))) as normalized
    from helper
)
select proname,
       length(src) as source_chars,
       octet_length(src) as source_octets,
       length(normalized) as normalized_chars,
       encode(sha256(convert_to(normalized, 'utf8')), 'hex') as digest
  from norm
 order by 1
 limit 10;
```

The digest input must be exactly the five rules applied in order to
`pg_get_functiondef(p.oid)`:

1. `regexp_replace(src, '--.*', '', 'gn')` — the `n` flag is mandatory; without it
   the first `--` inside the body swallows the rest of the text and produces a
   stable, reproducible, wrong digest (F12).
2. `regexp_replace(x, '[[:space:]]+', ' ', 'g')`.
3. `regexp_replace(x, ' *([(),;]) *', '\1', 'g')`.
4. `lower(x)`.
5. `btrim(x)`.

Then `encode(sha256(convert_to(x, 'utf8')), 'hex')`.

**Q3 — stability across two executions.** Run Q2 twice in the same session. The two
digests must be identical for each helper; record both, not just the second. A
difference between two consecutive executions of the same query against the same
function is a finding in its own right and stops the pin.

**Q4 — engine and session context.**

```sql
select version() as engine,
       current_database() as database,
       current_user as session_user,
       current_setting('search_path') as session_search_path,
       pg_encoding_to_char(encoding) as encoding,
       datcollate, datctype
  from pg_database
 where datname = current_database()
 limit 1;
```

The engine major must be 17. A different major may render `pg_get_functiondef`
differently and therefore digest differently for identical SQL.

**Q5 — declared target ref.** The pin is only valid for the target it was captured
on. Record the declared ref the run was executed under (the same operator-declared
`citylink.capacity_target_ref` page 01 and the wrapper read), and remember that the
ref is operator-typed, not proof of which database answered — which is what the
page 00 marker rows under the same run id are for.

**These queries were executed, once, against stand-ins.** On a disposable local
17.12 cluster with two fixture functions in a `private` schema, Q1 returned both
rows with `security_definer = t`, `proconfig = {"search_path=\"\""}` and a null
`proacl`; Q2 returned one 64-hex digest per helper and returned the same two
digests on a second execution; and a whitespace-and-comment-only re-creation of one
helper left its digest unchanged. That is a check that the queries run and that the
recipe behaves as published. The fixture digests are deliberately not reproduced
here, because a digest of a fixture function is exactly the kind of value that gets
copied into a pin by accident.

## 4. When a capture is valid

All of the following must hold, or the value is not a pin:

- it was executed against `pijslbchvstkoweslymr` (CityLink Launch) by an operator
  authorised for that read, not against the frozen Prototype and not locally;
- it is tied to a run id whose page 00 marker rows identify the same target;
- both helpers returned exactly one row each, and both digests are 64 lowercase
  hex characters, recorded verbatim — never rounded, shortened or "cleaned up";
- `proconfig` shows an empty `search_path` for both helpers, so `P-H1-CFG` and
  `P-H2-CFG` can read PASS rather than being inferred;
- the two executions in Q3 agreed;
- the engine major is 17;
- the recipe used is the five rules above, in that order, with the `gn` flags.

A capture that fails any of these is a CAPTURE record, not a pin. Page 05 is
designed to report exactly that distinction: `UNPINNED`/CAPTURE when the target
state is unknown, never PASS.

## 5. What invalidates a recorded pin

| Event                                                                                    | Effect                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| any `create or replace` of either helper that changes a token                            | digest changes — this is the pin working as intended                                   |
| a change to comments, indentation, line breaks, keyword case, or spaces around `( ) , ;` | digest does **not** change; the pin correctly stays valid                              |
| a change of argument **names**                                                           | digest changes — names are part of `pg_get_functiondef`                                |
| a changed return type, an added `SET` clause, a changed owner or `security definer` flag | digest and/or CFG change; re-capture required                                          |
| any change to the recipe (flags, rule order, added or removed rule)                      | **every** recorded digest is invalid; re-capture on the target                         |
| a different input scope (file bytes, `pg_dump` output, another engine major)             | not comparable; the pin is defined only over `pg_get_functiondef` on the target engine |
| a helper dropped and re-created                                                          | OID changes even if the text is identical — re-record OID and LEN                      |
| restoring the target from a dump                                                         | re-capture: dump/restore may re-render the definition                                  |

## 6. Where the values are recorded

- **Checklist §2** is the record of authority: `P-H1-OID`, `P-H1-LEN`, `P-H1-DIG`,
  `P-H1-CFG`, `P-H1-ACL` and the `P-H2` equivalents, each with the run id that
  produced it.
- **`citylink.capacity_pinned_digests`** is how the values reach an instrumented
  run: `<browse hex>,<manage hex>`, declared by the operator for that session and
  checked by page 00 `C-MRK-16`. The declaration is a copy of the §2 record; it
  must cite the same run id, and a declared value that does not match §2 is a
  finding, not a preference.
- **The page 05 output** is the measurement itself: it prints the observed digest
  and the verdict against the declared pin, so the record and the check stay in one
  place.

## 7. What must not be promoted to a Launch pin

- **any value produced by a local disposable cluster**, including the digests this
  package's own 17.12 runs computed for their fixtures — a local cluster is a logic
  test, not the Launch catalog;
- **any value captured on the frozen Prototype** `wkzclgmhrtecnpexfesr` — the
  Prototype is out of scope and its helpers are not Launch's helpers;
- **the canonical digests recorded in the coordinator's metadata parity report** —
  they are the coordinator's normalisation, useful as an _expectation to reproduce_,
  but a pin must come from the run that will be held to it. If a Launch capture
  reproduces the recorded canonical value exactly, that agreement is evidence and
  should be stated; if it differs, the difference is a finding to explain, never a
  rounding error to absorb;
- **any digest computed over file text, `pg_dump` output or a checked-in migration**
  — different input scope, different family, not comparable.

## 8. What this document is not

It is not a pin, not a capture, and not authorisation to run one. It runs nothing
and contacts nothing. The capture it describes is a read-only Launch run that
requires its own authorisation, and until that run happens both rows stay
`UNPINNED` and 45007 keeps the gate closed.
