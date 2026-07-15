# 实施计划

`plans/` 负责记录从产品基线到可执行 GitHub Issues 之间已经批准的交付顺序。

## 计划类型

- `plans/<initiative>.md`：从 PRD 推导出的、跨阶段的稳定路线图。
- `plans/issues/<issue>-<slug>.md`：仅在 Issue 已解除阻塞并准备进入开发时创建的代码级实施计划。

## 事实源顺序

1. `docs/PRD/` 定义产品范围与验收结果。
2. `docs/DECISIONS/` 和 `docs/TECH/` 定义已接受的技术边界与契约。
3. GitHub Issues 定义可执行工作、依赖和当前交付状态。
4. `plans/` 定义已批准的顺序，并在 Issue 可执行后记录其测试驱动步骤。

不要在路线图中镜像 GitHub 的任务勾选状态。只有阶段顺序、依赖或稳定决策发生变化时才更新路线图。

## 当前计划

- [Codex 日报 MVP v0.1.0 路线图](ai-collaboration-insights-v1.md)
- [Codex 日报 MVP v0.1 实施计划](codex-daily-report-mvp-v0.1.md)
