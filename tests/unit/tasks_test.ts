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
  assertEquals(result.relations[0].type, "continuation");
  assertEquals(result.relations[0].merged, true);
  assert(result.relations[0].confidence >= 0.8);
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
  assertEquals(result.relations[0].type, "continuation");
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
  assertEquals(result.relations[0].type, "delegation");
  assertEquals(result.relations[0].merged, true);
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
