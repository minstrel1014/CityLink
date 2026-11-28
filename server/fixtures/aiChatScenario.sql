-- Deterministic scenario for the AI-chat proposal's behaviour probes.
-- Runs as the cluster superuser against the stub schema + applied proposal.
-- Actors
insert into public.profiles (id, display_name) values
 ('11111111-1111-1111-1111-111111111111','Asker'),
 ('22222222-2222-2222-2222-222222222222','Other'),
 ('33333333-3333-3333-3333-333333333333','Outsider'),
 ('44444444-4444-4444-4444-444444444444','Left'),
 ('55555555-5555-5555-5555-555555555555','Fresh'),
 ('66666666-6666-6666-6666-666666666666','Budget');

-- Groups: active, abandoned, and two spares for quota scenarios.
insert into public.study_groups (id, creator_id, status) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','active'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','abandoned'),
 ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','active'),
 ('aaaaaaaa-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','active'),
 ('aaaaaaaa-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555','active'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','active');

insert into public.group_memberships (group_id, profile_id, membership_status) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','active'),
 ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','active'),
 ('aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','left'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','active'),
 ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','active'),
 ('aaaaaaaa-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','active'),
 ('aaaaaaaa-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','active'),
 ('aaaaaaaa-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555','active'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','active'),
 ('aaaaaaaa-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666','active');

-- Files in group 1: eligible, expired, deleted; plus one in another group.
insert into public.group_files (id, group_id, uploaded_by, original_name, status, deleted_at, retention_expires_at) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','ok.pdf','current',null, now() + interval '30 days'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','expired.pdf','current',null, now() - interval '1 day'),
 ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','other-group.pdf','current',null, now() + interval '30 days'),
 ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','gone.pdf','deleted',now(), now() + interval '30 days'),
 ('bbbbbbbb-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','second.pdf','current',null, now() + interval '30 days');

-- Group 1 chat history, all well before any clear: 3 short member messages.
insert into public.group_chat_messages (group_id, sender_id, sender_name_snapshot, body, created_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Other', repeat('m', 300), now() - interval '30 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Asker', repeat('n', 300), now() - interval '29 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Other', repeat('o', 300), now() - interval '28 minutes');

-- Group 7 exists purely to test the four context rules with a known budget:
-- five 1,500-char member messages and four 500-char AI answers, newest last.
insert into public.group_chat_messages (group_id, sender_id, sender_name_snapshot, body, author_kind, created_at) values
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','Budget', repeat('x', 1500), 'member', now() - interval '20 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007', null, 'CityLink AI', repeat('a', 500), 'ai', now() - interval '19 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','Budget', repeat('y', 1500), 'member', now() - interval '18 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007', null, 'CityLink AI', repeat('b', 500), 'ai', now() - interval '17 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','Budget', repeat('z', 1500), 'member', now() - interval '16 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007', null, 'CityLink AI', repeat('c', 500), 'ai', now() - interval '15 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','Budget', repeat('w', 1500), 'member', now() - interval '14 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007', null, 'CityLink AI', repeat('d', 500), 'ai', now() - interval '13 minutes'),
 ('aaaaaaaa-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','Budget', repeat('v', 1500), 'member', now() - interval '12 minutes');
