# AI Collaboration Insights 产品 PRD v0.4

## 0. 文档信息

| 字段 | 内容 |
| --- | --- |
| 功能名 | AI Collaboration Insights / Codex 协作日报 |
| 需求类型 | PRD-ai-native |
| 当前状态 | 已通过阶段一实施评审；完整产品基线替代仍待 Alpha 验证 |
| 产品阶段 | Codex-only 公开 Alpha |
| 当前版本 | `v0.2.2` |
| 目标平台 | macOS Apple Silicon / Intel |
| 目标用户 | 高频使用 Codex 完成开发、产品和研究工作的个人用户 |
| 更新时间 | 2026-07-19 |

> 本期只解决一件事：每天从本机 Codex 日志中生成一份可信、可解释、可行动的个人 AI 协作日报，让用户看清使用事实、工作成果、协作层级和下一步改进。

## 1. 模块定位

AI Collaboration Insights 是一个开源、Local-first 的 Codex 协作复盘产品。它只读扫描用户本机 Codex Session 日志，把分散的消息、工具调用、Token、Subagent 和结果事件重建为：

1. 当日使用事实和数据质量。
2. 按任务组织的工作成果、语义轮次和证据。
3. 证据驱动的五维得分与 L1-L4。
4. 最多三条可在下一次协作中验证的教练建议。

当前产品不是通用 AI 工具监控平台，也不是动态 Dashboard。它以一次性 CLI 生成自包含静态 HTML，核心价值是日报内容本身是否可信且值得持续查看。

## 2. 背景与用户问题

### 2.1 用户问题

- Codex 使用发生在多个 Session、项目和 Agent 分支中，原始日志无法直接回答“今天做成了什么”。
- 会话数、Token、工具和 Subagent 只能说明使用强度，不能代表协作能力。
- 一个 Session 可能包含多个任务，一个任务也可能跨多个 Session；按会话或时间粗暴汇总会误判成果。
- 消息多不等于迭代，出现 `test`、`Skill` 或文件名也不等于完成验证或沉淀资产。
- 重度用户单日会产生大量事件，模型无法可靠消费整天原始日志，且会带来隐私、成本和超时风险。
- 用户需要每天可执行的改进建议，但建议必须能回到具体任务和证据，不能是人格判断或通用鸡汤。

### 2.2 产品原则

1. **事实优先**：先展示确定性数据和完整度，再展示 AI 推断。
2. **强度不等于能力**：Token、时长、消息和工具调用不直接提高评分。
3. **Session 不等于 Task**：任务边界由目标、关系、产物和语义连续性共同确定。
4. **结论可核对**：任务、成果、评分和建议必须保留证据锚点、置信度或降级原因。
5. **未知不等于零**：无法识别或日志不支持的指标显示不可用，不伪造为 0。
6. **本地优先和最小外发**：源日志只读，未授权不调用模型；授权后只发送脱敏、限量的任务证据包。
7. **失败可降级**：AI、网络或部分解析失败不得阻塞确定性日报。
8. **先验证日报价值，再扩展产品外壳**：多工具、周月报和 Dashboard 必须由真实使用信号触发。

## 3. 用户场景与目标用户

### 3.1 目标用户

当前 Alpha 面向：

- 每天高频使用 Codex 的个人开发者。
- 使用 Codex 完成 PRD、研究、测试、发布等知识工作的 AI 产品人员。
- 愿意通过本地日报复盘 Prompt、迭代、验证和资产沉淀习惯的个人用户。

当前不面向团队管理员、公开排行榜用户、非 macOS 普通消费者或需要跨设备云同步的用户。

### 3.2 场景 A：19:00 自动查看日报

LaunchAgent 每天 19:00 触发 `aci report --scheduled`。系统生成最近闭合的 19:00 至 19:00 日报。用户打开 HTML 后，在一分钟内看懂当天主要数据、任务、成果和层级。

### 3.3 场景 B：手动生成或重算指定日期

用户运行 `aci report --date YYYY-MM-DD --open`。同一窗口源数据和分析状态未变化时返回 `up_to_date`；源日志变化或分析模式变化时生成新 revision，不重复统计。

### 3.4 场景 C：授权 AI 富集

用户先查看 disclosure 并执行 `aci consent grant`。系统继续以确定性事实为底座，再通过本机 Codex 登录态生成任务改名、成果摘要、会话洞察和建议。单批失败时保留已成功部分，全部失败时降级为确定性报告。

### 3.5 场景 D：查看证据和改进方向

用户结合 L1-L4、五维得分和教练建议查看任务卡中的关联会话数、语义轮次、验证状态、置信度和证据 ID，并选择下一次协作要实践的行动。

## 4. 功能目标

### 4.1 用户价值

- 可靠了解当日 Codex 使用规模和数据质量。
- 按真实任务而不是日志文件或会话标题复盘工作成果。
- 区分有效迭代、机械循环、验证闭环和资产沉淀。
- 看懂 L1-L4 的证据和缺失条件，避免虚高评价。
- 获得最多三条可执行、可验证的下一步建议。
- 无需启动服务或维护数据库，安装后自动生成本地报告。

### 4.2 AI 价值

- 使用任务级 Evidence Packet，而不是整天原始日志。
- 在核心主干足够时直接完成摘要；只有低置信或冲突任务才请求详情。
- 负责语义判断、任务命名、成果改写和洞察，不覆盖 Token、时间、退出状态等确定性事实。
- 输出必须引用已有 Task 和 Evidence ID，并通过结构校验。

### 4.3 当前 Alpha 成功标准

1. 连续 7 个有 Codex 活动的日报窗口中，至少 6 个无需人工修复即可生成。
2. 人工复核至少 20 个真实任务，整体任务分组和项目归属一致率达到 80%。
3. 用户能够在一分钟内理解当天的主要数据、成果和层级。
4. 至少一条教练建议被用户认为可执行，并在后续会话中实际尝试。
5. 用户在 7 天后仍愿意保持自动生成。
6. 报告中的 Token、会话、时间和任务事实可通过相同输入稳定重建。
7. 每个主观结论都有证据锚点和置信度；证据不足时不输出强结论。

### 4.4 非目标

当前版本明确不包含：

- Claude Code、OpenCode、WorkBuddy、Qoder 或其他数据源。
- 周报、月报、7/28/30 天趋势和跨日报长期记忆。
- 常驻 daemon、localhost API、React/Vite Dashboard 或 SQLite。
- 交互式任务纠错、合并拆分和完整重算。
- 深度分析逐次预览、指定会话重分析和取消控制。
- 钉钉日历、Webhook、团队分析、公开排行榜或账号系统。
- 自动修改 Prompt、创建 Skill、执行代码或操作用户项目。
- `.app`、自动升级、Apple Developer ID 签名或公证。

### 4.5 已确认的第一阶段范围

当前下一阶段只修复 Codex 任务重建所依赖的事实主干，不扩大产品来源或界面形态：

- 在 Unified Event 与 Task 之间增加可重建的 Source Turn，使一次真实用户输入、过程中可观察的模型轮次、工具调用及最终输出保持同一来源边界。
- 为事件保留本地受限的来源定位、原生事件标识或稳定摘要，使 Task、Outcome 和 Evidence 可以回查到原始事实。
- Task Reconstructor 改为优先基于 Source Turn 识别 Session 内目标切换，再依据强关系证据建立跨 Session 关联。
- 使用当前私有 Ground Truth 重新验证任务边界、多目标切分、项目归属、验证识别和跨 Session 聚合。

本阶段明确不包含第二个 Agent 数据源、OpenLIT 实时采集、ATIF/Phoenix 产品集成、新数据库、动态 Dashboard 或报告页面重构。ATIF、OTel 和 Phoenix 仅保留为未来投影边界，不成为 ACI 内部事实模型。

## 5. 人与 AI 双轨协作

| 阶段 | 人工动作 | AI 动作 | 系统反馈 | 边界 |
| --- | --- | --- | --- | --- |
| 安装与诊断 | 安装、运行 `aci doctor` | 无 | 显示版本、Codex 日志、数据目录和调度状态 | 不使用 `sudo`，不接收 API Key |
| 日报触发 | 等待 19:00 或手动运行 | 无 | 显示生成、最新或失败状态 | 同一窗口持有生成锁，不重复启动 |
| 事实扫描 | 无需逐条操作 | 不参与 | 展示事件数、跳过数和未知事件 | 源日志只读，未知不猜测 |
| 任务重建 | 无 | 仅在授权后辅助低置信语义判断 | 输出任务、关系、轮次和置信度 | 项目和时间相近只是弱证据 |
| AI 富集 | 首次明确授权，可随时撤回 | 按任务分批生成名称、成果、洞察和建议 | 显示完整、部分成功、降级或未授权 | 不发送完整日志、凭据和大段代码 |
| 评分与报告 | 阅读并决定是否采信 | 不能直接修改确定性事实 | 展示五维、L1-L4、证据和降级原因 | 使用强度不加分，未覆盖任务不抬高等级 |
| 改进行动 | 在后续协作中实践建议 | 后续日报重新观察证据 | 展示新的任务事实和评分 | 当前不持久化建议状态，不宣称长期改善 |

## 6. 产品主链路

### 6.1 总体流程

1. **触发窗口**：手动或 LaunchAgent 选择本地时区日报日期，窗口为前一日 19:00 至当日 19:00，左闭右开。
2. **只读扫描**：发现目标 Codex JSONL，流式解析、限制超大行、去重并计算源指纹和受限来源定位。
3. **事实组装**：构建 Unified Events、Source Turns、Session facts、Token、消息、工具、Subagent、活跃时间和分布统计。
4. **任务重建**：过滤系统注入和历史重放，先按 Source Turn 识别 Session 内目标切换，再依据 continuation、delegation 和 shared deliverable 强关系关联跨会话任务。
5. **轮次与证据**：将事件压缩为 Semantic Round，为每个 Task 生成有预算的 Evidence Packet。
6. **可选 AI 富集**：授权后以最多 4 个任务为一批执行 `codex exec --ephemeral`；必要时只对低置信或冲突任务回读详情。
7. **评分门禁**：依据完整证据、置信度、独立来源和分析覆盖率计算五维得分与 L1-L4。
8. **原子发布**：校验 `report.json`，渲染无 JavaScript 的静态 HTML，原子替换当前日期目录并更新 manifest 和历史索引。

可编辑流程图：[任务重建与渐进分析流程](../diagrams/task-reconstruction-progressive-analysis-flow.drawio)

### 6.2 幂等与 revision

- 同一日期使用源指纹判断数据是否变化。
- 源指纹与目标分析状态均未变化时返回 `up_to_date`。
- 源日志、AI 授权状态或分析结果需要更新时，生成新的 revision。
- JSON 和 HTML 在临时目录完成校验后原子发布；失败时保留上一 revision。
- 定时任务在登录或恢复后最多补偿最近 7 个缺失闭合窗口。

## 7. 核心产品对象与业务规则

### 7.1 Report Window

- 默认按系统时区计算。
- 日报日期 `D` 表示 `D-1 19:00` 至 `D 19:00`。
- 跨窗口 Session 只统计当前窗口内事件和调用增量。
- 报告固化记录时区、开始、结束和生成时间。

### 7.2 Unified Event

- 统一表达消息、工具调用、工具结果、usage 和 Subagent 生命周期。
- 每个事件有稳定不可逆 ID，项目路径和内容使用 digest 或脱敏显示。
- 事件保留 Source Session、Source Turn、工具调用配对和父子关系所需的稳定引用；来源定位只允许在本地受限回读，不进入公开 HTML。
- 未识别事件进入 diagnostics，不根据字段猜测含义。

### 7.3 Source Turn

- Source Turn 是一次真实用户输入到该次最终输出之间的来源事实边界，不等于 Task，也不等于用于评分的 Semantic Round。
- 优先采用 Codex 原生轮次标识；缺失时才使用真实用户消息开启边界，并将推断来源和完整度显式标记。
- Tool call 与 Tool result 优先通过原生调用标识配对；无法配对时保留为 unmatched diagnostics，不按时间接近强行关联。
- 上下文压缩、系统注入、状态轮询和历史重放不自动开启新 Turn；Subagent 通过父子或委派关系关联到来源 Turn。
- 一个 Task 可以包含多个 Source Turn；一个 Source Turn 默认只属于一个 Task，边界冲突时保持候选状态而不是复制计分。

### 7.4 Session Fact

- Session 是日志来源容器，不是任务。
- 事实画像包括消息、Token、工具、活跃时间、项目候选和 Agent 状态。
- 系统注入、空会话和无真实用户目标会话不应自动成为独立任务。

### 7.5 Task

一个可评分 Task 至少需要可识别目标，以及结果、明确未完成状态或可核对的推进结果之一。

任务边界优先级：

1. 用户明确提出新目标、切换问题或继续已有任务。
2. 父子 Session、Subagent 或明确任务引用。
3. 相同 Issue、PR、测试目标或共同交付物。
4. 目标和成果语义连续。
5. 项目相同和时间接近只作为弱候选，不自动合并。

错误合并比错误拆分更损害日报可信度，证据冲突时默认拆分或保留候选关系。

### 7.6 Task Relation

| 类型 | 语义 | 是否可自动合并 |
| --- | --- | --- |
| continuation | 新 Session 明确继续同一目标 | 高置信时可以 |
| delegation | 主任务委派给 Subagent 或子 Session | 有生命周期证据时可以 |
| shared deliverable | 多个 Session 共同处理明确交付物 | 还需目标连续性 |
| candidate | 仅项目和时间接近 | 不可以，只展示候选 |

### 7.7 Semantic Round

语义轮次描述一次有意义的推进：

`新目标/反馈/观察 -> 尝试 -> 结果 -> 调整、验证、完成或停止`

以下可以形成新轮次：用户纠偏、验证失败后的方案变化、新证据改变决策、Subagent 结果返回后调整。

以下不提高迭代得分：连续工具调用、状态轮询、系统注入、无新信息的重复读取或相同失败机械重试。

### 7.8 Evidence Packet

| 层级 | 默认内容 | 产品用途 |
| --- | --- | --- |
| 核心主干 | 目标、约束、反馈、结果、验证、产物 | 每个任务必须覆盖 |
| 过程证据 | 关键轮次、错误与调整、工具摘要、Agent 生命周期 | 支撑迭代和风险判断 |
| 原始详情 | 大段工具输出、完整代码、重复历史 | 默认不发送，仅按需受限回读 |

每个任务独立分配内容预算，不能用全日报“前 N 条消息”代表全部任务。

## 8. 使用事实与指标口径

### 8.1 固定指标

- 会话数和消息数。
- 工具调用、Skill 候选调用和唯一 Subagent 运行。
- 人工活跃时间和工作区间。
- 输入、缓存输入、输出、推理和总 Token。
- 任务数、关联 Session、语义轮次和任务关系。
- 数据完整度、跳过记录和未知事件。

### 8.2 Token 口径

- 优先累加窗口内每次模型调用的 `last_token_usage` 增量。
- 同事件携带的累计 `total_token_usage` 用于去重和校验，不重复求和。
- 只有日志缺少调用增量时，才回退到 Session 累计峰值。
- 跨越 19:00 的长 Session 不把窗口外消耗带入当前日报。
- Token 无法稳定归因到单条消息时，不展示“每消息 Token”。

### 8.3 分布统计

- 总量旁展示样本数、平均值和中位数；样本足够时展示 P90。
- 人工活跃时间使用全局时间区间并集，单日报不得超过 1,440 分钟。
- 并行 Agent 时间不与人工活跃时间直接相加。
- 数据源无法稳定识别 Skill 时，产品应显示口径限制或不可用，而不是把 0 当作事实。

## 9. 评分与 L1-L4

### 9.1 五个维度

| 维度 | 核心问题 | 可用证据 |
| --- | --- | --- |
| 目标表达 | 目标、边界和完成标准是否清楚 | 用户真实意图和约束 |
| 迭代意识 | 是否根据新信息调整方案 | 有效 Semantic Round |
| 验证闭环 | 是否执行检查并观察结果 | 工具动作、退出状态、验证反馈 |
| Agent 协作 | 委派是否真实发生且与任务相关 | 唯一 Subagent 生命周期和父子关系 |
| 资产沉淀 | 是否形成可复用产物 | 实际新增或更新的测试、文档、脚本、模板或 Skill |

### 9.2 评分规则

- 使用量、耗时、Token 和消息数量不构成正向质量证据。
- 证据置信度低于 0.60 不参与评分。
- 0.60 至 0.79 的中置信证据需要第二类独立来源，才进入 L3/L4 门禁。
- 0.80 及以上高置信证据可进入等级门禁。
- 只有关键词命中而无动作或结果的证据不进入评分。
- 维度缺少证据时显示不可用，不按 0 分拉低总分。
- AI 分析部分成功时，未覆盖任务不能把日报推高到更高等级。

### 9.3 等级定义

| 等级 | 当前规则 | 产品语义 |
| --- | --- | --- |
| L1 | 已识别任务，但无稳定迭代或验证证据 | 以一次性问答或执行为主 |
| L2 | 出现迭代或验证证据，但不足 L3 | 开始结构化推进和检查 |
| L3 | 至少 3 个任务同时具备可用迭代与验证证据 | 形成稳定迭代验证闭环 |
| L4 | 至少 5 个任务具备迭代与验证，且至少 2 个有复用资产 | 系统化协作并持续沉淀 |

日报得分和等级只反映当前窗口，不代表稳定人格或长期能力。

## 10. AI 富集与状态反馈

### 10.1 授权边界

- 默认不授权 AI 分析，仍生成完整确定性日报。
- 用户必须显式执行 `aci consent grant`。
- 授权记录包含 disclosure version、时间和范围，可通过 `aci consent revoke` 撤回。
- ACI 不接收或保存 API Key，不读取或复制 Codex `auth.json`。

### 10.2 分析隔离

- 使用 `codex exec --ephemeral`，避免生成新的源 Session。
- 忽略用户 rules 和非白名单配置，在空临时目录、read-only sandbox 中运行。
- 只转发 allowlist 内的模型、provider ID、无凭据 base URL、wire API、认证模式和有限重试配置。
- 不转发 static headers、query params、MCP、hooks、plugins 或带凭据 URL。
- 输入经过路径和 secret 脱敏、文本截断、任务预算和总大小限制。
- 输出必须满足结构契约，并只能引用现有 Task、Session 和 Evidence ID。

### 10.3 分批和渐进回读

- Core analysis 每批最多 4 个任务，顺序执行。
- 单批超时或失败不删除其他批次结果。
- AI 可标记 `needsDetail`；只有任务冲突或边界置信度低于 0.80 时提供详情。
- 全部批次无有效输出时降级为确定性报告。

### 10.4 用户可见状态

| 状态 | 用户看到什么 | 系统行为 |
| --- | --- | --- |
| disabled | AI 分析已关闭 | 只生成确定性报告 |
| not_consented | AI 分析未授权 | 不启动 Codex 分析子进程 |
| complete | AI 覆盖全部任务 | 展示 AI 改名、成果、洞察和建议 |
| partial | 已分析任务数/总任务数和失败原因 | 保留成功任务，评分按覆盖率降级 |
| degraded | AI 富集未完成及原因 | 发布确定性报告，不阻塞日报 |

## 11. 日报页面结构

### 11.1 页面入口

- 自动任务生成后，用户从本地报告历史目录打开对应日期。
- 手动命令加 `--open` 时调用系统默认浏览器。
- 页面为单个自包含 HTML，不依赖 localhost、JavaScript、远程字体或 CDN。

### 11.2 固定信息顺序

#### 01 数据与层级

- 报告窗口、revision、生成时间和生成原因。
- 数据质量、AI 覆盖、评分门禁和降级原因。
- Token、会话、消息、工具、Skill、Subagent、活跃时间、任务、跳过和未知事件。
- 当日得分、L1-L4 和五维状态。

#### 02 工作成果

每个任务展示：

- 任务名、项目候选、开始和结束时间。
- 成果摘要、任务置信度和分析状态。
- 活跃时间、关联 Session、语义轮次和关系数。
- 验证状态、证据 ID、最多 5 个关键轮次。
- AI 富集可用时，展示最多 2 条关联 Session 洞察。

#### 03 教练建议

- 最多三条。
- 每条包含问题、证据、下一次行动和验证方式。
- 任务或证据不足时允许不生成建议。
- 不因 Token 或工具数量高而直接建议“少用 AI”。

### 11.3 安全与响应式要求

- 所有动态文本做 HTML 转义，不接受模型生成 HTML。
- CSP 禁止网络、脚本、object、frame 和表单提交。
- 桌面与窄屏不出现内容重叠或横向溢出。
- 报告不展示未脱敏绝对路径、凭据、完整代码或完整原始会话。

本 PRD 不嵌入真实日报截图。真实页面包含个人任务和会话摘要，公开仓库隐私规则禁止提交；现有静态 HTML 结构由合成 fixture、renderer 测试和本机私有验收覆盖。

## 12. 本地数据、生命周期与隐私

### 12.1 数据所有权

- Codex 源日志是不可修改的原始事实，ACI 始终只读。
- `report.json`、HTML、manifest、consent 和本地日志属于 ACI 派生数据。
- 数据目录必须带 ownership marker，清理操作只允许删除受 ACI 管理的派生目录。
- 当前不建立完整会话副本，不使用 SQLite。

### 12.2 安装与调度

- 安装器按 CPU 架构下载固定 Release asset 并校验 SHA-256。
- 安装路径为 `~/.local/bin/aci`，不使用 `sudo`。
- LaunchAgent 每天 19:00 运行，并在登录时执行补偿检查。
- 默认卸载保留报告；显式 `--purge-data` 才删除 ACI 派生数据。

### 12.3 隐私边界

- 无 telemetry、云端上传、账号系统和远程 crash reporting。
- 不向 GitHub、CI、Issue、PR 或 Release 提交真实日志、Prompt、回复、路径和个人报告。
- AI 未授权时不发送会话内容。
- AI 授权后只向用户当前 Codex provider 发送脱敏任务证据包。
- 模型输出只是推断，不能决定文件路径、命令、HTML 或权限。

## 13. 模块拆解与输入输出

| 模块 | 产品职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| CLI 与诊断 | 接收 version、doctor、report、consent、schedule、data 命令 | 用户命令和本机环境 | JSON 状态、报告路径或错误码 |
| Codex 日志接入 | 发现并只读扫描日报窗口日志 | Codex JSONL、窗口、限制 | Unified Events、诊断和源指纹 |
| Turn Assembler | 恢复真实输入输出边界并配对工具轨迹 | Unified Events、原生轮次和调用引用 | Source Turns、unmatched diagnostics、完整度 |
| Fact Engine | 计算可信 Session 和使用事实 | Unified Events、Source Turns | Usage metrics、分布和活跃时间 |
| Task Reconstructor | 拆分 Session 内任务并关联跨 Session 关系 | Source Turns、用户目标、项目、关系和产物锚点 | Tasks、Task Relations、置信度 |
| Round Segmenter | 识别有效推进、反馈调整和机械循环 | Task Events | Semantic Rounds、关键轮次 |
| Evidence Builder | 分层压缩和预算控制 | Task、Round、事件引用 | Evidence Packets 和 coverage |
| AI Analyzer | 生成任务改名、成果、洞察和建议 | 已授权的脱敏证据包 | 结构化 enrichment 或降级原因 |
| Scoring Gate | 计算五维和 L1-L4 | Tasks、Evidence、分析覆盖 | Score、Maturity、降级状态 |
| Report Pipeline | 幂等生成、校验和原子发布 | 全部派生结果和 manifest | report.json、HTML、历史索引 |
| Scheduler | 安装、状态、补偿和卸载 | binary path、用户域、19:00 规则 | LaunchAgent 和运行日志 |

## 14. 人工接管与恢复

- AI 首次使用前必须人工授权。
- 用户可随时撤回授权，后续报告自动回到确定性模式。
- AI 失败不需要用户修复源数据，可以重新运行或接受确定性报告。
- 数据目录不是 ACI 所有、路径越界或符号链接异常时，停止写入和清理。
- 当前版本不支持在报告页面内人工修改任务或评分；发现误判应通过 GitHub Issue 或本地私有评估反馈，不直接编辑历史 report JSON。
- 未来加入交互纠错前，必须先定义持久事实库和 append-only correction overlay。

## 15. 异常与边界

| 情况 | 产品处理 |
| --- | --- |
| Codex 日志目录缺失或不可读 | `doctor` 返回 missing/unreadable，报告失败并给出阶段错误 |
| 目标窗口无数据 | 生成 `no_data` 报告，不伪造任务和评分 |
| 存在超大行或未知事件 | 跳过并记录数量，必要时将完整度标记 partial |
| 同一项目多个并发 Session | 默认独立，除非有强关系证据 |
| Session 只有系统上下文 | 不生成独立任务，尝试关联父任务 |
| 跨窗口长 Session | 只统计窗口内事件和调用增量 |
| Subagent 无完成事件 | 显示未知或未完成，不推定成功 |
| 相同错误机械重试 | 标记无效循环，不提高迭代分 |
| 只出现验证关键词 | 验证为未观察到或尝试过，不标记已验证 |
| AI 未授权 | 完整生成确定性日报 |
| 单个 AI 批次失败 | 生成 partial 富集，保留成功批次 |
| 全部 AI 批次失败 | 生成 degraded 确定性日报 |
| 报告写入或校验失败 | 不替换当前报告，保留上一 revision |
| 定时任务错过 19:00 | 下次运行补偿最多 7 个缺失窗口 |

## 16. 验收标准

### 16.1 安装与运行

- [ ] Apple Silicon 和 Intel Release 均可下载、校验和运行。
- [ ] `aci doctor` 正确显示 Codex 日志、数据目录和 schedule 状态。
- [ ] LaunchAgent 固定每天 19:00，并支持登录补偿。
- [ ] 手动指定日期、自动日报、重复运行和 revision 行为符合规则。
- [ ] 默认卸载保留报告，purge 只删除带 ownership marker 的 ACI 数据。

### 16.2 数据与任务

- [ ] 源日志在扫描前后内容、权限和 mtime 不变。
- [ ] Token 使用窗口内调用增量，重复累计快照不重复计数。
- [ ] 人工活跃时间全局去重且不超过 1,440 分钟。
- [ ] 系统注入、Files、Applications、Automation 和工具输出不成为任务标题。
- [ ] 同一输入和 parser version 重算时，Event 与 Source Turn ID 保持稳定。
- [ ] 存在 Codex 原生轮次标识时可确定性恢复 Source Turn；回退推断必须标记完整度。
- [ ] 存在原生调用标识的 Tool call/result 可配对；未配对项进入 diagnostics，不静默丢弃或误配。
- [ ] 每个 Task 至少引用一个 Source Turn，每个结论性 Evidence 可以回查到 Event 和本地受限来源定位。
- [ ] 至少一个 100 Turn 级合成或不可逆脱敏长会话样本可在既有资源限制内完成处理。
- [ ] 一个 Session 内无关目标可拆分，跨 Session continuation/delegation 可关联。
- [ ] 弱候选关系不自动强合并。
- [ ] 每个可评分任务有独立 Evidence Packet 和 coverage。

### 16.3 AI、评分与报告

- [ ] 未授权不启动 Codex 分析，仍生成确定性日报。
- [ ] AI 输入不含凭据、未脱敏路径、完整代码和完整工具输出。
- [ ] 4 任务分批、部分失败保留和全部失败降级可重复验证。
- [ ] AI 输出不能引用不存在的 Task、Session 或 Evidence ID。
- [ ] 使用量本身不提高得分，缺失维度不按 0 分。
- [ ] L3/L4 只由满足置信度和证据门槛的任务触发。
- [ ] HTML 包含数据与层级、工作成果、教练建议三个固定区块。
- [ ] HTML 无 JavaScript、无远程请求、无未转义模型内容和本机绝对路径。

### 16.4 产品验证

- [ ] 7 个活跃日报窗口至少 6 个无需人工修复。
- [ ] 至少 20 个真实任务本地私有复核达到 80% 一致率。
- [ ] 用户在一分钟内说出当日主要任务和成果。
- [ ] 至少一条建议被实际尝试，并能在后续报告观察对应证据。
- [ ] 7 天后用户仍希望保留自动日报。

### 16.5 Source Turn 阶段一发布门禁

- [ ] 只使用合成 fixture 的公开自动化测试覆盖 Event v2、原生与回退 Turn、Tool 配对、unmatched diagnostics、provenance 和 100 Turn 长会话。
- [ ] 使用同一套本地私有 Ground Truth 复测；Task boundary agreement 与 project agreement 分别达到至少 80%。
- [ ] 私有样本中的多目标 Session 均能识别目标切换；cross-session Task group precision 达到至少 80%。
- [ ] 私有样本中明确 Verification 的 recall 达到至少 80%，且结论可回查 Source Turn 和 Event。
- [ ] 真实日志、逐条标注、路径、Session ID 和个人报告仅保留在本地；GitHub 只记录聚合指标与 share-safe 结论。
- [ ] 若任一私有质量门禁未通过，不发布新版本；保留实现分支和诊断结果，继续修复事实主干而不扩展 UI 或 Adapter。

## 17. 当前交付状态与已知限制

### 17.1 已实现

- Codex-only 19:00 日报、手动生成和最近 7 日补偿。
- Deno 单二进制、macOS 双架构安装和 LaunchAgent。
- 只读扫描、Session facts、Task graph、Semantic Round、Evidence Packet。
- Unified Event 已能表达主要事件，但 Source Turn、工具调用稳定配对和持久 provenance 尚未形成完整契约。
- 确定性指标、五维、L1-L4、任务成果和教练建议。
- 明确授权后的 Codex ephemeral AI 富集、4 任务分批和部分成功保留。
- 自包含静态 HTML、报告 JSON、manifest、revision、历史索引和数据清理。
- CI、合成 eval、隐私扫描、checksum 和 artifact provenance。

### 17.2 已知问题

| Issue | 状态 | 对产品的影响 |
| --- | --- | --- |
| #50 | Open | LaunchAgent 可能找不到 fnm/nvm 安装的 Codex，自动 AI 富集会降级 |
| #64 | Open | 有效反馈调整可能被误判为无效循环 |
| #70 | Open | 确定性教练建议模板化，针对性不足 |
| #71 | Open | Skill 调用统计口径待确认，可能长期显示 0 |
| #72 | Open | 仅有超大行跳过时完整度仍显示 partial，告警偏重 |
| #43 | Open | Release 下载失败检测与重试不足 |
| #66 | Open | GitHub Actions Node 20 deprecation warning |
| 私有 Ground Truth | Blocked | Task 边界、多目标切分和跨 Session 聚合尚未达到产品化门槛，先补 Source Turn 与 provenance 主干 |

其中 #50 是“自动 AI 富集正式可用”的关键阻断项；其余问题不阻塞确定性日报，但会影响信任、解释或建议价值。

## 18. Post-MVP 恢复条件

| 延期能力 | 恢复条件 |
| --- | --- |
| 第二数据源 | Codex 日报通过 7 天产品验证，Unified Event 和任务口径稳定 |
| 周报/月报 | 至少积累 14 个有效日报，并出现真实跨日复盘需求 |
| 动态 Dashboard | 静态报告通过验证，且交互、筛选或纠错无法由静态页面满足 |
| SQLite | 多来源、跨周期聚合、交互纠错或并发重算成为真实需求 |
| 人工纠错 | 任务误判成为留存主要问题，并出现稳定纠错模式 |
| 深度分析 | 标准日报稳定，用户明确需要对指定 Task/Session 扩大上下文 |
| 日历与钉钉 | 日报内容和时间边界稳定，用户明确需要外部行动闭环 |
| `.app`、签名、公证 | CLI Alpha 通过验证，准备面向非开发者分发 |

扩展原则：一次只引入一个主要复杂度来源，并重新经过 PRD、ADR、Issue、测试和 Release 决策。

## 19. 待确认事项

本 PRD 对 Source Turn 阶段一没有阻断性待确认项，已可进入 scoped GitHub Issue 和实现。是否正式替代分散在 MVP 范围文档、PRD v0.3、ADR 和 Release notes 中的完整产品基线，仍需等待阶段一私有 Ground Truth 与 7 日 Alpha 验证通过后确认。

## 20. 本地草稿附录

- 开发复盘：[development-retrospective-v0.2.2.md](../PROJECT/development-retrospective-v0.2.2.md)
- MVP 范围：[codex-daily-report-mvp-scope-v0.1.md](codex-daily-report-mvp-scope-v0.1.md)
- 渐进分析基线：[ai-collaboration-review-prd-v0.3.md](ai-collaboration-review-prd-v0.3.md)
- 运行时决策：[ADR-0001-codex-daily-report-runtime.md](../DECISIONS/ADR-0001-codex-daily-report-runtime.md)
- 事实与轮次决策：[ADR-0002-unified-fact-and-source-turn-model.md](../DECISIONS/ADR-0002-unified-fact-and-source-turn-model.md)
- v0.2.2 Release：[v0.2.2.md](../RELEASES/v0.2.2.md)
- 任务重建流程图：[task-reconstruction-progressive-analysis-flow.drawio](../diagrams/task-reconstruction-progressive-analysis-flow.drawio)

本地评审稿不嵌入任何真实 Codex 日志、会话、路径、个人报告或截图。
