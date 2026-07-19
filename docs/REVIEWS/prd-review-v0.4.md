# PRD Review Report: AI Collaboration Insights 产品 PRD v0.4

## Review Scope

- Handoff：用户确认的 Source Session -> Source Turn -> Semantic Round / Task 分层与阶段一范围。
- PRD：`docs/PRD/ai-collaboration-insights-product-prd-v0.4.md`。
- Decision：`docs/DECISIONS/ADR-0002-unified-fact-and-source-turn-model.md`。
- Required lenses：PM、研发、测试；补充隐私视角。
- Facts vs assumptions：已确认范围、现有代码与私有 Ground Truth 结论视为事实；对迁移和发布风险的判断标为 reviewer inference。

## Findings

### 重要 1. 阶段一私有质量门禁需要逐项量化

- 视角：PM、测试。
- 位置：PRD 16.4、ADR 验收门禁。
- 证据来源：PRD text、现有 Ground Truth aggregate。
- 问题：原文只要求“至少 20 个真实任务达到 80% 一致率”，没有分别约束 Task boundary、project、multi-goal split、Verification 和 cross-session precision。
- 影响：实现可能改善某一指标后宣称阶段完成，但关键错误类型仍未解决。
- 建议：增加 Source Turn 阶段一发布门禁，分别要求 Task boundary 与 project agreement >=80%、cross-session precision >=80%、明确 Verification recall >=80%，并覆盖私有多目标 Session。
- 处理：已回填 PRD 16.5。

### 重要 2. UnifiedEvent v1 到 v2 的迁移行为需要显式定义

- 视角：研发、测试。
- 位置：ADR 决策 4、5。
- 证据来源：现有 `EVENT_SCHEMA_VERSION = "1"`、reviewer inference。
- 问题：原文要求升级 contract，但没有说明是否读取旧派生事实、是否允许默认补字段或如何避免混用。
- 影响：旧事实可能被静默当作 v2 进入 Task 和评分，使新 provenance 契约名义存在但不可依赖。
- 建议：当前 Alpha 统一从只读源日志重建 v2；发现旧中间事实时拒绝或重建；外部 report contract 保持兼容且不泄露本地 `sourceRef`。
- 处理：已回填 ADR 5.1。

### 优化 3. Source Turn 完整度应使用有限枚举

- 视角：研发、测试、隐私。
- 位置：PRD 7.3、13，ADR 决策 2、4。
- 证据来源：PRD text、reviewer inference。
- 问题：文档要求标记推断原因与完整度，但未强制具体枚举。
- 影响：不同 parser 分支可能产生不可比较的自由文本，增加 diagnostics 和测试成本。
- 建议：Issue 中限定 `native | inferred | partial` 边界来源和结构化 diagnostics；本地 `sourceRef` 与公开引用使用不同类型。

## Lens Summary

- PM：问题、目标用户、阶段价值、非目标和停止条件清楚；单一阶段一 slice 可验证。
- 研发：Source Session、Source Turn、Semantic Round、Task 的职责边界清楚；补齐 v1/v2 迁移后可实施。
- 测试：正常流、回退、unmatched、100 Turn、回归与私有门禁均可判定通过或失败。
- 隐私：真实正文与本地定位不进入 Git/CI/公开报告；私有复测只发布聚合结果。

## Revision Draft

已直接回填两个最小修订块：PRD 16.5 的阶段一发布门禁，以及 ADR 5.1 的 v1 到 v2 迁移规则。

## Open Questions

None for phase 1. 完整 PRD v0.4 是否替代现有 MVP 文档层级，延后到私有质量门禁与 7 日 Alpha 验证通过后决定。

## Implementation-Plan Readiness

- Verdict：Ready for writing-plans。
- Reason：目标、范围、输入输出、失败路径、隐私边界、迁移策略和可测发布门禁均已明确。
- Required assumptions before planning：保持 Codex-only；不持久化完整原文；报告 UI 与外部 contract 不重做；私有 Ground Truth 不入 Git。
