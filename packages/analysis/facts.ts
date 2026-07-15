import type {
  DistributionSummary,
  ReportWindow,
  UnifiedEvent,
  Usage,
  UsageDistributions,
} from "../core/types.ts";

const ACTIVE_SEGMENT_MS = 5 * 60 * 1000;
const USAGE_KEYS = [
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
] as const;

export interface SessionFact {
  sessionId: string;
  messages: number;
  toolCalls: number;
  activeMinutes: number;
  tokens: Usage;
}

export interface SessionFactsResult {
  sessions: SessionFact[];
  totals: {
    tokens: Usage;
    subagentRuns: number;
    subagentInterrupted: number;
    activeMinutes: number;
  };
  distributions: UsageDistributions;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function usageValue(usage: Usage): number {
  return usage.totalTokens ??
    (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0);
}

function addUsage(target: Usage, source: Usage): void {
  for (const key of USAGE_KEYS) {
    if (source[key] !== undefined) target[key] = (target[key] ?? 0) + source[key]!;
  }
}

function maxUsage(events: UnifiedEvent[]): Usage {
  const peak = events.filter((event) => event.usage).toSorted((left, right) =>
    usageValue(right.usage!) - usageValue(left.usage!) ||
    right.timestamp.localeCompare(left.timestamp)
  )[0]?.usage;
  return peak ? { ...peak } : {};
}

function sessionUsage(events: UnifiedEvent[]): Usage {
  const cumulative = events.filter((event) => event.usageSemantics === "session_cumulative");
  const unknown = events.filter((event) => event.usageSemantics === "unknown_snapshot");
  const increments = events.filter((event) => event.usageSemantics === "call_increment");
  const result = maxUsage(cumulative.length > 0 ? cumulative : unknown);
  for (const event of increments) if (event.usage) addUsage(result, event.usage);
  return result;
}

function isActivity(event: UnifiedEvent): boolean {
  return event.kind === "message" || event.kind === "tool_call" || event.kind === "tool_result" ||
    event.kind === "subagent";
}

function unionMilliseconds(events: UnifiedEvent[], window: ReportWindow): number {
  const windowStart = Date.parse(window.start);
  const windowEnd = Date.parse(window.end);
  const intervals = events.filter(isActivity).map((event) => {
    const timestamp = Date.parse(event.timestamp);
    return [
      Math.max(timestamp, windowStart),
      Math.min(timestamp + ACTIVE_SEGMENT_MS, windowEnd),
    ] as const;
  }).filter(([start, end]) => end > start).sort((left, right) => left[0] - right[0]);
  if (intervals.length === 0) return 0;
  let [start, end] = intervals[0];
  let total = 0;
  for (const interval of intervals.slice(1)) {
    if (interval[0] <= end) end = Math.max(end, interval[1]);
    else {
      total += end - start;
      [start, end] = interval;
    }
  }
  return total + end - start;
}

export function unionActiveMinutes(events: UnifiedEvent[], window: ReportWindow): number {
  return round(unionMilliseconds(events, window) / 60_000);
}

export function distribution(values: number[]): DistributionSummary {
  if (values.length === 0) return { sampleSize: 0, mean: 0, median: 0, p90: 0 };
  const ordered = values.toSorted((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
  const p90Index = Math.max(0, Math.ceil(ordered.length * 0.9) - 1);
  return {
    sampleSize: ordered.length,
    mean: round(ordered.reduce((sum, value) => sum + value, 0) / ordered.length),
    median: round(median),
    p90: round(ordered[p90Index]),
  };
}

export function buildSessionFacts(
  events: UnifiedEvent[],
  window: ReportWindow,
): SessionFactsResult {
  const bySession = new Map<string, UnifiedEvent[]>();
  for (const event of events) {
    const session = bySession.get(event.sourceSessionId) ?? [];
    session.push(event);
    bySession.set(event.sourceSessionId, session);
  }
  const sessions = [...bySession.entries()].map(([sessionId, sessionEvents]): SessionFact => ({
    sessionId,
    messages: sessionEvents.filter((event) => event.kind === "message").length,
    toolCalls: sessionEvents.filter((event) => event.kind === "tool_call").length,
    activeMinutes: unionActiveMinutes(sessionEvents, window),
    tokens: sessionUsage(sessionEvents),
  })).toSorted((left, right) => left.sessionId.localeCompare(right.sessionId));
  const tokens: Usage = {};
  for (const session of sessions) addUsage(tokens, session.tokens);
  const runStatuses = new Map<string, Set<UnifiedEvent["subagentStatus"]>>();
  for (const event of events.filter((item) => item.kind === "subagent")) {
    const runId = event.subagentRunId ?? event.eventId;
    const statuses = runStatuses.get(runId) ?? new Set();
    statuses.add(event.subagentStatus ?? "unknown");
    runStatuses.set(runId, statuses);
  }
  return {
    sessions,
    totals: {
      tokens,
      subagentRuns: runStatuses.size,
      subagentInterrupted:
        [...runStatuses.values()].filter((statuses) => statuses.has("interrupted")).length,
      activeMinutes: unionActiveMinutes(events, window),
    },
    distributions: {
      messagesPerSession: distribution(sessions.map((session) => session.messages)),
      toolCallsPerSession: distribution(sessions.map((session) => session.toolCalls)),
      tokensPerSession: distribution(sessions.map((session) => usageValue(session.tokens))),
      activeMinutesPerSession: distribution(sessions.map((session) => session.activeMinutes)),
    },
  };
}
