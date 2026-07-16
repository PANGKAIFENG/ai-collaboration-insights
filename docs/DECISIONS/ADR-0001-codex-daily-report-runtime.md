# ADR-0001: Codex 日报 MVP 运行时与安全边界

## 状态

Accepted

## 日期

2026-07-15

## 关联

- [Issue #6](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/6)
- [Codex 日报 MVP 范围压缩决策 v0.1](../PRD/codex-daily-report-mvp-scope-v0.1.md)
- [AI 协作复盘台 PRD v0.2](../PRD/ai-collaboration-review-prd-v0.2.md)

## 上下文

PRD v0.2 原计划交付常驻 localhost 服务、React
Dashboard、SQLite、多工具和日周月报告。范围校准后，`v0.1.0 MVP`
只验证一件事：真实 Codex 会话能否稳定生成有价值的每日“数据、成果、层级和建议”。

因此 MVP 不需要先建设通用本地 Web 应用。架构必须满足：

- Codex 源日志始终只读。
- 每日 19:00 自动生成，支持手动运行和错过补偿。
- 单次运行可以完成扫描、分析、渲染并退出。
- 模型不可用时仍能生成确定性指标报告。
- 输出可以在默认浏览器中安全打开，不运行本地服务。
- 安装不要求用户预装开发工具链。
- 为未来多工具、SQLite 和交互式 Dashboard
  保留可迁移的数据契约，但不提前实现它们。

## 决策

### 1. 技术栈与发布形态

MVP 使用 **Deno 2 + TypeScript** 实现一个 one-shot CLI，命令名为 `aci`。

- 开发和 CI 使用仓库锁定的 Deno 2 版本。
- 只使用 Deno/Web 标准能力和经过审查的最小依赖；优先零运行时第三方依赖。
- GitHub Release 使用 `deno compile` 生成 `aarch64-apple-darwin` 和
  `x86_64-apple-darwin` 单二进制。
- 编译产物不授予应用自身网络权限；只开放所需环境变量、文件能力和
  `codex`、`open`、`launchctl` 子进程能力，应用内继续执行 source/output
  allowlist。
- 最终用户不需要安装 Deno、Node、Python 或编译工具链。
- MVP 不发布 `.app`，不做 Apple Developer ID 签名、公证或自动升级；SHA-256 和
  release provenance 是发布门禁。

最小命令面：

```text
aci doctor
aci report [--date YYYY-MM-DD] [--no-ai] [--open]
aci consent grant|revoke|status
aci schedule install|remove|status
aci data purge
aci version
```

所有命令使用结构化错误码；默认日志只包含阶段、计数、耗时和脱敏错误，不输出
prompt、response、工具输出、完整路径或凭据。

### 2. 进程生命周期与并发

- `aci report` 启动后依次执行发现、解析、归一化、推断、评分、可选 AI
  分析、渲染和原子写入，然后退出。
- 浏览器关闭不影响已经完成的报告；没有需要保持运行的后台进程。
- 同一用户同一时间只允许一个 report run。进程使用数据目录内的原子目录锁，记录
  PID、开始时间和版本。
- 新进程发现锁时先检查 PID；仅在进程不存在或锁超过安全 TTL 时清理 stale lock。
- 进程收到 `SIGINT`/`SIGTERM`
  时停止启动新阶段、清理临时文件和自己持有的锁，不发布不完整报告。
- 临时文件在目标目录内创建，只有所有阶段成功或进入已定义的降级状态后，才通过同文件系统
  rename 发布。

### 3. 调度与补偿

安装器在当前用户域写入
`~/Library/LaunchAgents/com.ai-collaboration-insights.daily.plist`：

- `StartCalendarInterval`：每天本地时间 19:00。
- `RunAtLoad`：登录或加载 LaunchAgent 时检查补偿。
- 调度调用固定绝对路径的 `aci report --open`，不通过 shell 拼接命令。
- `launchd` stdout/stderr 写入应用日志目录，输出遵守脱敏规则并执行轮转。

每次自动运行计算“最近一个已经闭合的 19:00 日报窗口”，并检查 manifest：

- 当前窗口不存在时生成并标记 `scheduled` 或 `catch_up`。
- 已存在且源指纹未变化时直接成功退出。
- 已存在但源指纹变化时生成新的内部 revision，并把它设为当前 HTML；MVP UI
  不展示历史 revision。
- 一次自动运行最多补偿最近 7
  个缺失窗口，避免设备长期离线后产生不可预期的模型消耗；更早窗口只能手动生成。
- 时区随每个报告固化。时区变化不改写旧报告，只影响之后闭合窗口的计算。

### 4. 本地目录与安装边界

默认目录：

```text
~/.local/bin/aci
~/Library/LaunchAgents/com.ai-collaboration-insights.daily.plist
~/Library/Application Support/ai-collaboration-insights/
  config.json
  consent.json
  manifest.json
  reports/YYYY-MM-DD/report.json
  reports/YYYY-MM-DD/index.html
  reports/index.html
  logs/
  tmp/
```

- 安装和运行均在用户域完成，不使用 `sudo`。
- 安装脚本按机器架构下载固定 release asset，先验证项目发布的 SHA-256 和 GitHub
  artifact attestation，再原子替换二进制。
- 配置、manifest、报告 JSON 和 consent 文件都带 schema version。
- `aci data purge` 只删除应用 manifest
  明确拥有的派生目录，拒绝根目录、home、Codex 源目录、符号链接逃逸和未知目标。
- 默认卸载删除二进制和 LaunchAgent，保留派生报告；显式 `--purge-data`
  才删除派生数据。
- 卸载永不删除 `~/.codex`、Codex 登录态或其他工具文件。

### 5. Codex 来源与只读约束

- 默认来源为 Codex 标准 session 目录；自定义 `CODEX_HOME`
  只改变发现根目录，不扩大可读取范围。
- 启动时解析真实路径并记录只读 source root。所有候选文件必须在该 root
  内，符号链接逃逸直接拒绝。
- 只读取规则允许的 `.jsonl` 文件；不递归读取任意隐藏目录、附件或工作区文件。
- 解析采用流式逐行处理，限制单行大小、单事件提取文本大小、单窗口事件数和模型分析包大小。
- 无法识别的事件保留计数和诊断类型，但不猜测字段，也不使整个窗口失败。
- 测试对源 fixture 记录内容、权限和 mtime，运行后必须保持不变。

### 6. 统一事件与稳定 ID

MVP 定义版本化 `UnifiedEvent`，最小字段包括：

```text
schemaVersion
eventId
sourceTool
sourceSessionId
timestamp
kind
role
model
usage
toolName
subagentDepth
projectRef
contentDigest
contentLocator
availability
```

- `sourceTool` 在 MVP 固定为 `codex`，字段仍保留以支持未来迁移。
- 优先使用 Codex 原生 session/event 标识；缺失时使用
  session、时间、kind、稳定序号和内容 digest 生成 SHA-256。
- `projectRef` 和 `contentDigest` 使用单向 digest；报告不得输出未脱敏绝对路径。
- `contentLocator` 只在当次进程内用于回读，不写入公开 HTML；持久化时保存相对
  source root 的受限定位或 digest。
- 同一输入在同一 parser version 下产生相同 event ID。parser 版本变化记录在
  report provenance 中，不静默混用旧中间结果。

MVP 不建设通用插件注册或动态加载系统。`SourceAdapter` 只定义 Codex
实现实际使用的 `discover`、`scanWindow` 和 `fingerprintWindow` 边界。

### 7. 事实、报告与 revision

MVP 不使用 SQLite。事实边界为：

- Codex 源日志是不可修改的原始事实。
- 当次扫描产生的 UnifiedEvent 流是可重建中间事实，不默认长期复制完整正文。
- `report.json` 是某个日报 revision 的结构化派生结果。
- `manifest.json` 记录窗口、当前
  revision、源指纹、生成原因、parser/analyzer/rubric/renderer version 和文件
  digest。

`DailyReport` 至少包含：

```text
schemaVersion
reportId
window { start, end, timeZone }
revision
generationReason
completeness
usageMetrics
workBlocks
tasks
score
maturity
evidence
coachSuggestions
analysisStatus
provenance
```

写入采用 read-validate-write：新 JSON 必须先通过 schema 校验，HTML
必须从已经验证的 DailyReport 渲染，最后一起原子发布。失败时保留上一个 current
revision。

MVP 没有用户修正所有权模型。未来加入纠错时，必须先引入持久事实库和 append-only
correction overlay，不得通过直接改写历史 report JSON 实现。

### 8. 工作区间、任务和评分

- 活跃段继续使用已批准的 5 分钟边界；同项目同任务的相邻活跃段使用 20
  分钟候选合并边界。
- 不同项目默认不合并。项目只输出脱敏显示名和 digest。
- 并行 subagent 区间独立记录，不与人工活跃时间直接相加。
- 使用量不直接提高五维评分。
- 证据不足的维度为 unavailable，不按 0 计算。
- MVP 输出当日报告窗口的 0-100 得分和当日 L1-L4；不输出 28 天滚动趋势。
- 已批准的 overall 80% 识别一致率仍是 MVP 门禁；只有一个工具时，单工具 70% floor
  不降低 overall 门槛。
- L3 至少需要 3 个同时具备迭代与验证证据的任务；L4 至少需要 5 个，并至少有 2
  个复用资产任务。

### 9. AI 分析与同意

MVP 不接收或存储模型 API Key，也不创建自己的 Keychain item。它复用用户已安装
Codex CLI 的登录态，通过子进程执行：

```text
codex exec
  --ephemeral
  --ignore-user-config
  --ignore-rules
  -c model=<allowlisted-model>
  -c model_provider=<allowlisted-provider>
  -c model_providers.<provider>.<allowlisted-route-field>=<value>
  -c model_reasoning_effort="low"
  --sandbox read-only
  --skip-git-repo-check
  --cd <empty-temp-dir>
  --output-schema <analysis-schema.json>
  --output-last-message <temp-output.json>
  -
```

- 调用使用参数数组和 stdin，不通过 shell，防止命令注入。
- `--ephemeral` 防止分析任务写入 Codex session 日志并被下一份日报重复统计。
- `--ignore-user-config` 和 `--ignore-rules` 避免加载用户
  MCP、hooks、项目指令或自定义工具；认证仍由 Codex 自己管理。
- 为兼容自定义 Codex provider，ACI 只从 `config.toml` 读取并通过 `-c`
  转发模型、provider ID、无凭据 base URL、wire API、认证模式和有限重试配置。
  静态 headers、query params、MCP、hooks、plugins 和其他用户配置不会被转发；
  ACI 不读取或复制 `auth.json`。
- Core analysis 每批最多处理 4 个任务；单批失败或超时只降低覆盖率，已成功批次继续
  进入日报。只有全部批次都没有有效输出时才整份降级为确定性分析。
- 分析在新建空目录运行，read-only sandbox 不授予 Codex 源日志或报告目录访问权。
- 只把经过大小限制、secret redaction 和最小化处理的 analysis package 写入
  stdin。
- 输出必须通过 JSON Schema 和业务规则校验；模型内容不能决定文件路径、命令、HTML
  或权限。
- 用户首次执行 AI 分析前记录 disclosure version、授权时间和范围；撤回后默认
  `--no-ai`。
- Codex
  缺失、未登录、超时、限流、输出不合法或用户未同意时，日报降级为确定性版本。

Codex 登录态由 Codex
产品所有。安装、撤回同意、清理数据和卸载都不得读取、复制或删除其认证文件。

### 10. 静态 HTML 安全

- HTML renderer 对所有动态文本执行上下文正确的转义，不接受模型生成
  HTML、Markdown HTML 或事件属性。
- MVP 报告不需要客户端 JavaScript；历史索引只包含受控相对链接。
- 每份 HTML 包含限制性 CSP meta：默认禁止网络、脚本、object、frame
  和表单提交，仅允许内联样式与必要的 data image。
- 不加载 CDN、远程字体、分析脚本、外部图片或 telemetry。
- 模型建议、任务名和日志片段均作为纯文本渲染。
- 报告文件权限默认为当前用户可读写，不创建 world-readable 文件。

### 11. 威胁模型

| 威胁                        | MVP 控制                                                                                               | 剩余风险                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 非本机访问                  | 无监听端口；报告是本机文件                                                                             | 同一 macOS 用户下的高权限恶意进程仍可读取用户文件       |
| 密钥泄露                    | 应用不接收 API Key；Codex auth 保持由 Codex 管理；日志与输出做 secret scan                             | 发送给模型的正文仍可能包含未识别的敏感业务信息          |
| 恶意日志与 prompt injection | 流式大小限制、内容当作数据、Codex ephemeral + ignore config/rules + empty cwd + read-only、schema 校验 | 模型可能产生误导性总结，因此所有结论必须带证据和置信度  |
| HTML/XSS                    | 纯文本转义、无脚本、严格 CSP、无远程资源                                                               | 用户手工修改报告不属于产品保证范围                      |
| 路径穿越与符号链接          | realpath containment、固定扩展名、受控相对路径、manifest-owned deletion                                | 用户主动把整个应用目录替换为恶意挂载点时不保证抵御      |
| 资源耗尽                    | 流式解析、行/事件/package 上限、超时、7 日补偿上限                                                     | 极端大日志可能产生部分报告并标记 incomplete             |
| 命令注入                    | 所有子进程使用 argv 数组，不使用 shell；日期和路径做 schema/containment 校验                           | 被替换的 `codex` 可执行文件属于本机供应链风险           |
| 供应链篡改                  | GitHub Release checksum、artifact attestation、固定构建流程、依赖锁定、secret/dependency scan          | MVP 未进行 Apple notarization，首次运行可能需要用户确认 |

### 12. 可观测性与错误处理

- 每次 run 生成本地 `runId`，日志记录阶段、状态、数量、耗时、降级原因和错误码。
- 用户错误区分：Codex
  未安装、未登录、无日志、权限不足、版本不支持、报告已最新、AI 未授权、AI
  失败、输出目录不可写。
- 解析部分失败时报告记录 completeness 和 skipped counts；窗口、schema
  或原子写入失败时不发布新 current report。
- 日志默认保留 14 天并按大小轮转；不得记录事件正文或模型输入输出。
- 产品无 telemetry、远程 crash reporting 或中央账号。

### 13. 测试与发布门禁

在发布 `v0.1.0` 前必须通过：

- `deno fmt --check`
- `deno lint`
- `deno check` 或等价 type check
- `deno test` 的 unit、integration 和适用的 e2e suite
- 现有评分与任务识别 eval
- synthetic secret、私人路径、恶意 JSONL、超大行、符号链接逃逸和 HTML 注入反例
- arm64 与 x64 编译产物生成和 SHA-256 校验
- GitHub Actions artifact attestation 生成与验证
- 干净 macOS 用户的安装、doctor、手动日报、`launchd` 调度、补偿、卸载和重装
  smoke test
- 验证前后 Codex fixture 内容、mtime 和权限一致

真实 Codex 日志、报告、prompt、response、路径和登录信息不得进入仓库、CI
artifact、PR 日志或 Release asset。

## 结果与影响

### 正面影响

- 日报核心价值可以在最小运行面上验证。
- 没有常驻端口、Web 鉴权和 daemon 生命周期，安全面显著缩小。
- 单二进制降低最终用户的运行时安装成本。
- `codex exec --ephemeral` 避免新增模型密钥管理和分析会话自污染。
- 版本化事件与报告契约保留未来迁移空间。

### 代价

- MVP 没有实时刷新、动态查询、交互纠错或跨日报趋势。
- JSON/JSONL 不适合多来源、并发访问和复杂重算；触发恢复条件后必须迁移 SQLite。
- Deno 是新的仓库工具链，需要在 CI 和贡献文档中明确安装方式。
- 未签名二进制的公开分发体验不如 notarized `.app`。
- 只依赖静态认证 headers、带凭据/query 的 base URL 或其他非白名单 provider
  字段的 Codex 配置不会被转发；该场景安全降级为指标日报。

## 备选方案

### 方案 A：Node.js/TypeScript CLI

拒绝用于最终发布产物。开发速度接近 Deno，但要么要求用户安装 Node，要么引入
SEA/bundler 打包链。MVP 的零运行时单二进制更适合
Deno。未来若生态依赖成为主导成本可重新评估。

### 方案 B：Rust CLI

拒绝用于
MVP。单二进制、安全与性能优秀，但会增加首版实现和贡献门槛。当前瓶颈是报告价值验证，不是运行性能。

### 方案 C：常驻 Node daemon + React/Vite SPA

拒绝用于
MVP，保留为交互需求出现后的演进方向。它会提前引入端口鉴权、生命周期、动态前端和升级复杂度。

### 方案 D：Python/FastAPI

拒绝。静态日报不需要 HTTP 服务，Python runtime 分发也不符合单二进制安装目标。

### 方案 E：应用自行调用模型 API并保存 Keychain 凭据

拒绝用于 MVP。它需要 provider 配置、密钥输入、Keychain
生命周期和更多失败状态。Codex-only 产品可以通过 ephemeral
子进程复用已有认证，并把模型不可用作为明确降级状态。

### 方案 F：只提供手动脚本，不安装调度

拒绝。持续自动生成是 MVP
要验证的产品行为，不是发布外壳；删除调度会把产品降为一次性 Demo。

## 后续决策触发器

- 出现第二个数据源：评审 adapter/version/completeness 契约，不自动引入插件系统。
- 出现跨日报趋势或交互纠错：评审 SQLite 事实模型和 correction overlay。
- 出现实时报表或设置 UI：评审 localhost daemon、访问控制和 React Dashboard。
- 准备面向非开发者广泛分发：评审 `.app`、签名、公证和自动升级。
