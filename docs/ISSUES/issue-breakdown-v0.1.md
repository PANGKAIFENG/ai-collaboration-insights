# Issue Breakdown Draft v0.1

- Source PRD：`docs/PRD/ai-collaboration-review-prd-v0.2.md`
- Mode：`publish-after-approval`，当前仅为草案。
- Readiness：`pass with assumptions`；OpenCode、WorkBuddy、Qoder 日志可行性和评分校准必须先完成。
- Coverage summary：V1 产品范围全部覆盖；钉钉、Windows/Linux、团队与云端能力按非目标排除。

## Issue Plan

### 1. [Spike] 验证 OpenCode 本地日志的适配可行性

- Type：AFK
- Priority / labels：P0 / `spike`, `data-source`, `opencode`
- Source：第 3.3、12、17、18 节。
- What to build：形成 OpenCode 当前目标版本的日志发现、字段、增量读取、去重、Token 口径和许可边界证据包，并提供脱敏合成 fixture 设计。
- Acceptance criteria：
  - [ ] 记录 macOS 默认/可配置路径、权限状态、版本识别和格式变化风险。
  - [ ] 映射会话、时间戳、项目、消息、工具、Token、Skill/Subagent 的可用性。
  - [ ] 给出支持、部分支持或暂不支持的结论及 fallback。
- Verification：使用不含真实内容的字段清单、样例 schema、读取命令和版本矩阵复核。
- Blocked by：None。
- Open questions：目标支持版本范围由 spike 给出建议。

### 2. [Spike] 验证 WorkBuddy 本地日志的适配可行性

- Type：HITL
- Priority / labels：P0 / `spike`, `data-source`, `workbuddy`, `hitl`
- Source：第 3.3、12、17、18 节。
- What to build：在用户授权访问本机安装和日志目录后，形成 WorkBuddy 数据发现、字段、去重、Token 口径和许可边界证据包。
- Acceptance criteria：
  - [ ] 明确默认/可配置路径、权限和版本识别方式。
  - [ ] 完成核心字段可用性矩阵和只读访问验证。
  - [ ] 给出支持级别、限制与 fallback，不提交真实日志。
- Verification：人工确认访问边界；用脱敏字段清单、合成 fixture 和版本矩阵复核。
- Blocked by：用户提供已安装版本或合法样本访问权限。
- Open questions：公开文档与本地格式冲突时以何者作为 V1 支持契约。

### 3. [Spike] 验证 Qoder 本地日志的适配可行性

- Type：HITL
- Priority / labels：P0 / `spike`, `data-source`, `qoder`, `hitl`
- Source：第 3.3、12、17、18 节。
- What to build：在用户授权访问本机安装和日志目录后，形成 Qoder 数据发现、字段、去重、Token 口径和许可边界证据包。
- Acceptance criteria：
  - [ ] 明确默认/可配置路径、权限和版本识别方式。
  - [ ] 完成核心字段可用性矩阵和只读访问验证。
  - [ ] 给出支持级别、限制与 fallback，不提交真实日志。
- Verification：人工确认访问边界；用脱敏字段清单、合成 fixture 和版本矩阵复核。
- Blocked by：用户提供已安装版本或合法样本访问权限。
- Open questions：目标支持版本范围由 spike 给出建议。

### 4. 建立评分与任务识别 eval 基线并确认门槛

- Type：HITL
- Priority / labels：P0 / `evaluation`, `scoring`, `hitl`
- Source：第 3.3、9、15.3、17、18 节。
- What to build：建立每工具至少 20 个、总计至少 100 个合成或本地私有标注任务组的标注规范、评分样例、risk signal 反例和可重复评估流程。
- Acceptance criteria：
  - [ ] 标注规范覆盖任务边界、项目、复杂度、五维证据、产出和验证状态。
  - [ ] 评估输出整体与单工具一致率，并验证 1/2/3、日分、28 天和 L3/L4 门槛。
  - [ ] 人工评审确认阈值可解释且不会奖励单纯使用量。
- Verification：运行 eval 并提交仅含合成数据的报告；真实本地样本只记录汇总结果。
- Blocked by：Issues 1-3 的字段可用性结论可并行补充。
- Open questions：首轮校准是否需要调整 PRD 中的等级证据数量门槛。

### 5. 确认本地应用进程、安全与数据契约 ADR

- Type：HITL
- Priority / labels：P0 / `architecture`, `security`, `hitl`
- Source：第 6、10、11.4、12、14 节。
- What to build：对本地 Web 技术栈、后台进程、`127.0.0.1` 绑定、登录启动、SQLite 事实模型、adapter contract、钥匙串和删除边界形成可执行 ADR。
- Acceptance criteria：
  - [ ] ADR 明确进程生命周期、端口/访问控制、调度补偿和安装边界。
  - [ ] ADR 明确统一事件、稳定去重标识、报告版本和用户修正的所有权。
  - [ ] 威胁模型覆盖非本机访问、密钥泄露、恶意日志内容和路径穿越。
- Verification：架构、隐私和测试视角联合 review ADR，并记录接受/拒绝方案。
- Blocked by：None。
- Open questions：具体技术栈和打包方式由 ADR 决定。

### 6. 首次启动本地看板并查看五类数据源状态

- Type：AFK
- Priority / labels：P0 / `implementation`, `foundation`, `dashboard`
- Source：第 1、3.3、8.1、11.4、13、15.1 节。
- What to build：用户启动后台服务并打开只监听 localhost 的 Web 应用，在数据源页看到五类工具的未发现、无权限、版本不支持、部分数据或可导入状态。
- Acceptance criteria：
  - [ ] 非本机地址无法读取应用数据，浏览器关闭不终止后台服务。
  - [ ] 五类数据源独立显示状态、原因、路径来源和最近检查时间。
  - [ ] 扫描中禁止重复启动同一数据源扫描，并可离开页面。
- Verification：自动测试监听边界与状态机；在干净 macOS 账户执行启动和空状态演示。
- Blocked by：Issue 5。
- Open questions：None。

### 7. 导入 Codex 历史并显示可信使用指标

- Type：AFK
- Priority / labels：P0 / `implementation`, `data-source`, `codex`
- Source：第 3、7、8.3、8.4、11.1、14、15.1 节。
- What to build：用户启用 Codex 数据源后，本地只读索引可解析历史，增量导入统一事件，并在数据源页和指标视图看到完整度与 Token 口径。
- Acceptance criteria：
  - [ ] 重复扫描 fixture 两次不重复计数，源日志不被修改。
  - [ ] 缺失字段显示不可用，不按 0 或伪造分项。
  - [ ] 大历史扫描展示进度，默认不触发全部历史 AI 分析。
- Verification：使用多版本合成 fixture 运行解析、去重、只读和增量测试。
- Blocked by：Issues 5、6。
- Open questions：None。

### 8. 导入 Claude Code 历史并显示可信使用指标

- Type：AFK
- Priority / labels：P0 / `implementation`, `data-source`, `claude-code`
- Source：第 3、7、8.3、8.4、11.1、14、15.1 节。
- What to build：用户启用 Claude Code 数据源后，本地只读索引可解析历史，增量导入统一事件，并在指标视图查看完整度和可用 Token 分项。
- Acceptance criteria：
  - [ ] 重复扫描 fixture 两次不重复计数，源日志不被修改。
  - [ ] 会话、项目、时间、工具和 Token 字段按来源能力标注完整度。
  - [ ] 格式不支持或无权限时给出可执行原因，不影响其他数据源。
- Verification：使用多版本合成 fixture 运行解析、去重、只读和失败隔离测试。
- Blocked by：Issues 5、6。
- Open questions：None。

### 9. 按已验证契约接入 OpenCode 并显示指标

- Type：AFK
- Priority / labels：P1 / `implementation`, `data-source`, `opencode`
- Source：第 3、8、12、14、15.1 节。
- What to build：按 spike 结论实现 OpenCode 端到端导入、状态、完整度、去重和指标展示；不可用字段明确降级。
- Acceptance criteria：
  - [ ] 已验证版本可完成只读发现、增量导入和重复扫描去重。
  - [ ] 部分支持版本显示明确限制，不阻断其他数据源。
  - [ ] 指标口径与源能力一致。
- Verification：运行 spike 产出的合成 fixtures 和版本兼容测试。
- Blocked by：Issues 1、5、6。
- Open questions：None，未通过 spike 时改为“不支持”状态而不是伪实现。

### 10. 按已验证契约接入 WorkBuddy 并显示指标

- Type：AFK
- Priority / labels：P1 / `implementation`, `data-source`, `workbuddy`
- Source：第 3、8、12、14、15.1 节。
- What to build：按获批 spike 契约实现 WorkBuddy 端到端导入、状态、完整度、去重和指标展示。
- Acceptance criteria：
  - [ ] 已验证版本可完成只读发现、增量导入和去重。
  - [ ] 权限、格式和部分数据状态可观察并可恢复。
  - [ ] 未提供的 Token、Skill 或 Subagent 字段显示不可用。
- Verification：运行获批的合成 fixtures 和版本兼容测试。
- Blocked by：Issues 2、5、6。
- Open questions：None，未通过 spike 时改为明确 fallback。

### 11. 按已验证契约接入 Qoder 并显示指标

- Type：AFK
- Priority / labels：P1 / `implementation`, `data-source`, `qoder`
- Source：第 3、8、12、14、15.1 节。
- What to build：按获批 spike 契约实现 Qoder 端到端导入、状态、完整度、去重和指标展示。
- Acceptance criteria：
  - [ ] 已验证版本可完成只读发现、增量导入和去重。
  - [ ] 权限、格式和部分数据状态可观察并可恢复。
  - [ ] 未提供的指标字段显示不可用。
- Verification：运行获批的合成 fixtures 和版本兼容测试。
- Blocked by：Issues 3、5、6。
- Open questions：None，未通过 spike 时改为明确 fallback。

### 12. 从统一事件还原工作区间、项目和任务候选

- Type：AFK
- Priority / labels：P0 / `implementation`, `task-inference`, `timeline`
- Source：第 3.2、4、8.3、8.4、12、14、15.2 节。
- What to build：用户查看某个报告窗口时，系统按 5/20 分钟、项目隔离和并行 Agent 规则生成可下钻的工作区间、项目和任务候选。
- Acceptance criteria：
  - [ ] 5 分钟活跃段、20 分钟同任务合并、跨项目不合并规则可重复验证。
  - [ ] 并行 Agent 区间单独显示且不与人工活跃时间相加。
  - [ ] 低置信度项目或任务保留候选状态和证据引用。
- Verification：表驱动边界测试覆盖 4:59/5:00/5:01 与 19:59/20:00/20:01、跨项目和时间重叠。
- Blocked by：Issues 7、8；Issues 9-11 可后续扩展同一契约。
- Open questions：None。

### 13. 自动生成可补偿、可重算的指标日报

- Type：AFK
- Priority / labels：P0 / `implementation`, `report`, `scheduler`
- Source：第 4A、7、10.1、13、14、15.1 节。
- What to build：后台服务每天 19:00 为左闭右开窗口生成指标日报；休眠后补生成，手动重算和迟到事件创建同窗口新版本且不重复计数。
- Acceptance criteria：
  - [ ] 日报窗口严格为昨日 19:00 至今日 19:00，并固化时区。
  - [ ] 错过触发后补生成并标记延迟；重算不创建冲突周期。
  - [ ] 迟到事件标记数据更新并生成新版本，旧版本可追溯。
- Verification：使用可控时钟测试日边界、DST/时区记录、休眠补偿、迟到日志和幂等性。
- Blocked by：Issues 5、12。
- Open questions：None。

### 14. 经明确授权后生成标准 AI 成果复盘

- Type：AFK
- Priority / labels：P0 / `implementation`, `ai-analysis`, `privacy`
- Source：第 4A、5、10.1、10.2、13、14、15.4 节。
- What to build：用户配置 OpenAI-compatible 或 Anthropic API 后先审阅内容与服务提示并明确授权，系统才发送最小分析包，生成任务名、项目、产出和最多三条建议；未授权或失败时保留指标报告。
- Acceptance criteria：
  - [ ] API Key 只保存在钥匙串，日志、导出和错误信息不含 Key。
  - [ ] 首次授权和实质配置变化会展示并记录本地同意，撤回后停止外发。
  - [ ] 最小分析包过滤完整代码、超长输出、重复历史和明显密钥。
  - [ ] 超时、限流、欠费或不完整结果不会破坏指标报告。
- Verification：模型 adapter contract tests、外发 payload snapshot、密钥扫描、撤回授权和失败注入测试。
- Blocked by：Issues 5、12、13。
- Open questions：None。

### 15. 展示今日得分、五维证据和近 28 天 L1-L4

- Type：AFK
- Priority / labels：P1 / `implementation`, `scoring`, `growth`
- Source：第 3、4B、9、15.3 节。
- What to build：用户从当日报告查看 0-100 得分、五维证据和置信度，并查看按活跃日滚动的近 28 天等级、趋势和缺失证据。
- Acceptance criteria：
  - [ ] 任务复杂度按 1/2/3 聚合，日分和 28 天分严格按 PRD 规则计算。
  - [ ] 证据不足的维度不按 0；活跃不足 3 天不输出等级。
  - [ ] L3/L4 同时满足总分和验证、迭代、资产门槛，使用量本身不加分。
  - [ ] 风险信号可下钻到证据和置信度。
- Verification：通过 Issue 4 获批 eval、边界样例和反例回归测试。
- Blocked by：Issues 4、12、14。
- Open questions：None。

### 16. 按数据、成果、教练顺序交付日/周/月概览

- Type：HITL
- Priority / labels：P1 / `implementation`, `dashboard`, `design`, `hitl`
- Source：第 1、4A、8、13、15.2 节。
- What to build：交付概览页的日/周/月切换、完整度、数据总览、协作水平、成果时间轴和最多三条教练建议，并通过真实浏览器视觉验收。
- Acceptance criteria：
  - [ ] 信息顺序固定为数据与等级、工作成果、AI 教练。
  - [ ] 用户可查看精确窗口、完整度、最后生成时间、版本和重算入口。
  - [ ] 任务卡包含名称、项目、区间、产出、验证状态和证据入口。
  - [ ] 桌面与窄屏无文本溢出、遮挡或不可操作控件。
- Verification：组件/集成测试 + desktop/mobile 浏览器截图；用户确认首版视觉与信息密度。
- Blocked by：Issues 13、14、15。
- Open questions：视觉方向和组件库在实施计划前确认。

### 17. 对指定范围执行逐次确认的深度分析

- Type：AFK
- Priority / labels：P1 / `implementation`, `deep-analysis`, `privacy`
- Source：第 4C、5、6.2、10.3、13、15.4 节。
- What to build：用户选择日期、任务或会话后，先看到内容类型、范围、预计 Token、服务和模型；仅本次确认后发送，取消、超时或失败均保留标准结果并可缩小范围重试。
- Acceptance criteria：
  - [ ] 未确认、取消或超时不产生模型请求。
  - [ ] 发送 payload 不超过预览确认范围，结果保存为本地独立分析版本。
  - [ ] 失败或不完整结果可重试且不删除标准报告。
- Verification：按深度分析流程图运行状态机、payload snapshot、取消和故障注入测试。
- Blocked by：Issue 14。
- Open questions：None。

### 18. 纠正任务与区间并一致重算报告

- Type：AFK
- Priority / labels：P1 / `implementation`, `correction`, `recompute`
- Source：第 2.2、4B、5、11.2、13、15.2 节。
- What to build：用户可重命名任务、修改项目、合并/拆分区间、排除/恢复会话、补充产出和验证状态，重算后修正优先于 AI 推断且所有汇总一致更新。
- Acceptance criteria：
  - [ ] 每种修正保留来源、时间和报告版本，并可核对重算影响。
  - [ ] AI 重新分析不会覆盖人工修正。
  - [ ] 大范围操作要求确认，失败时不留下部分应用状态。
- Verification：端到端测试每种修正对指标、任务、得分和报告版本的影响及事务回滚。
- Blocked by：Issues 12、15、16。
- Open questions：None。

### 19. 生成周报、月报并导出 Markdown 和 JSON

- Type：AFK
- Priority / labels：P1 / `implementation`, `report`, `export`
- Source：第 3.3、7、11.1、15.5 节。
- What to build：系统在周日和每月 1 日 19:00 自动生成周/月报告，并允许日/周/月报告导出带窗口、时区、生成时间、版本和完整度的 Markdown/JSON。
- Acceptance criteria：
  - [ ] 周/月窗口严格遵循 PRD 左闭右开规则并支持补生成与重算。
  - [ ] 导出默认不含完整会话或原始证据片段。
  - [ ] 导出证据片段前单独确认，且执行密钥和敏感内容过滤。
- Verification：可控时钟窗口测试、导出 schema snapshot、Markdown golden file 与敏感信息扫描。
- Blocked by：Issues 13、16。
- Open questions：None。

### 20. 清除本地派生数据和模型凭据

- Type：AFK
- Priority / labels：P1 / `implementation`, `privacy`, `settings`
- Source：第 11.4、13、15.4 节。
- What to build：用户可按时间、数据源或全部清除派生事件、结论和报告，并可单独清除钥匙串 API Key；所有操作明确展示影响且绝不修改源日志。
- Acceptance criteria：
  - [ ] 清除前展示范围并要求确认，完成后显示实际删除结果。
  - [ ] 按时间和数据源删除后剩余汇总一致，全部清除后可重新扫描。
  - [ ] 源日志内容、时间戳和权限保持不变；API Key 不残留在配置、日志或导出。
- Verification：临时源目录只读校验、数据库一致性测试、钥匙串 mock 和敏感信息扫描。
- Blocked by：Issues 5、6。
- Open questions：None。

## Dependency Outline

```text
1/2/3 data-source spikes ----> 9/10/11 source slices
4 scoring eval -------------> 15 scoring
5 architecture ADR ---------> 6 app foundation
6 foundation ---------------> 7/8/9/10/11 imports
7 + 8 ----------------------> 12 interval/task reconstruction
12 -------------------------> 13 metric daily report
13 + 12 --------------------> 14 standard AI review
4 + 12 + 14 ---------------> 15 scoring
13 + 14 + 15 --------------> 16 overview dashboard
14 -------------------------> 17 deep analysis
12 + 15 + 16 --------------> 18 correction/recompute
13 + 16 --------------------> 19 weekly/monthly/export
5 + 6 ----------------------> 20 local deletion
```

## Coverage Matrix

| PRD item | Covered by | Status | Notes |
| --- | --- | --- | --- |
| 1-3 定位、价值、成功标准 | 4, 6-16 | Covered | 识别率由 4 校准，五源由 7-11 交付 |
| 4A 当日报告 | 13-16 | Covered | 指标、语义、评分、页面分步可验收 |
| 4B 下钻与纠错 | 15, 16, 18 | Covered | 证据与人工优先规则明确 |
| 4C 深度分析 | 17 | Covered | 独立授权和失败回退 slice |
| 5 人与 AI 双轨 | 6, 12-18 | Covered | 人工确认、AI、反馈和降级均覆盖 |
| 6 系统与流程 | 5, 12-17 | Covered | ADR 后进入 implementation plan |
| 7 报告周期 | 13, 19 | Covered | 日、周、月与迟到日志覆盖 |
| 8 页面与数据口径 | 6-13, 16 | Covered | 五源状态、归并和概览覆盖 |
| 9 评分与成熟度 | 4, 15 | Covered | eval 是实现前置门禁 |
| 10 模型与分析 | 14, 17 | Covered | 标准授权与逐次深度确认分开 |
| 11 本地事实、纠错、生命周期 | 5, 18, 20 | Covered | 删除不触碰源日志 |
| 12 产品模块 | 5-20 | Covered | 按用户可见 vertical slices 承接，不按层拆票 |
| 13 状态与人工接管 | 6, 13, 14, 17, 18, 20 | Covered | 状态、确认与失败行为可测试 |
| 14 异常与边界 | 6-20 | Covered | 分散到对应主路径验收 |
| 15 验收标准 | 4, 6-20 | Covered | 每条转入 issue acceptance/verification |
| 16 已确认决策 | 5, 6, 16 | Covered | 技术实现仍由 ADR 决定 |
| 17 待验证假设 | 1-5 | Covered | 不把未知日志或评分包装为 AFK 实现 |
| 18 后续门禁 | 1-5 + approval | Covered | 本草案获批后才发布 Issues |
| Windows/Linux、钉钉、云端、团队、排行榜 | None | Excluded | PRD 明确为 V1 非目标 |

## Suggested Labels

- Type：`spike`, `implementation`, `architecture`, `evaluation`
- Execution：`afk`, `hitl`
- Priority：`P0`, `P1`
- Area：`data-source`, `dashboard`, `report`, `ai-analysis`, `scoring`, `privacy`
- Tool：`codex`, `claude-code`, `opencode`, `workbuddy`, `qoder`

## Approval Needed

发布 GitHub Issues 前请确认：

1. 20 个 issue 的粒度是否合适，尤其是五个数据源是否保持独立 issue。
2. Issues 2、3、4、5、16 标为 HITL 是否正确。
3. P0/P1 和依赖顺序是否符合“先证据、再基础链路、后完整体验”。
4. 是否按 Suggested Labels 在仓库创建 labels，并按依赖顺序发布全部 Issues。
