# Issue Publish Result v0.1

- Parent PRD: [#1 AI 协作复盘台 V1](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/1)
- Source draft: [issue-breakdown-v0.1.md](issue-breakdown-v0.1.md)
- Published: 2026-07-14
- Result: all 22 approved product and engineering backlog Issues were created; one separate repository-governance Issue was also completed.

## Published Backlog

| Draft | GitHub Issue | Execution | Area |
| ---: | --- | --- | --- |
| 1 | [#2 OpenCode log feasibility](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/2) | AFK | Spike |
| 2 | [#3 WorkBuddy log feasibility](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/3) | HITL | Spike |
| 3 | [#4 Qoder log feasibility](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/4) | HITL | Spike |
| 4 | [#5 Scoring and task-inference eval](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/5) | HITL | Evaluation |
| 5 | [#6 Local runtime, security, and data ADR](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/6) | HITL | Architecture |
| 6 | [#7 Local dashboard and source states](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/7) | AFK | Foundation |
| 7 | [#8 Codex import and metrics](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/8) | AFK | Data source |
| 8 | [#9 Claude Code import and metrics](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/9) | AFK | Data source |
| 9 | [#10 OpenCode import and metrics](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/10) | AFK | Data source |
| 10 | [#11 WorkBuddy import and metrics](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/11) | AFK | Data source |
| 11 | [#12 Qoder import and metrics](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/12) | AFK | Data source |
| 12 | [#13 Work intervals, projects, and tasks](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/13) | AFK | Task inference |
| 13 | [#14 Metric daily report](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/14) | AFK | Report |
| 14 | [#15 Authorized standard AI review](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/15) | AFK | AI analysis |
| 15 | [#16 Score and 28-day maturity](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/16) | AFK | Scoring |
| 16 | [#17 Daily, weekly, and monthly overview](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/17) | HITL | Dashboard |
| 17 | [#18 Confirmed deep analysis](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/18) | AFK | Deep analysis |
| 18 | [#19 Correction and recomputation](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/19) | AFK | Correction |
| 19 | [#20 Weekly/monthly report and export](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/20) | AFK | Report/export |
| 20 | [#21 Local data and credential deletion](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/21) | AFK | Privacy |
| 21 | [#24 CI, test, privacy, and secret gates](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24) | AFK | Quality/security |
| 22 | [#25 macOS install and v0.1.0 release](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/25) | HITL | Release |

## Additional Governance Issue

- [#22 Establish governed project documentation structure](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/22), completed by merged PR [#23](https://github.com/PANGKAIFENG/ai-collaboration-insights/pull/23).

## Coverage And Gaps

- Coverage: all V1 PRD sections, engineering quality gates, and installable macOS release verification map to at least one published Issue.
- Excluded by PRD: Windows/Linux support, DingTalk integration, cloud accounts, team analytics, public ranking, and telemetry.
- Remaining assumptions: OpenCode/WorkBuddy/Qoder feasibility, scoring calibration, the local runtime/security ADR, and the ADR decision on signing/notarization.
- Corrected dependency: #13 is blocked by Codex #8 only; #9-#12 extend the adapter contract later and do not block the first tracer bullet.
