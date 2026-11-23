-- =============================================================================
-- Pre-blob reconciliation: drop the 13-column list_group_recruitment_posts
-- =============================================================================
-- WHY THIS FILE EXISTS
--
-- `public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer)` changed
-- result shape from 13 output columns to 14: the reviewed capacity file adds
-- `subject text` as the fourth column
-- (`supabase/migrations/20261119090000_group_hard_max.sql:1710-1727`).
--
-- PostgreSQL cannot change a function's return type with CREATE OR REPLACE
-- FUNCTION. It raises SQLSTATE 42P13 ("cannot change return type of existing
-- function") and tells the operator to DROP FUNCTION first. The reviewed
-- capacity file is a single transaction (`:39`/`:1756`), so that one failure
-- aborts the whole application and nothing is applied — fail-closed, but not
-- applicable.
--
-- The capacity file already assumes the 14-column shape exists: repository row 8
-- (`20261118083000_stage6_people_page_naming.sql:636-638`) drops and recreates
-- this same function with `subject`. A target that has row 8 needs no help. A
-- target that does not — CityLink Launch, per the recorded metadata parity
-- snapshot — still holds the 13-column Stage 6 shape and will abort.
--
-- WHAT THIS FILE DOES
--
-- Drops exactly one function identity, and only while it is still in a
-- pre-14-column shape. It does not drop any `*_capacity` variant, does not touch
-- a different arity, does not use CASCADE, and does not recreate anything: the
-- capacity file recreates the function immediately afterwards.
--
-- ORDERING (mandatory, same release window)
--
--   1. this file                                 (drops the 13-column function)
--   2. 20261119090000_group_hard_max.sql         (recreates it with 14 columns)
--
-- The filename sorts immediately before the capacity file for exactly that
-- reason. Between statement 1 and statement 2 the RPC DOES NOT EXIST: any client
-- call in that window fails with 42883 (undefined_function) rather than returning
-- a wrong-shaped row. That gap is the accepted, scheduled cost of a forward-only
-- shape change — it must be planned into the window, not discovered during it.
--
-- IDEMPOTENCE
--
-- Safe to re-run. Absent -> no-op. Already 14 columns with `subject` -> no-op, so
-- re-running after the capacity file has been applied cannot undo it. Any other
-- output-column count is an unexpected state: this file raises and stops rather
-- than dropping a shape nobody reviewed.
-- =============================================================================

do $preblob_reconcile$
declare
  v_oid      oid;
  v_out_cols integer;
  v_has_subj boolean;
begin
  -- Identify the function by catalog metadata, never by a hard cast: a cast of an
  -- absent name aborts before the guard can decide that absence is a no-op.
  -- Argument types are compared as OIDs, not as rendered text: PostgreSQL
  -- canonicalizes `timestamptz` to `timestamp with time zone`, so a string
  -- comparison against the declaration spelling silently matches nothing.
  select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'list_group_recruitment_posts'
     and p.pronargs = 4
     and p.proargtypes[0] = 'uuid'::regtype
     and p.proargtypes[1] = 'timestamptz'::regtype
     and p.proargtypes[2] = 'uuid'::regtype
     and p.proargtypes[3] = 'int4'::regtype;

  if v_oid is null then
    raise notice 'preblob reconcile: list_group_recruitment_posts(uuid,timestamptz,uuid,integer) is absent; nothing to do';
    return;
  end if;

  -- For a RETURNS TABLE function, proallargtypes holds IN and OUT parameters
  -- while pronargs counts only IN parameters; the difference is the OUT count.
  select coalesce(array_length(p.proallargtypes, 1), p.pronargs) - p.pronargs,
         coalesce('subject' = any(p.proargnames), false)
    into v_out_cols, v_has_subj
    from pg_proc p
   where p.oid = v_oid;

  if v_out_cols = 14 and v_has_subj then
    raise notice 'preblob reconcile: already the 14-column shape (subject present); nothing to do';
    return;
  end if;

  if v_out_cols <> 13 then
    raise exception
      'preblob reconcile: unexpected list_group_recruitment_posts shape (% output columns, subject=%)',
      v_out_cols, v_has_subj
      using detail = 'Only a 13-column pre-capacity shape is reconciled here. '
                 || 'A different shape means the target is not the state this '
                 || 'file was reviewed against.',
            hint = 'Capture the live result shape, stop, and re-review; do not '
                || 'force the drop.',
            errcode = 'P0001';
  end if;

  drop function if exists
    public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer);

  raise notice 'preblob reconcile: dropped the 13-column list_group_recruitment_posts; 20261119090000_group_hard_max.sql must recreate it with 14 columns in the same window';
end
$preblob_reconcile$;
