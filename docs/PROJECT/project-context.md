# Project Context

## Mission

Build an open-source, local-first product that helps individuals understand and improve how they collaborate with AI coding tools.

## Current Phase

Product definition and technical validation.

## Target User

Individuals who use Codex, Claude Code, OpenCode, WorkBuddy, or Qoder frequently for software development or AI product work.

## V1 Outcome

At 19:00 each day, the user can open a local dashboard and:

1. See reliable usage data across supported tools.
2. Review tasks, projects, work intervals, and outcomes.
3. Understand the evidence behind a daily score and rolling L1-L4 maturity level.
4. Choose an actionable improvement for the next cycle.

## Product Boundaries

- The local structured database is the source of truth.
- Raw logs remain in their source-tool locations and are read-only.
- Semantic analysis uses a user-provided model API.
- Calendar integrations are projections, not sources of truth.
- V1 is single-user and macOS-first.
- V1 does not include a central account service, public ranking, team analytics, or telemetry.

## Confirmed Decisions

- Product form: local Web application.
- License: Apache-2.0.
- Default analysis: minimized standard analysis.
- Optional analysis: explicitly confirmed deep analysis.
- Report boundary: 19:00 local time.
- Score: daily 0-100 plus rolling 28-day L1-L4.
- Score dimensions: task definition, orchestration, iteration, verification, and assetization.

## Quality Gates

1. PRD readiness review has no blocking findings.
2. All five data sources have verified local-log feasibility or an explicit fallback.
3. Scoring has an evaluation dataset and evidence rules.
4. Privacy and credential handling have automated tests.
5. Each implementation issue is a demonstrable vertical slice.
