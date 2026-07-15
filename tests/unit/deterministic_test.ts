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
