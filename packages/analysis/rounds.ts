import type { SemanticRound, SemanticRoundTrigger, UnifiedEvent } from "../core/types.ts";

const FEEDBACK_PATTERN =
  /tests?\s+(?:failed|passed|pass)|(?:test|check|lint|build|verify).*(?:fail|pass)|验证(?:失败|通过)|检查(?:失败|通过)|报错|错误|失败/i;
const APPROACH_PATTERN = /(?:改为|换成|调整方案|另一种|重新实现|instead|different approach)/i;

interface MutableRound extends SemanticRound {
  repeated: boolean;
}

function ordered(events: UnifiedEvent[]): UnifiedEvent[] {
  return events.toSorted((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
  );
}

function isMessage(event: UnifiedEvent, role?: UnifiedEvent["role"]): boolean {
  return event.kind === "message" && (!role || event.role === role);
}

function feedbackTrigger(
  event: UnifiedEvent,
  current: MutableRound | undefined,
): SemanticRoundTrigger | undefined {
  if (!current || current.eventIds.length === 0) return undefined;
  if (isMessage(event, "user")) return "user_feedback";
  const text = event.contentPreview ?? "";
  if (
    (isMessage(event, "assistant") || event.kind === "tool_result") &&
    FEEDBACK_PATTERN.test(text) && current.attemptEventIds.length > 0
  ) return "verification_feedback";
  if (isMessage(event, "assistant") && APPROACH_PATTERN.test(text)) return "approach_change";
  return undefined;
}

function actionSignature(event: UnifiedEvent): string | undefined {
  if (event.kind !== "tool_call") return undefined;
  return `${event.toolName ?? "unknown"}:${event.contentDigest ?? "digest-unavailable"}`;
}

function feedbackSignature(event: UnifiedEvent): string | undefined {
  if (!event.contentDigest || !FEEDBACK_PATTERN.test(event.contentPreview ?? "")) return undefined;
  return event.contentDigest;
}

function createRound(
  taskId: string,
  sequence: number,
  timestamp: string,
  trigger: SemanticRoundTrigger,
): MutableRound {
  return {
    id: `${taskId}-round-${sequence}`,
    taskId,
    sequence,
    start: timestamp,
    end: timestamp,
    trigger,
    status: sequence === 1 ? "baseline" : "pending",
    eventIds: [],
    intentEventIds: [],
    attemptEventIds: [],
    feedbackEventIds: [],
    adjustmentEventIds: [],
    resultEventIds: [],
    lifecycleEventIds: [],
    repeated: false,
  };
}

function addEvent(round: MutableRound, event: UnifiedEvent): void {
  round.eventIds.push(event.eventId);
  round.end = event.timestamp;
  if (event.kind === "subagent") {
    round.lifecycleEventIds.push(event.eventId);
    return;
  }
  if (isMessage(event, "user")) {
    if (round.trigger === "intent" && round.intentEventIds.length === 0) {
      round.intentEventIds.push(event.eventId);
    } else round.feedbackEventIds.push(event.eventId);
    return;
  }
  if (event.kind === "tool_call") {
    round.attemptEventIds.push(event.eventId);
    if (round.feedbackEventIds.length > 0 || round.trigger === "approach_change") {
      round.adjustmentEventIds.push(event.eventId);
    }
    return;
  }
  if (event.kind === "tool_result") {
    if (FEEDBACK_PATTERN.test(event.contentPreview ?? "")) {
      round.feedbackEventIds.push(event.eventId);
    } else round.resultEventIds.push(event.eventId);
    return;
  }
  if (isMessage(event, "assistant")) {
    if (FEEDBACK_PATTERN.test(event.contentPreview ?? "")) {
      round.feedbackEventIds.push(event.eventId);
    } else if (APPROACH_PATTERN.test(event.contentPreview ?? "")) {
      round.adjustmentEventIds.push(event.eventId);
    } else round.resultEventIds.push(event.eventId);
  }
}

function finalize(round: MutableRound): SemanticRound {
  if (round.repeated) {
    round.status = "ineffective";
    round.loopReason = "repeated_action_or_feedback";
  } else if (round.sequence === 1) round.status = "baseline";
  else if (
    (round.feedbackEventIds.length > 0 || round.trigger === "approach_change") &&
    (round.adjustmentEventIds.length > 0 || round.attemptEventIds.length > 0)
  ) round.status = "effective";
  else round.status = "pending";
  const { repeated: _, ...result } = round;
  return result;
}

export function segmentSemanticRounds(
  taskId: string,
  events: UnifiedEvent[],
): SemanticRound[] {
  const values = ordered(events).filter((event) =>
    event.kind === "message" || event.kind === "tool_call" || event.kind === "tool_result" ||
    event.kind === "subagent"
  );
  if (values.length === 0) return [];
  const rounds: SemanticRound[] = [];
  const seenFeedback = new Set<string>();
  let previousAction: string | undefined;
  let current: MutableRound | undefined;
  for (const event of values) {
    const trigger = feedbackTrigger(event, current);
    if (!current || trigger) {
      if (current) rounds.push(finalize(current));
      current = createRound(taskId, rounds.length + 1, event.timestamp, trigger ?? "intent");
    }
    const action = actionSignature(event);
    const feedback = feedbackSignature(event);
    if (action) {
      if (previousAction === action) current.repeated = true;
      previousAction = action;
    }
    if (feedback) {
      if (seenFeedback.has(feedback)) current.repeated = true;
      seenFeedback.add(feedback);
    }
    addEvent(current, event);
  }
  if (current) rounds.push(finalize(current));
  return rounds;
}

export function selectKeyRounds(rounds: SemanticRound[], limit = 5): SemanticRound[] {
  if (rounds.length <= limit) return rounds;
  const priority = (round: SemanticRound): number =>
    round.status === "ineffective"
      ? 0
      : round.status === "effective"
      ? 1
      : round.trigger === "verification_feedback"
      ? 2
      : 3;
  return rounds.toSorted((left, right) =>
    priority(left) - priority(right) || left.sequence - right.sequence
  ).slice(0, limit).toSorted((left, right) => left.sequence - right.sequence);
}
