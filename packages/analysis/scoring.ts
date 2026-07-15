import type {
  Evidence,
  EvidenceSourceCategory,
  ScoreDimension,
  TaskSummary,
} from "../core/types.ts";

export interface CollaborationScore {
  total: number | null;
  dimensions: ScoreDimension[];
  maturity: { level: "L1" | "L2" | "L3" | "L4" | "unavailable"; reason: string };
}

export interface ScoringContext {
  partialAnalysis?: boolean;
  analyzedTaskIds?: string[];
}

const DIMENSIONS: Array<{
  key: ScoreDimension["key"];
  label: string;
  evidenceType: string;
  observedScore: number;
}> = [
  { key: "intent", label: "目标表达", evidenceType: "intent", observedScore: 65 },
  { key: "iteration", label: "迭代意识", evidenceType: "iteration", observedScore: 75 },
  { key: "verification", label: "验证闭环", evidenceType: "verification", observedScore: 80 },
  { key: "delegation", label: "Agent 协作", evidenceType: "delegation", observedScore: 75 },
  { key: "assetization", label: "资产沉淀", evidenceType: "assetization", observedScore: 85 },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function categories(item: Evidence): EvidenceSourceCategory[] {
  return [...new Set(item.sourceCategories ?? [])];
}

function keywordOnly(item: Evidence): boolean {
  const values = categories(item);
  return values.length === 1 && values[0] === "keyword_match";
}

function complete(item: Evidence): boolean {
  return (item.availability ?? "complete") === "complete";
}

function displayEligible(item: Evidence): boolean {
  return complete(item) && item.confidence >= 0.6 && !keywordOnly(item);
}

function gateEligible(item: Evidence): boolean {
  if (!displayEligible(item)) return false;
  if (item.confidence >= 0.8) return true;
  const values = categories(item).filter((category) => category !== "keyword_match");
  return values.length >= 2;
}

function dimension(
  definition: (typeof DIMENSIONS)[number],
  evidence: Evidence[],
): ScoreDimension {
  const matches = evidence.filter((item) => item.type === definition.evidenceType);
  if (matches.length === 0) {
    return {
      key: definition.key,
      label: definition.label,
      score: null,
      confidence: 0,
      evidenceIds: [],
      status: "unavailable",
      reason: "未观察到可评分证据",
    };
  }
  const usable = matches.filter(displayEligible);
  const incomplete = matches.filter((item) => !complete(item));
  const keywords = matches.filter(keywordOnly);
  if (usable.length === 0) {
    const reason = incomplete.length > 0
      ? "证据为部分或未知状态，该维度已降级"
      : keywords.length === matches.length
      ? "仅有关键词命中，不能作为充分证据"
      : "证据置信度不足，该维度暂不可评分";
    return {
      key: definition.key,
      label: definition.label,
      score: null,
      confidence: round(matches.reduce((sum, item) => sum + item.confidence, 0) / matches.length),
      evidenceIds: matches.map((item) => item.id),
      status: incomplete.length > 0 ? "degraded" : "unavailable",
      reason,
    };
  }
  const hasGateReadyEvidence = usable.some(gateEligible);
  const degraded = incomplete.length > 0;
  return {
    key: definition.key,
    label: definition.label,
    score: definition.observedScore,
    confidence: round(usable.reduce((sum, item) => sum + item.confidence, 0) / usable.length),
    evidenceIds: usable.map((item) => item.id),
    status: degraded ? "degraded" : hasGateReadyEvidence ? "available" : "candidate",
    reason: degraded
      ? "部分证据不可用，仅使用完整证据评分"
      : !hasGateReadyEvidence
      ? "中置信证据缺少第二类独立证据，不进入 L3/L4 门槛"
      : undefined,
  };
}

function taskEvidence(task: TaskSummary, evidenceById: Map<string, Evidence>): Evidence[] {
  return task.evidenceIds.flatMap((id) => {
    const item = evidenceById.get(id);
    return item ? [item] : [];
  });
}

function taskConfidenceEligible(task: TaskSummary, evidence: Evidence[]): boolean {
  if (task.confidence < 0.6) return false;
  if (task.confidence >= 0.8) return true;
  const independent = new Set(
    evidence.flatMap(categories).filter((category) => category !== "keyword_match"),
  );
  return independent.size >= 2;
}

function taskHasGateEvidence(
  task: TaskSummary,
  evidenceById: Map<string, Evidence>,
  type: string,
): boolean {
  const values = taskEvidence(task, evidenceById);
  return taskConfidenceEligible(task, values) &&
    values.some((item) => item.type === type && gateEligible(item));
}

export function scoreCollaboration(
  tasks: TaskSummary[],
  evidence: Evidence[],
  context: ScoringContext = {},
): CollaborationScore {
  const dimensions = DIMENSIONS.map((definition) => dimension(definition, evidence));
  const available = dimensions.filter((item) => item.score !== null);
  const total = available.length === 0 ? null : round(
    available.reduce((sum, item) => sum + (item.score ?? 0), 0) / available.length,
  );
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const analyzedTaskIds = new Set(context.analyzedTaskIds ?? []);
  const maturityTasks = context.partialAnalysis
    ? tasks.filter((task) => analyzedTaskIds.has(task.id))
    : tasks;
  const uncoveredTasks = context.partialAnalysis
    ? tasks.filter((task) => !analyzedTaskIds.has(task.id))
    : [];
  if (uncoveredTasks.length > 0) {
    const uncoveredEvidenceIds = new Set(uncoveredTasks.flatMap((task) => task.evidenceIds));
    for (const item of dimensions) {
      if (
        (item.key === "iteration" || item.key === "verification" ||
          item.key === "assetization") &&
        item.evidenceIds.some((id) => uncoveredEvidenceIds.has(id))
      ) {
        item.status = "degraded";
        item.reason = item.reason
          ? `${item.reason}；部分任务未完成 AI 分析`
          : "部分任务未完成 AI 分析，该维度仅使用已覆盖任务参与层级门禁";
      }
    }
  }
  const qualified =
    maturityTasks.filter((task) =>
      taskHasGateEvidence(task, evidenceById, "iteration") &&
      taskHasGateEvidence(task, evidenceById, "verification")
    ).length;
  const assets =
    maturityTasks.filter((task) => taskHasGateEvidence(task, evidenceById, "assetization")).length;
  const hasProgress = maturityTasks.some((task) =>
    taskEvidence(task, evidenceById).some((item) =>
      (item.type === "iteration" || item.type === "verification") && displayEligible(item)
    )
  );
  let maturity: CollaborationScore["maturity"];
  if (tasks.length === 0) {
    maturity = { level: "unavailable", reason: "证据不足：未识别到有效任务" };
  } else if (qualified >= 5 && assets >= 2) {
    maturity = { level: "L4", reason: "至少 5 个任务形成迭代验证闭环，且至少 2 个沉淀复用资产" };
  } else if (qualified >= 3) {
    maturity = { level: "L3", reason: "至少 3 个任务同时具备迭代与验证证据" };
  } else if (hasProgress) {
    maturity = { level: "L2", reason: "已出现迭代或验证证据，但尚未达到 L3 任务门槛" };
  } else {
    maturity = { level: "L1", reason: "已识别任务，但未观察到稳定迭代与验证闭环" };
  }
  if (context.partialAnalysis && tasks.length > 0) {
    maturity.reason += `；AI 分析仅覆盖 ${maturityTasks.length} / ${tasks.length} 个任务`;
  }
  return { total, dimensions, maturity };
}
