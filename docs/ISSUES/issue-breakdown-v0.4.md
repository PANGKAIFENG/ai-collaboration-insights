# PRD v0.4 Phase 1 Issue Breakdown

- Product baseline：`docs/PRD/ai-collaboration-insights-product-prd-v0.4.md`。
- Decision：`docs/DECISIONS/ADR-0002-unified-fact-and-source-turn-model.md`。
- Readiness：`pass`；`docs/REVIEWS/prd-review-v0.4.md` 无阻断项。
- Scope：Codex-only UnifiedEvent v2 -> Source Turn -> Turn-first Task reconstruction -> private Ground Truth gate。
- Published：2026-07-19 as [#86](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/86)。

## Vertical Slice

### 建立可回查的 Codex Source Turn 并用于任务重建

- Type：AFK implementation；最终私有发布门禁由当前用户在本机授权执行。
- Labels：`implementation`, `afk`, `P0`, `codex`, `task-inference`, `privacy`, `evaluation`。
- Source：PRD 4.4、6、7.2-7.8、13、15、16.2、16.5；ADR-0002 决策 1-6。
- What to build：把 Codex JSONL 流式归一化为 UnifiedEvent v2，恢复 Source Turn 和 Tool call/result 配对，保留受限 provenance 与 unmatched diagnostics，并让 Task、Outcome、Verification 和 Evidence 通过 Turn-first 主干可回查来源。
- Acceptance criteria：
  - [ ] Event v2 提供稳定 `sourceTurnId`、`toolCallId`、父子引用、内容 digest、parser version 与本地受限 `sourceRef`，同一输入重算 ID 稳定。
  - [ ] 原生 `turn_context` 决定性恢复 Turn；无原生 ID 时仅由真实用户输入回退，并标记 `native | inferred | partial`，系统注入、压缩、轮询和重放不新建 Turn。
  - [ ] Tool call/result 按原生 `call_id` 配对；未配对事件进入结构化 diagnostics，不按时间强配。
  - [ ] Task reconstruction 先按 Turn 拆分 Session 内目标，再用强关系连接跨 Session；Task、Outcome、Verification 和 Evidence 引用 Turn/Event provenance。
  - [ ] 100 Turn 合成长会话可流式处理，现有确定性报告、AI 降级、隐私和只读行为无回退。
  - [ ] 私有 Ground Truth 达到 PRD 16.5 的逐项门禁，GitHub 只记录聚合结果。
- Verification：表驱动 parser/assembler/reconstructor/evidence 测试、100 Turn 合成 fixture、`deno task verify`、privacy check、私有 Ground Truth 复测和 GitHub required checks。
- Blocked by：None；PR #85 已合并并提供基线证据。
- Open questions：None。

## Coverage Matrix

| Phase 1 requirement | Covered by slice |
| --- | --- |
| UnifiedEvent v2 and migration | Yes |
| Native/fallback Source Turn | Yes |
| Tool pairing and unmatched diagnostics | Yes |
| Restricted local provenance | Yes |
| Turn-first Task reconstruction | Yes |
| Outcome/Verification/Evidence traceability | Yes |
| 100 Turn streaming behavior | Yes |
| Public synthetic and private Ground Truth gates | Yes |
| Second adapter, real-time tracing, DB, daemon, API, Dashboard | Explicitly excluded |
