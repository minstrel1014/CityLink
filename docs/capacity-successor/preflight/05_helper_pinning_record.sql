-- =============================================================================
-- CityLink capacity successor — preflight page 05: helper pinning record (G4)
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. SELECT-only observation page. Not a migration, not
-- authorization, raises nothing.
--
-- Purpose: produce the record that turns the retired guard's unpinned G4 check
-- into a stated, repeatable measurement. It is the instrument Adam authorized
-- one read-only Test dry run to run. Requires PostgreSQL 15 or newer because it
-- uses sha256(bytea); the gate's target major is 17.
--
-- -----------------------------------------------------------------------------
-- PUBLISHED NORMALIZATION CONTRACT — read this before comparing any digest
-- -----------------------------------------------------------------------------
-- Input scope : pg_get_functiondef(<helper oid>) — the LIVE object as this
--               engine renders it. Never a checked-in file, never a fragment of
--               a file, so a file byte digest is not comparable to these values.
-- Rule 1      : strip every line comment: regexp_replace(src, '--.*', '', 'gn').
--               The 'n' flag is what stops the dot at a newline; it is
--               mandatory here, not cosmetic.
--               MEASURED ON 17.12, and the reshape's own new finding:
--               PostgreSQL lets '.' match a newline by default, so under plain
--               'g' the first '--' in a body silently removes everything after
--               it from the hashed input — a digest that is stable,
--               reproducible and wrong. Under 'gn' a body carrying one comment
--               line normalizes to exactly the same string as the same body
--               written without the comment, which is the behaviour a pin needs.
--               Documented limitation: a body that contains the two-character
--               sequence '--' inside a string literal would be truncated by this
--               rule. Neither helper does, and a reviewer who changes one should
--               expect the digest to move.
-- Rule 2      : collapse every whitespace run to one space:
--               regexp_replace(x, '[[:space:]]+', ' ', 'g'). Indentation,
--               line breaks and trailing spaces therefore cannot trip the pin.
-- Rule 3      : delete spaces adjacent to ( ) , and ;:
--               regexp_replace(x, ' *([(),;]) *', '\1', 'g'). Token content is
--               untouched; only spacing around those four characters is dropped.
-- Rule 4      : fold ASCII case with lower(). Quoting style is NOT normalized:
--               pg_get_functiondef decides whether an identifier is quoted, so a
--               rename that changes quoting legitimately moves the digest.
-- Rule 5      : trim both ends with btrim(). Comment removal and whitespace
--               collapse can leave a single leading or trailing space; without
--               this rule two bodies that differ only by a comment still hash
--               apart. Rules are applied in the order 1, 2, 3, 4, 5.
-- Retained    : the 'CREATE OR REPLACE FUNCTION' header, the dollar-quote tag,
--               the LANGUAGE / VOLATILITY / SECURITY / SET clauses the engine
--               prints, and the trailing semicolon.
-- Digest      : encode(sha256(convert_to(<normalized>, 'utf8')), 'hex').
-- Comparison  : observed hex against the value the operator pins in
--               citylink.capacity_pinned_digests as
--               '<browse hex>,<manage hex>'. No marker, a malformed marker, or a
--               non-64-hex field all report UNPINNED, never PASS. A mismatch
--               reports FAIL.
-- Empty search_path : handled by the contract in page 01 (split each proconfig
--               entry at its first '=' and strip quoting), never by comparing a
--               rendering to a hard-coded literal.
-- -----------------------------------------------------------------------------
--
-- Stability rule: run this page twice in the session. Identical observed values
-- are the expected outcome; any movement is a finding about the target or the
-- recipe, and is the reason the record captures engine, locale, encoding,
-- identity and input scope next to the digests.
--
-- SAFE TO RUN TWICE. Reads catalog only; no application row, no secret.
-- =============================================================================

with helpers(ordinal, sig, slot) as (
  values
    (1, 'private.can_browse_current_term_group(uuid)', 1),
    (2, 'private.can_manage_recruitment_post(uuid)', 2)
),
pin(raw) as (
  select btrim(coalesce(current_setting('citylink.capacity_pinned_digests', true), ''))
),
norm(ordinal, sig, slot, fid, src, nrm) as (
  select h.ordinal, h.sig, h.slot, p.oid,
         coalesce(pg_get_functiondef(p.oid), ''),
         btrim(
           lower(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   coalesce(pg_get_functiondef(p.oid), ''),
                   '--.*', '', 'gn'),
                 '[[:space:]]+', ' ', 'g'),
               ' *([(),;]) *', '\1', 'g')
           )
         )
    from helpers h
    left join pg_proc p on p.oid = to_regprocedure(h.sig)
),
cfg(fid, rendered, sp_present, sp_norm) as (
  select n.fid, c.rendered, c.sp_present, c.sp_norm
    from (select distinct fid from norm) n
    left join pg_proc p on p.oid = n.fid
    cross join lateral (
      select coalesce(string_agg(e, ',' order by e), '<none>') as rendered,
             coalesce(bool_or(split_part(e, '=', 1) = 'search_path'), false) as sp_present,
             max(case when split_part(e, '=', 1) = 'search_path'
                      then btrim(replace(replace(substr(e, position('=' in e) + 1),
                              '"', ''), '''', ''))
                 end) as sp_norm
        from unnest(coalesce(p.proconfig, array[]::text[])) as e
    ) c
)
select '05' as page, 'P-ENG-01' as check_id,
       'engine identity (pinning record field)' as subject,
       '17 on the authorized target' as expected,
       current_setting('server_version') || ' (major '
       || split_part(current_setting('server_version'), '.', 1) || ')' as observed,
       case when split_part(current_setting('server_version'), '.', 1) = '17'
            then 'PASS' else 'FAIL' end as verdict

union all
select '05', 'P-LOC-02', 'collation and ctype (pinning record fields)',
       'recorded verbatim',
       coalesce((select d.datcollate || ' | ' || d.datctype from pg_database d
                  where d.datname = current_database()), '<unreadable>'), 'CAPTURE'

union all
select '05', 'P-ENC-03', 'database encoding (pinning record field)',
       'recorded verbatim; convert_to(...,''utf8'') assumes UTF-8',
       coalesce((select pg_encoding_to_char(d.encoding) from pg_database d
                  where d.datname = current_database()), '<unreadable>'), 'CAPTURE'

union all
select '05', 'P-IDT-04', 'target identity fields',
       'recorded verbatim; never a connection string or key',
       'database=' || current_database() || ' session_user=' || session_user::text
       || ' current_user=' || current_user::text, 'CAPTURE'

union all
select '05', 'P-IDT-05', 'session search_path rendering (capture, never compared)',
       'recorded verbatim', coalesce(current_setting('search_path', true), '<unset>'),
       'CAPTURE'

union all
select '05', 'P-RCP-06', 'normalization contract identity',
       'the five rules published in this file header, in this order',
       'strip ''--.*'' flags gn → collapse [[:space:]]+ → drop spaces around '
       || '( ) , ; → lower() → btrim(); digest=encode(sha256(convert_to('
       || 'normalized,''utf8'')),''hex'')', 'CAPTURE'

union all
select '05', 'P-RCP-07', 'input scope declaration',
       'pg_get_functiondef of the live object, per helper',
       'checked-in file bytes are NOT hashed here and are not comparable', 'CAPTURE'

union all
select '05', 'P-H' || n.ordinal || '-OID',
       'helper identity ' || n.sig,
       'resolves to exactly one live function',
       coalesce(n.fid::text || ' = ' || n.sig, '<absent>'),
       case when n.fid is null then 'FAIL' else 'CAPTURE' end
  from norm n

union all
select '05', 'P-H' || n.ordinal || '-LEN', 'helper source length ' || n.sig,
       'recorded verbatim (pinning record field)',
       'pg_get_functiondef chars=' || length(n.src)::text
       || ' octets=' || octet_length(n.src)::text
       || ' normalized chars=' || length(n.nrm)::text
       || ' normalized octets=' || octet_length(n.nrm)::text, 'CAPTURE'
  from norm n

union all
select '05', 'P-H' || n.ordinal || '-DIG', 'normalized body digest ' || n.sig,
       case
         when p.raw = '' then 'UNPINNED — no expected digest declared'
         when length(btrim(split_part(p.raw, ',', n.slot))) <> 64
           or btrim(split_part(p.raw, ',', n.slot)) !~ '^[0-9a-f]{64}$'
           then 'UNPINNED — malformed pin field ' || n.slot
         else btrim(split_part(p.raw, ',', n.slot))
       end,
       coalesce(encode(sha256(convert_to(n.nrm, 'utf8')), 'hex'), '<not evaluable>'),
       case
         when n.fid is null then 'FAIL'
         when p.raw = '' then 'UNPINNED'
         when length(btrim(split_part(p.raw, ',', n.slot))) <> 64
           or btrim(split_part(p.raw, ',', n.slot)) !~ '^[0-9a-f]{64}$'
           then 'UNPINNED'
         when btrim(split_part(p.raw, ',', n.slot))
           = encode(sha256(convert_to(n.nrm, 'utf8')), 'hex') then 'PASS'
         else 'FAIL'
       end
  from norm n
  cross join pin p

union all
select '05', 'P-H' || n.ordinal || '-CFG', 'proconfig rendering ' || n.sig,
       'search_path entry present and normalizing to empty (rule in page 01)',
       'entries=' || coalesce(c.rendered, '<none>') || ' normalized='
       || coalesce(nullif(c.sp_norm, ''), '<empty>'),
       case when n.fid is null then 'FAIL'
            when not coalesce(c.sp_present, false) then 'FAIL'
            when coalesce(c.sp_norm, '') = '' then 'PASS' else 'FAIL' end
  from norm n
  left join cfg c on c.fid is not distinct from n.fid

union all
select '05', 'P-H' || n.ordinal || '-ACL', 'privilege set ' || n.sig,
       'recorded verbatim; effective posture restated per role',
       'acl=' || coalesce((select p.proacl::text from pg_proc p where p.oid = n.fid),
                          '<default>')
       || ' anon=' || coalesce(has_function_privilege('anon', n.fid, 'execute')::text, '<n/a>')
       || ' authenticated='
       || coalesce(has_function_privilege('authenticated', n.fid, 'execute')::text, '<n/a>')
       || ' service_role='
       || coalesce(has_function_privilege('service_role', n.fid, 'execute')::text, '<n/a>'),
       'CAPTURE'
  from norm n

 order by check_id
 limit 40;
