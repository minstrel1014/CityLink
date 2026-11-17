-- PROPOSAL ONLY — NOT A MIGRATION; DO NOT APPLY TO ANY DATABASE.
-- Revision 2, 2026-11-17, reflecting explicit lead decisions from Adam.
-- Target for a future, separately approved migration: disposable CityLink Test
-- ref wkzclgmhrtecnpexfesr only. Never apply to Supabase Main.
-- This proposal has not been applied. Role 6 and Roy must review the SQL and
-- tests; Adam must separately approve any application to Test.
-- Preserves the existing broad profiles policy. New member-list RPCs use the
-- same any-shared-course audience; profile_id is a non-display selector, with
-- only the approved profile attributes plus pagination metadata returned.
-- Course-detail group discovery is current-term only and requires >=2 active
-- members; pending invitations never count as members for that listing.
-- New chat/post tables are RPC-only (no direct app table grants or RLS policies).
-- Abandoned-group chat is read-only; active members may still send in archived
-- groups. Archived/abandoned recruitment posts remain readable, but are closed
-- and have no Apply/edit/close interaction. Manually closed posts are also
-- read-only, including for an author who remains an active member; no reopen RPC.
-- If no active group member remains, the group is abandoned, pending join
-- requests are cancelled, and pending invitations retain the existing expired
-- behavior. Pagination: posts 20, course groups 25, member list 50; max 100.

BEGIN;

CREATE TABLE public.group_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
    REFERENCES public.study_groups(id) ON DELETE RESTRICT,
  sender_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name_snapshot text NOT NULL
    CHECK (char_length(sender_name_snapshot) BETWEEN 1 AND 120),
  body text NOT NULL
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX group_chat_messages_group_created_idx
  ON public.group_chat_messages (group_id, created_at DESC, id DESC);

CREATE TABLE public.group_recruitment_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  course_id uuid NOT NULL,
  term_id uuid NOT NULL,
  author_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name_snapshot text NOT NULL
    CHECK (char_length(author_name_snapshot) BETWEEN 1 AND 120),
  body text NOT NULL
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT group_recruitment_posts_group_course_term_fkey
    FOREIGN KEY (group_id, course_id, term_id)
    REFERENCES public.study_groups(id, course_id, term_id)
    ON DELETE RESTRICT,
  CONSTRAINT group_recruitment_posts_closed_at_check
    CHECK ((status = 'open' AND closed_at IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL))
);

CREATE INDEX group_recruitment_posts_course_created_idx
  ON public.group_recruitment_posts (course_id, created_at DESC, id DESC);
CREATE INDEX group_recruitment_posts_group_status_idx
  ON public.group_recruitment_posts (group_id, status, created_at DESC);
CREATE INDEX group_memberships_active_group_join_cursor_idx
  ON public.group_memberships (group_id, joined_at, id)
  WHERE membership_status = 'active';

ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_recruitment_posts ENABLE ROW LEVEL SECURITY;

-- Private helpers use auth.uid() rather than a caller-supplied actor ID. Keep
-- private outside PostgREST's exposed schemas. Only SECURITY DEFINER RPC owners
-- should execute these helpers; verify ownership/EXECUTE before applying.
CREATE OR REPLACE FUNCTION private.can_read_group_chat(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.study_groups AS g
       JOIN public.group_memberships AS m ON m.group_id = g.id
       WHERE g.id = p_group_id
         AND m.profile_id = (SELECT auth.uid())
         AND m.membership_status IN ('active', 'left', 'removed')
     );
$function$;

CREATE OR REPLACE FUNCTION private.can_send_group_chat(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.study_groups AS g
       JOIN public.group_memberships AS m ON m.group_id = g.id
       WHERE g.id = p_group_id
         AND g.status <> 'abandoned'
         AND m.profile_id = (SELECT auth.uid())
         AND m.membership_status = 'active'
     );
$function$;


CREATE OR REPLACE FUNCTION private.can_browse_current_term_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.study_groups AS g
       JOIN public.citylink_settings AS s
         ON s.singleton AND s.current_term_id = g.term_id
       JOIN public.enrolments AS e
         ON e.course_id = g.course_id
        AND e.student_id = (SELECT auth.uid())
       WHERE g.id = p_group_id
         AND g.status IN ('forming', 'active')
         -- Course-detail discovery hides invite-only groups until two actual
         -- active membership rows exist. Pending invitations do not count.
         AND (SELECT count(*) FROM public.group_memberships AS m
              WHERE m.group_id = g.id AND m.membership_status = 'active') >= 2
     );
$function$;



CREATE OR REPLACE FUNCTION private.can_manage_recruitment_post(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.group_recruitment_posts AS p
       JOIN public.study_groups AS g
         ON g.id = p.group_id
        AND g.course_id = p.course_id
        AND g.term_id = p.term_id
       JOIN public.citylink_settings AS s
         ON s.singleton AND s.current_term_id = p.term_id
       JOIN public.enrolments AS e
         ON e.course_id = p.course_id
        AND e.student_id = (SELECT auth.uid())
       WHERE p.id = p_post_id
         AND p.author_id = (SELECT auth.uid())
         AND p.status = 'open'
         AND g.status = 'active'
         AND EXISTS (
           SELECT 1 FROM public.group_memberships AS m
           WHERE m.group_id = g.id
             AND m.profile_id = (SELECT auth.uid())
             AND m.membership_status = 'active'
         )
     );
$function$;

-- RPC-only client access: RLS stays enabled and anon/authenticated receive no
-- direct table policies or grants. Each SECURITY DEFINER RPC authorizes callers.

-- No direct browser table access: even SELECT would reveal internal columns.
-- Read/write only through field-limited, authorization-checking RPCs.
REVOKE ALL ON TABLE public.group_chat_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_recruitment_posts FROM PUBLIC, anon, authenticated;

-- Helper revokes are issued after all functions are declared below.
-- IDs/cursors are identifiers, not secrets; each RPC reauthorizes every call.
CREATE OR REPLACE FUNCTION public.list_current_term_course_groups(
  p_course_id uuid,
  p_after_group_name text DEFAULT NULL,
  p_after_group_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  group_status text,
  active_member_count bigint,
  can_create_post boolean,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (p_after_group_name IS NULL) <> (p_after_group_id IS NULL) THEN
    RAISE EXCEPTION 'both group pagination cursor fields must be supplied together';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
    WITH eligible AS (
      SELECT g.id AS group_id,
             g.name AS group_name,
             g.status AS group_status,
             count(m.id) AS active_member_count,
             (g.status = 'active' AND EXISTS (
               SELECT 1 FROM public.group_memberships AS own_membership
               WHERE own_membership.group_id = g.id
                 AND own_membership.profile_id = (SELECT auth.uid())
                 AND own_membership.membership_status = 'active'
             )) AS can_create_post
      FROM public.study_groups AS g
      JOIN public.citylink_settings AS s
        ON s.singleton AND s.current_term_id = g.term_id
      JOIN public.enrolments AS viewer_enrolment
        ON viewer_enrolment.course_id = g.course_id
       AND viewer_enrolment.student_id = (SELECT auth.uid())
      LEFT JOIN public.group_memberships AS m
        ON m.group_id = g.id AND m.membership_status = 'active'
      WHERE g.course_id = p_course_id
        AND g.status IN ('forming', 'active')
        AND private.can_browse_current_term_group(g.id)
      GROUP BY g.id, g.name, g.status
      HAVING count(m.id) >= 2
    ), page AS (
      SELECT e.*,
             (count(*) OVER () > p_limit) AS has_more
      FROM eligible AS e
      WHERE p_after_group_name IS NULL
         OR (e.group_name, e.group_id) > (p_after_group_name, p_after_group_id)
      ORDER BY e.group_name, e.group_id
      LIMIT p_limit
    )
    SELECT page.group_id, page.group_name, page.group_status,
           page.active_member_count, page.can_create_post, page.has_more
    FROM page;
END;
$function$;


CREATE OR REPLACE FUNCTION public.list_current_term_group_members(
  p_group_id uuid,
  p_after_joined_at timestamptz DEFAULT NULL,
  p_after_membership_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[],
  cursor_joined_at timestamptz,
  cursor_membership_id uuid,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (p_after_joined_at IS NULL) <> (p_after_membership_id IS NULL) THEN
    RAISE EXCEPTION 'both member pagination cursor fields must be supplied together';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
    WITH eligible_group AS (
      SELECT g.id
      FROM public.study_groups AS g
      JOIN public.citylink_settings AS s
        ON s.singleton AND s.current_term_id = g.term_id
      WHERE g.id = p_group_id
        AND g.status IN ('forming', 'active')
        AND (SELECT count(*) FROM public.group_memberships AS active_m
             WHERE active_m.group_id = g.id
               AND active_m.membership_status = 'active') >= 2
    ), roster AS (
      SELECT p.id AS profile_id, p.display_name, p.major, p.year, p.bio, p.skills,
             m.joined_at AS cursor_joined_at, m.id AS cursor_membership_id
      FROM eligible_group AS eg
      JOIN public.group_memberships AS m
        ON m.group_id = eg.id AND m.membership_status = 'active'
      JOIN public.profiles AS p ON p.id = m.profile_id
      WHERE p.id = (SELECT auth.uid())
         OR private.shares_course_with(p.id)
    ), page AS (
      SELECT r.*,
             (count(*) OVER () > p_limit) AS has_more
      FROM roster AS r
      WHERE p_after_joined_at IS NULL
         OR (r.cursor_joined_at, r.cursor_membership_id)
              > (p_after_joined_at, p_after_membership_id)
      ORDER BY r.cursor_joined_at, r.cursor_membership_id
      LIMIT p_limit
    )
    SELECT page.profile_id, page.display_name, page.major, page.year,
           page.bio, page.skills, page.cursor_joined_at,
           page.cursor_membership_id, page.has_more
    FROM page;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_current_term_group_member_profile(
  p_group_id uuid,
  p_profile_id uuid
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  major text,
  year smallint,
  bio text,
  skills text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.display_name, p.major, p.year, p.bio, p.skills
  FROM public.study_groups AS g
  JOIN public.citylink_settings AS s
    ON s.singleton AND s.current_term_id = g.term_id
  JOIN public.group_memberships AS m
    ON m.group_id = g.id
   AND m.profile_id = p_profile_id
   AND m.membership_status = 'active'
  JOIN public.profiles AS p ON p.id = p_profile_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND g.id = p_group_id
    AND g.status IN ('forming', 'active')
    AND (SELECT count(*) FROM public.group_memberships AS active_m
         WHERE active_m.group_id = g.id
           AND active_m.membership_status = 'active') >= 2
    AND (p_profile_id = (SELECT auth.uid())
         OR private.shares_course_with(p_profile_id));
$function$;


CREATE OR REPLACE FUNCTION public.list_group_chat_messages(
  p_group_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  message_id uuid,
  sender_name text,
  body text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'both pagination cursor fields must be supplied together';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  IF NOT private.can_read_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'not authorized to read this group chat';
  END IF;
  RETURN QUERY
    SELECT m.id, m.sender_name_snapshot, m.body, m.created_at
    FROM public.group_chat_messages AS m
    WHERE m.group_id = p_group_id
      AND (p_before_created_at IS NULL
        OR (m.created_at, m.id) < (p_before_created_at, p_before_id))
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT p_limit;
END;
$function$;

-- Return access flags separately so an empty chat can still distinguish a
-- former member (read-only) from an active member (read/write). Unauthorized
-- callers receive no message history and a clear permission failure.
CREATE OR REPLACE FUNCTION public.get_group_chat_access(p_group_id uuid)
RETURNS TABLE (can_read boolean, can_send boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT private.can_read_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'not authorized to read this group chat';
  END IF;
  RETURN QUERY SELECT true, private.can_send_group_chat(p_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_group_chat_message(
  p_group_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_body text := btrim(p_body);
  v_sender_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF v_body IS NULL OR char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'message must contain 1 to 4000 characters';
  END IF;
  PERFORM 1
  FROM public.group_memberships AS m
  WHERE m.group_id = p_group_id
    AND m.profile_id = (SELECT auth.uid())
    AND m.membership_status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR NOT private.can_send_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'only active group members may send messages';
  END IF;
  SELECT p.display_name INTO v_sender_name
  FROM public.profiles AS p WHERE p.id = (SELECT auth.uid());
  INSERT INTO public.group_chat_messages (
    group_id, sender_id, sender_name_snapshot, body
  ) VALUES (
    p_group_id, (SELECT auth.uid()),
    coalesce(nullif(v_sender_name, ''), 'CityLink member'), v_body
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_group_recruitment_posts(
  p_course_id uuid,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  post_id uuid,
  group_id uuid,
  group_name text,
  active_member_count bigint,
  author_name text,
  body text,
  post_status text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  apply_enabled boolean,
  can_manage boolean,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (p_after_created_at IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'both post pagination cursor fields must be supplied together';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
    WITH eligible AS (
      SELECT p.id AS post_id,
             CASE WHEN g.status IN ('forming', 'active') THEN g.id ELSE NULL END AS group_id,
             CASE WHEN g.status IN ('forming', 'active') THEN g.name ELSE NULL END AS group_name,
             CASE WHEN g.status IN ('forming', 'active') THEN
               (SELECT count(*) FROM public.group_memberships AS m
                WHERE m.group_id = g.id AND m.membership_status = 'active')
               ELSE NULL END AS active_member_count,
             p.author_name_snapshot AS author_name,
             p.body,
             p.status AS post_status,
             p.created_at,
             p.updated_at,
             p.closed_at,
             (p.status = 'open'
               AND g.status = 'active'
               AND private.is_current_term(g.term_id)
               AND EXISTS (
                 SELECT 1 FROM public.profiles AS viewer
                 WHERE viewer.id = (SELECT auth.uid())
                   AND viewer.status IN ('open', 'considering')
               )
               AND NOT EXISTS (
                 SELECT 1 FROM public.group_memberships AS own_m
                 WHERE own_m.profile_id = (SELECT auth.uid())
                   AND own_m.course_id = p.course_id
                   AND own_m.term_id = p.term_id
                   AND own_m.membership_status = 'active'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM public.group_invitations AS i
                 WHERE i.group_id = p.group_id
                   AND i.recipient_id = (SELECT auth.uid())
                   AND i.status = 'pending'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM public.group_join_requests AS r
                 WHERE r.group_id = p.group_id
                   AND r.requester_id = (SELECT auth.uid())
                   AND r.status = 'pending'
               )) AS apply_enabled,
             private.can_manage_recruitment_post(p.id) AS can_manage
      FROM public.group_recruitment_posts AS p
      JOIN public.study_groups AS g
        ON g.id = p.group_id AND g.course_id = p.course_id AND g.term_id = p.term_id
      JOIN public.citylink_settings AS s
        ON s.singleton AND s.current_term_id = p.term_id
      JOIN public.enrolments AS e
        ON e.course_id = p.course_id AND e.student_id = (SELECT auth.uid())
      WHERE p.course_id = p_course_id
    ), page AS (
      SELECT e.*,
             (count(*) OVER () > p_limit) AS has_more
      FROM eligible AS e
      WHERE p_after_created_at IS NULL
         OR (e.created_at, e.post_id) < (p_after_created_at, p_after_id)
      ORDER BY e.created_at DESC, e.post_id DESC
      LIMIT p_limit
    )
    SELECT page.post_id, page.group_id, page.group_name,
           page.active_member_count, page.author_name, page.body,
           page.post_status, page.created_at, page.updated_at, page.closed_at,
           page.apply_enabled, page.can_manage, page.has_more
    FROM page;
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_group_recruitment_post(
  p_group_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_post_id uuid;
  v_course_id uuid;
  v_term_id uuid;
  v_group_status text;
  v_author_name text;
  v_body text := btrim(p_body);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF v_body IS NULL OR char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'post must contain 1 to 2000 characters';
  END IF;
  SELECT g.course_id, g.term_id, g.status
    INTO v_course_id, v_term_id, v_group_status
  FROM public.study_groups AS g WHERE g.id = p_group_id;
  PERFORM 1
  FROM public.group_memberships AS m
  WHERE m.group_id = p_group_id
    AND m.profile_id = (SELECT auth.uid())
    AND m.membership_status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_course_id IS NULL OR v_group_status <> 'active'
     OR NOT private.is_current_term(v_term_id)
     OR NOT private.is_enrolled((SELECT auth.uid()), v_course_id)
     OR NOT private.is_active_group_member(p_group_id, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'only an active member of an active current-term group may post';
  END IF;
  SELECT p.display_name INTO v_author_name
  FROM public.profiles AS p WHERE p.id = (SELECT auth.uid());
  INSERT INTO public.group_recruitment_posts (
    group_id, course_id, term_id, author_id, author_name_snapshot, body
  ) VALUES (
    p_group_id, v_course_id, v_term_id, (SELECT auth.uid()),
    coalesce(nullif(v_author_name, ''), 'CityLink member'), v_body
  ) RETURNING id INTO v_post_id;
  RETURN v_post_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.edit_group_recruitment_post(
  p_post_id uuid,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_body text := btrim(p_body);
  v_group_id uuid;
BEGIN
  IF v_body IS NULL OR char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'post must contain 1 to 2000 characters';
  END IF;
  SELECT p.group_id INTO v_group_id
  FROM public.group_recruitment_posts AS p WHERE p.id = p_post_id;
  PERFORM 1
  FROM public.group_memberships AS m
  WHERE m.group_id = v_group_id
    AND m.profile_id = (SELECT auth.uid())
    AND m.membership_status = 'active'
  FOR UPDATE;
  IF v_group_id IS NULL OR NOT FOUND
     OR NOT private.can_manage_recruitment_post(p_post_id) THEN
    RAISE EXCEPTION 'only the active post author may edit this post';
  END IF;
  UPDATE public.group_recruitment_posts
  SET body = v_body, updated_at = now()
  WHERE id = p_post_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_group_recruitment_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT p.group_id INTO v_group_id
  FROM public.group_recruitment_posts AS p WHERE p.id = p_post_id;
  PERFORM 1
  FROM public.group_memberships AS m
  WHERE m.group_id = v_group_id
    AND m.profile_id = (SELECT auth.uid())
    AND m.membership_status = 'active'
  FOR UPDATE;
  IF v_group_id IS NULL OR NOT FOUND
     OR NOT private.can_manage_recruitment_post(p_post_id) THEN
    RAISE EXCEPTION 'only the active post author may close this post';
  END IF;
  UPDATE public.group_recruitment_posts
  SET status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
  WHERE id = p_post_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.maybe_abandon_empty_forming_group(p_group_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH abandoned AS (
    UPDATE public.study_groups AS g
    SET status = 'abandoned', updated_at = clock_timestamp()
    WHERE g.id = p_group_id
      AND g.status = 'forming'
      AND NOT EXISTS (
        SELECT 1 FROM public.group_invitations AS i
        WHERE i.group_id = g.id AND i.status = 'pending'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.group_memberships AS m
        WHERE m.group_id = g.id AND m.membership_status = 'active'
      )
    RETURNING g.id
  )
  UPDATE public.group_join_requests AS r
  SET status = 'cancelled',
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  FROM abandoned AS a
  WHERE r.group_id = a.id AND r.status = 'pending';
$function$;

CREATE OR REPLACE FUNCTION private.reconcile_group_leader_after_membership_end(
  p_group_id uuid,
  p_ended_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_creator_id uuid;
  v_group_status text;
  v_successor_id uuid;
BEGIN
  SELECT g.creator_id, g.status
    INTO v_creator_id, v_group_status
  FROM public.study_groups AS g
  WHERE g.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_group_status IN ('abandoned', 'archived') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.group_memberships AS m
      WHERE m.group_id = p_group_id AND m.membership_status = 'active'
    ) THEN
      -- No active student remains, even if the group had already been archived.
      UPDATE public.study_groups
      SET creator_id = NULL, status = 'abandoned', updated_at = clock_timestamp()
      WHERE id = p_group_id;

      UPDATE public.group_invitations
      SET status = 'expired',
          responded_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE group_id = p_group_id AND status = 'pending';

      UPDATE public.group_join_requests
      SET status = 'cancelled',
          cancelled_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE group_id = p_group_id AND status = 'pending';
    ELSIF v_creator_id IS NOT NULL
       AND (v_creator_id IS NOT DISTINCT FROM p_ended_profile_id
            OR NOT private.is_active_group_member(p_group_id, v_creator_id)) THEN
      UPDATE public.study_groups
      SET creator_id = NULL, updated_at = clock_timestamp()
      WHERE id = p_group_id;
    END IF;
    RETURN;
  END IF;

  IF v_group_status NOT IN ('forming', 'active') THEN
    RETURN;
  END IF;

  SELECT m.profile_id
    INTO v_successor_id
  FROM public.group_memberships AS m
  WHERE m.group_id = p_group_id
    AND m.membership_status = 'active'
    AND m.profile_id IS NOT NULL
    AND m.profile_id IS DISTINCT FROM p_ended_profile_id
  ORDER BY m.joined_at ASC, m.created_at ASC, m.id ASC
  LIMIT 1;

  IF v_successor_id IS NULL THEN
    UPDATE public.study_groups
    SET creator_id = NULL,
        status = 'abandoned',
        updated_at = clock_timestamp()
    WHERE id = p_group_id;

    UPDATE public.group_invitations
    SET status = 'expired',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE group_id = p_group_id AND status = 'pending';

    UPDATE public.group_join_requests
    SET status = 'cancelled',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE group_id = p_group_id AND status = 'pending';

    RETURN;
  END IF;

  IF v_creator_id IS NULL
     OR v_creator_id IS NOT DISTINCT FROM p_ended_profile_id
     OR NOT private.is_active_group_member(p_group_id, v_creator_id) THEN
    UPDATE public.study_groups
    SET creator_id = v_successor_id,
        updated_at = clock_timestamp()
    WHERE id = p_group_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_membership_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.membership_status = 'active' THEN
      UPDATE public.group_recruitment_posts
      SET status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
      WHERE group_id = OLD.group_id AND author_id = OLD.profile_id AND status = 'open';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.membership_status = 'active'
     AND (NEW.membership_status IS DISTINCT FROM 'active'
          OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    UPDATE public.group_recruitment_posts
    SET status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
    WHERE group_id = OLD.group_id AND author_id = OLD.profile_id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER group_recruitment_posts_close_on_membership_end
AFTER UPDATE OF membership_status, profile_id OR DELETE
ON public.group_memberships
FOR EACH ROW
EXECUTE FUNCTION private.close_recruitment_posts_on_membership_end();

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_group_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IN ('archived', 'abandoned')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.group_recruitment_posts
    SET status = 'closed',
        closed_at = coalesce(closed_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE group_id = NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER group_recruitment_posts_close_on_group_terminal
AFTER UPDATE OF status ON public.study_groups
FOR EACH ROW
EXECUTE FUNCTION private.close_recruitment_posts_on_group_terminal();

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.group_recruitment_posts
  SET status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
  WHERE author_id = OLD.id AND status = 'open';
  RETURN OLD;
END;
$function$;

CREATE TRIGGER group_recruitment_posts_close_on_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.close_recruitment_posts_on_profile_delete();

-- Private helpers are not API entry points. SECURITY DEFINER RPC owners must
-- have EXECUTE on these helpers; browser roles receive no direct helper grants.
REVOKE ALL ON FUNCTION private.can_read_group_chat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_send_group_chat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_browse_current_term_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_manage_recruitment_post(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.maybe_abandon_empty_forming_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reconcile_group_leader_after_membership_end(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_recruitment_posts_on_membership_end() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_recruitment_posts_on_group_terminal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_recruitment_posts_on_profile_delete() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_current_term_course_groups(uuid, text, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_current_term_group_members(uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_term_group_member_profile(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_group_chat_messages(uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_chat_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_group_chat_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_recruitment_post(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_group_recruitment_post(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_group_recruitment_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_current_term_course_groups(uuid, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_current_term_group_members(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_term_group_member_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_group_chat_messages(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_chat_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_group_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_group_recruitment_posts(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_recruitment_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_group_recruitment_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_group_recruitment_post(uuid) TO authenticated;

COMMIT;

-- REVIEW BLOCKERS / REQUIRED TESTS (not SQL commands):
-- 1. Test-only metadata review (2026-11-17) confirmed the existing UNIQUE
--    study_groups(id, course_id, term_id) key, courses.term_id, and the group-to-
--    course composite FK. Recheck these immediately before any application.
-- 2. This proposal preserves the existing broad profiles RLS: authenticated
--    users may read profiles sharing any course, with no current-term filter.
--    The new member-list RPCs use that same audience via shares_course_with,
--    while returning only display_name, major, year, bio, and skills. The group
--    course-detail list itself remains current-term and requires >=2 active
--    memberships; pending invitations do not count. Existing creator/invitee
--    visibility for their own forming group is unchanged for invitation flow.
-- 3. RPC-only table access: verify table/function ownership and that SECURITY
--    DEFINER RPC owners can access tables and private helpers. There are no
--    direct app-role table grants or SELECT RLS policies on the new tables.
--    Do not expose private schema or grant helpers to browser roles for this.
-- 4. Chat rules: active/former members may read, only active members may send;
--    pending invitees/requesters cannot access chat. Sending is blocked only
--    when group status is abandoned; active members may send in archived groups.
--    Test two authenticated students and unauthenticated denial on Test.
-- 5. Posts: current-term enrolled course peers can read; Apply is enabled only
--    for an eligible viewer with open profile, no active membership in the same
--    course/term, and no pending invitation/request for that group. Archived or
--    abandoned groups close their open posts; all posts stay readable but have
--    no Apply/edit/close action. Verify trigger and RPC behavior.
-- 6. Membership end: preserve current-leader succession (earliest joined_at,
--    then created_at/id). If no active member remains, abandon the group, expire
--    pending invitations as before, and mark pending join requests cancelled.
--    This replaces the existing Test behavior that marked those requests expired;
--    coordinate this function change with Roy.
-- 7. Pagination API: posts default 20, course groups 25, member list 50, hard
--    maximum 100. Cursors are keyset-based; has_more is returned. Page size is
--    not a group-capacity limit. No maximum group size is added.
-- 8. Confirm the selectors/cursor identifiers and text limits (message 4000,
--    post 2000 characters) with Jeffery before migration sign-off.
-- 9. Required authorized QA after separate approval: direct table reads/writes
--    denied for anon/authenticated; authenticated RPC access/denials for active
--    member, former member, outsider, pending invitee/requester, course peer,
--    author, former author, archived and abandoned group; pagination/cursor
--    edges; Apply flags; group >=2-active threshold; last-member cancellation;
--    no unauthenticated access. Test data/scenarios require separate approval.
-- 10. Separate Test advisory: private.citylink_schema_migrations has RLS disabled.
--     Role privilege checks in this inspection showed no table privileges for
--     anon/authenticated/service_role, but do not auto-enable RLS here. Review
--     the migration tool's access needs and policies separately.
-- 11. This file remains a proposal, not a reproducible migration. Once reviewed,
--     move an approved forward-only version to supabase/migrations/ and require
--     Adam's separate explicit approval before applying it to Test.
