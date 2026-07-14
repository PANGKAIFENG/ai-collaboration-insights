# OpenCode 合成 Fixture 契约

> 对应 Issue：[#2](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/2)
> 技术依据：[OpenCode 本地日志适配可行性报告](../TECH/opencode-log-feasibility.md)
> 状态：Phase 1 设计契约；实际生成器随 OpenCode adapter implementation Issue 落地

## 1. 目的

本契约定义 OpenCode adapter 的可公开、可重复测试输入。fixture 必须证明版本兼容、字段完整度、Token 口径、增量读取和幂等行为，同时不能由真实会话脱敏得到。

**所有 fixture 必须从零合成。禁止把真实 `opencode.db`、`opencode export --sanitize` 结果或本地日志复制进仓库。** 官方 sanitize 命令可用于理解结构，但输出仍可能保留版本、Agent、模型和结构性个人信息，不是本项目 fixture 来源。

## 2. 计划目录

```text
tests/fixtures/opencode/
├── README.md
├── manifests/
│   ├── v1.14.41.json
│   ├── v1.17.14.json
│   └── unsupported.json
├── sql/
│   ├── v1.14.41.sql
│   ├── v1.17.14.sql
│   ├── mutation-sequence.sql
│   └── unsupported-schema.sql
└── expected/
    ├── v1.14.41.events.json
    ├── v1.17.14.events.json
    └── mutation-sequence.checkpoints.json
```

仓库不提交 `.db`/`.sqlite` 二进制。测试运行时从 SQL 构建临时数据库，并在测试结束后删除。

## 3. Fixture Manifest

每个版本 fixture 必须有 manifest：

```json
{
  "fixture_contract": "opencode-synthetic/v1",
  "source": "synthetic",
  "opencode_version": "1.17.14",
  "schema_capabilities": {
    "legacy_message_part": true,
    "session_usage": true,
    "event_sequence": true,
    "session_message_seq": true
  },
  "contains_real_user_data": false,
  "expected_status": "ready"
}
```

Manifest 只能声明测试事实，不得记录生成机器、用户名、绝对路径或真实软件配置。

## 4. 合成命名规则

允许值必须明显是 synthetic：

| 类型 | 示例 |
| --- | --- |
| project ID | `prj_fixture_alpha` |
| session ID | `ses_fixture_parent_01` |
| message ID | `msg_fixture_0001` |
| part ID | `prt_fixture_0001` |
| call ID | `call_fixture_0001` |
| 路径 | `/synthetic/workspace/project-alpha` |
| 用户文本 | `SYNTHETIC_USER_REQUEST_ALPHA` |
| 助手文本 | `SYNTHETIC_ASSISTANT_RESPONSE_ALPHA` |
| 工具输出 | `SYNTHETIC_TOOL_OUTPUT_ALPHA` |
| Skill | `fixture-skill` |
| Agent | `fixture-subagent` |
| model/provider | `fixture-provider/fixture-model` |

禁止使用看似真实的邮箱、域名、token、GitHub repo、home path、客户名或业务项目名。

## 5. 最小 schema 样例

以下是验证 adapter capability probe 所需的概念结构，不是可直接复制的完整上游 DDL：

```sql
CREATE TABLE project (
  id TEXT PRIMARY KEY,
  worktree TEXT NOT NULL,
  name TEXT,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  directory TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE part (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data TEXT NOT NULL
);
```

`v1.17.14.sql` 另加 session usage 分类、`session_message.seq`、`event_sequence` 等 capability；`v1.14.41.sql` 不得伪造 session usage 列。

## 6. 合成 JSON 样例

### 6.1 Assistant message usage

```json
{
  "role": "assistant",
  "agent": "fixture-primary",
  "providerID": "fixture-provider",
  "modelID": "fixture-model",
  "time": { "created": 1767229201000, "completed": 1767229205000 },
  "tokens": {
    "input": 100,
    "output": 40,
    "reasoning": 20,
    "cache": { "read": 10, "write": 5 }
  },
  "cost": 0
}
```

### 6.2 Skill tool part

```json
{
  "type": "tool",
  "callID": "call_fixture_skill_01",
  "tool": "skill",
  "state": {
    "status": "completed",
    "input": { "name": "fixture-skill" },
    "output": "SYNTHETIC_SKILL_OUTPUT",
    "title": "SYNTHETIC_SKILL_TITLE",
    "metadata": {},
    "time": { "start": 1767229202000, "end": 1767229203000 }
  }
}
```

### 6.3 Subagent evidence

Parent session 使用 `task` tool；child session 的 `parent_id` 指向 parent：

```json
{
  "type": "tool",
  "callID": "call_fixture_task_01",
  "tool": "task",
  "state": {
    "status": "completed",
    "input": {
      "description": "SYNTHETIC_SUBTASK",
      "prompt": "SYNTHETIC_SUBTASK_PROMPT",
      "subagent_type": "fixture-subagent"
    },
    "output": "SYNTHETIC_SUBTASK_OUTPUT",
    "title": "SYNTHETIC_SUBTASK_TITLE",
    "metadata": {
      "sessionId": "ses_fixture_child_01",
      "parentSessionId": "ses_fixture_parent_01"
    },
    "time": { "start": 1767229204000, "end": 1767229208000 }
  }
}
```

测试 adapter 只能保存工具名、状态、时间、结构证据和允许的别名，不能把上述 input/output 投影到生产统一事件。

## 7. 必需场景

### F01：`1.14.41` legacy projection

- 两个 session，其中一个为空 session。
- user/assistant message 与 text/reasoning/tool/step-finish part。
- message 级 Token 可用，session usage 列不存在。
- 期望：状态 `partial`；Token 分类可用；session aggregate capability 不可用。

### F02：`1.17.14` usage projection

- 与 F01 相同的逻辑事件。
- session usage 分类存在，值等于 message/step 主口径汇总。
- 期望：状态 `ready`；不能把两套 Token 相加。

### F03：Skill

- 一次 completed `skill`、一次 error `skill`、一次 pending `skill`。
- 期望：源状态分别保留；产品层可把 error 归一为 failed，pending 不算已成功使用。

### F04：Subagent

- parent/child session、完成的 `task`、显式 child ID。
- 另有一个只有 Agent 名但无父子证据的 session。
- 期望：前者识别为 Subagent，后者只识别为 Agent 参与。

### F05：同毫秒稳定排序

- 多个 session/message/part 共享相同时间戳，ID 不同。
- 期望：复合游标不漏不重。

### F06：in-place mutation

- 同一 part ID 从 pending 更新到 completed，`time_updated` 改变。
- 期望：upsert 同一统一事件，不增加工具调用数；报告窗口标记需重算。

### F07：重复扫描

- 同一 fixture 连续扫描三次。
- 期望：所有实体和指标数量不变，checkpoint 单调不回退。

### F08：删除 reconciliation

- 在 `1.17.14` fixture 的第二阶段删除一个 session 及关联 event sequence；`1.14.41` fixture 只删除 legacy 投影记录。
- 期望：派生记录软删除，不修改源 fixture，不影响其他 session。

### F09：部分 Token

- 一条记录仅有 input/output，cache/reasoning 缺失；另一条五类均明确为 0。
- 期望：缺失与真实 0 可区分；前者不生成伪完整 total。

### F10：未知 schema

- 已支持版本增加未知 message/part type；另一个 fixture 缺少必需列或使用未来 version。
- 期望：前者不解析未知记录内容、保留 opaque type marker 并把相关能力标为 `partial`；后者返回 `unsupported_version` 或 `invalid_source`。两者都不能按相近结构猜测。

### F11：损坏与并发

- malformed JSON、foreign key 异常、`SQLITE_BUSY` 注入。
- 期望：本批失败或可恢复重试，不产生半批结果，不执行修复 SQL。

### F12：隐私 denylist

- 合成表中加入 `credential`、`account`、`session_share`，值为明显 synthetic secret marker。
- 期望：adapter 完全不查询或导入这些表；测试输出中 marker 不出现。

## 8. 期望输出结构

expected 文件只包含标准化非敏感字段：

```json
{
  "source": "opencode",
  "source_version": "1.17.14",
  "source_session_id": "ses_fixture_parent_01",
  "kind": "tool_call",
  "occurred_at": "2026-01-01T01:00:02.000Z",
  "tool_name": "skill",
  "status": "completed",
  "evidence": {
    "source_entity_type": "part",
    "source_entity_id": "prt_fixture_skill_01",
    "confidence": 1
  }
}
```

不得包含 `text`、`prompt`、`output`、`directory`、`worktree`、diff、credential、share secret 或原始 metadata。

## 9. 生成与验证约束

实现阶段应提供一个确定性生成器：

```text
input: versioned SQL + manifest
output: temporary SQLite database
seed: fixed
timestamps: fixed UTC epoch milliseconds
cleanup: mandatory
```

每次 fixture 变更需要通过：

1. SQL 可从空数据库重复构建。
2. `PRAGMA integrity_check` 返回 `ok`，损坏场景除外。
3. expected JSON 排序稳定。
4. 重复扫描结果字节级一致。
5. privacy/secret scan 无命中。
6. fixture schema 与固定 OpenCode tag 的字段矩阵一致。

## 10. 隐私扫描规则

至少拒绝：

- `/Users/<name>`、`/home/<name>`、Windows user profile 路径。
- 常见 API key、Bearer token、cookie、private key、Git remote credential。
- 非 `synthetic`/`fixture` 域名、邮箱、项目名和 session 标题。
- 大段自然语言提示词、回复、reasoning、tool output。
- SQLite/WAL/SHM 二进制文件被 Git 跟踪。

允许列表只能包含本契约定义的 synthetic marker，不能通过扩大 allowlist 放过未知内容。

## 11. 完成定义

- 两个目标版本 fixture 和 unsupported fixture 均由 SQL 确定性生成。
- F01-F12 有自动化断言。
- schema capability、字段完整度、Token、Skill、Subagent、增量、去重和失败状态均可复现。
- 仓库历史不含真实 OpenCode 数据或本地数据库。
