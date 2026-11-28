#!/bin/bash
cd /tmp/kayk || exit 1
echo "=== PR #67 ==="
gh pr view 67 --repo minstrel1014/CityLink --json number,title,isDraft,createdAt,updatedAt,headRefOid,baseRefName,changedFiles,additions,deletions
echo "=== commits since handoff head 7db5550 ==="
git log --oneline 7db5550..40736431
echo "=== blob at PR head 40736431 ==="
git show 40736431:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql | sha256sum
git show 40736431:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql | wc -l
echo "=== handoff blob 7db5550 ==="
git show 7db5550:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL.sql | sha256sum
echo "=== DEPLOY2 at PR head ==="
git show 40736431:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql | sha256sum
git show 40736431:docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY2.sql | wc -l
