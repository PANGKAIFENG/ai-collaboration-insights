# Qoder 本地数据适配可行性报告

> 对应 Issue：[#4](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/4)
> 验证日期：2026-07-14
> 验证版本：macOS Qoder IDE `1.13.0`
> 结论：因许可边界，V1 不支持本地数据自动接入

## 1. 决策结论

Qoder IDE 的安装和版本可以通过签名应用元数据检测，但本 Spike 不读取其本地数据目录，也不验证任何会话、消息、工具调用、Token、Skill 或 Subagent 字段。

阻塞原因是官方许可边界。Qoder Terms of Service 明确禁止 reverse engineering，以及手工或自动 scrape、mine、distil 服务中的 information、data 或 content；同时将 technical logs、使用和交互数据定义为 Usage Data，并声明相关权利归 Qoder。用户对本机的操作授权不能替代产品许可或授权公开分发第三方 adapter。

因此当前决策为：

- 产品状态：`unsupported`，reason code 为 `policy_restriction`
- V1 行为：只检测 Qoder IDE 是否安装及其版本，不打开 Qoder 数据目录，不展示伪造的 0
- 本地分析能力：session、时间、项目、消息、工具、Token、Skill、Subagent 均为 `unavailable` 或 `unverified`
- 解锁条件：Qoder 官方本地 API/可移植导出、Qoder 书面许可，或经正式法律评估确认的其他依据
- 替代路径：Qoder Teams OpenAPI 可作为未来独立的 `qoder-teams-api` connector 评估，不能与本地 adapter 混合
- 产品隔离：QoderWork 是独立产品，不属于本 Issue 的 Qoder IDE adapter 范围
- 发布判断置信度：高；官方条款已给出直接反证
- 本地数据能力置信度：不适用；未打开或检查数据源

本报告不是法律意见。它是当前仓库的工程发布门禁：在解锁条件满足前，不实现或分发生产 Qoder 本地 adapter。

## 2. 授权与验证边界

本 Spike 只使用以下不涉及用户数据的产品级元数据：

- 应用路径、版本、Bundle ID、签名与 notarization 状态
- product manifest 中的产品版本、构建版本、默认数据目录名称和许可声明
- Qoder 官方 Terms、Teams OpenAPI 与 Analytics 文档

验证明确没有：

- 打开 `~/Library/Application Support/Qoder`、`~/.qoder` 或其他 Qoder 数据目录中的任何文件
- 读取日志、数据库、会话、消息、工具输入输出、项目路径、账号或凭据
- 采集进程参数、调用本地服务、探测私有协议或检查打包源码
- 逆向应用、复制 Usage Data，或从真实数据制作 fixture

目录是否存在及顶层权限只作为预先确认的环境元数据记录，不代表本项目获准进入目录或读取其中内容。

## 3. 产品与版本边界

### 3.1 Qoder IDE

| 项目 | 已确认结果 | 用途 |
| --- | --- | --- |
| 应用 | `/Applications/Qoder.app` | 仅用于安装检测 |
| 应用版本 | `1.13.0` | 展示检测版本 |
| Bundle ID | `com.qoder.ide` | 产品识别 |
| 签名方 | Alibaba.com Singapore E-Commerce | 签名校验 |
| Team ID | `T27K5A5ZWD` | 签名校验 |
| notarization | 已通过 | 安装真实性证据 |
| internal version | `1.106.3` | 构建元数据，不作为数据契约 |
| commit | `fe803ba3c527aaf6c7ea7a3bd4223743df665f15` | 构建元数据 |
| build date | `2026-07-08T02:58:49.504Z` | 构建元数据 |
| data folder name | `.qoder` | 只记录 manifest 声明，不打开目录 |
| server data folder name | `.qoder-server` | 只记录 manifest 声明，不探测目录 |
| product license | `Proprietary` | 发布门禁依据 |

本机还确认 `~/Library/Application Support/Qoder` 与 `~/.qoder` 存在，权限分别为 `0700` 和 `0755`。这些信息不形成 schema 证据，adapter 在政策门禁下对两处目录的 open count 必须为 0。

应用包内某个 `package.json` 的 `MIT` 只能视为 Code-OSS shell 或组件元数据，不能覆盖 product manifest 的 `Proprietary` 声明和 Qoder Terms。

### 3.2 QoderWork

本机另有独立应用 `/Applications/QoderWork.app`：

- 版本：`0.6.5`
- Bundle ID：`com.qoder.work`

QoderWork 不是 Qoder IDE 的别名、旧版本或数据源 fallback。本 Issue 不读取、探测或归并 QoderWork 数据；产品检测必须通过 Bundle ID 隔离两者。

## 4. 本地能力矩阵

由于许可门禁在 schema 检查前已经成立，本 Spike 没有本地字段证据。字段缺乏证据必须显示为不可用或未验证，不能以 0、空数组或推测字段代替。

| 能力 | 当前状态 | 产品行为 |
| --- | --- | --- |
| 安装检测 | `available` | 读取签名应用元数据，不进入数据目录 |
| 版本检测 | `available` | 展示应用版本与支持状态 |
| Session ID / 会话数 | `unavailable` | 不读取、不估算、不显示 0 |
| 会话时间范围 | `unavailable` | 不从文件时间或进程活动推断 |
| 项目/工作区 | `unavailable` | 不读取路径，不扫描工程目录 |
| 消息与回复 | `unavailable` | 不读取内容，不从缓存还原 |
| 工具调用 | `unverified` | 无 schema 证据，不猜测 |
| Token 分类/总量 | `unverified` | 无可信本地来源，不把 Credits 当 Token |
| Skill | `unverified` | 不按字符串或工具名推断 |
| Subagent | `unverified` | 不按父子记录或 Agent 名推断 |
| 任务/产物 | `unavailable` | 不读取标题、文件、URL 或内容 |

这意味着 Qoder IDE 在 V1 数据看板中只能显示“已检测，但因政策限制暂不读取”。它不能参与使用频次、Token、会话数、L1-L4 成熟度或工作成果汇总。

## 5. Token 与 Credits 口径

本 Spike 没有确认 Qoder IDE 本地 Token 字段。任何 Credits、quota、usage unit 或模型计费事件都不能直接命名为 Token。

统一口径要求：

1. `credits` 必须作为来源原始计费单位单独保存。
2. 没有官方换算契约时，不从 Credits 推算 input、output、cached 或 reasoning Token。
3. Token 能力返回 `unverified` 或 `unavailable`，不能补 0。
4. 跨工具总览必须标注单位与来源，不能把 Credits 加入 Token 总和。
5. 即使未来 Teams API 可用，其 Credits usage events 也仍不等于 Token。

## 6. 许可与合规边界

`[Evidence, L1]` Qoder Terms of Service（更新日期 2026-04-29）与本项目直接相关的条款包括：

- 3.2.9：禁止 reverse engineering。
- 3.2.10：禁止手工或自动 scrape、mine、distil 服务中的 information、data 或 content。
- 5.2：technical logs、使用及交互数据属于 Usage Data，相关权利归 Qoder。

只读访问、数据位于用户电脑、数据不上传或用户口头授权，均不能自动消除上述产品许可约束。公开分发自动读取工具需要独立的许可依据。

因此本项目采用 fail closed：只要没有明确解锁证据，就不读取目录、不尝试兼容 schema、不从 UI、文件系统活动或进程信息侧推使用数据。

## 7. Qoder Teams OpenAPI 替代路径

Qoder Teams 提供官方 OpenAPI 和 Analytics 能力，可作为未来独立 connector 的调研入口：

- AI Code Metrics：AI code stats、daily trends、member ranking
- change/commit 数据：repository、file extension、commit attribution 与 CSV export
- usage 数据：conversation ID，以及 Agent、NEXT、QUEST、INLINECHAT 等来源
- Credits usage events：事件时间、operation、source 与 model tier

它有明确边界：

- 需要 Teams/Enterprise API key，面向组织管理员或集成负责人
- Credits 不是 Token
- 不提供完整会话内容
- 没有可信的 Skill 或 Subagent 使用证据
- 不适合作为 V1 单用户本地 adapter 的 fallback

未来若立项，应使用独立 source ID `qoder-teams-api`、独立授权流程、独立数据模型和独立 Issue。不得在 Qoder IDE 卡片检测到本地安装后自动请求 Teams API，也不得将 Teams 组织数据伪装成本地个人数据。

## 8. 隐私与安全约束

即使未来许可门禁解除，本地 adapter 或 Teams connector 也必须拒绝保存或输出：

- API key、Authorization header、cookie、access token 与 refresh token
- 用户 ID、组织 ID、邮箱、设备 ID、安装 ID
- workspace、repository、文件与本地绝对路径
- prompt、response、会话标题与完整会话内容
- tool input/output/error、产物内容与 URL
- 进程命令行、环境变量和本地服务凭据

版本发现不得采集 Qoder 或 QoderWork 进程参数。任何异常、snapshot、fixture、PR 日志和测试报告都必须遵守同一 denylist。

## 9. Fallback 与用户可见状态

| 条件 | 状态 | 用户可见行为 |
| --- | --- | --- |
| 未安装 Qoder IDE | `not_found` | 展示重新检测，不探测数据目录 |
| 检测到受观测版本 | `unsupported` + `policy_restriction` | 显示版本、阻塞原因和解锁条件，不显示指标 0 |
| 未知或未来版本 | `unsupported_version` | fail closed，不尝试 schema 猜测 |
| 只检测到 QoderWork | `not_found` | 不把 QoderWork 归入 Qoder IDE |
| 官方本地 API/导出出现 | `integration_review_required` | 重新做许可、隐私、版本和 schema Spike |
| 取得书面许可 | `implementation_blocked` | 仍需 synthetic PoC、ADR 与实现计划批准 |
| 配置 Teams API 但鉴权失败 | `authentication_required` | 不回退读取本地数据，不输出凭据 |
| Teams API 限流或部分失败 | `temporarily_unavailable` 或 `partial` | 保留已验证游标，重试或标注完整度 |

Qoder 失败不能阻塞其他数据源。任何 fallback 都不能绕过政策门禁。

## 10. 解锁条件

只有满足以下至少一项，才能重新评估本地 adapter：

1. Qoder 发布面向第三方的本地只读 API 或可移植导出，并明确允许此类使用。
2. Qoder 向本项目提供覆盖读取、分析和公开分发的书面许可。
3. 正式法律评估确认在目标发布地区、目标实现方式和目标数据范围内存在充分依据。

解锁后仍不能直接进入生产开发，还必须完成：版本化 schema Spike、纯 synthetic fixture、隐私威胁建模、ADR、issue-level plan 和发布评审。

## 11. 合成 Fixture 入口

合成测试规范见 [Qoder 合成 Fixture 契约](../TESTS/qoder-synthetic-fixture-contract.md)。它只验证产品门禁、安装识别和未来 Teams API connector 的边界，不代表已批准本地 adapter。

## 12. Scope Drift Check

1. 当前仍在回答 Qoder IDE read-only adapter 是否可发布：是。
2. 官方许可限制直接决定发布可行性，不是范围外问题。
3. 政策门禁早于 schema 验证成立，本地能力保持 `unavailable/unverified`。
4. QoderWork 已识别为独立产品并排除，没有扩大到第二个 adapter。
5. Teams OpenAPI 只记录为未来独立 connector，没有替代或混入本地 adapter。
6. 没有读取日志、数据库、会话、数据字段、进程参数、打包源码或私有协议。
7. 停止条件已满足；继续检查本地目录不会改变当前发布决策，并会增加许可与隐私风险。

## 13. 官方证据索引

- [Qoder Terms of Service](https://qoder.com/product-service)
- [Qoder Teams OpenAPI Overview](https://docs.qoder.com/account/teams/openapi/index.md)
- [Qoder Teams AI Code Metrics](https://docs.qoder.com/account/teams/openapi/ai-code-metrics.md)
- [Qoder Teams Usage APIs](https://docs.qoder.com/account/teams/openapi/usage.md)
- [Qoder Teams Analytics](https://docs.qoder.com/account/teams/analysis.md)
