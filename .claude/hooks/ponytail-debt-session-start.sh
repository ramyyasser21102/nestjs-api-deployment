#!/bin/bash
# SessionStart hook — nudges /ponytail-debt on a true session start (not /clear or --resume).
set -u

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
source=$(printf '%s' "$input" | jq -r '.source // empty')

[ "$source" = "startup" ] || exit 0

jq -n '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "New session started. Run /ponytail-debt to surface the deferred-shortcut ledger before starting new work."
  }
}'
exit 0
