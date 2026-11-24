-- CityLink — target marker. Draft for review; not applied.
-- Purpose: end the transitional procedural control. After this file, every
-- migration asserts the marker before its first statement.
--
-- ============================================================================
-- FAILURE CODES — deliberately NOT 45003, and deliberately not 45K01-03.
--
--   45M01  citylink_target_marker_missing     the marker table, or its row, is absent
--   45M02  citylink_target_mismatch           the row names a different ref
--   45M03  citylink_target_cluster_changed    the ref matches, the cluster does not
--   45M04  citylink_target_unverifiable       pg_control_system() could not be read
--
-- Neighbouring codes, for contrast:
--   45003  group_capacity_gate_target_out_of_scope   the capacity apply gate
--   45K01  kayk_p1_prerequisite_missing              the P1 guard, layer 1
--   45K02  kayk_p1_target_evidence_unreadable        the P1 guard, layer 2 unreadable
--   45K03  kayk_p1_target_out_of_scope               the P1 guard, layer 2 refusal
--
-- WHY NOT SHARE 45003. Three of these four are not "the target is out of scope":
--   45M01 fires legitimately on Launch itself, before this file has ever run, so it
--     must not read as an out-of-scope refusal;
--   45M03 fires when the ref is right but the cluster is not the one that was
--     verified - a restore or a clone - and its remediation (re-establish the
--     marker) is different from a wrong ref's (repoint the connection);
--   45M04 is an inability to decide, not a decision.
-- One code per cause keeps a log line unambiguous about which line of work refused,
-- which is the same property the P1 guard bought with 45K01-03. A single 45003 for
-- all four would put four different remediations behind one number.
-- ============================================================================

begin;

create table if not exists private.citylink_target (
  only_row boolean primary key default true,
  constraint citylink_target_single_row check (only_row),
  project_ref text not null,
  system_identifier text not null,
  declared_at timestamptz not null default now(),
  declared_by text not null,
  note text
);

revoke all on table private.citylink_target from public, anon, authenticated, service_role;

create or replace function private.assert_citylink_target(p_expected_ref text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ref text;
  v_recorded text;
  v_observed text;
begin
  -- The table itself may be absent on a project where this file never ran. That is
  -- 45M01, not an undefined_table (42P01) leaking out as an unrelated code.
  begin
    select t.project_ref, t.system_identifier
      into v_ref, v_recorded
    from private.citylink_target t;
  exception
    when undefined_table then
      raise exception 'citylink_target_marker_missing'
        using errcode = '45M01',
              detail = 'private.citylink_target does not exist';
  end;

  if v_ref is null then
    raise exception 'citylink_target_marker_missing'
      using errcode = '45M01',
            detail = 'private.citylink_target has no row';
  end if;

  if v_ref <> p_expected_ref then
    raise exception 'citylink_target_mismatch'
      using errcode = '45M02',
            detail = format('marker names %s, caller expected %s', v_ref, p_expected_ref);
  end if;

  begin
    select c.system_identifier::text into v_observed from pg_control_system() c;
  exception
    when others then
      raise exception 'citylink_target_unverifiable'
        using errcode = '45M04',
              detail = 'pg_control_system() could not be read';
  end;

  if v_observed <> v_recorded then
    raise exception 'citylink_target_cluster_changed'
      using errcode = '45M03',
            detail = format('recorded %s, observed %s', v_recorded, v_observed);
  end if;
end;
$function$;

revoke all on function private.assert_citylink_target(text) from public, anon, authenticated, service_role;

insert into private.citylink_target (project_ref, system_identifier, declared_by, note)
values ('pijslbchvstkoweslymr', '7692131729119822239', 'Adam',
        'F14 2026-11-23 01:50; first authorized Launch write under the 2026-11-24 target-control decision')
on conflict (only_row) do nothing;

-- Prove the mechanism on this cluster before P1 runs. Fails the transaction if the
-- marker is absent, names another ref, or the cluster changed.
select private.assert_citylink_target('pijslbchvstkoweslymr');

commit;
