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
3. Put accepted technical choices in `docs/DECISIONS/` and detailed implementation contracts in `docs/TECH/`.
4. Put screen structure and design artifacts in `docs/UI/`, not in PRD appendices or application source folders.
5. Put test/eval plans in `docs/TESTS/`; put executable suites and synthetic data in `tests/`.
6. Put deployable entrypoints in `apps/`, reusable modules in `packages/`, and repository automation in `scripts/`.
7. Keep generated reports, databases, exports, credentials, and private fixtures outside Git through `.gitignore`.
8. Link every implementation branch and pull request to a GitHub Issue and include verification evidence.

## Change Gate

A new top-level directory requires an update to this document and `AGENTS.md`. A new app or package requires the architecture ADR or a later accepted decision to define its ownership and dependency direction.
