import { assertEquals } from "../_assert.ts";
import { assembleSourceTurns } from "../../packages/analysis/turns.ts";
import { EVENT_SCHEMA_VERSION, type UnifiedEvent } from "../../packages/core/types.ts";

function event(
  eventId: string,
  sourceTurnId: string,
  kind: UnifiedEvent["kind"],
  overrides: Partial<UnifiedEvent> = {},
): UnifiedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    parserVersion: "2",
    eventId,
    sourceTool: "codex",
    sourceSessionId: "session-a",
    sourceTurnId,
    turnBoundary: "native",
    timestamp: `2026-07-14T11:00:0${eventId.length}.000Z`,
    kind,
    availability: "available",
    ...overrides,
  };
}

Deno.test("assembles matched and unmatched tool diagnostics per source turn", () => {
  const result = assembleSourceTurns([
    event("context", "turn-a", "turn_context"),
    event("call", "turn-a", "tool_call", { toolCallId: "tool-a" }),
    event("result", "turn-a", "tool_result", { toolCallId: "tool-a" }),
    event("orphan", "turn-a", "tool_result", { toolCallId: "tool-b" }),
  ]);
  assertEquals(result.turns.length, 1);
  assertEquals(result.turns[0].toolPairs.map((pair) => pair.status), [
    "matched",
    "unmatched_result",
  ]);
  assertEquals(result.diagnostics.unmatchedToolCalls, 0);
  assertEquals(result.diagnostics.unmatchedToolResults, 1);
});

Deno.test("does not assemble pure scaffolding without a source turn", () => {
  const scaffolding = event("scaffold", "", "message", {
    sourceTurnId: undefined,
    turnBoundary: undefined,
    role: "user",
    contentPreview: "# AGENTS.md instructions",
  });

  const result = assembleSourceTurns([scaffolding]);

  assertEquals(result.turns, []);
  assertEquals(result.diagnostics.eventsWithoutTurn, 1);
});

Deno.test("reports a call without native call id as unmatched", () => {
  const result = assembleSourceTurns([
    event("call-without-id", "turn-a", "tool_call", { toolCallId: undefined }),
  ]);

  assertEquals(result.turns[0].toolPairs, [{
    toolCallId: "event:call-without-id",
    callEventId: "call-without-id",
    resultEventId: undefined,
    status: "unmatched_call",
  }]);
  assertEquals(result.diagnostics.unmatchedToolCalls, 1);
  assertEquals(result.diagnostics.unmatchedToolResults, 0);
});

Deno.test("reports a result without native call id as unmatched", () => {
  const result = assembleSourceTurns([
    event("result-without-id", "turn-a", "tool_result", { toolCallId: undefined }),
  ]);

  assertEquals(result.turns[0].toolPairs, [{
    toolCallId: "event:result-without-id",
    callEventId: undefined,
    resultEventId: "result-without-id",
    status: "unmatched_result",
  }]);
  assertEquals(result.diagnostics.unmatchedToolCalls, 0);
  assertEquals(result.diagnostics.unmatchedToolResults, 1);
});

Deno.test("never pairs a call and result that both lack native call ids", () => {
  const result = assembleSourceTurns([
    event("call-without-id", "turn-a", "tool_call", { toolCallId: undefined }),
    event("result-without-id", "turn-a", "tool_result", { toolCallId: undefined }),
  ]);

  assertEquals(result.turns[0].toolPairs.map((pair) => pair.status), [
    "unmatched_call",
    "unmatched_result",
  ]);
  assertEquals(result.diagnostics.unmatchedToolCalls, 1);
  assertEquals(result.diagnostics.unmatchedToolResults, 1);
});
