# Test And Evaluation Documentation

This directory owns test strategy, acceptance plans, privacy/security test cases, data-source compatibility matrices, AI eval methodology, scoring calibration rules, and release verification checklists.

Executable tests belong in `/tests` or alongside code when the approved toolchain requires colocation. Only synthetic or irreversibly redacted examples may enter Git.

## Current Test Contracts

- [任务识别与评分 Eval 方法](scoring-task-eval-methodology.md)
- [OpenCode 合成 Fixture 契约](opencode-synthetic-fixture-contract.md)
- [WorkBuddy 合成 Fixture 契约](workbuddy-synthetic-fixture-contract.md)
- [Qoder 合成 Fixture 契约](qoder-synthetic-fixture-contract.md)
