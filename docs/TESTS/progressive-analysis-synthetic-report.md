# 渐进分析公开合成 Eval 报告

> 对应 Issue：[#57](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/57)
> 基线日期：2026-07-15

## 范围

公开基线包含 12 个最终 synthetic tasks、18 个 task members、10 个 semantic rounds、
10 个 typed evidence items 和 4 个 analysis coverage cases。所有内容从零合成；未读取
或改写任何真实会话、Prompt、回复、工具输出、路径或个人报告。

## 复现

```sh
python3 -m unittest tests/eval/test_progressive_analysis.py -v

python3 scripts/eval_progressive_analysis.py \
  --gold tests/eval/progressive-analysis/gold.synthetic.v1.jsonl \
  --predictions tests/eval/progressive-analysis/predictions.conformance.v1.jsonl \
  --share-safe
```

## 实测结果

Unit tests 共 8 项，全部通过。Conformance exit 0：task grouping overall 和 6 个
required slices 均为 `1.0`；relation、semantic rounds、evidence、coverage 和 degradation
指标均为 `1.0`；`qualityGatePassed=true`。

Threshold-failure exit 1：task grouping overall F1 为 `0.9444`，但
`system_scaffolding` F1 为 `0.6667`，其余 required slices 为 `1.0`，因此
`gates.taskGrouping=false`。该反例证明整体超过 80% 时，任一关键 slice 低于 70%
仍会阻断。

本报告只证明 synthetic contract 与 runner 自洽，不代表当前产品在真实会话上的准确率。
真实发布结论必须另行运行 private dataset，并且只能公开 share-safe 聚合。
