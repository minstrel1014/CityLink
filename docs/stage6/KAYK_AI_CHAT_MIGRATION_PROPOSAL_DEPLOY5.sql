-- CityLink — group AI chat, deploy 5 (PROPOSAL, NOT APPLIED): hand the executor the
-- object keys it needs to read a file's bytes.
--
-- Status. Proposal only. Not applied to any Supabase project, not promoted to
-- `supabase/migrations/`, not deployed. It needs, in this order:
--   1. Role 6 exact-head review of the blob recorded in this file's own SHA;
--   2. Adam's dated written authorization in `docs/team/DECISIONS.md`, naming the
--      ref, the blob OID, the line count and the SHA-256;
--   3. a Launch preflight in the same window as the apply.
-- Applying it without those is out of scope for the Kayk task, which has no
-- database connection at all in this round.
--
-- Why this exists. `begin_group_ai_request` stores the selected files as
-- `{id, name}` (deploy 2, section 4), and `claim_next_group_ai_request` returns
-- that column unchanged (deploy 3). So the Edge Function worker knows *which*
-- files the student picked but not *where* their bytes are, and
-- `public.group_files` is `revoke all … from public, anon, authenticated,
-- service_role` (P1, line 282) — deliberately. The worker therefore had no legal
-- way to fetch a file, which is one of the two reasons Adam's PDF was answered
-- with 「部分選取檔案沒有可讀文字」 on 2026-11-25; the other is the executor's old
-- text-only MIME gate, fixed in application code the same day
-- (`supabase/functions/group-ai-executor/extraction.ts`).
--
-- What this changes. One function, `public.claim_next_group_ai_request()`, same
-- signature, same columns, same locking and ordering, plus a `files` payload whose
-- objects carry a third key `objectKey`. Nothing else: no table, no grant on a
-- table, no RLS policy, no column, no data, no client-visible shape.
--
-- Who can see the new field. Only `service_role`. `claim_next_group_ai_request` is
-- revoked from `public`, `anon`, `authenticated` and `service_role` and then
-- granted to `service_role` alone, so this payload never reaches a browser and is
-- not part of any old-client read contract. `begin_group_ai_request`'s own return
-- value — which *is* client-visible — is untouched, which is exactly why the
-- enrichment happens at claim time rather than at queue time.
--
-- Fail-closed rules inside the payload. Each is asserted by this file, not
-- inherited from another one.
--   * `objectKey` is null unless the row is `status = 'current'`,
--     `deleted_at is null`, and `retention_expires_at > now()`. A file that
--     stopped being current between the question and the claim is not read, even
--     though the bytes are still in the bucket. Retention is 5 months of academic
--     term (Adam, 2026-11-23) and the worker must not extend it by one request.
--   * A key is only ever given for a row belonging to *this request's own group*:
--     the join carries `g.group_id = c.group_id`. `begin_group_ai_request` already
--     refuses a foreign file id (deploy 2 lines 286-301, `group_ai_file_not_eligible`
--     45N04), so on any legitimate row this predicate changes nothing — which is
--     exactly why it is free to state. Without it, containment would hold only as
--     long as nobody ever writes `files` another way (a backfill, a support script,
--     a test fixture), and the product rule is absolute: 「AI 只分析目前群組上傳的
--     檔案，不得跨群組讀取」.
--   * A missing or malformed `files` element cannot stall the queue: the join
--     compares `g.id::text` with the payload string instead of casting, so a bad
--     element yields `objectKey = null` rather than an exception, and
--     `jsonb_typeof` guards the expansion itself.
--   * When the whole column is not an array, the outer `coalesce` hands back the
--     stored value unchanged (`c.files`) — not an empty array. A payload this
--     function did not write is passed through rather than silently emptied, and the
--     executor tolerates a null or non-array `files` (extraction.ts line 56 and the
--     null-key path at 117/121). The `else '[]'::jsonb` inside `jsonb_array_elements`
--     only stops the expansion itself from throwing.
--   * The `name` and `id` already in the payload are kept as they were when the
--     element has them, so a replaced or deleted file still appears in the array.
--     It has to: the executor counts `files_used < files_requested` to decide
--     whether to warn the group, and dropping the element would hide the warning.
--
-- Alternatives considered and not taken.
--   * Derive the key in the worker as `'groups/' || group_id || '/' || file_id`.
--     Rejected. That string is an implementation detail of the upload RPCs, and
--     every path that hands a key out today passes
--     `private.can_access_group_files` first; re-deriving it would skip that
--     audit trail and break the day the naming changes.
--   * Give the worker a second RPC, e.g. `get_group_ai_request_file_keys(uuid)`.
--     Rejected as an extra service-role surface for no gain: the claim already
--     returns the file list, and one round trip fewer is one fewer window where
--     the row says `processing` but nothing is running.
--   * Let the executor use PR #66's signer. Still supported by the code and still
--     the preferred route once that endpoint has a service-role path; it is not a
--     substitute for this migration, because that endpoint cannot answer
--     "where are this request's files" either.
--
-- SQLSTATE registration. None. This file raises nothing, so it registers no code;
-- the 45N0x and 45M0x families stay as deploy 1–4 left them.
--
-- Rollback. Re-create the deploy 3 body verbatim
-- (`supabase/migrations/20261125025624_kayk_ai_chat_deploy3.sql`) in one
-- transaction; the payload then goes back to `{id, name}`, and attached files then
-- cannot be read at all: `FILE_SIGNER_URL`'s signer offers no service-role route —
-- read from the deployed bytes of `group-file-signer` on Launch on 2026-11-26, its
-- own header states 「No service-role key is used anywhere. Every database call
-- carries the caller's own JWT」, so a worker key gets 401, and a re-check against
-- PR #66's current head is owed at apply time. Rollback therefore returns to
-- 「部分選取檔案沒有可讀文字」, which is a legitimate outcome but is not an
-- alternative reader. No stored data is affected in either direction, because
-- `group_ai_requests.files` itself is never rewritten.

begin;

-- Section 0: target guard. Proves history, not identity; the identity check is
-- the operator's `pg_control_system()` read before the window.
select private.assert_citylink_target('pijslbchvstkoweslymr');

-- Section 1: the claim, plus where the bytes are.
create or replace function public.claim_next_group_ai_request()
returns table (
  id uuid,
  group_id uuid,
  question text,
  turns jsonb,
  files jsonb,
  chat_chars integer,
  file_chars integer,
  files_used integer,
  dropped_context boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Oldest first, deterministic tie-break on id. `for update skip locked` keeps
  -- two concurrent workers from claiming the same row; the loser simply sees the
  -- next one, or nothing. Unchanged from deploy 3.
  return query
  with picked as (
    select q.id
      from public.group_ai_requests q
     where q.status = 'queued'
     order by q.created_at, q.id
     limit 1
     for update skip locked
    ),
    claimed as (
      update public.group_ai_requests q
         set status = 'processing',
             claimed_at = now()
        from picked
       where q.id = picked.id
      returning q.id,
                q.group_id,
                q.question,
                q.turns,
                q.files,
                q.chat_chars,
                q.file_chars,
                q.files_used,
                q.dropped_context
    )
  select c.id,
         c.group_id,
         c.question,
         c.turns,
         -- Keep the queue's own order, and keep every element the student
         -- selected, including one whose key cannot be given.
         coalesce(
           (
             select jsonb_agg(
                      jsonb_build_object(
                        'id', coalesce(elem.value ->> 'id', g.id::text),
                        'name', coalesce(elem.value ->> 'name', g.original_name),
                        'objectKey', case
                          when g.id is not null
                           and g.status = 'current'
                           and g.deleted_at is null
                           and g.retention_expires_at > now()
                          then g.object_key
                        end
                      )
                      order by elem.ordinality
                    )
               from jsonb_array_elements(
                      case
                        when jsonb_typeof(c.files) = 'array' then c.files
                        else '[]'::jsonb
                      end
                    ) with ordinality as elem(value, ordinality)
               left join public.group_files g
                 on g.id::text = elem.value ->> 'id'
                and g.group_id = c.group_id
           ),
           c.files
         ) as files,
         c.chat_chars,
         c.file_chars,
         c.files_used,
         c.dropped_context
    from claimed as c;
end;
$function$;

-- Same house pattern as every other function in this pair: revoke from every
-- named role first (Supabase's default privileges would otherwise grant them),
-- then grant to exactly one. Identical to deploy 3, so the privilege state after
-- this file is the privilege state before it.
revoke all on function public.claim_next_group_ai_request()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_next_group_ai_request() to service_role;

commit;

-- Post-apply verification, in order. Recorded, not assumed.
--   1. Bytes match the approved file, per function:
--        select md5(prosrc) from pg_proc
--         where proname = 'claim_next_group_ai_request';
--      compare against the `$function$` body above, transferred as a file rather
--      than pasted (P1 lost blank lines that way and needed a create-or-replace).
--   2. Privileges are still one role deep:
--        select has_function_privilege('service_role',
--               'public.claim_next_group_ai_request()', 'execute') as sr,
--               has_function_privilege('authenticated',
--               'public.claim_next_group_ai_request()', 'execute') as au,
--               has_function_privilege('anon',
--               'public.claim_next_group_ai_request()', 'execute') as an;
--      expected true, false, false.
--   3. The enrichment can still see what it reads. Two properties the privilege
--      triple cannot detect: the body reads `public.group_files` **as its owner**
--      (P1 revoked that table from `public, anon, authenticated, service_role`, so
--      only a `rolbypassrls` owner reaches it), and plpgsql resolves relation and
--      column names at **first execution**, with no `plpgsql_check` in this project.
--      A renamed column or a replaced table can therefore give a clean apply and
--      then a null `objectKey` on every row with no error anywhere — the silent
--      failure mode. Three inert probes:
--        select proowner::regrole, prosecdef
--          from pg_proc where proname = 'claim_next_group_ai_request';
--      expected owner `postgres` (the role gate 4 measured as `rolsuper=false,
--      rolbypassrls=true`) and prosecdef true; a different owner means the key stays
--      null, so stop rather than re-create it as another role. Then:
--        select to_regclass('public.group_files') is not null as table_present;
--      expected true. Then a column probe that resolves every name the body uses and
--      touches no row:
--        select g.id::text, g.status, g.deleted_at, g.retention_expires_at,
--               g.object_key, g.original_name
--          from public.group_files g limit 0;
--      expected: zero rows, no error. `limit 0` does not execute a volatile
--      set-returning function, so it claims nothing (Role 6 measured this on
--      PostgreSQL 17.12 on 2026-11-25, which is also why step 4 proves the signature
--      only, never the body).
--   4. Shape, with no row to claim:
--        select * from public.claim_next_group_ai_request() limit 0;
--      must return the same nine columns in the same order.
--   5. Behaviour is Eunice's, signed in, **on Launch `pijslbchvstkoweslymr`, using
--      disposable accounts created for the test** — since F14 there is no writable
--      Test project; `wkzclgmhrtecnpexfesr` is the frozen Prototype and the gate
--      refuses it with 45003. `docs/team/DB_TARGETS.md` governs. After
--      Adam authorises it: queue a question with one PDF attached, claim it as the
--      worker, and expect `files[0].objectKey` to name the stored object. Then the
--      full acceptance shape: `files_used = 1`, `file_chars > 0`, and no
--      「部分選取檔案沒有可讀文字」 on an answer that plainly quotes the file.
