# Qoder 合成 Fixture 契约

> 对应 Issue：[#4](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/4)
> 技术依据：[Qoder 本地数据适配可行性报告](../TECH/qoder-log-feasibility.md)
> 状态：Phase 1 设计契约；Qoder IDE 本地 adapter 因许可边界未获批准

## 1. 目的

本契约定义完全合成的测试输入，用于验证：

- Qoder IDE 在政策门禁下 fail closed
- 安装/版本检测不会隐式读取任何数据目录
- QoderWork 与 Qoder IDE 始终隔离
- 未知版本、隐私、secret 与 fallback 行为
- 未来独立 `qoder-teams-api` connector 的鉴权、限流、部分响应和 Credits 口径

**所有 fixture 必须从零合成，不得从真实 Qoder/QoderWork 日志、数据库、会话、API 响应、导出结果或本地字段脱敏生成。**

## 2. 计划目录

```text
tests/fixtures/qoder/
├── README.md
├── manifests/
│   ├── ide-v1.13.0-policy-blocked.json
│   ├── ide-unsupported-future.json
│   └── qoderwork-isolation.json
├── teams-api/
│   ├── metrics.synthetic.json
│   ├── usage.synthetic.json
│   ├── credits.synthetic.json
│   └── errors.synthetic.json
└── expected/
    ├── local-policy-blocked.json
    ├── product-isolation.json
    ├── teams-capabilities.json
    └── teams-fallbacks.json
```

仓库不得提交 `.db`、`.sqlite`、LevelDB、WAL、日志、真实 API payload、schema dump 或从应用目录复制的文件。测试不得创建真实 Qoder 默认目录，也不得连接真实 Qoder endpoint。

## 3. Fixture Manifest

```json
{
  "fixture_contract": "qoder-synthetic/v1",
  "source": "synthetic",
  "product": "qoder-ide",
  "observed_app_version": "1.13.0",
  "contains_real_user_data": false,
  "production_local_adapter_authorized": false,
  "expected_status": "unsupported",
  "expected_reason_code": "policy_restriction",
  "expected_data_directory_open_count": 0
}
```

Manifest 不得包含生成机器、用户名、真实 home path、组织、邮箱、安装 ID、API key、真实 Bundle 签名值以外的设备信息或上游 schema dump。

## 4. 合成命名规则

| 类型 | 示例 |
| --- | --- |
| source instance | `qoder_fixture_instance` |
| organization | `qoder_org_fixture_alpha` |
| member | `qoder_member_fixture_0001` |
| conversation | `qoder_conversation_fixture_0001` |
| usage event | `qoder_usage_fixture_0001` |
| repository | `qoder_repo_fixture_alpha` |
| API key marker | `MUST_NOT_APPEAR_API_KEY_MARKER` |
| auth marker | `MUST_NOT_APPEAR_AUTH_MARKER` |
| content marker | `MUST_NOT_APPEAR_CONTENT_MARKER` |

禁止使用真实邮箱、域名、账号、UUID、token、GitHub repo、home path、客户名、业务项目名、模型凭据或真实 Qoder 字段值。

## 5. 本地检测抽象

本地 fixture 只能模拟应用元数据和文件系统调用计数，不得模拟或复制 Qoder 数据 schema：

```json
{
  "applications": [
    {
      "syntheticPath": "/synthetic/Applications/Qoder.app",
      "bundleId": "com.qoder.ide",
      "version": "1.13.0",
      "signatureState": "valid",
      "license": "Proprietary"
    }
  ],
  "policy": {
    "localAdapterAuthorized": false
  },
  "filesystemProbe": {
    "dataDirectoryOpenCount": 0
  }
}
```

应用路径以 `/synthetic/` 开头。fixture 不包含 `.qoder`、`.qoder-server` 或 Application Support 目录的文件列表、stat 结果、字段名或内容。

## 6. Teams API 合成抽象

Teams fixture 是未来独立 connector 的测试抽象，不是官方响应 schema 的副本：

```json
{
  "source": "qoder-teams-api",
  "page": {
    "syntheticCursor": "qoder_cursor_fixture_0001",
    "hasMore": false
  },
  "events": [
    {
      "sourceEventId": "qoder_usage_fixture_0001",
      "occurredAt": "2026-07-14T10:00:00+08:00",
      "conversationId": "qoder_conversation_fixture_0001",
      "operation": "fixture-operation",
      "sourceMode": "AGENT",
      "modelTier": "fixture-tier",
      "credits": 7
    }
  ]
}
```

expected 输出必须保留 `credits` 单位，不得生成 `tokens`、`inputTokens`、`outputTokens`、`cachedTokens` 或 Credits-to-Token 换算值。

本节使用的 cursor、分页、错误码、header 和 enum 仅是鲁棒性测试输入，不表示官方 API 已确认这些具体字段或传输契约。正式 connector 必须以届时官方文档重新建立契约，未确认字段不得进入生产实现。

## 7. 必需场景

### Q01：政策门禁与 open count 0

- 检测到合法签名的 Qoder IDE `1.13.0` synthetic app metadata。
- `productionLocalAdapterAuthorized=false`。
- 期望：`unsupported` + `policy_restriction`；所有候选数据目录 open count、file read count 和 database connection count 均为 0。

### Q02：应用未安装

- 不提供 `com.qoder.ide` 应用元数据。
- 期望：`not_found`；不探测 `.qoder`、`.qoder-server` 或 Application Support。

### Q03：未知未来版本

- Bundle ID 正确，版本高于受观测版本。
- 期望：`unsupported_version`；不猜测 schema，不进入数据目录，不回退到相似产品。

### Q03A：自定义路径不受支持

- synthetic settings、CLI 或 environment 输入声明一个自定义数据路径。
- 期望：V1 忽略该路径，状态保持 `unsupported` + `policy_restriction`；settings/CLI/environment parser call count 和数据目录 open count 均为 0。

### Q04：签名或 Bundle 不匹配

- 分别提供无效签名、错误 Team ID、相似应用名和错误 Bundle ID。
- 期望：不识别为可信 Qoder IDE；不读取数据目录。

### Q05：QoderWork 产品隔离

- 只提供 `com.qoder.work`、版本 `0.6.5` 的 synthetic metadata。
- 期望：Qoder IDE 状态为 `not_found`；不得将其版本、目录或指标归入 `qoder` source。

- 同时提供 `com.qoder.ide` 和 `com.qoder.work`。
- 期望：只检测 IDE 元数据；QoderWork 不作为 fallback，也不触发额外目录探测。

### Q06：本地能力全不可用或未验证

- UI/adapter capability 请求包含 sessions、time ranges、projects、messages、tools、tokens、skills 和 subagents。
- 期望：sessions/time ranges/projects/messages 为 `unavailable`，tools/tokens/skills/subagents 为 `unverified`；不得输出 0、空集合或推断值。

### Q07：Credits 不是 Token

- Teams synthetic usage event 含 `credits`、operation、source mode 和 model tier。
- 期望：只输出 Credits 原始单位；Token 相关能力为 `unavailable`，跨工具 Token 汇总不包含该数值。

### Q08：Teams API 正常分页

- 两页 synthetic metrics/usage 响应，cursor 不重复，第二页 `hasMore=false`。
- 期望：以 `qoder-teams-api` 独立 source 幂等写入，游标只在整页验证成功后推进；不创建 `qoder-local` 记录。

### Q09：Teams API 鉴权失败

- synthetic `401`、`403` 和过期凭据错误，错误体含 auth marker。
- 期望：`authentication_required` 或 `permission_denied`；日志和 UI 不出现 key、header、marker 或错误正文；不得回退读取本地目录。

### Q10：Teams API 限流

- synthetic `429`，分别包含合法、缺失和异常 `Retry-After`。
- 期望：有界退避和 jitter；不忙等、不无限重试、不推进失败页游标；最终状态 `temporarily_unavailable`。

### Q11：部分响应与分页中断

- 第一页有效、第二页超时；单页含缺字段、未知 enum 和重复 event ID。
- 期望：标记 `partial` 和完整度；未知记录 fail closed 或隔离；重试后幂等，不把缺失值补 0，不将部分结果描述为全量。

### Q12：响应损坏与 server error

- malformed JSON、错误 content type、oversized payload、`500/502/503/504`。
- 期望：限制响应体、可恢复重试、不产生半批提交；错误 snapshot 不保存响应正文。

### Q13：Secret 与隐私 denylist

- synthetic request/response/error 中放入 API key、Authorization、cookie、邮箱、组织 ID、repository、文件路径、prompt、response 和三个 marker。
- 期望：标准化输出、日志、异常、snapshot 和报告均不出现 marker 或敏感值。

### Q14：组织权限结果与最小权限评审

- 提供两个 synthetic API key context：创建者可访问目标 organization 资源，以及创建者无权访问目标资源；不声明 `metrics read`、`usage read` 等未公开 granular scope。
- 期望：分别得到成功或明确的权限失败；记录 API key 与 organization 绑定、访问范围大体继承创建者这一已知边界，并将 least-privilege 可行性保留为上线前评审项。权限失败时不建议盲目扩大创建者权限，也不读取本地数据补偿。

### Q15：Fallback 隔离

- Teams API 未配置、鉴权失败、限流或部分失败，同时本地 Qoder IDE 已安装。
- 期望：Teams connector 和 IDE detection 分别展示状态；任何 Teams 失败都不能触发本地数据读取。

### Q16：其他数据源不中断

- Qoder 本地政策阻塞，Teams API 同时不可用，其他 synthetic adapter 正常。
- 期望：报告继续生成；Qoder 显示不可用原因，其他来源不受影响。

## 8. 期望能力输出

Qoder IDE：

```json
{
  "source": "qoder",
  "observedVersion": "1.13.0",
  "status": "unsupported",
  "reasonCode": "policy_restriction",
  "capabilities": {
    "sessions": "unavailable",
    "timeRanges": "unavailable",
    "projects": "unavailable",
    "messages": "unavailable",
    "tools": "unverified",
    "tokens": "unverified",
    "skills": "unverified",
    "subagents": "unverified"
  },
  "dataDirectoryOpened": false,
  "dataDirectoryOpenCount": 0
}
```

Qoder Teams API：

```json
{
  "source": "qoder-teams-api",
  "status": "available",
  "capabilities": {
    "aiCodeMetrics": "available",
    "usageEvents": "available",
    "credits": "available",
    "tokens": "unavailable",
    "messages": "unavailable",
    "skills": "unverified",
    "subagents": "unverified"
  },
  "unit": "credits"
}
```

本地生产路径唯一允许的状态是 `not_found`、带 `policy_restriction` reason code 的 `unsupported`，或未知版本的 `unsupported_version`。

## 9. 隐私扫描规则

Fixture、expected 输出及测试日志必须：

- 不含 `/Users/`、`/home/` 或 Windows 用户目录
- 不含 UUID-like 安装、组织、成员、会话或事件 ID
- 不含 email、Bearer、Authorization、cookie、API key、access token、refresh token 或 secret key
- 不含真实 Qoder/QoderWork 日志、数据库、会话、消息、项目路径或 API 响应
- 不含真实组织、repository、file、model、prompt、response、tool input/output 或内容字段值
- 不含来自本机 Qoder 数据目录的文件名、schema、row value 或聚合值

`MUST_NOT_APPEAR_*` marker 只允许存在于测试输入源；expected、snapshot、日志和报告必须断言不存在。

## 10. 解锁后的门禁

### 本地 adapter

只有仓库 ADR 明确记录许可解锁依据后，implementation Issue 才能：

1. 设计版本化、只读 capability probe。
2. 单独审批是否允许触碰数据目录；默认仍为 open count 0。
3. 从零创建 synthetic schema，不复制真实数据或 schema dump。
4. 完成隐私、安全、幂等、未知版本和损坏输入验证。
5. 经法律、隐私和维护性评审共同批准生产状态迁移。

### Teams API connector

未来独立 Issue 必须先确认组织管理员授权、API key 与创建者权限继承规则、least-privilege 可行性、分页/限流契约、数据保留和删除策略，再实现 connector。不得假设官方存在 granular read scopes。该 connector 不能成为本地 adapter 的隐式 fallback，且 Credits 始终与 Token 分离。

在这些门禁完成前，本契约不能被解释为接入授权。
