# 真实 Task Ground Truth 评测 v0.1

> 对应 Issue：[#84](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/84)
> 状态：第一阶段完成，任务重建门禁未通过
> 被评测版本：`v0.2.2` / `50b5d4d`
> 评测日期：2026-07-18

## 1. 结论

本轮真实样本支持“Codex 原始日志足以重建真实任务”，但不支持“当前 `v0.2.2`
已经能可靠完成任务重建”。26 个报告 Task 中只有 15 个边界与人工判断一致，整体一致率
为 **57.7%**，低于 80% 门槛。

当前首要问题不是 AI enrichment 超时，也不是 Evidence Packet 上下文不够，而是 AI 介入前的
确定性主干不可信：系统注入会成为任务，新的用户目标没有被切开，弱关系会将不相关 Session
整组合并，历史重放会被当成当日新事实，Tool Result 正文又在解析时丢失。后续洞察、评分和建议
建立在这些对象上，因此会出现标题、项目、成果和验证相互错配。

**阶段门禁：FAIL。** 在修复 Task 主干前，不应继续扩展 Dashboard、多工具、周月报、长期画像
或自动资产沉淀。

## 2. 隐私与样本

- 只读检查 2026-07-15 至 2026-07-18 的本地日报和对应 Codex Session。
- 样本包含 4 个日报、26 个报告 Task、191 条报告 Relation。
- 人工标注保存在 Git 之外的本机私有目录；原始 Prompt、回复、路径、Session ID、逐 case
  标注和个人报告均未进入本文或仓库。
- 本轮未运行 AI enrichment；评测对象是确定性 Task、Relation、Intent、Outcome、Project 和
  Verification 结果。
- 公开报告只保留不可逆聚合指标、错误类型和实现根因。

## 3. 评分口径

### 3.1 Task 边界

每个报告 Task 使用一个主标签：

- `correct`：完整对应一个真实用户任务，未混入无关目标。
- `over_merged`：跨 Session 合并后包含两个或更多不相关任务。
- `under_split`：同一 Session 或重放历史中的多个目标没有被拆开。
- `false_positive`：没有真实用户目标，主要由 Subagent 或注入上下文形成。

Task 边界一致率以全部 26 个报告 Task 为分母。多目标切分召回只统计人工确认的三个明确
多目标样本。跨 Session 合并 precision 以 9 个包含多个来源 Session 的最终 Task group 为分母；
只有组内全部 Session 属于同一个真实任务才计为正确。这个 group-level 口径能够暴露一条错误边
经并查集传染整个任务组的风险。

### 3.2 字段质量

Project、Intent 和 Outcome 以 23 个存在真实用户任务的报告 Task 为分母，排除三个
`false_positive`。Intent 与 Outcome 必须分别保留该 Task 的目标主干与最终结果主干，标题只保留
早期意图但结果来自后续目标时，二者均不通过。

Verification 只统计原始会话中存在明确测试、检查、发布核验、读回核验或失败结果的 18 个任务；
无论结果是通过还是失败，只要报告正确观察到结果就计为召回。

## 4. 评测结果

| 维度 | 结果 | 门槛 | 结论 |
| --- | ---: | ---: | --- |
| Task 边界一致率 | 15/26，57.7% | >= 80% | FAIL |
| 多目标 Session 切分召回率 | 0/3，0% | >= 80% | FAIL |
| 项目归属一致率 | 7/23，30.4% | >= 80% | FAIL |
| Intent 主干保留率 | 9/23，39.1% | >= 90% | FAIL |
| Outcome 主干保留率 | 15/23，65.2% | >= 90% | FAIL |
| Intent + Outcome 联合正确率 | 9/23，39.1% | >= 90% | FAIL |
| 明确 Verification 召回率 | 6/18，33.3% | >= 80% | FAIL |
| 标题含注入上下文或仅剩路径 | 7 | 0 | FAIL |
| 标题保留陈旧 Intent | 2 | 0 | FAIL |
| 跨 Session Task group precision | 2/9，22.2% | >= 80% | FAIL |

Task 边界错误分布：

| 标签 | 数量 | 占全部报告 Task |
| --- | ---: | ---: |
| `correct` | 15 | 57.7% |
| `over_merged` | 4 | 15.4% |
| `under_split` | 4 | 15.4% |
| `false_positive` | 3 | 11.5% |

需要注意：Relation 的单边统计会掩盖风险。191 条 Relation 中有 154 条是可由运行 ID 直接确认的
delegation，但最终只有 2/9 个跨 Session Task group 完全同质。一条错误的 continuation 或
shared-deliverable 边，就可能把两个各自包含大量 Subagent 的连通分量合并。因此下一版不能只优化
Relation edge precision，还必须约束错误边的合并半径和最大影响范围。

## 5. 主要问题

### P0：Task 边界不可信

1. **直接提出新目标时不会切分。** 当前规则主要识别“新任务、接下来、现在实现”等少量显式
   转场词，普通的新问题仍被视为上一轮反馈。三个明确多目标样本均未拆开。
2. **弱关系直接触发不可逆合并。** continuation 和 shared deliverable 的置信度被固定为高值，
   随后直接进入并查集；一条误判可以把两个大型 Session/Subagent 集群合成一个 Task。
3. **没有真实用户目标的 Session 仍可产生候选。** orphan fallback 会为剩余活动创建 candidate，
   注入内容或 Subagent Session 因而形成虚假任务。
4. **历史重放没有事件级语义去重。** 新 Session 重复携带旧对话时，事件 ID 因 Session 和行号变化
   而不同，历史目标、轮次和成果被重新计入当前窗口。

### P1：主干字段错配

1. **标题取组内第一个用户消息。** 长会话发生目标切换后，标题仍保留早期目标，Outcome 却取最后
   一条 Assistant 消息，产生“旧 Intent + 新 Outcome”。
2. **Project 等于 Session 启动目录。** 当前只使用 `cwd` 最后一段；当会话从 `Desktop`、通用目录
   或其他仓库启动后再切换工作对象，项目归属不会更新。
3. **注入过滤覆盖不完整。** ambient browser context、Skill snapshot、Selected Text 和部分自动化
   上下文没有被稳定识别，七个标题直接暴露了这一问题。

### P1：Verification 证据损失

原始会话明确出现验证结果的 18 个任务中，当前只召回 6 个。Parser 会创建 `tool_result` 事件，
但没有把输出正文写入 `contentPreview`；随后 Verification 只能依赖工具名和 Assistant 摘要正则。
这会漏掉真实的测试失败、命令输出、读回核验和外部状态检查，也会把“Assistant 声称完成”误当成
比 Tool Result 更强的证据。

### P2：轮次统计受错误 Task 放大

任何用户消息都会开启 feedback round，任何 Assistant 消息通常都会成为 result。任务边界错误、
重复历史和注入消息进入后，语义轮次、有效迭代、活跃时间和评分都会同步膨胀。因此轮次规则本身
不能独立验收，必须在事件归一化和 Task 边界通过门禁后复测。

## 6. 实现根因映射

| 现象 | 当前实现 | 影响 |
| --- | --- | --- |
| 新目标未切分 | `packages/analysis/tasks.ts:5-7,88-96` 只识别有限转场词和锚点变化 | 多目标 Session 欠切分 |
| 注入成为用户目标 | `packages/analysis/tasks.ts:38-48` 的 scaffolding 列表不完整 | 污染标题、虚假 Task |
| orphan 形成 candidate | `packages/analysis/tasks.ts:123-135` 无用户目标也创建候选 | Subagent/注入 false positive |
| 弱边直接合并 | `packages/analysis/tasks.ts:169-190,232-242` 固定高置信后进入并查集 | 不相关 Session 整组合并 |
| 标题/项目取首值 | `packages/analysis/tasks.ts:263-275` 取首个 Goal 和首个 Project | 陈旧 Intent、项目错配 |
| 注入归一化不足 | `packages/codex/parser.ts:57-65` 只覆盖少量包装格式 | ambient/Skill/Selection 残留 |
| Tool Result 正文丢失 | `packages/codex/parser.ts:204-208,251-258` 未设置结果文本 | Verification 召回不足 |
| Assistant 均视为 Outcome | `packages/analysis/evidence.ts:34-47` | 计划、进度、最终结果混在一起 |
| 历史重放未去重 | `packages/codex/parser.ts:116-128` 的 ID 包含 Session/行号 | 同一内容跨 Session 重复计数 |

## 7. 修复顺序建议

本报告不实施修复。下一阶段应按依赖顺序拆成独立 Issue 和 PR：

1. **事件可信层**：补齐注入/heartbeat 分类，识别历史重放，保留有界且脱敏的 Tool Result 摘要。
2. **Session 内 Task 切分**：从转场词升级为“目标对象 + 期望动作 + 交付物 + 约束”的变化检测，
   对低置信转场保留候选边界，不直接吞入前一任务。
3. **跨 Session 关系与合并安全**：delegation 只作为父子关系，不等同于独立用户 Task；
   continuation/shared deliverable 需要双向证据，并限制一次弱边合并的规模。
4. **Task 主干生成**：标题、Project、Intent、Outcome 和 Verification 从已确认 Task 片段重新生成，
   不再简单取第一条用户消息和最后一条 Assistant 消息。
5. **回归评测**：使用同一私有 26 Task 样本复跑；全部核心门禁通过后，再验证 AI 洞察和最小资产闭环。

## 8. 阶段决策

- `v0.2.2` 可以继续作为本地事实采集与报告生成实验载体，但当前 Task 卡、L1-L4 和教练建议不能
  作为可靠个人判断。
- 第一修复目标应是“日报中每个 Task 代表一个真实任务”，而不是让 AI 读取更多全文。
- Dashboard 可以后置展示已可信的数据，但不能修复数据对象本身。
- 修复完成前，不基于当前结果建立长期偏好、自动 Skill 候选或跨天用户画像。

## 9. 局限

- 样本来自单个用户、四个连续日报，能发现真实重度使用问题，但不能代表所有 Codex 用户分布。
- 本轮评测 deterministic 主干，没有评测 AI enrichment 的命名、洞察或建议质量。
- Project ground truth 采用用户实际工作对象，不把通用启动目录自动视为正确项目，因此比当前
  `cwd` 展示口径更严格。
- Relation 使用最终 Task group precision；后续修复时仍需增加 edge-level 标注和连通分量污染指标。
