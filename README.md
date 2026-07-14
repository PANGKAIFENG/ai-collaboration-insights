# AI Collaboration Insights

Local-first AI collaboration analytics and review dashboard for Codex, Claude Code, OpenCode, WorkBuddy, and Qoder.

> Status: PRD and V1 implementation roadmap approved; technical spikes and architecture decisions are next. There is no installable release yet.

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

- [Documentation index](docs/README.md)
- [Product requirements](docs/PRD/ai-collaboration-review-prd-v0.2.md)
- [GitHub PRD and delivery tracking](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/1)
- [PRD readiness review](docs/REVIEWS/prd-review-v0.1.md)
- [Issue breakdown draft](docs/ISSUES/issue-breakdown-v0.1.md)
- [Published issue backlog](docs/ISSUES/issue-publish-result-v0.1.md)
- [V1 implementation roadmap](plans/ai-collaboration-insights-v1.md)
- [Project context](docs/PROJECT/project-context.md)
- [Development workflow](docs/PROJECT/development-workflow.md)
- [System architecture diagram](docs/diagrams/system-architecture.drawio)
- [Report generation flow](docs/diagrams/report-generation-flow.drawio)
- [Deep analysis consent flow](docs/diagrams/deep-analysis-consent-flow.drawio)

## Roadmap

The approved delivery sequence is:

1. Complete data-source spikes, scoring evaluation, architecture ADRs, and the initial quality-gate contract (#2-#6, #24).
2. Establish the local application foundation (#7).
3. Deliver the Codex-to-metrics-report tracer bullet without waiting for Claude Code (#8, #13, #14).
4. Extend the verified adapter contract to Claude Code, OpenCode, WorkBuddy, and Qoder (#9-#12).
5. Add authorized AI review, evidence-backed scoring, and the overview dashboard (#15-#17).
6. Add confirmed deep analysis and user correction/recomputation (#18-#19).
7. Add weekly/monthly reports, export, and local deletion (#20-#21).
8. Pass release gates and publish the installable macOS `v0.1.0` (#24-#25).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not submit real AI session logs, private project content, credentials, or generated personal reports.

## License

Apache-2.0. See [LICENSE](LICENSE).
