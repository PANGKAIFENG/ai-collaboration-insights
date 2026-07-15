# PRD Review Report: AI 协作复盘台 PRD v0.3

## Review Scope

- PRD: `docs/PRD/ai-collaboration-review-prd-v0.3.md`
- Diagram: `docs/diagrams/task-reconstruction-progressive-analysis-flow.drawio`
- Required lenses: PM、研发、测试
- Facts vs assumptions: 当前实现与本地报告的聚合结果作为事实；未来准确率和内容价值作为验收目标；真实会话内容不进入评审文档。

## Findings

本轮没有阻断或重要 finding。

### 优化 1. 真实样本验收仍依赖产品所有者本地标注

- 视角：PM、测试
- 位置：PRD 3.3、13、14
- 证据来源：PRD text
- 问题：跨会话任务和语义轮次需要真实样本才能验证，但隐私规则禁止把逐条样本提交到仓库。
- 影响：CI 只能证明合成反例和确定性契约，不能独立证明真实内容准确率达到 80%。
- 建议：自动门禁使用从零合成 fixture；发布前由产品所有者运行本地私有标注评估，只提交不可逆汇总指标。
- 处理：已在 14.1 确认，不阻断实施。

### 优化 2. 主观洞察不应扩大首版评分面

- 视角：PM、研发、测试
- 位置：PRD 6.2.2、6.2.3、8
- 证据来源：PRD text
- 问题：内容驱动洞察很有价值，但如果每条都直接进入评分，会使规则无法稳定回归。
- 影响：模型措辞变化可能导致等级漂移。
- 建议：主观洞察默认只展示；只有映射到正式五维且具备独立证据时才进入评分。
- 处理：PRD 已明确，不阻断实施。

## Lens Summary

- PM：用户问题、当前错误、范围边界、成功标准和报告阅读路径明确；没有恢复多工具、周月报或动态 Dashboard。
- 研发：Session、Task、Task Relation、Semantic Round 和 Evidence Packet 边界清楚；事实与 AI 推断、回读和降级职责可实现。
- 测试：正常流、错误合并、系统内容污染、重复循环、Token 归因、评分降级和隐私边界均有可观察验收。

## Revision Draft

本轮不需要额外 PRD patch。原有 4 个非阻断问题已按推荐口径转为“已确认实施决策”。

## Open Questions

无阻断性问题。真实样本的私有评估只能由产品所有者在发布前执行，实施计划必须把它列为 release gate，而不是 CI gate。

## Diagram Status

- 必要性：需要，当前链路包含事实扫描、任务重建、渐进回读和评分降级。
- 文件：`docs/diagrams/task-reconstruction-progressive-analysis-flow.drawio`
- 校验：Draw.io XML、节点 ID 和连线校验通过。
- 正文一致性：图中的会话分析卡、任务关系图、任务证据包、按需回读和降级路径与 PRD 一致。

## Implementation-Plan Readiness

- Verdict: Ready for writing-plans
- Reason: 目标用户、问题、范围、主链路、AI 边界、异常、隐私和验收均明确；无阻断性待确认事项。
- Required assumptions before planning: 真实任务准确率使用本地私有评估；公开仓库只承载合成 fixture 和汇总结果。
