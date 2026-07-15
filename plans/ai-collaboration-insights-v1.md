# Plan: Codex 日报 MVP v0.1.0

> 产品基线：[Codex 日报 MVP 范围压缩决策 v0.1](../docs/PRD/codex-daily-report-mvp-scope-v0.1.md)
>
> 架构基线：[ADR-0001](../docs/DECISIONS/ADR-0001-codex-daily-report-runtime.md)
>
> GitHub Milestone：[v0.1.0 MVP](https://github.com/PANGKAIFENG/ai-collaboration-insights/milestone/1)
>
> 校准日期：2026-07-15

## 目的与优先级

本路线图取代 2026-07-14 的完整 V1 路线图，作为 `v0.1.0` 的稳定交付顺序。范围冲突时，Codex 日报 MVP 范围决策优先于完整 PRD v0.2；GitHub Issues 继续负责实时状态，本文件不复制 Issue 勾选状态。

MVP 只验证一个产品假设：本地 Codex 会话能否稳定生成有价值的“数据与层级、工作成果、教练建议”日报。多工具、周/月报、daemon、动态 Dashboard、SQLite、交互纠错和 `.app` 均不进入本路线图。

## 稳定技术边界

- Deno 2 + TypeScript 的 `aci` one-shot CLI，使用 `deno compile` 发布 macOS arm64/x64 单二进制。
- 源日志只读；只扫描目标 19:00-19:00 左闭右开窗口，不默认回溯全部历史。
- JSON/JSONL、manifest 和静态 HTML 均带版本或 provenance；不运行 localhost 服务。
- 可选语义分析复用 `codex exec --ephemeral` 登录态；未经授权或分析失败时生成确定性日报。
- HTML 无 JavaScript、远程资源、表单或 telemetry；所有动态内容作为纯文本转义。
- `launchd` 每日 19:00 调用固定二进制；登录时最多补偿最近 7 个缺失窗口。
- 用户域安装，不使用 `sudo`；卸载和数据清除不触碰 `~/.codex` 或 Codex 登录态。

## Phase 1：可运行的确定性日报链路

**Issues**：[#7](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/7)、[#8](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/8)、[#13](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/13)、[#14](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/14)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

交付一条可手动执行的真实链路：CLI 发现并只读扫描 Codex JSONL，归一化事件，计算可信使用指标，识别活跃区间和任务候选，生成 schema-valid JSON、静态 HTML 与历史索引。

阶段出口：

- `aci doctor` 可以解释 Codex 和输出目录状态。
- `aci report --no-ai` 对有数据、无数据、部分解析三种状态均生成可读报告。
- 窗口边界、去重、源文件不变、并发锁、原子写入与幂等 revision 通过自动测试。
- Deno fmt、lint、check、test 与现有 eval 在 CI 中运行。

## Phase 2：证据评分与授权分析

**Issues**：[#15](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/15)、[#16](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/16)、[#17](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/17)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

在确定性链路上增加五维证据、当日得分和 L1-L4，并在明确授权后调用隔离的 Codex ephemeral 子进程，为任务补充成果与最多 3 条教练建议。

阶段出口：

- 使用强度本身不加分，不可用证据不按 0 处理。
- L3/L4 严格执行已批准任务数、迭代、验证和资产证据门槛。
- 模型输入经过最小化、大小限制和 secret redaction；模型输出通过 schema 与业务规则校验。
- 未授权、Codex 缺失、超时或非法输出均降级，不阻塞报告。
- 报告固定按“数据与层级、工作成果、教练建议”显示，桌面和窄屏可读。

## Phase 3：自动运行与可安装发布

**Issues**：[#14](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/14)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)、[#25](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/25)

完成用户域安装器、LaunchAgent、补偿、卸载、派生数据清除、双架构构建、校验和与 Release 工作流。

阶段出口：

- 临时 HOME smoke test 覆盖安装、doctor、手动日报、调度状态、卸载、保留数据和显式 purge。
- LaunchAgent 固定每天本地时间 19:00，`RunAtLoad` 负责缺失窗口补偿，重复加载不创建重复任务。
- Release 构建 arm64/x64 二进制与 SHA-256，安装器先校验再原子替换。
- README、release notes、已知限制和支持边界与实际命令一致。

## Phase 4：公开 Alpha 验证

**Issue**：[#25](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/25)

发布 GitHub `v0.1.0`，安装 release asset 后验证首份指标日报。连续积累 7 个有效日报，再按范围决策中的继续投资信号判断是否扩展产品。

发布出口：

- 所有 required checks 通过；Release assets、checksums 和安装脚本可公开下载。
- 本机安装的版本与 tag 一致，`aci doctor` 和 `aci report --no-ai` 通过。
- Release 明示未签名/未公证、多工具和周/月报未包含等限制。
- 关键 Issues 关闭，非阻断缺陷进入独立 follow-up Issue，不阻塞首版。

## 延期恢复规则

延期能力不自动进入下一个版本。Claude Code 等新 adapter 必须等待 Codex `UnifiedEvent` 契约稳定；周/月报必须等待至少 14 个有效日报；动态应用和 SQLite 必须等待真实交互、查询或纠错需求；`.app`、签名、公证和自动升级必须等待公开 alpha 被证明值得面向非开发者分发。

## 执行入口

代码级步骤见 [Codex 日报 MVP v0.1 实施计划](codex-daily-report-mvp-v0.1.md)。实施必须在 Issue 分支上按 TDD 执行，每个 PR 提供验证证据，并在 #24 门禁失败时停止发布。
