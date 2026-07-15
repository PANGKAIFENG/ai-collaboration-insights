# Project Context

## Mission

Build an open-source, local-first product that helps individuals understand and improve how they collaborate with AI coding tools.

## Current Phase

`v0.1.0` has been released as a public alpha. Engineering validation on
synthetic fixtures and the release installation path is complete. The current
phase is seven active days of real Codex usage to validate report reliability,
task recognition, comprehension, and coaching value before expanding scope.

## Target User

The current alpha targets individuals who use Codex frequently for software
development or AI product work. Claude Code, OpenCode, WorkBuddy, and Qoder
remain future data sources after the Codex daily-report hypothesis is validated.

## Current MVP Outcome

For each local 19:00-to-19:00 window, the user can open a generated static HTML
report and:

1. See reliable Codex usage data and the evidence for the daily score and L1-L4.
2. Review tasks, projects, work intervals, and outcomes.
3. Understand the day's main work within one minute.
4. Choose an evidence-backed improvement to try in the next cycle.

## Product Boundaries

- Codex source logs are the immutable source facts and remain read-only.
- `report.json` and `manifest.json` are versioned, reproducible derived results;
  the MVP does not use SQLite.
- Optional semantic analysis requires explicit consent and reuses the local
  Codex CLI login through an isolated ephemeral process; the product does not
  accept or store an API key.
- The MVP is single-user and macOS-only.
- Reports are self-contained local HTML with no JavaScript, remote resources,
  listening server, telemetry, or cloud upload.
- The MVP does not include a central account service, public ranking, team
  analytics, calendar integration, or interactive correction.

## Confirmed Decisions

- Product form: one-shot `aci` CLI, `launchd` scheduling, static HTML, and local
  report history.
- License: Apache-2.0.
- Default analysis: deterministic metrics, task inference, evidence scoring,
  and coaching suggestions without a model dependency.
- Optional analysis: minimized semantic analysis after explicit consent.
- Report boundary: 19:00 local time.
- Score: daily 0-100 plus daily L1-L4; no rolling trend in the MVP.
- Score dimensions: task definition, orchestration, iteration, verification, and assetization.

## Public Alpha Validation Gates

1. Across seven active Codex days, at least six reports generate without manual repair.
2. Review at least 20 real tasks; task naming and project assignment reach 80% agreement.
3. The user can understand the day's main work within one minute.
4. At least one coaching suggestion is actionable and is tried in a later session.
5. After seven days, the user still wants reports to generate automatically.

Only after these signals pass should the project decide whether to add another
data source, weekly/monthly aggregation, a dynamic Dashboard, or other product
shell. If they fail, improve report content, evidence, and scoring first.
