# Scoring Baseline Fixtures

本目录承载 Issue #5 的最小 synthetic eval 数据、prediction 和 rubric。

- `rubric.v1.json`：固定最小 record shape、五维权重、decimal 聚合、L1-L4 逐级降级算法，以及 task name + project 与 boundary F1 规则。
- 后续 Task 将加入 20 个 archetype、跨五类 source tool 展开的 100 个 cases，以及 conformance / threshold-failure predictions。

所有数据必须从零合成，不得读取或改写真实 AI 工具日志。`usageContext` 只承载禁止参与评分的使用量反例；普通 deliverable 不自动计为 reusable asset。WorkBuddy 与 Qoder 的 source 标签不改变其 `unsupported/policy_restriction` 状态。conformance 结果只验证 harness 自洽，不代表产品准确率。

方法和 record 定义见 [任务识别与评分 Eval 方法](../../../docs/TESTS/scoring-task-eval-methodology.md)。
