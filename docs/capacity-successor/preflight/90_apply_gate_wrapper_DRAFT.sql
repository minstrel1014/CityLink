-- =============================================================================
-- CityLink capacity successor — refusal wrapper (the only instrument that raises)
-- =============================================================================
-- DRAFT REVIEW ARTIFACT. DDL to be created ONLY inside a separately authorized
-- Test application session; nothing in this package applies it.
--
-- Contract: it reads the operator-declared evidence markers and nothing else.
-- It never queries a catalog, never inspects a function, never re-derives a
-- prerequisite — that is what pages 00..05 are for. Absent, incomplete,
-- malformed or unsatisfied evidence all refuse, each with its own token. If
-- this function has not been created, the call itself errors and nothing can
-- proceed: absence is also a refusal.
--
-- Fail-closed tokens (operator-facing, deliberately distinct from the
-- client-facing group_capacity_upgrade_required at blob :398-:399 and from the
-- approved stale-client string):
--   group_capacity_gate_run_undeclared     45001  no declared run id
--   group_capacity_gate_target_undeclared  45002  no declared target ref
--   group_capacity_gate_target_out_of_scope 45003 declared ref is Main
--   group_capacity_gate_target_unauthorized 45004 declared ref is neither
--   group_capacity_gate_pages_incomplete   45005 required pages not declared run
--   group_capacity_gate_verdict_unsatisfied 45006 preflight verdict not clean
--   group_capacity_gate_pin_unrecorded     45007 no digest pin declared
--   group_capacity_gate_engine_unconfirmed 45008 engine major not 17
--   group_capacity_gate_artifact_unverified 45009 declared blob identity differs
-- =============================================================================
-- REF-BEARING VERDICT RULE (Adam, 2026-11-23 00:40). A verdict produced here is
-- evidence only if it names the target it was produced for, so no message leaves
-- this function without the declared ref once a ref exists:
--   * success carries `run=<id> target=<ref>`;
--   * every refusal from 45003 onward carries ` target=<ref>` after its token;
--   * 45001 and 45002 are the two states where the ref is by definition not yet
--     known (no run id declared, or no target declared), so they name the missing
--     marker instead and are identifiable only by token and SQLSTATE.
-- Match a refusal on its SQLSTATE or on the leading token: the token is the first
-- word of the message and context follows after a space. The token names and the
-- 45001-45009 assignments are unchanged by this rule, and remain distinguishable
-- from each other and from the client-facing group_capacity_upgrade_required
-- (SQLSTATE 45000) that the reviewed blob raises.
-- The ref is operator-declared, so it is not proof of which database answered:
-- current_database() is `postgres` on both Supabase projects and cannot
-- distinguish them. Pair the returned token with the archived page 00 rows
-- C-MRK-13 (declared ref), C-DB-03 (current_database) and C-USR-04 (session_user)
-- under the same run id. Deciding whether the gate should scope a real release
-- target at all is finding F14, which is still open; this rule changes only the
-- emitted text, not the scope logic.
-- =============================================================================

create or replace function private.citylink_capacity_apply_gate()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $gate$
declare
  v_run     text := btrim(coalesce(current_setting('citylink.capacity_run_id', true), ''));
  v_target  text := btrim(coalesce(current_setting('citylink.capacity_target_ref', true), ''));
  v_pages   text := lower(btrim(coalesce(current_setting('citylink.capacity_pages_run', true), '')));
  v_verdict text := upper(btrim(coalesce(current_setting('citylink.capacity_preflight_verdict', true), '')));
  v_pins    text := btrim(coalesce(current_setting('citylink.capacity_pinned_digests', true), ''));
  v_major   text := btrim(coalesce(current_setting('citylink.capacity_engine_major', true), ''));
  v_blob    text := btrim(coalesce(current_setting('citylink.capacity_blob_identity', true), ''));

  c_test constant text := 'wkzclgmhrtecnpexfesr';
  c_main constant text := 'pijslbchvstkoweslymr';
  c_blob constant text := 'a04048e90d6b64c692f03c722b9eea2849058aab'
                          || ':5cf0a66a6051762492b6a9bb01e249869551b2416779c8d173fed6470e8b4887';
begin
  if v_run = '' then
    raise exception 'group_capacity_gate_run_undeclared'
      using detail = 'citylink.capacity_run_id is not declared, so this gate has '
                 || 'no recorded preflight run to attach to.',
            errcode = '45001';
  end if;

  if v_target = '' then
    raise exception 'group_capacity_gate_target_undeclared'
      using detail = 'citylink.capacity_target_ref is not declared. The gate will '
                 || 'not guess a target from a filename, a ledger or a default.',
            errcode = '45002';
  end if;

  if v_target = c_main then
    raise exception 'group_capacity_gate_target_out_of_scope target=%', v_target
      using detail = 'the declared ref is Main, which is read-only under the '
                 || 'current boundary and structurally ineligible for the '
                 || 'reviewed blob (package document §4.2).',
            hint = 'Any Main capacity path needs a new explicit Adam decision in '
                || 'docs/team/DECISIONS.md, plus Tracks B and C.',
            errcode = '45003';
  end if;

  if v_target <> c_test then
    raise exception 'group_capacity_gate_target_unauthorized target=%', v_target
      using detail = 'the declared ref "' || v_target || '" is not the disposable '
                 || 'Test ref named in Adam''s authorization.',
            errcode = '45004';
  end if;

  if position('00' in v_pages) = 0 or position('01' in v_pages) = 0
     or position('05' in v_pages) = 0 then
    raise exception 'group_capacity_gate_pages_incomplete target=%', v_target
      using detail = 'a Test capacity application must declare pages 00, 01 and 05 '
                 || 'as run in this session; declared value was "'
                 || coalesce(nullif(v_pages, ''), '<none>') || '".',
            errcode = '45005';
  end if;

  if v_verdict not in ('PASS', 'PASS_WITH_CAPTURED_OBSERVATIONS') then
    raise exception 'group_capacity_gate_verdict_unsatisfied target=%', v_target
      using detail = 'the recorded preflight verdict is "'
                 || coalesce(nullif(v_verdict, ''), '<undeclared>')
                 || '", which is not a clean result.',
            errcode = '45006';
  end if;

  if v_pins = '' then
    raise exception 'group_capacity_gate_pin_unrecorded target=%', v_target
      using detail = 'no helper digest pin was declared. While G4 is unpinned the '
                 || 'gate refuses rather than passing by omission.',
            errcode = '45007';
  end if;

  if v_major <> '17' then
    raise exception 'group_capacity_gate_engine_unconfirmed target=%', v_target
      using detail = 'the declared engine major version is "'
                 || coalesce(nullif(v_major, ''), '<undeclared>')
                 || '"; Adam''s real-parser gate targets major 17.',
            errcode = '45008';
  end if;

  if v_blob <> c_blob then
    raise exception 'group_capacity_gate_artifact_unverified target=%', v_target
      using detail = 'the declared blob identity is not the reviewed capacity file '
                 || '(object id and SHA-256, joined by a colon).',
            hint = 'Re-verify the exact head before requesting any application.',
            errcode = '45009';
  end if;

  return 'group_capacity_gate_satisfied run=' || v_run || ' target=' || v_target;
end
$gate$;

-- The gate is an operator instrument, not an API surface.
revoke all on function private.citylink_capacity_apply_gate()
  from public, anon, authenticated, service_role;
