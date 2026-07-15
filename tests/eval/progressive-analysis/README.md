# Progressive Analysis Eval Fixtures

本目录承载 Issue #57 的公开 synthetic gold、conformance prediction 和
threshold-failure prediction。数据全部从零编写，不来自真实 Codex 日志、Prompt、
回复、工具输出、路径或个人报告。

- `gold.synthetic.v1.jsonl` 覆盖 6 类任务边界、5 类语义轮次、typed evidence
  三态和 4 类渐进分析状态。
- `predictions.conformance.v1.jsonl` 使用不同 group label 表达相同 partition，
  证明评分不依赖任意标签名。
- `predictions.threshold-failure.v1.jsonl` 保持整体 F1 高于 80%，只让
  `system_scaffolding` 低于 70%，证明 required-slice gate 会阻断发布。

真实标注只能放在已忽略的 `tests/fixtures/private/progressive-analysis/`，不得提交。
方法与 record contract 见
[渐进分析发布 Eval 方法](../../../docs/TESTS/progressive-analysis-eval-methodology.md)。
