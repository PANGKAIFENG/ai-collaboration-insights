# ADR-0002: 统一事实层与 Source Turn 模型

## 状态

Accepted

产品方向与第一阶段边界已于 2026-07-19 确认，并通过产品、研发、测试与隐私评审。生产实现必须来自 scoped GitHub Issue，并通过公开合成回归与本地私有 Ground Truth 门禁。

## 日期

2026-07-19

## 关联

- [AI Collaboration Insights 产品 PRD v0.4](../PRD/ai-collaboration-insights-product-prd-v0.4.md)
- [真实任务 Ground Truth 评估 v0.1](../TESTS/real-task-ground-truth-eval-v0.1.md)
- [ADR-0001: Codex 日报 MVP 运行时与安全边界](ADR-0001-codex-daily-report-runtime.md)

## 上下文

当前 Codex-only Alpha 已经能够把本地 JSONL 解析为 Unified Event，并进一步生成 Session facts、Task、Task Relation、Semantic Round 和 Evidence Packet。但现有事实层没有把一次真实用户输入到最终输出之间的来源轮次建模为一等对象，工具调用和结果也没有形成完整、可诊断的稳定配对。

这会使 Task Reconstructor 直接从消息、时间、项目和零散工具事件推断任务边界。真实 Ground Truth 已表明，当前主要风险不是 Trace 页面缺失，而是 Session 内多目标无法可靠拆分、跨 Session 弱关系可能污染任务组、验证与结果证据可能在解析阶段丢失。

外部开源项目可以提供实时采集、Trace 协议和可视化，但 ATIF、OTel、Phoenix 或 Langfuse 的 Trace 边界都不等于 ACI 的业务 Task，也不能完整表达 ACI 所需的本地来源定位、成果证据和推断置信度。

## 决策

### 1. ACI 保留自有统一事实模型

ACI 使用自己的版本化事实契约作为内部主模型。Codex、未来其他 Agent 和实时采集来源必须先转换为该事实模型，Task Reconstructor、Evidence Builder 和评分不直接依赖某个外部 Trace 平台的数据结构。

ATIF 和 OTel 只作为未来导出或可视化投影格式。Phoenix、Langfuse 或其他 Trace UI 可以消费投影结果，但不决定 ACI 的 Task、Outcome 或 Evidence 边界。

### 2. Source Turn 成为一等派生事实

在 Unified Event 与 Task 之间增加版本化 Source Turn：

- Source Session 表示原始日志容器。
- Source Turn 表示一次真实用户输入到该次最终输出之间的来源事实边界。
- 可观察的模型调用和工具轨迹归属于 Source Turn。
- Semantic Round 表示任务中的有效推进、反馈或调整，用于分析和评分；它不替代 Source Turn。
- Task 表示用户要完成的工作，可以包含同一或多个 Source Session 中的多个 Source Turn。

Source Turn 优先使用 Codex 原生轮次标识。原生标识缺失时，才允许使用真实用户消息建立回退边界，并记录推断原因与完整度，禁止仅按固定时间间隔猜测。

### 3. 工具轨迹保留稳定配对与诊断状态

Tool call 与 Tool result 优先通过 Codex 原生调用标识配对。配对关系必须保留调用名称、动作分类、结果可用性和受限内容摘要；无法配对的事件保持 unmatched 状态并进入 diagnostics，不能静默丢弃，也不能只凭时间相近强制配对。

上下文压缩、系统注入、状态轮询和历史重放不自动建立新的 Source Turn。Subagent 通过原生父子 Session、生命周期或委派证据关联来源 Turn；缺少强证据时只保留候选关系。

### 4. 每个派生结论保留本地 provenance

Unified Event 至少保留稳定事件 ID、Source Session、Source Turn、原生事件或调用引用、内容 digest、parser version 和本地受限来源定位。

- 真实源路径、Prompt、Response 和完整 Tool Result 只存在于本地只读源或受限回读上下文。
- 公开 HTML、GitHub、CI、Issue、PR、Release 和合成 fixture 不包含真实路径、Session ID 或正文。
- Task、Outcome、Verification 和 Evidence 通过稳定引用回到 Source Turn 与 Event，而不是复制完整原文。
- parser contract 变化时显式升级版本；不得让新旧中间事实静默混用。

### 5. 第一阶段保持 Codex-only 和无数据库

第一阶段只实现 Codex 历史日志的事实与 Source Turn 主干：

- 不接入 Claude Code、OpenCode 或其他真实来源。
- 不接入 OpenLIT 实时采集。
- 不建设 SQLite、daemon、localhost API 或动态 Dashboard。
- 不重做现有静态报告页面。
- 允许在 ACI 私有派生数据目录使用带版本的 JSON/JSONL 表达 Event、Turn 和 diagnostics，但不长期复制完整原始正文。

只有 Source Turn 契约稳定、私有 Ground Truth 达到产品门槛后，才评估第二 Adapter、实时采集和 ATIF/Phoenix 投影。

### 5.1 v1 到 v2 的迁移规则

- `UnifiedEvent` schema version 从 `1` 升级为 `2`，同一运行中不得混用两个版本。
- 当前 Alpha 不把 Unified Event 作为跨版本持久化公共 API；报告生成时从只读 Codex 源日志重新构建 v2 事实。
- 发现带旧 schema version 的 ACI 派生中间事实时必须拒绝或重建，不能静默补默认字段后继续评分。
- 对外报告继续使用既有 report contract；新增 provenance 只以稳定、脱敏引用进入报告数据，不暴露本地 `sourceRef`。

### 6. Task 重建改为 Turn-first

Task Reconstructor 按以下顺序工作：

1. 过滤系统注入、脚手架内容、重复事件和历史重放。
2. 在 Source Session 内基于 Source Turn 识别真实目标、目标切换和继续关系。
3. 形成 Session 内 Task segment。
4. 使用 continuation、delegation、明确共享交付物等强证据建立跨 Session 关系。
5. 项目相同和时间接近只形成 candidate，不能触发自动合并。
6. Outcome、Verification 和成果必须引用实际 Event、Turn 或产物证据；证据不足时降级为 partial、unknown 或 not observed。

错误合并比错误拆分更损害产品信任，因此冲突或弱证据默认保持拆分，并允许通过候选关系表达可能关联。

## 验收门禁

进入第二数据源或新 Trace UI 前必须满足：

1. 同一源日志和 parser version 重算产生稳定 Event ID 与 Source Turn ID。
2. 存在原生轮次标识的样本可以确定性恢复 Source Turn；回退边界显式标记完整度。
3. 存在原生调用标识的 Tool call/result 可稳定配对；unmatched 事件有可观察 diagnostics。
4. 每个 Task 至少引用一个 Source Turn，每个结论性 Evidence 可回查到 Event 和本地受限来源定位。
5. 100 Turn 级长 Session 在既有资源限制内完成流式处理，不要求页面默认平铺全部事件。
6. 使用同一套私有 Ground Truth 复测，Task 边界、Session 内多目标切分、项目归属、Verification 和跨 Session precision 达到当前产品门槛。
7. 源日志只读、隐私扫描、现有确定性报告和降级路径无回退。

## 备选方案

### 方案 A：继续直接从 Unified Event 重建 Task

不采用。改动最小，但无法稳定表达一次输入输出的来源边界，现有 Ground Truth 已暴露过度合并、欠拆分和证据丢失问题。

### 方案 B：把 ATIF 或 OTel 作为 ACI 内部主模型

不采用。它们适合轨迹交换和观测投影，但缺少 ACI 所需的 Task、成果归因、本地 provenance 和推断置信度对象；外部格式变化还会反向约束产品模型。

### 方案 C：先实现 Langfuse/Phoenix 风格 Trace UI

不采用。它能改善日志浏览，却不能证明 Task 边界与 Outcome 可信，并会在事实主干不稳定时固化错误信息结构。

### 方案 D：同时接入多个 Agent Adapter

不采用。多来源会扩大兼容矩阵，并把尚未验证的 Turn 和 Task 规则复制到不同日志格式。

## 影响

### 正向影响

- Task、Outcome、Verification 和 Evidence 获得统一、可回查的来源主干。
- 长 Session 可以按 Task 和 Turn 分层消费，不必默认平铺全部 Trace。
- 后续新增 Adapter 只负责事实归一化，不需要改写 Task 与评分逻辑。
- ATIF、OTel、Phoenix 和 Langfuse 可以作为可替换投影，不形成核心依赖。

### 代价与风险

- Unified Event contract 需要版本升级，并处理已有测试和报告兼容。
- Source Turn 边界在旧日志或字段缺失时仍可能 partial，不能承诺全部恢复。
- 保留 Tool Result 摘要和本地 provenance 会增加隐私、大小限制与回读策略测试。
- 如果 Task Ground Truth 没有改善，应停止扩展 UI 和 Adapter，重新检查事件信任、重放去重和边界规则，而不是继续增加语义模型复杂度。

## 后续动作

1. 对本 ADR 和 PRD v0.4 做产品、架构、隐私与可测试性评审。
2. 评审通过后创建一个 scoped GitHub Issue，只覆盖 Codex Unified Event v2、Source Turn、工具配对、provenance 和私有 Ground Truth 复测。
3. Issue 明确验收与迁移策略后，再进入 implementation plan 和生产代码。
