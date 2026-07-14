# WorkBuddy 合成 Fixture 契约

> 对应 Issue：[#3](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/3)
> 技术依据：[WorkBuddy 本地数据适配可行性报告](../TECH/workbuddy-log-feasibility.md)
> 状态：Phase 1 设计契约；生产 adapter 因许可边界未获批准

## 1. 目的

本契约定义不含真实 WorkBuddy 数据的兼容性测试输入，用于验证：

- 产品在 WorkBuddy 被政策阻塞时 fail closed
- 安装/版本检测不会隐式读取数据目录
- 未来 compatibility probe 的字段完整度、Token 口径和隐私 denylist
- 若许可门禁解除，adapter 仍需通过的增量与幂等行为

**所有 fixture 必须从零合成，不得从真实 WorkBuddy 数据库、trace、task、artifact、日志或导出结果脱敏生成。**

## 2. 计划目录

```text
tests/fixtures/workbuddy/
├── README.md
├── manifests/
│   ├── v5.2.5-partial.json
│   ├── legacy-unknown.json
│   └── unsupported-future.json
├── source/
│   ├── sessions.synthetic.json
│   ├── traces.synthetic.json
│   └── mutations.synthetic.json
└── expected/
    ├── policy-blocked.json
    ├── v5.2.5-capabilities.json
    └── mutation-checkpoints.json
```

仓库不提交 `.db`、`.sqlite`、`.vscdb`、LevelDB、WAL 或真实 trace 文件。若未来测试需要 SQLite，测试进程必须从合成 JSON/SQL 在临时目录生成，并在结束后删除。

## 3. Fixture Manifest

```json
{
  "fixture_contract": "workbuddy-synthetic/v1",
  "source": "synthetic",
  "observed_app_version": "5.2.5",
  "schema_profile": "local-observation-2026-07-14",
  "contains_real_user_data": false,
  "production_adapter_authorized": false,
  "expected_status": "unsupported",
  "expected_reason_code": "policy_restriction"
}
```

Manifest 不得包含生成机器、用户名、绝对 home path、真实软件配置、安装 ID 或上游 schema dump。

## 4. 合成命名规则

| 类型 | 示例 |
| --- | --- |
| source instance | `workbuddy_fixture_instance` |
| session | `wb_ses_fixture_0001` |
| trace | `wb_trace_fixture_0001` |
| span | `wb_span_fixture_0001` |
| project | `wb_project_fixture_alpha` |
| path | `/synthetic/workspace/project-alpha` |
| title | `SYNTHETIC_TASK_ALPHA` |
| tool | `fixture-tool` |
| Skill | `fixture-skill` |
| Agent | `fixture-agent` |
| sensitive marker | `MUST_NOT_APPEAR_SECRET_MARKER` |

禁止使用真实邮箱、域名、账号、token、GitHub repo、home path、客户名、业务项目名或真实模型凭据。

## 5. 合成来源模型

该模型是测试抽象，不是 WorkBuddy 上游 DDL 的副本：

```json
{
  "sessions": [
    {
      "sourceSessionId": "wb_ses_fixture_0001",
      "createdAt": 1784046000000,
      "updatedAt": 1784047800000,
      "lastActivityAt": 1784047800000,
      "status": "completed",
      "workspace": "/synthetic/workspace/project-alpha",
      "title": "SYNTHETIC_TASK_ALPHA"
    }
  ],
  "traces": [
    {
      "sourceTraceId": "wb_trace_fixture_0001",
      "sourceSessionId": "wb_ses_fixture_0001",
      "startedAt": "2026-07-14T10:00:00+08:00",
      "endedAt": "2026-07-14T10:20:00+08:00",
      "sourceTotalTokens": 150,
      "modelUsage": {
        "inputTokens": 100,
        "outputTokens": 50,
        "cachedTokens": 20,
        "callCount": 2
      },
      "spans": []
    }
  ]
}
```

expected 输出只能保存标准化元数据、available 状态、完整度和 synthetic ID。workspace/title 只用于证明过滤或授权分层，默认 expected 输出中不得出现。

## 6. 必需场景

### W01：政策门禁

- 检测到合法签名应用和受观测版本。
- `production_adapter_authorized=false`。
- 期望：状态 `unsupported`、reason code `policy_restriction`；数据目录 open count 为 0。

### W02：应用未安装

- 不提供应用元数据。
- 期望：`not_found`，不探测数据目录。

### W03：未知未来版本

- 版本高于受观测版本，schema profile 未知。
- 期望：`unsupported_version`；不得按相似字段猜测。

### W04：遗留 KV 格式

- 提供只含 session 元数据的合成 legacy profile，但不声明可映射版本。
- 期望：`unsupported_version`；不迁移、不修复、不与当前格式混读。

### W05：Session 有 trace

- 一个 session 关联两个 trace，包含稳定 source trace/span ID。
- 期望：仅在测试显式绕过政策门禁的 capability mode 中生成标准化事件；生产 mode 仍阻塞。

### W06：Session 无 trace

- session 有时间和状态，但没有 trace。
- 期望：Token、tool 和 duration 标记 unavailable，不补 0。

### W07：Token 分类与 source total

- 一条 trace 的 total 等于 input + output。
- 一条 trace 的 total 不等于 input + output。
- cached 在两条 trace 中分别表现为已包含和不可判定。
- 期望：保存 source total 与分项，不重新计算伪总数，不重复加入 cached。

### W08：积分不是 Token

- session usage 提供 used/size 和 synthetic credit map。
- 期望：任何 Token 输出都不能读取这些字段；可用性为 unavailable，而不是 0。

### W09：Skill

- completed、failed、pending 的 synthetic `skill` tool span。
- 期望：保留源状态；只有 completed 计为成功使用，pending 不算成功。

### W10：Subagent 歧义

- 一个 span 只有 parent ID。
- 一个 span 只有不同 Agent 名。
- 一个 span 有 task-like tool 但无 child session 关系。
- 期望：三者均不得确认 Subagent；最多输出低置信度 candidate，且不参与 L1-L4 评分。

### W11：隐私 denylist

- 合成输入包含 user ID、cwd、title、prompt、tool input/output、error、artifact URL、worker hostname 和 secret marker。
- 期望：标准化输出、日志、异常和 snapshot 均不出现 marker 或字段值。

### W12：文件名 ID 与 source ID 不同

- trace 文件名使用 `wb_file_fixture_0001`，内部 ID 为 `wb_trace_fixture_0001`。
- 期望：幂等键使用内部 ID；文件名只用于增量候选发现。

### W13：重复扫描与 mutation

- 连续扫描三次，再原地更新一个 trace 和 session timestamp。
- 期望：实体数量不变，受影响记录 upsert，checkpoint 单调不回退。

### W14：删除 reconciliation

- 第二阶段移除一个 session/trace。
- 期望：只软删除本产品派生记录，不修改 source fixture。

### W15：损坏、并发与权限

- malformed JSON、缺必需字段、busy、permission denied、symlink escape。
- 期望：fail closed 或可恢复重试，不产生半批结果，不修复源文件。

## 7. 期望能力输出

```json
{
  "source": "workbuddy",
  "observedVersion": "5.2.5",
  "status": "unsupported",
  "reasonCode": "policy_restriction",
  "capabilities": {
    "sessions": "observed",
    "timeRanges": "partial",
    "tokenCategories": "partial",
    "tools": "partial",
    "skills": "partial",
    "subagents": "unverified",
    "messages": "unavailable"
  },
  "dataDirectoryOpened": false
}
```

在政策门禁解除前，生产路径唯一允许的 expected 状态是 `not_found`、带 `policy_restriction` reason code 的 `unsupported`，或 `unsupported_version`。

## 8. 隐私扫描规则

Fixture 与 expected 输出必须通过以下规则：

- 不含 `/Users/`、`/home/` 或 Windows 用户目录
- 不含 UUID-like 安装/会话 ID，除明确以 `fixture` 命名的 synthetic ID
- 不含 email、Bearer、Authorization、cookie、access token、secret key
- 不含真实 WorkBuddy trace、DDL、task title、tool input/output 或 artifact 内容
- 不含真实模型名、connector ID、Skill 名或 Agent 名
- 不含来自本机 schema 查询的 row value

任何测试失败日志也必须遵守相同规则。

## 9. 解锁后的 PoC 门禁

只有许可条件被仓库 ADR 明确解除后，implementation Issue 才能：

1. 实现 read-only capability probe。
2. 从本契约生成临时 source fixture。
3. 验证首次、重复、增量、删除和异常路径。
4. 证明 tool input/output、路径、标题和凭据从未进入统一事件。
5. 重新验证当前 WorkBuddy 版本与 schema fingerprint。
6. 由隐私、法律和维护性评审共同批准生产状态从 `unsupported/policy_restriction` 迁移。

在此之前，本契约不能被解释为接入授权。
