#!/bin/bash
# Gate 2 evidence: for every pushed ref, what SQL does that branch ADD or CHANGE
# that touches the objects the AI-chat blob touches?
cd /tmp/kayk || exit 1
PAT='alter table.*(group_chat_messages|profiles)|create or replace function.*(list_group_chat_messages|send_group_chat_message|get_group_chat_access)|group_ai_context|group_ai_requests|begin_group_ai_request|finish_group_ai_request|claim_group_ai_request|clear_group_ai_context|list_group_chat_messages_ai|accept_ai_disclosure'
for r in $(git for-each-ref refs/remotes/origin --format='%(refname:short)' | grep -v '^origin/HEAD$'); do
  out=$(git -c color.ui=false diff --no-color "origin/main...$r" -- '*.sql' 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' | grep -E "$PAT")
  if [ -n "$out" ]; then
    echo "### $r"
    echo "$out" | sed 's/^+[[:space:]]*/    /' | cut -c1-140 | sort -u | head -6
    echo
  fi
done
