# Issue tracker: Linear

Issues and specs for this repo live in Linear. Use the Linear MCP tools (`mcp__claude_ai_Linear__*`) for all operations.

## Workspace

- **Workspace**: RY21 (https://linear.app/ry21)
- **Team**: RY21
- **Project**: "Nest JS API Deployment" — all issues for this repo go under this project.

## Conventions

- **Create an issue**: `save_issue` with `team: "RY21"`, `project: "Nest JS API Deployment"`, `title`, `description` (Markdown).
- **Read an issue**: `get_issue` with the issue ID/identifier (e.g. `RY21-123`).
- **List issues**: `list_issues` with `project: "Nest JS API Deployment"`, filtered by `state` / `label` / `assignee` as needed.
- **Comment on an issue**: `save_comment` with `issueId` and `body` (Markdown).
- **Apply / remove labels**: `save_issue` with `addLabels` / `removeLabels` (label names, e.g. `["ready-for-agent"]`).
- **Close**: `save_issue` with `state: "Done"` (or `"Canceled"` if abandoned).

## Statuses

This team's states: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`.

## Labels

Labels are shared across every project in the RY21 team, not scoped per-project — check `list_issue_labels` before creating a new one, to reuse existing vocabulary instead of duplicating it. `ready-for-agent` already exists (created for `/to-spec` / `/to-tickets` / `/implement`).

## When a skill says "publish to the issue tracker"

Create a Linear issue via `save_issue` in the "Nest JS API Deployment" project, with whatever labels the skill specifies.

## When a skill says "fetch the relevant ticket"

Run `get_issue` with the issue's ID/identifier.

## Pull requests as a triage surface

Not applicable — this repo's PRs aren't linked to Linear issues.

## Assignee

Every issue is assigned to you (`assignee: "me"`) at creation — solo project, no other assignees exist.

## Status lifecycle

Don't leave tickets sitting in Backlog by default. Map lifecycle to this team's states explicitly:

- **Backlog**: not actionable yet — blocked by another open ticket, or genuinely just an idea.
- **Todo**: ready to be picked up right now, no unresolved blockers. A newly-published ticket with no blockers starts here, not in Backlog.
- **In Progress**: set when `/implement` begins active work on it.
- **In Review**: set once implementation is done and `/code-review` is running — until findings are addressed and the work is committed.
- **Done**: set once implemented, reviewed, and committed.
- **Canceled** / **Duplicate**: as-is, for abandoned work or merges into another ticket.

## Due dates

Never invent one. Only set `dueDate` when the user explicitly states one in conversation. When creating a new ticket, always ask for a due date before publishing — don't silently default to none either.
