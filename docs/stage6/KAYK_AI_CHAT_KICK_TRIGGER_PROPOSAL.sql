-- CityLink — one-shot kick for group AI requests.
--
-- Adam, 2026-11-25: after `begin_group_ai_request` succeeds, a backend event must
-- trigger `group-ai-executor` immediately, once, best-effort. No pg_cron, no
-- per-minute sweep, no polling, no automatic retry. A failed kick must never undo
-- the request that was already created.
--
-- Why a trigger and not a scheduler: the event we care about is the insert that
-- `begin_group_ai_request` performs. An AFTER INSERT trigger is exactly that event,
-- it fires once per request, and it cannot fire for a request that was rolled back.
--
-- Why pg_net: a trigger cannot make an HTTP call without an extension. pg_net is
-- asynchronous — it queues the request and returns — so the insert commits without
-- waiting for the function, and a slow or dead function cannot delay a student.
--
-- Secret handling: the bearer token is read from Vault at run time, so it appears in
-- neither this file nor `cron.job` nor any log. `net.http_request_queue` holds it for
-- the seconds before delivery; the only roles that can read that queue can already
-- read Vault, so this does not widen who can see the key.
--
-- Draft. Not applied. Requires Adam's authorisation naming this file's sha256, after
-- Role 6 review, and requires the `pg_net` extension to exist on the target.

begin;

create or replace function private.kick_group_ai_executor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $kick$
declare
  v_key text;
  v_url constant text :=
    'https://pijslbchvstkoweslymr.supabase.co/functions/v1/group-ai-executor';
begin
  -- Everything below is best-effort. The request row is already written by the
  -- time this runs, and an exception here would abort the transaction that created
  -- it — exactly the rollback Adam ruled out. So the whole body is guarded.
  begin
    select s.decrypted_secret
      into v_key
      from vault.decrypted_secrets s
     where s.name = 'group_ai_executor_key';

    if v_key is null or btrim(v_key) = '' then
      -- No secret means no kick. The request stays queued and visible as such;
      -- it is not silently marked failed and it is not retried.
      raise warning 'group_ai_kick_no_secret request=%', new.id;
      return null;
    end if;

    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('request_id', new.id, 'group_id', new.group_id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      timeout_milliseconds := 10000
    );
  exception
    when others then
      -- One attempt. No loop, no retry, no re-raise.
      raise warning 'group_ai_kick_failed request=% sqlstate=% message=%',
        new.id, sqlstate, sqlerrm;
  end;

  return null;
end;
$kick$;

comment on function private.kick_group_ai_executor() is
  'AFTER INSERT kick for group_ai_requests. One HTTP attempt per request, best effort, never aborts the insert.';

revoke all on function private.kick_group_ai_executor() from public;
revoke all on function private.kick_group_ai_executor() from anon;
revoke all on function private.kick_group_ai_executor() from authenticated;

drop trigger if exists group_ai_requests_kick on public.group_ai_requests;

create trigger group_ai_requests_kick
after insert on public.group_ai_requests
for each row
when (new.status = 'queued')
execute function private.kick_group_ai_executor();

commit;
