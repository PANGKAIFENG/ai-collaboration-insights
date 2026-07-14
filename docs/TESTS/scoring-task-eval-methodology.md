# 任务识别与评分 Eval 方法

> 对应 Issue：[#5](https://github.com/PANGKAIFENG/ai-collaboration-insights/issues/5)
> 状态：Phase 1 MVP 评测契约

## 1. 目的与边界

本契约验证 task group 识别、project 归属、五维评分、日/28 天聚合、L1-L4 等级和风险门禁是否符合 PRD。首轮数据集固定为 100 个完全 synthetic cases，Codex、Claude Code、OpenCode、WorkBuddy、Qoder 各 20 个。

WorkBuddy 与 Qoder 的 synthetic unified evidence 仅用于证明统一评测层对 source 标签处理一致，不改变其 `unsupported` + `policy_restriction` 状态，也不授权读取本地数据。

评分规则是 source-neutral 的：五维权重、聚合方式和质量门禁不因 `sourceTool` 改变。adapter policy 是独立前置门禁：只有已获准的 adapter 才能生成真实 unified evidence；synthetic source label 不能绕过或改变该门禁。

本 Issue 不评测 model-based grader、可视化、生产服务或真实日志。conformance prediction 只证明 harness 和 fixture 契约自洽，不代表产品推断准确率达到门槛。

## 2. Record 契约

每个 gold record 必须包含：

- `caseId`、`sourceTool` 和 synthetic evidence window
- task boundary、project、一个或多个 accepted task names
- deliverable（任务产出）与 verification status
- complexity `1|2|3`
- 五维 gold 分数：任务定义、协作编排、迭代深度、验证闭环、资产沉淀
- iteration、verification、asset evidence gates
- risk labels 与 confidence
- 每项可评分证据的 availability

每个 prediction record 只包含相同 `caseId` 的候选 task boundary、project、task name、deliverable、verification status、complexity、五维分数、evidence gates、risk labels 和 confidence。prediction 不得复制 gold、标注解释或任何真实会话内容。

`deliverable` 表示当前任务产生的普通结果，不自动等同于 reusable asset。只有 asset evidence gate 为 `present` 的任务才计入 L4 的复用资产数量；仅存在 deliverable 不能通过该门禁。

## 3. Evidence availability

所有可选证据必须使用以下三态，不能用缺字段或数值 0 混淆：

- `present`：观察到支持该判断的证据。
- `observed_absent`：来源具备该能力且已完成观察，但未发现对应证据。
- `unavailable`：来源不提供、政策不允许读取或证据不足，无法判断是否存在。

任一评分维度为 `unavailable` 时，该任务总分为 `null`；不得补 0，也不得对剩余维度重归一化。

## 4. 固定评分规则

五维权重固定为 20% / 20% / 20% / 25% / 15%。复杂度固定为 1（简单）、2（中等）、3（复杂），只由目标、约束和交付范围判断；Token、时长、会话数、工具数、Skill 数和 Subagent 数不得影响复杂度或得分。

日分是有效任务分数按复杂度 1/2/3 加权的平均值。近 28 天分数是有效活跃日分数的等权平均；不足 3 个有效活跃日时等级必须为 `null`，展示“证据不足”。

基础分段为 L1 `0-39`、L2 `40-59`、L3 `60-79`、L4 `80-100`，并应用 evidence gate：

- L3：近 28 天至少 3 个同时具有迭代证据和结果验证的任务。
- L4：近 28 天至少 5 个同时具有迭代证据和结果验证的任务，且至少 2 个任务形成可核对的复用资产。

成熟度使用以下确定性算法：

1. 先按 28 天分数所在 band 得到上限候选级。
2. 从候选级向下逐级检查 evidence gate；L2 与 L1 没有额外 evidence gate。
3. 降级检查只使用低等级的 score floor，不受其 score band ceiling 限制。
4. 返回第一个满足全部条件的等级。

例如，85 分满足 L3 evidence gate 但不满足 L4 资产门槛时返回 L3；若 85 分也不满足 L3 evidence gate，则返回 L2。聚合结果和最终成熟度等级必须与 gold exact match。

## 5. 指标与门禁

- joint task name/project consistency：prediction 的 task name 精确匹配 gold `acceptedTaskNames` 之一，且 project 同时正确才记为正确；overall 必须 `>=80%`，每个 source tool 必须 `>=70%`。
- boundary F1：按 boundary 匹配计算并独立报告，不进入 joint task name/project consistency 门禁。
- aggregation exactness：task score、day score 与 28-day score 必须 exact match。
- maturity exactness：证据不足、L1、L2、L3、L4 必须 exact match。
- usage-only risk negative gate：仅因高 Token、长时长、高会话数或高工具调用量，不得产生风险标签。

任何门禁失败都必须使基线运行失败。浮点比较与 boundary 匹配细则由 runner 固定并在基线报告中记录。

## 6. 标注与隐私

首轮 100 个 synthetic gold cases 由人工复核。未来可用真实私有样本做本地校准，但原始记录、Prompt、回复、路径、工具输入输出和逐 case 结果不得进入 Git、Issue、PR、CI 日志或公开报告；只提交不可逆的汇总指标。

fixture 必须从零合成，不从真实日志脱敏改写。confidence 描述证据充分程度，不能替代 availability，也不能将 `unavailable` 推断为 `observed_absent`。
