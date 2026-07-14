# 任务识别与评分 Eval MVP 基线报告

> 对应 Issue：[#5](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/5)
> 基线日期：2026-07-14
> 运行环境：Python 3.14.3

## 基线范围

本基线包含 20 个 archetype，跨 `codex`、`claude-code`、`opencode`、`workbuddy`、`qoder` 五类 source tool 展开为 100 个 cases，每个工具 20 个。数据覆盖 5 个 synthetic active days。

全部 archetype、cases 和 predictions 都是从零编写的 synthetic 数据；未读取、改写或提交任何真实 AI 工具日志、prompt、response、tool output 或个人报告。`workbuddy` 与 `qoder` 仍为 `unsupported/policy_restriction`，synthetic source label 不改变 adapter policy，也不授权读取其本地数据。Credits 不等于 Token，不得把 Credits 映射为 `tokenCount`。

## 复现命令

Unit tests：

```bash
python3 -m unittest tests/eval/test_scoring_baseline.py -v
```

Conformance：

```bash
python3 scripts/eval_scoring_baseline.py \
  --rubric tests/eval/scoring-baseline/rubric.v1.json \
  --cases tests/eval/scoring-baseline/cases.v1.jsonl \
  --predictions tests/eval/scoring-baseline/predictions.conformance.jsonl
```

Threshold failure：

```bash
python3 scripts/eval_scoring_baseline.py \
  --rubric tests/eval/scoring-baseline/rubric.v1.json \
  --cases tests/eval/scoring-baseline/cases.v1.jsonl \
  --predictions tests/eval/scoring-baseline/predictions.threshold-failure.jsonl
```

## 实测结果

Unit tests 共 16 项，全部通过。

Conformance 命令 exit 0，结果如下：

| 指标 | 实测值 |
| --- | --- |
| `caseCount` | 100 |
| `jointTaskNameProjectConsistency.overall` | 1.0 |
| `jointTaskNameProjectConsistency.perTool` | 五类工具均为 1.0 |
| `boundaryMicroF1` | 1.0 |
| `aggregationExactness.taskScores` | true |
| `aggregationExactness.dayScores` | true |
| `aggregationExactness.rolling28DayScore` | true |
| gold / prediction `rolling28DayScore` | 67.62 |
| gold / prediction `activeDays` | 5 |
| gold / prediction `maturity` | L3 |
| `gates.jointTaskNameProjectConsistency` | true |
| `gates.aggregationExactMatch` | true |
| `gates.maturityExactMatch` | true |
| `gates.usageOnlyRiskNegative` | true |
| `qualityGatePassed` | true |

Threshold-failure 命令按设计 exit 1。`jointTaskNameProjectConsistency.overall` 为 0.93，`qoder` 为 0.65，`codex`、`claude-code`、`opencode`、`workbuddy` 均为 1.0。只有 `gates.jointTaskNameProjectConsistency` 为 false；`aggregationExactMatch`、`maturityExactMatch` 和 `usageOnlyRiskNegative` 均为 true，因此 `qualityGatePassed` 为 false。该反例证明单工具低于 70% 时，runner 会在整体仍高于 80% 的情况下阻断。

## 结果解释与产品边界

这里的 100% 是 harness conformance：prediction 按同一 synthetic contract 构造，用于证明 fixture、runner、聚合与门禁自洽。它不是产品 task inference accuracy，也不能证明真实 model inference 已达到 80% overall 或 70% per-tool。未来实际 inference implementation 必须继续使用同一 prediction contract 独立运行评测。

`usage-only` 反例证明：高 Token、长时长、高 session/tool/Skill/Subagent 数不会自动触发风险，也不会自动提高复杂度或得分；风险与评分必须有任务质量证据。`unavailable` 表示证据不可得，不得补 0，也不得通过重归一化制造分数。

## 门槛建议与后续

MVP 建议保持 `jointTaskNameProjectConsistency` 的 80% overall、70% per-tool 门槛，并保持当前 L3/L4 evidence counts，不在本基线中调整。未来真实私有样本只允许在本地运行；可公开内容仅限不可逆汇总，原始日志、prediction 内容和可还原切片不得进入 Git、Issue 或 PR。任何门槛调整必须另开 decision Issue，以新的本地证据和失败切片为依据。

以下均为非阻断 follow-up，不扩张本报告的 MVP 范围：

- [#31 test discovery](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/31)
- [#32 observed_absent fixture coverage](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/32)
- [#33 duplicate tags](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/33)
- [#34 eval diagnostics/error slices](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/34)
- [#35 optional model-based grader/private local samples](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/35)

视觉交付已有 [#17](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/17) 承接，不新建重复 Issue。未来真实 model inference 接入由 [#15](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/15) 与 [#16](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/16) 承接；本报告不实现 model grader。
