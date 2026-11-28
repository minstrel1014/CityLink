-- CityLink — group AI chat, deploy 4: the index the executor's poll actually needs
--
-- Additive. Apply after deploy 1, 2 and 3. Changes no existing object, no data.
--
-- Why this exists. `claim_next_group_ai_request` filters on `status = 'queued'`
-- and orders by `(created_at, id)`. Deploy 1 created two indexes on
-- `public.group_ai_requests` — `(group_id, created_at desc)` and
-- `(asked_by, created_at desc)` — and neither can serve that filter or that
-- ordering, so every poll is a sequential scan. The table grows one row per
-- question with no documented retention rule, so the cost grows with the product.
--
-- The predicate must be written exactly as `status = 'queued'` to match the
-- function body; PostgreSQL only uses a partial index when it can prove the
-- query's predicate implies the index's.
--
-- Found by Role 6 as C-3 in its deploy-3 review. Adam chose "add it as deploy 4"
-- on 2026-11-25, rather than recording it as a known limitation.
begin;
-- Section 0: target guard. Proves history, not identity; the identity check is
-- the operator's `pg_control_system()` read before the window.
select private.assert_citylink_target('pijslbchvstkoweslymr');
create index if not exists group_ai_requests_queued
  on public.group_ai_requests (created_at, id)
  where status = 'queued';
commit;
