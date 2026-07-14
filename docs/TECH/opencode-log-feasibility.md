# OpenCode 本地日志适配可行性报告

> 对应 Issue：[#2](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/2)
> 对应 PRD：[AI 协作复盘台 PRD v0.2](../PRD/ai-collaboration-review-prd-v0.2.md) 第 3.3、12、17、18 节
> 调研日期：2026-07-14
> 结论状态：Phase 1 Spike，允许进入 adapter contract 设计，不允许直接进入生产实现

## 1. 结论

**推荐：将 OpenCode 标记为“版本化部分支持”，首批验证范围为 `1.14.41` 和 `1.17.14-1.17.20`。（置信度：中高）**

- `[Evidence, L1]` OpenCode 在 macOS 默认把 SQLite 数据库放在 XDG data 目录下，当前稳定渠道通常为 `~/.local/share/opencode/opencode.db`；也允许通过 `XDG_DATA_HOME`、`OPENCODE_DB` 和安装渠道改变实际位置。
- `[Evidence, L1]` 已验证版本持久化稳定 session ID、项目关联、时间戳、消息、part、工具调用、Token 分类、Skill 调用证据，以及 Subagent 所需的父子会话/`task`/`subtask` 结构证据。
- `[Local Context]` 本机只读核验同时覆盖 CLI `1.14.41`、桌面端 `1.17.14` 和同一数据库；数据库完整性通过，真实数据中存在消息、工具、Token、Skill 与事件序列结构。核验没有读取或输出提示词、回复、工具输入输出、凭据值或项目路径。
- `[Judgment]` 这些表是官方实现的内部持久化结构，不是公开稳定的数据 API；`1.14.41` 到 `1.17.14` 之间发生了数据库模块迁移和 schema 扩展，因此不能承诺“任意版本全支持”。

首期 adapter 必须满足以下限制：

1. 只用 SQLite read-only 模式打开源数据库，禁止执行迁移、修复、`VACUUM` 或任何 OpenCode 写命令。
2. 先做版本和 schema capability probe，再选择解析器；未知 schema 默认进入“不支持版本”，不能按最相近版本猜测。
3. 缺失 Token、Skill 或 Subagent 证据必须记为“不可用/未观测到”，不能写成 0 或“未使用”。
4. 生产 adapter 不复制完整原始会话，只保存统一事件、最小证据引用、完整度和不可逆项目别名。
5. `session_message`/event-sourced v2 结构只作为可选能力，首个兼容路径仍以跨两个目标版本都存在的 `session`、`message`、`part` 投影为主。

**排除：**

- 自动调用 `opencode export` 或 `opencode stats` 作为后台采集主路径：命令会启动 OpenCode 运行时并可能应用迁移，不符合源日志严格只读边界。
- 只解析日志文本文件：运行日志不是完整会话事实源，字段覆盖和保留周期不足。
- 直接解析所有 `event.data` 作为 V1 主路径：事件 payload 版本更敏感、包含大量原始内容，增加兼容和隐私风险。

**颠覆条件：** 如果后续 OpenCode 提供稳定、只读、批量且有版本承诺的本地导出 API，应优先迁移到官方接口；如果目标版本移除当前投影表或不再保留稳定 ID，则本结论必须重新评估。

## 2. Research Map

- `research_type`：可行性验证 / 技术实现
- `current_level`：L5 技术实现
- `decision_question`：OpenCode 能否通过稳定、合法、只读、版本可识别的本地 adapter 提供可信协作指标？
- `sub_questions`：
  - macOS 上数据如何发现，版本和权限如何识别？
  - session、时间、项目、消息、工具、Token、Skill、Subagent 分别有什么显式字段？
  - 如何在不修改源数据库的前提下增量读取并保证幂等？
  - 哪些能力只能部分支持，何时必须降级或拒绝解析？
- `known_context`：产品是本地单用户应用；源日志只读；Git 只允许合成 fixture；缺失字段不能伪造为 0。
- `competing_hypotheses`：
  - H1：所有目标版本均可通过稳定本地结构完整支持。
  - H2：目标版本可部分支持，但需要版本矩阵、能力探测和降级。
  - H3：当前结构过于不稳定，应暂不支持。
- `evidence_needed`：官方源码、官方 Release、官方许可证、本机只读 schema 与能力存在性核验。
- `out_of_scope`：实现生产 adapter、读取真实会话正文、设计统一事件最终 schema、确定应用技术栈。
- `stop_conditions`：路径、版本、字段、Token、增量、许可和 fixture 边界有 L1/本地证据，剩余问题可交给合成 PoC，而不是继续读取私人数据。
- `mode`：标准决策流 / feasibility spike

H1 被版本间 schema 迁移和字段差异否定；H3 被官方源码与本地只读验证否定；H2 与当前证据一致。

## 3. 调研方法与隐私边界

### 3.1 使用的证据

- OpenCode 官方仓库 `anomalyco/opencode` 的固定 Release tag 和源码。
- OpenCode 官方 GitHub Releases 与 MIT License。
- 本机安装版本、应用签名、文件元数据、SQLite DDL、索引、JSON 有效性和字段存在性。

### 3.2 明确没有读取的内容

- 提示词、回复和推理正文。
- 工具输入、工具输出、Shell 命令和文件内容。
- 真实项目名、目录、session 标题和模型凭据。
- `auth.json`、`credential.value`、account token、share secret 等敏感值。

本地验证查询只输出 `present`、`absent`、`all_valid`、版本号、DDL 和文件权限。报告不记录本机用户名、绝对项目路径、会话数量或个人使用量。

## 4. 数据发现、权限与版本识别

### 4.1 路径规则

官方 `Global.Path.data` 使用 `xdg-basedir` 的 data 目录并追加 `opencode`。macOS 默认候选为：

```text
~/.local/share/opencode/opencode.db
```

路径不能硬编码，发现顺序建议为：

1. 用户在产品设置中显式选择的数据库文件。
2. `OPENCODE_DB`：绝对路径直接使用；相对路径相对 XDG data 的 `opencode` 目录解析；`:memory:` 不可采集。
3. `XDG_DATA_HOME/opencode/opencode.db`。
4. 默认 `~/.local/share/opencode/opencode.db`。
5. 非稳定安装渠道可能使用 `opencode-<channel>.db`；仅在文件名满足安全白名单且 schema probe 通过时列为候选。

`OPENCODE_CONFIG_DIR` 只改变配置目录，不改变数据库 data 目录。adapter 不应自动读取配置文件来寻找凭据。

### 4.2 权限状态

本机样本的数据库和父目录允许当前账户读取，但数据库文件模式为 `0644`，父目录为 `0755`。这说明：

- 当前用户读取不需要 Full Disk Access。
- 如果用户 home 目录同样可遍历，其他本地账户可能读取数据库；这是需要在产品状态页提示的上游文件权限风险。
- adapter 必须拒绝跟随指向非当前用户所有文件的异常 symlink，并验证数据库 owner 与当前有效用户一致。
- 无权限时返回 `permission_denied`，不得尝试 `chmod`、复制或提权。

推荐的只读打开参数：

```text
SQLite URI: file:<resolved-path>?mode=ro
PRAGMA query_only = ON
PRAGMA busy_timeout = 5000
```

不要设置 `immutable=1` 读取仍在运行的源数据库；该参数会忽略 WAL 变化。读取应使用短事务，让 SQLite 给出一致快照，同时避免长期占用 WAL reader。

### 4.3 版本识别

版本证据按优先级组合，不互相覆盖：

| 来源 | 用途 | 限制 |
| --- | --- | --- |
| `session.version` | 判断每条历史 session 由哪个 OpenCode 版本写入 | 同一数据库可能包含多个版本 |
| CLI `opencode --version` | 识别 PATH 中 CLI | 可能与桌面端不同 |
| `/Applications/OpenCode.app/Contents/Info.plist` | 识别桌面应用版本 | 不代表每条历史记录版本 |
| schema capability fingerprint | 决定可读取哪些字段 | 必须与版本一起判断 |

本机同时存在 CLI `1.14.41` 和桌面端 `1.17.14`，证明不能用单个安装版本替代 row-level `session.version` 与 schema probe。

## 5. 版本与 schema 矩阵

| 版本 | 官方发布日期 | 持久化能力 | Token 能力 | 建议状态 |
| --- | --- | --- | --- | --- |
| `1.14.41` | 2026-05-07 | `session`、`message`、`part` 和不含 `seq` 的 `session_message`；v1 message/part schema 包含工具、reasoning、subtask；没有 `event_sequence` | assistant message 和 `step-finish` 有分类 Token；没有 session 级 usage migration | 部分支持；按 message/step 汇总并标注口径 |
| `1.17.14` | 2026-07-06 | legacy 投影保留；数据库实现迁到 core；`event_sequence`、`session_message.seq` 与更多投影索引可用 | `session` 增加 input/output/reasoning/cache read/cache write 汇总 | MVP 支持；仍需逐行完整度校验 |
| `1.17.15-1.17.20` | 2026-07-07 至 2026-07-13 | 固定 Release tag 的路径、session 表和 v2 message 相关源码对象与 `1.17.14` 相同 | 与 `1.17.14` 相同 | MVP 支持；已逐 tag 做相关源码对象核验 |
| `<1.14.41` | 未验证 | 未建立兼容证据 | 未建立兼容证据 | 暂不支持 |
| `>1.17.20` | 未验证 | 先做 capability probe | 先做 capability probe | 默认不支持；新增 fixture 后再放行 |

版本放行不能只比较 semver。至少要求以下 schema fingerprint：

- `session(id, project_id, version, time_created, time_updated)`
- `message(id, session_id, time_created, time_updated, data)`
- `part(id, message_id, session_id, time_created, time_updated, data)`
- JSON1 可用，且抽样的 `message.data`/`part.data` 为合法 JSON
- 外键和关键 ID 列类型符合预期

`tokens_*`、`session_message.seq`、`event_sequence` 等作为 capability flag，不作为所有版本的硬性必需列。

## 6. 字段可用性矩阵

| 产品字段 | OpenCode 证据 | 可用性 | adapter 规则 |
| --- | --- | --- | --- |
| 数据源实例 | 解析后的数据库 canonical path + owner + schema fingerprint | 可用 | 只保存不可逆实例 ID，不保存 home 绝对路径 |
| session | `session.id` 主键 | 可用 | `source_session_id` 稳定去重 |
| session 版本 | `session.version` | 可用 | row-level 版本优先 |
| 父子 session | `session.parent_id` | 条件可用 | 非空才形成 Subagent 证据；空不等于未使用 |
| session 时间 | `time_created`、`time_updated`、`time_archived` | 可用 | epoch millisecond；统一转换时保留源时区未知事实 |
| 项目 | `session.project_id`、`project.id`、`directory`/`worktree` | 可用但敏感 | 默认生成本地项目别名；不复制完整路径到报告 |
| 消息角色 | `message.data.role` | 可用 | 只接受已知 `user`/`assistant`；未知类型保留原始类型标记 |
| 消息时间 | message row 时间 + message JSON 内时间 | 可用 | 优先结构内语义时间，row 时间用于游标和异常检测 |
| 消息正文 | text part / v2 message text | 条件可用、敏感 | 指标扫描不持久化正文；语义分析走独立授权流程 |
| reasoning | `part.type = reasoning` 与 start/end | 条件可用 | 只能表明显式 reasoning part；不推断模型“思考质量” |
| 工具调用 | `part.type = tool`、`tool`、state、start/end | 可用 | 统计名称、状态、时间；默认丢弃 input/output |
| Skill | `tool = skill`，输入中含 Skill 名称 | 条件可用 | 可计调用；Skill 名称属于内容字段，默认做本地标准化/脱敏 |
| Subagent | `tool = task`、`part.type = subtask`、`parent_id`、agent | 条件可用 | 需要至少一个显式结构证据；父子关系优先 |
| Agent | user/assistant `agent`、session `agent` | 条件可用 | 区分主 Agent 与 Subagent；自定义名称可能敏感 |
| Token | assistant/step/session 的 input、output、reasoning、cache read/write | 条件可用 | 每类单独保存可用性；禁止缺失补 0 |
| cost | assistant/session `cost` | 条件可用 | V1 产品不依赖成本；币种/定价口径不明确时不聚合 |
| Todo | `todo` 表 | 条件可用 | 可作为任务推断弱证据，不等于实际完成 |
| 文件变更 | summary/patch/snapshot 字段 | 条件可用、敏感 | 只提取计数/验证信号；不复制 diff、文件名或路径 |

## 7. Token 口径

OpenCode 已验证结构将 usage 归一为：

- `input`
- `output`（可见输出）
- `reasoning`
- `cache.read`
- `cache.write`

`1.17.14` 的 session usage migration 从 assistant message 汇总这些分类；运行时继续从 `step-finish` 更新 session 汇总。官方 `stats` 也使用 session 汇总，但在不同展示场景中可能把 reasoning 合并到 output，或把五类相加计算每 session 总量。

迁移会用 `coalesce(..., 0)` 回填 session usage。对于由旧版本写入、分类字段可能缺失的历史 message，session 列中的 `0` 不能单独证明“明确观测到 0”；adapter 必须结合 row-level `session.version` 和 message/step JSON 字段存在性决定各分类的 `available` 状态。

本产品不得复刻这种展示歧义。统一规则为：

1. 原样保存五个分类和每个分类的 `available` 状态。
2. `reported_total` 仅在参与计算的分类都明确可用时计算；公式和 included categories 必须随结果保存。
3. 如果源只提供部分分类，展示分项和完整度，不生成伪完整总量。
4. 不同 provider 可能对缓存 Token 的包含关系不同；跨工具总览必须标注“不完全可比”。
5. 重复使用 session 汇总与 message 汇总时，只选择一个主口径，不能两者相加。推荐 `1.17.14+` 以 session 汇总作为校验值、message/step 作为时间分配依据。

## 8. 增量读取与去重设计

### 8.1 一致性读取

1. 解析并校验 canonical path、owner、regular-file、symlink 和权限。
2. 以 SQLite `mode=ro` 打开，立即设置 `query_only`。
3. 在短 read transaction 中读取 schema fingerprint 和本批数据。
4. 遇到 `SQLITE_BUSY` 时退避重试；达到上限后返回可恢复状态，不复制源数据库。
5. 每批限制 session 数和事务时长，避免长时间阻止 WAL checkpoint。

### 8.2 首次扫描

- 以 `(session.time_created, session.id)` 稳定分页。
- 对每个 session 按 `(message.time_created, message.id)` 读取 message。
- 通过 `part.message_id`/`part.session_id` 索引读取 part。
- 每条投影记录以稳定源 ID upsert，不按扫描批次 append。

### 8.3 增量扫描

优先策略：

- 如果存在 `event_sequence`，只读取能通过 `event_sequence.aggregate_id = session.id` 连接到 session 的 `aggregate_id` 和 `seq`，与本地 checkpoint 比较；发生变化的 session 重新读取其投影表。`1.17.14-1.17.20` 的 session durable event 以 session ID 作为 aggregate ID，但 adapter 不得把无法连接到 session 的其他 aggregate 猜成 session，也不需要解析 `event.data`。
- 如果存在 `session_message.seq` 且有数据，可按每 session 最大 seq 增量读取 v2 投影，但仍通过 schema version 解码。

兼容回退：

- 对没有可靠 sequence 的版本，使用 `message.time_updated`、`part.time_updated` 与稳定 ID 的复合水位，保留重叠窗口，并周期性重扫活跃 session。
- session 级 `time_updated` 只能作为候选过滤，不能作为唯一真相；usage projector 可能有意保持 session 更新时间不变。
- 定期做低频全量 ID reconciliation，处理删除、归档和漏掉的同毫秒更新。

### 8.4 幂等键与更新

```text
source_instance_id = hash(canonical_db_identity)
session_key        = (source_instance_id, session.id)
message_key        = (source_instance_id, message.id)
part_key           = (source_instance_id, part.id)
event_key          = (source_instance_id, entity_type, stable_id, semantic_kind)
```

- 同一 key 重扫必须 upsert，不增加计数。
- 相同 ID 内容发生变化时更新派生记录并标记受影响报告窗口重算。
- 内容 fingerprint 只覆盖允许保存的标准化字段，不能把原文 hash 当成可公开证据。
- 删除检测必须软删除派生记录并保留来源审计；绝不回写 OpenCode。

## 9. Skill 与 Subagent 判定边界

### 9.1 Skill

强证据：完成或失败的 `tool` part，且工具名为 `skill`。输入中的 Skill 名称只能在本地解析，报告默认展示标准化名称或用户批准的别名。

以下情况不算 Skill 使用：

- 提示词里提到“skill”。
- 只发现本地 Skill 文件但没有调用记录。
- tool part 仍为 pending 且没有执行证据。

### 9.2 Subagent

证据从强到弱：

1. child session 的 `parent_id` 指向 parent session。
2. parent session 存在完成/运行/失败的 `task` tool，metadata 关联 child session。
3. 明确的 `subtask` part，包含 agent 和描述结构。
4. agent mode/name 但无父子或 task 证据，只能标记“Agent 参与”，不能认定 Subagent。

本机样本没有父子 session 或 task/subtask 实例，只能证明 schema 支持该能力，不能证明用户实际使用过或未使用过。

## 10. 许可与合规边界

- `[Evidence, L1]` OpenCode 官方仓库采用 MIT License，允许使用、修改和再分发软件实现，但复制 substantial portions 时必须保留版权与许可声明。
- 本项目只实现独立的 read-only adapter 和 schema compatibility tests，不复制 OpenCode runtime、数据库库代码或真实用户数据。
- 源码位置和字段名可以作为互操作证据；如果未来复制上游代码片段，应在 `THIRD_PARTY_NOTICES` 中保留 MIT notice。
- MIT License 不构成 schema 稳定性承诺，也不替代用户对本地日志的授权。首次启用 OpenCode 数据源时仍需明确说明读取范围。
- `session_share.secret`、account/control token、credential 和 auth 文件不属于产品需求，adapter 必须显式 denylist，任何版本都不得导入。

## 11. Fallback 与产品状态

| 条件 | 状态 | 用户可见行为 |
| --- | --- | --- |
| 文件不存在 | `not_found` | 展示候选路径来源和重新检测 |
| 无读取权限 | `permission_denied` | 说明权限，不自动修改 |
| DB 被占用 | `temporarily_unavailable` | 退避重试，保留上次成功时间 |
| 版本与 schema 受支持 | `ready` | 展示版本、能力和完整度 |
| 部分字段缺失 | `partial` | 只展示可用指标，缺失项为“不可用” |
| 未知版本/schema | `unsupported_version` | 停止解析；只允许用户主动导出匿名 schema fingerprint 后自行提交，V1 不自动上传 |
| JSON 损坏或完整性失败 | `invalid_source` | 停止本批，不尝试修复源 DB |

如果 OpenCode adapter 不可用，整个产品仍应正常运行其他数据源；OpenCode 卡片显示原因而不是 0。

## 12. 最小 PoC 入口与退出条件

后续实现 Issue #10 前，使用合成 fixture 完成以下 PoC：

1. read-only 打开 `1.14.41` 与 `1.17.14` 合成 SQLite。
2. capability probe 生成相同的标准化字段集合和不同的完整度。
3. 首次扫描、重复扫描、part 更新、同毫秒记录和删除 reconciliation 幂等。
4. Token 主口径与校验口径不重复计数。
5. 未知列、缺列、未知 JSON type、WAL busy、permission denied 均 fail closed；记录级未知 type 不猜测其内容，整库未知 schema 才停止数据源解析。
6. privacy scan 证明 fixture 不含真实路径、提示词、回复、工具输出或 secret。

合成 fixture 规范见 [OpenCode 合成 Fixture 契约](../TESTS/opencode-synthetic-fixture-contract.md)。

## 13. Scope Drift Check

1. 当前仍在回答 OpenCode read-only adapter 可行性：是。
2. 新增子问题：本机数据库权限过宽风险；已转为 adapter 状态检查，不扩展为上游安全修复。
3. 被降级结论：不能声称所有 OpenCode 版本全支持。
4. competing hypotheses：H2 保留，H1/H3 排除。
5. out-of-scope 未变化：没有实现生产 adapter 或读取真实正文。
6. Research Map 无需更新。
7. 当前进度：Spike 收敛，预期置信度中高；生产可靠性仍需合成 PoC。

## 14. 官方证据索引

以下均为 L1 来源，固定到验证版本或官方 Release：

- [OpenCode repository](https://github.com/anomalyco/opencode)
- [v1.14.41 Release](https://github.com/anomalyco/opencode/releases/tag/v1.14.41)
- [v1.17.14 Release](https://github.com/anomalyco/opencode/releases/tag/v1.17.14)
- [v1.17.20 Release](https://github.com/anomalyco/opencode/releases/tag/v1.17.20)
- [MIT License at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/LICENSE)
- [Global XDG paths at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/core/src/global.ts)
- [Database path and channel selection at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/core/src/database/database.ts)
- [Session/message/part tables at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/core/src/session/sql.ts)
- [Session usage migration at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/core/src/database/migration/20260510033149_session_usage.ts)
- [V2 session message schema at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/schema/src/session-message.ts)
- [Legacy message/part schema at v1.14.41](https://github.com/anomalyco/opencode/blob/v1.14.41/packages/opencode/src/session/message-v2.ts)
- [Skill tool at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/opencode/src/tool/skill.ts)
- [Task/Subagent tool at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/opencode/src/tool/task.ts)
- [Official sanitized export implementation at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/opencode/src/cli/cmd/export.ts)
- [Official stats Token semantics at v1.17.14](https://github.com/anomalyco/opencode/blob/v1.17.14/packages/opencode/src/cli/cmd/stats.ts)
