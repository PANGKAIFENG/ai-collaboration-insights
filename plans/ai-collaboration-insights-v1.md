# Plan: AI Collaboration Insights V1

> 来源 PRD：[AI 协作复盘台 PRD v0.2](../docs/PRD/ai-collaboration-review-prd-v0.2.md)
>
> 父级跟踪 Issue：[#1 AI 协作复盘台 V1](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/1)
>
> 批准日期：2026-07-14

## 目的与状态

本路线图固定 V1 的交付顺序，但不充当第二套 backlog。GitHub Issues 负责实时状态；每个 implementation Issue 只有在解除阻塞后，才单独编写代码级、测试驱动的实施计划。

Phase 1 是技术证据门禁。Phase 2-8 是可独立演示的纵向切片；首条完整产品链路明确从 Codex 开始，再扩展其余适配器。

## 架构决策

以下稳定决策适用于所有阶段：

- **产品边界**：macOS 优先、单用户、本地 Web 应用；服务仅绑定 `127.0.0.1`，V1 不提供云端账号和遥测。
- **数据源与存储边界**：源工具日志始终只读。SQLite 是结构化事件、证据引用、推断、纠错、报告版本和派生分析的本地事实源；产品不复制完整原始会话。
- **数据源边界**：Codex、Claude Code、OpenCode、WorkBuddy 和 Qoder 通过可识别版本的 adapter contract 接入。缺失字段保持“不可用”，不得转成 0。
- **AI 边界**：语义分析使用用户提供的 OpenAI-compatible 或 Anthropic API，凭据保存在 macOS Keychain。标准分析首次使用前明确授权；深度分析每次请求都要确认。
- **报告边界**：所有窗口按报告记录的本地时区使用左闭右开区间。日报为 19:00-19:00，周报为周日 19:00-周日 19:00，月报为每月 1 日 19:00-次月 1 日 19:00；错过触发要补生成，迟到事件产生同窗口的新报告版本。
- **体验边界**：概览顺序固定为使用数据与协作层级、工作成果、教练建议。评分、任务推断和风险信号必须有证据、置信度，并允许用户纠错。
- **隐私与质量边界**：Git 只允许合成或不可逆脱敏 fixture。#24 负责必需检查、隐私规则和 secret scanning，发布前必须全部通过。
- **延后决策**：framework、route path、具体 schema 字段、process topology、app/package ownership、签名、公证和打包方式由 ADR #6 决定。任何阶段都不得在 ADR 接受前私自锁定这些选择。

## 交付规则

- 所有工作从对应 GitHub Issue 开始，并遵守仓库分支命名规范。
- HITL 决策未完成前，不得把受其影响的 Issue 当成可自主执行任务。
- 每个阶段都要贯通持久化、行为、界面、隐私处理和测试，形成用户可验证的路径。
- #24 贯穿所有实施阶段；必需检查失败或被跳过时，该阶段不能完成。
- 其余数据源只有在 spike 给出支持或明确 fallback 契约后才开始实现。
- Claude Code #9 不阻塞 Codex tracer bullet：#13 只依赖 #8，#9-#12 后续扩展 adapter contract。

---

## Phase 1：技术证据与架构门禁

**Issues**：[#2](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/2)、[#3](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/3)、[#4](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/4)、[#5](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/5)、[#6](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/6)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：为场景 A 的可信多源指标和场景 B 的可解释评分建立前置证据，先确认系统能观察、存储、测试和解释什么，再进入产品实现。

### 建设内容

为 OpenCode、WorkBuddy、Qoder 形成有边界的可行性证据；建立任务识别与评分 eval 基线；批准本地 runtime、安全、数据与打包 ADR；定义后续每个切片都必须遵守的质量与隐私门禁。

### 验收标准

- [ ] 每个不确定数据源均有版本字段矩阵、只读发现证据、许可边界、合成 fixture 契约，以及支持、部分支持或不支持结论。
- [ ] 任务推断、五维评分、L1-L4 阈值和效率风险信号具有可重复的 eval 基线，并满足 PRD 的整体与单工具门槛。
- [ ] ADR #6 明确 framework、进程生命周期、本地访问控制、SQLite 与 adapter ownership、Keychain、调度和打包方向，且不削弱 PRD 隐私边界。
- [ ] #24 定义必需检查、fixture 政策、失败行为和隐私/secret scan 预期；ADR #6 后补齐技术栈相关命令。
- [ ] 相关门禁未通过前，不合并生产 adapter 或 dashboard 代码。

---

## Phase 2：本地应用基础

**Issues**：[#7](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/7)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：用户启动本地产品，并看到五种工具分别处于未发现、无权限、版本不支持、部分可用或可导入状态。

### 建设内容

按 ADR #6 交付最小后台服务和本地 dashboard 路径，包括五类独立数据源状态、扫描生命周期反馈、仅 localhost 访问，以及首批可执行质量门禁。

### 验收标准

- [ ] 干净 macOS 账户可以启动服务并在本机打开 dashboard。
- [ ] 五类数据源状态都展示原因、路径来源、版本/支持状态和最近检查时间，缺失数据不得显示为 0。
- [ ] 关闭浏览器不停止服务；数据源扫描中拒绝重复启动。
- [ ] 非本机请求无法读取应用数据。
- [ ] foundation 的 build、type、lint、test、privacy 和 secret checks 按 #24 在本地与 CI 中运行。

---

## Phase 3：Codex 到指标日报的 Tracer Bullet

**Issues**：[#8](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/8)、[#13](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/13)、[#14](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/14)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：用户导入 Codex 历史，查看可信使用指标、推断的工作区间/项目/任务，并在未配置 AI API 时获得正确 19:00 窗口的指标日报。

### 建设内容

建立第一条完整路径：从一个只读 Codex 数据源，经过幂等统一事件、区间与任务还原、指标计算和报告版本，最终生成用户可见的日报。在复制 adapter 之前先证明整体架构。

### 验收标准

- [ ] Codex 重复扫描幂等、支持增量，大历史扫描可观察，且始终不修改源日志。
- [ ] 可用 Token 字段和完整度准确展示，缺失字段保持不可用。
- [ ] 5 分钟活跃段、20 分钟同任务合并、跨项目隔离和并行 Agent 规则通过边界测试。
- [ ] 自动、手动、补偿、迟到事件与重复生成均遵守 19:00 窗口和报告版本规则。
- [ ] 用户能查看区间、项目和任务候选的证据与置信度。
- [ ] 未配置模型凭据时完整链路仍可运行，并通过 #24。

---

## Phase 4：经验证的多数据源覆盖

**Issues**：[#9](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/9)、[#10](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/10)、[#11](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/11)、[#12](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/12)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：用户查看 Codex、Claude Code、OpenCode、WorkBuddy、Qoder 的跨源指标，同时理解各源的完整度和限制。

### 建设内容

把已经证明的 adapter 与报告路径扩展到 Claude Code，以及 Phase 1 spike 已批准契约的数据源。不支持版本或不可用字段必须成为明确产品状态，不能隐藏为局部失败。

### 验收标准

- [ ] Claude Code 通过统一契约完成只读、幂等、增量且故障隔离的导入。
- [ ] OpenCode、WorkBuddy、Qoder 严格按 spike 批准的能力级别实现；证据不足时提供明确不支持 fallback。
- [ ] 单个数据源的失败或权限问题不阻塞其他数据源扫描与报告。
- [ ] 跨源汇总保留各来源 Token 定义与完整度，不伪造可比性。
- [ ] 所有支持版本的合成 fixture、兼容性测试和 #24 门禁通过。

---

## Phase 5：授权复盘、评分与概览

**Issues**：[#15](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/15)、[#16](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/16)、[#17](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/17)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：在场景 A 中，用户先看当前使用数据和 L1-L4，再看任务与产出，最后获得少量有证据的教练行动建议。

### 建设内容

对最小分析包增加经授权的标准语义分析，将确定性信号与语义证据合并为当日、五维和 28 天评分，并按已经确认的信息顺序交付日/周/月概览结构。

### 验收标准

- [ ] 标准分析首次明确授权前不发送任何内容，撤回授权后停止发送。
- [ ] 模型凭据保留在 Keychain；payload 排除明显 secret 和超大原始输出；模型失败时保留指标报告。
- [ ] 任务名、产出、验证状态、教练建议、评分与成熟度均带证据、来源引用、置信度和分析版本。
- [ ] 使用强度本身不能提高分数；L3/L4 必须满足 PRD 的验证、迭代或资产化证据要求。
- [ ] 所有周期与状态下，概览均按数据与成熟度、成果、教练的顺序呈现。
- [ ] #5 的 eval 门槛和 #24 的必需检查通过。

---

## Phase 6：深度分析与可纠正推断

**Issues**：[#18](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/18)、[#19](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/19)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：场景 B 中，用户纠正错误任务、项目或区间并一致重算；场景 C 中，用户对指定日期、任务或会话逐次批准深度分析。

### 建设内容

交付逐次深度分析预览与授权、本地版本化结果，以及重命名、改项目、合并/拆分、排除/恢复、产出和验证状态的完整纠错路径；人工修正优先于后续 AI 输出。

### 验收标准

- [ ] 每次深度分析前展示内容类型、范围、预计 Token、provider 和 model；取消、超时或未确认时不发送。
- [ ] 实际 payload 不得超出确认预览，深度分析失败不删除标准结果。
- [ ] 每次纠错记录来源、时间和版本，并能追踪其对指标、任务、评分和报告的影响。
- [ ] 重新分析不得覆盖人工修正。
- [ ] 多记录修改需要确认并具备事务性；故障注入后不留下部分应用状态。
- [ ] 授权、payload snapshot、纠错优先级、重算和回滚检查通过 #24。

---

## Phase 7：周期复盘、导出与本地清除

**Issues**：[#20](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/20)、[#21](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/21)、[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)

**覆盖用户故事**：用户查看周/月趋势，导出可移植报告，并在不触碰源工具日志的前提下删除派生数据或模型凭据。

### 建设内容

把已经验证的报告引擎扩展到周/月窗口，将日/周/月报告投影为 Markdown 和 JSON，并交付派生数据范围删除与 Keychain 凭据独立删除。

### 验收标准

- [ ] 周日 19:00 周报和每月 1 日 19:00 月报支持自动、手动、补偿、迟到事件与重复生成。
- [ ] Markdown 和 JSON 导出包含周期、时区、生成时间、版本和完整度，默认排除完整会话与原始证据。
- [ ] 导出原始证据前需要单独确认，并经过 secret 与敏感内容过滤。
- [ ] 按时间、数据源和全部清除派生数据后汇总一致，并允许后续重新扫描。
- [ ] 删除模型凭据时清除 Keychain item，不把值写入配置、日志、测试或导出。
- [ ] 导出与删除验证过程中，源日志内容、时间戳和权限保持不变。

---

## Phase 8：可安装的 macOS V1 发布

**Issues**：[#24](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/24)、[#25](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/25)

**前置阶段**：Phase 1-7 全部完成；#24 的发布门禁通过。

**覆盖用户故事**：macOS 用户无需开发环境即可安装产品，登录与重启后继续生成报告，升级不丢失本地数据，卸载时可以明确选择数据保留范围。

### 建设内容

打包已批准的本地服务与 Web 体验，实现登录启动、升级/卸载，并发布包含兼容性、完整性和干净环境验证证据的 `v0.1.0`。

### 验收标准

- [ ] 干净且受支持的 macOS 账户无需开发工具链即可安装、启动、重启并生成首份指标报告。
- [ ] 登录启动只恢复一个后台服务，补偿错过的报告窗口，且不产生重复扫描或调度。
- [ ] 升级保留 SQLite 数据和设置或提供已验证恢复路径；卸载区分应用文件、派生数据、Keychain 凭据和不受影响的源日志。
- [ ] 安装与运行始终仅限 localhost，并通过隐私、secret、兼容性和完整性检查。
- [ ] `v0.1.0` GitHub Release 包含批准的分发产物或方式、SHA-256、支持的数据源版本、已知限制、安装、升级和卸载说明。
- [ ] 发布前 #24 全部通过，并完成干净环境端到端 smoke test。

## 执行入口

从 Phase 1 的 #2-#6 和 #24 中与技术栈无关的部分开始。ADR #6 以及目标 implementation Issue 所需的 spike/eval 契约未通过前，不开始生产代码。
