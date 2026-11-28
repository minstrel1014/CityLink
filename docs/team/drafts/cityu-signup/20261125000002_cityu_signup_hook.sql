-- CityLink — CityU-only registration policy, official Auth Hook instrument
-- DRAFT — NOT APPLIED. Role 6 reviewed packet bytes 2026-11-25 (approve with conditions);
-- this revision answers BLK-2, BLK-4, NB-1..NB-8 and has NOT yet been re-reviewed.
--
-- Approved direction (Adam, 2026-11-25):
--   1. instrument ......... Supabase Before User Created hook (this file)
--   2. scope .............. registration only; post-registration email changes are not guarded
--   3. test accounts ...... exact-email allowlist, one month; Adam decided 2026-11-25 that
--                           no rows are needed, so the mechanism ships EMPTY (documented non-use)
--   4. fallback ........... disable the hook in Dashboard -> Authentication -> Auth Hooks
--   5. message ............ the exact string in section 3
--
-- Why a hook rather than a trigger on auth.users:
--   * it returns {"error":{...,"http_code":400}} and the message reaches the client;
--   * it needs one GRANT EXECUTE, not TRIGGER privilege on auth.users;
--   * it is switched off in the dashboard, not by DROP TRIGGER, which the migration
--     role cannot execute (rehearsed: "must be owner of relation users").
-- Source: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
--
-- IMPORTANT — this SQL does not activate the policy.
--   Activation  = Dashboard -> Authentication -> Auth Hooks -> Before User Created
--                 -> public.hook_cityu_signup
--   Deactivation = remove or disable that hook in the same screen.
--
-- APPLY SHAPE (Role 6 NB-5): this file holds no transaction and is applied un-wrapped with
-- ON_ERROR_STOP=1. If a later assertion raises, the statements before it are already
-- committed — the assertion REPORTS the bad state, it does not prevent it. That is accepted
-- here because nothing in this file activates the hook and re-running converges.
--
-- EXECUTION ROUTE (Role 6 NB-6): the target assertion needs `set citylink.target_ref` in the
-- SAME session as the file. The realistic route is one connector `execute_sql` call carrying
-- the `set` plus the whole file; a per-statement connection would make section 0 raise 45010
-- and fail closed. The dated authorisation must name the route.
--
-- Target: CityLink Launch `pijslbchvstkoweslymr` only (docs/team/DB_TARGETS.md).
-- Never run against the frozen Prototype `wkzclgmhrtecnpexfesr`.

-- ---------------------------------------------------------------------------
-- 0. Target assertion
-- ---------------------------------------------------------------------------
do $target$
begin
  if current_setting('citylink.target_ref', true) is distinct from 'pijslbchvstkoweslymr' then
    raise exception
      'citylink_target_not_declared: run  set citylink.target_ref = ''pijslbchvstkoweslymr'';  in this session first'
      using errcode = '45010';
  end if;
end
$target$;

-- ---------------------------------------------------------------------------
-- 1. Predicate — one definition of the policy, no grants
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- NB-1 (Role 6, retracted 2026-11-25): btrim() with no second argument strips spaces only.
-- PostgreSQL gives no special treatment to a trailing newline (docs 9.7.3.7), so
-- 'x@my.cityu.edu.hk\n' cannot match the anchored pattern and is REJECTED — while
-- ' x@my.cityu.edu.hk ' is normalised and accepted. That is the better outcome, so the
-- spaces-only normalisation is kept deliberately. Rehearsed: newline false, padded true.
create or replace function private.is_cityu_signup_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    lower(btrim(p_email)) ~ '^[^@[:space:]]+@my[.]cityu[.]edu[.]hk$',
    false);
$fn$;

comment on function private.is_cityu_signup_email(text) is
  'CityLink registration policy: true only for an exact @my.cityu.edu.hk address.';

revoke all on function private.is_cityu_signup_email(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Time-boxed test-account allowlist
--    Exact addresses only — no domain wildcards, no permanent exception.
--    The expiry is enforced by the table constraint and checked at call time,
--    so the exception stops working on its own even if nobody remembers it.
--    Adam decided on 2026-11-25 that no rows are needed: this ships empty.
-- ---------------------------------------------------------------------------
create table if not exists private.signup_email_allowlist (
  email      text primary key,
  reason     text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint signup_email_allowlist_email_normalised
    check (email = lower(btrim(email, E' \t\n\r\f\v'))),
  constraint signup_email_allowlist_email_shape
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint signup_email_allowlist_expiry_ceiling
    check (expires_at <= timestamptz '2026-12-25 23:59:59+08'),
  constraint signup_email_allowlist_expiry_after_creation
    check (expires_at > created_at)
);

comment on table private.signup_email_allowlist is
  'Temporary exception for test accounts. Hard ceiling 2026-12-25 23:59:59+08; rows expire automatically. Ships empty (Adam, 2026-11-25).';

-- NB-3, stated decision rather than omission: RLS is deliberately NOT enabled here.
-- Access is controlled by privilege: browser roles have no USAGE on `private` and no
-- grants on this table. Enabling zero-policy RLS would make the SECURITY DEFINER read
-- fail on any target whose owner lacks BYPASSRLS, silently rejecting allowlisted
-- accounts — a failure that looks exactly like the policy working.

-- BLK-2: `create table if not exists` is a no-op on a pre-existing table, so a drifted or
-- hand-made table would install nothing and still report ready — the approved one-month
-- ceiling could silently not exist. Assert the delivered shape instead of assuming it.
do $shape$
declare
  v_missing text;
begin
  -- NF-8: render catalog text in a fixed zone so the ceiling pin is session-independent.
  perform set_config('TimeZone','UTC',true);
  select string_agg(c.conname, ', ')
    into v_missing
  from (values ('signup_email_allowlist_email_normalised'),
               ('signup_email_allowlist_email_shape'),
               ('signup_email_allowlist_expiry_ceiling'),
               ('signup_email_allowlist_expiry_after_creation')) as c(conname)
  where not exists (
    select 1 from pg_constraint pc
    where pc.conrelid = 'private.signup_email_allowlist'::regclass
      and pc.conname = c.conname
      and pc.convalidated
      -- NF-1: the ceiling constraint must actually carry the approved date.
      and (c.conname <> 'signup_email_allowlist_expiry_ceiling'
           or pg_get_constraintdef(pc.oid) like '%2026-12-25 15:59:59+00%')
  );

  if v_missing is not null then
    raise exception 'cityu_allowlist_constraint_missing: % (the one-month ceiling cannot be assumed)', v_missing
      using errcode = '45013';
  end if;
end
$shape$;

create or replace function private.is_allowlisted_signup_email(
  p_email text,
  p_at    timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select exists (
    select 1
    from private.signup_email_allowlist a
    where a.email = lower(btrim(p_email))
      and p_at < a.expires_at
  );
$fn$;

revoke all on function private.is_allowlisted_signup_email(text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on table private.signup_email_allowlist
  from public, anon, authenticated, service_role;

-- No rows are inserted here on purpose. Adam decided on 2026-11-25 that none are needed:
-- the hook only runs at creation, so existing accounts are never re-checked and keep
-- signing in without an exception. If a new non-CityU test account is ever needed before
-- 2026-12-25, it is a deliberate, separately reviewed insert, for example:
--
--   insert into private.signup_email_allowlist (email, reason, expires_at)
--   values ('qa.account@example.com', 'QA account, one-month exception',
--           timestamptz '2026-12-25 23:59:59+08')
--   on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Hook entry point
-- ---------------------------------------------------------------------------
create or replace function public.hook_cityu_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_email text;
begin
  v_email := event -> 'user' ->> 'email';

  if private.is_cityu_signup_email(v_email) then
    return '{}'::jsonb;                                   -- CityU address: allow
  end if;

  if private.is_allowlisted_signup_email(v_email) then
    return '{}'::jsonb;                                   -- live allowlist row: allow
  end if;

  return jsonb_build_object(                               -- reject, message reaches the client
    'error', jsonb_build_object(
      'http_code', 400,
      'message', 'Registration requires a CityU email address ending in @my.cityu.edu.hk.'
    )
  );
end;
$fn$;

comment on function public.hook_cityu_signup(jsonb) is
  'Supabase before_user_created hook: CityU addresses, plus unexpired exact-email allowlist rows (empty by decision).';

grant execute on function public.hook_cityu_signup(jsonb) to supabase_auth_admin;
revoke all on function public.hook_cityu_signup(jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Post-install verification
-- ---------------------------------------------------------------------------
-- NB-4: a named-role check cannot see a grant held by a role nobody thought of, and
-- `create or replace function` preserves an existing ACL. So enumerate grantees instead:
-- the only permitted non-owner EXECUTE holder on the hook is supabase_auth_admin, and the
-- two private functions must have no non-owner grantee at all.
do $verify$
declare
  v_leak text;
begin
  select string_agg(x.grantee_name || ':' || a.privilege_type, ', ' order by x.grantee_name)
    into v_leak
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  cross join lateral (select case when a.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(a.grantee) end) as x(grantee_name)
  where p.oid in (to_regprocedure('public.hook_cityu_signup(jsonb)'),
                  to_regprocedure('private.is_cityu_signup_email(text)'),
                  to_regprocedure('private.is_allowlisted_signup_email(text,timestamptz)'))
    and a.privilege_type = 'EXECUTE'
    and a.grantee <> p.proowner
    and not (p.proname = 'hook_cityu_signup' and x.grantee_name = 'supabase_auth_admin');

  if v_leak is not null then
    raise exception 'cityu_hook_grant_leak: unexpected EXECUTE grantee(s): %', v_leak
      using errcode = '45011';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'public.hook_cityu_signup(jsonb)', 'EXECUTE') then
    raise exception 'cityu_hook_grant_missing: supabase_auth_admin cannot execute the hook'
      using errcode = '45012';
  end if;

  -- NB-8: the hook is SECURITY DEFINER, so its OWNER is the effective reader of the
  -- allowlist. If the owner cannot SELECT it, an allowlisted account is rejected silently.
  if not has_table_privilege(
           pg_get_userbyid((select p.proowner from pg_proc p
                            where p.oid = 'public.hook_cityu_signup(jsonb)'::regprocedure)),
           'private.signup_email_allowlist', 'SELECT') then
    raise exception 'cityu_hook_definer_cannot_read_allowlist: the definer owner lacks SELECT on private.signup_email_allowlist'
      using errcode = '45014';
  end if;

  raise notice 'cityu_hook_ready: function installed; activate it in Dashboard -> Auth Hooks -> Before User Created';
end
$verify$;
