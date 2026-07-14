# Issue 5 Scoring And Task Eval Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用最小可维护实现建立 100 个纯 synthetic task groups、确定性评分边界和可重复基线报告，随后尽快进入 MVP。

**Architecture:** 20 个行为 archetype 跨五类 `sourceTool` 展开为 100 个 cases；source 标签只验证统一证据层的一致性，不代表对应 adapter 已获准读取本地数据。一个 Python stdlib runner 同时完成数据校验、指标计算、日/28 天聚合和门禁报告，不引入框架或第三方依赖。

**Tech Stack:** Markdown、JSON/JSONL、Python 3 stdlib `unittest`。

---

## MVP Boundaries

- 本 Issue 只做 eval contract、100-case fixture、runner 和基线报告，不实现生产评分服务、数据库、API 或 UI。
- WorkBuddy/Qoder 仍为 `unsupported/policy_restriction`；synthetic unified evidence 不改变 adapter 状态。
- conformance prediction 只证明 harness 自洽，不声称产品模型已经达到 80%/70%。
- 五维权重、复杂度 1/2/3、日分、28 天、L3/L4 evidence gate 严格沿用 PRD，不在首轮重新发明公式。
- `unavailable` 与观察到的 0 分开；五维不完整时 task 总分为 `null`，避免补 0 或重归一化放大。
- Token、时长、会话数、工具数、Skill/Subagent 数不得进入复杂度或得分计算。
- 非阻断问题记录 GitHub Issue；只有数据泄漏、错误计分、门禁失效和无法重复运行阻塞当前 PR。

## Task 1: Define The Minimal Eval Contract

**Files:**
- Create: `docs/TESTS/scoring-task-eval-methodology.md`
- Create: `tests/eval/scoring-baseline/rubric.v1.json`
- Create: `tests/eval/scoring-baseline/README.md`
- Modify: `docs/TESTS/README.md`

- [ ] **Step 1: Define gold and prediction records**

Gold 包含 task boundary、project、accepted task names、complexity、五维分数、iteration/verification/asset gates、risk labels 和 confidence。Prediction 只包含 candidate output，不复制 gold 或真实内容。

- [ ] **Step 2: Freeze the gates**

固定 joint task/project consistency 整体 >=80%、单工具 >=70%；另报 boundary F1。聚合与 L1-L4 必须 exact match；仅高 Token/长时长的反例不得触发风险。

- [ ] **Step 3: Document annotation and privacy**

首轮 synthetic gold 由人工复核；未来真实本地样本只记录汇总指标，不进入 Git、Issue、PR 或日志。明确 `present`、`observed_absent`、`unavailable`。

- [ ] **Step 4: Verify and commit**

Run: `python3 -m json.tool tests/eval/scoring-baseline/rubric.v1.json >/dev/null && git diff --check`

Expected: exit 0。

Commit: `docs(eval): define minimum scoring baseline`

## Task 2: Build One Deterministic Runner Test-First

**Files:**
- Create: `tests/eval/test_scoring_baseline.py`
- Create: `scripts/eval_scoring_baseline.py`
- Modify: `scripts/README.md`

- [ ] **Step 1: Write focused failing tests**

只覆盖 MVP 阻断行为：非 100 cases、非 20-per-tool、重复 ID、非法复杂度/权重、缺失 prediction、usage-only 字段影响评分、日分/28 天/L3/L4 计算错误、单工具低于 70% 未阻断。

- [ ] **Step 2: Confirm RED**

Run: `python3 -m unittest tests/eval/test_scoring_baseline.py -v`

Expected: FAIL because runner does not exist。

- [ ] **Step 3: Implement the runner**

提供 `load_jsonl`、contract validation、task/day/28-day score、maturity assignment、prediction metrics 和 CLI report。只使用 Python stdlib。

- [ ] **Step 4: Confirm GREEN and commit**

Run: `python3 -m unittest tests/eval/test_scoring_baseline.py -v`

Expected: all tests PASS。

Commit: `test(eval): add minimum scoring runner`

## Task 3: Add 20 Archetypes Expanded To 100 Cases

**Files:**
- Create: `tests/eval/scoring-baseline/archetypes.v1.json`
- Create: `tests/eval/scoring-baseline/cases.v1.jsonl`
- Create: `tests/eval/scoring-baseline/predictions.conformance.jsonl`
- Create: `tests/eval/scoring-baseline/predictions.threshold-failure.jsonl`

- [ ] **Step 1: Author 20 compact archetypes**

覆盖 5/20 分钟、跨项目、并行 Agent、复杂度 1/2/3、五维高低锚点、不可评分、L3/L4 降级、无效循环、重复失败、过度编排、未验证完成，以及高 Token/长时长但有高质量结果的风险反例。

- [ ] **Step 2: Expand across five tool labels**

Codex、Claude Code、OpenCode、WorkBuddy、Qoder 各 20 个独立 case ID。只使用 synthetic unified evidence，不包含真实上游 schema、路径、会话或内容。

- [ ] **Step 3: Prove pass and fail gates**

Conformance predictions 必须通过；threshold-failure predictions 让一个工具低于 70%，runner 必须失败。两者都明确是 harness self-test。

- [ ] **Step 4: Verify and commit**

Run conformance: expected exit 0 and 100 cases / 20 per tool。

Run threshold failure: expected non-zero and named per-tool gate failure。

Commit: `test(eval): add 100 synthetic task groups`

## Task 4: Publish Baseline And Triage The Rest

**Files:**
- Create: `docs/TESTS/scoring-task-eval-baseline-report.md`
- Modify: `docs/TESTS/README.md`

- [ ] **Step 1: Publish reproducible results**

记录命令、Python 版本、case/tool counts、joint consistency、boundary F1、aggregation/level exactness 和 usage-only risk gate。

- [ ] **Step 2: State the honest product boundary**

写明 100% conformance 是 harness 结果，不是产品 inference accuracy；实际 implementation 接入后必须用同一 prediction contract 再跑。

- [ ] **Step 3: Keep current PRD thresholds**

推荐首轮保留 80% overall、70% per-tool 与 L3/L4 evidence counts。未来私有样本只提交汇总；需要改门槛时另开 decision Issue。

- [ ] **Step 4: Run final gates**

Run: `python3 -m unittest tests/eval/test_scoring_baseline.py -v`

Run: conformance and threshold-failure CLI commands。

Run: `git diff --check origin/main...HEAD` plus privacy/secret/forbidden-file scans。

Expected: all required gates pass。

- [ ] **Step 5: File non-blocking follow-ups and request review**

把不影响 MVP 的 metric polish、额外 archetype、可视化和 model-based grader 分别记录为 GitHub Issue，不扩张当前 PR。Issue #5 仅在人审确认当前门槛建议后关闭。

Commit: `docs(eval): publish MVP scoring baseline`

