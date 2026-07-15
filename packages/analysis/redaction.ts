import type {
  DailyReport,
  EvidenceCategory,
  EvidencePacketAnchor,
  SemanticRound,
  TaskEvidencePacket,
  UnifiedEvent,
} from "../core/types.ts";

export interface AnalysisTaskCore {
  id: string;
  name: string;
  outcome: string;
  verification: string;
  boundaryConfidence: number;
  evidenceIds: string[];
  sessionRefs: string[];
  anchors: EvidencePacketAnchor[];
  rounds: Array<Pick<SemanticRound, "id" | "sequence" | "trigger" | "status" | "eventIds">>;
  coverage: {
    categoryRatio: number;
    missingCategories: readonly EvidenceCategory[];
    truncated: boolean;
  };
}

export interface AnalysisPackage {
  schemaVersion: "2";
  window: DailyReport["window"];
  metrics: {
    sessions: number;
    messages: number;
    toolCalls: number;
    skillCalls: number;
    subagentCalls: number;
    activeMinutes: number;
    totalTokens?: number;
  };
  tasks: AnalysisTaskCore[];
  coverage: {
    totalTasks: number;
    includedTaskCores: number;
    truncatedOptionalDetails: boolean;
  };
}

export interface AnalysisDetailPackage {
  schemaVersion: "1";
  tasks: Array<{
    id: string;
    events: Array<{
      eventId: string;
      kind: UnifiedEvent["kind"];
      role?: UnifiedEvent["role"];
      toolName?: string;
      text?: string;
    }>;
  }>;
  coverage: {
    requestedTasks: number;
    includedTasks: number;
    truncated: boolean;
  };
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:ghp|github_pat|glpat)-?[A-Za-z0-9_-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
];

export function redactText(value: string, maxChars = 500): string {
  let result = value.replace(/```[\s\S]*?```/g, "[CODE_BLOCK_REMOVED]");
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[REDACTED_SECRET]");
  result = result
    .replace(/\/(?:Users|home)\/[^\s"'<>]+/g, "[PRIVATE_PATH]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result.slice(0, maxChars);
}

function jsonLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function compactAnchor(anchor: EvidencePacketAnchor): EvidencePacketAnchor {
  const text = anchor.text ? redactText(anchor.text, 160) : undefined;
  return { ...anchor, text: text || undefined };
}

function sessionRefs(report: DailyReport): Map<string, string> {
  const ids = [...new Set(report.tasks.flatMap((task) => task.sourceSessionIds))].sort();
  return new Map(ids.map((id, index) => [id, `session-${index + 1}`]));
}

function packetByTask(report: DailyReport): Map<string, TaskEvidencePacket> {
  return new Map(report.evidencePackets.map((packet) => [packet.taskId, packet]));
}

export function buildAnalysisPackage(
  report: DailyReport,
  maxBytes = 32_000,
): AnalysisPackage {
  const refs = sessionRefs(report);
  const packets = packetByTask(report);
  const value: AnalysisPackage = {
    schemaVersion: "2",
    window: report.window,
    metrics: {
      sessions: report.usageMetrics.sessions,
      messages: report.usageMetrics.messages,
      toolCalls: report.usageMetrics.toolCalls,
      skillCalls: report.usageMetrics.skillCalls,
      subagentCalls: report.usageMetrics.subagentCalls,
      activeMinutes: report.usageMetrics.activeMinutes,
      totalTokens: report.usageMetrics.tokens.totalTokens,
    },
    tasks: report.tasks.map((task) => {
      const packet = packets.get(task.id);
      const anchors = (packet?.anchors ?? []).map(compactAnchor);
      return {
        id: task.id,
        name: redactText(task.name, 120),
        outcome: redactText(task.outcome, 240),
        verification: task.verification,
        boundaryConfidence: task.confidence,
        evidenceIds: [...new Set([...task.evidenceIds, ...anchors.map((item) => item.eventId)])],
        sessionRefs: task.sourceSessionIds.map((id) => refs.get(id)).filter((id): id is string =>
          Boolean(id)
        ),
        anchors,
        rounds: task.keyRounds.map((round) => ({
          id: round.id,
          sequence: round.sequence,
          trigger: round.trigger,
          status: round.status,
          eventIds: round.eventIds.slice(0, 8),
        })),
        coverage: {
          categoryRatio: packet?.coverage.categoryRatio ?? 0,
          missingCategories: packet?.coverage.missingCategories ?? [
            "intent",
            "outcome",
            "verification",
            "asset",
            "delegation",
          ],
          truncated: packet?.coverage.truncated ?? true,
        },
      };
    }),
    coverage: {
      totalTasks: report.tasks.length,
      includedTaskCores: report.tasks.length,
      truncatedOptionalDetails: false,
    },
  };

  const markTruncated = (): void => {
    value.coverage.truncatedOptionalDetails = true;
  };
  while (jsonLength(value) > maxBytes && value.tasks.some((task) => task.rounds.length > 0)) {
    const candidate = value.tasks.toSorted((left, right) =>
      right.rounds.length - left.rounds.length || left.id.localeCompare(right.id)
    )[0];
    candidate.rounds.pop();
    markTruncated();
  }
  while (jsonLength(value) > maxBytes && value.tasks.some((task) => task.anchors.length > 1)) {
    const candidate = value.tasks.toSorted((left, right) =>
      right.anchors.length - left.anchors.length || left.id.localeCompare(right.id)
    ).find((task) =>
      task.anchors.some((anchor) =>
        task.anchors.filter((item) => item.category === anchor.category).length > 1
      )
    );
    if (!candidate) break;
    const removable = candidate.anchors.findLastIndex((anchor) =>
      candidate.anchors.filter((item) => item.category === anchor.category).length > 1
    );
    candidate.anchors.splice(removable, 1);
    markTruncated();
  }
  for (const maxChars of [80, 32, 0]) {
    if (jsonLength(value) <= maxBytes) break;
    for (const task of value.tasks) {
      for (const anchor of task.anchors) {
        if (anchor.text) anchor.text = maxChars > 0 ? anchor.text.slice(0, maxChars) : undefined;
      }
      task.outcome = task.outcome.slice(0, Math.max(32, maxChars));
    }
    markTruncated();
  }
  if (jsonLength(value) > maxBytes) {
    throw new Error("analysis package limit cannot cover every task core");
  }
  const deterministicEvidence = new Map(
    report.tasks.map((task) => [task.id, new Set(task.evidenceIds)]),
  );
  for (const task of value.tasks) {
    task.evidenceIds = [
      ...new Set([
        ...(deterministicEvidence.get(task.id) ?? []),
        ...task.anchors.map((anchor) => anchor.eventId),
      ]),
    ];
  }
  return value;
}

export function buildAnalysisDetails(
  report: DailyReport,
  events: UnifiedEvent[],
  requestedTaskIds: string[],
  maxBytes = 8_000,
): AnalysisDetailPackage {
  const requested = [...new Set(requestedTaskIds)];
  const packets = packetByTask(report);
  const knownTaskIds = new Set(report.tasks.map((task) => task.id));
  const byEventId = new Map(events.map((event) => [event.eventId, event]));
  const value: AnalysisDetailPackage = {
    schemaVersion: "1",
    tasks: requested.filter((id) => knownTaskIds.has(id)).map((id) => {
      const packet = packets.get(id);
      const eventIds = new Set([
        ...(packet?.anchors.map((anchor) => anchor.eventId) ?? []),
        ...(packet?.rounds.flatMap((round) => round.eventIds) ?? []),
      ]);
      return {
        id,
        events: [...eventIds].map((eventId) => byEventId.get(eventId)).filter((
          event,
        ): event is UnifiedEvent => Boolean(event)).toSorted((left, right) =>
          left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
        ).map((event) => {
          const text = event.contentPreview ? redactText(event.contentPreview, 320) : undefined;
          return {
            eventId: event.eventId,
            kind: event.kind,
            role: event.role,
            toolName: event.toolName,
            text: text || undefined,
          };
        }),
      };
    }),
    coverage: {
      requestedTasks: requested.length,
      includedTasks: requested.filter((id) => knownTaskIds.has(id)).length,
      truncated: false,
    },
  };
  while (jsonLength(value) > maxBytes && value.tasks.some((task) => task.events.length > 1)) {
    const candidate = value.tasks.toSorted((left, right) =>
      right.events.length - left.events.length || left.id.localeCompare(right.id)
    )[0];
    candidate.events.pop();
    value.coverage.truncated = true;
  }
  for (const maxChars of [160, 80, 32, 0]) {
    if (jsonLength(value) <= maxBytes) break;
    for (const task of value.tasks) {
      for (const event of task.events) {
        if (event.text) event.text = maxChars > 0 ? event.text.slice(0, maxChars) : undefined;
      }
    }
    value.coverage.truncated = true;
  }
  if (jsonLength(value) > maxBytes) throw new Error("analysis detail limit is too small");
  return value;
}
