# WorkBuddy 本地数据适配可行性报告

> 对应 Issue：[#3](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/3)
> 验证日期：2026-07-14
> 验证版本：macOS WorkBuddy `5.2.5`
> 结论：技术上部分可读，但因许可边界，V1 暂不支持自动接入

## 1. 决策结论

WorkBuddy `5.2.5` 在 macOS 本地保存了可识别的 session、时间、工作区、trace、工具调用和 Token 分类字段。只从技术角度看，可以构建一个版本化、只读、完整度感知的 adapter；但当前不能把它作为 V1 可发布能力。

阻塞原因不是数据缺失，而是官方许可边界：腾讯云代码助手《软件许可及服务协议》只授予个人、不可转让、非排他的使用许可，并明确限制对软件运行数据的复制、修改、挂接以及通过未经授权的第三方软件或插件使用软件。官方文档也未提供面向第三方的本地 schema、导出 API 或互操作许可。

因此本 Spike 排除 H1“可稳定支持”和 H2“可直接以版本化部分支持发布”，保留 H3：

- 产品状态：`unsupported`，reason code 为 `policy_restriction`
- V1 行为：可检测安装和版本，但不打开 WorkBuddy 数据文件，不展示伪造的 0
- 解锁条件：官方 API/可移植导出、腾讯书面许可，或经正式法律评估确认的其他依据
- 技术置信度：中；只验证了一个安装版本，且公开 changelog 尚未形成 schema 契约
- 发布判断置信度：高；官方协议给出了直接反证

本报告不是法律意见。它是仓库的工程发布门禁：在解锁条件满足前，不实现或分发生产 WorkBuddy adapter。

## 2. 授权与验证边界

用户授权的本机验证范围仅包括：

- 文件名、权限、格式和版本元数据
- SQLite DDL/schema、JSON key、字段存在性和不可识别的聚合计数
- 只读关联、完整度、稳定 ID 和 Token 数值关系校验

验证没有输出或提交真实提示词、回复、工具输入输出、任务标题、项目路径、用户 ID、凭据、连接器配置或字段值。没有检查打包源代码、逆向私有协议、调用本地服务或复制数据库。所有查询使用 SQLite `-readonly` 和 `PRAGMA query_only=ON`；源库完整性检查返回 `ok`。

## 3. 版本与安装证据

| 项目 | 观测结果 | 证据等级 |
| --- | --- | --- |
| 应用版本 | `5.2.5` | `[Local Context, L1]` 签名应用元数据 |
| Bundle ID | `com.workbuddy.workbuddy` | `[Local Context, L1]` `Info.plist` |
| 签名 | Tencent Technology，Team ID `FN2V63AD2J`，已 notarize | `[Local Context, L1]` Apple codesign |
| 应用构建 | commit `1067a2de1b2fbf95e4bf70e23a6585d9171cf851`，2026-07-08 | `[Local Context, L1]` 产品 manifest |
| 数据目录声明 | `.workbuddy` | `[Local Context, L1]` 产品 manifest |
| 官方公开 changelog | 验证时可见到 `5.2.3`（2026-07-06），未找到 `5.2.5` 条目 | `[Evidence, L1]` 官方文档 |

`5.2.5` 的安装真实性可以确认，但公开 changelog 与本机版本存在时间差，且官方没有发布 schema 版本号。因此不能把应用版本等同于稳定的数据契约版本。

## 4. 只读数据发现

### 4.1 当前格式

`5.2.5` 的主要候选位于：

```text
~/.workbuddy/
├── workbuddy.db
├── traces/<runtime-bucket>/trace_<file-id>.json
├── tasks/<session-id>/<sequence>.json
├── artifact-index/<artifact-id>.json
└── app/sessions.json
```

`workbuddy.db` 使用 SQLite WAL，包含 session、workspace、session usage 和 automation 相关结构。trace JSON 的根对象是 `trace` 与 `spans`，可以通过 session ID 与数据库 session 关联。

产品 manifest 只声明默认目录 `.workbuddy`。官方文档和 manifest 中未发现用户可配置数据根的公开契约，因此 V1 只能识别该默认目录，不能扫描任意候选路径或从进程参数推断配置。

### 4.2 遗留格式

本机还存在旧目录：

```text
~/Library/Application Support/WorkBuddy/codebuddy-sessions.vscdb
```

它是 `user_version=1` 的 SQLite KV 库，样本值只有 session 元数据字段。由于无法把它可靠映射到具体 WorkBuddy 版本，也没有公开迁移契约，V1 不应解析该格式。

### 4.3 权限风险

本机观测到数据根目录为 `0755`，数据库、WAL 和 trace 文件为 `0644`。这意味着同一台 Mac 的其他本地账户可能读取文件，具体仍受父目录权限和 macOS 隐私控制影响。

未来若许可门禁解除，adapter 必须校验 canonical path、regular file、owner、symlink 和权限；权限过宽时展示风险，不能自动修改 WorkBuddy 文件权限。

## 5. 字段能力矩阵

| 能力 | `5.2.5` 结构证据 | 完整度判断 | 产品约束 |
| --- | --- | --- | --- |
| Session ID | DB session ID；trace session ID | 可用，但 trace 不是全覆盖 | 只保存 source-scoped ID |
| 创建/更新时间 | DB create/update/last activity；trace start/end | 可用 | 统一为带来源的时间事件 |
| 项目/工作区 | DB workspace/cwd | 可用但敏感 | 仅保存本地 hash/别名；默认不导出原路径 |
| 任务标题/状态 | DB title/status | 可用但标题含内容 | 标准指标扫描只读状态；标题需语义分析授权 |
| 消息与回复 | 未发现公开、稳定的消息 schema；trace 含部分执行信息 | 不可作为完整会话源 | 不猜测，不从 tool input/output 还原消息 |
| 工具调用 | span tool name、status、start/end、parent ID | 部分可用 | tool input/output/error 明确 denylist |
| Token | trace total；model info 的 input/output/cached/call count | 部分可用 | 保留分项、来源总数和 available 状态 |
| 积分/配额 | DB session usage 的 used/size/credit map | 可用但不是 Token | 不映射为 Token；仅在口径明确后单列积分 |
| Skill | 结构性抽样中存在明确 `skill` 工具名 | 部分可用 | 只有已结束调用才作为使用证据 |
| Subagent | Agent 名、parent span 和少量 task-like tool 候选 | 证据不足 | span 父子关系不等于 Subagent，不计入成熟度 |
| 自动化 | DB 有 schedule/run/runtime 状态 | 部分可用且高敏感 | prompt、结果和 cwd 均不读取；V1 不接入 |
| 产物 | artifact index 和 automation run 中有 artifact 元数据 | 部分可用且高敏感 | local path、URL、内容和结果正文不读取 |

## 6. 本机结构验证结果

验证只记录不可逆聚合，不保存任何 ID 或内容：

- 30 个未删除 session 中，19 个能关联至少一个 trace，11 个没有 trace。
- 64 个可解析 trace 均有 start/end、source total Token 和 span 数组。
- 28/64 个 trace 至少有一个 tool name；36/64 没有。
- 9/64 个 trace 存在明确 `skill` tool；5/64 存在 task-like Subagent 候选，但后者不足以确认 Subagent。
- trace ID 和 span ID 在本批 2,228 个唯一 ID 中没有跨文件重复。
- trace 文件名中的 ID 与 trace 内部 ID 在 64/64 个样本中均不同，不能使用文件名代替源 trace ID。
- 63/64 个 trace 的 source total 等于 input + output；1 个不相等。
- 45/64 个 trace 的 source total 等于 input + output + cached；说明 cached 不能被无条件再加到总数中。

这些结果证明结构可用，也证明字段存在不等于全量覆盖。缺失 trace、tool 或 Token 分类必须显示“不可用/部分可用”，不能转成 0。

## 7. Token 口径

官方积分文档明确：积分用于衡量资源消耗，消耗取决于模型 Token 定价和任务复杂度。积分不是 Token 数。

因此候选 adapter 只能使用 trace `modelInfo` 的 Token 字段：

- input Token
- output Token
- cached Token
- source-reported total Token
- call count

归一规则：

1. 不把 `session_usage.used`、`size` 或 credit map 命名为 Token。
2. source-reported total 与分类分开保存，不自行选择一个在所有 trace 上都不成立的公式。
3. cached 是否已包含在 input 中保持来源语义，不重复相加。
4. reasoning、cache write 等未观察到的分类标记为 unavailable，不补 0。
5. trace 缺失的 session 不生成 Token 记录。
6. 跨工具总览必须展示 WorkBuddy 的口径与完整度，不声称完全可比。

## 8. 增量与幂等设计候选

以下设计只作为未来解锁后的技术候选，不授权当前实现：

1. 以 SQLite `mode=ro` 打开，设置 `query_only`，在短事务内读取 session watermark。
2. 对 WAL busy 使用退避；不 checkpoint、不修复、不复制源库。
3. DB 游标使用 `(updated_at, session_id)`，保留重叠窗口并周期性 reconciliation。
4. trace 先按文件 mtime/size 找候选，再解析内部 `traceId`/`spanId` 做幂等 upsert。
5. 文件名 ID 不参与实体键；删除检测只软删除本产品派生记录。
6. 未知 schema fingerprint、字段类型变化、损坏 JSON 或无法关联的 trace 均 fail closed。

建议键：

```text
session_key = (source_instance_id, source_session_id)
trace_key   = (source_instance_id, source_trace_id)
span_key    = (source_instance_id, source_trace_id, source_span_id)
```

## 9. 隐私 denylist

即使未来得到许可，adapter 也不得在标准指标扫描中读取或保存：

- user ID、worker hostname/PID、账号与 connector credentials
- cwd、workspace path、local path、artifact URL
- session title/custom title、automation name/prompt
- tool input、tool output、error 正文
- run result、message content、artifact 内容
- app session 中的 user ID 和 work directory
- 任何 access token、authorization header、cookie、secret 或 share credential

进程命令行可能带临时授权值，因此发现流程不得采集或记录 WorkBuddy 进程参数。版本应从签名应用元数据和 product manifest 获取。

## 10. 许可与合规边界

`[Evidence, L1]` 官方《腾讯云代码助手软件许可及服务协议》包含以下与本项目直接相关的限制：

- 软件许可是个人、不可转让、非排他的，未明示授权权利由腾讯保留。
- 除非法律允许或取得书面许可，不得反向工程、反向汇编、反向编译或尝试发现源代码。
- 不得对软件运行过程中的数据进行复制、修改、增加、删除、挂接运行或创作衍生作品。
- 不得通过未经腾讯云授权的第三方软件、插件或外挂登录或使用软件。
- 新版本可能替换、修改或限制功能，官方不保证旧版本持续可用。

本 Spike 没有检查打包源代码或私有协议，但公开发布一个自动读取 WorkBuddy 运行数据的第三方 adapter 仍会直接碰到上述限制。源文件只读不能自动消除许可问题。

`[Evidence, L1]` 官方“数据管理”文档只描述归档、取消归档和删除；“任务对话”描述分享与历史查看。验证时未找到面向第三方的本地数据导出/API 契约。

## 11. Fallback 与用户可见状态

| 条件 | 状态 | 用户可见行为 |
| --- | --- | --- |
| 未安装 WorkBuddy | `not_found` | 展示重新检测 |
| 检测到版本但许可未解锁 | `unsupported` + `policy_restriction` | 说明暂不读取，不显示 0 |
| 未来出现官方 API/导出 | `integration_review_required` | 重新做许可、版本和隐私 Spike |
| 未来取得书面许可 | `implementation_blocked` | 仍需合成 PoC 和 ADR 批准后才实现 |
| 未知版本/schema | `unsupported_version` | fail closed，不上传 schema 或数据 |

整个产品必须继续运行其他数据源。WorkBuddy 卡片显示检测到的应用版本、阻塞原因和解锁条件，不读取数据目录。

## 12. 合成 Fixture 入口

合成规范见 [WorkBuddy 合成 Fixture 契约](../TESTS/workbuddy-synthetic-fixture-contract.md)。它只用于验证 fallback、隐私 denylist 和未来可能的 compatibility probe，不代表已经批准生产 adapter。

## 13. Scope Drift Check

1. 当前仍在回答 WorkBuddy read-only adapter 是否可发布：是。
2. 新发现的许可限制直接决定发布可行性，不是范围外问题。
3. 技术结论从“可能版本化部分支持”降级为“技术部分可读、政策暂不支持”。
4. H1/H2 被官方协议反证排除，H3 保留。
5. 没有实现 adapter、读取会话正文、检查打包源代码、调用私有服务或提交真实数据。
6. 停止条件已满足；继续解析更多本地内容不会改变当前发布决策，且没有合理 ROI。

## 14. 官方证据索引

- [WorkBuddy 产品页](https://www.codebuddy.cn/work/)
- [WorkBuddy 更新日志](https://www.codebuddy.cn/docs/workbuddy/Changelog)
- [WorkBuddy 积分说明](https://www.codebuddy.cn/docs/workbuddy/Credits)
- [WorkBuddy 用量查看](https://www.codebuddy.cn/docs/workbuddy/Usage)
- [WorkBuddy 任务对话与隐私说明](https://www.codebuddy.cn/docs/workbuddy/Conversation)
- [WorkBuddy 任务管理](https://www.codebuddy.cn/docs/workbuddy/Task-Management)
- [WorkBuddy 数据管理](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Data)
- [腾讯云代码助手软件许可及服务协议](https://www.codebuddy.cn/agreement/)
- [腾讯隐私协议](https://privacy.qq.com/document/preview/284d799a07164d09bfc7cedd0ec3e089)
