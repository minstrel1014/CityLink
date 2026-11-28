-- CityLink — group AI chat, deploy 3: a service-role read path for the executor
--
-- Additive. Apply after deploy 1 and deploy 2. Changes no existing object.
--
-- Why this exists. `claim_group_ai_request(uuid)` returns only boolean, and
-- `public.group_ai_requests` is revoked from every role including `service_role`,
-- so a service-role worker can neither discover a queued request nor read the
-- question, turns and files it must send to the provider. This function claims
-- the oldest queued request and returns the row in one statement, so the worker
-- needs no table privilege and no second round trip.
--
-- `claim_group_ai_request` is left untouched for compatibility; nothing in this
-- file depends on it and nothing calls it.
--
-- Authorised by Adam on 2026-11-25 (option A of the three offered).

begin;

-- Section 0: target guard. Proves history, not identity; the identity check is
-- the operator's `pg_control_system()` read before the window.
select private.assert_citylink_target('pijslbchvstkoweslymr');

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
  -- next one, or nothing.
  return query
  with picked as (
    select q.id
      from public.group_ai_requests q
     where q.status = 'queued'
     order by q.created_at, q.id
     limit 1
     for update skip locked
  )
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
            q.dropped_context;
end;
$function$;

-- Same house pattern as every other function in this pair: revoke from every
-- named role first (Supabase's default privileges would otherwise grant them),
-- then grant to exactly one.
revoke all on function public.claim_next_group_ai_request()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_next_group_ai_request() to service_role;

commit;
