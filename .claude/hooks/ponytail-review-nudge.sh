#!/bin/bash
# PostToolUse hook — nudges /ponytail-review after a code-file Edit/Write/MultiEdit.
# Filters to code extensions only; non-code edits (md/json/lock/txt) are skipped.
set -u

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

[ -n "$file_path" ] || exit 0

case "$file_path" in
  *.py|*.js|*.jsx|*.ts|*.tsx|*.go|*.rs|*.java|*.rb|*.php|*.c|*.cpp|*.h|*.hpp|*.cs|*.swift|*.kt)
    ;;
  *)
    exit 0
    ;;
esac

jq -n --arg path "$file_path" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("\($path) was just modified. Invoke /ponytail-review on this change before moving on, to flag any over-engineering before it accumulates.")
  }
}'
exit 0
