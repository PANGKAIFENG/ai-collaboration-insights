import type { Evidence, ScoreDimension, TaskSummary } from "../core/types.ts";

export interface CollaborationScore {
  total: number | null;
  dimensions: ScoreDimension[];
  maturity: { level: "L1" | "L2" | "L3" | "L4" | "unavailable"; reason: string };
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

export function scoreCollaboration(tasks: TaskSummary[], evidence: Evidence[]): CollaborationScore {
  const dimensions = DIMENSIONS.map((definition): ScoreDimension => {
    const matches = evidence.filter((item) => item.type === definition.evidenceType);
    if (matches.length === 0) {
      return {
        key: definition.key,
        label: definition.label,
        score: null,
        confidence: 0,
        evidenceIds: [],
      };
    }
    return {
      key: definition.key,
      label: definition.label,
      score: definition.observedScore,
      confidence: round(matches.reduce((sum, item) => sum + item.confidence, 0) / matches.length),
      evidenceIds: matches.map((item) => item.id),
    };
  });
  const available = dimensions.filter((item) => item.score !== null);
  const total = available.length === 0 ? null : round(
    available.reduce((sum, item) => sum + (item.score ?? 0), 0) / available.length,
  );
  const qualified = tasks.filter((task) => task.hasIteration && task.hasVerification).length;
  const assets = tasks.filter((task) => task.hasReusableAsset).length;
  let maturity: CollaborationScore["maturity"];
  if (tasks.length === 0) {
    maturity = { level: "unavailable", reason: "证据不足：未识别到有效任务" };
  } else if (qualified >= 5 && assets >= 2) {
    maturity = { level: "L4", reason: "至少 5 个任务形成迭代验证闭环，且至少 2 个沉淀复用资产" };
  } else if (qualified >= 3) {
    maturity = { level: "L3", reason: "至少 3 个任务同时具备迭代与验证证据" };
  } else if (tasks.some((task) => task.hasIteration || task.hasVerification)) {
    maturity = { level: "L2", reason: "已出现迭代或验证证据，但尚未达到 L3 任务门槛" };
  } else {
    maturity = { level: "L1", reason: "已识别任务，但未观察到稳定迭代与验证闭环" };
  }
  return { total, dimensions, maturity };
}
