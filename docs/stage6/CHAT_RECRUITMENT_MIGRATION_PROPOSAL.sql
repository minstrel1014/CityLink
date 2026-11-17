-- PROPOSAL ONLY — NOT A MIGRATION; DO NOT APPLY TO ANY DATABASE.
-- Target for future review only: CityLink disposable Supabase Test
-- ref wkzclgmhrtecnpexfesr. Never apply to Main.
-- Prepared 2026-11-17 for Adam / Role 6 review.
-- This draft needs SQL-owner review, policy review, and explicit approval.
-- It intentionally does not alter existing profiles RLS, Roy's group RPCs,
-- membership/leader succession, group capacity, or direct table write grants.

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

ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_recruitment_posts ENABLE ROW LEVEL SECURITY;

-- Private helpers authorize only the signed-in actor; callers cannot pass a
-- different user ID. The private schema is not to be added to PostgREST's
-- exposed schemas. Role 6 must verify helper EXECUTE/schema grants.
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
     );
$function$;

CREATE OR REPLACE FUNCTION private.can_read_current_term_post(p_post_id uuid)
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
       JOIN public.citylink_settings AS s
         ON s.singleton AND s.current_term_id = p.term_id
       JOIN public.enrolments AS e
         ON e.course_id = p.course_id
        AND e.student_id = (SELECT auth.uid())
       WHERE p.id = p_post_id
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
         AND g.status = 'active'
         AND EXISTS (
           SELECT 1 FROM public.group_memberships AS m
           WHERE m.group_id = g.id
             AND m.profile_id = (SELECT auth.uid())
             AND m.membership_status = 'active'
         )
     );
$function$;

-- A nonmember coursemate can browse only forming/active groups in the current
-- term. This is separate from chat-history authorization above.
CREATE POLICY group_chat_messages_read_member_or_former
  ON public.group_chat_messages
  FOR SELECT TO authenticated
  USING (private.can_read_group_chat(group_id));

CREATE POLICY group_recruitment_posts_read_current_term_course_peers
  ON public.group_recruitment_posts
  FOR SELECT TO authenticated
  USING (private.can_read_current_term_post(id));

-- No direct browser table access: even SELECT would reveal internal columns.
-- Read/write only through field-limited, authorization-checking RPCs.
REVOKE ALL ON TABLE public.group_chat_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.group_recruitment_posts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.can_read_group_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_send_group_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_browse_current_term_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_read_current_term_post(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_recruitment_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_group_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_send_group_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_browse_current_term_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_current_term_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_recruitment_post(uuid) TO authenticated;

-- Route selectors are exactly the two IDs approved by Jeffery: group UUID and
-- profile UUID are non-displayed selectors only. Each function reauthorizes.
CREATE OR REPLACE FUNCTION public.list_current_term_course_groups(p_course_id uuid)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  group_status text,
  active_member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT g.id, g.name, g.status,
         count(m.id) FILTER (WHERE m.membership_status = 'active')
  FROM public.study_groups AS g
  JOIN public.citylink_settings AS s
    ON s.singleton AND s.current_term_id = g.term_id
  JOIN public.enrolments AS viewer_enrolment
    ON viewer_enrolment.course_id = g.course_id
   AND viewer_enrolment.student_id = (SELECT auth.uid())
  LEFT JOIN public.group_memberships AS m
    ON m.group_id = g.id AND m.membership_status = 'active'
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND g.course_id = p_course_id
    AND g.status IN ('forming', 'active')
    AND private.can_browse_current_term_group(g.id)
  GROUP BY g.id, g.name, g.status
  ORDER BY g.name, g.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_current_term_group_members(p_group_id uuid)
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
  JOIN public.enrolments AS viewer_enrolment
    ON viewer_enrolment.course_id = g.course_id
   AND viewer_enrolment.student_id = (SELECT auth.uid())
  JOIN public.group_memberships AS m
    ON m.group_id = g.id AND m.membership_status = 'active'
  JOIN public.enrolments AS member_enrolment
    ON member_enrolment.course_id = g.course_id
   AND member_enrolment.student_id = m.profile_id
  JOIN public.profiles AS p ON p.id = m.profile_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND g.id = p_group_id
    AND g.status IN ('forming', 'active')
    AND private.can_browse_current_term_group(g.id)
  ORDER BY m.joined_at, m.created_at, p.id;
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
  JOIN public.enrolments AS viewer_enrolment
    ON viewer_enrolment.course_id = g.course_id
   AND viewer_enrolment.student_id = (SELECT auth.uid())
  JOIN public.group_memberships AS m
    ON m.group_id = g.id
   AND m.profile_id = p_profile_id
   AND m.membership_status = 'active'
  JOIN public.enrolments AS member_enrolment
    ON member_enrolment.course_id = g.course_id
   AND member_enrolment.student_id = p_profile_id
  JOIN public.profiles AS p ON p.id = p_profile_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND g.id = p_group_id
    AND g.status IN ('forming', 'active')
    AND private.can_browse_current_term_group(g.id);
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

CREATE OR REPLACE FUNCTION public.list_group_recruitment_posts(p_course_id uuid)
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
  apply_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id,
         CASE WHEN g.status IN ('forming', 'active') THEN g.id ELSE NULL END,
         CASE WHEN g.status IN ('forming', 'active') THEN g.name ELSE NULL END,
         CASE WHEN g.status IN ('forming', 'active') THEN
           (SELECT count(*) FROM public.group_memberships AS m
            WHERE m.group_id = g.id AND m.membership_status = 'active')
           ELSE NULL END,
         p.author_name_snapshot,
         p.body,
         p.status,
         p.created_at,
         p.updated_at,
         p.closed_at,
         (p.status = 'open' AND g.status = 'active'
           AND private.is_current_term(g.term_id))
  FROM public.group_recruitment_posts AS p
  JOIN public.study_groups AS g
    ON g.id = p.group_id AND g.course_id = p.course_id AND g.term_id = p.term_id
  JOIN public.citylink_settings AS s
    ON s.singleton AND s.current_term_id = p.term_id
  JOIN public.enrolments AS e
    ON e.course_id = p.course_id AND e.student_id = (SELECT auth.uid())
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND p.course_id = p_course_id
  ORDER BY p.created_at DESC, p.id DESC;
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

REVOKE ALL ON FUNCTION public.list_current_term_course_groups(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_current_term_group_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_term_group_member_profile(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_group_chat_messages(uuid, timestamptz, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_group_chat_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_group_recruitment_posts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_recruitment_post(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_group_recruitment_post(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_group_recruitment_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_current_term_course_groups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_current_term_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_term_group_member_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_group_chat_messages(uuid, timestamptz, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_group_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_group_recruitment_posts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_recruitment_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_group_recruitment_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_group_recruitment_post(uuid) TO authenticated;

COMMIT;

-- REVIEW BLOCKERS / REQUIRED TESTS (not SQL commands):
-- 1. Verify the existing composite unique key on study_groups(id,course_id,term_id)
--    and private helper grants/search_path before approving this draft.
-- 2. Decide the approved display/count treatment for posts whose groups become
--    archived/abandoned. This draft preserves post visibility but hides group
--    IDs/name/count and disables opening/applying when group status is outside
--    forming/active. This reconciles closed-post visibility with group browsing.
-- 3. Review and adjust proposed message/post text limits (4000/2000 chars).
-- 4. Test RLS directly and via RPC as active member, former member, outsider,
--    pending invitee, join requester, current-term peer, old-term peer, author,
--    former author, and unauthenticated caller. No test records may be created
--    in Test until separately approved.
-- 5. No changes to profiles RLS or legacy list_course_classmates are included.
--    Existing broad profile policy/legacy function remain a separate security
--    issue and this proposal does not claim to remediate them.
