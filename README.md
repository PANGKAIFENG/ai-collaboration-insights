# AI Collaboration Insights

Local-first AI collaboration analytics and review dashboard for Codex, Claude Code, OpenCode, WorkBuddy, and Qoder.

> Status: product definition and technical validation. There is no installable release yet.

## Why

AI coding activity is spread across tools and raw session logs. Token totals and session counts show usage intensity, but they do not explain what work was completed or whether the collaboration was effective, controlled, verified, and reusable.

This project turns local session evidence into:

1. A daily, weekly, and monthly usage dashboard.
2. A review of tasks, projects, work intervals, and outcomes.
3. An evidence-backed collaboration score and coaching suggestions.

## Product Principles

- Local-first: the structured database and reports remain on the user's machine.
- Evidence before judgment: every inferred task, score, and risk signal links to evidence and confidence.
- Usage is not maturity: more tokens, agents, or tools do not automatically increase the score.
- User-controlled AI: semantic analysis uses a user-provided OpenAI-compatible or Anthropic API.
- Correctable inference: users can rename, merge, split, exclude, and recompute.
- No product telemetry in V1.

## V1 Scope

- macOS-first local Web application.
- Data sources: Codex, Claude Code, OpenCode, WorkBuddy, and Qoder.
- Daily reports: previous day 19:00 to current day 19:00.
- Weekly reports: previous Sunday 19:00 to current Sunday 19:00.
- Monthly reports: previous month day 1 at 19:00 to current month day 1 at 19:00.
- Manual report generation and recomputation.
- Markdown and JSON export.

## Documentation

- [Product requirements](docs/PRD/ai-collaboration-review-prd-v0.1.md)
- [Project context](docs/PROJECT/project-context.md)
- [Development workflow](docs/PROJECT/development-workflow.md)
- [System architecture diagram](docs/diagrams/system-architecture.drawio)
- [Report generation flow](docs/diagrams/report-generation-flow.drawio)

## Roadmap

The next gates are:

1. PRD readiness review.
2. Technical validation of local logs and license boundaries for all five tools.
3. Evaluation design for task inference and collaboration scoring.
4. Vertical-slice issue backlog.
5. Architecture and implementation planning.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not submit real AI session logs, private project content, credentials, or generated personal reports.

## License

Apache-2.0. See [LICENSE](LICENSE).
