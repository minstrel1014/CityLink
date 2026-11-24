-- CityLink — target marker. Draft for review; not applied.
-- Purpose: end the transitional procedural control. After this file, every
-- migration asserts the marker before its first statement.
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
  select t.project_ref, t.system_identifier
    into v_ref, v_recorded
  from private.citylink_target t;

  if v_ref is null then
    raise exception 'citylink_target_marker_missing' using errcode = '45003';
  end if;

  if v_ref <> p_expected_ref then
    raise exception 'citylink_target_mismatch'
      using errcode = '45003',
            detail = format('marker names %s, caller expected %s', v_ref, p_expected_ref);
  end if;

  begin
    select c.system_identifier::text into v_observed from pg_control_system() c;
  exception when others then
    raise exception 'citylink_target_unverifiable'
      using errcode = '45003', detail = 'pg_control_system() unreadable';
  end;

  if v_observed <> v_recorded then
    raise exception 'citylink_target_cluster_changed'
      using errcode = '45003',
            detail = format('recorded %s, observed %s', v_recorded, v_observed);
  end if;
end;
$function$;

revoke all on function private.assert_citylink_target(text) from public, anon, authenticated, service_role;

insert into private.citylink_target (project_ref, system_identifier, declared_by, note)
values ('pijslbchvstkoweslymr', '7692131729119822239', 'Adam',
        'F14 2026-11-23 01:50; first authorized Launch write under the 2026-11-24 target-control decision')
on conflict (only_row) do nothing;

-- Prove the mechanism on this cluster before P1 runs. Fails the transaction if
-- the marker is absent, names another ref, or the cluster changed.
select private.assert_citylink_target('pijslbchvstkoweslymr');

commit;
