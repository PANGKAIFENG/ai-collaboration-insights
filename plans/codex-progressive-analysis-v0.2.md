# Codex 日报渐进分析 v0.2 Implementation Plan

**Goal:** 在不扩大 Codex 日报 MVP 产品范围的前提下，把粗粒度时间分组升级为可信会话事实、跨会话任务、语义轮次、逐任务渐进分析和置信度评分，并发布下一个公开 Alpha。

**Architecture:** 保持 Deno one-shot CLI 和静态 HTML。解析层只规范化只读日志；确定性分析依次构建 `SessionProfile -> TaskGraph -> SemanticRound -> EvidencePacket`；可选 Codex analyzer 只接收逐任务脱敏证据包；评分只消费 typed evidence；pipeline 继续原子发布版本化报告。

**Tech stack:** Deno 2、TypeScript、无第三方运行时依赖、GitHub Actions、Python 标准库评估脚本。

## Scope Guard

- Included: Codex、日报、CLI、静态 HTML、合成 CI、私有本地发布评估。
- Deferred: 多工具、周月报、daemon、Dashboard、SQLite、日历、云同步。
- One Issue, one branch, one vertical-slice PR. Non-blocking defects become Issues.

## Contract Map

| Path | Change |
| --- | --- |
| `packages/core/types.ts` | Versioned session, task relation, semantic round, evidence packet, insight and distribution contracts |
| `packages/codex/parser.ts` | Usage snapshot semantics and Codex multi-agent lifecycle normalization |
| `packages/analysis/facts.ts` | Session facts, interval union, usage deltas and sample distributions |
| `packages/analysis/tasks.ts` | Source classification, task splitting and cross-session relation graph |
| `packages/analysis/rounds.ts` | Semantic-round segmentation and repeated-loop classification |
| `packages/analysis/evidence.ts` | Per-task bounded evidence packets and coverage diagnostics |
| `packages/analysis/redaction.ts` | Progressive analyzer input and privacy budgets |
| `packages/analysis/codex_analyzer.ts` | Per-task inference, coverage and insight schema validation |
| `packages/analysis/scoring.ts` | Typed confidence gates and maturity downgrade reasons |
| `packages/report/pipeline.ts` | Stage orchestration, partial coverage and enrichment merge |
| `packages/report/renderer.ts` | Fact distributions, task relations, key rounds and insight presentation |
| `scripts/eval_progressive_analysis.py` | Public/private compatible evaluation and share-safe summary |
| `tests/fixtures/codex/` | Synthetic lifecycle, task-boundary, round and degradation fixtures |

## Phase 1: Trustworthy Facts (#52)

1. Write RED tests for cumulative usage snapshots, cross-project overlapping activity, unique Subagent lifecycle and Codex 0.131 event mapping.
2. Add normalized usage/lifecycle fields without guessing absent data.
3. Add `facts.ts` for session profiles, global interval union and distribution summaries.
4. Keep a compatibility projection into `DailyReport.usageMetrics` while schema v2 fields are introduced.
5. Verify focused tests, source-integrity integration test and `deno task verify`.
6. PR closes #52, #46, #47 and #49.

## Phase 2: Task Reconstruction (#53)

1. Write RED fixtures for system scaffolding, one-session two-goal split, explicit continuation, shared deliverable, parent-child Agent and ambiguous same-project proximity.
2. Add source classification and eligible task-title selection.
3. Build task candidates per session, then a typed relation graph; merge only on strong evidence.
4. Preserve candidate edges and confidence instead of silently merging.
5. Verify deterministic repeatability and report pipeline compatibility.
6. PR closes #53 and #48.

## Phase 3: Semantic Rounds and Evidence Packets (#54)

1. Write RED tests for tool bursts, user correction, test-fix-retest, repeated identical failures and Subagent polling.
2. Segment rounds into intent, attempt, feedback and adjustment with effective/ineffective status.
3. Build one bounded packet per task with required evidence categories, omissions and coverage.
4. Ensure every task core survives the daily budget; truncate optional details first.
5. Verify packet redaction, deterministic ordering and maximum five displayed key rounds.
6. PR closes #54.

## Phase 4: Progressive AI Analysis (#55)

1. Write RED analyzer tests proving late tasks are never starved and optional reread only targets low-confidence/conflicting tasks.
2. Replace global `messages.slice(0, 80)` with task packets and explicit coverage metadata.
3. Validate per-task inference and zero-to-two evidence-backed session insights.
4. Preserve deterministic tasks and scores on timeout, invalid output or partial analysis.
5. Verify consent, argv isolation, privacy budgets and no new persistence/transmission path.
6. PR closes #55.

## Phase 5: Confidence Scoring and Report (#56)

1. Write RED negative tests: keywords only, medium-confidence single category, missing evidence, partial analysis and usage-only high volume.
2. Score typed evidence with independent-category gates; record dimension downgrade reasons.
3. Render fact distributions and sample sizes, outcomes, up to five key rounds, coverage and at most three coaching actions.
4. Preserve CSP, no JavaScript, no remote resources and strict escaping.
5. Verify synthetic desktop/mobile report plus schema migration compatibility.
6. PR closes #56.

## Phase 6: Evaluation and Release (#57)

1. Add synthetic gold/prediction contracts and a no-dependency evaluator.
2. Support a local ignored path for at least 20 real tasks and 30 real semantic rounds.
3. Emit content-free metrics for task grouping, relation diagnostics, round accuracy, evidence precision and analysis coverage.
4. Require overall task grouping >=80% and each required slice >=70%; document any known non-blocking gaps.
5. Run CR against PRD acceptance criteria, `deno task verify`, privacy scan, deterministic and AI smoke reports, installer smoke and CI.
6. Bump the minor Alpha version, publish release notes/tag/assets, install from the GitHub Release and verify `aci version`, `doctor`, `schedule status` and report generation.

## Release Gates

- All #52-#56 acceptance criteria checked in merged PRs.
- Public CI and macOS binary jobs pass.
- Private local evaluation meets the approved 80%/70% thresholds.
- No real logs, prompts, replies, paths, reports or credentials appear in Git, Issues, PRs or release artifacts.
- Generated static HTML remains understandable in one minute and shows explicit partial/degraded states.
