# Test And Evaluation Documentation

This directory owns test strategy, acceptance plans, privacy/security test cases, data-source compatibility matrices, AI eval methodology, scoring calibration rules, and release verification checklists.

Executable tests belong in `/tests` or alongside code when the approved toolchain requires colocation. Only synthetic or irreversibly redacted examples may enter Git.

## Current Test Contracts

- [任务识别与评分 Eval 方法](scoring-task-eval-methodology.md)
- [任务识别与评分 Eval MVP 基线报告](scoring-task-eval-baseline-report.md)
- [渐进分析发布 Eval 方法](progressive-analysis-eval-methodology.md)
- [渐进分析公开合成 Eval 报告](progressive-analysis-synthetic-report.md)
- [真实 Task Ground Truth 基线评测](real-task-ground-truth-eval-v0.1.md)
- [真实 Task Ground Truth Source Turn 复测](real-task-ground-truth-eval-v0.2.md)
- [v0.3.0 发布验证记录](v0.3.0-verification.md)
- [OpenCode 合成 Fixture 契约](opencode-synthetic-fixture-contract.md)
- [WorkBuddy 合成 Fixture 契约](workbuddy-synthetic-fixture-contract.md)
- [Qoder 合成 Fixture 契约](qoder-synthetic-fixture-contract.md)
