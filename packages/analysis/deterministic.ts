import type {
  Evidence,
  ReportWindow,
  TaskSummary,
  UnifiedEvent,
  Usage,
  UsageDistributions,
  WorkBlock,
} from "../core/types.ts";
import { scoreCollaboration } from "./scoring.ts";
import { buildSessionFacts } from "./facts.ts";

const ACTIVE_SEGMENT_MS = 5 * 60 * 1000;
const MERGE_GAP_MS = 20 * 60 * 1000;

interface MutableBlock {
  projectRef?: string;
  projectLabel?: string;
  events: UnifiedEvent[];
}

export interface DeterministicAnalysis {
  usageMetrics: {
    sessions: number;
    messages: number;
    toolCalls: number;
    skillCalls: number;
    subagentCalls: number;
    subagentInterrupted: number;
    activeMinutes: number;
    tokens: Usage;
  };
  usageDistributions: UsageDistributions;
  workBlocks: WorkBlock[];
  tasks: TaskSummary[];
  evidence: Evidence[];
  score: ReturnType<typeof scoreCollaboration>;
}

function roundMinutes(milliseconds: number): number {
  return Math.round(milliseconds / 60_000 * 10) / 10;
}

function activeDuration(events: UnifiedEvent[], windowEnd: number): number {
  const intervals = events.map((event) => {
    const start = Date.parse(event.timestamp);
    return [start, Math.min(start + ACTIVE_SEGMENT_MS, windowEnd)] as const;
  }).sort((left, right) => left[0] - right[0]);
  let total = 0;
  let start = intervals[0]?.[0] ?? 0;
  let end = intervals[0]?.[1] ?? 0;
  for (const interval of intervals.slice(1)) {
    if (interval[0] <= end) end = Math.max(end, interval[1]);
    else {
      total += end - start;
      [start, end] = interval;
    }
  }
  return total + Math.max(0, end - start);
}

function isActivity(event: UnifiedEvent): boolean {
  return event.kind === "message" || event.kind === "tool_call" || event.kind === "tool_result" ||
    event.kind === "subagent";
}

function createBlocks(events: UnifiedEvent[]): MutableBlock[] {
  const byProject = new Map<string, UnifiedEvent[]>();
  for (const event of events.filter(isActivity)) {
    const key = event.projectRef ?? `unknown:${event.sourceSessionId}`;
    const existing = byProject.get(key) ?? [];
    existing.push(event);
    byProject.set(key, existing);
  }
  const blocks: MutableBlock[] = [];
  for (const projectEvents of byProject.values()) {
    projectEvents.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    let current: MutableBlock | undefined;
    for (const event of projectEvents) {
      const previous = current?.events.at(-1);
      if (
        !current || !previous ||
        Date.parse(event.timestamp) - Date.parse(previous.timestamp) > MERGE_GAP_MS
      ) {
        current = {
          projectRef: event.projectRef,
          projectLabel: event.projectLabel,
          events: [event],
        };
        blocks.push(current);
      } else current.events.push(event);
    }
  }
  return blocks.sort((left, right) =>
    left.events[0].timestamp.localeCompare(right.events[0].timestamp)
  );
}

function evidence(
  id: string,
  type: string,
  label: string,
  events: UnifiedEvent[],
  confidence: number,
): Evidence {
  return { id, type, label, eventIds: events.map((event) => event.eventId), confidence };
}

function blockProjection(
  block: MutableBlock,
  index: number,
  windowEnd: number,
): { block: WorkBlock; task: TaskSummary; evidence: Evidence[] } {
  const activityMs = activeDuration(block.events, windowEnd);
  const lastTime = Date.parse(block.events.at(-1)?.timestamp ?? "");
  const users = block.events.filter((event) => event.kind === "message" && event.role === "user");
  const assistants = block.events.filter((event) =>
    event.kind === "message" && event.role === "assistant"
  );
  const tools = block.events.filter((event) => event.kind === "tool_call");
  const subagents = block.events.filter((event) => event.kind === "subagent");
  const taskEvidence: Evidence[] = [];
  if (users.length > 0) {
    taskEvidence.push(
      evidence(`task-${index}-intent`, "intent", "观察到用户目标消息", [users[0]], 0.8),
    );
  }
  const hasIteration = users.length + assistants.length + tools.length >= 3;
  if (hasIteration) {
    taskEvidence.push(evidence(
      `task-${index}-iteration`,
      "iteration",
      "同一任务包含多次消息或工具行动",
      [...users, ...assistants, ...tools].slice(0, 6),
      0.72,
    ));
  }
  const verificationEvents = block.events.filter((event) =>
    /(^|[_-])(test|check|lint|build|verify)([_-]|$)/i.test(event.toolName ?? "") ||
    /tests? (passed|pass)|verified|验证通过|检查通过/i.test(event.contentPreview ?? "")
  );
  const hasVerification = verificationEvents.length > 0;
  if (hasVerification) {
    taskEvidence.push(evidence(
      `task-${index}-verification`,
      "verification",
      "观察到测试、检查或验证信号",
      verificationEvents,
      0.82,
    ));
  }
  if (subagents.length > 0) {
    taskEvidence.push(evidence(
      `task-${index}-delegation`,
      "delegation",
      "观察到 Subagent 协作",
      subagents,
      0.9,
    ));
  }
  const assetEvents = block.events.filter((event) =>
    /skill|workflow|template|script|reusable|文档|测试覆盖/i.test(event.contentPreview ?? "")
  );
  const hasReusableAsset = assetEvents.length > 0;
  if (hasReusableAsset) {
    taskEvidence.push(evidence(
      `task-${index}-assetization`,
      "assetization",
      "成果包含可复用资产信号",
      assetEvents,
      0.68,
    ));
  }
  const name = users.find((event) => event.contentPreview)?.contentPreview ??
    `Codex task ${block.events[0].timestamp.slice(11, 16)}`;
  const outcome = assistants.toReversed().find((event) => event.contentPreview)?.contentPreview ??
    "未观察到明确成果摘要";
  const workBlock: WorkBlock = {
    id: `block-${index}`,
    start: block.events[0].timestamp,
    end: new Date(Math.min(lastTime + ACTIVE_SEGMENT_MS, windowEnd)).toISOString(),
    activeMinutes: roundMinutes(activityMs),
    projectRef: block.projectRef,
    projectLabel: block.projectLabel,
    eventIds: block.events.map((event) => event.eventId),
  };
  return {
    block: workBlock,
    task: {
      id: `task-${index}`,
      name: name.slice(0, 120),
      projectRef: block.projectRef,
      projectLabel: block.projectLabel,
      start: workBlock.start,
      end: workBlock.end,
      activeMinutes: workBlock.activeMinutes,
      outcome: outcome.slice(0, 240),
      verification: hasVerification ? "verified" : "not_observed",
      confidence: users.length > 0 ? 0.75 : 0.45,
      evidenceIds: taskEvidence.map((item) => item.id),
      hasIteration,
      hasVerification,
      hasReusableAsset,
    },
    evidence: taskEvidence,
  };
}

export function analyzeDeterministically(
  events: UnifiedEvent[],
  window: ReportWindow,
): DeterministicAnalysis {
  const mutableBlocks = createBlocks(events);
  const projections = mutableBlocks.map((block, index) =>
    blockProjection(block, index + 1, Date.parse(window.end))
  );
  const workBlocks = projections.map((item) => item.block);
  const tasks = projections.map((item) => item.task);
  const allEvidence = projections.flatMap((item) => item.evidence);
  const facts = buildSessionFacts(events, window);
  const usageMetrics = {
    sessions: new Set(events.map((event) => event.sourceSessionId)).size,
    messages: events.filter((event) => event.kind === "message").length,
    toolCalls: events.filter((event) => event.kind === "tool_call").length,
    skillCalls: events.filter((event) => /skill/i.test(event.toolName ?? "")).length,
    subagentCalls: facts.totals.subagentRuns,
    subagentInterrupted: facts.totals.subagentInterrupted,
    activeMinutes: facts.totals.activeMinutes,
    tokens: facts.totals.tokens,
  };
  return {
    usageMetrics,
    usageDistributions: facts.distributions,
    workBlocks,
    tasks,
    evidence: allEvidence,
    score: scoreCollaboration(tasks, allEvidence),
  };
}
