import type { SourceTurn, SourceTurnBoundary, ToolPair, UnifiedEvent } from "../core/types.ts";

export interface SourceTurnDiagnostics {
  eventsWithoutTurn: number;
  unmatchedToolCalls: number;
  unmatchedToolResults: number;
}

export interface SourceTurnResult {
  turns: SourceTurn[];
  diagnostics: SourceTurnDiagnostics;
}

interface MutableTurn {
  id: string;
  sourceSessionId: string;
  boundary: SourceTurnBoundary;
  events: UnifiedEvent[];
}

export function isScaffoldingEvent(event: UnifiedEvent): boolean {
  if (event.kind !== "message") return false;
  if (event.role === "developer") return true;
  const text = event.contentPreview?.trim() ?? "";
  return /^(?:#\s*AGENTS\.md instructions|<environment_context>|#\s*Developer instructions|<INSTRUCTIONS>|#\s*(?:Files|Applications) mentioned by the user\s*:|Automation\s*:|<in-app-browser-context\b|<skill\b|#\s*Selected text\b|#\s*Response annotations\b|<heartbeat\b)/i
    .test(text);
}

export function backfillLegacySourceTurns(events: UnifiedEvent[]): void {
  const sessions = new Map<string, UnifiedEvent[]>();
  for (const event of events) {
    const values = sessions.get(event.sourceSessionId) ?? [];
    values.push(event);
    sessions.set(event.sourceSessionId, values);
  }
  for (const sessionEvents of sessions.values()) {
    if (sessionEvents.some((event) => event.sourceTurnId)) continue;
    let activeTurnId: string | undefined;
    const ordered = sessionEvents.toSorted((left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
    );
    for (const event of ordered) {
      const startsTurn = event.kind === "message" && event.role === "user" &&
        (event.sourceSessionRole === "root" ||
          (!event.parentSourceSessionId && event.sourceSessionRole !== "subagent")) &&
        !isScaffoldingEvent(event);
      if (startsTurn) activeTurnId = `inferred:${event.sourceSessionId}:${event.eventId}`;
      if (!activeTurnId || event.kind === "session") continue;
      event.sourceTurnId = activeTurnId;
      event.turnBoundary = "inferred";
    }
  }
}

function boundary(events: UnifiedEvent[]): SourceTurnBoundary {
  if (events.some((event) => event.turnBoundary === "native")) return "native";
  if (events.some((event) => event.turnBoundary === "inferred")) return "inferred";
  return "partial";
}

function pairs(events: UnifiedEvent[]): ToolPair[] {
  const byCall = new Map<string, { calls: UnifiedEvent[]; results: UnifiedEvent[] }>();
  const unmatchedWithoutNativeId: ToolPair[] = [];
  for (const event of events) {
    if (event.kind !== "tool_call" && event.kind !== "tool_result") continue;
    if (!event.toolCallId) {
      unmatchedWithoutNativeId.push({
        toolCallId: `event:${event.eventId}`,
        callEventId: event.kind === "tool_call" ? event.eventId : undefined,
        resultEventId: event.kind === "tool_result" ? event.eventId : undefined,
        status: event.kind === "tool_call" ? "unmatched_call" : "unmatched_result",
      });
      continue;
    }
    const value = byCall.get(event.toolCallId) ?? { calls: [], results: [] };
    if (event.kind === "tool_call") value.calls.push(event);
    else value.results.push(event);
    byCall.set(event.toolCallId, value);
  }
  return [...byCall.entries()].flatMap(([toolCallId, value]): ToolPair[] => {
    const size = Math.max(value.calls.length, value.results.length);
    return Array.from({ length: size }, (_, index) => {
      const call = value.calls[index];
      const result = value.results[index];
      return {
        toolCallId,
        callEventId: call?.eventId,
        resultEventId: result?.eventId,
        status: call && result ? "matched" : call ? "unmatched_call" : "unmatched_result",
      };
    });
  }).concat(unmatchedWithoutNativeId).toSorted((left, right) =>
    (left.callEventId ?? left.resultEventId ?? "").localeCompare(
      right.callEventId ?? right.resultEventId ?? "",
    )
  );
}

export function assembleSourceTurns(events: UnifiedEvent[]): SourceTurnResult {
  backfillLegacySourceTurns(events);
  const grouped = new Map<string, MutableTurn>();
  let eventsWithoutTurn = 0;
  for (const event of events) {
    if (!event.sourceTurnId) {
      if (event.kind !== "session") eventsWithoutTurn++;
      continue;
    }
    const value = grouped.get(event.sourceTurnId) ?? {
      id: event.sourceTurnId,
      sourceSessionId: event.sourceSessionId,
      boundary: event.turnBoundary ?? "partial",
      events: [],
    };
    value.events.push(event);
    grouped.set(event.sourceTurnId, value);
  }
  const turns = [...grouped.values()].map((value): SourceTurn => {
    const ordered = value.events.toSorted((left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
    );
    const turnBoundary = boundary(ordered);
    const toolPairs = pairs(ordered);
    const hasUser = ordered.some((event) => event.kind === "message" && event.role === "user");
    const completeness = turnBoundary === "inferred"
      ? "inferred"
      : turnBoundary === "partial" || !hasUser ||
          toolPairs.some((pair) => pair.status !== "matched")
      ? "partial"
      : "complete";
    return {
      id: value.id,
      sourceSessionId: value.sourceSessionId,
      boundary: turnBoundary,
      completeness,
      start: ordered[0].timestamp,
      end: ordered.at(-1)?.timestamp ?? ordered[0].timestamp,
      eventIds: ordered.map((event) => event.eventId),
      userEventIds: ordered.filter((event) => event.kind === "message" && event.role === "user")
        .map((event) => event.eventId),
      toolPairs,
    };
  }).toSorted((left, right) =>
    left.start.localeCompare(right.start) || left.id.localeCompare(right.id)
  );
  const allPairs = turns.flatMap((turn) => turn.toolPairs);
  return {
    turns,
    diagnostics: {
      eventsWithoutTurn,
      unmatchedToolCalls: allPairs.filter((pair) => pair.status === "unmatched_call").length,
      unmatchedToolResults: allPairs.filter((pair) => pair.status === "unmatched_result").length,
    },
  };
}
