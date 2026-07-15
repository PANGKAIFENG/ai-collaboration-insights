# Documentation Index

`docs/` is the canonical source for product, delivery, technical, test, and release documentation. GitHub Issues track execution; they link back to the versioned documents here.

## Directory Map

| Path | Ownership | Typical artifacts |
| --- | --- | --- |
| `PROJECT/` | Project governance | Context, stage, workflow, repository structure |
| `PRD/` | Product requirements | Versioned PRDs and requirement baselines |
| `REVIEWS/` | Review evidence | PRD, architecture, security, and release reviews |
| `ISSUES/` | Delivery planning | Issue drafts, coverage matrices, publish results |
| `DECISIONS/` | Durable decisions | ADRs and accepted/rejected alternatives |
| `TECH/` | Engineering design | Architecture, data model, adapter contracts, runbooks |
| `UI/` | Product interface | Screen inventory, state models, wireframes, mockups |
| `TESTS/` | Quality strategy | Test strategy, eval design, acceptance and fixture guidance |
| `HANDOFF/` | Stage transitions | Scoped handoffs between discovery, design, implementation, and release |
| `RELEASES/` | Release record | Release plans, notes, compatibility and installation verification |
| `diagrams/` | Editable diagrams | Draw.io architecture and flow sources referenced by other documents |

The repository-level `/plans/` lane owns approved phase roadmaps and issue-level implementation plans. It sequences the versioned product baseline and published Issues; it does not replace either source of truth.

## Source-of-Truth Rules

1. A released PRD in `PRD/` is the product baseline. Its GitHub parent Issue tracks discussion and delivery status but does not replace the file.
2. Product decisions that change scope update the PRD; technical decisions that implement the scope go to `DECISIONS/` and `TECH/`.
3. Test strategy and eval definitions go to `TESTS/`; executable tests and synthetic fixtures go to `/tests`.
4. Diagrams stay editable in `diagrams/` and are linked from the owning PRD, ADR, or technical design.
5. Generated personal reports, real session logs, API keys, private paths, and customer content are never committed.
6. Stage handoffs are temporary coordination artifacts; durable conclusions must be copied into their owning PRD, ADR, technical, UI, or test document.
7. Use lowercase kebab-case filenames except established uppercase governance files and numbered ADRs.
8. Put phase roadmaps in `/plans/`; create an issue-level implementation plan only after that Issue's blockers and required decisions are resolved.

## Current Baselines

- Product: [AI 协作复盘台 PRD v0.2](PRD/ai-collaboration-review-prd-v0.2.md)
- MVP scope: [Codex 日报 MVP 范围压缩决策 v0.1](PRD/codex-daily-report-mvp-scope-v0.1.md)
- Runtime: [ADR-0001: Codex 日报 MVP 运行时与安全边界](DECISIONS/ADR-0001-codex-daily-report-runtime.md)
- Current release: [v0.1.0 Codex 日报公开 Alpha](RELEASES/v0.1.0.md)
- Release verification: [v0.1.0 预发布验证记录](TESTS/v0.1.0-verification.md)
- Readiness: [PRD Review v0.1](REVIEWS/prd-review-v0.1.md)
- Backlog: [Published Issue Backlog v0.1](ISSUES/issue-publish-result-v0.1.md)
- Released MVP roadmap: [Codex 日报 MVP v0.1.0](../plans/ai-collaboration-insights-v1.md)
- Detailed implementation record: [Codex 日报 MVP v0.1](../plans/codex-daily-report-mvp-v0.1.md)
- Project context: [Project Context](PROJECT/project-context.md)
- Delivery workflow: [Development Workflow](PROJECT/development-workflow.md)
- Repository layout: [Repository Structure](PROJECT/repository-structure.md)
