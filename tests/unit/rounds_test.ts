import { assert, assertEquals } from "../_assert.ts";
import { segmentSemanticRounds } from "../../packages/analysis/rounds.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";

function event(
  id: string,
  timestamp: string,
  kind: UnifiedEvent["kind"],
  overrides: Partial<UnifiedEvent> = {},
): UnifiedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: id,
    sourceTool: "codex",
    sourceSessionId: "session-a",
    timestamp,
    kind,
    projectRef: "project-a",
    projectLabel: "alpha",
    availability: "available",
    ...overrides,
  };
}

Deno.test("keeps consecutive tool calls inside one semantic attempt", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现日报",
    }),
    event("read", "2026-07-14T11:01:00.000Z", "tool_call", { toolName: "read_file" }),
    event("patch", "2026-07-14T11:02:00.000Z", "tool_call", { toolName: "apply_patch" }),
    event("result", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "实现完成",
    }),
  ]);
  assertEquals(rounds.length, 1);
  assertEquals(rounds[0].attemptEventIds, ["read", "patch"]);
  assertEquals(rounds[0].status, "baseline");
});

Deno.test("starts an effective round after user correction", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "实现日报",
    }),
    event("draft", "2026-07-14T11:01:00.000Z", "message", {
      role: "assistant",
      contentPreview: "先做了一个草稿",
    }),
    event("correction", "2026-07-14T11:02:00.000Z", "message", {
      role: "user",
      contentPreview: "不对，请改为任务级分析",
    }),
    event("patch", "2026-07-14T11:03:00.000Z", "tool_call", { toolName: "apply_patch" }),
  ]);
  assertEquals(rounds.length, 2);
  assertEquals(rounds[1].trigger, "user_feedback");
  assertEquals(rounds[1].feedbackEventIds, ["correction"]);
  assertEquals(rounds[1].status, "effective");
});

Deno.test("separates test feedback fix and retest without counting final feedback as iteration", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "修复解析器",
    }),
    event("test-1", "2026-07-14T11:01:00.000Z", "tool_call", { toolName: "deno_test" }),
    event("failed", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed: expected one task",
      contentDigest: "failure-a",
    }),
    event("fix", "2026-07-14T11:03:00.000Z", "tool_call", {
      toolName: "apply_patch",
      contentDigest: "fix-a",
    }),
    event("test-2", "2026-07-14T11:04:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "test-b",
    }),
    event("passed", "2026-07-14T11:05:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests passed",
    }),
  ]);
  assertEquals(rounds.length, 3);
  assertEquals(rounds[1].status, "effective");
  assertEquals(rounds[2].status, "pending");
  assertEquals(rounds.filter((round) => round.status === "effective").length, 1);
});

Deno.test("marks repeated identical actions and failures as an ineffective loop", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "运行检查",
    }),
    event("test-1", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failed-1", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
    event("test-2", "2026-07-14T11:03:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failed-2", "2026-07-14T11:04:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
  ]);
  assert(rounds.some((round) => round.status === "ineffective"));
  assert(rounds.some((round) => round.loopReason === "repeated_action_or_feedback"));
  assertEquals(rounds.filter((round) => round.status === "effective").length, 0);
});

Deno.test("detects consecutive repeated tools when Codex omits an action digest", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Inspect the same file",
    }),
    event("read-1", "2026-07-14T11:01:00.000Z", "tool_call", { toolName: "read_file" }),
    event("read-2", "2026-07-14T11:02:00.000Z", "tool_call", { toolName: "read_file" }),
  ]);
  assertEquals(rounds.length, 1);
  assertEquals(rounds[0].status, "ineffective");
  assertEquals(rounds[0].loopReason, "repeated_action_or_feedback");
});

Deno.test("keeps subagent polling as lifecycle evidence without adding rounds", () => {
  const rounds = segmentSemanticRounds("task-1", [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "委派评审",
    }),
    event("started", "2026-07-14T11:01:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "started",
    }),
    event("poll-1", "2026-07-14T11:02:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "interacted",
    }),
    event("poll-2", "2026-07-14T11:03:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "interacted",
    }),
    event("completed", "2026-07-14T11:04:00.000Z", "subagent", {
      subagentRunId: "child",
      subagentStatus: "completed",
    }),
  ]);
  assertEquals(rounds.length, 1);
  assertEquals(rounds[0].lifecycleEventIds, ["started", "poll-1", "poll-2", "completed"]);
  assertEquals(rounds[0].status, "baseline");
});
