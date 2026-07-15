import { assertEquals } from "../_assert.ts";
import { analyzeDeterministically } from "../../packages/analysis/deterministic.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";
import { reportDateWindow } from "../../packages/core/time.ts";

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
    sourceSessionId: "session",
    timestamp,
    kind,
    projectRef: "project-a",
    projectLabel: "alpha",
    availability: "available",
    ...overrides,
  };
}

Deno.test("builds five-minute activity segments and merges a twenty-minute project gap", () => {
  const result = analyzeDeterministically([
    event("u1", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Implement daily report",
    }),
    event("a1", "2026-07-14T11:03:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Implemented the report.",
    }),
    event("u2", "2026-07-14T11:22:00.000Z", "message", {
      role: "user",
      contentPreview: "Fix the boundary case",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 1);
  assertEquals(result.workBlocks[0].activeMinutes, 13);
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].name, "Implement daily report");
});

Deno.test("never merges activity from different projects", () => {
  const result = analyzeDeterministically([
    event("a", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("b", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      projectRef: "project-b",
      projectLabel: "beta",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 2);
});

Deno.test("counts tokens and subagents without adding parallel duration", () => {
  const result = analyzeDeterministically([
    event("u", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("tokens", "2026-07-14T11:01:00.000Z", "usage", {
      usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
      usageSemantics: "session_cumulative",
    }),
    event("agent", "2026-07-14T11:02:00.000Z", "subagent", {
      subagentDepth: 1,
      subagentRunId: "run-a",
      subagentStatus: "started",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.usageMetrics.tokens.totalTokens, 125);
  assertEquals(result.usageMetrics.subagentCalls, 1);
  assertEquals(result.usageMetrics.activeMinutes, 7);
});

Deno.test("does not double count overlapping activity across projects", () => {
  const result = analyzeDeterministically([
    event("a", "2026-07-14T11:00:00.000Z", "message", { role: "user" }),
    event("b", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      sourceSessionId: "session-b",
      projectRef: "project-b",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.workBlocks.length, 2);
  assertEquals(result.usageMetrics.activeMinutes, 6);
});

Deno.test("preserves total rounds while exposing at most five key rounds and one packet per task", () => {
  const events: UnifiedEvent[] = [
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Implement semantic rounds",
    }),
    event("attempt-0", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "apply_patch",
      contentDigest: "attempt-0",
    }),
  ];
  for (let index = 1; index <= 6; index++) {
    const feedbackMinute = String(index * 2).padStart(2, "0");
    const attemptMinute = String(index * 2 + 1).padStart(2, "0");
    events.push(
      event(`feedback-${index}`, `2026-07-14T11:${feedbackMinute}:00.000Z`, "message", {
        role: "user",
        contentPreview: `Adjust approach ${index}`,
      }),
      event(`attempt-${index}`, `2026-07-14T11:${attemptMinute}:00.000Z`, "tool_call", {
        toolName: "apply_patch",
        contentDigest: `attempt-${index}`,
      }),
    );
  }
  const result = analyzeDeterministically(
    events,
    reportDateWindow("2026-07-15", "Asia/Shanghai"),
  );
  assertEquals(result.tasks.length, 1);
  assertEquals(result.tasks[0].semanticRoundCount, 7);
  assertEquals(result.tasks[0].effectiveRoundCount, 6);
  assertEquals(result.tasks[0].keyRounds.length, 5);
  assertEquals(result.evidencePackets.length, 1);
  assertEquals(result.evidencePackets[0].taskId, result.tasks[0].id);
});

Deno.test("does not promote a repeated failure loop to iteration evidence", () => {
  const result = analyzeDeterministically([
    event("intent", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      contentPreview: "Run the same check",
    }),
    event("test-1", "2026-07-14T11:01:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failure-1", "2026-07-14T11:02:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
    event("test-2", "2026-07-14T11:03:00.000Z", "tool_call", {
      toolName: "deno_test",
      contentDigest: "same-test",
    }),
    event("failure-2", "2026-07-14T11:04:00.000Z", "message", {
      role: "assistant",
      contentPreview: "Tests failed with the same error",
      contentDigest: "same-error",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(result.tasks[0].hasIteration, false);
  assertEquals(result.tasks[0].effectiveRoundCount, 0);
  assertEquals(result.evidence.some((item) => item.type === "iteration"), false);
});
