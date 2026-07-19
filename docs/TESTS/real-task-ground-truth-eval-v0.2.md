# 真实 Task Ground Truth 评测 v0.2

> 对应 Issue：[#86](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/86)、
> [#90](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/90)
> 被评测版本：`v0.3.0` release candidate
> 评测日期：2026-07-19

## 结论

Unified Event v2、Source Turn 与 Turn-first Task 主干通过 PRD 16.5 的五项阶段一硬门禁。
与 `v0.2.2` 基线相比，Task boundary agreement 从 57.7% 提升到 88.5%，Project
agreement 从 30.4% 提升到 82.6%；三个明确 multi-goal case 均识别目标切换，
Explicit Verification recall 和当前跨 Session Task-group precision 均为 100%。

**阶段门禁：PASS。** 可以发布 Codex-only Source Turn 阶段一，但不能据此宣称完整产品
Alpha 已验证，也不能提前扩展第二数据源、实时 Trace UI、长期画像或自动资产沉淀。

## 隐私与复算边界

- 使用与 v0.1 基线相同的 26-case 本地私有 Ground Truth，覆盖四个日报窗口。
- 从冻结的只读 Codex JSONL 重新扫描和重建 Task，没有使用 AI enrichment 改写结果。
- 私有 scorer 校验每个标注映射、五项分母、跨 Session Task 数量和 Event/Turn provenance。
- 原始日志、Prompt/Response、Tool Result 正文、路径、Session ID、个人报告和逐 case 标签
  均留在 Git 之外；本文只包含 share-safe 聚合结果。

## 评分口径

评分延续 v0.1 的人工 Ground Truth 定义，并固定阶段一门禁：

- Task boundary agreement：26 个既有 case 中，当前结果是否与人工真实任务边界一致。
- Project agreement：排除 3 个无真实用户任务的 false positive 后，以 23 个 case 为分母。
- Multi-goal switch recall：三个明确包含多个用户目标的 Session 是否都识别切换。
- Explicit Verification recall：18 个存在明确测试、检查、发布核验、读回或失败结果的
  case 是否观察到对应结果。
- Cross-session Task-group precision：当前输出中 7 个包含多个 Source Session 的最终
  Task group 是否全部属于同一真实任务。

## 聚合结果

| 维度 | v0.2.2 基线 | v0.3.0 RC | 门槛 | 结论 |
| --- | ---: | ---: | ---: | --- |
| Task boundary agreement | 15/26，57.7% | 23/26，88.5% | >= 80% | PASS |
| Project agreement | 7/23，30.4% | 19/23，82.6% | >= 80% | PASS |
| Multi-goal switch recall | 0/3，0% | 3/3，100% | 100% | PASS |
| Explicit Verification recall | 6/18，33.3% | 18/18，100% | >= 80% | PASS |
| Cross-session Task-group precision | 2/9，22.2% | 7/7，100% | >= 80% | PASS |

四天结果共输出 53 个 Task，其中 7 个为跨 Session Task。最终 Task relations 中没有
`fromTaskId == toTaskId` 的自关系；抽样覆盖全部 7 个跨 Session Task，其 Event 均具备
稳定 Event ID、Source Session、Source Turn 和有效的本地受限来源定位。

## 已验证的改进

1. Source Turn 先过滤注入、历史重放和 Subagent-only 内容，再建立用户目标边界。
2. 目标切换先在 Session 内完成，跨 Session 只由强关系证据合并。
3. Tool call/result 使用原生调用 ID，失败结果与 unmatched diagnostics 可观察。
4. Project 从 Task 内证据推断，避免只使用 Session 初始 cwd。
5. Task、Outcome、Verification 与 Evidence 均保留 Turn/Event 引用。
6. Union-Find 合并后的最终 relation 会再次投影和过滤，不发布 Task 自关系。

## 剩余风险

- 边界与 Project 仍未达到 100%，低置信旧日志需要保持拆分或 partial，不能自动扩大合并。
- 当前评测只覆盖 Codex；不同 Agent 的原生日志语义不能从本结果外推。
- 26-case 样本适合阶段回归，不替代七日 Alpha 稳定性、可理解性和建议闭环验证。
- 私有样本不可进入 CI，因此公开 CI 使用 synthetic fixture 验证结构和回归，真实门禁由
  本地私有 scorer 复算并只发布聚合结论。
