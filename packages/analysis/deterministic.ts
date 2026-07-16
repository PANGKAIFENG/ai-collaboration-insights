import type {
  Evidence,
  EvidenceSourceCategory,
  ReportWindow,
  TaskEvidencePacket,
  TaskRelation,
  TaskSummary,
  UnifiedEvent,
  Usage,
  UsageDistributions,
  WorkBlock,
} from "../core/types.ts";
import { scoreCollaboration } from "./scoring.ts";
import { buildSessionFacts } from "./facts.ts";
import { reconstructTaskBoundaries } from "./tasks.ts";
import { buildTaskEvidencePacket } from "./evidence.ts";
import { redactText } from "./redaction.ts";
import { segmentSemanticRounds, selectKeyRounds } from "./rounds.ts";

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
  taskRelations: TaskRelation[];
  evidencePackets: TaskEvidencePacket[];
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
  sourceCategories: EvidenceSourceCategory[],
): Evidence {
  const availability = events.some((event) => event.availability === "unavailable")
    ? "unknown"
    : events.some((event) => event.availability === "partial")
    ? "partial"
    : "complete";
  return {
    id,
    type,
    label,
    eventIds: events.map((event) => event.eventId),
    confidence,
    sourceCategories,
    availability,
  };
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
      evidence(
        `task-${index}-intent`,
        "intent",
        "观察到用户目标消息",
        [users[0]],
        0.8,
        ["user_message"],
      ),
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
      ["user_message", "tool_action"],
    ));
  }
  const verificationActions = tools.filter((event) =>
    event.actionCategory === "verification" ||
    /(^|[_-])(test|check|lint|build|verify)([_-]|$)/i.test(event.toolName ?? "")
  );
  const firstVerificationAt = verificationActions[0]?.timestamp;
  const verificationResults = assistants.filter((event) =>
    firstVerificationAt && event.timestamp >= firstVerificationAt &&
    /tests?\s+(?:passed|pass)|\b(?:check|lint|build|verify|verified)\b.*\bpass(?:ed)?\b|验证通过|检查通过|构建通过/i
      .test(event.contentPreview ?? "")
  );
  const hasVerification = verificationActions.length > 0 && verificationResults.length > 0;
  if (hasVerification) {
    taskEvidence.push(evidence(
      `task-${index}-verification`,
      "verification",
      "观察到验证动作和明确通过结果",
      [...verificationActions, ...verificationResults],
      0.86,
      ["tool_action", "assistant_result"],
    ));
  }
  if (subagents.length > 0) {
    taskEvidence.push(evidence(
      `task-${index}-delegation`,
      "delegation",
      "观察到 Subagent 协作",
      subagents,
      0.9,
      ["subagent_lifecycle"],
    ));
  }
  const artifactActions = tools.filter((event) =>
    event.actionCategory === "artifact_change" ||
    /apply_patch|write(?:_file)?|create(?:_file)?|edit(?:_file)?/i.test(event.toolName ?? "")
  );
  const firstArtifactAt = artifactActions[0]?.timestamp;
  const assetResults = assistants.filter((event) =>
    firstArtifactAt && event.timestamp >= firstArtifactAt &&
    /(?:added|created|updated|implemented|新增|创建|更新|沉淀|完成).*(?:skill|workflow|template|script|reusable|文档|测试覆盖|可复用)|(?:skill|workflow|template|script|reusable|文档|测试覆盖|可复用).*(?:added|created|updated|implemented|新增|创建|更新|沉淀|完成)/i
      .test(event.contentPreview ?? "")
  );
  const hasReusableAsset = artifactActions.length > 0 && assetResults.length > 0;
  if (hasReusableAsset) {
    taskEvidence.push(evidence(
      `task-${index}-assetization`,
      "assetization",
      "观察到可复用资产变更和结果摘要",
      [...artifactActions, ...assetResults],
      0.84,
      ["artifact_change", "assistant_result"],
    ));
  }
  const name = redactText(
    users.find((event) => event.contentPreview)?.contentPreview ??
      `Codex task ${block.events[0].timestamp.slice(11, 16)}`,
    120,
  );
  const outcome = redactText(
    assistants.toReversed().find((event) => event.contentPreview)?.contentPreview ??
      "未观察到明确成果摘要",
    240,
  );
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
      sourceSessionIds: [...new Set(block.events.map((event) => event.sourceSessionId))].sort(),
      relationIds: [],
      semanticRoundCount: 0,
      effectiveRoundCount: 0,
      keyRounds: [],
      hasIteration,
      hasVerification,
      hasReusableAsset,
      analysisStatus: "deterministic",
    },
    evidence: taskEvidence,
  };
}

export function analyzeDeterministically(
  events: UnifiedEvent[],
  window: ReportWindow,
): DeterministicAnalysis {
  const mutableBlocks = createBlocks(events);
  const blockProjections = mutableBlocks.map((block, index) =>
    blockProjection(block, index + 1, Date.parse(window.end))
  );
  const taskGraph = reconstructTaskBoundaries(events, window);
  const evidencePackets: TaskEvidencePacket[] = [];
  const taskProjections = taskGraph.tasks.map((boundary, index) => {
    const projection = blockProjection(
      {
        projectRef: boundary.projectRef,
        projectLabel: boundary.projectLabel,
        events: boundary.events,
      },
      index + 1,
      Date.parse(window.end),
    );
    const rounds = segmentSemanticRounds(boundary.id, boundary.events);
    const effectiveRounds = rounds.filter((round) => round.status === "effective");
    projection.evidence = projection.evidence.filter((item) => item.type !== "iteration");
    if (effectiveRounds.length > 0) {
      const effectiveEventIds = new Set(effectiveRounds.flatMap((round) => [
        ...round.feedbackEventIds,
        ...round.adjustmentEventIds,
        ...round.attemptEventIds,
      ]));
      projection.evidence.push(evidence(
        `task-${index + 1}-iteration`,
        "iteration",
        "观察到新反馈后的有效调整",
        boundary.events.filter((event) => effectiveEventIds.has(event.eventId)).slice(0, 8),
        0.82,
        ["semantic_round", "user_message", "tool_action"],
      ));
    }
    evidencePackets.push(buildTaskEvidencePacket(boundary, rounds));
    projection.task = {
      ...projection.task,
      id: boundary.id,
      name: redactText(boundary.name, 120),
      projectRef: boundary.projectRef,
      projectLabel: boundary.projectLabel,
      start: boundary.start,
      activeMinutes: boundary.activeMinutes,
      confidence: boundary.confidence,
      sourceSessionIds: boundary.sourceSessionIds,
      relationIds: boundary.relationIds,
      semanticRoundCount: rounds.length,
      effectiveRoundCount: effectiveRounds.length,
      keyRounds: selectKeyRounds(rounds, 5),
      hasIteration: effectiveRounds.length > 0,
    };
    return projection;
  });
  const workBlocks = blockProjections.map((item) => item.block);
  const tasks = taskProjections.map((item) => item.task);
  const allEvidence = taskProjections.flatMap((item) => item.evidence);
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
    taskRelations: taskGraph.relations,
    evidencePackets,
    evidence: allEvidence,
    score: scoreCollaboration(tasks, allEvidence),
  };
}
