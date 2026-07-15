# PRD v0.3 Issue Breakdown

- Product baseline: [AI 协作复盘台 PRD v0.3](../PRD/ai-collaboration-review-prd-v0.3.md)
- Scope: Codex-only daily report, one-shot CLI, static HTML
- Published: 2026-07-15

## Delivery Chain

| Order | Issue | User-visible result | Depends on | Execution |
| ---: | --- | --- | --- | --- |
| 1 | [#52 会话事实画像与可信指标](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/52) | Token、活跃时间、Subagent 和均值口径可信 | #46, #47, #49 | AFK |
| 2 | [#53 跨会话任务边界与关系图](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/53) | Session 与 Task 分离，任务可拆分、跨会话关联 | #52, #48 | AFK |
| 3 | [#54 语义轮次与逐任务证据包](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/54) | 展示真实迭代轮次，机械重试不抬分 | #53 | AFK |
| 4 | [#55 渐进式 AI 分析与会话洞察](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/55) | 每个任务先覆盖主干，按需回读，洞察可追溯 | #54 | AFK |
| 5 | [#56 置信度评分门禁与静态日报](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/56) | 数据、成果、建议三段报告与可信 L1-L4 | #54, #55 | AFK |
| 6 | [#57 本地发布评估门禁](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/57) | 公共合成回归 + 私有真实样本发布结论 | #52-#56 | HITL |

## Existing Issues Reused

- #46 is the Token cumulative-snapshot regression owned by #52.
- #47 is the overlapping active-time regression owned by #52.
- #48 is the system-scaffolding task-title regression owned by #53.
- #49 is the Codex 0.131 multi-agent normalization regression owned by #52.
- #34-#36 remain post-MVP evaluation hardening and are not prerequisites for this release.
- #50 remains a scheduler environment bug and is not part of analysis reconstruction.

## PRD Coverage

| PRD capability | Issue |
| --- | --- |
| Session fact profile, trustworthy usage and distributions | #52 |
| Source classification, task graph and cross-session grouping | #53 |
| Semantic rounds, loop detection and task evidence packets | #54 |
| Progressive analysis, selective reread and subjective insights | #55 |
| Confidence gates, L1-L4 and fact-first static HTML | #56 |
| Synthetic evaluation, private local labels and release thresholds | #57 |

## Explicitly Deferred

Claude Code and other adapters, weekly/monthly reports, daemon, localhost API,
dynamic Dashboard, SQLite, calendar integration, correction UI and cloud/team
analytics remain outside the current MVP. Non-blocking defects discovered during
implementation are recorded as Issues instead of expanding a delivery PR.
