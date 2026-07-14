# Agent Instructions

## Current Stage

The PRD and V1 phase roadmap are approved. This repository is in technical validation. Do not add production code for an issue until its relevant spikes and architecture decisions are complete and its issue-level implementation plan is approved.

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
- Use branches named feature/<issue>-<slug>, fix/<issue>-<slug>, docs/<issue>-<slug>, or spike/<issue>-<slug>.
- Keep pull requests scoped to one vertical slice.
- Add verification evidence to every pull request.
- Do not merge with failing required checks.
