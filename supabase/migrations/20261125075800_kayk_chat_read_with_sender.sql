-- CityLink — the chat read that carries sender_id
--
-- Provenance: this file was written FROM the live catalog, not applied from the
-- repository. `list_group_chat_messages_with_sender` has been on Launch since an
-- earlier round with no file here and no ledger row; Adam approved promoting it
-- on 2026-11-25 15:57 so that a rebuild can reproduce the database the client
-- already depends on.
--
-- The body below is byte-for-byte what pg_get_functiondef() returned on
-- 2026-11-25 15:58 (1,278 characters), followed by the revoke/grant that describe
-- its measured ACL (owner, authenticated, service_role; no PUBLIC, no anon).
-- Running it again is a no-op: create or replace with identical text.
--
-- It is a five-column sibling of public.list_group_chat_messages: same
-- private.can_read_group_chat gate, same cursor pair, same ordering, same page
-- size. The only difference is sender_id, which is what lets the room put your
-- own message on your side without guessing from a display name.

CREATE OR REPLACE FUNCTION public.list_group_chat_messages_with_sender(p_group_id uuid, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id uuid, sender_name text, body text, created_at timestamp with time zone, sender_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'both pagination cursor fields must be supplied together';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  -- Same read authority as the four-column function: membership, not the caller.
  IF NOT private.can_read_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'not authorized to read this group chat';
  END IF;
  RETURN QUERY
    SELECT m.id, m.sender_name_snapshot, m.body, m.created_at, m.sender_id
    FROM public.group_chat_messages AS m
    WHERE m.group_id = p_group_id
      AND (p_before_created_at IS NULL
        OR (m.created_at, m.id) < (p_before_created_at, p_before_id))
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT p_limit;
END;
$function$;

revoke all on function public.list_group_chat_messages_with_sender(
  uuid, timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_group_chat_messages_with_sender(
  uuid, timestamptz, uuid, integer
) to authenticated, service_role;
