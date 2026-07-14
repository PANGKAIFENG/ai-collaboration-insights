# Repository Structure

## Current Snapshot

The project is in technical validation. Product requirements, review evidence, editable diagrams, and the published issue backlog exist. Production code has not started.

## Stable Top-Level Map

```text
ai-collaboration-insights/
├── .github/       Issue and pull request workflows
├── apps/          Deployable local applications
├── packages/      Shared domain and infrastructure modules
├── tests/         Cross-package automated tests and synthetic fixtures
├── scripts/       Repository automation and deterministic checks
├── plans/         Approved phase roadmaps and issue-level implementation plans
├── docs/          Canonical product and engineering documentation
├── AGENTS.md      Agent execution and privacy rules
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

The exact directories under `apps/` and `packages/` are intentionally deferred to architecture Issue #6. Do not create framework-specific package boundaries before that ADR is approved.

## Placement Rules

1. Put project mission, current phase, workflow, and repository governance in `docs/PROJECT/`.
2. Put versioned product scope in `docs/PRD/`; never use an Issue body as the only PRD copy.
3. Put approved phase sequencing in `plans/`; put code-level execution steps in an issue plan only after its blockers are resolved.
4. Put accepted technical choices in `docs/DECISIONS/` and detailed implementation contracts in `docs/TECH/`.
5. Put screen structure and design artifacts in `docs/UI/`, not in PRD appendices or application source folders.
6. Put test/eval strategy in `docs/TESTS/`; put executable suites and synthetic data in `tests/`.
7. Put deployable entrypoints in `apps/`, reusable modules in `packages/`, and repository automation in `scripts/`.
8. Keep generated reports, databases, exports, credentials, and private fixtures outside Git through `.gitignore`.
9. Link every implementation branch and pull request to a GitHub Issue and include verification evidence.

## Change Gate

A new top-level directory requires an update to this document and `AGENTS.md`. A new app or package requires the architecture ADR or a later accepted decision to define its ownership and dependency direction. GitHub Issues remain the execution-status source; plans must not create a competing backlog.
