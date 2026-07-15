import type { DailyReport, UnifiedEvent } from "../core/types.ts";

export interface AnalysisPackage {
  schemaVersion: "1";
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
  tasks: Array<{
    id: string;
    name: string;
    outcome: string;
    verification: string;
    evidenceIds: string[];
  }>;
  messages: Array<{ role: string; text: string }>;
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

export function buildAnalysisPackage(
  report: DailyReport,
  events: UnifiedEvent[],
  maxBytes = 32_000,
): AnalysisPackage {
  const value: AnalysisPackage = {
    schemaVersion: "1",
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
    tasks: report.tasks.map((task) => ({
      id: task.id,
      name: redactText(task.name, 120),
      outcome: redactText(task.outcome, 240),
      verification: task.verification,
      evidenceIds: task.evidenceIds,
    })),
    messages: events.filter((event) =>
      event.kind === "message" && (event.role === "user" || event.role === "assistant") &&
      event.contentPreview
    ).slice(0, 80).map((event) => ({
      role: event.role ?? "unknown",
      text: redactText(event.contentPreview ?? "", 400),
    })),
  };
  while (jsonLength(value) > maxBytes && value.messages.length > 1) value.messages.pop();
  while (jsonLength(value) > maxBytes && value.messages[0]?.text.length > 32) {
    const overflow = jsonLength(value) - maxBytes;
    value.messages[0].text = value.messages[0].text.slice(
      0,
      Math.max(32, value.messages[0].text.length - overflow - 8),
    );
  }
  while (jsonLength(value) > maxBytes && value.tasks.length > 0) value.tasks.pop();
  if (jsonLength(value) > maxBytes) throw new Error("analysis package limit is too small");
  return value;
}
