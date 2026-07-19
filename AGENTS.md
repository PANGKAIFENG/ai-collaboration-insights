# Agent Instructions

## Current Stage

`v0.3.0` is the current public alpha. The current objective is to validate the
progressive Codex-only daily report with real usage, fix alpha blockers, and
record non-blocking defects without expanding the MVP.

For seven active Codex days, the validation target is at least six reports that
generate without manual repair, a review sample of at least 20 real tasks with
80% task/project agreement, one-minute comprehension of the day's main work,
and at least one coaching suggestion that the user can act on and test.

The active MVP is a one-shot CLI that reads Codex logs, generates a daily static
HTML report, and schedules it with `launchd`. Claude Code, additional sources,
weekly/monthly reports, a daemon, localhost API, dynamic Dashboard, SQLite, and
calendar integrations are post-MVP. Do not add them without a new product
decision and a scoped GitHub Issue.

When scope descriptions conflict, use this precedence:

1. `docs/PRD/codex-daily-report-mvp-scope-v0.1.md`
2. `docs/PRD/ai-collaboration-review-prd-v0.3.md` for Codex report analysis behavior
3. `docs/DECISIONS/ADR-0001-codex-daily-report-runtime.md`
4. `README.md` and `docs/RELEASES/v0.3.0.md`
5. The broader V1 PRD and pre-compression Issue descriptions

## Privacy

- Never commit real AI session logs, prompts, responses, tool outputs, project paths, API keys, or generated personal reports.
- Test data must be synthetic or irreversibly redacted.
- Treat source logs as read-only.
- Do not add telemetry or remote upload behavior without an explicit product decision.

## Project Structure

- Documentation entry and placement rules: docs/README.md
- Project context and workflow: docs/PROJECT/
- Product requirements: docs/PRD/
- Published backlog records: docs/ISSUES/
- Product and technical decisions: docs/DECISIONS/
- Architecture and technical design: docs/TECH/
- UI structure and mockups: docs/UI/
- Test strategy and evaluation documentation: docs/TESTS/
- Review reports: docs/REVIEWS/
- Stage handoffs: docs/HANDOFF/
- Release notes and verification: docs/RELEASES/
- Editable diagrams: docs/diagrams/
- Deployable applications: apps/
- Shared implementation packages: packages/
- Automated tests and synthetic fixtures: tests/
- Repository automation and validation scripts: scripts/
- Approved phase roadmaps and issue-level implementation plans: plans/

Do not create a new top-level documentation or code directory when an existing lane owns the artifact. The exact app and package boundaries remain subject to the approved architecture ADR. Keep GitHub Issues as the execution backlog; do not duplicate their status tracking in plans.

## Delivery Rules

- Work from a GitHub issue.
- Confirm the issue is inside the active MVP or explicitly approved as post-MVP before implementation.
- Use branches named feature/<issue>-<slug>, fix/<issue>-<slug>, docs/<issue>-<slug>, or spike/<issue>-<slug>.
- Keep pull requests scoped to one vertical slice.
- Add verification evidence to every pull request.
- Do not merge with failing required checks.
