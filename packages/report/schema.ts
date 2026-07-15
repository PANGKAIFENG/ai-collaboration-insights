import { type DailyReport, REPORT_SCHEMA_VERSION } from "../core/types.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`invalid ${field}`);
}

export function validateDailyReport(value: unknown): DailyReport {
  const report = object(value);
  if (!report) throw new Error("report must be an object");
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new Error("unsupported report schemaVersion");
  }
  requireText(report.reportId, "reportId");
  requireText(report.generatedAt, "generatedAt");
  if (!Number.isInteger(report.revision) || Number(report.revision) < 1) {
    throw new Error("invalid revision");
  }
  const window = object(report.window);
  if (!window) throw new Error("invalid window");
  for (const field of ["date", "start", "end", "timeZone"]) {
    requireText(window[field], `window.${field}`);
  }
  if (Date.parse(window.start as string) >= Date.parse(window.end as string)) {
    throw new Error("invalid report window order");
  }
  if (
    !Array.isArray(report.workBlocks) || !Array.isArray(report.tasks) ||
    !Array.isArray(report.evidence)
  ) {
    throw new Error("report collections must be arrays");
  }
  if (report.sessionInsights === undefined) report.sessionInsights = [];
  if (!Array.isArray(report.sessionInsights)) throw new Error("sessionInsights must be an array");
  if (!Array.isArray(report.coachSuggestions)) throw new Error("coachSuggestions must be an array");
  if (report.coachSuggestions.length > 3) {
    throw new Error("report supports at most 3 coach suggestions");
  }
  const analysis = object(report.analysisStatus);
  if (!analysis || !["deterministic", "ai_enriched"].includes(String(analysis.mode))) {
    throw new Error("invalid analysisStatus");
  }
  if (analysis.coverage !== undefined) {
    const coverage = object(analysis.coverage);
    if (
      !coverage || !Number.isInteger(coverage.totalTasks) ||
      !Number.isInteger(coverage.analyzedTasks) || !Number.isInteger(coverage.detailTasks) ||
      Number(coverage.totalTasks) < 0 || Number(coverage.analyzedTasks) < 0 ||
      Number(coverage.detailTasks) < 0 ||
      Number(coverage.analyzedTasks) > Number(coverage.totalTasks)
    ) throw new Error("invalid analysis coverage");
  }
  return value as DailyReport;
}
