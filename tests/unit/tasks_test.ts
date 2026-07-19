import { assert, assertEquals } from "../_assert.ts";
import { reconstructTaskBoundaries } from "../../packages/analysis/tasks.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

function event(
  id: string,
  session: string,
  timestamp: string,
  kind: UnifiedEvent["kind"],
  overrides: Partial<UnifiedEvent> = {},
): UnifiedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: id,
    sourceTool: "codex",
    sourceSessionId: session,
    timestamp,
    kind,
    projectRef: "project-a",
    projectLabel: "alpha",
    availability: "available",
    ...overrides,
  };
}

const window = reportDateWindow("2026-07-15", "Asia/Shanghai");

Deno.test("assigns stable inferred provenance to a legacy user goal without a source turn", () => {
  const events = [
    event("legacy-goal", "legacy-session", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "修复旧会话的任务来源",
    }),
    event("legacy-result", "legacy-session", "2026-07-14T11:01:00.000Z", "message", {
      role: "assistant",
      contentPreview: "已完成",
    }),
  ];

  const first = reconstructTaskBoundaries(events, window);
  const second = reconstructTaskBoundaries(events, window);

  assertEquals(first.tasks.length, 1);
  assertEquals(first.tasks[0].sourceTurnIds.length, 1);
  assertEquals(first.tasks[0].sourceTurnIds, second.tasks[0].sourceTurnIds);
});

Deno.test("filters system scaffolding before selecting a task title", () => {
  const result = reconstructTaskBoundaries([
    event("system", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "# AGENTS.md instructions <INSTRUCTIONS> synthetic rules",
    }),
    event("env", "session-a", "2026-07-14T11:00:01.000Z", "message", {
      role: "user",
      contentPreview: "<environment_context><current_date>2026-07-15</current_date>",
    }),
    event("goal", "session-a", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      contentPreview: "修复日报的任务标题",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].name, "修复日报的任务标题");
  assert(!result.tasks[0].eventIds.includes("system"));
  assert(!result.tasks[0].eventIds.includes("env"));
});

Deno.test("filters pure injected Files Applications and Automation context", () => {
  const result = reconstructTaskBoundaries([
    event("files", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "# Files mentioned by the user: synthetic.md",
    }),
    event("apps", "session-a", "2026-07-14T11:00:01.000Z", "message", {
      role: "user",
      contentPreview: "# Applications mentioned by the user: Synthetic App",
    }),
    event("automation", "session-a", "2026-07-14T11:00:02.000Z", "message", {
      role: "user",
      contentPreview: "Automation: Synthetic daily review Automation ID: synthetic",
    }),
    event("goal", "session-a", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      contentPreview: "修复日报任务标题",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].name, "修复日报任务标题");
  assertEquals(result.tasks[0].eventIds, ["goal"]);
});

Deno.test("does not publish an orphan session without a real user goal", () => {
  const result = reconstructTaskBoundaries([
    event("child-result", "session-orphan", "2026-07-14T11:00:00.000Z", "message", {
      role: "assistant",
      contentPreview: "评审发现一个边界问题",
    }),
    event("child-tool", "session-orphan", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "read",
    }),
  ], window);
  assertEquals(result.tasks, []);
  assertEquals(result.relations, []);
});

Deno.test("drops weak relations to an unlinked orphan session", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "评审实现方案",
    }),
    event("orphan-result", "session-orphan", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "未关联的后台评审结果",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].name, "评审实现方案");
  assertEquals(result.relations, []);
});

Deno.test("splits a clear goal transition inside one session", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("answer-a", "session-a", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Token 聚合已完成",
    }),
    event("goal-b", "session-a", "2026-07-14T11:03:00.000Z", "message", {
      role: "user",
      contentPreview: "另外一个任务：设计发布说明",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "实现 Token 聚合",
    "设计发布说明",
  ]);
});

Deno.test("keeps implicitly related source turns in the same task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 tokens.ts 的 Token 聚合",
    }),
    event("answer-a", "session-a", "2026-07-14T11:02:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "assistant",
      contentPreview: "Token 聚合已完成",
    }),
    event("goal-b", "session-a", "2026-07-14T11:03:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "为 tokens.ts 补齐重复事件处理",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), ["实现 tokens.ts 的 Token 聚合"]);
  assertEquals(result.tasks.map((task) => task.sourceTurnIds), [["turn-a", "turn-b"]]);
});

Deno.test("does not use a fixed inactivity gap as a task boundary", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("answer-a", "session-a", "2026-07-14T11:02:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "assistant",
      contentPreview: "Token 聚合已完成",
    }),
    event("goal-b", "session-a", "2026-07-14T13:03:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "设计发布说明",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), ["实现 Token 聚合"]);
});

Deno.test("splits a named work object introduced after a long gap", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "规划当前 MVP 的剩余工作",
    }),
    event("goal-b", "session-a", "2026-07-14T13:03:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "总结产品能力并重写 README",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "规划当前 MVP 的剩余工作",
    "总结产品能力并重写 README",
  ]);
});

Deno.test("splits native source turns only on strong goal transition evidence", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 #86 的 Source Turn",
    }),
    event("goal-b", "session-a", "2026-07-14T11:03:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "另外一个任务：实现 #87 的发布页",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "实现 #86 的 Source Turn",
    "实现 #87 的发布页",
  ]);
  assertEquals(result.tasks.map((task) => task.sourceTurnIds), [["turn-a"], ["turn-b"]]);
});

Deno.test("keeps an explicit follow-up source turn in the same task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 #86 的 Source Turn",
    }),
    event("goal-b", "session-a", "2026-07-14T11:03:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "继续 #86，补上工具配对测试",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceTurnIds, ["turn-a", "turn-b"]);
});

Deno.test("splits native turns when the named work object changes", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "更新 README 的用户能力说明",
    }),
    event("goal-b", "session-a", "2026-07-14T11:15:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "调研 Obsidian 可视化插件的展示方式",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "更新 README 的用户能力说明",
    "调研 Obsidian 可视化插件的展示方式",
  ]);
});

Deno.test("splits panel implementation from a later open-source delivery goal", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "完成真实 Skill 资产面板接入",
    }),
    event("choice", "session-a", "2026-07-14T11:05:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "A",
    }),
    event("goal-b", "session-a", "2026-07-15T01:10:00.000Z", "message", {
      sourceTurnId: "turn-c",
      turnBoundary: "native",
      role: "user",
      contentPreview: "做下公开化改造，然后提交这个项目到 GitHub",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "完成真实 Skill 资产面板接入",
    "做下公开化改造，然后提交这个项目到 GitHub",
  ]);
  assertEquals(result.tasks.map((task) => task.sourceTurnIds), [
    ["turn-a", "turn-b"],
    ["turn-c"],
  ]);
});

Deno.test("keeps short confirmations continuations and choices in the current task", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Skill 资产面板",
    }),
    event("continue", "session-a", "2026-07-14T11:01:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "继续",
    }),
    event("confirm", "session-a", "2026-07-14T11:02:00.000Z", "message", {
      sourceTurnId: "turn-c",
      turnBoundary: "native",
      role: "user",
      contentPreview: "确认",
    }),
    event("choice", "session-a", "2026-07-14T11:03:00.000Z", "message", {
      sourceTurnId: "turn-d",
      turnBoundary: "native",
      role: "user",
      contentPreview: "A",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceTurnIds, ["turn-a", "turn-b", "turn-c", "turn-d"]);
});

Deno.test("splits a new named work object after a generic confirmation", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "更新 README 的安装说明",
    }),
    event("confirm", "session-a", "2026-07-14T11:05:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "确认发布",
    }),
    event("goal-b", "session-a", "2026-07-14T11:10:00.000Z", "message", {
      sourceTurnId: "turn-c",
      turnBoundary: "native",
      role: "user",
      contentPreview: "调研 Obsidian 可视化插件的看板能力",
    }),
  ], window);
  assertEquals(result.tasks.map((task) => task.name), [
    "更新 README 的安装说明",
    "调研 Obsidian 可视化插件的看板能力",
  ]);
  assertEquals(result.tasks.map((task) => task.sourceTurnIds), [
    ["turn-a", "turn-b"],
    ["turn-c"],
  ]);
});

Deno.test("splits a comparison task when the user starts implementation", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "比较四个任务插件的数据能力",
    }),
    event("goal-b", "session-a", "2026-07-14T11:10:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "那集成 TaskNotes",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
});

Deno.test("splits substantial questions about different work objects", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "评估动态 dashboard 的实现难度",
    }),
    event("goal-b", "session-a", "2026-07-14T11:10:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "如何生成指定日期的日报",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
});

Deno.test("keeps refinements of the same named work object together", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "设计 dashboard 的任务概览",
    }),
    event("goal-b", "session-a", "2026-07-14T11:10:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "给 dashboard 补充项目完整度指标",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
});

Deno.test("keeps referential image feedback in the same task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "优化生成结果的删除交互",
    }),
    event("goal-b", "session-a", "2026-07-14T11:10:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "这个生图是不是还需要删除图片？ <image path=/synthetic/result.png>",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceTurnIds, ["turn-a", "turn-b"]);
});

Deno.test("keeps corrective feedback in the same task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "设计新版体验流程和 PRD",
    }),
    event("goal-b", "session-a", "2026-07-14T13:10:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "不需要是否体验的判断，PRD 去掉这一项",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
});

Deno.test("keeps verification execution in the implementation task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "修复 agent center 页面布局",
    }),
    event("goal-b", "session-a", "2026-07-14T11:20:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "执行 Playwright UI 验证",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
});

Deno.test("keeps multiple artifacts in one product-delivery task", () => {
  const result = reconstructTaskBoundaries([
    event("goal-a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "细化客户需求并更新 requirements.md",
    }),
    event("goal-b", "session-a", "2026-07-14T11:20:00.000Z", "message", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "在 prototype.html 补充对应 mock",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
});

Deno.test("retains source turn ids from non-user activity appended to a task", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Source Turn",
    }),
    event("verify", "session-a", "2026-07-14T11:03:00.000Z", "tool_call", {
      sourceTurnId: "turn-b",
      turnBoundary: "native",
      toolName: "deno_test",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceTurnIds, ["turn-a", "turn-b"]);
});

Deno.test("keeps nearby same-project sessions separate without strong evidence", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "优化解析器",
    }),
    event("b", "session-b", "2026-07-14T11:02:00.000Z", "message", {
      role: "user",
      contentPreview: "设计日报视觉",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.relations.length, 1);
  assertEquals(result.relations[0].type, "candidate");
  assertEquals(result.relations[0].merged, false);
});

Deno.test("merges cross-session work with a shared issue anchor", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 #52 的事实聚合",
    }),
    event("b", "session-b", "2026-07-14T12:00:00.000Z", "message", {
      role: "user",
      contentPreview: "继续 #52，补上回归测试",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceSessionIds, ["session-a", "session-b"]);
  assertEquals(result.relations, []);
});

Deno.test("links a shared deliverable across sessions without merging tasks", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "更新 release-notes.md 的阶段一说明",
    }),
    event("b", "session-b", "2026-07-14T12:00:00.000Z", "message", {
      role: "user",
      contentPreview: "评审 release-notes.md 的内容",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.relations.length, 1);
  assertEquals(result.relations[0].type, "shared_deliverable");
  assertEquals(result.relations[0].merged, false);
});

Deno.test("does not merge an artifact-sharing session whose first goal is substantive", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "输出 video-prd.md 的产品方案",
    }),
    event("b", "session-b", "2026-07-14T12:00:00.000Z", "message", {
      role: "user",
      contentPreview: "评审 video-prd.md 的技术流程",
    }),
    event("c", "session-b", "2026-07-14T12:05:00.000Z", "message", {
      role: "user",
      contentPreview: "继续",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.relations.filter((relation) => relation.merged).length, 0);
  assertEquals(result.relations[0].type, "shared_deliverable");
});

Deno.test("normalizes a GitHub issue URL and a short issue reference", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 #53 的任务关系图",
    }),
    event("b", "session-b", "2026-07-14T12:00:00.000Z", "message", {
      role: "user",
      contentPreview: "继续 https://github.com/example/insights/issues/53，补上混合引用测试",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceSessionIds, ["session-a", "session-b"]);
  assertEquals(result.relations, []);
});

Deno.test("does not merge bare issue numbers across different projects", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 #53 的任务关系图",
      projectRef: "project-a",
    }),
    event("b", "session-b", "2026-07-14T11:05:00.000Z", "message", {
      role: "user",
      contentPreview: "继续 #53，修复另一个仓库",
      projectRef: "project-b",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.relations.length, 0);
});

Deno.test("infers the project from a GitHub repository anchor before a generic cwd", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      projectLabel: "Desktop",
      contentPreview: "修复 https://github.com/example/insights/issues/53 的日报任务关系图",
    }),
  ], window);
  assertEquals(result.tasks[0].projectLabel, "insights");
});

Deno.test("infers a repository root from an explicit file path before a generic cwd", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      projectLabel: "Desktop",
      contentPreview: "更新 /workspace/ai-collaboration-insights/docs/README.md 的发布说明",
    }),
  ], window);
  assertEquals(result.tasks[0].projectLabel, "ai-collaboration-insights");
});

Deno.test("does not treat a referenced Skill installation path as the task project", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      projectLabel: "style-work-backend",
      contentPreview:
        "[$prd-architect](/Users/example/.config/skillshare/skills/prd-architect/SKILL.md) 优化客户 PRD",
    }),
  ], window);
  assertEquals(result.tasks[0].projectLabel, "style-work-backend");
});

Deno.test("prefers a specific task-local project label over generic cwd labels", () => {
  const result = reconstructTaskBoundaries([
    event("goal", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      projectLabel: "Desktop",
      contentPreview: "开始处理客户报价需求",
    }),
    event("generic-a", "session-a", "2026-07-14T11:00:20.000Z", "tool_call", {
      projectLabel: "Desktop",
      toolName: "read",
    }),
    event("generic-b", "session-a", "2026-07-14T11:00:40.000Z", "tool_result", {
      projectLabel: "feature-57-eval-release",
      toolName: "read",
    }),
    event("detail", "session-a", "2026-07-14T11:01:00.000Z", "tool_call", {
      projectLabel: "style-work-backend",
      toolName: "read",
    }),
  ], window);
  assertEquals(result.tasks[0].projectLabel, "style-work-backend");
});

Deno.test("links a child session through the normalized subagent run identity", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "评审实现方案",
    }),
    event("spawn", "session-parent", "2026-07-14T11:01:00.000Z", "subagent", {
      subagentRunId: "session-child",
      subagentStatus: "started",
    }),
    event("child", "session-child", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "评审发现一个边界问题",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceSessionIds, ["session-child", "session-parent"]);
  assertEquals(result.relations, []);
});

Deno.test("attaches delegated child sessions to their own parent turns", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal-a", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("spawn-a", "session-parent", "2026-07-14T11:01:00.000Z", "subagent", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      subagentRunId: "session-child-a",
      subagentStatus: "started",
    }),
    event("parent-goal-b", "session-parent", "2026-07-14T13:03:00.000Z", "message", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "另外一个任务：设计发布说明",
    }),
    event("spawn-b", "session-parent", "2026-07-14T13:04:00.000Z", "subagent", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      subagentRunId: "session-child-b",
      subagentStatus: "started",
    }),
    event("child-a", "session-child-a", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "聚合实现评审完成",
    }),
    event("child-b", "session-child-b", "2026-07-14T13:05:00.000Z", "message", {
      role: "assistant",
      contentPreview: "发布说明评审完成",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-child-a", "session-parent"],
    ["session-child-b", "session-parent"],
  ]);
  assertEquals(result.relations, []);
});

Deno.test("does not publish delegated child prompts without a human goal in the window", () => {
  const result = reconstructTaskBoundaries([
    event("child-a", "session-child-a", "2026-07-14T11:00:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "评审聚合实现",
    }),
    event("child-b", "session-child-b", "2026-07-14T11:05:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "评审聚合测试",
    }),
  ], window);
  assertEquals(result.tasks.length, 0);
  assertEquals(result.relations.length, 0);
});

Deno.test("keeps a human fork separate when parent metadata has no delegation lifecycle", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn",
      turnBoundary: "native",
      sourceSessionRole: "root",
      role: "user",
      contentPreview: "实现 Source Turn",
    }),
    event("fork-goal", "session-fork", "2026-07-14T11:02:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      sourceTurnId: "fork-turn",
      turnBoundary: "native",
      sourceSessionRole: "root",
      role: "user",
      contentPreview: "研究独立的发布流程",
    }),
  ], window);

  assertEquals(result.tasks.map((task) => task.name), [
    "实现 Source Turn",
    "研究独立的发布流程",
  ]);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-parent"],
    ["session-fork"],
  ]);
  assertEquals(result.relations.filter((relation) => relation.merged), []);
});

Deno.test("attaches a metadata-only child to the nearest parent task segment", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal-a", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("parent-goal-b", "session-parent", "2026-07-14T13:03:00.000Z", "message", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "另外一个任务：设计发布说明",
    }),
    event("child", "session-child", "2026-07-14T13:05:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "发布说明评审完成",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-parent"],
    ["session-child", "session-parent"],
  ]);
  assertEquals(result.tasks.map((task) => task.name), ["实现 Token 聚合", "设计发布说明"]);
});

Deno.test("uses parent identity for a metadata-only child outside the nearby window", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("child", "session-child", "2026-07-14T12:00:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "assistant",
      contentPreview: "Token 聚合评审完成",
    }),
  ], window);

  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceSessionIds, ["session-child", "session-parent"]);
  assertEquals(result.relations, []);
});

Deno.test("does not bridge two nearby parent segments through one metadata child", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal-a", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("parent-goal-b", "session-parent", "2026-07-14T11:12:00.000Z", "message", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "另外一个任务：设计发布说明",
    }),
    event("child", "session-child", "2026-07-14T11:13:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "assistant",
      contentPreview: "发布说明评审完成",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-parent"],
    ["session-child", "session-parent"],
  ]);
});

Deno.test("attaches reused delegated child turns to separate parent task segments", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal-a", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Token 聚合",
    }),
    event("spawn-a", "session-parent", "2026-07-14T11:01:00.000Z", "subagent", {
      sourceTurnId: "parent-turn-a",
      turnBoundary: "native",
      subagentRunId: "session-child",
      subagentStatus: "started",
    }),
    event("parent-goal-b", "session-parent", "2026-07-14T11:12:00.000Z", "message", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      role: "user",
      contentPreview: "另外一个任务：设计发布说明",
    }),
    event("spawn-b", "session-parent", "2026-07-14T11:13:00.000Z", "subagent", {
      sourceTurnId: "parent-turn-b",
      turnBoundary: "native",
      subagentRunId: "session-child",
      subagentStatus: "interacted",
    }),
    event("child-a", "session-child", "2026-07-14T11:02:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      sourceTurnId: "child-turn-a",
      turnBoundary: "native",
      role: "assistant",
      contentPreview: "Token 聚合评审完成",
    }),
    event("child-b", "session-child", "2026-07-14T11:14:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      sourceTurnId: "child-turn-b",
      turnBoundary: "native",
      role: "assistant",
      contentPreview: "发布说明评审完成",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-child", "session-parent"],
    ["session-child", "session-parent"],
  ]);
  assertEquals(result.tasks.map((task) => task.sourceTurnIds), [
    ["child-turn-a", "parent-turn-a"],
    ["child-turn-b", "parent-turn-b"],
  ]);
});

Deno.test("does not reverse-link a human-goal root candidate as a delegated child", () => {
  const result = reconstructTaskBoundaries([
    event("root-goal", "session-root", "2026-07-14T11:00:00.000Z", "message", {
      sourceTurnId: "root-turn",
      turnBoundary: "native",
      role: "user",
      contentPreview: "实现 Source Turn 主干",
    }),
    event("other-goal", "session-other", "2026-07-14T11:01:00.000Z", "message", {
      sourceTurnId: "other-turn",
      turnBoundary: "native",
      role: "user",
      contentPreview: "评审独立发布流程",
    }),
    event("bad-reference", "session-other", "2026-07-14T11:02:00.000Z", "subagent", {
      sourceTurnId: "other-turn",
      turnBoundary: "native",
      subagentRunId: "session-root",
      subagentStatus: "started",
    }),
  ], window);
  assertEquals(result.tasks.length, 2);
  assertEquals(result.tasks.map((task) => task.sourceSessionIds), [
    ["session-root"],
    ["session-other"],
  ]);
  assertEquals(result.relations.filter((relation) => relation.merged), []);
});

Deno.test("does not chain sibling metadata sessions across separate delegation batches", () => {
  const result = reconstructTaskBoundaries([
    event("parent", "session-parent", "2026-07-14T10:59:00.000Z", "message", {
      role: "user",
      contentPreview: "评审 Source Turn 实现",
    }),
    event("child-a", "session-child-a", "2026-07-14T11:00:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "第一批评审完成",
    }),
    event("child-b", "session-child-b", "2026-07-14T11:15:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "第一批测试完成",
    }),
    event("child-c", "session-child-c", "2026-07-14T11:30:00.000Z", "message", {
      parentSourceSessionId: "session-parent",
      role: "user",
      contentPreview: "第二批评审完成",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].sourceSessionIds, [
    "session-child-a",
    "session-child-b",
    "session-parent",
  ]);
});

Deno.test("deduplicates weak relations after strong task merges", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 #53 的任务关系图",
    }),
    event("b", "session-b", "2026-07-14T11:05:00.000Z", "message", {
      role: "user",
      contentPreview: "继续 #53，补任务边界测试",
    }),
    event("c", "session-c", "2026-07-14T11:08:00.000Z", "message", {
      role: "user",
      contentPreview: "记录一个独立的解析问题",
    }),
  ], window);
  const candidates = result.relations.filter((relation) => relation.type === "candidate");
  assertEquals(result.tasks.length, 2);
  assertEquals(candidates.length, 1);
  assert(candidates.every((relation) => relation.fromTaskId !== relation.toTaskId));
});

Deno.test("drops weak self-relations created by transitive strong merges", () => {
  const result = reconstructTaskBoundaries([
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现 #53 的任务关系图",
    }),
    event("b", "session-b", "2026-07-14T11:02:00.000Z", "message", {
      role: "user",
      contentPreview: "补充 #54 的轮次测试",
    }),
    event("c", "session-c", "2026-07-14T11:04:00.000Z", "message", {
      role: "user",
      contentPreview: "继续 #53 和 #54，串联两个实现",
    }),
  ], window);
  assertEquals(result.tasks.length, 1);
  assertEquals(
    result.relations.filter((relation) => relation.type === "candidate").length,
    0,
  );
});

Deno.test("never publishes relations whose endpoints collapse into the same task", () => {
  const result = reconstructTaskBoundaries([
    event("parent-goal", "session-parent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "评审 Source Turn 实现",
    }),
    event("spawn", "session-parent", "2026-07-14T11:01:00.000Z", "subagent", {
      subagentRunId: "session-child",
      subagentStatus: "started",
    }),
    event("child", "session-child", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "评审完成",
    }),
  ], window);

  assertEquals(result.tasks.length, 1);
  assert(result.relations.every((relation) => relation.fromTaskId !== relation.toTaskId));
});
