import type { TaskBoundary } from "./tasks.ts";
import type {
  EvidenceCategory,
  EvidencePacketAnchor,
  SemanticRound,
  TaskEvidencePacket,
  UnifiedEvent,
} from "../core/types.ts";
import { redactText } from "./redaction.ts";
import { selectKeyRounds } from "./rounds.ts";

const REQUIRED: EvidenceCategory[] = [
  "intent",
  "outcome",
  "verification",
  "asset",
  "delegation",
];
const VERIFICATION =
  /(^|[_-])(test|check|lint|build|verify)([_-]|$)|tests?\s+(?:passed|failed)|验证(?:通过|失败)|检查(?:通过|失败)/i;
const ASSET =
  /\b[A-Za-z0-9_.-]+\.(?:md|ts|tsx|js|json|py|html|css)\b|(?:created|added|updated|生成|新增|更新).*(?:文档|脚本|测试|skill|workflow|template)/i;
const FEEDBACK = /不对|改为|调整|tests?\s+failed|验证失败|检查失败|报错|错误/i;

export interface EvidencePacketOptions {
  maxBytes?: number;
  maxRounds?: number;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function categories(event: UnifiedEvent, firstUserId: string | undefined): EvidenceCategory[] {
  const result: EvidenceCategory[] = [];
  const text = event.contentPreview ?? "";
  if (event.eventId === firstUserId) result.push("intent");
  else if (event.kind === "message" && event.role === "user") result.push("feedback");
  if (event.kind === "message" && event.role === "assistant") result.push("outcome");
  if (event.kind === "tool_call") result.push("attempt");
  if (event.kind === "subagent") result.push("delegation");
  if (VERIFICATION.test(event.toolName ?? "") || VERIFICATION.test(text)) {
    result.push("verification");
  }
  if (ASSET.test(text)) result.push("asset");
  if (FEEDBACK.test(text) && !result.includes("feedback")) result.push("feedback");
  return result;
}

function anchor(event: UnifiedEvent, category: EvidenceCategory): EvidencePacketAnchor {
  const text = event.contentPreview ? redactText(event.contentPreview, 240) : undefined;
  return {
    eventId: event.eventId,
    category,
    timestamp: event.timestamp,
    kind: event.kind,
    text: text || undefined,
  };
}

function boundedRound(round: SemanticRound): SemanticRound {
  const cap = (values: string[]): string[] => values.slice(0, 8);
  return {
    ...round,
    eventIds: cap(round.eventIds),
    intentEventIds: cap(round.intentEventIds),
    attemptEventIds: cap(round.attemptEventIds),
    feedbackEventIds: cap(round.feedbackEventIds),
    adjustmentEventIds: cap(round.adjustmentEventIds),
    resultEventIds: cap(round.resultEventIds),
    lifecycleEventIds: cap(round.lifecycleEventIds),
  };
}

function coreAnchors(all: EvidencePacketAnchor[]): EvidencePacketAnchor[] {
  const result: EvidencePacketAnchor[] = [];
  for (const category of REQUIRED) {
    const matches = all.filter((item) => item.category === category);
    if (category === "delegation" && matches.length > 1) {
      result.push(matches[0], matches.at(-1)!);
      continue;
    }
    const selected = category === "outcome" || category === "verification" || category === "asset"
      ? matches.at(-1)
      : matches[0];
    if (selected) result.push(selected);
  }
  return result;
}

export function buildTaskEvidencePacket(
  task: TaskBoundary,
  rounds: SemanticRound[],
  options: EvidencePacketOptions = {},
): TaskEvidencePacket {
  const maxBytes = options.maxBytes ?? 12_000;
  const events = task.events.toSorted((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId)
  );
  const firstUserId = events.find((event) => event.kind === "message" && event.role === "user")
    ?.eventId;
  const allAnchors = events.flatMap((event) =>
    categories(event, firstUserId).map((category) => anchor(event, category))
  );
  const core = coreAnchors(allAnchors);
  const coreKeys = new Set(core.map((item) => `${item.eventId}:${item.category}`));
  const optional = allAnchors.filter((item) => !coreKeys.has(`${item.eventId}:${item.category}`));
  const selectedRounds = selectKeyRounds(rounds, options.maxRounds ?? 20).map(boundedRound);
  const presentCategories = REQUIRED.filter((category) =>
    allAnchors.some((item) => item.category === category)
  );
  const packet: TaskEvidencePacket = {
    schemaVersion: "1",
    taskId: task.id,
    anchors: [...core, ...optional],
    rounds: selectedRounds,
    coverage: {
      requiredCategories: [...REQUIRED],
      presentCategories,
      missingCategories: REQUIRED.filter((category) => !presentCategories.includes(category)),
      categoryRatio: Math.round(presentCategories.length / REQUIRED.length * 100) / 100,
      totalAnchors: allAnchors.length,
      includedAnchors: allAnchors.length,
      omittedAnchors: 0,
      totalRounds: rounds.length,
      includedRounds: selectedRounds.length,
      omittedRounds: Math.max(0, rounds.length - selectedRounds.length),
      omittedRoundEventRefs: Math.max(
        0,
        rounds.reduce((sum, round) => sum + round.eventIds.length, 0) -
          selectedRounds.reduce((sum, round) => sum + round.eventIds.length, 0),
      ),
      truncated: rounds.length > selectedRounds.length,
    },
  };
  const refresh = (): void => {
    packet.coverage.includedAnchors = packet.anchors.length;
    packet.coverage.omittedAnchors = allAnchors.length - packet.anchors.length;
    packet.coverage.includedRounds = packet.rounds.length;
    packet.coverage.omittedRounds = rounds.length - packet.rounds.length;
    packet.coverage.omittedRoundEventRefs = Math.max(
      0,
      rounds.reduce((sum, round) => sum + round.eventIds.length, 0) -
        packet.rounds.reduce((sum, round) => sum + round.eventIds.length, 0),
    );
    packet.coverage.truncated = packet.coverage.omittedAnchors > 0 ||
      packet.coverage.omittedRounds > 0 || packet.coverage.omittedRoundEventRefs > 0;
  };
  while (bytes(packet) > maxBytes && packet.anchors.length > core.length) {
    packet.anchors.pop();
    refresh();
  }
  while (bytes(packet) > maxBytes && packet.rounds.length > 1) {
    packet.rounds = selectKeyRounds(packet.rounds, packet.rounds.length - 1);
    refresh();
  }
  while (bytes(packet) > maxBytes) {
    const candidate = packet.anchors.filter((item) =>
      item.text
    ).toSorted((left, right) => (right.text?.length ?? 0) - (left.text?.length ?? 0))[0];
    if (!candidate?.text) {
      break;
    }
    candidate.text = candidate.text.length > 32 ? candidate.text.slice(0, 32) : undefined;
    refresh();
  }
  if (bytes(packet) > maxBytes) throw new Error("evidence packet limit is too small");
  return packet;
}
