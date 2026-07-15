# 渐进分析发布 Eval 方法

> 对应 Issue：[#57](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/57)
> 状态：Codex 日报公开 Alpha 发布门禁

## 1. 目的与边界

本契约验证任务最终分组、跨会话关系诊断、语义轮次、typed evidence 和渐进分析
覆盖状态。公开 CI 只运行从零合成的 fixture；真实会话只允许在本机已忽略目录运行，
且只能公开 `--share-safe` 汇总。

本 eval 不读取日志、不调用模型、不修改报告，也不把 conformance 的 100% 解释为产品
真实准确率。它只验证 runner、contract 和门禁自洽；真实发布结论必须来自独立的本地
gold/prediction。

## 2. JSONL contract v1

每个文件包含且仅包含一个 `metadata`，并使用相同 `datasetId`、`datasetKind` 和
`contractVersion=1`。`datasetKind` 仅允许 `synthetic|private`。

| `recordType` | Gold | Prediction | 评价对象 |
| --- | --- | --- | --- |
| `task_grouping` | `caseId`、`slice`、`members[{id,groupId}]`、`relations` | 同 shape，group label 可不同 | 最终 partition 与关系边 |
| `semantic_rounds` | `rounds[{id,effective}]` | 同 shape | 有效/无效轮次 |
| `evidence` | `evidence[{id,type,state}]` | 同 shape，可缺失或新增 item | 证据识别与三态 |
| `analysis_coverage` | `taskIds`、`expectedAnalyzedTaskIds`、`expectedStatus` | `analyzedTaskIds`、`status` | 任务覆盖与降级状态 |

Evidence state 使用 `present|observed_absent|unknown`；分析状态使用
`complete|partial|degraded|unavailable`。Gold 与 prediction 必须具有完全相同的
`recordType/caseId` 集合和 slice；任务成员与轮次 ID 也必须一致。缺 record、重复 ID、
未知字段或非法枚举都返回 validation error。

## 3. 指标与门禁

任务分组使用 B-cubed precision/recall/F1。每个 member 比较 prediction cluster 与 gold
cluster 的交集，先得到 member precision/recall，再在整体或 slice 内做 macro average；
group label 本身不参与比较。

发布门禁固定为：

- overall task-grouping F1 `>= 0.80`。
- `system_scaffolding`、`goal_split`、`explicit_continuation`、
  `shared_deliverable`、`parent_child`、`ambiguous_proximity` 每类 F1 `>= 0.70`。
- private dataset 至少 20 个最终 gold task groups、30 个 gold semantic rounds。

以下指标独立报告，不替代任务分组主门禁：

- relation edge micro precision/recall/F1。
- semantic-round effective state accuracy。
- evidence identity precision/recall/F1 与 state accuracy。
- progressive-analysis coverage precision/recall/F1。
- partial/degraded status accuracy。

CLI 退出码：`0` 为全部门禁通过，`1` 为合法输入未达门槛，`2` 为输入或 contract
校验失败。

## 4. 公开 synthetic coverage

公开 gold 覆盖 6 类任务边界、工具 burst、用户纠偏、test-fix-retest、相同失败机械
重试、Subagent polling、强独立证据、关键词假阳性、中置信单来源、未知证据、Agent
生命周期，以及 complete/partial/degraded/unavailable 分析状态。

Threshold-failure prediction 只破坏 `system_scaffolding` partition，使整体 F1 仍高于
80%，该 slice 低于 70%。这证明 runner 不会用整体高分掩盖关键边界退化。

## 5. 私有本地评估

将独立人工 gold 和当前实现 prediction 放在：

```text
tests/fixtures/private/progressive-analysis/gold.private.v1.jsonl
tests/fixtures/private/progressive-analysis/predictions.private.v1.jsonl
```

该目录已被 `.gitignore` 排除。真实日志、Prompt、回复、工具输入输出、项目路径、
dataset/case ID、逐条错误和可还原切片不得进入 Git、Issue、PR、CI 或 Release。

本地运行：

```sh
python3 scripts/eval_progressive_analysis.py \
  --gold tests/fixtures/private/progressive-analysis/gold.private.v1.jsonl \
  --predictions tests/fixtures/private/progressive-analysis/predictions.private.v1.jsonl \
  --share-safe
```

公开发布记录只允许复制 sample counts、aggregate ratios、gates 和最终通过/失败结论。
