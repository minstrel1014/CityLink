-- CityLink live schema dump (structure only, no rows, no secrets)
-- project pijslbchvstkoweslymr (CityLink Launch), generated 2026-11-23 17:53:23.609107+00

-- ===== TABLES =====
create table if not exists public.academic_terms (id uuid not null default gen_random_uuid(), code text not null, starts_on date, ends_on date, created_at timestamp with time zone not null default now());
create table if not exists public.citylink_settings (singleton boolean not null default true, current_term_id uuid not null, updated_at timestamp with time zone not null default now());
create table if not exists public.courses (id uuid not null default gen_random_uuid(), code text not null, title text not null, department text not null, credits numeric not null, semester text not null, description text not null default ''::text, color text not null default 'blue'::text, created_at timestamp with time zone not null default now(), term_id uuid not null);
create table if not exists public.direct_messages (id uuid not null default gen_random_uuid(), thread_id uuid not null, sender_id uuid, sender_name_snapshot text not null, body text not null, created_at timestamp with time zone not null default now(), read_at timestamp with time zone);
create table if not exists public.direct_threads (id uuid not null default gen_random_uuid(), user_a uuid not null, user_b uuid not null, created_at timestamp with time zone not null default now(), last_message_at timestamp with time zone not null default now());
create table if not exists public.enrolments (student_id uuid not null, course_id uuid not null, created_at timestamp with time zone not null default now());
create table if not exists public.group_chat_messages (id uuid not null default gen_random_uuid(), group_id uuid not null, sender_id uuid, sender_name_snapshot text not null, body text not null, created_at timestamp with time zone not null default now());
create table if not exists public.group_invitations (id uuid not null default gen_random_uuid(), group_id uuid not null, course_id uuid not null, term_id uuid not null, sender_id uuid, recipient_id uuid, sender_name_snapshot text not null default 'Deleted User'::text, recipient_name_snapshot text not null default 'Deleted User'::text, status text not null default 'pending'::text, created_at timestamp with time zone not null default now(), responded_at timestamp with time zone, cancelled_at timestamp with time zone, updated_at timestamp with time zone not null default now());
create table if not exists public.group_join_requests (id uuid not null default gen_random_uuid(), group_id uuid not null, course_id uuid not null, term_id uuid not null, requester_id uuid, requester_name_snapshot text not null default 'Deleted User'::text, status text not null default 'pending'::text, reviewed_by uuid, created_at timestamp with time zone not null default now(), reviewed_at timestamp with time zone, cancelled_at timestamp with time zone, updated_at timestamp with time zone not null default now());
create table if not exists public.group_memberships (id uuid not null default gen_random_uuid(), group_id uuid not null, course_id uuid not null, term_id uuid not null, profile_id uuid, display_name_snapshot text not null default 'Deleted User'::text, membership_status text not null default 'active'::text, joined_at timestamp with time zone not null default now(), ended_at timestamp with time zone, created_at timestamp with time zone not null default now());
create table if not exists public.group_recruitment_posts (id uuid not null default gen_random_uuid(), group_id uuid not null, course_id uuid not null, term_id uuid not null, author_id uuid, author_name_snapshot text not null, body text not null, status text not null default 'open'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), closed_at timestamp with time zone, subject text not null);
create table if not exists public.invitations (id uuid not null default gen_random_uuid(), sender_id uuid not null, recipient_id uuid not null, course_id uuid not null, status text not null default 'pending'::text, created_at timestamp with time zone not null default now(), responded_at timestamp with time zone, cancelled_at timestamp with time zone, updated_at timestamp with time zone not null default now());
create table if not exists public.profiles (id uuid not null, student_id text, display_name text not null default 'New CityLink member'::text, major text, year smallint not null default 1, bio text not null default ''::text, skills ARRAY not null default '{}'::text[], status text not null default 'open'::text, avatar_url text, color text not null default 'blue'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table if not exists public.study_groups (id uuid not null default gen_random_uuid(), course_id uuid not null, term_id uuid not null, creator_id uuid, status text not null default 'forming'::text, name text not null default ''::text, created_at timestamp with time zone not null default now(), activated_at timestamp with time zone, updated_at timestamp with time zone not null default now(), max_members integer);

-- ===== CONSTRAINTS =====
alter table public.academic_terms add constraint academic_terms_check CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (starts_on <= ends_on)));
alter table public.academic_terms add constraint academic_terms_code_check CHECK (((char_length(code) >= 1) AND (char_length(code) <= 80)));
alter table public.academic_terms add constraint academic_terms_code_key UNIQUE (code);
alter table public.academic_terms add constraint academic_terms_pkey PRIMARY KEY (id);
alter table public.citylink_settings add constraint citylink_settings_current_term_id_fkey FOREIGN KEY (current_term_id) REFERENCES academic_terms(id) ON DELETE RESTRICT;
alter table public.citylink_settings add constraint citylink_settings_pkey PRIMARY KEY (singleton);
alter table public.citylink_settings add constraint citylink_settings_singleton_check CHECK (singleton);
alter table public.courses add constraint courses_code_check CHECK (((char_length(code) >= 1) AND (char_length(code) <= 32)));
alter table public.courses add constraint courses_code_semester_key UNIQUE (code, semester);
alter table public.courses add constraint courses_color_check CHECK (((char_length(color) >= 1) AND (char_length(color) <= 40)));
alter table public.courses add constraint courses_credits_check CHECK (((credits >= (0)::numeric) AND (credits <= 99.9)));
alter table public.courses add constraint courses_department_check CHECK (((char_length(department) >= 1) AND (char_length(department) <= 120)));
alter table public.courses add constraint courses_description_check CHECK ((char_length(description) <= 4000));
alter table public.courses add constraint courses_pkey PRIMARY KEY (id);
alter table public.courses add constraint courses_semester_check CHECK (((char_length(semester) >= 1) AND (char_length(semester) <= 80)));
alter table public.courses add constraint courses_term_id_fkey FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE RESTRICT;
alter table public.courses add constraint courses_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)));
alter table public.direct_messages add constraint direct_messages_body_length CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 2000)));
alter table public.direct_messages add constraint direct_messages_pkey PRIMARY KEY (id);
alter table public.direct_messages add constraint direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.direct_messages add constraint direct_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES direct_threads(id) ON DELETE CASCADE;
alter table public.direct_threads add constraint direct_threads_distinct_participants CHECK ((user_a <> user_b));
alter table public.direct_threads add constraint direct_threads_ordered_participants CHECK ((user_a < user_b));
alter table public.direct_threads add constraint direct_threads_pair_key UNIQUE (user_a, user_b);
alter table public.direct_threads add constraint direct_threads_pkey PRIMARY KEY (id);
alter table public.direct_threads add constraint direct_threads_user_a_fkey FOREIGN KEY (user_a) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.direct_threads add constraint direct_threads_user_b_fkey FOREIGN KEY (user_b) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.enrolments add constraint enrolments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.enrolments add constraint enrolments_pkey PRIMARY KEY (student_id, course_id);
alter table public.enrolments add constraint enrolments_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.group_chat_messages add constraint group_chat_messages_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 4000)));
alter table public.group_chat_messages add constraint group_chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE RESTRICT;
alter table public.group_chat_messages add constraint group_chat_messages_pkey PRIMARY KEY (id);
alter table public.group_chat_messages add constraint group_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_chat_messages add constraint group_chat_messages_sender_name_snapshot_check CHECK (((char_length(sender_name_snapshot) >= 1) AND (char_length(sender_name_snapshot) <= 120)));
alter table public.group_invitations add constraint group_invitations_check CHECK (((sender_id IS NULL) OR (recipient_id IS NULL) OR (sender_id <> recipient_id)));
alter table public.group_invitations add constraint group_invitations_group_course_term_fkey FOREIGN KEY (group_id, course_id, term_id) REFERENCES study_groups(id, course_id, term_id) ON DELETE RESTRICT;
alter table public.group_invitations add constraint group_invitations_pkey PRIMARY KEY (id);
alter table public.group_invitations add constraint group_invitations_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_invitations add constraint group_invitations_recipient_name_snapshot_check CHECK (((char_length(recipient_name_snapshot) >= 1) AND (char_length(recipient_name_snapshot) <= 120)));
alter table public.group_invitations add constraint group_invitations_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_invitations add constraint group_invitations_sender_name_snapshot_check CHECK (((char_length(sender_name_snapshot) >= 1) AND (char_length(sender_name_snapshot) <= 120)));
alter table public.group_invitations add constraint group_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])));
alter table public.group_join_requests add constraint group_join_requests_group_course_term_fkey FOREIGN KEY (group_id, course_id, term_id) REFERENCES study_groups(id, course_id, term_id) ON DELETE RESTRICT;
alter table public.group_join_requests add constraint group_join_requests_pkey PRIMARY KEY (id);
alter table public.group_join_requests add constraint group_join_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_join_requests add constraint group_join_requests_requester_name_snapshot_check CHECK (((char_length(requester_name_snapshot) >= 1) AND (char_length(requester_name_snapshot) <= 120)));
alter table public.group_join_requests add constraint group_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_join_requests add constraint group_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text])));
alter table public.group_memberships add constraint group_memberships_check CHECK ((((membership_status = 'active'::text) AND (ended_at IS NULL) AND (profile_id IS NOT NULL)) OR ((membership_status <> 'active'::text) AND (ended_at IS NOT NULL))));
alter table public.group_memberships add constraint group_memberships_display_name_snapshot_check CHECK (((char_length(display_name_snapshot) >= 1) AND (char_length(display_name_snapshot) <= 120)));
alter table public.group_memberships add constraint group_memberships_group_course_term_fkey FOREIGN KEY (group_id, course_id, term_id) REFERENCES study_groups(id, course_id, term_id) ON DELETE RESTRICT;
alter table public.group_memberships add constraint group_memberships_membership_status_check CHECK ((membership_status = ANY (ARRAY['active'::text, 'left'::text, 'removed'::text, 'account_deleted'::text])));
alter table public.group_memberships add constraint group_memberships_pkey PRIMARY KEY (id);
alter table public.group_memberships add constraint group_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_recruitment_posts add constraint group_recruitment_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.group_recruitment_posts add constraint group_recruitment_posts_author_name_snapshot_check CHECK (((char_length(author_name_snapshot) >= 1) AND (char_length(author_name_snapshot) <= 120)));
alter table public.group_recruitment_posts add constraint group_recruitment_posts_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 2000)));
alter table public.group_recruitment_posts add constraint group_recruitment_posts_closed_at_check CHECK ((((status = 'open'::text) AND (closed_at IS NULL)) OR ((status = 'closed'::text) AND (closed_at IS NOT NULL))));
alter table public.group_recruitment_posts add constraint group_recruitment_posts_group_course_term_fkey FOREIGN KEY (group_id, course_id, term_id) REFERENCES study_groups(id, course_id, term_id) ON DELETE RESTRICT;
alter table public.group_recruitment_posts add constraint group_recruitment_posts_pkey PRIMARY KEY (id);
alter table public.group_recruitment_posts add constraint group_recruitment_posts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
alter table public.group_recruitment_posts add constraint group_recruitment_posts_subject_length_chk CHECK (((subject = btrim(subject)) AND ((char_length(subject) >= 1) AND (char_length(subject) <= 120))));
alter table public.invitations add constraint invitations_check CHECK ((sender_id <> recipient_id));
alter table public.invitations add constraint invitations_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.invitations add constraint invitations_pkey PRIMARY KEY (id);
alter table public.invitations add constraint invitations_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.invitations add constraint invitations_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.invitations add constraint invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])));
alter table public.profiles add constraint profiles_bio_check CHECK ((char_length(bio) <= 2000));
alter table public.profiles add constraint profiles_color_check CHECK (((char_length(color) >= 1) AND (char_length(color) <= 40)));
alter table public.profiles add constraint profiles_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 120)));
alter table public.profiles add constraint profiles_display_name_length_chk CHECK (((display_name = btrim(display_name)) AND ((char_length(display_name) >= 1) AND (char_length(display_name) <= 50))));
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_status_group_status_check CHECK ((status = ANY (ARRAY['open'::text, 'considering'::text, 'full'::text])));
alter table public.profiles add constraint profiles_student_id_key UNIQUE (student_id);
alter table public.profiles add constraint profiles_year_1_to_6_check CHECK (((year >= 1) AND (year <= 6)));
alter table public.study_groups add constraint study_groups_course_term_fkey FOREIGN KEY (course_id, term_id) REFERENCES courses(id, term_id) ON DELETE RESTRICT;
alter table public.study_groups add constraint study_groups_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.study_groups add constraint study_groups_id_course_id_term_id_key UNIQUE (id, course_id, term_id);
alter table public.study_groups add constraint study_groups_max_members_chk CHECK (((max_members IS NULL) OR ((max_members >= 2) AND (max_members <= 19))));
alter table public.study_groups add constraint study_groups_name_check CHECK ((char_length(name) <= 120));
alter table public.study_groups add constraint study_groups_name_length_chk CHECK (((name = ''::text) OR ((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 50)))));
alter table public.study_groups add constraint study_groups_pkey PRIMARY KEY (id);
alter table public.study_groups add constraint study_groups_status_check CHECK ((status = ANY (ARRAY['forming'::text, 'active'::text, 'abandoned'::text, 'archived'::text])));
alter table public.study_groups add constraint study_groups_term_id_fkey FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE RESTRICT;

-- ===== INDEXES =====
CREATE UNIQUE INDEX academic_terms_code_key ON public.academic_terms USING btree (code);
CREATE UNIQUE INDEX academic_terms_pkey ON public.academic_terms USING btree (id);
CREATE UNIQUE INDEX citylink_settings_pkey ON public.citylink_settings USING btree (singleton);
CREATE UNIQUE INDEX courses_code_semester_key ON public.courses USING btree (code, semester);
CREATE UNIQUE INDEX courses_id_term_id_uidx ON public.courses USING btree (id, term_id);
CREATE UNIQUE INDEX courses_pkey ON public.courses USING btree (id);
CREATE INDEX courses_term_id_idx ON public.courses USING btree (term_id);
CREATE UNIQUE INDEX direct_messages_pkey ON public.direct_messages USING btree (id);
CREATE INDEX direct_messages_sender_recent_idx ON public.direct_messages USING btree (sender_id, created_at DESC);
CREATE INDEX direct_messages_thread_page_idx ON public.direct_messages USING btree (thread_id, created_at DESC, id DESC);
CREATE INDEX direct_messages_unread_idx ON public.direct_messages USING btree (thread_id, sender_id, read_at);
CREATE UNIQUE INDEX direct_threads_pair_key ON public.direct_threads USING btree (user_a, user_b);
CREATE UNIQUE INDEX direct_threads_pkey ON public.direct_threads USING btree (id);
CREATE INDEX direct_threads_user_a_recent_idx ON public.direct_threads USING btree (user_a, last_message_at DESC);
CREATE INDEX direct_threads_user_b_recent_idx ON public.direct_threads USING btree (user_b, last_message_at DESC);
CREATE INDEX enrolments_course_student_idx ON public.enrolments USING btree (course_id, student_id);
CREATE UNIQUE INDEX enrolments_pkey ON public.enrolments USING btree (student_id, course_id);
CREATE INDEX group_chat_messages_group_created_idx ON public.group_chat_messages USING btree (group_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX group_chat_messages_pkey ON public.group_chat_messages USING btree (id);
CREATE INDEX group_invitations_group_idx ON public.group_invitations USING btree (group_id, created_at);
CREATE UNIQUE INDEX group_invitations_one_pending_per_group_recipient_idx ON public.group_invitations USING btree (group_id, recipient_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX group_invitations_pkey ON public.group_invitations USING btree (id);
CREATE INDEX group_invitations_recipient_idx ON public.group_invitations USING btree (recipient_id, created_at DESC);
CREATE INDEX group_invitations_sender_idx ON public.group_invitations USING btree (sender_id, created_at DESC);
CREATE INDEX group_join_requests_group_idx ON public.group_join_requests USING btree (group_id, created_at DESC);
CREATE UNIQUE INDEX group_join_requests_one_pending_per_group_requester_idx ON public.group_join_requests USING btree (group_id, requester_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX group_join_requests_pkey ON public.group_join_requests USING btree (id);
CREATE INDEX group_join_requests_requester_idx ON public.group_join_requests USING btree (requester_id, created_at DESC);
CREATE INDEX group_memberships_active_group_join_cursor_idx ON public.group_memberships USING btree (group_id, joined_at, id) WHERE (membership_status = 'active'::text);
CREATE INDEX group_memberships_group_status_idx ON public.group_memberships USING btree (group_id, membership_status);
CREATE UNIQUE INDEX group_memberships_one_active_per_student_course_term_idx ON public.group_memberships USING btree (profile_id, course_id, term_id) WHERE ((membership_status = 'active'::text) AND (profile_id IS NOT NULL));
CREATE UNIQUE INDEX group_memberships_one_active_row_per_group_profile_idx ON public.group_memberships USING btree (group_id, profile_id) WHERE ((membership_status = 'active'::text) AND (profile_id IS NOT NULL));
CREATE UNIQUE INDEX group_memberships_pkey ON public.group_memberships USING btree (id);
CREATE INDEX group_recruitment_posts_course_created_idx ON public.group_recruitment_posts USING btree (course_id, created_at DESC, id DESC);
CREATE INDEX group_recruitment_posts_group_status_idx ON public.group_recruitment_posts USING btree (group_id, status, created_at DESC);
CREATE UNIQUE INDEX group_recruitment_posts_pkey ON public.group_recruitment_posts USING btree (id);
CREATE UNIQUE INDEX invitations_one_active_per_pair_course_idx ON public.invitations USING btree (course_id, LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text]));
CREATE UNIQUE INDEX invitations_pkey ON public.invitations USING btree (id);
CREATE INDEX invitations_recipient_idx ON public.invitations USING btree (recipient_id, created_at DESC);
CREATE INDEX invitations_sender_idx ON public.invitations USING btree (sender_id, created_at DESC);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX profiles_student_id_key ON public.profiles USING btree (student_id);
CREATE INDEX study_groups_course_term_status_idx ON public.study_groups USING btree (course_id, term_id, status);
CREATE UNIQUE INDEX study_groups_id_course_id_term_id_key ON public.study_groups USING btree (id, course_id, term_id);
CREATE UNIQUE INDEX study_groups_one_forming_per_creator_course_term_idx ON public.study_groups USING btree (creator_id, course_id, term_id) WHERE ((creator_id IS NOT NULL) AND (status = 'forming'::text));
CREATE UNIQUE INDEX study_groups_pkey ON public.study_groups USING btree (id);

-- ===== ROW LEVEL SECURITY =====
alter table public.academic_terms enable row level security;
alter table public.citylink_settings enable row level security;
alter table public.courses enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_threads enable row level security;
alter table public.enrolments enable row level security;
alter table public.group_chat_messages enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_join_requests enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_recruitment_posts enable row level security;
alter table public.invitations enable row level security;
alter table public.profiles enable row level security;
alter table public.study_groups enable row level security;

-- ===== POLICIES =====
create policy "authenticated read academic terms" on public.academic_terms as permissive for SELECT to authenticated using (true);
create policy "authenticated read current term setting" on public.citylink_settings as permissive for SELECT to authenticated using ((singleton = true));
create policy "authenticated users read demo course catalog" on public.courses as permissive for SELECT to authenticated using (true);
create policy "users add own course enrolment" on public.enrolments as permissive for INSERT to authenticated using (true) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "users read own enrolments" on public.enrolments as permissive for SELECT to authenticated using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "users remove own course enrolment" on public.enrolments as permissive for DELETE to authenticated using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "participants read group invitations" on public.group_invitations as permissive for SELECT to authenticated using (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid)) OR private.is_active_group_member(group_id, ( SELECT auth.uid() AS uid))));
create policy "requester and current leader read join requests" on public.group_join_requests as permissive for SELECT to authenticated using (((requester_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM study_groups g
  WHERE ((g.id = group_join_requests.group_id) AND (g.creator_id = ( SELECT auth.uid() AS uid)) AND private.is_active_group_member(g.id, ( SELECT auth.uid() AS uid)))))));
create policy "members read group memberships" on public.group_memberships as permissive for SELECT to authenticated using ((private.is_active_group_member(group_id, ( SELECT auth.uid() AS uid)) OR (profile_id = ( SELECT auth.uid() AS uid))));
create policy "enrolled sender creates pending invitation" on public.invitations as permissive for INSERT to authenticated using (true) with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (sender_id <> recipient_id) AND (status = 'pending'::text) AND private.both_enrolled_in_course(sender_id, recipient_id, course_id) AND private.recipient_can_receive_invitation(recipient_id)));
create policy "invitation participants read" on public.invitations as permissive for SELECT to authenticated using (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid))));
create policy "recipient responds to pending invitation" on public.invitations as permissive for UPDATE to authenticated using (((recipient_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text))) with check (((recipient_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text]))));
create policy "sender cancels pending invitation" on public.invitations as permissive for UPDATE to authenticated using (((sender_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text))) with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (status = 'cancelled'::text)));
create policy "profiles editable by owner" on public.profiles as permissive for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));
create policy "profiles visible to self and course peers" on public.profiles as permissive for SELECT to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR private.shares_course_with(id)));
create policy "authenticated read eligible groups" on public.study_groups as permissive for SELECT to authenticated using (private.can_view_group(id, ( SELECT auth.uid() AS uid)));

-- ===== TRIGGERS =====
CREATE TRIGGER direct_messages_touch_thread AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION private.touch_direct_thread_last_message();
CREATE TRIGGER group_memberships_leadership_after_update AFTER UPDATE OF membership_status, profile_id ON public.group_memberships FOR EACH ROW EXECUTE FUNCTION private.handle_group_membership_end();
CREATE TRIGGER group_memberships_leadership_after_delete AFTER DELETE ON public.group_memberships FOR EACH ROW EXECUTE FUNCTION private.handle_group_membership_end();
CREATE TRIGGER group_recruitment_posts_close_on_membership_end AFTER DELETE OR UPDATE OF membership_status, profile_id ON public.group_memberships FOR EACH ROW EXECUTE FUNCTION private.close_recruitment_posts_on_membership_end();
CREATE TRIGGER invitations_enforce_integrity BEFORE INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION enforce_invitation_integrity();
CREATE TRIGGER group_recruitment_posts_close_on_profile_delete BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.close_recruitment_posts_on_profile_delete();
CREATE TRIGGER group_recruitment_posts_close_on_group_terminal AFTER UPDATE OF status ON public.study_groups FOR EACH ROW EXECUTE FUNCTION private.close_recruitment_posts_on_group_terminal();

-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION private.archive_deleted_profile_citylink_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
begin
  update public.group_memberships
  set profile_id = null,
      display_name_snapshot = 'Deleted User',
      membership_status = case when membership_status = 'active'
        then 'account_deleted' else membership_status end,
      ended_at = case when membership_status = 'active'
        then clock_timestamp() else ended_at end
  where profile_id = old.id;

  for v_group_id in
    select g.id
    from public.study_groups as g
    where g.creator_id = old.id
      and g.status in ('forming', 'active')
    order by g.id
  loop
    perform private.reconcile_group_leader_after_membership_end(v_group_id, old.id);
  end loop;

  update public.group_invitations
  set sender_id = case when sender_id = old.id then null else sender_id end,
      recipient_id = case when recipient_id = old.id then null else recipient_id end,
      sender_name_snapshot = case when sender_id = old.id then 'Deleted User' else sender_name_snapshot end,
      recipient_name_snapshot = case when recipient_id = old.id then 'Deleted User' else recipient_name_snapshot end,
      status = case when status = 'pending' and (sender_id = old.id or recipient_id = old.id)
        then 'cancelled' else status end,
      cancelled_at = case when status = 'pending' and (sender_id = old.id or recipient_id = old.id)
        then clock_timestamp() else cancelled_at end,
      updated_at = case when sender_id = old.id or recipient_id = old.id
        then clock_timestamp() else updated_at end
  where sender_id = old.id or recipient_id = old.id;

  update public.group_join_requests
  set requester_id = case when requester_id = old.id then null else requester_id end,
      requester_name_snapshot = case when requester_id = old.id then 'Deleted User' else requester_name_snapshot end,
      reviewed_by = case when reviewed_by = old.id then null else reviewed_by end,
      status = case when status = 'pending' and requester_id = old.id
        then 'cancelled' else status end,
      cancelled_at = case when status = 'pending' and requester_id = old.id
        then clock_timestamp() else cancelled_at end,
      reviewed_at = case when status = 'pending' and requester_id = old.id
        then clock_timestamp() else reviewed_at end,
      updated_at = case when requester_id = old.id or reviewed_by = old.id
        then clock_timestamp() else updated_at end
  where requester_id = old.id or reviewed_by = old.id;

  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.assert_group_has_capacity(p_group_id uuid, p_additional_members integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_max_members integer;
  v_status text;
  v_count integer;
begin
  if p_group_id is null then
    raise exception 'group not found';
  end if;
  if p_additional_members is null or p_additional_members < 1 then
    raise exception 'invalid capacity addition';
  end if;

  select g.max_members, g.status
    into v_max_members, v_status
  from public.study_groups as g
  where g.id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;
  if v_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;

  v_count := private.group_active_member_count(p_group_id);

  -- Over-limit takes precedence over the unconfigured message: an existing
  -- group above 19 must be reduced before it can choose a maximum.
  if v_count > 19 then
    raise exception 'This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.';
  end if;
  if v_max_members is null then
    raise exception 'Group maximum is not set';
  end if;
  if v_count + p_additional_members > v_max_members then
    raise exception 'Group is full';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.both_enrolled_in_course(p_left_profile_id uuid, p_right_profile_id uuid, p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p_left_profile_id is not null
    and p_right_profile_id is not null
    and p_course_id is not null
    and p_left_profile_id <> p_right_profile_id
    and exists (
      select 1
      from public.enrolments as left_enrolment
      join public.enrolments as right_enrolment
        on right_enrolment.course_id = left_enrolment.course_id
      where left_enrolment.student_id = p_left_profile_id
        and right_enrolment.student_id = p_right_profile_id
        and left_enrolment.course_id = p_course_id
    );
$function$
;

CREATE OR REPLACE FUNCTION private.can_browse_current_term_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.study_groups as g
       join public.citylink_settings as s
         on s.singleton and s.current_term_id = g.term_id
       join public.enrolments as e
         on e.course_id = g.course_id
        and e.student_id = (select auth.uid())
       where g.id = p_group_id
         and g.status in ('forming', 'active')
     );
$function$
;

CREATE OR REPLACE FUNCTION private.can_manage_recruitment_post(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION private.can_read_group_chat(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION private.can_send_group_chat(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION private.can_view_group(p_group_id uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.study_groups g
    where g.id = p_group_id and p_profile_id is not null
      and (
        private.is_active_group_member(g.id, p_profile_id)
        or (
          g.status in ('forming', 'active')
          and private.is_current_term(g.term_id)
          and private.is_enrolled(p_profile_id, g.course_id)
        )
        or (g.status = 'forming' and (
          g.creator_id = p_profile_id
          or exists (
            select 1 from public.group_invitations i
            where i.group_id = g.id and i.recipient_id = p_profile_id
              and i.status = 'pending'
          )
        ))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.cancel_pending_invitations_from_removed_member(p_group_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_creator uuid;
  v_status text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null or p_profile_id is null then
    raise exception 'invalid removal context';
  end if;

  select g.creator_id, g.status
    into v_creator, v_status
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if v_creator is distinct from v_actor
     or v_status not in ('forming', 'active') then
    raise exception 'only the current group leader may cancel removed-member invitations';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.group_id = p_group_id
      and m.profile_id = p_profile_id
      and m.membership_status = 'active'
  ) then
    raise exception 'target member is still active';
  end if;

  insert into private.group_removal_context(
    transaction_id, group_id, profile_id
  ) values (
    txid_current(), p_group_id, p_profile_id
  )
  on conflict (transaction_id, group_id, profile_id) do nothing;

  update public.group_invitations
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where group_id = p_group_id
    and sender_id = p_profile_id
    and status = 'pending';

  delete from private.group_removal_context
  where transaction_id = txid_current()
    and group_id = p_group_id
    and profile_id = p_profile_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.citylink_capacity_apply_gate()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_run     text := btrim(coalesce(current_setting('citylink.capacity_run_id', true), ''));
  v_target  text := btrim(coalesce(current_setting('citylink.capacity_target_ref', true), ''));
  v_pages   text := lower(btrim(coalesce(current_setting('citylink.capacity_pages_run', true), '')));
  v_verdict text := upper(btrim(coalesce(current_setting('citylink.capacity_preflight_verdict', true), '')));
  v_pins    text := btrim(coalesce(current_setting('citylink.capacity_pinned_digests', true), ''));
  v_major   text := btrim(coalesce(current_setting('citylink.capacity_engine_major', true), ''));
  v_blob    text := btrim(coalesce(current_setting('citylink.capacity_blob_identity', true), ''));

  -- F14: the authorised target is CityLink Launch; the frozen Prototype is the
  -- explicit out-of-scope ref. Neither constant is proof of identity — see the
  -- operator-declared caveat in the header.
  c_launch constant text := 'pijslbchvstkoweslymr';
  c_frozen constant text := 'wkzclgmhrtecnpexfesr';
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

  if v_target = c_frozen then
    raise exception 'group_capacity_gate_target_out_of_scope target=%', v_target
      using detail = 'the declared ref is the frozen Prototype project, which is '
                 || 'out of scope for the capacity release apply: it is kept as a '
                 || 'historical reference and must not be migrated (package '
                 || 'document §4.1).',
            hint = 'Declare the CityLink Launch ref instead. Out of scope is a '
                || 'scope decision, not a judgement that the Prototype is broken.',
            errcode = '45003';
  end if;

  if v_target <> c_launch then
    raise exception 'group_capacity_gate_target_unauthorized target=%', v_target
      using detail = 'the declared ref "' || v_target || '" is not CityLink Launch, '
                 || 'the only authorised target for this capacity apply.',
            errcode = '45004';
  end if;

  if position('00' in v_pages) = 0 or position('01' in v_pages) = 0
     or position('05' in v_pages) = 0 then
    raise exception 'group_capacity_gate_pages_incomplete target=%', v_target
      using detail = 'a capacity application must declare pages 00, 01 and 05 '
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
$function$
;

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_group_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_membership_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION private.close_recruitment_posts_on_profile_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.group_recruitment_posts
  SET status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
  WHERE author_id = OLD.id AND status = 'open';
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.group_active_member_count(p_group_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (
      select count(*)::integer
      from public.group_memberships as m
      where m.group_id = p_group_id
        and m.membership_status = 'active'
    )
    +
    case
      when exists (
        select 1
        from public.study_groups as g
        where g.id = p_group_id
          and g.status = 'forming'
          and g.creator_id is not null
          and not exists (
            select 1
            from public.group_memberships as m
            where m.group_id = p_group_id
              and m.profile_id = g.creator_id
              and m.membership_status = 'active'
          )
      ) then 1
      else 0
    end;
$function$
;

CREATE OR REPLACE FUNCTION private.handle_group_membership_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' then
    if old.membership_status = 'active'
       and (new.membership_status is distinct from 'active'
            or new.profile_id is distinct from old.profile_id) then
      perform private.reconcile_group_leader_after_membership_end(
        old.group_id,
        old.profile_id
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.membership_status = 'active' then
    perform private.reconcile_group_leader_after_membership_end(
      old.group_id,
      old.profile_id
    );
  end if;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_active_group_member(p_group_id uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_group_id is not null and p_profile_id is not null and exists (
    select 1 from public.group_memberships m
    where m.group_id = p_group_id and m.profile_id = p_profile_id
      and m.membership_status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_current_term(p_term_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.citylink_settings s
    where s.singleton and s.current_term_id = p_term_id
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_enrolled(p_profile_id uuid, p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_profile_id is not null and p_course_id is not null and exists (
    select 1 from public.enrolments e
    where e.student_id = p_profile_id and e.course_id = p_course_id
  );
$function$
;

CREATE OR REPLACE FUNCTION private.lock_course_profile(p_course_id uuid, p_term_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_profile_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_course_id::text || ':' || p_term_id::text || ':' || p_profile_id::text, 0
      )
    );
    perform p.id from public.profiles p where p.id = p_profile_id for share;
    perform e.student_id from public.enrolments e
    where e.student_id = p_profile_id and e.course_id = p_course_id
    for key share;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.lock_course_profiles(p_course_id uuid, p_term_id uuid, p_profile_a uuid, p_profile_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_profile_a is null then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
  elsif p_profile_b is null or p_profile_a = p_profile_b then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
  elsif p_profile_a::text < p_profile_b::text then
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
  else
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_b);
    perform private.lock_course_profile(p_course_id, p_term_id, p_profile_a);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.lock_current_term(p_term_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_term uuid;
begin
  select s.current_term_id into v_current_term
  from public.citylink_settings s where s.singleton for share;
  return v_current_term is not null and v_current_term = p_term_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.maybe_abandon_empty_forming_group(p_group_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH abandoned AS (
    UPDATE public.study_groups AS g
    SET status = 'abandoned', creator_id = NULL, updated_at = clock_timestamp()
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
  SET status = 'expired',
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  FROM abandoned AS a
  WHERE r.group_id = a.id AND r.status = 'pending';
$function$
;

CREATE OR REPLACE FUNCTION private.recipient_can_receive_invitation(p_recipient_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p_recipient_profile_id is not null
    and exists (
      select 1
      from public.profiles as recipient
      where recipient.id = p_recipient_profile_id
        and recipient.status in ('open', 'considering')
    );
$function$
;

CREATE OR REPLACE FUNCTION private.reconcile_group_leader_after_membership_end(p_group_id uuid, p_ended_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      UPDATE public.study_groups
      SET creator_id = NULL, status = 'abandoned', updated_at = clock_timestamp()
      WHERE id = p_group_id;
      UPDATE public.group_invitations
      SET status = 'expired',
          responded_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE group_id = p_group_id AND status = 'pending';
      UPDATE public.group_join_requests
      SET status = 'expired',
          reviewed_at = clock_timestamp(),
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
    SET status = 'expired',
        reviewed_at = clock_timestamp(),
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
$function$
;

CREATE OR REPLACE FUNCTION private.shares_course_with(p_other_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (select auth.uid()) is not null
    and (select auth.uid()) <> p_other_profile_id
    and exists (
      select 1
      from public.enrolments as mine
      join public.enrolments as theirs
        on theirs.course_id = mine.course_id
      where mine.student_id = (select auth.uid())
        and theirs.student_id = p_other_profile_id
    );
$function$
;

CREATE OR REPLACE FUNCTION private.shares_current_term_course_with(p_other_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.courses as c
    where private.is_current_term(c.term_id)
      and private.both_enrolled_in_course((select auth.uid()), p_other_profile_id, c.id)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.touch_direct_thread_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.direct_threads
     set last_message_at = new.created_at
   where id = new.thread_id
     and last_message_at < new.created_at;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_group_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_group uuid;
  v_course uuid;
  v_term uuid;
  v_sender uuid;
  v_recipient uuid;
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  select i.group_id, i.course_id, i.term_id, i.sender_id, i.recipient_id
    into v_group, v_course, v_term, v_sender, v_recipient
  from public.group_invitations i where i.id = p_invitation_id;
  if not found or v_sender is null then raise exception 'invitation not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_sender, v_recipient);
  perform 1 from public.study_groups g where g.id = v_group for update;
  select i.status into v_status from public.group_invitations i
    where i.id = p_invitation_id for update;
  if not found or v_status <> 'pending' then raise exception 'invitation is no longer pending'; end if;
  if v_sender <> v_actor then raise exception 'only the sender may cancel'; end if;
  update public.group_invitations set status = 'cancelled', cancelled_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = p_invitation_id;
  perform private.maybe_abandon_empty_forming_group(v_group);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_group_join_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_group uuid;
  v_course uuid;
  v_term uuid;
  v_requester uuid;
  v_status text;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  select r.group_id, r.course_id, r.term_id, r.requester_id
    into v_group, v_course, v_term, v_requester
  from public.group_join_requests r where r.id = p_request_id;
  if not found or v_requester is null then raise exception 'join request not found'; end if;
  perform private.lock_current_term(v_term);
  perform private.lock_course_profile(v_course, v_term, v_requester);
  perform 1 from public.study_groups g where g.id = v_group for update;
  select r.status into v_status from public.group_join_requests r
    where r.id = p_request_id for update;
  if not found or v_status <> 'pending' then raise exception 'join request is no longer pending'; end if;
  if v_requester <> v_actor then raise exception 'only the requester may cancel'; end if;
  update public.group_join_requests set status = 'cancelled',
    cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_group_recruitment_post(p_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  WHERE id = p_post_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post is no longer open';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_alone(p_course_id uuid, p_name text DEFAULT NULL::text, p_max_members integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_name text;
  v_display_name text;
  v_group uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  -- Role 6 finding F1: a group created without a maximum can never invite
  -- anybody, because the invitation path raises 'Group maximum is not set'.
  -- A maximum is therefore mandatory at creation, not optional.
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;
  select c.term_id into v_term from public.courses c where c.id = p_course_id;
  if v_term is null or not private.lock_current_term(v_term) then
    raise exception 'course is not in the current academic term';
  end if;
  if not private.is_enrolled(v_actor, p_course_id) then
    raise exception 'only enrolled students may create a group';
  end if;
  if exists (
    select 1 from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = p_course_id
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'you already belong to a group for this course and term';
  end if;
  select p.display_name into v_display_name
  from public.profiles as p where p.id = v_actor;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := coalesce(
      nullif(split_part(btrim(coalesce(v_display_name, '')), ' ', 1), ''),
      'New study group'
    ) || '''s group';
  end if;
  v_name := left(v_name, 50);
  insert into public.study_groups (
    course_id, term_id, creator_id, status, name, max_members, activated_at
  ) values (
    p_course_id, v_term, v_actor, 'active', v_name, p_max_members,
    clock_timestamp()
  ) returning id into v_group;
  insert into public.group_memberships (
    group_id, course_id, term_id, profile_id, display_name_snapshot,
    membership_status
  ) values (
    v_group, p_course_id, v_term, v_actor,
    left(coalesce(nullif(btrim(coalesce(v_display_name, '')), ''), 'CityLink member'), 120),
    'active'
  );
  return v_group;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text, p_max_members integer)
 RETURNS TABLE(group_id uuid, invitation_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_group uuid;
  v_group_max integer;
  v_invitation uuid;
  v_actor_name text;
  v_recipient_name text;
  v_name text := btrim(p_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'group name must contain 1 to 50 characters';
  end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;

  select c.term_id into v_term
  from public.courses as c
  where c.id = p_course_id;
  if v_term is null or not private.lock_current_term(v_term) then
    raise exception 'course is not in the current academic term';
  end if;

  perform private.lock_course_profiles(
    p_course_id, v_term, v_actor, p_recipient_id
  );
  if not private.is_enrolled(v_actor, p_course_id)
     or not private.is_enrolled(p_recipient_id, p_course_id) then
    raise exception 'both students must be enrolled in the course';
  end if;

  select p.display_name into v_actor_name
  from public.profiles as p
  where p.id = v_actor;
  select p.display_name into v_recipient_name
  from public.profiles as p
  where p.id = p_recipient_id
    and p.status in ('open', 'considering');
  if v_recipient_name is null then
    raise exception 'recipient is not accepting invitations';
  end if;

  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id in (v_actor, p_recipient_id)
      and m.course_id = p_course_id
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'a participant already belongs to a group for this course and term';
  end if;

  select g.id, g.max_members
    into v_group, v_group_max
  from public.study_groups as g
  where g.creator_id = v_actor
    and g.course_id = p_course_id
    and g.term_id = v_term
    and g.status = 'forming'
  for update;

  if v_group is null then
    insert into public.study_groups(
      course_id, term_id, creator_id, status, name, max_members
    ) values (
      p_course_id, v_term, v_actor, 'forming', v_name, p_max_members
    ) returning id into v_group;
    v_group_max := p_max_members;
  else
    -- Reusing a forming group must not bypass the required maximum. Do not
    -- silently overwrite it; the leader must use set_group_max_members.
    if v_group_max is null then
      raise exception 'Group maximum is not set; set a maximum before adding members';
    end if;
    if v_group_max is distinct from p_max_members then
      raise exception 'Group maximum does not match this group; edit the maximum before inviting';
    end if;
  end if;

  select i.id into v_invitation
  from public.group_invitations as i
  where i.group_id = v_group
    and i.recipient_id = p_recipient_id
    and i.status = 'pending';

  if v_invitation is null then
    -- One additional place is required for the invitation/acceptance path.
    perform private.assert_group_has_capacity(v_group, 1);
    insert into public.group_invitations(
      group_id, course_id, term_id, sender_id, recipient_id,
      sender_name_snapshot, recipient_name_snapshot
    ) values (
      v_group, p_course_id, v_term, v_actor, p_recipient_id,
      coalesce(v_actor_name, 'New CityLink member'), v_recipient_name
    ) returning id into v_invitation;
  end if;

  return query select v_group, v_invitation;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text)
 RETURNS TABLE(group_id uuid, invitation_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'group_capacity_upgrade_required'
    using errcode = '45000';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_recruitment_post(p_group_id uuid, p_subject text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_post_id uuid;
  v_course_id uuid;
  v_term_id uuid;
  v_group_status text;
  v_author_name text;
  v_subject text := btrim(p_subject);
  v_body text := btrim(p_body);
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if v_subject is null or char_length(v_subject) < 1 or char_length(v_subject) > 120 then
    raise exception 'subject must contain 1 to 120 characters';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'post must contain 1 to 2000 characters';
  end if;
  perform 1
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.profile_id = (select auth.uid())
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'only an active member of a current-term group may post';
  end if;
  select g.course_id, g.term_id, g.status
    into v_course_id, v_term_id, v_group_status
  from public.study_groups as g where g.id = p_group_id
  for update;
  -- Role 6 finding F6: membership alone already implies the group is not
  -- abandoned, but reject it explicitly rather than relying on that.
  if v_course_id is null
     or v_group_status = 'abandoned'
     or not private.is_current_term(v_term_id)
     or not private.is_enrolled((select auth.uid()), v_course_id)
     or not private.is_active_group_member(p_group_id, (select auth.uid())) then
    raise exception 'only an active member of a current-term group may post';
  end if;
  select p.display_name into v_author_name
  from public.profiles as p where p.id = (select auth.uid());
  insert into public.group_recruitment_posts (
    group_id, course_id, term_id, author_id, author_name_snapshot, subject, body
  ) values (
    p_group_id, v_course_id, v_term_id, (select auth.uid()),
    coalesce(nullif(v_author_name, ''), 'CityLink member'), v_subject, v_body
  ) returning id into v_post_id;
  return v_post_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_group_recruitment_post(p_post_id uuid, p_subject text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject text := btrim(p_subject);
  v_body text := btrim(p_body);
  v_group_id uuid;
begin
  if v_subject is null or char_length(v_subject) < 1 or char_length(v_subject) > 120 then
    raise exception 'subject must contain 1 to 120 characters';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'post must contain 1 to 2000 characters';
  end if;
  select p.group_id into v_group_id
  from public.group_recruitment_posts as p where p.id = p_post_id;
  perform 1
  from public.group_memberships as m
  where m.group_id = v_group_id
    and m.profile_id = (select auth.uid())
    and m.membership_status = 'active'
  for update;
  if v_group_id is null or not found
     or not private.can_manage_recruitment_post(p_post_id) then
    raise exception 'only the active post author may edit this post';
  end if;
  update public.group_recruitment_posts
  set subject = v_subject, body = v_body, updated_at = now()
  where id = p_post_id and status = 'open';
  if not found then
    raise exception 'post is no longer open';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_invitation_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'new invitations must be pending';
    end if;

    if new.sender_id is not distinct from new.recipient_id then
      raise exception 'an invitation cannot target its sender';
    end if;

    if not private.both_enrolled_in_course(new.sender_id, new.recipient_id, new.course_id) then
      raise exception 'both invitation participants must be enrolled in the course';
    end if;

    if not private.recipient_can_receive_invitation(new.recipient_id) then
      raise exception 'the recipient is not accepting group invitations';
    end if;

    new.id := gen_random_uuid();
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.responded_at := null;
    new.cancelled_at := null;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.course_id is distinct from old.course_id
     or new.created_at is distinct from old.created_at then
    raise exception 'invitation identity fields are immutable';
  end if;

  if old.status <> 'pending' then
    raise exception 'a final invitation cannot be changed';
  end if;

  if new.status in ('accepted', 'declined') then
    if auth.uid() is distinct from old.recipient_id then
      raise exception 'only the invitation recipient may accept or decline';
    end if;
    new.responded_at := clock_timestamp();
    new.cancelled_at := null;
  elsif new.status = 'cancelled' then
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the invitation sender may cancel';
    end if;
    new.responded_at := null;
    new.cancelled_at := clock_timestamp();
  else
    raise exception 'pending invitations may only be accepted, declined, or cancelled';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_term_coursemate_profile(p_course_id uuid, p_profile_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.major, p.year, p.bio, p.skills
  from public.profiles as p
  join public.enrolments as target_enrolment
    on target_enrolment.student_id = p.id
   and target_enrolment.course_id = p_course_id
  join public.courses as c on c.id = target_enrolment.course_id
  join public.citylink_settings as s
    on s.singleton and s.current_term_id = c.term_id
  join public.enrolments as viewer_enrolment
    on viewer_enrolment.student_id = (select auth.uid())
   and viewer_enrolment.course_id = p_course_id
  where (select auth.uid()) is not null
    and p.id = p_profile_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_term_group_member_profile(p_group_id uuid, p_profile_id uuid)
 RETURNS TABLE(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.major, p.year, p.bio, p.skills
  from public.study_groups as g
  join public.citylink_settings as s
    on s.singleton and s.current_term_id = g.term_id
  join public.group_memberships as m
    on m.group_id = g.id
   and m.profile_id = p_profile_id
   and m.membership_status = 'active'
  join public.profiles as p on p.id = p_profile_id
  where (select auth.uid()) is not null
    and g.id = p_group_id
    and g.status in ('forming', 'active')
    and (
      (select count(*) from public.group_memberships as active_m
       where active_m.group_id = g.id
         and active_m.membership_status = 'active') >= 2
      or private.is_active_group_member(g.id, (select auth.uid()))
    )
    and (p_profile_id = (select auth.uid())
         or private.shares_course_with(p_profile_id));
$function$
;

CREATE OR REPLACE FUNCTION public.get_direct_thread_state(p_thread_id uuid)
 RETURNS TABLE(last_message_id uuid, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  return query
    select
      lm.id,
      lm.created_at,
      (select count(*) from public.direct_messages m
        where m.thread_id = p_thread_id
          and m.sender_id <> v_me
          and m.read_at is null)
    from (select 1) as one
    left join lateral (
      select m.id, m.created_at
      from public.direct_messages m
      where m.thread_id = p_thread_id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_group_chat_access(p_group_id uuid)
 RETURNS TABLE(can_read boolean, can_send boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.can_read_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'not authorized to read this group chat';
  END IF;
  RETURN QUERY SELECT true, private.can_send_group_chat(p_group_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'New CityLink member'),
      50
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_membership_id uuid;
  v_group_status text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null then
    raise exception 'invalid group';
  end if;
  select g.course_id, g.term_id
    into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.lock_current_term(v_term) then
    raise exception 'group is not in the current academic term';
  end if;
  -- Same lock order as remove_group_member: profile pair, then membership,
  -- then the group row.
  perform private.lock_course_profiles(v_course, v_term, v_actor, v_actor);
  select m.id into v_membership_id
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.course_id = v_course
    and m.term_id = v_term
    and m.profile_id = v_actor
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'you are not an active member of this group';
  end if;
  select g.status into v_group_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  update public.group_memberships
  set membership_status = 'left',
      ended_at = clock_timestamp()
  where id = v_membership_id
    and membership_status = 'active';
  if not found then
    raise exception 'you are no longer an active member of this group';
  end if;
  -- The leaver's own pending invitations are cancelled here rather than
  -- through private.cancel_pending_invitations_from_removed_member, which is
  -- leader-only by design and would reject a member leaving on their own.
  update public.group_invitations
  set status = 'cancelled',
      responded_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where group_id = p_group_id
    and sender_id = v_actor
    and status = 'pending';
  return 'left';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_course_classmates(p_course_id uuid)
 RETURNS TABLE(profile_id uuid, student_id text, display_name text, major text, year smallint, bio text, skills text[], status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    peer.id as profile_id,
    peer.student_id,
    peer.display_name,
    peer.major,
    peer.year,
    peer.bio,
    peer.skills,
    peer.status
  from public.courses as course
  join public.citylink_settings as setting
    on setting.singleton
   and setting.current_term_id = course.term_id
  join public.enrolments as caller_enrolment
    on caller_enrolment.course_id = course.id
   and caller_enrolment.student_id = (select auth.uid())
  join public.enrolments as peer_enrolment
    on peer_enrolment.course_id = course.id
  join public.profiles as peer
    on peer.id = peer_enrolment.student_id
  where course.id = p_course_id
    and peer.id is distinct from (select auth.uid())
  order by pg_catalog.lower(peer.display_name), peer.id;
$function$
;

CREATE OR REPLACE FUNCTION public.list_course_group_invite_candidates(p_course_id uuid)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select peer.id as profile_id
  from public.courses as course
  join public.citylink_settings as setting
    on setting.singleton
   and setting.current_term_id = course.term_id
  join public.enrolments as caller_enrolment
    on caller_enrolment.course_id = course.id
   and caller_enrolment.student_id = (select auth.uid())
  join public.enrolments as peer_enrolment
    on peer_enrolment.course_id = course.id
  join public.profiles as peer
    on peer.id = peer_enrolment.student_id
  where course.id = p_course_id
    and peer.id is distinct from (select auth.uid())
    and peer.status in ('open', 'considering')
    and not exists (
      select 1
      from public.group_memberships as membership
      where membership.profile_id = peer.id
        and membership.course_id = course.id
        and membership.term_id = setting.current_term_id
        and membership.membership_status = 'active'
    )
  order by peer.id;
$function$
;

CREATE OR REPLACE FUNCTION public.list_course_group_summaries(p_course_id uuid)
 RETURNS TABLE(profile_id uuid, group_id uuid, group_name text, group_status text, group_size bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    legacy.profile_id,
    legacy.group_id,
    legacy.group_name,
    legacy.group_status,
    legacy.group_size::bigint
  from public.list_course_group_summaries_capacity(p_course_id) as legacy;
$function$
;

CREATE OR REPLACE FUNCTION public.list_course_group_summaries_capacity(p_course_id uuid)
 RETURNS TABLE(profile_id uuid, group_id uuid, group_name text, group_status text, group_size bigint, max_members integer, capacity_count integer, capacity_state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select
      peer.id as profile_id,
      study_group.id as group_id,
      study_group.name as group_name,
      study_group.status as group_status,
      (
        select count(*)::integer
        from public.group_memberships as membership
        where membership.group_id = study_group.id
          and membership.term_id = study_group.term_id
          and membership.membership_status = 'active'
      ) as active_count,
      case
        when study_group.status = 'forming'
         and study_group.creator_id is not null
         and not exists (
           select 1
           from public.group_memberships as founder_membership
           where founder_membership.group_id = study_group.id
             and founder_membership.term_id = study_group.term_id
             and founder_membership.profile_id = study_group.creator_id
             and founder_membership.membership_status = 'active'
         )
        then 1
        else 0
      end as creator_bonus,
      study_group.max_members
    from public.courses as course
    join public.citylink_settings as setting
      on setting.singleton
     and setting.current_term_id = course.term_id
    join public.enrolments as caller_enrolment
      on caller_enrolment.course_id = course.id
     and caller_enrolment.student_id = (select auth.uid())
    join public.enrolments as peer_enrolment
      on peer_enrolment.course_id = course.id
    join public.profiles as peer
      on peer.id = peer_enrolment.student_id
    join public.study_groups as study_group
      on study_group.course_id = course.id
     and study_group.term_id = setting.current_term_id
     and study_group.status in ('forming', 'active')
    where course.id = p_course_id
      and peer.id is distinct from (select auth.uid())
      and (
        private.is_active_group_member(study_group.id, peer.id)
        or (
          study_group.status = 'forming'
          and study_group.creator_id = peer.id
        )
      )
  )
  select
    base.profile_id,
    base.group_id,
    base.group_name,
    base.group_status,
    (base.active_count + base.creator_bonus)::bigint as group_size,
    base.max_members,
    (base.active_count + base.creator_bonus)::integer as capacity_count,
    case
      when base.active_count + base.creator_bonus > 19 then 'over_limit'
      when base.max_members is null then 'maximum_not_set'
      when base.active_count + base.creator_bonus >= base.max_members then 'full'
      else 'available'
    end as capacity_state
  from base
  -- Course-detail People results are visible only once at least two actual
  -- people are in the group. Pending invitations do not count, and a forming
  -- creator alone must not create a one-person summary card.
  where (base.active_count + base.creator_bonus) >= 2
  order by base.profile_id, base.group_id;
$function$
;

CREATE OR REPLACE FUNCTION public.list_course_ungrouped_classmates(p_course_id uuid, p_after_display_name text DEFAULT NULL::text, p_after_profile_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(profile_id uuid, display_name text, year smallint, major text, skills text[], has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (p_after_display_name is null) <> (p_after_profile_id is null) then
    raise exception 'both pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  return query
    with eligible as (
      select p.id as profile_id, p.display_name, p.year, p.major, p.skills
      from public.profiles as p
      join public.enrolments as target_enrolment
        on target_enrolment.student_id = p.id
       and target_enrolment.course_id = p_course_id
      join public.courses as c on c.id = target_enrolment.course_id
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = c.term_id
      join public.enrolments as viewer_enrolment
        on viewer_enrolment.student_id = (select auth.uid())
       and viewer_enrolment.course_id = p_course_id
      where p.id <> (select auth.uid())
        and not exists (
          select 1 from public.group_memberships as m
          where m.profile_id = p.id
            and m.course_id = p_course_id
            and m.term_id = c.term_id
            and m.membership_status = 'active'
        )
    ), page as (
      select e.*,
             (count(*) over () > p_limit) as has_more
      from eligible as e
      where p_after_display_name is null
         or (e.display_name, e.profile_id) > (p_after_display_name, p_after_profile_id)
      order by e.display_name, e.profile_id
      limit p_limit
    )
    select page.profile_id, page.display_name, page.year, page.major,
           page.skills, page.has_more
    from page;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_current_course_enrolment_counts()
 RETURNS TABLE(course_id uuid, enrolled_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    course.id as course_id,
    count(enrolment.student_id)::bigint as enrolled_count
  from public.courses as course
  join public.citylink_settings as setting
    on setting.singleton
   and setting.current_term_id = course.term_id
  left join public.enrolments as enrolment
    on enrolment.course_id = course.id
  where (select auth.uid()) is not null
  group by course.id, course.code
  order by course.code, course.id;
$function$
;

CREATE OR REPLACE FUNCTION public.list_current_term_course_groups(p_course_id uuid, p_after_group_name text DEFAULT NULL::text, p_after_group_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(group_id uuid, group_name text, group_status text, active_member_count bigint, can_create_post boolean, has_more boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    legacy.group_id,
    legacy.group_name,
    legacy.group_status,
    legacy.active_member_count::bigint,
    legacy.can_create_post,
    legacy.has_more
  from public.list_current_term_course_groups_capacity(
    p_course_id, p_after_group_name, p_after_group_id, p_limit
  ) as legacy;
$function$
;

CREATE OR REPLACE FUNCTION public.list_current_term_course_groups_capacity(p_course_id uuid, p_after_group_name text DEFAULT NULL::text, p_after_group_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25, p_search text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, group_name text, group_status text, active_member_count bigint, max_members integer, capacity_count integer, capacity_state text, can_create_post boolean, has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if (p_after_group_name is null) <> (p_after_group_id is null) then
    raise exception 'both group pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'search text must be at most 100 characters';
  end if;

  return query
    with eligible as (
      select
        g.id as group_id,
        g.name as group_name,
        g.status as group_status,
        count(m.id)::integer as active_count,
        case
          when g.status = 'forming'
           and g.creator_id is not null
           and not exists (
             select 1
             from public.group_memberships as founder_membership
             where founder_membership.group_id = g.id
               and founder_membership.profile_id = g.creator_id
               and founder_membership.membership_status = 'active'
           )
          then 1
          else 0
        end as creator_bonus,
        g.max_members,
        (g.status = 'active' and exists (
          select 1
          from public.group_memberships as own_membership
          where own_membership.group_id = g.id
            and own_membership.profile_id = (select auth.uid())
            and own_membership.membership_status = 'active'
        )) as can_create_post
      from public.study_groups as g
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = g.term_id
      join public.enrolments as viewer_enrolment
        on viewer_enrolment.course_id = g.course_id
       and viewer_enrolment.student_id = (select auth.uid())
      left join public.group_memberships as m
        on m.group_id = g.id and m.membership_status = 'active'
      where g.course_id = p_course_id
        and g.status in ('forming', 'active')
        and private.can_browse_current_term_group(g.id)
        and not exists (
          select 1
          from public.group_memberships as own_m
          where own_m.group_id = g.id
            and own_m.profile_id = (select auth.uid())
            and own_m.membership_status = 'active'
        )
        and (
          v_search is null
          or position(lower(v_search) in lower(g.name)) > 0
        )
      group by g.id, g.name, g.status, g.creator_id, g.max_members
    ), scored as (
      select
        e.*,
        (e.active_count + e.creator_bonus)::integer as capacity_count,
        case
          when e.active_count + e.creator_bonus > 19 then 'over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.active_count + e.creator_bonus >= e.max_members then 'full'
          else 'available'
        end as capacity_state
      from eligible as e
    ), page as (
      select
        scored.*,
        (count(*) over () > p_limit) as has_more
      from scored
      where p_after_group_name is null
         or (scored.group_name, scored.group_id) > (p_after_group_name, p_after_group_id)
      order by scored.group_name, scored.group_id
      limit p_limit
    )
    select
      page.group_id,
      page.group_name,
      page.group_status,
      page.capacity_count::bigint as active_member_count,
      page.max_members,
      page.capacity_count,
      page.capacity_state,
      page.can_create_post,
      page.has_more
    from page;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_current_term_group_members(p_group_id uuid, p_after_joined_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_membership_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(profile_id uuid, display_name text, major text, year smallint, bio text, skills text[], cursor_joined_at timestamp with time zone, cursor_membership_id uuid, has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (p_after_joined_at is null) <> (p_after_membership_id is null) then
    raise exception 'both member pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  return query
    with eligible_group as (
      select g.id
      from public.study_groups as g
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = g.term_id
      where g.id = p_group_id
        and g.status in ('forming', 'active')
        and (
          (select count(*) from public.group_memberships as active_m
           where active_m.group_id = g.id
             and active_m.membership_status = 'active') >= 2
          or private.is_active_group_member(g.id, (select auth.uid()))
        )
    ), roster as (
      select p.id as profile_id, p.display_name, p.major, p.year, p.bio, p.skills,
             m.joined_at as cursor_joined_at, m.id as cursor_membership_id
      from eligible_group as eg
      join public.group_memberships as m
        on m.group_id = eg.id and m.membership_status = 'active'
      join public.profiles as p on p.id = m.profile_id
      where p.id = (select auth.uid())
         or private.shares_course_with(p.id)
    ), page as (
      select r.*,
             (count(*) over () > p_limit) as has_more
      from roster as r
      where p_after_joined_at is null
         or (r.cursor_joined_at, r.cursor_membership_id)
              > (p_after_joined_at, p_after_membership_id)
      order by r.cursor_joined_at, r.cursor_membership_id
      limit p_limit
    )
    select page.profile_id, page.display_name, page.major, page.year,
           page.bio, page.skills, page.cursor_joined_at,
           page.cursor_membership_id, page.has_more
    from page;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_direct_messages(p_thread_id uuid, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id uuid, sender_id uuid, sender_display_name text, body text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  return query
    select m.id, m.sender_id, m.sender_name_snapshot, m.body, m.created_at, m.read_at
    from public.direct_messages m
    where m.thread_id = p_thread_id
      and (p_before_created_at is null
           or (m.created_at, m.id) < (p_before_created_at, p_before_id))
    order by m.created_at desc, m.id desc
    limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_direct_threads(p_after_last_message_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_thread_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, other_profile_id uuid, other_display_name text, last_message_body text, last_message_at timestamp with time zone, unread_count bigint, has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if (p_after_last_message_at is null) <> (p_after_thread_id is null) then
    raise exception 'both conversation pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  return query
    select
      t.id,
      case when t.user_a = v_me then t.user_b else t.user_a end,
      coalesce(p.display_name, 'Student'),
      lm.body,
      t.last_message_at,
      (select count(*) from public.direct_messages m
        where m.thread_id = t.id and m.sender_id <> v_me and m.read_at is null),
      (count(*) over () > p_limit)
    from public.direct_threads t
    join public.profiles p
      on p.id = case when t.user_a = v_me then t.user_b else t.user_a end
    left join lateral (
      select m.body from public.direct_messages m
       where m.thread_id = t.id
       order by m.created_at desc, m.id desc
       limit 1
    ) lm on true
    where (t.user_a = v_me or t.user_b = v_me)
      and (p_after_last_message_at is null
           or (t.last_message_at, t.id) < (p_after_last_message_at, p_after_thread_id))
    order by t.last_message_at desc, t.id desc
    limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_group_chat_messages(p_group_id uuid, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id uuid, sender_name text, body text, created_at timestamp with time zone)
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.list_group_recruitment_posts(p_course_id uuid, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id uuid, group_id uuid, group_name text, subject text, active_member_count bigint, author_name text, body text, post_status text, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone, apply_enabled boolean, can_manage boolean, has_more boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    legacy.post_id,
    legacy.group_id,
    legacy.group_name,
    legacy.subject,
    legacy.active_member_count::bigint,
    legacy.author_name,
    legacy.body,
    legacy.post_status,
    legacy.created_at,
    legacy.updated_at,
    legacy.closed_at,
    legacy.apply_enabled,
    legacy.can_manage,
    legacy.has_more
  from public.list_group_recruitment_posts_capacity(
    p_course_id, p_after_created_at, p_after_id, p_limit
  ) as legacy;
$function$
;

CREATE OR REPLACE FUNCTION public.list_group_recruitment_posts_capacity(p_course_id uuid, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id uuid, group_id uuid, group_name text, subject text, active_member_count bigint, max_members integer, capacity_count integer, capacity_state text, author_name text, body text, post_status text, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone, apply_enabled boolean, apply_block_reason text, can_manage boolean, has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception 'both post pagination cursor fields must be supplied together';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'page size must be between 1 and 100';
  end if;
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  return query
    with eligible as (
      select
        p.id as post_id,
        case when g.status in ('forming', 'active') then g.id else null end as group_id,
        case when g.status in ('forming', 'active') then g.name else null end as group_name,
        p.subject,
        p.course_id as post_course_id,
        p.term_id as post_term_id,
        case when g.status in ('forming', 'active') then
          (select count(*)
           from public.group_memberships as m
           where m.group_id = g.id
             and m.membership_status = 'active')
        else null end as active_count,
        case when g.status in ('forming', 'active') then
          (select count(*)
           from public.group_memberships as m
           where m.group_id = g.id
             and m.membership_status = 'active')
          + case
              when g.status = 'forming'
               and g.creator_id is not null
               and not exists (
                 select 1
                 from public.group_memberships as founder_membership
                 where founder_membership.group_id = g.id
                   and founder_membership.profile_id = g.creator_id
                   and founder_membership.membership_status = 'active'
               )
              then 1
              else 0
            end
        else null end::integer as capacity_count,
        case when g.status in ('forming', 'active') then g.max_members else null end as max_members,
        p.author_name_snapshot as author_name,
        p.body,
        p.status as post_status,
        p.created_at,
        p.updated_at,
        p.closed_at,
        (p.status = 'open'
          and g.status = 'active'
          and private.is_current_term(g.term_id)
          and exists (
            select 1
            from public.profiles as viewer
            where viewer.id = (select auth.uid())
              and viewer.status in ('open', 'considering')
          )
          and not exists (
            select 1
            from public.group_memberships as own_m
            where own_m.profile_id = (select auth.uid())
              and own_m.course_id = p.course_id
              and own_m.term_id = p.term_id
              and own_m.membership_status = 'active'
          )
          and not exists (
            select 1
            from public.group_invitations as i
            where i.group_id = p.group_id
              and i.recipient_id = (select auth.uid())
              and i.status = 'pending'
          )
          and not exists (
            select 1
            from public.group_join_requests as r
            where r.group_id = p.group_id
              and r.requester_id = (select auth.uid())
              and r.status = 'pending'
          )) as apply_enabled,
        private.can_manage_recruitment_post(p.id) as can_manage
      from public.group_recruitment_posts as p
      join public.study_groups as g
        on g.id = p.group_id
       and g.course_id = p.course_id
       and g.term_id = p.term_id
      join public.citylink_settings as s
        on s.singleton and s.current_term_id = p.term_id
      join public.enrolments as e
        on e.course_id = p.course_id
       and e.student_id = (select auth.uid())
      where p.course_id = p_course_id
    ), scored as (
      select
        e.*,
        case
          when e.group_id is null then null
          when e.capacity_count > 19 then 'over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.capacity_count >= e.max_members then 'full'
          else 'available'
        end as capacity_state,
        case
          when e.group_id is null then 'group_inactive'
          when e.post_status <> 'open' then 'post_closed'
          when e.capacity_count > 19 then 'group_over_limit'
          when e.max_members is null then 'maximum_not_set'
          when e.capacity_count >= e.max_members then 'group_full'
          when exists (
            select 1
            from public.group_memberships as own_m
            where own_m.profile_id = (select auth.uid())
              and own_m.course_id = e.post_course_id
              and own_m.term_id = e.post_term_id
              and own_m.membership_status = 'active'
          ) then 'already_member'
          when exists (
            select 1
            from public.group_invitations as i
            where i.group_id = e.group_id
              and i.recipient_id = (select auth.uid())
              and i.status = 'pending'
          ) then 'pending_invitation'
          when exists (
            select 1
            from public.group_join_requests as r
            where r.group_id = e.group_id
              and r.requester_id = (select auth.uid())
              and r.status = 'pending'
          ) then 'pending_request'
          when not exists (
            select 1
            from public.profiles as viewer
            where viewer.id = (select auth.uid())
              and viewer.status in ('open', 'considering')
          ) then 'profile_unavailable'
          when not e.apply_enabled then 'not_eligible'
          else null
        end as apply_block_reason
      from eligible as e
    ), page as (
      select
        scored.*,
        (count(*) over () > p_limit) as has_more
      from scored
      where p_after_created_at is null
         or (scored.created_at, scored.post_id) < (p_after_created_at, p_after_id)
      order by scored.created_at desc, scored.post_id desc
      limit p_limit
    )
    select
      page.post_id,
      page.group_id,
      page.group_name,
      page.subject,
      page.capacity_count::bigint as active_member_count,
      page.max_members,
      page.capacity_count,
      page.capacity_state,
      page.author_name,
      page.body,
      page.post_status,
      page.created_at,
      page.updated_at,
      page.closed_at,
      (page.apply_block_reason is null) as apply_enabled,
      page.apply_block_reason,
      page.can_manage,
      page.has_more
    from page;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_direct_thread_read(p_thread_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_rows integer;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  -- Role 6 finding: a sender must never mark their own message as read.
  update public.direct_messages
     set read_at = now()
   where thread_id = p_thread_id
     and sender_id <> v_me
     and read_at is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id uuid, p_profile_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_membership_id uuid;
  v_group_status text;
  v_creator uuid;
  v_active_count integer;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_group_id is null or p_profile_id is null then
    raise exception 'invalid removal target';
  end if;

  -- 1. Read group identifiers without a row lock.
  select g.course_id, g.term_id
    into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.lock_current_term(v_term) then
    raise exception 'group is not in the current academic term';
  end if;

  -- 2. Deterministic profile guard: same order as the existing admission paths.
  perform private.lock_course_profiles(
    v_course, v_term, v_actor, p_profile_id
  );

  -- 3. Lock the target membership before the group. This matches the Stage 6
  -- chat/post membership-first order and avoids the earlier deadlock.
  select m.id into v_membership_id
  from public.group_memberships as m
  where m.group_id = p_group_id
    and m.course_id = v_course
    and m.term_id = v_term
    and m.profile_id = p_profile_id
    and m.membership_status = 'active'
  for update;
  if not found then
    raise exception 'target is not an active member of this group';
  end if;

  -- 4. Lock the group and recheck authority/status.
  select g.status, g.creator_id
    into v_group_status, v_creator
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator is distinct from v_actor
     or (
       v_group_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may remove members';
  end if;

  -- 5. Approved v1 boundaries: no leader self-removal and no last-member
  -- removal/abandonment through this RPC.
  if p_profile_id = v_creator then
    raise exception 'the current group leader cannot remove themselves through this operation';
  end if;
  v_active_count := private.group_active_member_count(p_group_id);
  if v_active_count <= 1 then
    raise exception 'the last active member cannot be removed through this operation';
  end if;

  -- 6. Preserve membership history; membership-end triggers handle the
  -- approved leader/recruitment-post effects.
  update public.group_memberships
  set membership_status = 'removed',
      ended_at = clock_timestamp()
  where id = v_membership_id
    and membership_status = 'active';
  if not found then
    raise exception 'target is no longer an active member of this group';
  end if;

  -- 7. Only the removed sender's pending invitations are cancelled. Pending
  -- join requests and other members' invitations remain pending.
  perform private.cancel_pending_invitations_from_removed_member(
    p_group_id, p_profile_id
  );

  return 'removed';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_study_group(p_group_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_term_id uuid;
  v_creator_id uuid;
  v_group_status text;
  v_name text := btrim(p_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'group names must contain between 1 and 50 characters';
  end if;
  select study_group.term_id
    into v_term_id
  from public.study_groups as study_group
  where study_group.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  perform private.lock_current_term(v_term_id);
  select study_group.term_id, study_group.creator_id, study_group.status
    into v_term_id, v_creator_id, v_group_status
  from public.study_groups as study_group
  where study_group.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.is_current_term(v_term_id)
     or v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator_id is distinct from v_actor
     or (
       v_group_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may rename this group';
  end if;
  update public.study_groups as study_group
  set name = v_name,
      updated_at = clock_timestamp()
  where study_group.id = p_group_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_to_join_group(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_status text;
  v_request uuid;
  v_name text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;

  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if v_course is null then
    raise exception 'group not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profile(v_course, v_term, v_actor);

  select g.course_id, g.term_id, g.status
    into v_course, v_term, v_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found
     or v_status <> 'active'
     or not private.is_current_term(v_term) then
    raise exception 'active current-term group not found';
  end if;
  if not private.is_enrolled(v_actor, v_course) then
    raise exception 'you must be enrolled in the course';
  end if;
  if not exists (
    select 1
    from public.profiles as p
    where p.id = v_actor
      and p.status in ('open', 'considering')
  ) then
    raise exception 'your profile is not currently available to join a group';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'you already belong to a group for this course and term';
  end if;

  if exists (
    select 1
    from public.group_invitations as i
    where i.group_id = p_group_id
      and i.recipient_id = v_actor
      and i.status = 'pending'
  ) then
    raise exception 'you already have a pending invitation to this group; respond to that invitation instead of requesting to join';
  end if;

  select p.display_name into v_name
  from public.profiles as p
  where p.id = v_actor;
  select r.id into v_request
  from public.group_join_requests as r
  where r.group_id = p_group_id
    and r.requester_id = v_actor
    and r.status = 'pending';

  if v_request is null then
    perform private.assert_group_has_capacity(p_group_id, 1);
    insert into public.group_join_requests(
      group_id, course_id, term_id, requester_id, requester_name_snapshot
    ) values (
      p_group_id, v_course, v_term, v_actor,
      coalesce(v_name, 'New CityLink member')
    ) returning id into v_request;
  end if;

  return v_request;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_group_invitation(p_invitation_id uuid, p_accept boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_group uuid;
  v_course uuid;
  v_term uuid;
  v_sender uuid;
  v_recipient uuid;
  v_status text;
  v_group_status text;
  v_sender_name text;
  v_recipient_name text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_accept is null then
    raise exception 'accept/decline choice is required';
  end if;

  select i.group_id, i.course_id, i.term_id, i.sender_id, i.recipient_id
    into v_group, v_course, v_term, v_sender, v_recipient
  from public.group_invitations as i
  where i.id = p_invitation_id;
  if not found or v_sender is null or v_recipient is null then
    raise exception 'invitation not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_sender, v_recipient);

  select g.status into v_group_status
  from public.study_groups as g
  where g.id = v_group
  for update;
  if not found then
    raise exception 'group not found';
  end if;

  select i.status into v_status
  from public.group_invitations as i
  where i.id = p_invitation_id
  for update;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_recipient <> v_actor then
    raise exception 'only the recipient may respond';
  end if;
  if v_status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;

  if not p_accept then
    update public.group_invitations
    set status = 'declined',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'declined';
  end if;

  if v_group_status not in ('forming', 'active')
     or not private.is_current_term(v_term)
     or not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(v_sender, v_course)
     or not exists (
       select 1
       from public.profiles as p
       where p.id = v_actor
         and p.status in ('open', 'considering')
     ) then
    update public.group_invitations
    set status = 'expired',
        responded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_invitation_id;
    perform private.maybe_abandon_empty_forming_group(v_group);
    return 'expired';
  end if;

  if v_group_status = 'forming' then
    if not exists (
      select 1
      from public.study_groups as g
      where g.id = v_group
        and g.creator_id = v_sender
    ) then
      raise exception 'forming group creator is no longer available';
    end if;
    if exists (
      select 1
      from public.group_memberships as m
      where m.profile_id in (v_sender, v_actor)
        and m.course_id = v_course
        and m.term_id = v_term
        and m.membership_status = 'active'
    ) then
      raise exception 'a participant already belongs to a group for this course and term';
    end if;

    perform private.assert_group_has_capacity(v_group, 1);

    select p.display_name into v_sender_name
    from public.profiles as p
    where p.id = v_sender;
    select p.display_name into v_recipient_name
    from public.profiles as p
    where p.id = v_actor;

    -- Both inserts are mandatory. A capacity/race failure rolls back both.
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values
      (v_group, v_course, v_term, v_sender,
       coalesce(v_sender_name, 'New CityLink member'), 'active'),
      (v_group, v_course, v_term, v_actor,
       coalesce(v_recipient_name, 'New CityLink member'), 'active');

    update public.study_groups
    set status = 'active',
        activated_at = coalesce(activated_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where id = v_group
      and status = 'forming';
  else
    if not private.is_active_group_member(v_group, v_sender) then
      raise exception 'invitation sender is no longer an active member of this group';
    end if;
    if exists (
      select 1
      from public.group_memberships as m
      where m.profile_id = v_actor
        and m.course_id = v_course
        and m.term_id = v_term
        and m.membership_status = 'active'
    ) then
      raise exception 'you already belong to a group for this course and term';
    end if;

    perform private.assert_group_has_capacity(v_group, 1);

    select p.display_name into v_recipient_name
    from public.profiles as p
    where p.id = v_actor;
    insert into public.group_memberships(
      group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
    ) values (
      v_group, v_course, v_term, v_actor,
      coalesce(v_recipient_name, 'New CityLink member'), 'active'
    );
  end if;

  update public.group_invitations
  set status = 'accepted',
      responded_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_invitation_id;

  return 'accepted';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_group_join_request(p_request_id uuid, p_approve boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_group uuid;
  v_course uuid;
  v_term uuid;
  v_requester uuid;
  v_status text;
  v_group_status text;
  v_creator_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_approve is null then
    raise exception 'approve/reject choice is required';
  end if;

  select r.group_id, r.course_id, r.term_id, r.requester_id
    into v_group, v_course, v_term, v_requester
  from public.group_join_requests as r
  where r.id = p_request_id;
  if not found or v_requester is null then
    raise exception 'join request not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(v_course, v_term, v_actor, v_requester);

  select g.status, g.creator_id
    into v_group_status, v_creator_id
  from public.study_groups as g
  where g.id = v_group
  for update;
  if not found then
    raise exception 'group not found';
  end if;

  select r.status into v_status
  from public.group_join_requests as r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'join request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'join request is no longer pending';
  end if;
  if v_creator_id is distinct from v_actor
     or not private.is_active_group_member(v_group, v_actor) then
    raise exception 'only the current group leader may review requests';
  end if;

  if not p_approve then
    update public.group_join_requests
    set status = 'rejected',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'rejected';
  end if;

  if v_group_status <> 'active' or not private.is_current_term(v_term) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if not private.is_enrolled(v_requester, v_course)
     or not exists (
       select 1
       from public.profiles as p
       where p.id = v_requester
         and p.status in ('open', 'considering')
     ) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_requester
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    update public.group_join_requests
    set status = 'expired',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_request_id;
    return 'expired';
  end if;

  perform private.assert_group_has_capacity(v_group, 1);

  insert into public.group_memberships(
    group_id, course_id, term_id, profile_id, display_name_snapshot, membership_status
  )
  select v_group, v_course, v_term, p.id, p.display_name, 'active'
  from public.profiles as p
  where p.id = v_requester;
  if not found then
    raise exception 'requester profile no longer exists';
  end if;

  update public.group_join_requests
  set status = 'approved',
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_request_id;

  return 'approved';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_direct_message(p_thread_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.direct_threads
     where id = p_thread_id and (user_a = v_me or user_b = v_me)
  ) then
    raise exception 'conversation not found';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'message body must be between 1 and 2000 characters';
  end if;
  -- D1 (Adam, 2026-11-23): an existing thread stays usable after the course or term ends,
  -- so sending requires participation only, never a current enrolment.
  -- D3 (Adam, 2026-11-23 20:32): 30 messages per sender per rolling minute ACROSS ALL
  -- conversations, not per thread. The earlier per-thread limit let one sender flood many
  -- threads, which does not address the harassment case the limit exists for.
  if (
    select count(*)
    from public.direct_messages m
    where m.sender_id = v_me
      and m.created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'rate limit reached: at most 30 messages per minute across all conversations';
  end if;
  select coalesce(display_name, 'Student') into v_name from public.profiles where id = v_me;
  insert into public.direct_messages (thread_id, sender_id, sender_name_snapshot, body)
  values (p_thread_id, v_me, coalesce(v_name, 'Student'), v_body)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_group_chat_message(p_group_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only active group members may send messages';
  END IF;
  PERFORM 1
  FROM public.study_groups AS g
  WHERE g.id = p_group_id
    AND g.status <> 'abandoned'
  FOR UPDATE;
  IF NOT FOUND OR NOT private.can_send_group_chat(p_group_id) THEN
    RAISE EXCEPTION 'group is not available for messages';
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
$function$
;

CREATE OR REPLACE FUNCTION public.send_group_invitation(p_group_id uuid, p_recipient_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_course uuid;
  v_term uuid;
  v_group_status text;
  v_invitation uuid;
  v_sender_name text;
  v_recipient_name text;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid invitation recipient';
  end if;

  select g.course_id, g.term_id into v_course, v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if v_course is null then
    raise exception 'group not found';
  end if;

  perform private.lock_current_term(v_term);
  perform private.lock_course_profiles(
    v_course, v_term, v_actor, p_recipient_id
  );

  select g.course_id, g.term_id, g.status
    into v_course, v_term, v_group_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.is_current_term(v_term)
     or v_group_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if not (
    private.is_active_group_member(p_group_id, v_actor)
    or (
      v_group_status = 'forming'
      and exists (
        select 1
        from public.study_groups as g
        where g.id = p_group_id
          and g.creator_id = v_actor
      )
    )
  ) then
    raise exception 'only a group member or forming-group creator can invite';
  end if;
  if not private.is_enrolled(v_actor, v_course)
     or not private.is_enrolled(p_recipient_id, v_course) then
    raise exception 'both students must be enrolled in the course';
  end if;

  if exists (
    select 1
    from public.group_join_requests as r
    where r.group_id = p_group_id
      and r.requester_id = p_recipient_id
      and r.status = 'pending'
  ) then
    raise exception 'student already has a pending join request for this group; review that request instead of sending an invitation';
  end if;

  select p.display_name into v_sender_name
  from public.profiles as p
  where p.id = v_actor;
  select p.display_name into v_recipient_name
  from public.profiles as p
  where p.id = p_recipient_id
    and p.status in ('open', 'considering');
  if v_recipient_name is null then
    raise exception 'recipient is not accepting invitations';
  end if;
  if private.is_active_group_member(p_group_id, p_recipient_id) then
    raise exception 'recipient already belongs to this group';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = p_recipient_id
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
  ) then
    raise exception 'recipient already belongs to a group for this course and term';
  end if;
  if exists (
    select 1
    from public.group_memberships as m
    where m.profile_id = v_actor
      and m.course_id = v_course
      and m.term_id = v_term
      and m.membership_status = 'active'
      and m.group_id <> p_group_id
  ) then
    raise exception 'you already belong to another group for this course and term';
  end if;

  select i.id into v_invitation
  from public.group_invitations as i
  where i.group_id = p_group_id
    and i.recipient_id = p_recipient_id
    and i.status = 'pending';
  if v_invitation is null then
    perform private.assert_group_has_capacity(p_group_id, 1);
    insert into public.group_invitations(
      group_id, course_id, term_id, sender_id, recipient_id,
      sender_name_snapshot, recipient_name_snapshot
    ) values (
      p_group_id, v_course, v_term, v_actor, p_recipient_id,
      coalesce(v_sender_name, 'New CityLink member'), v_recipient_name
    ) returning id into v_invitation;
  end if;

  return v_invitation;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_group_max_members(p_group_id uuid, p_max_members integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_term uuid;
  v_creator uuid;
  v_status text;
  v_count integer;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 19 then
    raise exception 'group maximum must be between 2 and 19';
  end if;

  select g.term_id into v_term
  from public.study_groups as g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if not private.lock_current_term(v_term) then
    raise exception 'group is not in the current academic term';
  end if;

  select g.creator_id, g.status
    into v_creator, v_status
  from public.study_groups as g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'group not found';
  end if;
  if v_status not in ('forming', 'active') then
    raise exception 'group is not available in the current term';
  end if;
  if v_creator is distinct from v_actor
     or (
       v_status = 'active'
       and not private.is_active_group_member(p_group_id, v_actor)
     ) then
    raise exception 'only the current group leader may set the maximum';
  end if;

  v_count := private.group_active_member_count(p_group_id);
  if v_count > 19 then
    raise exception 'This group has more than 19 active members. The leader must remove members before anyone can be added or a maximum can be set.';
  end if;
  if p_max_members < v_count then
    raise exception 'Maximum cannot be lower than the current number of active members. Remove members first.';
  end if;

  update public.study_groups
  set max_members = p_max_members,
      updated_at = clock_timestamp()
  where id = p_group_id;

  return p_max_members;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_direct_thread(p_other_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_a uuid;
  v_b uuid;
  v_thread uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if p_other_profile_id is null or p_other_profile_id = v_me then
    raise exception 'invalid conversation partner';
  end if;
  if not private.shares_current_term_course_with(p_other_profile_id) then
    raise exception 'direct messages are limited to classmates in a current-term course';
  end if;
  v_a := least(v_me, p_other_profile_id);
  v_b := greatest(v_me, p_other_profile_id);
  insert into public.direct_threads (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;
  select id into v_thread from public.direct_threads where user_a = v_a and user_b = v_b;
  return v_thread;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_own_display_name(p_display_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(p_display_name);
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'display name must contain between 1 and 50 characters';
  end if;
  if v_name = 'New CityLink member' then
    raise exception 'please choose your own display name';
  end if;
  update public.profiles
  set display_name = v_name,
      updated_at = clock_timestamp()
  where id = v_actor;
  if not found then
    raise exception 'profile not found';
  end if;
  return v_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.visible_course_enrolments()
 RETURNS TABLE(student_id uuid, course_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select enrolment.student_id, enrolment.course_id
  from public.enrolments as enrolment
  where (select auth.uid()) is not null
    and exists (
      select 1
      from public.enrolments as mine
      where mine.student_id = (select auth.uid())
        and mine.course_id = enrolment.course_id
    );
$function$
;

-- ===== GRANTS (tables) =====
grant SELECT on table public.academic_terms to authenticated;
grant TRUNCATE on table public.academic_terms to service_role;
grant DELETE on table public.academic_terms to service_role;
grant TRIGGER on table public.academic_terms to service_role;
grant REFERENCES on table public.academic_terms to service_role;
grant INSERT on table public.academic_terms to service_role;
grant SELECT on table public.academic_terms to service_role;
grant UPDATE on table public.academic_terms to service_role;
grant SELECT on table public.citylink_settings to authenticated;
grant SELECT on table public.citylink_settings to service_role;
grant INSERT on table public.citylink_settings to service_role;
grant TRIGGER on table public.citylink_settings to service_role;
grant REFERENCES on table public.citylink_settings to service_role;
grant TRUNCATE on table public.citylink_settings to service_role;
grant DELETE on table public.citylink_settings to service_role;
grant UPDATE on table public.citylink_settings to service_role;
grant SELECT on table public.courses to authenticated;
grant TRIGGER on table public.courses to service_role;
grant DELETE on table public.courses to service_role;
grant UPDATE on table public.courses to service_role;
grant SELECT on table public.courses to service_role;
grant INSERT on table public.courses to service_role;
grant TRUNCATE on table public.courses to service_role;
grant REFERENCES on table public.courses to service_role;
grant INSERT on table public.direct_messages to service_role;
grant TRIGGER on table public.direct_messages to service_role;
grant REFERENCES on table public.direct_messages to service_role;
grant TRUNCATE on table public.direct_messages to service_role;
grant DELETE on table public.direct_messages to service_role;
grant UPDATE on table public.direct_messages to service_role;
grant SELECT on table public.direct_messages to service_role;
grant REFERENCES on table public.direct_threads to service_role;
grant TRIGGER on table public.direct_threads to service_role;
grant INSERT on table public.direct_threads to service_role;
grant SELECT on table public.direct_threads to service_role;
grant UPDATE on table public.direct_threads to service_role;
grant DELETE on table public.direct_threads to service_role;
grant TRUNCATE on table public.direct_threads to service_role;
grant SELECT on table public.enrolments to authenticated;
grant DELETE on table public.enrolments to authenticated;
grant TRUNCATE on table public.enrolments to service_role;
grant DELETE on table public.enrolments to service_role;
grant UPDATE on table public.enrolments to service_role;
grant SELECT on table public.enrolments to service_role;
grant INSERT on table public.enrolments to service_role;
grant TRIGGER on table public.enrolments to service_role;
grant REFERENCES on table public.enrolments to service_role;
grant DELETE on table public.group_chat_messages to service_role;
grant TRUNCATE on table public.group_chat_messages to service_role;
grant REFERENCES on table public.group_chat_messages to service_role;
grant TRIGGER on table public.group_chat_messages to service_role;
grant UPDATE on table public.group_chat_messages to service_role;
grant SELECT on table public.group_chat_messages to service_role;
grant INSERT on table public.group_chat_messages to service_role;
grant SELECT on table public.group_invitations to authenticated;
grant TRUNCATE on table public.group_invitations to service_role;
grant TRIGGER on table public.group_invitations to service_role;
grant REFERENCES on table public.group_invitations to service_role;
grant INSERT on table public.group_invitations to service_role;
grant SELECT on table public.group_invitations to service_role;
grant UPDATE on table public.group_invitations to service_role;
grant DELETE on table public.group_invitations to service_role;
grant SELECT on table public.group_join_requests to authenticated;
grant SELECT on table public.group_join_requests to service_role;
grant INSERT on table public.group_join_requests to service_role;
grant UPDATE on table public.group_join_requests to service_role;
grant DELETE on table public.group_join_requests to service_role;
grant TRUNCATE on table public.group_join_requests to service_role;
grant REFERENCES on table public.group_join_requests to service_role;
grant TRIGGER on table public.group_join_requests to service_role;
grant SELECT on table public.group_memberships to authenticated;
grant TRUNCATE on table public.group_memberships to service_role;
grant REFERENCES on table public.group_memberships to service_role;
grant UPDATE on table public.group_memberships to service_role;
grant SELECT on table public.group_memberships to service_role;
grant INSERT on table public.group_memberships to service_role;
grant DELETE on table public.group_memberships to service_role;
grant TRIGGER on table public.group_memberships to service_role;
grant TRUNCATE on table public.group_recruitment_posts to service_role;
grant INSERT on table public.group_recruitment_posts to service_role;
grant SELECT on table public.group_recruitment_posts to service_role;
grant UPDATE on table public.group_recruitment_posts to service_role;
grant DELETE on table public.group_recruitment_posts to service_role;
grant REFERENCES on table public.group_recruitment_posts to service_role;
grant TRIGGER on table public.group_recruitment_posts to service_role;
grant UPDATE on table public.invitations to authenticated;
grant SELECT on table public.invitations to authenticated;
grant INSERT on table public.invitations to authenticated;
grant UPDATE on table public.invitations to service_role;
grant TRIGGER on table public.invitations to service_role;
grant REFERENCES on table public.invitations to service_role;
grant TRUNCATE on table public.invitations to service_role;
grant DELETE on table public.invitations to service_role;
grant SELECT on table public.invitations to service_role;
grant INSERT on table public.invitations to service_role;
grant SELECT on table public.profiles to authenticated;
grant INSERT on table public.profiles to service_role;
grant SELECT on table public.profiles to service_role;
grant TRIGGER on table public.profiles to service_role;
grant DELETE on table public.profiles to service_role;
grant UPDATE on table public.profiles to service_role;
grant TRUNCATE on table public.profiles to service_role;
grant REFERENCES on table public.profiles to service_role;
grant SELECT on table public.study_groups to authenticated;
grant REFERENCES on table public.study_groups to service_role;
grant INSERT on table public.study_groups to service_role;
grant SELECT on table public.study_groups to service_role;
grant UPDATE on table public.study_groups to service_role;
grant DELETE on table public.study_groups to service_role;
grant TRUNCATE on table public.study_groups to service_role;
grant TRIGGER on table public.study_groups to service_role;

-- ===== GRANTS (functions) =====
grant execute on function private.both_enrolled_in_course(p_left_profile_id uuid, p_right_profile_id uuid, p_course_id uuid) to authenticated;
grant execute on function private.can_view_group(p_group_id uuid, p_profile_id uuid) to authenticated;
grant execute on function public.cancel_group_invitation(p_invitation_id uuid) to service_role;
grant execute on function public.cancel_group_invitation(p_invitation_id uuid) to authenticated;
grant execute on function public.cancel_group_join_request(p_request_id uuid) to service_role;
grant execute on function public.cancel_group_join_request(p_request_id uuid) to authenticated;
grant execute on function public.close_group_recruitment_post(p_post_id uuid) to service_role;
grant execute on function public.close_group_recruitment_post(p_post_id uuid) to authenticated;
grant execute on function public.create_group_alone(p_course_id uuid, p_name text, p_max_members integer) to authenticated;
grant execute on function public.create_group_alone(p_course_id uuid, p_name text, p_max_members integer) to service_role;
grant execute on function public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text) to service_role;
grant execute on function public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text, p_max_members integer) to service_role;
grant execute on function public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text, p_max_members integer) to authenticated;
grant execute on function public.create_group_and_invite(p_course_id uuid, p_recipient_id uuid, p_name text) to authenticated;
grant execute on function public.create_group_recruitment_post(p_group_id uuid, p_subject text, p_body text) to authenticated;
grant execute on function public.create_group_recruitment_post(p_group_id uuid, p_subject text, p_body text) to service_role;
grant execute on function public.edit_group_recruitment_post(p_post_id uuid, p_subject text, p_body text) to service_role;
grant execute on function public.edit_group_recruitment_post(p_post_id uuid, p_subject text, p_body text) to authenticated;
grant execute on function public.enforce_invitation_integrity() to service_role;
grant execute on function public.get_current_term_coursemate_profile(p_course_id uuid, p_profile_id uuid) to authenticated;
grant execute on function public.get_current_term_coursemate_profile(p_course_id uuid, p_profile_id uuid) to service_role;
grant execute on function public.get_current_term_group_member_profile(p_group_id uuid, p_profile_id uuid) to service_role;
grant execute on function public.get_current_term_group_member_profile(p_group_id uuid, p_profile_id uuid) to authenticated;
grant execute on function public.get_direct_thread_state(p_thread_id uuid) to service_role;
grant execute on function public.get_direct_thread_state(p_thread_id uuid) to authenticated;
grant execute on function public.get_group_chat_access(p_group_id uuid) to authenticated;
grant execute on function public.get_group_chat_access(p_group_id uuid) to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function private.is_active_group_member(p_group_id uuid, p_profile_id uuid) to authenticated;
grant execute on function private.is_enrolled(p_profile_id uuid, p_course_id uuid) to authenticated;
grant execute on function public.leave_group(p_group_id uuid) to authenticated;
grant execute on function public.leave_group(p_group_id uuid) to service_role;
grant execute on function public.list_course_classmates(p_course_id uuid) to authenticated;
grant execute on function public.list_course_classmates(p_course_id uuid) to service_role;
grant execute on function public.list_course_group_invite_candidates(p_course_id uuid) to service_role;
grant execute on function public.list_course_group_invite_candidates(p_course_id uuid) to authenticated;
grant execute on function public.list_course_group_summaries(p_course_id uuid) to authenticated;
grant execute on function public.list_course_group_summaries(p_course_id uuid) to service_role;
grant execute on function public.list_course_group_summaries_capacity(p_course_id uuid) to service_role;
grant execute on function public.list_course_group_summaries_capacity(p_course_id uuid) to authenticated;
grant execute on function public.list_course_ungrouped_classmates(p_course_id uuid, p_after_display_name text, p_after_profile_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_course_ungrouped_classmates(p_course_id uuid, p_after_display_name text, p_after_profile_id uuid, p_limit integer) to service_role;
grant execute on function public.list_current_course_enrolment_counts() to authenticated;
grant execute on function public.list_current_course_enrolment_counts() to service_role;
grant execute on function public.list_current_term_course_groups(p_course_id uuid, p_after_group_name text, p_after_group_id uuid, p_limit integer) to service_role;
grant execute on function public.list_current_term_course_groups(p_course_id uuid, p_after_group_name text, p_after_group_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_current_term_course_groups_capacity(p_course_id uuid, p_after_group_name text, p_after_group_id uuid, p_limit integer, p_search text) to authenticated;
grant execute on function public.list_current_term_course_groups_capacity(p_course_id uuid, p_after_group_name text, p_after_group_id uuid, p_limit integer, p_search text) to service_role;
grant execute on function public.list_current_term_group_members(p_group_id uuid, p_after_joined_at timestamp with time zone, p_after_membership_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_current_term_group_members(p_group_id uuid, p_after_joined_at timestamp with time zone, p_after_membership_id uuid, p_limit integer) to service_role;
grant execute on function public.list_direct_messages(p_thread_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to service_role;
grant execute on function public.list_direct_messages(p_thread_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_direct_threads(p_after_last_message_at timestamp with time zone, p_after_thread_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_direct_threads(p_after_last_message_at timestamp with time zone, p_after_thread_id uuid, p_limit integer) to service_role;
grant execute on function public.list_group_chat_messages(p_group_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_group_chat_messages(p_group_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to service_role;
grant execute on function public.list_group_chat_messages_with_sender(p_group_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_group_chat_messages_with_sender(p_group_id uuid, p_before_created_at timestamp with time zone, p_before_id uuid, p_limit integer) to service_role;
grant execute on function public.list_group_recruitment_posts(p_course_id uuid, p_after_created_at timestamp with time zone, p_after_id uuid, p_limit integer) to authenticated;
grant execute on function public.list_group_recruitment_posts(p_course_id uuid, p_after_created_at timestamp with time zone, p_after_id uuid, p_limit integer) to service_role;
grant execute on function public.list_group_recruitment_posts_capacity(p_course_id uuid, p_after_created_at timestamp with time zone, p_after_id uuid, p_limit integer) to service_role;
grant execute on function public.list_group_recruitment_posts_capacity(p_course_id uuid, p_after_created_at timestamp with time zone, p_after_id uuid, p_limit integer) to authenticated;
grant execute on function public.mark_direct_thread_read(p_thread_id uuid) to service_role;
grant execute on function public.mark_direct_thread_read(p_thread_id uuid) to authenticated;
grant execute on function private.recipient_can_receive_invitation(p_recipient_profile_id uuid) to authenticated;
grant execute on function public.remove_group_member(p_group_id uuid, p_profile_id uuid) to authenticated;
grant execute on function public.remove_group_member(p_group_id uuid, p_profile_id uuid) to service_role;
grant execute on function public.rename_study_group(p_group_id uuid, p_name text) to service_role;
grant execute on function public.rename_study_group(p_group_id uuid, p_name text) to authenticated;
grant execute on function public.request_to_join_group(p_group_id uuid) to authenticated;
grant execute on function public.request_to_join_group(p_group_id uuid) to service_role;
grant execute on function public.respond_to_group_invitation(p_invitation_id uuid, p_accept boolean) to service_role;
grant execute on function public.respond_to_group_invitation(p_invitation_id uuid, p_accept boolean) to authenticated;
grant execute on function public.review_group_join_request(p_request_id uuid, p_approve boolean) to service_role;
grant execute on function public.review_group_join_request(p_request_id uuid, p_approve boolean) to authenticated;
grant execute on function public.send_direct_message(p_thread_id uuid, p_body text) to service_role;
grant execute on function public.send_direct_message(p_thread_id uuid, p_body text) to authenticated;
grant execute on function public.send_group_chat_message(p_group_id uuid, p_body text) to service_role;
grant execute on function public.send_group_chat_message(p_group_id uuid, p_body text) to authenticated;
grant execute on function public.send_group_invitation(p_group_id uuid, p_recipient_id uuid) to service_role;
grant execute on function public.send_group_invitation(p_group_id uuid, p_recipient_id uuid) to authenticated;
grant execute on function public.set_group_max_members(p_group_id uuid, p_max_members integer) to authenticated;
grant execute on function public.set_group_max_members(p_group_id uuid, p_max_members integer) to service_role;
grant execute on function private.shares_course_with(p_other_profile_id uuid) to authenticated;
grant execute on function public.start_direct_thread(p_other_profile_id uuid) to service_role;
grant execute on function public.start_direct_thread(p_other_profile_id uuid) to authenticated;
grant execute on function public.update_own_display_name(p_display_name text) to authenticated;
grant execute on function public.update_own_display_name(p_display_name text) to service_role;
grant execute on function public.visible_course_enrolments() to service_role;
grant execute on function public.visible_course_enrolments() to authenticated;

-- ===== ENUMS =====
