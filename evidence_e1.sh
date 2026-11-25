#!/bin/bash
# E1 discriminating evidence: same probe script, old blob vs new blob.
# Old blob = the deploy 2 at HEAD (40736431, sha256 8e4d1891…), new = working tree.
set -u
cd /tmp/kayk || exit 1
git show HEAD:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql > /tmp/e1_old_deploy2.sql
OLD_SHA=$(sha256sum /tmp/e1_old_deploy2.sql | cut -d' ' -f1)
NEW_SHA=$(sha256sum docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql | cut -d' ' -f1)
echo "old blob sha256: $OLD_SHA ($(wc -l < /tmp/e1_old_deploy2.sql) lines)"
echo "new blob sha256: $NEW_SHA ($(wc -l < docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql) lines)"
echo

run_one () {
  local label="$1"
  local deploy2="$2"
  local db="e1_${label}_$$"
  psql "postgres:///postgres" -q -c "drop database if exists $db" >/dev/null 2>&1
  psql "postgres:///postgres" -q -c "create database $db" >/dev/null || { echo "create failed"; return 1; }
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f server/fixtures/aiChatStubSchema.sql >/dev/null 2>&1
  psql "$db" -X -q -c "insert into private.citylink_target (project_ref, system_identifier) values ('pijslbchvstkoweslymr', (select system_identifier::text from pg_control_system()));" >/dev/null 2>&1
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql >/dev/null 2>&1
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f "$deploy2" >/dev/null 2>&1
  psql "$db" -X -q -v ON_ERROR_STOP=1 -f server/fixtures/aiChatScenario.sql >/dev/null 2>&1

  echo "===== $label ($(basename "$deploy2")) ====="
  echo "-- index definition as installed:"
  psql "$db" -X -tAc "select indexdef from pg_indexes where indexname = 'group_chat_messages_ai_request'"
  psql "$db" -X -q -c "insert into public.group_ai_requests (id, group_id, asked_by, idempotency_key, question) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'unique index probe');" >/dev/null 2>&1
  echo "-- insert #1 (same ai_request_id, first AI answer):"
  psql "$db" -X -q -v VERBOSITY=verbose -c "insert into public.group_chat_messages (group_id, sender_id, sender_name_snapshot, body, author_kind, ai_request_id) values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'CityLink AI', 'first answer', 'ai', 'cccccccc-0000-0000-0000-000000000001');" 2>&1 | sed 's/^/    /'
  echo "    exit=$?"
  echo "-- insert #2 (same ai_request_id, second AI answer):"
  psql "$db" -X -q -v VERBOSITY=verbose -c "insert into public.group_chat_messages (group_id, sender_id, sender_name_snapshot, body, author_kind, ai_request_id) values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'CityLink AI', 'second answer', 'ai', 'cccccccc-0000-0000-0000-000000000001');" 2>&1 | sed 's/^/    /'
  echo "    exit=${PIPESTATUS[0]}"
  echo "-- rows carrying that ai_request_id:"
  psql "$db" -X -tAc "select count(*) from public.group_chat_messages where ai_request_id = 'cccccccc-0000-0000-0000-000000000001'"
  echo
  psql "postgres:///postgres" -q -c "drop database if exists $db" >/dev/null 2>&1
}

run_one old /tmp/e1_old_deploy2.sql
run_one new docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql
