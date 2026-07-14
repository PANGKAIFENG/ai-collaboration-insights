# Agent Instructions

## Current Stage

This repository is in product definition and technical validation. Do not add production code until the PRD review, technical spikes, and implementation plan are approved.

## Privacy

- Never commit real AI session logs, prompts, responses, tool outputs, project paths, API keys, or generated personal reports.
- Test data must be synthetic or irreversibly redacted.
- Treat source logs as read-only.
- Do not add telemetry or remote upload behavior without an explicit product decision.

## Project Structure

- Project context and workflow: docs/PROJECT/
- Product requirements: docs/PRD/
- Product and technical decisions: docs/DECISIONS/
- Architecture and technical design: docs/TECH/
- UI structure and mockups: docs/UI/
- Test strategy and evaluation documentation: docs/TESTS/
- Review reports: docs/REVIEWS/
- Editable diagrams: docs/diagrams/

## Delivery Rules

- Work from a GitHub issue.
- Use branches named feature/<issue>-<slug>, fix/<issue>-<slug>, docs/<issue>-<slug>, or spike/<issue>-<slug>.
- Keep pull requests scoped to one vertical slice.
- Add verification evidence to every pull request.
- Do not merge with failing required checks.
