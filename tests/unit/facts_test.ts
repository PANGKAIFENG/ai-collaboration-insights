import { assertEquals } from "../_assert.ts";
import {
  buildSessionFacts,
  distribution,
  unionActiveMinutes,
} from "../../packages/analysis/facts.ts";
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
    availability: "available",
    ...overrides,
  };
}

Deno.test("uses one cumulative usage peak per session instead of summing snapshots", () => {
  const facts = buildSessionFacts([
    event("u1", "session-a", "2026-07-14T11:00:00.000Z", "usage", {
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      usageSemantics: "session_cumulative",
    }),
    event("u2", "session-a", "2026-07-14T11:01:00.000Z", "usage", {
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      usageSemantics: "session_cumulative",
    }),
    event("u3", "session-a", "2026-07-14T11:02:00.000Z", "usage", {
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      usageSemantics: "session_cumulative",
    }),
    event("u4", "session-b", "2026-07-14T11:03:00.000Z", "usage", {
      usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
      usageSemantics: "session_cumulative",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(facts.totals.tokens, {
    inputTokens: 160,
    outputTokens: 40,
    totalTokens: 200,
  });
});

Deno.test("unions human-active intervals globally across projects", () => {
  const events = [
    event("a", "session-a", "2026-07-14T11:00:00.000Z", "message", {
      role: "user",
      projectRef: "project-a",
    }),
    event("b", "session-b", "2026-07-14T11:01:00.000Z", "message", {
      role: "user",
      projectRef: "project-b",
    }),
  ];
  assertEquals(
    unionActiveMinutes(events, reportDateWindow("2026-07-15", "Asia/Shanghai")),
    6,
  );
});

Deno.test("counts unique subagent runs and reports sample-aware distributions", () => {
  const facts = buildSessionFacts([
    event("s1", "session-a", "2026-07-14T11:00:00.000Z", "subagent", {
      subagentRunId: "run-a",
      subagentStatus: "started",
    }),
    event("s2", "session-a", "2026-07-14T11:01:00.000Z", "subagent", {
      subagentRunId: "run-a",
      subagentStatus: "interacted",
    }),
    event("s3", "session-a", "2026-07-14T11:02:00.000Z", "subagent", {
      subagentRunId: "run-a",
      subagentStatus: "interrupted",
    }),
    event("s4", "session-b", "2026-07-14T11:03:00.000Z", "subagent", {
      subagentRunId: "run-b",
      subagentStatus: "started",
    }),
  ], reportDateWindow("2026-07-15", "Asia/Shanghai"));
  assertEquals(facts.totals.subagentRuns, 2);
  assertEquals(facts.totals.subagentInterrupted, 1);
  assertEquals(distribution([1, 3, 8, 10]), {
    sampleSize: 4,
    mean: 5.5,
    median: 5.5,
    p90: 10,
  });
});
